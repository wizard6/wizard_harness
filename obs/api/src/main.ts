import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assembleRuntime,
  createEventBus,
  createFileSink,
  queryEvents,
  readEvents,
  tailEvents,
} from '@wizard-harness/core';
import type { PluginEvent, SystemContext } from '@wizard-harness/core';
import { registrySpec } from '@wizard-harness/obs-core';

/**
 * obs-api：运行时壳（分层定位 v2）。
 * - 观测：/events /events/stream /state（读 events.jsonl，与 CLI/TUI 一致）
 * - 运行时：/plugins /services 只读状态；/rpc 白名单服务调用（默认不暴露任何调用）
 *
 * 环境变量：
 *   WH_EVENTS   事件文件路径（默认 <cwd>/docs/logs/events.jsonl）
 *   WH_PLUGINS_DIR 插件包目录（默认 <cwd>/plugins）
 *   WH_DISABLED 逗号分隔的禁用插件 id
 *   WH_ENABLE_EXPERIMENTAL 逗号分隔的显式启用 experimental 插件 id
 *   WH_EXPOSE   服务白名单 JSON：{ "服务名": true | ["method", ...] }，默认 {}
 *   PORT        监听端口（默认 8787）
 */

const FILE = process.env.WH_EVENTS || resolve(process.cwd(), 'docs/logs/events.jsonl');
const PLUGINS_DIR = process.env.WH_PLUGINS_DIR || resolve(process.cwd(), 'plugins');
const PORT = Number(process.env.PORT || 8787);

let harness: SystemContext | undefined;

type ExposeMap = Record<string, true | string[]>;

function readConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const disabled = process.env.WH_DISABLED;
  if (disabled) {
    config.disabledPlugins = disabled.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const exp = process.env.WH_ENABLE_EXPERIMENTAL;
  if (exp) {
    config.enableExperimental = exp.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return config;
}

function readExpose(): ExposeMap {
  const raw = process.env.WH_EXPOSE;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ExposeMap = {};
    for (const [name, v] of Object.entries(parsed)) {
      if (v === true) out[name] = true;
      else if (Array.isArray(v)) out[name] = v.filter((m): m is string => typeof m === 'string');
    }
    return out;
  } catch {
    console.warn('[config] WH_EXPOSE 不是合法 JSON，忽略（默认不暴露任何服务调用）');
    return {};
  }
}

const apiExpose = readExpose();

async function init(): Promise<void> {
  mkdirSync(resolve(FILE, '..'), { recursive: true });
  const bus = createEventBus();
  bus.subscribe(createFileSink(FILE));
  const rt = await assembleRuntime({
    bus,
    config: readConfig(),
    name: 'wizard-harness-api',
    pluginsDir: PLUGINS_DIR,
  });
  harness = rt.harness;
  for (const w of rt.warnings) console.warn('[discovery]', w);
  for (const s of rt.skipped) console.warn('[boot] skipped', s.id, `(${s.reason})`);
  for (const p of rt.pending) {
    console.warn('[boot] pending', p.plugin.manifest.id, '缺少', p.missing.join(', '));
  }
  console.log(
    `[boot] loaded ${rt.plugins.length} 插件：${rt.plugins.map((p) => p.manifest.id).join(', ')}`,
  );
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

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

async function handleRpc(parsed: unknown): Promise<{ status: number; body: unknown }> {
  const { service, method, args } = (parsed ?? {}) as {
    service?: unknown;
    method?: unknown;
    args?: unknown;
  };
  if (typeof service !== 'string' || typeof method !== 'string') {
    return { status: 400, body: { ok: false, error: '需要 service 与 method（字符串）' } };
  }
  // 白名单门：默认不暴露任何服务调用
  const allow = apiExpose[service];
  if (!allow) {
    return { status: 403, body: { ok: false, error: `服务 ${service} 未在 WH_EXPOSE 白名单` } };
  }
  const allowed = allow === true || (Array.isArray(allow) && allow.includes(method));
  if (!allowed) {
    return {
      status: 403,
      body: { ok: false, error: `方法 ${service}.${method} 未在白名单` },
    };
  }
  const svc = harness?.services.get(service);
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

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/events') {
    const p = url.searchParams;
    const events = queryEvents(readEvents(FILE), {
      actor: p.get('actor') ?? undefined,
      action: p.get('action') ?? undefined,
      target: p.get('target') ?? undefined,
      keyword: p.get('keyword') ?? undefined,
      limit: p.get('limit') ? Number(p.get('limit')) : undefined,
    });
    sendJson(res, 200, { events, total: events.length });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    const stop = tailEvents(FILE, (e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    req.on('close', stop);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/state') {
    const events = readEvents(FILE);
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.action] = (counts[e.action] ?? 0) + 1;
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
          }
        : { loaded: [], services: [] },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/plugins') {
    if (!harness) {
      sendJson(res, 200, { plugins: [] });
      return;
    }
    const h = harness;
    const plugins = h.registry.list().map((p) => {
      const ctx = h.pluginContext(p.manifest.id);
      return {
        id: p.manifest.id,
        name: p.manifest.name,
        version: p.manifest.version,
        description: p.manifest.description,
        tier: p.manifest.tier ?? 'standard',
        services: h.services.providedBy(p.manifest.id),
        config: ctx?.config ?? {},
      };
    });
    sendJson(res, 200, { plugins });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/services') {
    sendJson(res, 200, { services: harness ? harness.services.bindings() : [] });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/rpc') {
    readBody(req)
      .then(async (body) => {
        let parsed: unknown;
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
          return;
        }
        const { status, body: out } = await handleRpc(parsed);
        sendJson(res, status, out);
      })
      .catch((err) => sendJson(res, 400, { ok: false, error: String(err) }));
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

init().then(() => {
  server.listen(PORT, () => {
    console.log(`obs-api listening on http://localhost:${PORT}`);
    console.log(`events file: ${FILE}`);
    console.log(`plugins dir: ${PLUGINS_DIR}`);
    console.log(`exposed services: ${Object.keys(apiExpose).join(', ') || '(无，/rpc 全部拒绝)'}`);
  });
});
