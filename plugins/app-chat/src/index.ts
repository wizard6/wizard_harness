import type { Plugin, PluginContext } from '@wizard-harness/core';
import { APP_CHAT_SERVICE } from '@wizard-harness/contracts';
import type { AppChatSendOpts, AppChatService, AppChatSessionSummary } from '@wizard-harness/contracts';
import {
  attachAgent,
  cfgOf,
  chatRuntime,
  lastUserPreviewOf,
  registerPersonaSection,
  setAppChatCtx,
} from './runtime.js';

const PERSONA_SECTION = 'app-chat:persona';

/**
 * app-chat：产品对话适配。包装 agentLoop，默认提示词 / 步数住在本插件。
 * 人设由 persona → prompt-context 出门；无 persona 时本插件登记 app-chat:persona section。
 * 说明文档：docs/plugins/app-chat.html
 */
const api: AppChatService = {
  async send(opts: AppChatSendOpts) {
    const prompt = String(opts.prompt ?? '').trim();
    if (!prompt) throw new Error('prompt 不能为空');
    const useTools = opts.useTools !== false;
    const cfg = cfgOf();
    let agentId = opts.agentId?.trim();
    if (!agentId && opts.sessionId) agentId = attachAgent(opts.sessionId).agentId;
    const out = await chatRuntime().loop.run({
      agentId,
      prompt,
      useTools,
      maxSteps: useTools ? cfg.maxStepsWithTools : cfg.maxStepsNoTools,
      workspace: agentId || opts.sessionId ? undefined : opts.workspace,
    });
    return {
      agentId: out.agentId,
      sessionId: out.sessionId,
      text: out.text,
      steps: out.steps,
      provider: out.provider,
      workspace: out.workspace,
    };
  },
  cancel(agentId: string) {
    chatRuntime().loop.cancel(agentId);
  },
  async listSessions() {
    const rows: AppChatSessionSummary[] = chatRuntime()
      .session
      .list()
      .map((sess) => ({
        id: sess.id,
        title: sess.title,
        startedAt: sess.startedAt,
        entryCount: sess.replay().length,
        preview: lastUserPreviewOf(sess.id),
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
    description: '产品对话适配：包装 agentLoop.send，不拥有窗口。人设不在这里。',
    provides: [APP_CHAT_SERVICE],
    config: {
      maxStepsWithTools: 12,
      maxStepsNoTools: 1,
    },
    tier: 'standard',
  },
  inject: { agentLoop: true, promptContext: true, agent: true, session: true, logger: false },
  api,
  register(c) {
    setAppChatCtx(c);
    registerPersonaSection(c, PERSONA_SECTION);
    c.logger?.info?.('app-chat 插件就绪（人设已登记 prompt-context）');
    c.effect(() => () => {
      setAppChatCtx(undefined);
    });
  },
};

export default appChatPlugin;
