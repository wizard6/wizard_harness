import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { TIMER_SERVICE } from '@wizard-harness/contracts';
import type { TimerService } from '@wizard-harness/contracts';
import loggerPlugin from '../../logger/src/index.js';
import { nextCronFire } from '../src/cron.js';
import { JobScheduler } from '../src/scheduler.js';
import { createTimerHost } from '../src/host.js';
import { materializeFlowPlan } from '../src/flow-plan.js';
import { runFlow } from '../src/flow-runner.js';
import { TraceStore } from '../src/trace.js';
import timerPlugin from '../src/index.js';

describe('timer cron', () => {
  it('下一分钟匹配', () => {
    const base = Date.UTC(2026, 0, 1, 10, 0, 30);
    const next = nextCronFire('* * * * *', base);
    expect(next).toBe(Date.UTC(2026, 0, 1, 10, 1, 0));
  });
});

describe('JobScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('按最近时刻唤醒', () => {
    const due: number[] = [];
    const s = new JobScheduler((now) => due.push(now));
    const t0 = Date.now();
    s.set('a', t0 + 100);
    s.set('b', t0 + 50);
    vi.advanceTimersByTime(60);
    expect(due.length).toBe(1);
    expect(s.due(t0 + 60)).toContain('b');
  });
});

describe('timer host', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('interval 触发 event 动作', async () => {
    const events: string[] = [];
    const host = createTimerHost({
      emit: (action) => events.push(action),
    });
    host.create({
      id: 't1',
      schedule: { kind: 'interval', intervalMs: 1000 },
      action: { kind: 'event', action: 'timer/test' },
      autostart: true,
    });
    await vi.advanceTimersByTimeAsync(1100);
    await Promise.resolve();
    expect(events).toContain('timer/test');
    expect(host.get('t1')?.fireCount).toBe(1);
  });

  it('stop 后不再触发', async () => {
    const events: string[] = [];
    const host = createTimerHost({ emit: (action) => events.push(action) });
    host.create({
      schedule: { kind: 'interval', intervalMs: 500 },
      action: { kind: 'event', action: 'tick' },
      autostart: true,
    });
    host.stop(host.list()[0]!.id);
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(events.filter((e) => e === 'tick').length).toBe(0);
  });

  it('cancelRun 对不存在的 run 返回 false', () => {
    const host = createTimerHost({ emit: () => {} });
    expect(host.cancelRun('missing')).toBe(false);
  });

  it('链条顺序执行并生成追踪树', async () => {
    const events: string[] = [];
    const host = createTimerHost({ emit: (action) => events.push(action) });
    host.create({
      id: 'chain1',
      schedule: { kind: 'once', delayMs: 10 },
      flow: {
        kind: 'chain',
        steps: [
          { id: 'a', label: '步骤A', action: { kind: 'event', action: 'timer/a' } },
          { id: 'b', label: '步骤B', delayMs: 50, action: { kind: 'event', action: 'timer/b' } },
        ],
      },
      autostart: true,
    });
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    expect(events.indexOf('timer/a')).toBeLessThan(events.indexOf('timer/b'));
    expect(events).toContain('timer/a');
    expect(events).toContain('timer/b');
    const flows = host.flowRuns('chain1');
    expect(flows.length).toBe(1);
    const tree = host.getTrace(flows[0]!.id);
    expect(tree?.nodes.filter((n) => n.state === 'ok').length).toBeGreaterThanOrEqual(2);
  });

  it('决策树按结果走 ok 分支', async () => {
    const events: string[] = [];
    const host = createTimerHost({ emit: (action) => events.push(action) });
    host.create({
      id: 'tree1',
      schedule: { kind: 'once', delayMs: 10 },
      flow: {
        kind: 'tree',
        rootLabel: '根',
        action: { kind: 'event', action: 'timer/root' },
        branches: [
          { when: 'ok', label: '成功', action: { kind: 'event', action: 'timer/ok' } },
          { when: 'error', label: '失败', action: { kind: 'event', action: 'timer/err' } },
        ],
      },
      autostart: true,
    });
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(events).toContain('timer/root');
    expect(events).toContain('timer/ok');
    expect(events).not.toContain('timer/err');
    const tree = host.getTrace(host.flowRuns('tree1')[0]!.id);
    const skipped = tree?.nodes.filter((n) => n.state === 'skipped') ?? [];
    expect(skipped.length).toBeGreaterThan(0);
  });
});

describe('flow plan & trace', () => {
  it('物化链条 pending 节点', () => {
    const nodes = materializeFlowPlan('flow-x', {
      kind: 'chain',
      steps: [{ label: 'S1', action: { kind: 'event', action: 'a' } }],
    });
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.state).toBe('pending');
  });

  it('runFlow 更新节点状态', async () => {
    const trace = new TraceStore(() => 1_000);
    const flow = {
      kind: 'chain' as const,
      steps: [{ id: '0', action: { kind: 'event' as const, action: 'tick' } }],
    };
    const plan = materializeFlowPlan('flow-run-1', flow);
    const run = trace.startFlowRun('j1', 'run-1', plan);
    const events: string[] = [];
    await runFlow(flow, {
      flowRunId: run.id,
      signal: new AbortController().signal,
      deps: { emit: (a) => events.push(a) },
      trace,
      delay: async () => {},
    });
    expect(events).toEqual(['tick']);
    const tree = trace.getTree(run.id);
    expect(tree?.nodes.some((n) => n.nodeKey === 'chain-0' && n.state === 'ok')).toBe(true);
  });
});

describe('timer 插件', () => {
  it('注册 timer 服务', async () => {
    const harness = createHarness({ bus: createEventBus(), config: { timer: { maxJobs: 8 } } });
    await harness.registry.register(loggerPlugin);
    await harness.registry.register(timerPlugin);
    const timer = harness.services.get<TimerService>(TIMER_SERVICE)!;
    const job = timer.create({
      label: 'demo',
      schedule: { kind: 'once', delayMs: 60_000 },
      action: { kind: 'event', action: 'timer/demo' },
    });
    expect(job.id).toBeTruthy();
    expect(timer.list().length).toBe(1);
  });
});
