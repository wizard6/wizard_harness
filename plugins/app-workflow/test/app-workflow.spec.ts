import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { Plugin } from '@wizard-harness/core';
import { APP_WORKFLOW_SERVICE } from '@wizard-harness/contracts';
import type { AppWorkflowService, WorkflowNodesService, WorkflowService } from '@wizard-harness/contracts';
import appWorkflowPlugin from '../src/index.js';
import { APP_WORKFLOW_HTML } from '../src/page.js';

const fakeWf: Plugin = {
  manifest: { id: 'workflow', version: '0.1.0', provides: ['workflow'] },
  api: {
    registerNode() {
      return () => {};
    },
    listNodes() {
      return [];
    },
    async exec() {
      return {};
    },
    async run() {
      return { id: 'r1', status: 'ok', nodes: [] };
    },
    cancel() {},
    get() {
      return undefined;
    },
    latest() {
      return undefined;
    },
  } satisfies WorkflowService,
  register() {},
};

const fakeNodes: Plugin = {
  manifest: { id: 'workflow-nodes', version: '0.1.0', provides: ['workflowNodes'] },
  api: {
    demoGraph() {
      return { id: 'echo-upper', nodes: [] };
    },
    kinds() {
      return [{ kind: 'echo', inputs: ['text'], outputs: ['text'] }];
    },
  } satisfies WorkflowNodesService,
  register() {},
};

describe('app-workflow 插件', () => {
  it('薄壳：inject 调度与节点，不绑 agentLoop', () => {
    expect(APP_WORKFLOW_SERVICE).toBe('appWorkflow');
    expect(appWorkflowPlugin.manifest.provides).toEqual(['appWorkflow']);
    expect(appWorkflowPlugin.inject).toEqual({ workflow: true, workflowNodes: true, logger: false });
    expect(appWorkflowPlugin.ui?.rpc).toEqual({
      workflow: ['run', 'latest', 'get', 'cancel'],
      workflowNodes: ['demoGraph', 'kinds'],
    });
    expect(APP_WORKFLOW_HTML).toContain('id="bar"');
    expect(APP_WORKFLOW_HTML).toContain('id="palette"');
    expect(APP_WORKFLOW_HTML).toContain('id="viewport"');
    expect(APP_WORKFLOW_HTML).toContain('id="canvas"');
    expect(APP_WORKFLOW_HTML).toContain('addNode');
    expect(APP_WORKFLOW_HTML).toContain('connect');
    expect(APP_WORKFLOW_HTML).toContain('workflowNodes');
    expect(APP_WORKFLOW_HTML).toContain('demoGraph');
    expect(APP_WORKFLOW_HTML).not.toContain('appChat');
  });

  it('有 workflow + workflowNodes 即可注册', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(fakeWf);
    await harness.registry.register(fakeNodes);
    await harness.registry.register(appWorkflowPlugin);
    const svc = harness.services.get<AppWorkflowService>('appWorkflow');
    expect(svc?.title).toBe('Workflow demo');
  });
});
