import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { WORKFLOW_NODES_SERVICE } from '@wizard-harness/contracts';
import type { WorkflowNodesService, WorkflowService } from '@wizard-harness/contracts';
import workflowPlugin from '../../workflow/src/index.js';
import workflowNodesPlugin from '../src/index.js';
import { demoGraph, kinds } from '../src/handlers.js';

describe('workflow-nodes 插件', () => {
  it('服务名 + 必选 workflow', () => {
    expect(WORKFLOW_NODES_SERVICE).toBe('workflowNodes');
    expect(workflowNodesPlugin.manifest.provides).toEqual(['workflowNodes']);
    expect(workflowNodesPlugin.inject).toEqual({ workflow: true, logger: false });
    expect(demoGraph().nodes.map((n) => n.kind)).toEqual(['echo', 'upper']);
    expect(kinds().map((k) => k.kind)).toEqual(['echo', 'upper']);
  });

  it('登记两节点后按 demoGraph 跑通', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(workflowPlugin);
    await harness.registry.register(workflowNodesPlugin);
    const nodes = harness.services.get<WorkflowNodesService>('workflowNodes')!;
    const wf = harness.services.get<WorkflowService>('workflow')!;
    const run = await wf.run({ graph: nodes.demoGraph(), input: { text: 'hello' } });
    expect(run.status).toBe('ok');
    expect(run.nodes).toHaveLength(2);
    expect(run.nodes[0]?.outputs.text).toBe('hello');
    expect(run.nodes[1]?.outputs.text).toBe('HELLO');
    expect(nodes.kinds().map((k) => k.kind)).toEqual(['echo', 'upper']);
  });
});
