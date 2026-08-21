import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { LLM_SERVICE } from '@wizard-harness/contracts';
import type { LlmService, SessionService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import llmPlugin from '../src/index.js';

describe('llm 插件', () => {
  it('服务名契约绑定 + 必选 inject session', () => {
    expect(LLM_SERVICE).toBe('llm');
    expect(llmPlugin.manifest.provides).toEqual(['llm']);
    expect(llmPlugin.inject).toEqual({ session: true, logger: false });
  });

  it('complete 把 user/assistant 写入 session，并发 llm/request 与 llm/result', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(llmPlugin);

    const llm = harness.services.get<LlmService>('llm')!;
    const out = await llm.complete({ prompt: 'ping' });
    expect(out.provider).toBe('mock');
    expect(out.text).toBe('[mock] ping');

    const session = harness.services.get<SessionService>('session')!;
    const kinds = session.get(out.sessionId)!.replay().map((e) => `${e.kind}:${e.data.role ?? e.data.phase}`);
    expect(kinds).toEqual(['message:user', 'turn:start', 'message:assistant', 'turn:end']);
    expect(seen.some((e) => e.action === 'llm/request' && e.target === out.sessionId)).toBe(true);
    expect(seen.some((e) => e.action === 'llm/result' && e.target === out.sessionId)).toBe(true);
  });
});
