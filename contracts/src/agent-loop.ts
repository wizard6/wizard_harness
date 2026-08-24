/**
 * 服务契约层：agent-loop 服务。
 *
 * Observe → Think → Act 循环编排。Think 无待执行意图时视为任务完成并退出。
 * 人设与工具表由 prompt-context 组装；本服务不存副本、不经 run 旁路写入。
 */
export const AGENT_LOOP_SERVICE = 'agentLoop';

export interface AgentLoopRunOpts {
  agentId?: string;
  prompt?: string;
  /** OTA 循环上限（一轮 = Observe + Think + 可选 Act） */
  maxSteps?: number;
  /** 流式 delta（仅 think 阶段；经 llm 转发） */
  onDelta?: (chunk: string) => void;
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
