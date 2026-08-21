import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { AGENT_SERVICE } from '@wizard-harness/contracts';
import type { AgentService, SessionService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import agentPlugin from '../src/index.js';
import { AGENT_LIVE } from '../src/host.js';

describe('agent 插件', () => {
  it('服务名契约绑定 + 必选 inject session（不 inject llm/tools）', () => {
    expect(AGENT_SERVICE).toBe('agent');
    expect(agentPlugin.manifest.provides).toEqual(['agent']);
    expect(agentPlugin.inject).toEqual({ session: true, logger: false });
  });

  it('spawn 开 session + scope overlay；兄弟互不可见；stop 撕 overlay', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(agentPlugin);

    const agent = harness.services.get<AgentService>('agent')!;
    const session = harness.services.get<SessionService>('session')!;
    const a = agent.spawn({ id: 'a' });
    const b = agent.spawn({ id: 'b', sessionId: session.start({ title: 'shared' }).id });

    expect(a.sessionId).toBeTruthy();
    expect(session.get(a.sessionId)).toBeDefined();
    expect(a.ctx.get(AGENT_LIVE)).toEqual({ id: 'a', sessionId: a.sessionId });
    expect(b.ctx.get(AGENT_LIVE)).toEqual({ id: 'b', sessionId: b.sessionId });
    expect(a.ctx.get(AGENT_LIVE)).not.toEqual(b.ctx.get(AGENT_LIVE));
    expect(harness.services.get(AGENT_LIVE)).toBeUndefined();
    expect(agent.list()).toEqual([
      { id: 'a', sessionId: a.sessionId },
      { id: 'b', sessionId: b.sessionId },
    ]);
    expect(seen.some((e) => e.action === 'agent/spawn' && e.target === 'a')).toBe(true);

    await agent.stop('a');
    expect(agent.get('a')).toBeUndefined();
    expect(a.ctx.get(AGENT_LIVE)).toBeUndefined();
    expect(b.ctx.get(AGENT_LIVE)).toEqual({ id: 'b', sessionId: b.sessionId });
    expect(seen.some((e) => e.action === 'agent/stop' && e.target === 'a')).toBe(true);
  });

  it('spawn / setSystemPrompt 把 system 消息写入绑定 session', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(agentPlugin);
    const agent = harness.services.get<AgentService>('agent')!;
    const session = harness.services.get<SessionService>('session')!;
    const h = agent.spawn({ id: 'p', systemPrompt: 'be brief' });
    expect(h.systemPrompt).toBe('be brief');
    const first = session.get(h.sessionId)!.replay();
    expect(first).toHaveLength(1);
    expect(first[0]?.data).toMatchObject({ role: 'system', content: 'be brief' });
    agent.setSystemPrompt('p', 'be terse');
    expect(agent.get('p')?.systemPrompt).toBe('be terse');
    expect(session.get(h.sessionId)!.replay()).toHaveLength(2);
    expect(seen.filter((e) => e.action === 'agent/prompt')).toHaveLength(2);
  });

  it('重名 spawn 抛错；未知 stop 抛错；不调 llm', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(agentPlugin);
    const agent = harness.services.get<AgentService>('agent')!;
    agent.spawn({ id: 'one' });
    expect(() => agent.spawn({ id: 'one' })).toThrow(/已存在/);
    await expect(agent.stop('nope')).rejects.toThrow(/不存在/);
    expect(harness.services.get('llm')).toBeUndefined();
    expect(harness.services.get('tools')).toBeUndefined();
  });
});
