import type { Plugin } from '@wizard-harness/core';
import { WORKFLOW_SERVICE } from '@wizard-harness/contracts';
import type {
  AgentLoopService,
  AgentService,
  ToolsService,
  TrajectoryService,
  WorkflowService,
} from '@wizard-harness/contracts';
import { createWorkflowHost } from './host.js';

/**
 * workflow 插件：固定调度。不内置业务节点，不拥有 Demo 窗口。
 * 不登记 tools、不实现 kind=agent；只把 agent/agentLoop 放进节点 ctx，并提供 exec。
 * 说明文档：docs/plugins/workflow.html
 */
let impl: WorkflowService | undefined;

function live(): WorkflowService {
  if (!impl) throw new Error('workflow 未就绪');
  return impl;
}

const api: WorkflowService = {
  registerNode: (h) => live().registerNode(h),
  listNodes: () => live().listNodes(),
  exec: (kind, inputs, opts) => live().exec(kind, inputs, opts),
  run: (opts) => live().run(opts),
  cancel: (id) => live().cancel(id),
  get: (id) => live().get(id),
  latest: () => live().latest(),
};

const workflowPlugin: Plugin = {
  manifest: {
    id: 'workflow',
    version: '0.1.0',
    name: '工作流调度',
    description: '按图顺序调度。节点由其它插件 registerNode。提供 exec 供工具封装。',
    provides: [WORKFLOW_SERVICE],
    config: {},
    tier: 'standard',
  },
  inject: { tools: false, trajectory: false, logger: false, agent: false, agentLoop: false },
  api,
  register(c) {
    impl = createWorkflowHost({
      tools: c.tools ?? c.get<ToolsService>('tools'),
      trajectory: c.trajectory ?? c.get<TrajectoryService>('trajectory'),
      agent: c.agent ?? c.get<AgentService>('agent'),
      agentLoop: c.agentLoop ?? c.get<AgentLoopService>('agentLoop'),
      emit: (action, target, payload) => c.emit({ action, target, payload }),
    });
    c.logger?.info?.('workflow 调度插件就绪');
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default workflowPlugin;
