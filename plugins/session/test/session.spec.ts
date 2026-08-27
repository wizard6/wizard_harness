import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { SESSION_SERVICE } from '@wizard-harness/contracts';
import type { SessionService } from '@wizard-harness/contracts';
import sessionPlugin from '../src/index.js';
import { createSessionStore } from '../src/store.js';

describe('session 插件', () => {
  it('服务名契约绑定', () => {
    expect(SESSION_SERVICE).toBe('session');
    expect(sessionPlugin.manifest.provides).toEqual(['session']);
    expect(sessionPlugin.ui?.rpc).toEqual({ session: ['inspect', 'peek', 'patch', 'open'] });
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

  it('workspace 写入 start；patch 可改 title/workspace；inspect 列出元数据', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    const svc = harness.services.get<SessionService>('session')!;
    const s = svc.start({ id: 'w1', title: '甲', workspace: '.' });
    expect(s.workspace).toBeTruthy();
    expect(s.workspace).toBe(svc.peek('w1').workspace);
    const patched = svc.patch('w1', { title: '乙', workspace: '' });
    expect(patched).toMatchObject({ id: 'w1', title: '乙' });
    expect(patched.workspace).toBeUndefined();
    expect(svc.get('w1')?.title).toBe('乙');
    expect(svc.get('w1')?.workspace).toBeUndefined();
    const opened = svc.open({ id: 'w2', title: '丙' });
    expect(opened).toMatchObject({ id: 'w2', title: '丙', entries: 0 });
    expect(svc.current()?.id).toBe('w2');
    const snap = svc.inspect();
    expect(snap.currentId).toBe('w2');
    expect(snap.persistDir).toBeUndefined();
    expect(snap.sessions.map((x) => x.id).sort()).toEqual(['w1', 'w2']);
    expect(snap.sessions.every((x) => x.updatedAt > 0)).toBe(true);
    expect(svc.remove('w1')).toBe(true);
    expect(svc.get('w1')).toBeUndefined();
    expect(svc.remove('w1')).toBe(false);
    expect(svc.inspect().sessions.map((x) => x.id)).toEqual(['w2']);
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

  it('compact 丢掉最老条目并记 compact turn', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    const svc = harness.services.get<SessionService>('session')!;
    const s = svc.start({ id: 'sc' });
    s.append('message', { role: 'user', content: '1' });
    s.append('message', { role: 'user', content: '2' });
    s.append('message', { role: 'user', content: '3' });
    expect(svc.compact('sc', { keep: 2 })).toBe(1);
    const log = s.replay();
    expect(log[0]?.data).toMatchObject({ phase: 'compact', dropped: 1 });
    expect(log.map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});

describe('session 持久化', () => {
  it('persistDir 重启后能 replay', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-sess-'));
    try {
      const a = createSessionStore(() => {}, { persistDir: dir });
      a.start({ id: 'p', workspace: dir }).append('message', { role: 'user', content: 'hi' });
      const b = createSessionStore(() => {}, { persistDir: dir });
      expect(b.get('p')?.replay()).toHaveLength(1);
      expect(b.get('p')?.replay()[0]?.data.content).toBe('hi');
      expect(b.get('p')?.workspace).toBeTruthy();
      expect(b.remove('p')).toBe(true);
      expect(b.get('p')).toBeUndefined();
      const c = createSessionStore(() => {}, { persistDir: dir });
      expect(c.get('p')).toBeUndefined();
      expect(c.remove('missing')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
