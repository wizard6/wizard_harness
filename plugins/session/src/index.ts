import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { SessionService } from '@wizard-harness/contracts';
import { createSessionStore } from './store.js';

/**
 * session 插件：追加型会话日志（领域源）。
 * 说明文档：docs/plugins/session.html
 */
let ctx: PluginContext | undefined;

const api: SessionService = createSessionStore((action, target, payload) => {
  ctx?.emit({ action, target, payload });
});

const sessionPlugin: Plugin = {
  manifest: {
    id: 'session',
    version: '0.1.0',
    name: '会话日志',
    description: '追加型会话日志：start / append(turn|message|tool-result) / 只读 replay',
    provides: ['session'],
    config: {},
    tier: 'standard',
  },
  inject: { logger: false },
  api,
  ui: {
    title: '会话日志',
    width: 480,
    height: 360,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:22px}',
      'h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #262634}',
      '.k{color:#a8a8bd}.v{color:#79c0ff;font-family:ui-monospace,Consolas,monospace}',
      '.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;background:rgba(121,192,255,.12);color:#79c0ff;margin-bottom:12px}',
      '</style></head><body><div class="card">',
      '<span class="badge">● session 服务</span>',
      '<h1>会话日志</h1>',
      '<p class="desc">追加型领域源：ctx.session.start / append / replay。llm、tools、agent 应读写本服务，而不是另建聊天记录。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">session</span></div>',
      '<div class="row"><span class="k">条目 kind</span><span class="v">turn · message · tool-result</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">session/start · session/append</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/session.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    ctx = c;
    c.logger?.info?.('session 插件就绪（内存日志，进程内有效）');
    c.effect(() => () => {
      ctx = undefined;
    });
  },
};

export default sessionPlugin;
