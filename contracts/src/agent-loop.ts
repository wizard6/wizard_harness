/**
 * 服务契约层：agent-loop 服务。
 *
 * 契约属于系统而非任何插件。编排 llm.complete + tools.call，读写 agent 绑定的 session。
 * 不拥有 live agent（那是 agent），不拥有 System Prompt（那是 system-prompt），不另存聊天记录。
 * 薄切片：一次 run、文本协议调工具；不做流式、官方 tool_call、调度器。
 */
export const AGENT_LOOP_SERVICE = 'agentLoop';

export interface AgentLoopRunOpts {
  /** 不传则 spawn 一个 */
  agentId?: string;
  prompt?: string;
  maxSteps?: number;
}

export interface AgentLoopResult {
  agentId: string;
  sessionId: string;
  text: string;
  steps: number;
}

export interface AgentLoopService {
  run(opts?: AgentLoopRunOpts): Promise<AgentLoopResult>;
}
