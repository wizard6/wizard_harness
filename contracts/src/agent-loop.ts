/**
 * 服务契约层：agent-loop 服务。
 *
 * Observe → Think → Act 循环编排。Think 无待执行意图时视为任务完成并退出。
 * persona / systemPrompt 字段只转交给 prompt-context.setPersona，本服务不存副本。
 */
export const AGENT_LOOP_SERVICE = 'agentLoop';

export interface AgentLoopRunOpts {
  agentId?: string;
  prompt?: string;
  /** OTA 循环上限（一轮 = Observe + Think + 可选 Act） */
  maxSteps?: number;
  /** 转交 prompt-context.setPersona */
  persona?: string;
  /** @deprecated 使用 persona */
  systemPrompt?: string;
  /** 默认 true。false 时不把工具表交给模型，也不解析文本协议 */
  useTools?: boolean;
}

export interface AgentLoopResult {
  agentId: string;
  sessionId: string;
  text: string;
  /** 完成的 OTA 循环次数 */
  steps: number;
  provider?: string;
}

export interface AgentLoopService {
  run(opts?: AgentLoopRunOpts): Promise<AgentLoopResult>;
  cancel(agentId: string): void;
}
