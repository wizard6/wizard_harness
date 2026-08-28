import type { Plugin } from '@wizard-harness/core';
import { WORKSPACE_SERVICE } from '@wizard-harness/contracts';
import type { WorkspaceService } from '@wizard-harness/contracts';
import { createWorkspaceHost, pluginsFromEvents } from './host.js';
import { WORKSPACE_HTML } from './page.js';

/**
 * workspace：个人工作台壳。浏览器页 plugins/workspace/web；Electron 弹窗 + 托盘「Open Workspace」。
 * 后续插件可 inject workspace 后 registerTile。
 * 说明文档：docs/plugins/workspace.html
 */
const host = createWorkspaceHost();

const api: WorkspaceService = {
  snapshot: () => host.snapshot(),
  tiles: () => host.tiles(),
  loaded: () => host.loaded(),
  registerTile: (tile) => host.registerTile(tile),
};

const workspacePlugin: Plugin = {
  manifest: {
    id: 'workspace',
    version: '0.1.0',
    name: '个人工作台',
    description: '工作台 Demo：瓷砖概览、插件架、发布入口。托盘与弹窗可打开。',
    provides: [WORKSPACE_SERVICE],
    config: {},
    tier: 'standard',
  },
  inject: { logger: false },
  api,
  ui: {
    title: '个人工作台',
    hud: true,
    width: 960,
    height: 680,
    rpc: {
      workspace: ['snapshot', 'tiles', 'loaded'],
      webPipeline: ['runPipeline'],
    },
    content: WORKSPACE_HTML,
  },
  register(c) {
    host.bindLoaded(() => pluginsFromEvents(c.events.history()));
    c.logger?.info?.('workspace 工作台已就绪');
  },
};

export default workspacePlugin;
