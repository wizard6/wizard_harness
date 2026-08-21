import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { TOOLS_SERVICE } from '@wizard-harness/contracts';
import type { SessionService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../src/index.js';

describe('tools 插件', () => {
  it('服务名契约绑定 + 必选 inject session', () => {
    expect(TOOLS_SERVICE).toBe('tools');
    expect(toolsPlugin.manifest.provides).toEqual(['tools']);
    expect(toolsPlugin.inject).toEqual({ session: true, logger: false });
  });

  it('内置 echo：call 写入 tool-result，观测 tools/register · call · result', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(toolsPlugin);

    const tools = harness.services.get<ToolsService>('tools')!;
    expect(tools.list().map((t) => t.name)).toContain('echo');
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
  });
});
