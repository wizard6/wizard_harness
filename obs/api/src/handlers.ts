import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { queryEvents, readEvents, tailEvents } from '@wizard-harness/core';
import type { CompositionSnapshot, PluginEvent, SystemContext } from '@wizard-harness/core';
import { registrySpec } from '@wizard-harness/obs-core';

import type { ExposeMap } from './expose.js';
import { methodAllowed } from './expose.js';
import { isApiPath, mimeFor, resolveStaticFile, siteSubpath } from './static.js';

export type { ExposeMap };

export interface HandlerDeps {
  /** 事件文件路径（读 /events、/state） */
  file: string;
  /** 服务调用白名单（/rpc 门禁） */
  expose: ExposeMap;
  /** 运行时 harness（加载后才有；未加载时返回 undefined） */
  getHarness(): SystemContext | undefined;
  /** 当前 profile 组合快照（未使用 profile 时为 undefined） */
  getComposition?(): CompositionSnapshot | undefined;
  /** 浏览器控制台静态根（WH_STATIC_DIR）；壳级挂载，不是按插件路由 */
  staticDir?: string;
  /** 已部署站点静态根（WH_SITE_DIR），挂在 /site/ */
  siteDir?: string;
  /** 运行时再扫描插件目录（POST /plugins/scan） */
  scanPlugins?: () => Promise<{
    ok: boolean;
    loaded: string[];
    already: string[];
    skipped: { id: string; reason: string }[];
    pending?: { id: string; missing: string[] }[];
    failures?: { id: string; error: string }[];
    warnings?: string[];
  }>;
}

export interface ApiHandlers {
  events(req: IncomingMessage, res: ServerResponse): void;
  stream(req: IncomingMessage, res: ServerResponse): void;
  state(req: IncomingMessage, res: ServerResponse): void;
  plugins(req: IncomingMessage, res: ServerResponse): void;
  scan(req: IncomingMessage, res: ServerResponse): Promise<void>;
  services(req: IncomingMessage, res: ServerResponse): void;
  rpc(req: IncomingMessage, res: ServerResponse): Promise<void>;
  notFound(res: ServerResponse): void;
  /** GET 非 API 路径：控制台或 /site/；未命中返回 false */
  tryStatic(req: IncomingMessage, res: ServerResponse, pathname: string): boolean;
}

/** 组装各 HTTP 端点处理（依赖经 deps 注入，main.ts 只做路由分发） */
export function createHandlers(deps: HandlerDeps): ApiHandlers {
  const { file, expose, getHarness, getComposition, scanPlugins, staticDir, siteDir } = deps;

  function sendJson(res: ServerResponse, code: number, body: unknown): void {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }

  /** 从事件历史还原"当前已注册插件"（register/unregister 推算存活集） */
  function currentPlugins(events: PluginEvent[]): { id: string; registeredAt: number }[] {
    const order: string[] = [];
    const active = new Map<string, number>();
    for (const e of events) {
      if (e.action === 'register' && e.target) {
        if (!active.has(e.target)) order.push(e.target);
        active.set(e.target, e.ts);
      } else if (e.action === 'unregister' && e.target) {
        active.delete(e.target);
      }
    }
    return order.filter((id) => active.has(id)).map((id) => ({ id, registeredAt: active.get(id)! }));
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolveBody, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf8');
        if (data.length > 1_000_000) {
          reject(new Error('请求体过大（>1MB）'));
          req.destroy();
        }
      });
      req.on('end', () => resolveBody(data));
      req.on('error', reject);
    });
  }

  /** 白名单服务调用：/rpc 的核心逻辑（校验 → 取服务 → 执行 → 统一响应） */
  async function handleRpc(parsed: unknown): Promise<{ status: number; body: unknown }> {
    const { service, method, args } = (parsed ?? {}) as {
      service?: unknown;
      method?: unknown;
      args?: unknown;
    };
    if (typeof service !== 'string' || typeof method !== 'string') {
      return { status: 400, body: { ok: false, error: '需要 service 与 method（字符串）' } };
    }
    if (!methodAllowed(expose, service, method)) {
      return { status: 403, body: { ok: false, error: `方法 ${service}.${method} 未在 WH_EXPOSE 白名单` } };
    }
    const svc = getHarness()?.services.get(service);
    if (!svc) {
      return { status: 404, body: { ok: false, error: `服务 ${service} 未加载` } };
    }
    const fn = (svc as Record<string, unknown>)[method];
    if (typeof fn !== 'function') {
      return { status: 400, body: { ok: false, error: `${service}.${method} 不是可调用函数` } };
    }
    try {
      const result = await (fn as (...a: unknown[]) => unknown).apply(svc, Array.isArray(args) ? args : []);
      return { status: 200, body: { ok: true, result } };
    } catch (err) {
      return { status: 500, body: { ok: false, error: String(err) } };
    }
  }

  return {
    events(req, res) {
      const p = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams;
      const events = queryEvents(readEvents(file), {
        actor: p.get('actor') ?? undefined,
        action: p.get('action') ?? undefined,
        target: p.get('target') ?? undefined,
        keyword: p.get('keyword') ?? undefined,
        limit: p.get('limit') ? Number(p.get('limit')) : undefined,
      });
      sendJson(res, 200, { events, total: events.length });
    },
    stream(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      const stop = tailEvents(file, (e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
      req.on('close', stop);
    },
    state(req, res) {
      const events = readEvents(file);
      const counts: Record<string, number> = {};
      for (const e of events) counts[e.action] = (counts[e.action] ?? 0) + 1;
      const harness = getHarness();
      sendJson(res, 200, {
        total: events.length,
        counts,
        plugins: currentPlugins(events),
        summary: registrySpec.summarize?.(events),
        // 运行时壳：实时装配状态（harness 加载后才有）
        runtime: harness
          ? {
              loaded: harness.registry.list().map((p) => p.manifest.id),
              services: harness.services.list(),
              composition: getComposition?.(),
            }
          : { loaded: [], services: [] },
      });
    },
    plugins(req, res) {
      const harness = getHarness();
      if (!harness) {
        sendJson(res, 200, { plugins: [] });
        return;
      }
      const plugins = harness.registry.list().map((p) => {
        const ctx = harness.pluginContext(p.manifest.id);
        return {
          id: p.manifest.id,
          name: p.manifest.name,
          version: p.manifest.version,
          description: p.manifest.description,
          tier: p.manifest.tier ?? 'standard',
          services: harness.services.providedBy(p.manifest.id),
          config: ctx?.config ?? {},
        };
      });
      sendJson(res, 200, { plugins });
    },
    async scan(_req, res) {
      if (!scanPlugins) {
        sendJson(res, 501, { ok: false, error: '未启用运行时扫描' });
        return;
      }
      try {
        sendJson(res, 200, await scanPlugins());
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err) });
      }
    },
    services(req, res) {
      sendJson(res, 200, { services: getHarness() ? getHarness()!.services.bindings() : [] });
    },
    async rpc(req, res) {
      try {
        const body = await readBody(req);
        let parsed: unknown;
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
          return;
        }
        const { status, body: out } = await handleRpc(parsed);
        sendJson(res, status, out);
      } catch (err) {
        sendJson(res, 400, { ok: false, error: String(err) });
      }
    },
    notFound(res) {
      sendJson(res, 404, { error: 'not found' });
    },
    tryStatic(req, res, pathname) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      if (isApiPath(pathname)) return false;
      const siteRel = siteSubpath(pathname);
      const file = siteRel !== undefined
        ? (siteDir ? resolveStaticFile(siteDir, siteRel) : undefined)
        : (staticDir ? resolveStaticFile(staticDir, pathname) : undefined);
      if (!file) return false;
      const mime = mimeFor(file);
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') {
        res.end();
        return true;
      }
      createReadStream(file).pipe(res);
      return true;
    },
  };
}
