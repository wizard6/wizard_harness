import type { PluginContext } from '@wizard-harness/core';
import type {
  AgentLoopService,
  AgentService,
  AppChatMessagePreview,
  AppChatResumeResult,
  PromptContextService,
  SessionService,
} from '@wizard-harness/contracts';

let ctx: PluginContext | undefined;

export function setAppChatCtx(c: PluginContext | undefined): void {
  ctx = c;
}

function servicesOf(): { loop: AgentLoopService; agent: AgentService; session: SessionService } {
  const loop = ctx?.agentLoop ?? ctx?.get<AgentLoopService>('agentLoop');
  if (!loop) throw new Error('app-chat 需要 agent-loop');
  const agent = ctx?.agent ?? ctx?.get<AgentService>('agent');
  if (!agent) throw new Error('app-chat 需要 agent 服务');
  const session = ctx?.session ?? ctx?.get<SessionService>('session');
  if (!session) throw new Error('app-chat 需要 session 服务');
  return { loop, agent, session };
}

export function registerPersonaSection(c: PluginContext, section: string): void {
  const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
  if (!prompts) throw new Error('app-chat 需要 prompt-context');
  const cfg = c.config ?? {};
  const persona = String(
    cfg.persona ||
      '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。',
  );
  prompts.section({ name: section, order: 0, text: persona });
}

export function cfgOf(): { maxStepsWithTools: number; maxStepsNoTools: number } {
  const c = ctx?.config ?? {};
  return {
    maxStepsWithTools: Math.max(1, Number(c.maxStepsWithTools ?? 12)),
    maxStepsNoTools: Math.max(1, Number(c.maxStepsNoTools ?? 1)),
  };
}

function previewOf(content: unknown): string {
  const s = String(content ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= 80 ? s : `${s.slice(0, 80)}…`;
}

function messagesFromReplay(sessionId: string): AppChatMessagePreview[] {
  const replay = servicesOf().session.get(sessionId)?.replay() ?? [];
  const out: AppChatMessagePreview[] = [];
  for (const entry of replay) {
    if (entry.kind !== 'message') continue;
    const role = entry.data.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') continue;
    out.push({
      role,
      content: typeof entry.data.content === 'string' ? entry.data.content : previewOf(entry.data.content),
    });
  }
  return out;
}

export function lastUserPreviewOf(sessionId: string): string | undefined {
  const replay = servicesOf().session.get(sessionId)?.replay() ?? [];
  for (let i = replay.length - 1; i >= 0; i -= 1) {
    const entry = replay[i];
    if (entry?.kind === 'message' && entry.data.role === 'user') {
      return previewOf(entry.data.content);
    }
  }
  return undefined;
}

export function attachAgent(sessionId: string, title?: string): AppChatResumeResult {
  const { agent, session } = servicesOf();
  const sess = session.get(sessionId);
  if (!sess) throw new Error(`session 不存在：${sessionId}`);
  const existing = agent.list().find((row) => row.sessionId === sessionId);
  const handle = existing ?? agent.spawn({ sessionId, title: title ?? sess.title ?? 'app-chat' });
  return {
    agentId: handle.id,
    sessionId,
    messages: messagesFromReplay(sessionId),
  };
}

export function chatRuntime(): { loop: AgentLoopService; agent: AgentService; session: SessionService } {
  return servicesOf();
}
