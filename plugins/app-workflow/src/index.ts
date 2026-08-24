import type { Plugin } from '@wizard-harness/core';
import { APP_WORKFLOW_SERVICE } from '@wizard-harness/contracts';
import type { AppWorkflowService } from '@wizard-harness/contracts';
import { APP_WORKFLOW_HTML } from './page.js';

/**
 * app-workflow：工作流 Demo 薄壳窗口。只调 workflow.run，不拥有调度与节点。
 * 说明文档：docs/plugins/app-workflow.html
 */
const api: AppWorkflowService = { title: 'Workflow demo' };

const appWorkflowPlugin: Plugin = {
  manifest: {
    id: 'app-workflow',
    version: '0.1.0',
    name: 'Workflow demo',
    description: '工作流 Demo 画布。可添加节点、拖端口连线；经 ui.rpc 调 workflowNodes 与 workflow.run。',
    provides: [APP_WORKFLOW_SERVICE],
    config: {},
    tier: 'standard',
  },
  inject: { workflow: true, workflowNodes: true, logger: false },
  api,
  ui: {
    title: 'Workflow demo',
    width: 1100,
    height: 720,
    rpc: {
      workflow: ['run', 'latest', 'get', 'cancel'],
      workflowNodes: ['demoGraph', 'kinds'],
    },
    content: APP_WORKFLOW_HTML,
  },
  register(c) {
    c.logger?.info?.('app-workflow 插件就绪（工作流 Demo）');
  },
};

export default appWorkflowPlugin;
