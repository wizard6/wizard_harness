import { resolve } from 'node:path';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { SKILLS_SERVICE } from '@wizard-harness/contracts';
import type { PromptContextService, SkillsService, ToolsService } from '@wizard-harness/contracts';
import { createSkillsHost, type SkillsHost } from './host.js';
import { SKILLS_HTML } from './page.js';

let impl: SkillsHost | undefined;
let syncAlways: (() => void) | undefined;

function live(): SkillsHost {
  if (!impl) throw new Error('skills 未就绪');
  return impl;
}

const api: SkillsService = {
  snapshot: () => live().snapshot(),
  list: () => live().list(),
  get: (id) => live().get(id),
  scan: () => live().scan(),
  setEnabled: (id, enabled) => live().setEnabled(id, enabled),
  setAlwaysApply: (id, alwaysApply) => live().setAlwaysApply(id, alwaysApply),
};

function workspaceOf(c: PluginContext): string {
  const fromCfg = String(c.config.workspace ?? '').trim();
  if (fromCfg) return resolve(fromCfg);
  const fromEnv = String(process.env.WH_WORKSPACE ?? '').trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(process.cwd());
}

function scanDirsOf(c: PluginContext): string[] | undefined {
  const raw = c.config.scanDirs;
  if (!Array.isArray(raw) || !raw.length) return undefined;
  return raw.map((d) => resolve(String(d)));
}

function wirePrompt(c: PluginContext, host: SkillsHost): () => void {
  const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
  if (!prompts) throw new Error('skills 需要 prompt-context');
  const stops: Array<() => void> = [];

  const catalog = prompts.section({
    name: 'skills:catalog',
    order: 72,
    text: () => host.renderCatalog(),
  });
  stops.push(catalog);

  const sync = () => {
    while (stops.length > 1) stops.pop()!();
    for (const row of host.renderAlwaysApply()) {
      const remove = prompts.section({
        name: `skill:${row.id}`,
        order: 73,
        text: row.text,
      });
      stops.push(remove);
    }
  };
  sync();

  c.effect(() => () => {
    for (const stop of stops) stop();
  });

  return sync;
}

function wireTools(c: PluginContext) {
  const tools = c.tools ?? c.get<ToolsService>('tools');
  if (!tools) return;
  tools.register({
    name: 'skill_list',
    description: '列出已发现的 Agent Skills（id、名称、简介、是否启用）。无参数。',
    handler: () => ({ skills: live().list() }),
  });
  tools.register({
    name: 'skill_read',
    description: '读取指定技能的 SKILL.md 全文。args.id 必填（skill_list 返回的 id）。',
    handler: (args) => {
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error('skill_read 需要 args.id');
      const skill = live().get(id);
      if (!skill) throw new Error(`技能不存在：${id}`);
      if (!skill.enabled) throw new Error(`技能已停用：${id}`);
      return { id: skill.id, name: skill.name, body: skill.body, path: skill.path };
    },
  });
}

const skillsPlugin: Plugin = {
  manifest: {
    id: 'skills',
    version: '0.1.0',
    name: 'Agent Skills',
    description:
      '发现 Cursor/DSH 风格 SKILL.md，注入 skills 目录到 prompt-context，并提供 skill_list / skill_read 工具。',
    provides: [SKILLS_SERVICE],
    config: {
      scanDirs: [],
      workspace: '',
    },
    tier: 'standard',
  },
  inject: { promptContext: true, logger: false, tools: false },
  api,
  ui: {
    title: 'Skills',
    width: 720,
    height: 560,
    rpc: {
      skills: ['snapshot', 'list', 'get', 'scan', 'setEnabled', 'setAlwaysApply'],
    },
    content: SKILLS_HTML,
  },
  register(c) {
    let host!: SkillsHost;
    host = createSkillsHost({
      scanDirs: scanDirsOf(c),
      workspace: workspaceOf(c),
      onChange: () => syncAlways?.(),
    });
    impl = host;
    syncAlways = wirePrompt(c, host);
    c.logger?.info?.(`skills 插件就绪（扫描 ${host.scanDirs.length} 个目录，发现 ${host.list().length} 项）`);
    c.effect(() => () => {
      impl = undefined;
      syncAlways = undefined;
    });
  },
  onStart(c) {
    wireTools(c);
  },
};

export default skillsPlugin;
