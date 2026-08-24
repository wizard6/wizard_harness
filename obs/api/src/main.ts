import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assembleRuntime,
  createEventBus,
  createFileSink,
  resolveHomeDir,
  resolveProfileDir,
  syncRuntime,
} from '@wizard-harness/core';
import type { CompositionSnapshot, SystemContext } from '@wizard-harness/core';
import { createHandlers } from './handlers.js';
import { parseExpose } from './expose.js';
import type { ExposeMap } from './expose.js';

/**
 * obs-api：运行时壳（分层定位 v2）。
 * - 观测：/events /events/stream /state（读 events.jsonl，与 CLI/TUI 一致）
 * - 运行时：/plugins /services 只读状态；/rpc 白名单服务调用（未设 WH_EXPOSE 时默认 agent 试跑名单）
 * 端点处理见 handlers.ts，本文件只负责配置读取、装配与路由分发。
 *
 * 环境变量：
 *   WH_EVENTS   事件文件路径（默认 <cwd>/docs/logs/events.jsonl）
 *   WH_PLUGINS_DIR 插件包目录（默认 <cwd>/plugins）
 *   WH_DISABLED 逗号分隔的禁用插件 id
 *   WH_ENABLE_EXPERIMENTAL 逗号分隔的显式启用 experimental 插件 id
 *   WH_PROFILE  profile 名或路径（默认 profiles/default；off 关闭组合、退回目录发现）
 *   WH_HOME     机级 home（默认 ~/.wizard-harness），可读 wizard.patch.json
 *   WH_EXPOSE   服务白名单 JSON。未设置时默认暴露 agent/list|stop、promptContext/assemble|apply|setPersona|getPersona|inspect、agentLoop/run|cancel。
 *               `off` 或 `{}` 关闭全部。
 *   PORT        监听端口（默认 8787）
 */

const FILE = process.env.WH_EVENTS || resolve(process.cwd(), 'docs/logs/events.jsonl');
const PLUGINS_DIR = process.env.WH_PLUGINS_DIR || resolve(process.cwd(), 'plugins');
const PORT = Number(process.env.PORT || 8787);

const runtime: {
  harness?: SystemContext;
  composition?: CompositionSnapshot;
  pluginsDir: string;
  profileDir?: string | null;
} = { pluginsDir: PLUGINS_DIR };

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
  const parsed = parseExpose(process.env.WH_EXPOSE);
  if (process.env.WH_EXPOSE && process.env.WH_EXPOSE.trim() !== '' && process.env.WH_EXPOSE.trim() !== 'off') {
    try {
      JSON.parse(process.env.WH_EXPOSE);
    } catch {
      console.warn('[config] WH_EXPOSE 不是合法 JSON，回退默认 agent 试跑白名单');
    }
  }
  return parsed;
}

const apiExpose = readExpose();

async function init(): Promise<void> {
  mkdirSync(resolve(FILE, '..'), { recursive: true });
  if (!process.env.WH_SESSIONS_DIR) {
    process.env.WH_SESSIONS_DIR = resolve(resolveHomeDir(), 'sessions');
  }
  const bus = createEventBus();
  bus.subscribe(createFileSink(FILE));
  const profileDir = resolveProfileDir(process.env.WH_PROFILE, process.cwd());
  runtime.pluginsDir = PLUGINS_DIR;
  runtime.profileDir = profileDir;
  const rt = await assembleRuntime({
    bus,
    config: readConfig(),
    name: 'wizard-harness-api',
    pluginsDir: PLUGINS_DIR,
    ...(profileDir
      ? { profileDir, bundlesDir: resolve(process.cwd(), 'bundles'), homeDir: resolveHomeDir() }
      : {}),
  });
  runtime.harness = rt.harness;
  runtime.composition = rt.composition;
  if (runtime.composition) {
    console.log(`[boot] profile ${runtime.composition.profile} ← ${runtime.composition.bundles.join(' → ') || '(no bundles)'}`);
  }
  for (const w of rt.warnings) console.warn('[discovery]', w);
  for (const s of rt.skipped) console.warn('[boot] skipped', s.id, `(${s.reason})`);
  for (const p of rt.pending) {
    console.warn('[boot] pending', p.plugin.manifest.id, '缺少', p.missing.join(', '));
  }
  console.log(
    `[boot] loaded ${rt.plugins.length} 插件：${rt.plugins.map((p) => p.manifest.id).join(', ')}`,
  );
}

const handlers = createHandlers({
  file: FILE,
  expose: apiExpose,
  getHarness: () => runtime.harness,
  getComposition: () => runtime.composition,
  scanPlugins: async () => {
    const harness = runtime.harness;
    if (!harness) throw new Error('harness 未就绪');
    const r = await syncRuntime({
      harness,
      pluginsDir: runtime.pluginsDir,
      ...(runtime.profileDir
        ? {
            profileDir: runtime.profileDir,
            bundlesDir: resolve(process.cwd(), 'bundles'),
            homeDir: resolveHomeDir(),
          }
        : {}),
    });
    if (r.composition) runtime.composition = r.composition;
    return {
      ok: true,
      loaded: r.loaded.map((p) => p.manifest.id),
      already: r.already,
      skipped: r.skipped,
      pending: r.pending.map((p) => ({ id: p.plugin.manifest.id, missing: p.missing })),
      failures: r.failures,
      warnings: r.warnings,
    };
  },
});

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/events') return handlers.events(req, res);
  if (req.method === 'GET' && url.pathname === '/events/stream') return handlers.stream(req, res);
  if (req.method === 'GET' && url.pathname === '/state') return handlers.state(req, res);
  if (req.method === 'GET' && url.pathname === '/plugins') return handlers.plugins(req, res);
  if ((req.method === 'POST' || req.method === 'GET') && url.pathname === '/plugins/scan') {
    return void handlers.scan(req, res);
  }
  if (req.method === 'GET' && url.pathname === '/services') return handlers.services(req, res);
  if (req.method === 'POST' && url.pathname === '/rpc') return void handlers.rpc(req, res);
  handlers.notFound(res);
});

init().then(() => {
  server.listen(PORT, () => {
    console.log(`obs-api listening on http://localhost:${PORT}`);
    console.log(`events file: ${FILE}`);
    console.log(`plugins dir: ${PLUGINS_DIR}`);
    console.log(`exposed services: ${Object.keys(apiExpose).join(', ') || '(无，/rpc 全部拒绝)'}`);
  });
});
