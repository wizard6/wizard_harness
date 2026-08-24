import type { Plugin, PluginContext } from '@wizard-harness/core';
import { CODE_EDITOR_SERVICE } from '@wizard-harness/contracts';
import type { CodeEditorService } from '@wizard-harness/contracts';
import { createWorkspaceHost, defaultWorkspaceRoot } from './workspace.js';
import { CODE_EDITOR_HTML } from './page.js';

let impl: ReturnType<typeof createWorkspaceHost> | undefined;
let pendingOpen: string | undefined;

function live() {
  if (!impl) throw new Error('code-editor 未就绪');
  return impl;
}

const api: CodeEditorService = {
  info: () => live().info(),
  read: (rel) => live().read(rel),
  write: (rel, content) => live().write(rel, content),
  takePendingOpen: () => {
    const p = pendingOpen;
    pendingOpen = undefined;
    return p;
  },
  queueOpen: (rel) => {
    pendingOpen = rel.replaceAll('\\', '/');
  },
};

const codeEditorPlugin: Plugin = {
  manifest: {
    id: 'code-editor',
    version: '0.1.0',
    name: '代码编辑器',
    description: '浏览并编辑工作区文本文件。',
    provides: [CODE_EDITOR_SERVICE],
    config: { root: '' },
    tier: 'standard',
  },
  inject: { logger: false },
  api,
  ui: {
    title: '代码编辑器',
    width: 880,
    height: 620,
    rpc: { codeEditor: ['info', 'read', 'write', 'takePendingOpen', 'queueOpen'] },
    content: CODE_EDITOR_HTML,
  },
  register(c: PluginContext) {
    impl = createWorkspaceHost(defaultWorkspaceRoot(c));
    c.logger?.info?.(`code-editor 就绪（${impl.info().root}）`);
    c.effect(() => () => {
      impl = undefined;
      pendingOpen = undefined;
    });
  },
};

export default codeEditorPlugin;
