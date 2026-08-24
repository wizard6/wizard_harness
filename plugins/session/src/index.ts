import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { Session, SessionEntry, SessionKind, SessionService } from '@wizard-harness/contracts';
import { SESSION_HTML } from './page.js';
import { createSessionStore } from './store.js';

/**
 * session 插件：追加型会话日志（领域源）+ 会话元数据（title / workspace）。
 * 说明文档：docs/plugins/session.html
 */
let ctx: PluginContext | undefined;
let impl: SessionService | undefined;

function live(): SessionService {
  if (!impl) throw new Error('session 未就绪');
  return impl;
}

const api: SessionService = {
  start: (opts) => live().start(opts),
  open: (opts) => live().open(opts),
  get: (id) => live().get(id),
  list: () => live().list(),
  current: () => live().current(),
  patch: (id, patch) => live().patch(id, patch),
  inspect: () => live().inspect(),
  peek: (id) => live().peek(id),
  deriveMessages: (id) => live().deriveMessages(id),
  compact: (id, opts) => live().compact(id, opts),
};

const sessionPlugin: Plugin = {
  manifest: {
    id: 'session',
    version: '0.1.0',
    name: '会话日志',
    description: '追加型会话日志：start / append / replay；元数据 title / workspace；可选磁盘持久化与 compact。',
    provides: ['session'],
    config: { persistDir: '', compactKeep: 0 },
    tier: 'standard',
  },
  inject: { logger: false },
  api,
  ui: {
    title: '会话',
    width: 760,
    height: 560,
    rpc: { session: ['inspect', 'peek', 'patch', 'open'] },
    content: SESSION_HTML,
  },
  register(c) {
    ctx = c;
    // 只在 vitest worker 里忽略 WH_SESSIONS_DIR，避免同一终端先跑测试再 gui:start 时 VITEST=1 残留导致不落盘
    const persistDir = process.env.VITEST_WORKER_ID
      ? String(c.config.persistDir || '').trim()
      : String(c.config.persistDir || process.env.WH_SESSIONS_DIR || '').trim();
    impl = createSessionStore((action, target, payload) => {
      ctx?.emit({ action, target, payload });
    }, persistDir ? { persistDir } : {});
    c.logger?.info?.(persistDir ? `session 插件就绪（持久化 ${persistDir}）` : 'session 插件就绪（内存）');
    c.effect(() => () => {
      impl = undefined;
      ctx = undefined;
    });
  },
};

export default sessionPlugin;
export type { Session, SessionEntry, SessionKind };
