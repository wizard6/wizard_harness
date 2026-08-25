import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { TOOLBOX_SERVICE } from '@wizard-harness/contracts';
import type {
  PromptContextService,
  SessionService,
  ToolboxRunResult,
  ToolboxScriptInfo,
  ToolboxService,
  ToolCallContext,
  ToolsService,
  WorkflowNodeHandler,
  WorkflowService,
} from '@wizard-harness/contracts';
import {
  DEFAULT_SCRIPTS,
  parseScripts,
  toolboxToolName,
  toolboxWorkflowKind,
  type ToolboxScriptConfig,
} from './config.js';
import { TOOLBOX_HTML } from './page.js';
import { runScript } from './runner.js';

let impl: ToolboxService | undefined;
let scriptsByName = new Map<string, ToolboxScriptConfig>();
let fallbackCwd = resolve(process.cwd());

function live(): ToolboxService {
  if (!impl) throw new Error('toolbox 未就绪');
  return impl;
}

function defaultCwd(ctx: PluginContext): string {
  const fromCfg = String(ctx.config.cwd ?? '').trim();
  if (fromCfg) return resolve(fromCfg);
  const fromEnv = String(process.env.WH_WORKSPACE ?? '').trim();
  if (fromEnv) return resolve(fromEnv);
  if (process.env.VITEST || process.env.VITEST_WORKER_ID) {
    return join(tmpdir(), 'wh-toolbox-test');
  }
  return resolve(process.cwd());
}

function toInfo(script: ToolboxScriptConfig): ToolboxScriptInfo {
  return {
    name: script.name,
    label: script.label?.trim() || script.name,
    tool: toolboxToolName(script.name),
    kind: script.kind,
    description: script.description,
    workflowKind: toolboxWorkflowKind(script.name),
    params: (script.params ?? []).map((p) => ({ ...p })),
  };
}

function loadScripts(ctx: PluginContext): ToolboxScriptConfig[] {
  const parsed = parseScripts(ctx.config as Record<string, unknown>);
  return parsed.length ? parsed : DEFAULT_SCRIPTS;
}

function workspaceOf(ctx: PluginContext, fallback: string, call?: ToolCallContext): string {
  const sessions = ctx.session ?? ctx.get<SessionService>('session');
  const ws = call?.sessionId ? sessions?.get(call.sessionId)?.workspace : undefined;
  return resolve(ws?.trim() || fallback);
}

async function executeScript(
  script: ToolboxScriptConfig,
  args: Record<string, unknown>,
  workspace: string,
): Promise<ToolboxRunResult> {
  try {
    const content = await runScript(script, { workspace, fallbackCwd: workspace, args });
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function wireToolbox(ctx: PluginContext, fallback: string, scripts: ToolboxScriptConfig[]) {
  const tools = ctx.tools ?? ctx.get<ToolsService>('tools');
  if (!tools) throw new Error('toolbox 需要 tools');
  const wf = ctx.workflow ?? ctx.get<WorkflowService>('workflow');
  const stops: Array<() => void> = [];

  const runCtx = (args: Record<string, unknown>, call?: ToolCallContext) => ({
    workspace: workspaceOf(ctx, fallback, call),
    fallbackCwd: fallback,
    args,
  });

  for (const script of scripts) {
    const tool = toolboxToolName(script.name);
    tools.register({
      name: tool,
      description: script.description ?? `toolbox 脚本 ${script.name}`,
      handler: (args, call) => runScript(script, runCtx(args, call)),
    });

    if (wf) {
      const handler: WorkflowNodeHandler = {
        kind: toolboxWorkflowKind(script.name),
        ports: { inputs: [], outputs: ['content'] },
        asTool: { name: tool, description: script.description },
        execute(_node, inputs) {
          return runScript(script, runCtx(inputs as Record<string, unknown>)).then((content) => ({
            content,
          }));
        },
      };
      stops.push(wf.registerNode(handler));
    }
  }

  return () => {
    for (const stop of stops) stop();
  };
}

const api: ToolboxService = {
  info: () => live().info(),
  list: () => live().list(),
  run: (name, args, opts) => live().run(name, args, opts),
};

const toolboxPlugin: Plugin = {
  manifest: {
    id: 'toolbox',
    version: '0.1.0',
    name: '工具盒子',
    description: '配置驱动的简易脚本：人可点按执行，agent 可走 box.* 工具。',
    provides: [TOOLBOX_SERVICE],
    config: {
      cwd: '',
      scripts: DEFAULT_SCRIPTS,
    },
    tier: 'standard',
  },
  inject: { tools: true, workflow: true, session: false, promptContext: false, logger: false },
  api,
  ui: {
    title: '工具盒子',
    width: 620,
    height: 560,
    rpc: { toolbox: ['info', 'list', 'run'] },
    content: TOOLBOX_HTML,
  },
  register(c) {
    fallbackCwd = defaultCwd(c);
    const scripts = loadScripts(c);
    scriptsByName = new Map(scripts.map((s) => [s.name, s]));
    const infos = scripts.map(toInfo);
    impl = {
      info: () => ({ cwd: fallbackCwd, scripts: infos }),
      list: () => infos,
      run: async (name, args = {}, opts = {}) => {
        const script = scriptsByName.get(String(name).trim());
        if (!script) return { ok: false, error: `未知脚本：${name}` };
        const ws = String(opts.workspace ?? '').trim();
        const workspace = resolve(ws || fallbackCwd);
        return executeScript(script, args, workspace);
      },
    };
    const stopWorkflow = wireToolbox(c, fallbackCwd, scripts);
    const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
    if (prompts) {
      prompts.section({
        name: 'tool:toolbox',
        order: 70,
        text:
          `工具盒子（box.*）：在 session.workspace 执行配置脚本。默认 cwd ${fallbackCwd}。` +
          '人可在「工具盒子」弹窗点按；agent 用 box.open_folder、box.git_push 等。',
      });
    }
    c.logger?.info?.(`toolbox 就绪（${scripts.length} 个脚本，cwd ${fallbackCwd}）`);
    c.effect(() => () => {
      stopWorkflow();
      impl = undefined;
      scriptsByName = new Map();
    });
  },
};

export default toolboxPlugin;
