import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PomodoroService } from '@wizard-harness/contracts';
import { createPomodoroHost } from '../src/host.js';
import pomodoroPlugin from '../src/index.js';

describe('pomodoro host', () => {
  it('start 进入专注并倒计时', () => {
    const host = createPomodoroHost({ focusMinutes: 1 });
    const s = host.start();
    expect(s.phase).toBe('focus');
    expect(s.running).toBe(true);
    expect(s.remainingMs).toBe(60_000);
  });

  it('tick 归零后进入短休', () => {
    const host = createPomodoroHost({ focusMinutes: 1, shortBreakMinutes: 1 });
    host.start();
    host.tick(60_000);
    const s = host.snapshot();
    expect(s.phase).toBe('shortBreak');
    expect(s.completedFocus).toBe(1);
  });

  it('每 N 个番茄进入长休', () => {
    const host = createPomodoroHost({
      focusMinutes: 1,
      shortBreakMinutes: 1,
      longBreakMinutes: 1,
      longBreakEvery: 2,
    });
    host.start();
    host.tick(60_000); // focus -> shortBreak
    host.tick(60_000); // shortBreak -> focus
    host.tick(60_000); // focus -> longBreak (2nd focus)
    expect(host.snapshot().phase).toBe('longBreak');
    expect(host.snapshot().completedFocus).toBe(2);
  });

  it('pause / resume', () => {
    const host = createPomodoroHost({ focusMinutes: 5 });
    host.start();
    host.tick(1000);
    const paused = host.pause();
    expect(paused.paused).toBe(true);
    const before = host.snapshot().remainingMs;
    host.tick(5000);
    expect(host.snapshot().remainingMs).toBe(before);
    host.resume();
    host.tick(1000);
    expect(host.snapshot().remainingMs).toBeLessThan(before);
  });

  it('reset 回到 idle', () => {
    const host = createPomodoroHost();
    host.start();
    const s = host.reset();
    expect(s.phase).toBe('idle');
    expect(s.completedFocus).toBe(0);
    expect(s.running).toBe(false);
  });

  it('skip 手动切换阶段', () => {
    const host = createPomodoroHost({ focusMinutes: 10 });
    host.start();
    const s = host.skip();
    expect(s.phase).toBe('shortBreak');
    expect(s.completedFocus).toBe(1);
  });
});

describe('pomodoro plugin lifecycle', () => {
  it('register 后 start 会随 tick 递减 remainingMs', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(pomodoroPlugin);
    const svc = harness.services.get<PomodoroService>('pomodoro')!;
    svc.start();
    const before = svc.snapshot().remainingMs;
    await new Promise((r) => setTimeout(r, 1100));
    expect(svc.snapshot().remainingMs).toBeLessThan(before);
  });

  it('boot 两阶段后 tick 仍工作', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.boot([pomodoroPlugin]);
    const svc = harness.services.get<PomodoroService>('pomodoro')!;
    svc.start();
    const before = svc.snapshot().remainingMs;
    await new Promise((r) => setTimeout(r, 1100));
    expect(svc.snapshot().remainingMs).toBeLessThan(before);
  });
});
