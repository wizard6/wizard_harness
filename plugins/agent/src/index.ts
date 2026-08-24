import type { Plugin } from '@wizard-harness/core';
import type { AgentService } from '@wizard-harness/contracts';
import { createAgentHost } from './host.js';
import { AGENT_HTML } from './page.js';

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
    width: 520,
    height: 420,
    rpc: { agent: ['list'] },
    content: AGENT_HTML,
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
