import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { Plugin } from '@wizard-harness/core';
import { APP_CHAT_SERVICE } from '@wizard-harness/contracts';
import type { AgentLoopService, AppChatService } from '@wizard-harness/contracts';
import appChatPlugin from '../src/index.js';

function fakeLoop(run: AgentLoopService['run']): Plugin {
  return {
    manifest: { id: 'agent-loop', version: '0.1.0', provides: ['agentLoop'] },
    api: { run, cancel() {} } satisfies AgentLoopService,
    register() {},
  };
}

describe('app-chat 插件', () => {
  it('服务名契约 + inject agentLoop', () => {
    expect(APP_CHAT_SERVICE).toBe('appChat');
    expect(appChatPlugin.manifest.provides).toEqual(['appChat']);
    expect(appChatPlugin.inject).toEqual({ agentLoop: true, logger: false });
    expect(appChatPlugin.ui).toBeUndefined();
  });

  it('send 包装 agentLoop：无 tools 时用默认提示词与步数', async () => {
    const seen: unknown[] = [];
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(
      fakeLoop(async (opts) => {
        seen.push(opts);
        return { agentId: opts?.agentId ?? 'a1', sessionId: 's', text: `ok:${opts?.prompt}`, steps: 1 };
      }),
    );
    await harness.registry.register(appChatPlugin);
    const chat = harness.services.get<AppChatService>('appChat');
    const out = await chat!.send({ prompt: '你好' });
    expect(out).toEqual({ agentId: 'a1', text: 'ok:你好', provider: undefined });
    expect(seen[0]).toMatchObject({
      prompt: '你好',
      useTools: false,
      maxSteps: 1,
      systemPrompt: '你是简洁的助手，用中文回答。',
    });
    const again = await chat!.send({ prompt: '二', agentId: out.agentId, useTools: true });
    expect(again.agentId).toBe('a1');
    expect(seen[1]).toMatchObject({ agentId: 'a1', useTools: true, maxSteps: 4 });
    expect((seen[1] as { systemPrompt?: string }).systemPrompt).toBeUndefined();
  });
});
