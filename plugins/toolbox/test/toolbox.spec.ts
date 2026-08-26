import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { TOOLBOX_SERVICE, TOOLS_SERVICE, WORKFLOW_SERVICE } from '@wizard-harness/contracts';
import type { SessionService, ToolboxService, ToolsService, WorkflowService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import workflowPlugin from '../../workflow/src/index.js';
import { parseScripts, toolboxToolName } from '../src/config.js';
import { runScript } from '../src/runner.js';
import toolboxPlugin from '../src/index.js';

async function bootToolbox(root: string, extra: Parameters<typeof createHarness>[0]['config'] = {}) {
  const harness = createHarness({
    bus: createEventBus(),
    config: { toolbox: { cwd: root, scripts: [] }, ...extra },
  });
  await harness.registry.register(sessionPlugin);
  await harness.registry.register(promptContextPlugin);
  await harness.registry.register(toolsPlugin);
  await harness.registry.register(workflowPlugin);
  await harness.registry.register({
    ...toolboxPlugin,
    manifest: { ...toolboxPlugin.manifest, config: { cwd: root, scripts: [] } },
  });
  return harness;
}

describe('toolbox config', () => {
  it('解析 scripts 数组', () => {
    const scripts = parseScripts({
      scripts: [{ name: 'echo_hi', kind: 'shell', command: 'echo hi' }],
    });
    expect(scripts[0].name).toBe('echo_hi');
    expect(toolboxToolName('echo_hi')).toBe('box.echo_hi');
  });

  it('拒绝重复名称', () => {
    expect(() =>
      parseScripts({
        scripts: [
          { name: 'a', kind: 'shell', command: 'true' },
          { name: 'a', kind: 'shell', command: 'true' },
        ],
      }),
    ).toThrow(/重复/);
  });
});

describe('toolbox runner', () => {
  it.skip('open_path 打开工作区内目录（跳过：会唤起系统文件管理器）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-tb-'));
    writeFileSync(join(root, 'note.txt'), 'x');
    const out = await runScript(
      { name: 'open_folder', kind: 'open_path', path: '.' },
      { workspace: root, fallbackCwd: root, args: {} },
    );
    expect(JSON.parse(out).ok).toBe(true);
  });
});

describe('toolbox 插件', () => {
  it('登记 box.* 工具（不执行 open_folder）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-tb-pl-'));
    const harness = await bootToolbox(root);
    const tb = harness.services.get<ToolboxService>(TOOLBOX_SERVICE)!;
    const tools = harness.services.get<ToolsService>(TOOLS_SERVICE)!;
    expect(tb.list().some((s) => s.tool === 'box.open_folder')).toBe(true);
    expect(tools.list().some((t) => t.name === 'box.open_folder')).toBe(true);
  });

  it.skip('box.open_folder 可调用（跳过：会唤起系统文件管理器）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-tb-pl-'));
    const harness = await bootToolbox(root);
    const tools = harness.services.get<ToolsService>(TOOLS_SERVICE)!;
    const r = await tools.call('box.open_folder', { path: '.' });
    expect(r.ok).toBe(true);
  });

  it('workflow 登记 box.* 节点', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-tb-wf-'));
    const harness = await bootToolbox(root);
    const wf = harness.services.get<WorkflowService>(WORKFLOW_SERVICE)!;
    const kinds = wf.listNodes().map((n) => n.kind);
    expect(kinds).toContain('box.open_folder');
  });

  it.skip('session.workspace 作为脚本工作区（跳过：会唤起 open_folder）', async () => {
    const fallback = mkdtempSync(join(tmpdir(), 'wh-tb-ws-'));
    const ws = mkdtempSync(join(tmpdir(), 'wh-tb-wsdir-'));
    writeFileSync(join(ws, 'marker.txt'), 'ok');
    const harness = await bootToolbox(fallback);
    const sessions = harness.services.get<SessionService>('session')!;
    const tools = harness.services.get<ToolsService>(TOOLS_SERVICE)!;
    const s = sessions.start({ workspace: ws });
    const r = await tools.call('box.open_folder', {}, { sessionId: s.id });
    expect(r.ok).toBe(true);
  });

  it.skip('run 供人工 UI 直接执行（跳过：会唤起 open_folder）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-tb-run-'));
    const harness = await bootToolbox(root);
    const tb = harness.services.get<ToolboxService>(TOOLBOX_SERVICE)!;
    const r = await tb.run('open_folder', {}, { workspace: root });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('"ok":true');
  });
});
