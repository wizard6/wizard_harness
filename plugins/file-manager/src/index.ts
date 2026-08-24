import type { Plugin, PluginContext } from '@wizard-harness/core';
import { FILE_MANAGER_SERVICE } from '@wizard-harness/contracts';
import type { FileManagerService } from '@wizard-harness/contracts';
import { createWorkspaceHost, defaultWorkspaceRoot } from './workspace.js';
import { FILE_MANAGER_HTML } from './page.js';

let impl: ReturnType<typeof createWorkspaceHost> | undefined;

function live() {
  if (!impl) throw new Error('file-manager 未就绪');
  return impl;
}

const api: FileManagerService = {
  info: () => live().info(),
  list: (rel) => live().list(rel),
};

const fileManagerPlugin: Plugin = {
  manifest: {
    id: 'file-manager',
    version: '0.1.0',
    name: '文件管理器',
    description: '浏览工作区目录树；文本文件可打开代码编辑器。',
    provides: [FILE_MANAGER_SERVICE],
    config: { root: '' },
    tier: 'standard',
  },
  inject: { logger: false },
  api,
  ui: {
    title: '文件管理器',
    width: 520,
    height: 560,
    rpc: { fileManager: ['info', 'list'] },
    content: FILE_MANAGER_HTML,
  },
  register(c: PluginContext) {
    impl = createWorkspaceHost(defaultWorkspaceRoot(c));
    c.logger?.info?.(`file-manager 就绪（${impl.info().root}）`);
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default fileManagerPlugin;
