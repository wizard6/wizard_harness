import type { Plugin } from '@wizard-harness/core';
import type { QueryLoopService } from '@wizard-harness/contracts';
import { QUERY_LOOP_SERVICE } from '@wizard-harness/contracts';
import { createQueryLoop } from './engine.js';
import { QUERY_LOOP_HTML } from './page.js';

/**
 * query-loop：可扩展 query 循环（assemble → model → tools → 再 assemble）。
 * 对外仍提供 agentLoop，替换已禁用的旧 OTA 插件。
 * 说明文档：docs/plugins/query-loop.html
 */
let impl: QueryLoopService | undefined;

function live(): QueryLoopService {
  if (!impl) throw new Error('query-loop 未就绪');
  return impl;
}

const api: QueryLoopService = {
  run: (opts) => live().run(opts),
  cancel: (agentId) => live().cancel(agentId),
  use: (hook) => live().use(hook),
  inspect: () => live().inspect(),
};

const queryLoopPlugin: Plugin = {
  manifest: {
    id: 'query-loop',
    version: '0.1.0',
    name: 'Query 循环',
    description: '可扩展 query 循环：assemble → model → tools，直到 end_turn。兼容 agentLoop。',
    provides: ['agentLoop', QUERY_LOOP_SERVICE],
    config: { maxSteps: 12, compactKeep: 0 },
    tier: 'standard',
  },
  inject: { agent: true, llm: true, tools: true, promptContext: true, logger: false, trajectory: false },
  api,
  ui: {
    title: 'Query 循环',
    width: 480,
    height: 440,
    rpc: { agentLoop: ['run', 'cancel'], queryLoop: ['inspect'] },
    content: QUERY_LOOP_HTML,
  },
  register(c) {
    impl = createQueryLoop(c);
    c.logger?.info?.('query-loop 就绪（提供 agentLoop）');
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default queryLoopPlugin;
