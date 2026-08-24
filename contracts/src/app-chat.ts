export const APP_CHAT_SERVICE = 'appChat';

/** 产品对话适配：把 agent-loop 收成 App 用的 send，不拥有窗口。 */
export interface AppChatSendOpts {
  prompt: string;
  agentId?: string;
  sessionId?: string;
  useTools?: boolean;
}

export interface AppChatMessagePreview {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface AppChatSessionSummary {
  id: string;
  title?: string;
  startedAt: number;
  entryCount: number;
  preview?: string;
}

export interface AppChatSendResult {
  agentId: string;
  sessionId: string;
  text: string;
  steps?: number;
  provider?: string;
}

export interface AppChatResumeResult {
  agentId: string;
  sessionId: string;
  messages: AppChatMessagePreview[];
}

export interface AppChatService {
  send(opts: AppChatSendOpts): Promise<AppChatSendResult>;
  cancel(agentId: string): void;
  listSessions(): Promise<readonly AppChatSessionSummary[]>;
  resumeSession(sessionId: string): Promise<AppChatResumeResult>;
}
