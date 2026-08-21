import type { Plugin } from '@wizard-harness/core';
import type { SystemPromptService } from '@wizard-harness/contracts';
import { createSystemPromptStore } from './store.js';

/**
 * system-prompt 插件：按 session 登记当前 System Prompt，apply 写入 session。
 * 说明文档：docs/plugins/system-prompt.html
 */
let impl: SystemPromptService | undefined;

function live(): SystemPromptService {
  if (!impl) throw new Error('system-prompt 未就绪');
  return impl;
}

const api: SystemPromptService = {
  set: (sessionId, content) => live().set(sessionId, content),
  get: (sessionId) => live().get(sessionId),
  apply: (sessionId) => live().apply(sessionId),
};

const systemPromptPlugin: Plugin = {
  manifest: {
    id: 'system-prompt',
    version: '0.1.0',
    name: 'System Prompt',
    description: '按 session 登记 System Prompt；apply 才 append 到日志。不是 agent，也不是循环。',
    provides: ['systemPrompt'],
    config: {},
    tier: 'standard',
  },
  inject: { session: true, logger: false },
  api,
  ui: {
    title: 'System Prompt',
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
      '<span class="badge">● systemPrompt 服务</span>',
      '<h1>System Prompt</h1>',
      '<p class="desc">ctx.systemPrompt.set / get / apply。当前文本按 session 登记；apply 才写入 session 的 system 消息。agent 不管这个，llm 只读日志。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">systemPrompt</span></div>',
      '<div class="row"><span class="k">依赖</span><span class="v">session</span></div>',
      '<div class="row"><span class="k">不管</span><span class="v">agent · llm · 循环</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">system-prompt/set · apply</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/system-prompt.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    impl = createSystemPromptStore(c);
    c.logger?.info?.('system-prompt 插件就绪');
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default systemPromptPlugin;
