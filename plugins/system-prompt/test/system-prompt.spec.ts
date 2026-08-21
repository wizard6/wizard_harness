import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { SYSTEM_PROMPT_SERVICE } from '@wizard-harness/contracts';
import type { SessionService, SystemPromptService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import systemPromptPlugin from '../src/index.js';

describe('system-prompt 插件', () => {
  it('服务名契约绑定 + 必选 inject session（不 inject agent/llm）', () => {
    expect(SYSTEM_PROMPT_SERVICE).toBe('systemPrompt');
    expect(systemPromptPlugin.manifest.provides).toEqual(['systemPrompt']);
    expect(systemPromptPlugin.inject).toEqual({ session: true, logger: false, trajectory: false });
  });

  it('set 登记当前文本；apply 写入 session；相同内容再 apply 跳过', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(systemPromptPlugin);

    const session = harness.services.get<SessionService>('session')!;
    const prompts = harness.services.get<SystemPromptService>('systemPrompt')!;
    const sess = session.start({ title: 'p' });
    prompts.set(sess.id, 'be brief');
    expect(prompts.get(sess.id)).toBe('be brief');
    expect(sess.replay()).toHaveLength(0);

    prompts.apply(sess.id);
    expect(sess.replay()).toHaveLength(1);
    expect(sess.replay()[0]?.data).toMatchObject({ role: 'system', content: 'be brief' });
    prompts.apply(sess.id);
    expect(sess.replay()).toHaveLength(1);

    prompts.set(sess.id, 'be terse');
    prompts.apply(sess.id);
    expect(sess.replay()).toHaveLength(2);
    expect(seen.filter((e) => e.action === 'system-prompt/set')).toHaveLength(2);
    expect(seen.filter((e) => e.action === 'system-prompt/apply')).toHaveLength(2);
  });

  it('未知 session 抛错；未 set 的 apply 是空操作', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(systemPromptPlugin);
    const prompts = harness.services.get<SystemPromptService>('systemPrompt')!;
    expect(() => prompts.set('nope', 'x')).toThrow(/不存在/);
    expect(() => prompts.apply('nope')).not.toThrow();
    expect(prompts.get('nope')).toBeUndefined();
  });
});
