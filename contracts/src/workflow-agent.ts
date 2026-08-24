/**
 * kind=agent 节点的契约。调度器不实现本种类。
 *
 * 后续插件：inject workflow + agentLoop，registerNode({ kind: WORKFLOW_AGENT_KIND, ... })。
 * 不要写进 agent-loop（OTA）或 workflow 调度器。
 */
export const WORKFLOW_AGENT_KIND = 'agent';

export const WORKFLOW_AGENT_PORTS = {
  inputs: ['prompt'] as const,
  outputs: ['text', 'agentId', 'sessionId'] as const,
};

export interface WorkflowAgentNodeOutput {
  readonly text: string;
  readonly agentId: string;
  readonly sessionId: string;
}
