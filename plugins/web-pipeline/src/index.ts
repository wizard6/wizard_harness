import type { Plugin } from '@wizard-harness/core';
import { WEB_PIPELINE_SERVICE } from '@wizard-harness/contracts';
import type { WebPipelineService, WorkflowRun, WorkflowService } from '@wizard-harness/contracts';
import { createPipelineHost } from './host.js';
import { createHandlers, pipelineGraph } from './nodes.js';

/**
 * web-pipeline：Web 优先开发流水线（校验 → 部署静态站 → 可选 Nitron 打 APK）。
 * 无 Electron UI；控制台是 plugins/web-pipeline/web，由 obs-api 静态挂载。
 * 说明文档：docs/plugins/web-pipeline.html
 */
const host = createPipelineHost();
let workflow: WorkflowService | undefined;

async function runPipeline(input?: { runNitron?: boolean }): Promise<WorkflowRun> {
  if (!workflow) throw new Error('web-pipeline 未就绪');
  return workflow.run({
    graph: pipelineGraph(),
    input: { runNitron: Boolean(input?.runNitron) },
  });
}

const api: WebPipelineService = {
  pipelineGraph: () => host.pipelineGraph(),
  kinds: () => host.kinds(),
  inspect: () => host.inspect(),
  paths: () => host.paths(),
  runPipeline,
};

const webPipelinePlugin: Plugin = {
  manifest: {
    id: 'web-pipeline',
    version: '0.1.0',
    name: 'Web 开发流水线',
    description: '向 workflow 登记 web.validate / web.deploy / nitron.package，提供 Web 部署图。无窗口。',
    provides: [WEB_PIPELINE_SERVICE],
    config: {},
    tier: 'standard',
  },
  inject: { workflow: true, logger: false },
  api,
  register(c) {
    const wf = c.workflow ?? c.get<WorkflowService>('workflow');
    if (!wf) throw new Error('web-pipeline 需要 workflow');
    workflow = wf;
    const cfg = c.config as { sourceDir?: unknown; deployDir?: unknown };
    host.configure({
      sourceDir: typeof cfg.sourceDir === 'string' ? cfg.sourceDir : undefined,
      deployDir: typeof cfg.deployDir === 'string' ? cfg.deployDir : undefined,
      cwd: process.cwd(),
    });
    const stops = createHandlers(host).map((h) => wf.registerNode(h));
    c.logger?.info?.('web-pipeline 已登记 web.validate / web.deploy / nitron.package');
    c.effect(() => () => {
      for (const stop of stops) stop();
      if (workflow === wf) workflow = undefined;
    });
  },
};

export default webPipelinePlugin;
