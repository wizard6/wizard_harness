import type { WorkflowGraph } from './workflow.js';

export const WORKFLOW_NODES_SERVICE = 'workflowNodes';

export interface WorkflowNodeKindInfo {
  readonly kind: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
}

export interface WorkflowNodesService {
  /** 本插件提供的两节点示例图：echo → upper */
  demoGraph(): WorkflowGraph;
  /** 可新建的节点种类与端口 */
  kinds(): readonly WorkflowNodeKindInfo[];
}
