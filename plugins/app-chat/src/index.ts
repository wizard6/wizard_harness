import type { Plugin, PluginContext } from '@wizard-harness/core';
import { APP_CHAT_SERVICE } from '@wizard-harness/contracts';
import type { AgentLoopService, AppChatService, AppChatSendOpts } from '@wizard-harness/contracts';

/**
 * app-chat：产品对话适配。包装 agentLoop，默认提示词 / 步数住在本插件。
 * 说明文档：docs/plugins/app-chat.html
 */
let ctx: PluginContext | undefined;

function loopOf(): AgentLoopService {
  const loop = ctx?.agentLoop ?? ctx?.get<AgentLoopService>('agentLoop');
  if (!loop) throw new Error('app-chat 需要 agent-loop');
  return loop;
}

function cfgOf() {
  const c = ctx?.config ?? {};
  return {
    systemPrompt: String(c.systemPrompt || '你是简洁的助手，用中文回答。'),
    maxStepsWithTools: Math.max(1, Number(c.maxStepsWithTools ?? 4)),
    maxStepsNoTools: Math.max(1, Number(c.maxStepsNoTools ?? 1)),
  };
}

const api: AppChatService = {
  async send(opts: AppChatSendOpts) {
    const prompt = String(opts.prompt ?? '').trim();
    if (!prompt) throw new Error('prompt 不能为空');
    const useTools = opts.useTools === true;
    const cfg = cfgOf();
    const out = await loopOf().run({
      agentId: opts.agentId,
      prompt,
      useTools,
      maxSteps: useTools ? cfg.maxStepsWithTools : cfg.maxStepsNoTools,
      systemPrompt: opts.agentId ? undefined : cfg.systemPrompt,
    });
    return { agentId: out.agentId, text: out.text, provider: out.provider };
  },
  cancel(agentId: string) {
    loopOf().cancel(agentId);
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
      systemPrompt: '你是简洁的助手，用中文回答。',
      maxStepsWithTools: 4,
      maxStepsNoTools: 1,
    },
    tier: 'standard',
  },
  inject: { agentLoop: true, logger: false },
  api,
  register(c) {
    ctx = c;
    c.effect(() => () => {
      ctx = undefined;
    });
  },
};

export default appChatPlugin;
