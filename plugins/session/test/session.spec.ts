import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { SESSION_SERVICE } from '@wizard-harness/contracts';
import type { SessionService } from '@wizard-harness/contracts';
import sessionPlugin from '../src/index.js';

describe('session 插件', () => {
  it('服务名契约绑定', () => {
    expect(SESSION_SERVICE).toBe('session');
    expect(sessionPlugin.manifest.provides).toEqual(['session']);
  });

  it('start / append 三类条目 / replay 保序；观测 session/start 与 session/append', async () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus });
    await harness.registry.register(sessionPlugin);

    const svc = harness.services.get<SessionService>('session');
    expect(svc).toBeDefined();
    const s = svc!.start({ id: 's1', title: 'demo' });
    s.append('turn', { phase: 'start' });
    s.append('message', { role: 'user', content: 'hi' });
    s.append('tool-result', { callId: 'c1', name: 'echo', content: 'ok' });
    s.append('turn', { phase: 'end' });

    const log = s.replay();
    expect(log.map((e) => e.kind)).toEqual(['turn', 'message', 'tool-result', 'turn']);
    expect(log.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(svc!.deriveMessages('s1')).toHaveLength(1);
    expect(svc!.current()?.id).toBe('s1');
    expect(seen.some((e) => e.action === 'session/start' && e.target === 's1')).toBe(true);
    expect(seen.filter((e) => e.action === 'session/append')).toHaveLength(4);
  });

  it('未知 kind / 重复 id 失败；条目 data 冻结', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    const svc = harness.services.get<SessionService>('session')!;
    const s = svc.start({ id: 's2' });
    expect(() => s.append('nope' as 'turn')).toThrow(/未知 session kind/);
    expect(() => svc.start({ id: 's2' })).toThrow(/已存在/);
    const entry = s.append('message', { role: 'user', content: 'x' });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.data)).toBe(true);
  });
});
