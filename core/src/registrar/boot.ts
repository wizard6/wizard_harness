import type { Plugin, RegisteredPlugin, Registrar } from './types.js';
import { normalizeInject, normalizeProvides } from './types.js';

/** boot 结果：已加载 / 因缺 inject 挂起 / 启动失败的插件 */
export interface BootResult {
  loaded: RegisteredPlugin[];
  /** 必选服务在本批插件里始终不存在 → 不加载（对齐 Cordis PENDING） */
  pending: { plugin: Plugin; missing: string[] }[];
  /** 阶段二启动失败的插件（其自身已回滚，其它插件不受影响） */
  failures: { id: string; error: string }[];
}

/**
 * 按 inject → provides 拓扑排序。
 * 边：提供方 → 消费方（先注册提供方）。
 */
export function sortByInject(plugins: Plugin[]): Plugin[] {
  const byId = new Map(plugins.map((p) => [p.manifest.id, p]));
  /** serviceName → 提供它的插件 id 列表 */
  const providers = new Map<string, string[]>();
  for (const p of plugins) {
    for (const e of normalizeProvides(p)) {
      const list = providers.get(e.name) ?? [];
      list.push(p.manifest.id);
      providers.set(e.name, list);
    }
  }

  const deps = new Map<string, Set<string>>(); // consumer → providers it needs (plugin ids)
  const indegree = new Map<string, number>();
  for (const p of plugins) indegree.set(p.manifest.id, 0);

  for (const p of plugins) {
    const need = new Set<string>();
    for (const inj of normalizeInject(p)) {
      if (!inj.required) continue;
      const provs = providers.get(inj.name) ?? [];
      for (const pid of provs) {
        if (pid === p.manifest.id) continue;
        need.add(pid);
      }
    }
    deps.set(p.manifest.id, need);
    indegree.set(p.manifest.id, need.size);
  }

  // Kahn：提供方先出队
  const dependents = new Map<string, Set<string>>(); // provider → consumers
  for (const [cid, needs] of deps) {
    for (const pid of needs) {
      const set = dependents.get(pid) ?? new Set();
      set.add(cid);
      dependents.set(pid, set);
    }
  }

  const queue = [...indegree.entries()].filter(([, n]) => n === 0).map(([id]) => id);
  const ordered: Plugin[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const p = byId.get(id);
    if (p) ordered.push(p);
    for (const cid of dependents.get(id) ?? []) {
      const next = (indegree.get(cid) ?? 1) - 1;
      indegree.set(cid, next);
      if (next === 0) queue.push(cid);
    }
  }

  if (ordered.length !== plugins.length) {
    const left = plugins.filter((p) => !ordered.includes(p)).map((p) => p.manifest.id);
    throw new Error(`inject 依赖成环：${left.join(', ')}`);
  }
  return ordered;
}

/** 在「本批插件 + 运行时已注册服务」里，哪些必选 inject 永远没有提供方 */
export function missingInjectInBatch(
  plugin: Plugin,
  batch: Plugin[],
  extraServices: Iterable<string> = [],
): string[] {
  const provided = new Set<string>();
  for (const p of batch) {
    for (const e of normalizeProvides(p)) provided.add(e.name);
  }
  // 运行时服务目录：宿主级服务（壳/核心预注册，如 bus）可被插件 inject，不应误判 pending
  for (const name of extraServices) provided.add(name);
  return normalizeInject(plugin)
    .filter((i) => i.required && !provided.has(i.name))
    .map((i) => i.name);
}

/**
 * Cordis 风格装配：拓扑排序 → 缺必选则 PENDING → 否则按序注册。
 * 两阶段生命周期：
 *   阶段一 全部 register（按 inject 拓扑，服务全部挂载，发 register 事件）；
 *   阶段二 按拓扑序统一 start（onStart 时可消费任意已声明服务——修复提供方
 *           onStart 拿不到后注册服务的问题）。
 */
export async function bootPlugins(registrar: Registrar, plugins: Plugin[]): Promise<BootResult> {
  const pending: BootResult['pending'] = [];
  const loadable: Plugin[] = [];
  // 运行时已注册服务（含壳预注册的宿主级服务）
  const registered = registrar.services.list();
  for (const p of plugins) {
    const missing = missingInjectInBatch(p, plugins, registered);
    if (missing.length > 0) pending.push({ plugin: p, missing });
    else loadable.push(p);
  }
  const ordered = sortByInject(loadable);
  const loaded: RegisteredPlugin[] = [];
  // 阶段一：全部注册（挂服务、发 register 事件），onStart 延迟
  for (const p of ordered) {
    loaded.push(await registrar.register(p, { deferStart: true }));
  }
  // 阶段二：按拓扑序统一启动（所有服务已就绪）；单个失败隔离（自身已回滚），不中断其余
  const failures: { id: string; error: string }[] = [];
  for (const r of loaded) {
    try {
      await r.start?.();
    } catch (err) {
      failures.push({ id: r.plugin.manifest.id, error: String(err) });
    }
  }
  return { loaded, pending, failures };
}
