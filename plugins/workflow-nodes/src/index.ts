import type { Plugin } from '@wizard-harness/core';
import { WORKFLOW_NODES_SERVICE } from '@wizard-harness/contracts';
import type { WorkflowNodesService, WorkflowService } from '@wizard-harness/contracts';
import { demoGraph, echoHandler, kinds, upperHandler } from './handlers.js';

/**
 * workflow-nodes：两个示例节点（echo / upper）。不拥有调度，不拥有 Demo 窗口。
 * 说明文档：docs/plugins/workflow-nodes.html
 */
const api: WorkflowNodesService = { demoGraph, kinds };

const workflowNodesPlugin: Plugin = {
  manifest: {
    id: 'workflow-nodes',
    version: '0.1.0',
    name: '工作流节点',
    description: '向 workflow 登记 echo / upper 两种节点，并提供 kinds / demoGraph。',
    provides: [WORKFLOW_NODES_SERVICE],
    config: {},
    tier: 'standard',
  },
  inject: { workflow: true, logger: false },
  api,
  register(c) {
    const wf = c.workflow ?? c.get<WorkflowService>('workflow');
    if (!wf) throw new Error('workflow-nodes 需要 workflow');
    const stopEcho = wf.registerNode(echoHandler);
    const stopUpper = wf.registerNode(upperHandler);
    c.logger?.info?.('workflow-nodes 已登记 echo / upper');
    c.effect(() => () => {
      stopEcho();
      stopUpper();
    });
  },
};

export default workflowNodesPlugin;
