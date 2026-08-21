export const APP_CHAT_SERVICE = 'appChat';

/** 产品对话适配：把 agent-loop 收成 App 用的 send，不拥有窗口。 */
export interface AppChatSendOpts {
  prompt: string;
  agentId?: string;
  useTools?: boolean;
}

export interface AppChatSendResult {
  agentId: string;
  text: string;
  provider?: string;
}

export interface AppChatService {
  send(opts: AppChatSendOpts): Promise<AppChatSendResult>;
  cancel(agentId: string): void;
}
