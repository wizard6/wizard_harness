import { randomUUID } from 'node:crypto';
import type { EventBus } from './bus.js';
import type { PluginEvent } from './types.js';
import { eventSubjectOf, setEventSubject } from '../scope/index.js';
import type { ScopeKey } from '../scope/index.js';

/**
 * 事件化 RPC 传输层（与插件生命周期解耦）。
 *
 * 协议：service-call 请求事件 → 按 providerId 路由到提供方执行 → service-result 响应事件（requestId 关联）。
 * 传输层不感知插件：路由表由 attach/detach 维护，实例解析与权限校验由 executor 提供。
 * 全局唯一总线订阅器：订阅成本 O(1)，不随服务/提供方数量增长。
 */
export interface RpcExecutor {
  /** 解析服务实例（含懒加载 factory 实例化）；返回 undefined 表示服务不存在 */
  resolve(service: string, providerId: string, scope?: ScopeKey): unknown | undefined;
  /** 执行侧权限校验：请求者 actor（plugin:<id> / shell）对该绑定是否可用 */
  authorize(service: string, providerId: string, actor: string, scope?: ScopeKey): boolean;
}

export interface RpcCallOptions {
  timeoutMs?: number;
  /** 精确路由目标提供方（默认路由到全部 attach 的提供方） */
  providerId?: string;
  /** 调用方 scope（决定解析哪一层绑定） */
  scope?: ScopeKey;
}

export interface Rpc {
  /** 事件化调用：发 service-call 等 service-result；超时 reject（错误带 requestId 便于追踪） */
  call<T = unknown>(
    viewerId: string,
    service: string,
    method: string,
    args?: unknown,
    opts?: RpcCallOptions,
  ): Promise<T>;
  /** 登记提供方可被事件化调用（只增路由表项，不新增订阅） */
  attach(service: string, providerId: string): void;
  detach(service: string, providerId: string): void;
  /** 卸载提供方时批量摘除其全部路由 */
  detachAll(providerId: string): void;
}

export function createRpc(bus: EventBus, executor: RpcExecutor): Rpc {
  /** 路由表：service → 可事件化调用的提供方集合 */
  const routes = new Map<string, Set<string>>();

  function emitResult(
    providerId: string,
    requestId: string,
    payload: { ok: boolean; result?: unknown; error?: string },
  ): void {
    bus.emit({
      id: randomUUID(),
      ts: Date.now(),
      actor: `plugin:${providerId}`,
      action: 'service-result',
      target: requestId,
      payload,
    });
  }

  function handleCall(e: PluginEvent): void {
    // 服务名在事件 target 字段（service-call → target=service）
    const service = e.target;
    const { method, args, requestId, providerId } = e.payload as {
      method?: string;
      args?: unknown;
      requestId?: string;
      providerId?: string;
    };
    if (!service || !requestId || typeof method !== 'string') return;
    const scope = eventSubjectOf(e);
    const targets = providerId !== undefined ? [providerId] : [...(routes.get(service) ?? [])];
    for (const pid of targets) {
      if (!routes.get(service)?.has(pid)) continue; // 已卸载（路由表摘除）
      // 执行侧权限校验：越权请求（如伪造 service-call 调 high 服务）直接拒绝
      if (!executor.authorize(service, pid, e.actor, scope)) continue;
      const svc = executor.resolve(service, pid, scope);
      if (!svc || typeof (svc as Record<string, unknown>)[method] !== 'function') {
        emitResult(pid, requestId, { ok: false, error: `服务 ${service}（${pid}）无方法 ${method}` });
        continue;
      }
      // 派发栈外执行：同步方法不阻塞总线的其它订阅者
      setImmediate(() => {
        const callArgs = args === undefined ? [] : Array.isArray(args) ? args : [args];
        const fn = (svc as Record<string, unknown>)[method] as (...a: unknown[]) => unknown;
        Promise.resolve(fn.apply(svc, callArgs))
          .then((result) => emitResult(pid, requestId, { ok: true, result }))
          .catch((err: unknown) => emitResult(pid, requestId, { ok: false, error: String(err) }));
      });
    }
  }

  bus.subscribe((e) => {
    if (e.action === 'service-call') handleCall(e);
  });

  return {
    call<T>(viewerId: string, service: string, method: string, args?: unknown, opts: RpcCallOptions = {}) {
      const timeoutMs = opts.timeoutMs ?? 5000;
      const requestId = randomUUID();
      return new Promise<T>((resolve, reject) => {
        let done = false;
        const finish = (action: () => void): void => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          unsubscribe();
          action();
        };
        const timer = setTimeout(
          () =>
            finish(() =>
              reject(new Error(`服务调用超时：${service}.${method}（requestId=${requestId}）`)),
            ),
          timeoutMs,
        );
        // 先订阅结果再发请求：同步总线若先发后订阅会丢同步响应
        const unsubscribe = bus.subscribe((e) => {
          if (e.action !== 'service-result' || e.target !== requestId) return;
          const p = e.payload as { ok?: boolean; result?: unknown; error?: string };
          finish(() =>
            p.ok
              ? resolve(p.result as T)
              : reject(new Error(`${p.error ?? '调用失败'}（requestId=${requestId}）`)),
          );
        });
        const event = {
          id: randomUUID(),
          ts: Date.now(),
          actor: `plugin:${viewerId}`,
          action: 'service-call',
          target: service,
          payload: { method, args, requestId, providerId: opts.providerId },
        };
        setEventSubject(event, opts.scope);
        bus.emit(event);
      });
    },
    attach(service, providerId) {
      let set = routes.get(service);
      if (!set) {
        set = new Set();
        routes.set(service, set);
      }
      set.add(providerId);
    },
    detach(service, providerId) {
      const set = routes.get(service);
      if (!set) return;
      set.delete(providerId);
      if (set.size === 0) routes.delete(service);
    },
    detachAll(providerId) {
      for (const [service, set] of routes) {
        if (set.delete(providerId) && set.size === 0) routes.delete(service);
      }
    },
  };
}
