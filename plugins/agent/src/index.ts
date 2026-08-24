import type { Plugin } from '@wizard-harness/core';
import type { AgentService } from '@wizard-harness/contracts';
import { createAgentHost } from './host.js';

/**
 * agent 插件：live agent = createScope + 绑定 session。不是 agent-loop，不管 prompt-context。
 * 说明文档：docs/plugins/agent.html
 */
let impl: AgentService | undefined;

function live(): AgentService {
  if (!impl) throw new Error('agent 未就绪');
  return impl;
}

const api: AgentService = {
  spawn: (opts) => live().spawn(opts),
  get: (id) => live().get(id),
  list: () => live().list(),
  stop: (id) => live().stop(id),
};

const agentPlugin: Plugin = {
  manifest: {
    id: 'agent',
    version: '0.1.0',
    name: 'Agent',
    description: '每个 live agent 一个 scope，绑定一条 session。不管模型/工具循环，不管上下文组装。',
    provides: ['agent'],
    config: {},
    tier: 'standard',
  },
  inject: { session: true, logger: false },
  api,
  ui: {
    title: 'Agent',
    width: 480,
    height: 360,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#16161e;color:#e6e6ef}',
      '.card{padding:22px}',
      'h1{font-size:16px;margin:0 0 6px}',
      '.desc{margin:0 0 14px;font-size:13px;color:#a8a8bd;line-height:1.6}',
      '.row{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #262634}',
      '.k{color:#a8a8bd}.v{color:#d2a8ff;font-family:ui-monospace,Consolas,monospace}',
      '.badge{display:inline-block;font-size:11px;padding:2px 10px;border-radius:12px;background:rgba(210,168,255,.12);color:#d2a8ff;margin-bottom:12px}',
      '</style></head><body><div class="card">',
      '<span class="badge">● agent 服务</span>',
      '<h1>Agent</h1>',
      '<p class="desc">ctx.agent.spawn / get / list / stop。每个实例一个 createScope，绑定一条 session。上下文组装是 prompt-context；编排 llm+tools 是 agent-loop。</p>',
      '<div class="row"><span class="k">服务名</span><span class="v">agent</span></div>',
      '<div class="row"><span class="k">依赖</span><span class="v">session</span></div>',
      '<div class="row"><span class="k">不管</span><span class="v">llm · tools · prompt · 循环</span></div>',
      '<div class="row"><span class="k">观测</span><span class="v">agent/spawn · agent/stop</span></div>',
      '<div class="row"><span class="k">说明</span><span class="v">docs/plugins/agent.html</span></div>',
      '</div></body></html>',
    ].join(''),
  },
  register(c) {
    impl = createAgentHost(c);
    c.logger?.info?.('agent 插件就绪');
    c.effect(() => () => {
      const host = impl;
      impl = undefined;
      if (!host) return;
      for (const row of host.list()) void host.stop(row.id).catch(() => {});
    });
  },
};

export default agentPlugin;
