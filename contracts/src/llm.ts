/**
 * 服务契约层：llm 服务。
 *
 * 契约属于系统而非任何插件。读写都落到 session。
 * 支持一次 complete、官方 tool_calls、可选流式 delta 与 AbortSignal。
 */
export const LLM_SERVICE = 'llm';

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmToolSpec {
  name: string;
  description?: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: LlmToolCall[];
}

export interface LlmCompleteInput {
  sessionId?: string;
  prompt?: string;
  tools?: readonly LlmToolSpec[];
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
}

export interface LlmCompleteResult {
  sessionId: string;
  text: string;
  provider: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmService {
  complete(input?: LlmCompleteInput): Promise<LlmCompleteResult>;
}
