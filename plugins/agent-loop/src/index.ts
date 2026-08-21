import type { Plugin } from '@wizard-harness/core';
import type { AgentLoopService } from '@wizard-harness/contracts';
import { createAgentLoop } from './loop.js';

/**
 * agent-loop 插件：编排 llm.complete + tools.call，读写 agent 绑定的 session。
 * 说明文档：docs/plugins/agent-loop.html
 */
let impl: AgentLoopService | undefined;

function live(): AgentLoopService {
  if (!impl) throw new Error('agent-loop 未就绪');
  return impl;
}

const api: AgentLoopService = {
  run: (opts) => live().run(opts),
};

const agentLoopPlugin: Plugin = {
  manifest: {
    id: 'agent-loop',
    version: '0.1.0',
    name: 'Agent 循环',
    description: '编排 llm.complete + tools.call。System Prompt 走 agent，不在本插件另存。',
    provides: ['agentLoop'],
    config: { maxSteps: 8 },
    tier: 'standard',
  },
  inject: { agent: true, llm: true, tools: true, logger: false },
  api,
  ui: {
    title: 'Agent 循环',
    width: 480,
    height: 380,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:22px}',
      'h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #262634}',
      '.k{color:#a8a8bd}.v{color:#7ee787;font-family:ui-monospace,Consolas,monospace}',
      '.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;background:rgba(126,231,135,.12);color:#7ee787;margin-bottom:12px}',
      '</style></head><body><div class="card">',
      '<span class="badge">● agentLoop 服务</span>',
      '<h1>Agent 循环</h1>',
      '<p class="desc">ctx.agentLoop.run({ agentId?, prompt?, maxSteps?, systemPrompt? })。经 agent 的 scoped ctx 调 llm / tools。文本协议：echo … 或 tool name {json}。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">agentLoop</span></div>',
      '<div class="row"><span class="k">依赖</span><span class="v">agent · llm · tools</span></div>',
      '<div class="row"><span class="k">协议</span><span class="v">echo / tool name {json}</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">agent-loop/start · step · end</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/agent-loop.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    impl = createAgentLoop(c);
    c.logger?.info?.('agent-loop 插件就绪');
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default agentLoopPlugin;
