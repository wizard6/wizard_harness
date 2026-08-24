import type { Plugin, PluginContext } from '@wizard-harness/core';
import { APP_CHAT_SERVICE } from '@wizard-harness/contracts';
import type {
  AgentLoopService,
  AgentService,
  AppChatMessagePreview,
  AppChatResumeResult,
  AppChatSendOpts,
  AppChatService,
  AppChatSessionSummary,
  PromptContextService,
  SessionService,
} from '@wizard-harness/contracts';

const PERSONA_SECTION = 'app-chat:persona';

/**
 * app-chat：产品对话适配。包装 agentLoop，默认提示词 / 步数住在本插件。
 * 默认人设登记在 prompt-context（register 时一次 section），不经 loop.run 旁路。
 * 说明文档：docs/plugins/app-chat.html
 */
let ctx: PluginContext | undefined;

function loopOf(): AgentLoopService {
  const loop = ctx?.agentLoop ?? ctx?.get<AgentLoopService>('agentLoop');
  if (!loop) throw new Error('app-chat 需要 agent-loop');
  return loop;
}

function agentOf(): AgentService {
  const agent = ctx?.agent ?? ctx?.get<AgentService>('agent');
  if (!agent) throw new Error('app-chat 需要 agent 服务');
  return agent;
}

function sessionOf(): SessionService {
  const session = ctx?.session ?? ctx?.get<SessionService>('session');
  if (!session) throw new Error('app-chat 需要 session 服务');
  return session;
}

function personaOf(c: PluginContext): string {
  const cfg = c.config ?? {};
  return String(
    cfg.persona ||
      '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。',
  );
}

function registerPersona(c: PluginContext) {
  const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
  if (!prompts) throw new Error('app-chat 需要 prompt-context');
  prompts.section({ name: PERSONA_SECTION, order: 0, text: personaOf(c) });
}

function cfgOf() {
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
  const replay = sessionOf().get(sessionId)?.replay() ?? [];
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

function lastUserPreview(sessionId: string): string | undefined {
  const replay = sessionOf().get(sessionId)?.replay() ?? [];
  for (let i = replay.length - 1; i >= 0; i -= 1) {
    const entry = replay[i];
    if (entry?.kind === 'message' && entry.data.role === 'user') {
      return previewOf(entry.data.content);
    }
  }
  return undefined;
}

function attachAgent(sessionId: string, title?: string): AppChatResumeResult {
  const sess = sessionOf().get(sessionId);
  if (!sess) throw new Error(`session 不存在：${sessionId}`);
  const agent = agentOf();
  const existing = agent.list().find((row) => row.sessionId === sessionId);
  const handle = existing ?? agent.spawn({ sessionId, title: title ?? sess.title ?? 'app-chat' });
  return {
    agentId: handle.id,
    sessionId,
    messages: messagesFromReplay(sessionId),
  };
}

const api: AppChatService = {
  async send(opts: AppChatSendOpts) {
    const prompt = String(opts.prompt ?? '').trim();
    if (!prompt) throw new Error('prompt 不能为空');
    const useTools = opts.useTools !== false;
    const cfg = cfgOf();
    let agentId = opts.agentId?.trim();
    if (!agentId && opts.sessionId) agentId = attachAgent(opts.sessionId).agentId;
    const out = await loopOf().run({
      agentId,
      prompt,
      useTools,
      maxSteps: useTools ? cfg.maxStepsWithTools : cfg.maxStepsNoTools,
    });
    return {
      agentId: out.agentId,
      sessionId: out.sessionId,
      text: out.text,
      steps: out.steps,
      provider: out.provider,
    };
  },
  cancel(agentId: string) {
    loopOf().cancel(agentId);
  },
  async listSessions() {
    const rows: AppChatSessionSummary[] = sessionOf()
      .list()
      .map((sess) => ({
        id: sess.id,
        title: sess.title,
        startedAt: sess.startedAt,
        entryCount: sess.replay().length,
        preview: lastUserPreview(sess.id),
      }));
    rows.sort((a, b) => b.startedAt - a.startedAt);
    return rows;
  },
  async resumeSession(sessionId: string) {
    return attachAgent(String(sessionId ?? '').trim());
  },
};

const appChatPlugin: Plugin = {
  manifest: {
    id: 'app-chat',
    version: '0.1.0',
    name: 'App 对话',
    description: '产品对话适配：包装 agentLoop.send，不拥有窗口。',
    provides: [APP_CHAT_SERVICE],
    config: {
      persona:
        '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。',
      maxStepsWithTools: 12,
      maxStepsNoTools: 1,
    },
    tier: 'standard',
  },
  inject: { agentLoop: true, promptContext: true, agent: true, session: true, logger: false },
  api,
  register(c) {
    ctx = c;
    registerPersona(c);
    c.logger?.info?.('app-chat 插件就绪（人设已登记 prompt-context）');
    c.effect(() => () => {
      ctx = undefined;
    });
  },
};

export default appChatPlugin;
