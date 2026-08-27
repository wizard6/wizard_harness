import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { Plugin } from '@wizard-harness/core';
import { APP_CHAT_SERVICE } from '@wizard-harness/contracts';
import type { AgentLoopService, AppChatService, PromptContextService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import agentPlugin from '../../agent/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import appChatPlugin from '../src/index.js';

function fakeLoop(run: AgentLoopService['run']): Plugin {
  return {
    manifest: { id: 'agent-loop', version: '0.1.0', provides: ['agentLoop'] },
    api: { run, cancel() {} } satisfies AgentLoopService,
    register() {},
  };
}

function fakePromptContext(): Plugin {
  const api: PromptContextService = {
    section: () => () => {},
    context: () => () => {},
    variable: () => () => {},
    tools: () => () => {},
    bind: () => ({
      section: (s) => api.section(s),
      context: (e) => api.context(e),
      variable: (n, p) => api.variable(n, p),
      tools: (p) => api.tools(p),
    }),
    assemble: () => ({ sections: [], contexts: [], tools: [], variables: {}, systemText: '', contextText: '' }),
    apply: () => {},
    setPersona: () => {},
    getPersona: () => undefined,
    inspect: () => ({ sources: [] }),
    usage: () => ({ limitTokens: 0, totalTokens: 0, categories: [], at: 0 }),
  };
  return {
    manifest: { id: 'prompt-context', version: '0.1.0', provides: ['promptContext'] },
    api,
    register() {},
  };
}

describe('app-chat 插件', () => {
  it('服务名契约 + inject agentLoop · promptContext · agent · session', () => {
    expect(APP_CHAT_SERVICE).toBe('appChat');
    expect(appChatPlugin.inject).toEqual({
      agentLoop: true,
      promptContext: true,
      agent: true,
      session: true,
      logger: false,
    });
  });

  it('register 登记 persona section；send 不再旁路 loop.persona', async () => {
    const seen: unknown[] = [];
    const sections: { name: string; text: string }[] = [];
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(agentPlugin);
    const pc = fakePromptContext();
    const api = pc.api as PromptContextService;
    api.section = (s) => {
      sections.push({ name: s.name, text: String(s.text) });
      return () => {};
    };
    await harness.registry.register(pc);
    await harness.registry.register(
      fakeLoop(async (opts) => {
        seen.push(opts);
        return { agentId: opts?.agentId ?? 'a1', sessionId: 's1', text: `ok:${opts?.prompt}`, steps: 1 };
      }),
    );
    await harness.registry.register(appChatPlugin);
    expect(sections.some((s) => s.name === 'app-chat:persona')).toBe(true);

    const chat = harness.services.get<AppChatService>('appChat')!;
    const out = await chat.send({ prompt: '你好' });
    expect(out).toMatchObject({ agentId: 'a1', sessionId: 's1', text: 'ok:你好', steps: 1 });
    expect((seen[0] as { persona?: string }).persona).toBeUndefined();
  });

  it('listSessions / resumeSession 复用 agent 与 session', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(agentPlugin);
    await harness.registry.register(fakePromptContext());
    await harness.registry.register(
      fakeLoop(async (opts) => ({
        agentId: opts?.agentId ?? 'new',
        sessionId: 's-fixed',
        text: 'pong',
        steps: 1,
      })),
    );
    await harness.registry.register(appChatPlugin);
    const chat = harness.services.get<AppChatService>('appChat')!;
    const session = harness.services.get('session')!;
    const sess = session.start({ title: 'old-chat' });
    sess.append('message', { role: 'user', content: '之前说过 hi' });
    sess.append('message', { role: 'assistant', content: '你好呀' });

    const listed = await chat.listSessions();
    expect(listed.some((row) => row.id === sess.id && row.preview?.includes('hi') && row.updatedAt > 0)).toBe(true);

    const resumed = await chat.resumeSession(sess.id);
    expect(resumed.agentId).toBeTruthy();
    expect(resumed.sessionId).toBe(sess.id);
    expect(resumed.messages.map((m) => m.content)).toEqual(['之前说过 hi', '你好呀']);

    const again = await chat.resumeSession(sess.id);
    expect(again.agentId).toBe(resumed.agentId);

    await chat.deleteSession(sess.id);
    expect((await chat.listSessions()).some((row) => row.id === sess.id)).toBe(false);
    await expect(chat.deleteSession(sess.id)).rejects.toThrow(/不存在/);
  });

  it('无 agentId / sessionId 时把 workspace 转交 loop.run', async () => {
    const seen: unknown[] = [];
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(agentPlugin);
    await harness.registry.register(fakePromptContext());
    await harness.registry.register(
      fakeLoop(async (opts) => {
        seen.push(opts);
        return { agentId: 'a1', sessionId: 's', text: 'ok', steps: 1, workspace: opts?.workspace };
      }),
    );
    await harness.registry.register(appChatPlugin);
    const chat = harness.services.get<AppChatService>('appChat')!;
    const out = await chat.send({ prompt: 'hi', workspace: '.' });
    expect(seen[0]).toMatchObject({ prompt: 'hi', workspace: '.' });
    expect(out.workspace).toBeTruthy();

    const again = await chat.send({ prompt: '二', agentId: out.agentId, workspace: '/tmp/ignored' });
    expect(again.agentId).toBe('a1');
    expect((seen[1] as { workspace?: string }).workspace).toBeUndefined();
  });
});
