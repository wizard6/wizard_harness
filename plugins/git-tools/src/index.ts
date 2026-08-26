import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { PLUGIN_TAG_TOOLKIT } from '@wizard-harness/core';
import type {
  GitToolsService,
  PromptContextService,
  SessionService,
  ToolCallContext,
  ToolsService,
} from '@wizard-harness/contracts';
import { createGitHost, GIT_ACTIONS, GIT_TOOL_NAMES } from './git-host.js';
import { GIT_TOOLS_SERVICE } from './names.js';
import { GIT_TOOLS_HTML } from './page.js';
import { findGitRoot, probeGit } from './exec.js';

/**
 * git-tools：本地 git 工具套件。对齐 dev-tools：tools 登记 + session.workspace 边界。
 */
let fallbackRoot = resolve(process.cwd());
let hostOpts: { allowPushToMain: boolean; timeoutMs: number } = {
  allowPushToMain: false,
  timeoutMs: 60_000,
};

function rootOf(override?: string): string {
  const trimmed = override?.trim();
  return trimmed ? resolve(trimmed) : fallbackRoot;
}

function hostOf(root?: string) {
  return createGitHost(rootOf(root), hostOpts);
}

const api: GitToolsService = {
  probe: () => probeGit(),
  info: (root) => hostOf(root).info(),
  infoAsync: (root) => hostOf(root).infoAsync(),
  run: (actionId, opts) => hostOf(opts?.root).run(actionId, opts?.args),
};

function defaultRoot(ctx: PluginContext): string {
  const fromCfg = String(ctx.config.root ?? '').trim();
  if (fromCfg) return resolve(fromCfg);
  const fromEnvRoot = String(process.env.WH_WORKSPACE_ROOT ?? '').trim();
  if (fromEnvRoot) return resolve(fromEnvRoot);
  const fromEnv = String(process.env.WH_WORKSPACE ?? '').trim();
  if (fromEnv) return resolve(fromEnv);
  if (process.env.VITEST || process.env.VITEST_WORKER_ID) {
    return join(tmpdir(), 'wh-git-tools-test');
  }
  return findGitRoot(process.cwd()) ?? resolve(process.cwd());
}

function wireTools(ctx: PluginContext, fallback: string) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) throw new Error('git-tools 需要 tools');
  const sessionHostOf = (call?: ToolCallContext) => {
    const sessions = ctx.session ?? ctx.get<SessionService>('session');
    const ws = call?.sessionId ? sessions?.get(call.sessionId)?.workspace : undefined;
    return createGitHost(resolve(ws?.trim() || fallback), hostOpts);
  };

  for (const action of GIT_ACTIONS) {
    tools.register({
      name: action.tool,
      description: action.description,
      handler: async (args, call) => {
        const host = sessionHostOf(call);
        const r = await host.run(action.id, args);
        if (!r.ok) throw new Error(r.stderr || r.stdout || `git 退出码 ${r.code}`);
        return r.stdout || r.stderr || 'ok';
      },
    });
  }
}

const gitToolsPlugin: Plugin = {
  manifest: {
    id: 'git-tools',
    version: '0.1.0',
    name: 'Git 工具',
    description: '探测本地 git，向 tools 登记 git.status / diff / pull / commit / push 等；工作区不出 root。',
    provides: [GIT_TOOLS_SERVICE],
    config: {
      root: '',
      allowPushToMain: false,
      timeoutMs: 60_000,
    },
    tier: 'standard',
    tags: [PLUGIN_TAG_TOOLKIT],
  },
  inject: { tools: true, logger: false, promptContext: false, session: false },
  api,
  ui: {
    title: 'Git 工具',
    width: 680,
    height: 580,
    rpc: {
      gitTools: ['probe', 'info', 'infoAsync', 'run'],
    },
    content: GIT_TOOLS_HTML,
  },
  register(c) {
    fallbackRoot = resolve(defaultRoot(c));
    hostOpts = {
      allowPushToMain: Boolean(c.config.allowPushToMain),
      timeoutMs: Number(c.config.timeoutMs ?? 60_000),
    };
    wireTools(c, fallbackRoot);
    const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
    if (prompts) {
      const probe = probeGit();
      prompts.section({
        name: 'tool:git-tools',
        order: 68,
        text: probe.available
          ? `Git 工具（git.*）：在 session.workspace 执行只读/写/远端 git 操作。` +
            `默认禁止推送到 main/master。fallback root ${fallbackRoot}。工具：${GIT_TOOL_NAMES.join('、')}。`
          : `Git 工具：${probe.hint ?? 'git 未安装'}`,
      });
    }
    const probe = probeGit();
    const label = probe.available ? probe.version ?? 'ok' : '不可用';
    c.logger?.info?.(`git-tools 就绪（git ${label}，root ${fallbackRoot}）`);
  },
};

export default gitToolsPlugin;
