import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { SANDBOX_SERVICE } from '@wizard-harness/contracts';
import type { SandboxService, ToolsService } from '@wizard-harness/contracts';
import { createSandboxHost } from './jail.js';
import { SANDBOX_HTML } from './page.js';

/**
 * sandbox 插件：工作区路径沙箱。不是插件进程隔离。
 * 说明文档：docs/plugins/sandbox.html
 */
let impl: SandboxService | undefined;

function live(): SandboxService {
  if (!impl) throw new Error('sandbox 未就绪');
  return impl;
}

const api: SandboxService = {
  info: () => live().info(),
  resolve: (rel) => live().resolve(rel),
  list: (rel) => live().list(rel),
  read: (rel) => live().read(rel),
  write: (rel, content) => live().write(rel, content),
};

function defaultRoot(ctx: PluginContext): string {
  const fromCfg = String(ctx.config.root ?? '').trim();
  if (fromCfg) return fromCfg;
  if (process.env.VITEST || process.env.VITEST_WORKER_ID) {
    return join(homedir(), '.wizard-harness', 'sandbox-test');
  }
  const fromEnv = String(process.env.WH_SANDBOX_DIR ?? '').trim();
  if (fromEnv) return fromEnv;
  return join(process.env.WH_HOME || join(homedir(), '.wizard-harness'), 'sandbox');
}

function wireTools(ctx: PluginContext, box: SandboxService) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) return;
  tools.register({
    name: 'sandbox_ls',
    description: '列出沙箱内某目录。args.path 默认 .',
    handler: (args) => box.list(String(args.path ?? '.')),
  });
  tools.register({
    name: 'sandbox_read',
    description: '读取沙箱内文本文件。args.path 相对 root',
    handler: (args) => box.read(String(args.path ?? '')),
  });
  tools.register({
    name: 'sandbox_write',
    description: '写入沙箱内文本文件。args.path + args.content',
    handler: (args) => {
      box.write(String(args.path ?? ''), String(args.content ?? ''));
      return { ok: true, path: args.path };
    },
  });
}

const sandboxPlugin: Plugin = {
  manifest: {
    id: 'sandbox',
    version: '0.1.0',
    name: '工作区沙箱',
    description: '文件读写不出 root。经 tools 登记 sandbox_ls / read / write。',
    provides: [SANDBOX_SERVICE],
    config: { root: '' },
    tier: 'standard',
  },
  inject: { tools: false, logger: false },
  api,
  ui: {
    title: '工作区沙箱',
    width: 480,
    height: 420,
    rpc: { sandbox: ['info', 'list'] },
    content: SANDBOX_HTML,
  },
  register(c) {
    impl = createSandboxHost(defaultRoot(c));
    wireTools(c, impl);
    c.logger?.info?.(`sandbox 插件就绪（${impl.info().root}）`);
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default sandboxPlugin;
