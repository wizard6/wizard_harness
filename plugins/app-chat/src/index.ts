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
    persona: String(
      c.persona ||
        c.systemPrompt ||
        '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。',
    ),
    maxStepsWithTools: Math.max(1, Number(c.maxStepsWithTools ?? 12)),
    maxStepsNoTools: Math.max(1, Number(c.maxStepsNoTools ?? 1)),
  };
}

const api: AppChatService = {
  async send(opts: AppChatSendOpts) {
    const prompt = String(opts.prompt ?? '').trim();
    if (!prompt) throw new Error('prompt 不能为空');
    const useTools = opts.useTools !== false;
    const cfg = cfgOf();
    const out = await loopOf().run({
      agentId: opts.agentId,
      prompt,
      useTools,
      maxSteps: useTools ? cfg.maxStepsWithTools : cfg.maxStepsNoTools,
      persona: opts.agentId ? undefined : cfg.persona,
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
      persona:
        '你是能自主完成任务的助手。收到问题后按「观察-思考-行动」循环：先理解上下文，再决定是否需要调用工具，逐步执行直到可以给出最终答复。',
      maxStepsWithTools: 12,
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
