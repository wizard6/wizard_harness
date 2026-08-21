/**
 * 服务契约层：agent-loop 服务。
 *
 * 编排 llm.complete + tools.call。官方 tool_calls 优先，文本协议作回退。
 * systemPrompt 字段只转交给 system-prompt 插件，本服务不存副本。
 */
export const AGENT_LOOP_SERVICE = 'agentLoop';

export interface AgentLoopRunOpts {
  agentId?: string;
  prompt?: string;
  maxSteps?: number;
  /** 转交 system-prompt.set，然后 apply */
  systemPrompt?: string;
  /** 默认 true。false 时不把工具表交给模型，也不解析文本协议 */
  useTools?: boolean;
}

export interface AgentLoopResult {
  agentId: string;
  sessionId: string;
  text: string;
  steps: number;
  provider?: string;
}

export interface AgentLoopService {
  run(opts?: AgentLoopRunOpts): Promise<AgentLoopResult>;
  cancel(agentId: string): void;
}
