import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import {
  WORKFLOW_AGENT_KIND,
  WORKFLOW_SERVICE,
  workflowToolName,
} from '@wizard-harness/contracts';
import type { AgentLoopService, WorkflowNodeHandler, WorkflowNodeRecord, WorkflowService } from '@wizard-harness/contracts';
import workflowPlugin from '../src/index.js';
import { createWorkflowHost } from '../src/host.js';
import { scheduleLinear } from '../src/schedule.js';

const constHandler: WorkflowNodeHandler = {
  kind: 'const',
  execute(_node, inputs) {
    return Promise.resolve({ ...inputs });
  },
};

describe('workflow 插件', () => {
  it('服务名：调度器不内置节点、没有 Demo 窗口', () => {
    expect(WORKFLOW_SERVICE).toBe('workflow');
    expect(WORKFLOW_AGENT_KIND).toBe('agent');
    expect(workflowToolName('echo')).toBe('wf.echo');
    expect(workflowPlugin.manifest.provides).toEqual(['workflow']);
    expect(workflowPlugin.inject).toEqual({
      tools: false,
      trajectory: false,
      logger: false,
      agent: false,
      agentLoop: false,
    });
    expect(workflowPlugin.ui).toBeUndefined();
  });

  it('scheduleLinear：按线取端口，不认识具体 kind', async () => {
    const recs: WorkflowNodeRecord[] = [];
    const status = await scheduleLinear(
      {
        nodes: [
          { id: 'a', kind: 'const', params: { x: 1 } },
          { id: 'b', kind: 'const', in: { y: { from: 'node', node: 'a', key: 'x' } } },
        ],
      },
      {},
      new Map([['const', constHandler]]),
      {},
      { onNode: (r) => recs.push(r) },
    );
    expect(status).toBe('ok');
    expect(recs[1]?.outputs).toMatchObject({ y: 1 });
  });

  it('run 需要 graph；节点由 registerNode 提供', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(workflowPlugin);
    const wf = harness.services.get<WorkflowService>('workflow')!;
    await expect(wf.run({})).rejects.toThrow(/graph/);
    wf.registerNode(constHandler);
    const run = await wf.run({
      graph: { id: 't', nodes: [{ id: 'a', kind: 'const', params: { n: 2 } }] },
    });
    expect(run.status).toBe('ok');
    expect(run.nodes[0]?.outputs.n).toBe(2);
    expect(wf.latest()?.id).toBe(run.id);
  });

  it('exec 单节点不写 latest；asTool 只声明工具名', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(workflowPlugin);
    const wf = harness.services.get<WorkflowService>('workflow')!;
    wf.registerNode({
      kind: 'echo',
      asTool: { description: 'echo text' },
      execute(_n, inputs) {
        return Promise.resolve({ text: inputs.text });
      },
    });
    const listed = wf.listNodes();
    expect(listed).toEqual([
      { kind: 'echo', ports: undefined, asTool: { name: 'wf.echo', description: 'echo text' } },
    ]);
    const out = await wf.exec('echo', { text: 'hi' });
    expect(out).toEqual({ text: 'hi' });
    expect(wf.latest()).toBeUndefined();
  });

  it('节点 ctx 可选用 agentLoop；kind=agent 不内置', async () => {
    const loop: AgentLoopService = {
      async run(opts) {
        return { agentId: opts?.agentId ?? 'a', sessionId: 's', text: `got:${opts?.prompt}`, steps: 1 };
      },
      cancel() {},
    };
    const host = createWorkflowHost({
      agentLoop: loop,
      emit() {},
    });
    host.registerNode({
      kind: WORKFLOW_AGENT_KIND,
      async execute(node, inputs, ctx) {
        if (!ctx.agentLoop) throw new Error('missing agentLoop');
        const r = await ctx.agentLoop.run({
          agentId: node.agentId,
          prompt: String(inputs.prompt ?? ''),
        });
        return { text: r.text, agentId: r.agentId, sessionId: r.sessionId };
      },
    });
    const out = await host.exec(WORKFLOW_AGENT_KIND, { prompt: 'x' }, { agentId: 'a1' });
    expect(out).toEqual({ text: 'got:x', agentId: 'a1', sessionId: 's' });
  });
});
