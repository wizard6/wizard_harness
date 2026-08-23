import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { TRAJECTORY_SERVICE } from '@wizard-harness/contracts';
import type { AgentLoopService, TrajectoryService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import llmPlugin from '../../llm/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import agentPlugin from '../../agent/src/index.js';
import agentLoopPlugin from '../../agent-loop/src/index.js';
import trajectoryPlugin from '../src/index.js';
import { TRAJECTORY_HTML } from '../src/page.js';

describe('trajectory 插件', () => {
  it('服务名契约 + 不强制 inject', () => {
    expect(TRAJECTORY_SERVICE).toBe('trajectory');
    expect(trajectoryPlugin.manifest.provides).toEqual(['trajectory']);
    expect(trajectoryPlugin.inject).toEqual({ logger: false });
    expect(trajectoryPlugin.ui?.rpc).toEqual({ trajectory: ['latest', 'list', 'snapshot'] });
    expect(TRAJECTORY_HTML).toContain('renderTrajectory');
  });

  it('start / append / record；未知 kind 抛错', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(trajectoryPlugin);
    const traj = harness.services.get<TrajectoryService>('trajectory')!;
    const t = traj.start({ sessionId: 's1', agentId: 'a1' });
    t.append('prompt', { phase: 'apply', content: 'hi' });
    expect(t.replay().map((s) => s.kind)).toEqual(['prompt']);
    traj.record('s1', 'complete', { text: 'ok' });
    expect(traj.forSession('s1')!.replay()).toHaveLength(2);
    expect(traj.latest()?.spans).toHaveLength(2);
    expect(traj.snapshot()?.id).toBe(traj.latest()?.id);
    expect(traj.snapshot(t.id)?.spans).toHaveLength(2);
    expect(() => t.append('nope' as 'prompt')).toThrow(/未知 trajectory kind/);
  });

  it('agent-loop echo：run-start → prompt → complete → tool → prompt → complete → run-end', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(trajectoryPlugin);
    await harness.registry.register(llmPlugin);
    await harness.registry.register(toolsPlugin);
    await harness.registry.register(agentPlugin);
    await harness.registry.register(agentLoopPlugin);
    const loop = harness.services.get<AgentLoopService>('agentLoop')!;
    const traj = harness.services.get<TrajectoryService>('trajectory')!;
    const out = await loop.run({ prompt: 'echo hi', maxSteps: 4, systemPrompt: 'brief' });
    expect(out.steps).toBe(2);
    const snap = traj.forSession(out.sessionId)!.replay();
    const kinds = snap.map((s) => `${s.kind}:${String(s.data.phase ?? '')}`);
    expect(kinds[0]).toBe('run-start:');
    expect(kinds).toContain('prompt:apply');
    expect(kinds.filter((k) => k === 'prompt:assemble').length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k) => k.startsWith('complete:'))).toHaveLength(2);
    expect(snap.some((s) => s.kind === 'tool' && s.data.name === 'echo' && s.data.content === 'hi')).toBe(true);
    expect(kinds.at(-1)).toBe('run-end:');
    expect(snap.some((s) => s.kind === 'http')).toBe(false);
  });
});
