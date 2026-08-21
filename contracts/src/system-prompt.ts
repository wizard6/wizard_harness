/**
 * 服务契约层：system-prompt 服务。
 *
 * 契约属于系统而非任何插件。当前 System Prompt 按 session 登记；
 * apply 才 append 到 session（llm 从日志投影）。不是 agent 身份，也不是循环。
 */
export const SYSTEM_PROMPT_SERVICE = 'systemPrompt';

export interface SystemPromptService {
  set(sessionId: string, content: string): void;
  get(sessionId: string): string | undefined;
  /** 把当前 prompt 写入 session；内容未变则跳过 */
  apply(sessionId: string): void;
}
