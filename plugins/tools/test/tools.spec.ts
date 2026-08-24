import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness, scopeOf } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { TOOLS_SERVICE } from '@wizard-harness/contracts';
import type { AgentService, PromptContextService, SessionService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import agentPlugin from '../../agent/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import toolsPlugin from '../src/index.js';

describe('tools 插件', () => {
  it('服务名契约绑定 + 必选 inject session · promptContext', () => {
    expect(TOOLS_SERVICE).toBe('tools');
    expect(toolsPlugin.manifest.provides).toEqual(['tools']);
    expect(toolsPlugin.inject).toEqual({ session: true, promptContext: true, logger: false, trajectory: false });
  });

  it('缺 promptContext 时 boot 挂起 tools', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const result = await harness.boot([sessionPlugin, toolsPlugin]);
    expect(result.pending).toEqual([{ plugin: toolsPlugin, missing: ['promptContext'] }]);
    expect(harness.services.get<ToolsService>('tools')).toBeUndefined();
  });

  it('register 时向 prompt-context 登记 tools；assemble 可见内置工具', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    const assembly = pc.assemble({});
    expect(assembly.tools.map((t) => t.name).sort()).toEqual(['echo', 'now', 'upper']);
    const inspect = pc.inspect();
    expect(inspect.sources.some((s) => s.kind === 'tools' && s.name.includes('echo'))).toBe(true);
  });

  it('内置 echo：call 写入 tool-result，观测 tools/register · call · result', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);

    const tools = harness.services.get<ToolsService>('tools')!;
    expect(tools.list().map((t) => t.name).sort()).toEqual(['echo', 'now', 'upper']);
    const out = await tools.call('echo', { input: 'hi' });
    expect(out.ok).toBe(true);
    expect(out.content).toBe('hi');

    const session = harness.services.get<SessionService>('session')!;
    const entry = session.get(out.sessionId)!.replay().find((e) => e.kind === 'tool-result');
    expect(entry?.data).toMatchObject({ name: 'echo', content: 'hi', ok: true, callId: out.callId });
    expect(seen.some((e) => e.action === 'tools/register' && e.target === 'echo')).toBe(true);
    expect(seen.some((e) => e.action === 'tools/call' && e.target === 'echo')).toBe(true);
    expect(seen.some((e) => e.action === 'tools/result' && e.target === 'echo')).toBe(true);
  });

  it('未知工具抛错；handler 失败仍写入 ok:false', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    const tools = harness.services.get<ToolsService>('tools')!;
    await expect(tools.call('nope')).rejects.toThrow(/未知工具/);
    tools.register({
      name: 'boom',
      handler: () => {
        throw new Error('broke');
      },
    });
    const out = await tools.call('boom');
    expect(out.ok).toBe(false);
    expect(out.content).toMatch(/broke/);
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    expect(pc.assemble({}).tools.map((t) => t.name)).toContain('boom');
  });

  it('bind(scope)：同名工具各 agent 互不可见；listIn 与 assemble 对齐', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(agentPlugin);
    await harness.registry.register(toolsPlugin);
    const agent = harness.services.get<AgentService>('agent')!;
    const tools = harness.services.get<ToolsService>('tools')!;
    const prompts = harness.services.get<PromptContextService>('promptContext')!;
    const h1 = agent.spawn({ id: 'scope-a' });
    const h2 = agent.spawn({ id: 'scope-b' });
    tools.bind(h1.ctx).register({ name: 'ping', description: 'a', handler: () => 'A' });
    tools.bind(h2.ctx).register({ name: 'ping', description: 'b', handler: () => 'B' });

    expect(tools.list().map((t) => t.name)).not.toContain('ping');
    expect(tools.bind(h1.ctx).list().map((t) => t.name)).toContain('ping');
    expect(tools.bind(h2.ctx).list().map((t) => t.name)).toContain('ping');

    const out1 = await tools.bind(h1.ctx).call('ping');
    const out2 = await tools.bind(h2.ctx).call('ping');
    expect(out1.content).toBe('A');
    expect(out2.content).toBe('B');

    const scopedAsm = prompts.assemble({ sessionId: h1.sessionId, scope: scopeOf(h1.ctx) });
    expect(scopedAsm.tools.map((t) => t.name)).toContain('ping');
    expect(prompts.assemble({}).tools.map((t) => t.name)).not.toContain('ping');
  });

  it('内置 now / upper', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    const tools = harness.services.get<ToolsService>('tools')!;
    const now = await tools.call('now');
    expect(now.ok).toBe(true);
    expect(now.content).toMatch(/^\d{4}-/);
    const upper = await tools.call('upper', { input: 'ab' });
    expect(upper.content).toBe('AB');
  });
});
