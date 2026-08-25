import type { Plugin, PluginContext } from '@wizard-harness/core';
import type { CodeEditorOpenTarget, CodeEditorService } from '@wizard-harness/contracts';
import { CODE_EDITOR_SERVICE } from '@wizard-harness/contracts';
import { createWorkspaceHost, defaultWorkspaceRoot } from './workspace.js';
import { CODE_EDITOR_HTML } from './page.js';

let impl: ReturnType<typeof createWorkspaceHost> | undefined;
let pendingOpen: CodeEditorOpenTarget | undefined;

function live() {
  if (!impl) throw new Error('code-editor 未就绪');
  return impl;
}

function normTarget(raw: string | CodeEditorOpenTarget): CodeEditorOpenTarget {
  if (typeof raw === 'string') return { path: raw.replaceAll('\\', '/') };
  const path = String(raw.path ?? '').replaceAll('\\', '/');
  const startLine = raw.startLine !== undefined ? Math.max(1, Number(raw.startLine)) : undefined;
  const endLine = raw.endLine !== undefined ? Math.max(1, Number(raw.endLine)) : undefined;
  if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
    throw new Error('endLine 不能小于 startLine');
  }
  return { path, startLine, endLine };
}

const api: CodeEditorService = {
  info: () => live().info(),
  read: (rel) => live().read(rel),
  write: (rel, content) => live().write(rel, content),
  patch: (rel, startLine, endLine, content) => live().patch(rel, startLine, endLine, content),
  takePendingOpen: () => {
    const p = pendingOpen;
    pendingOpen = undefined;
    return p;
  },
  queueOpen: (target) => {
    pendingOpen = normTarget(target);
  },
};

const codeEditorPlugin: Plugin = {
  manifest: {
    id: 'code-editor',
    version: '0.1.0',
    name: '代码编辑器',
    description: '浏览并编辑工作区文本文件；支持局部行范围编辑写回。',
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
    rpc: { codeEditor: ['info', 'read', 'write', 'patch', 'takePendingOpen', 'queueOpen'] },
    content: CODE_EDITOR_HTML,
  },
  register(c: PluginContext) {
    impl = createWorkspaceHost(defaultWorkspaceRoot(c), (info) => {
      c.emit({ action: 'code-editor/changed', target: info.path, payload: info });
    });
    c.logger?.info?.(`code-editor 就绪（${impl.info().root}）`);
    c.effect(() => () => {
      impl = undefined;
      pendingOpen = undefined;
    });
  },
};

export default codeEditorPlugin;
