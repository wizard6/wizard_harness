/**
 * 服务契约层：llm 服务。
 *
 * 契约属于系统而非任何插件。读写都落到 session：历史从 deriveMessages 投影，
 * 模型输出 append message。薄切片：一次 complete，不做流式 / tool call / 多模型路由。
 */
export const LLM_SERVICE = 'llm';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompleteInput {
  /** 不传则用 session.current()，没有则 start 一个 */
  sessionId?: string;
  /** 若有，先 append 为 user message 再调用模型 */
  prompt?: string;
}

export interface LlmCompleteResult {
  sessionId: string;
  text: string;
  provider: string;
}

export interface LlmService {
  complete(input?: LlmCompleteInput): Promise<LlmCompleteResult>;
}
