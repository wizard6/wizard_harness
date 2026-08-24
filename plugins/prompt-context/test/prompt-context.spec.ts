import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness, createScope, scopeOf } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { PROMPT_CONTEXT_SERVICE } from '@wizard-harness/contracts';
import type { PromptContextService, SessionService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import promptContextPlugin from '../src/index.js';

describe('prompt-context 插件', () => {
  it('服务名契约绑定 + 必选 inject session', () => {
    expect(PROMPT_CONTEXT_SERVICE).toBe('promptContext');
    expect(promptContextPlugin.manifest.provides).toEqual(['promptContext']);
    expect(promptContextPlugin.inject).toEqual({ session: true, logger: false, trajectory: false });
    expect(promptContextPlugin.ui?.rpc).toEqual({ promptContext: ['inspect', 'assemble'] });
  });

  it('assemble：sections + contexts + tools + variables；apply 写入 session', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);

    const session = harness.services.get<SessionService>('session')!;
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    const sess = session.start({ title: 'p' });

    pc.section({ name: 'base', order: 0, text: 'You are {{role}}.' });
    pc.variable('role', () => 'tester');
    pc.context({ name: 'cwd', order: 0, text: 'cwd: /tmp' });
    pc.tools(() => [{ name: 'echo', description: 'echo back' }]);

    const assembly = pc.assemble({ sessionId: sess.id });
    expect(assembly.systemText).toBe('You are tester.');
    expect(assembly.contextText).toContain('cwd: /tmp');
    expect(assembly.tools).toEqual([{ name: 'echo', description: 'echo back' }]);

    pc.apply(sess.id, assembly);
    const replay = sess.replay();
    expect(replay).toHaveLength(2);
    expect(replay[0]?.data).toMatchObject({ role: 'system', content: 'You are tester.' });
    expect(replay[1]?.data).toMatchObject({ role: 'user' });
    expect(String(replay[1]?.data.content)).toContain('cwd: /tmp');

    pc.apply(sess.id, assembly);
    expect(sess.replay()).toHaveLength(2);

    pc.setPersona(sess.id, 'be terse');
    const next = pc.assemble({ sessionId: sess.id });
    pc.apply(sess.id, next);
    expect(sess.replay()).toHaveLength(4);
    expect(seen.some((e) => e.action === 'prompt-context/assemble')).toBe(true);
    expect(seen.some((e) => e.action === 'prompt-context/apply')).toBe(true);
  });

  it('inspect：素材清单 + 最近成品；scoped 层可区分', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    const session = harness.services.get<SessionService>('session')!;
    const sess = session.start({ title: 'inspect' });

    pc.section({ name: 'base', order: 0, text: 'You are {{role}}.' });
    pc.variable('role', () => 'tester');
    pc.context({ name: 'cwd', order: 0, text: 'cwd: /tmp' });
    pc.tools(() => [{ name: 'echo', description: 'echo back' }]);
    pc.setPersona(sess.id, 'be terse');

    const before = pc.inspect();
    expect(before.assembly).toBeUndefined();
    expect(before.sources.map((s) => `${s.kind}:${s.name}`).sort()).toEqual([
      'context:cwd',
      'persona:' + sess.id,
      'section:base',
      'tools:echo',
      'variable:role',
    ].sort());
    expect(before.sources.find((s) => s.name === 'base')?.live).toBe(false);
    expect(before.sources.find((s) => s.name === 'role')?.live).toBe(true);

    const hostCtx = harness.pluginContext('prompt-context');
    if (!hostCtx) throw new Error('缺少 prompt-context 上下文');
    const scope = createScope(hostCtx, { agent: 'a1' });
    scope.ctx.promptContext?.bind(scope.ctx).section({ name: 'extra', order: 1, text: 'scoped' });
    const withScope = pc.inspect();
    const extra = withScope.sources.find((s) => s.name === 'extra');
    expect(extra?.layer).toContain('a1');
    expect(extra?.layer).not.toBe('global');

    pc.apply(sess.id, pc.assemble({ sessionId: sess.id }));
    const after = pc.inspect();
    expect(after.assembly?.systemText).toContain('You are tester.');
    expect(after.assembly?.contextText).toContain('cwd: /tmp');
    expect(after.applied?.sessionId).toBe(sess.id);
    expect(after.applied?.systemText).toContain('be terse');
  });

  it('scoped section shadow 全局同名', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    const session = harness.services.get<SessionService>('session')!;
    const sess = session.start({ title: 'scope' });

    const hostCtx = harness.pluginContext('prompt-context');
    if (!hostCtx) throw new Error('缺少 prompt-context 上下文');
    pc.section({ name: 'persona', order: 0, text: 'global' });
    const scope = createScope(hostCtx, { agent: 'a1' });
    scope.ctx.promptContext?.bind(scope.ctx).section({ name: 'persona', order: 0, text: 'scoped' });

    const globalAsm = pc.assemble({ sessionId: sess.id });
    const scopedAsm = pc.assemble({ sessionId: sess.id, scope: scopeOf(scope.ctx) });
    expect(globalAsm.systemText).toBe('global');
    expect(scopedAsm.systemText).toBe('scoped');
  });

  it('未知 session 抛错；空 apply 跳过', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    expect(() => pc.setPersona('nope', 'x')).toThrow(/不存在/);
    expect(() => pc.apply('nope')).not.toThrow();
    expect(pc.getPersona('nope')).toBeUndefined();
  });
});

describe('prompt-context render', () => {
  it('未知变量 fail loud', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    pc.section({ name: 'x', order: 0, text: 'hi {{missing}}' });
    expect(() => pc.assemble()).toThrow(/未知变量/);
  });
});
