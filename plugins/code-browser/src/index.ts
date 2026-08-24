import type { Plugin, PluginContext } from '@wizard-harness/core';
import { CODE_BROWSER_SERVICE } from '@wizard-harness/contracts';
import type { CodeBrowserService } from '@wizard-harness/contracts';
import { createReadonlyWorkspace, defaultWorkspaceRoot } from './workspace.js';
import { CODE_BROWSER_HTML } from './page.js';

let impl: ReturnType<typeof createReadonlyWorkspace> | undefined;
let pendingOpen: string | undefined;

function live() {
  if (!impl) throw new Error('code-browser 未就绪');
  return impl;
}

const api: CodeBrowserService = {
  info: () => live().info(),
  read: (rel) => live().read(rel),
  queueOpen: (rel) => {
    pendingOpen = rel.replaceAll('\\', '/');
  },
  takePendingOpen: () => {
    const p = pendingOpen;
    pendingOpen = undefined;
    return p;
  },
};

const codeBrowserPlugin: Plugin = {
  manifest: {
    id: 'code-browser',
    version: '0.1.0',
    name: '代码浏览器',
    description: '只读浏览工作区源码；编辑请用 code-editor。',
    provides: [CODE_BROWSER_SERVICE],
    config: { root: '' },
    tier: 'standard',
  },
  inject: { logger: false },
  api,
  ui: {
    title: '代码浏览器',
    width: 900,
    height: 640,
    rpc: { codeBrowser: ['info', 'read', 'takePendingOpen', 'queueOpen'] },
    content: CODE_BROWSER_HTML,
  },
  register(c: PluginContext) {
    impl = createReadonlyWorkspace(defaultWorkspaceRoot(c));
    c.logger?.info?.(`code-browser 就绪（${impl.info().root}）`);
    c.effect(() => () => {
      impl = undefined;
      pendingOpen = undefined;
    });
  },
};

export default codeBrowserPlugin;
