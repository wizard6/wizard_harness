import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { DEV_TOOLS_SERVICE } from '@wizard-harness/contracts';
import type {
  DevToolsService,
  PromptContextService,
  SessionService,
  ToolCallContext,
  ToolsService,
} from '@wizard-harness/contracts';
import { DEV_TOOLS_HTML } from './page.js';
import { DEV_TOOL_NAMES, createWorkspaceHost } from './workspace.js';

/**
 * dev-tools：本地编程工具套件。文件读写不出工作区 root；bash cwd 为 root。
 * 说明文档：docs/plugins/dev-tools.html
 */
let impl: DevToolsService | undefined;

function live(): DevToolsService {
  if (!impl) throw new Error('dev-tools 未就绪');
  return impl;
}

const api: DevToolsService = {
  info: () => live().info(),
};

function defaultRoot(ctx: PluginContext): string {
  const fromCfg = String(ctx.config.root ?? '').trim();
  if (fromCfg) return fromCfg;
  const fromEnv = String(process.env.WH_WORKSPACE ?? '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.VITEST || process.env.VITEST_WORKER_ID) {
    return join(tmpdir(), 'wh-dev-tools-test');
  }
  return process.cwd();
}

function wireTools(ctx: PluginContext, fallback: string) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) throw new Error('dev-tools 需要 tools');
  const hostOf = (call?: ToolCallContext) => {
    const sessions = ctx.session ?? ctx.get<SessionService>('session');
    const ws = call?.sessionId ? sessions?.get(call.sessionId)?.workspace : undefined;
    return createWorkspaceHost(resolve(ws || fallback));
  };
  tools.register({
    name: 'bash',
    description:
      '在工作区执行 shell 命令。args.command 必填；可选 args.timeoutMs（默认 30000，上限 120000）。cwd 为当前 session.workspace（未设则用默认 root）。返回 stdout/stderr/code。命令本身不是路径笼子。',
    handler: (args, call) => hostOf(call).bash(args),
  });
  tools.register({
    name: 'read_file',
    description:
      '读取工作区内文本文件，带行号。args.path 相对当前 session.workspace；可选 args.offset（从 1 起的行）、args.limit。',
    handler: (args, call) => hostOf(call).readFile(args),
  });
  tools.register({
    name: 'write_file',
    description: '写入工作区内文本文件（覆盖）。args.path + args.content。自动建父目录。root 为当前 session.workspace。',
    handler: (args, call) => hostOf(call).writeFile(args),
  });
  tools.register({
    name: 'str_replace',
    description:
      '精确替换文件片段。args.path + args.old_string + args.new_string；可选 args.replace_all。默认 old_string 必须只出现一次。',
    handler: (args, call) => hostOf(call).strReplace(args),
  });
  tools.register({
    name: 'grep',
    description:
      '在工作区内用正则搜文本。args.pattern 必填；可选 args.path（目录或文件）、args.glob（如 **/*.ts）。跳过 node_modules/.git/dist。',
    handler: (args, call) => hostOf(call).grep(args),
  });
  tools.register({
    name: 'glob',
    description: '按 glob 列工作区文件。args.pattern 必填（如 **/*.ts）；可选 args.path 起始目录。',
    handler: (args, call) => hostOf(call).glob(args),
  });
}

const devToolsPlugin: Plugin = {
  manifest: {
    id: 'dev-tools',
    version: '0.1.0',
    name: '本地编程工具套件',
    description: '向 tools 登记 bash / read_file / write_file / str_replace / grep / glob。文件不出工作区 root。',
    provides: [DEV_TOOLS_SERVICE],
    config: { root: '' },
    tier: 'standard',
  },
  inject: { tools: true, logger: false, promptContext: false, session: false },
  api,
  ui: {
    title: '本地编程工具',
    width: 480,
    height: 380,
    rpc: { devTools: ['info'] },
    content: DEV_TOOLS_HTML,
  },
  register(c) {
    const fallback = resolve(defaultRoot(c));
    impl = {
      info: () => ({ root: fallback, tools: [...DEV_TOOL_NAMES] }),
    };
    wireTools(c, fallback);
    const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
    if (prompts) {
      prompts.section({
        name: 'tool:dev-tools',
        order: 80,
        text:
          `本地编程：未设 session.workspace 时用 ${fallback}。` +
          '文件工具 read_file / write_file / str_replace / grep / glob 不能越出该会话工作区。' +
          'bash 的 cwd 是该工作区，可跑测试/构建；命令本身不是路径笼子。',
      });
    }
    c.logger?.info?.(`dev-tools 插件就绪（fallback ${fallback}）`);
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default devToolsPlugin;
