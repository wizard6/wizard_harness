import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { WORKSPACE_SERVICE } from '@wizard-harness/contracts';
import type { WorkspaceService } from '@wizard-harness/contracts';
import workspacePlugin from '../src/index.js';
import { createWorkspaceHost, pluginsFromEvents } from '../src/host.js';
import { WORKSPACE_HTML } from '../src/page.js';

describe('workspace 插件', () => {
  it('服务名 + 托盘弹窗 ui.rpc', () => {
    expect(WORKSPACE_SERVICE).toBe('workspace');
    expect(workspacePlugin.manifest.provides).toEqual(['workspace']);
    expect(workspacePlugin.ui?.title).toBe('个人工作台');
    expect(workspacePlugin.ui?.hud).toBe(true);
    expect(workspacePlugin.ui?.rpc).toEqual({
      workspace: ['snapshot', 'tiles', 'loaded'],
      webPipeline: ['runPipeline'],
    });
    expect(WORKSPACE_HTML).toContain('id="tiles"');
    expect(WORKSPACE_HTML).toContain('workspace');
    expect(WORKSPACE_HTML).toContain('loaded');
    expect(WORKSPACE_HTML).toContain('data-hud-hit');
    expect(WORKSPACE_HTML).toContain('id="hud-close"');
  });

  it('种子瓷砖含概览 / 插件架 / 发布与空位', () => {
    const ids = createWorkspaceHost()
      .tiles()
      .map((t) => t.id);
    expect(ids).toEqual(['today', 'plugins', 'publish', 'notes', 'tasks']);
  });

  it('registerTile 可撤销', () => {
    const host = createWorkspaceHost();
    const stop = host.registerTile({ id: 'extra', title: '额外', blurb: 'demo', kind: 'soon' });
    expect(host.tiles().some((t) => t.id === 'extra')).toBe(true);
    stop();
    expect(host.tiles().some((t) => t.id === 'extra')).toBe(false);
  });

  it('pluginsFromEvents 按 register/unregister 还原', () => {
    const list = pluginsFromEvents([
      { action: 'register', target: 'a' },
      { action: 'register', target: 'b' },
      { action: 'unregister', target: 'a' },
    ]);
    expect(list.map((p) => p.id)).toEqual(['b']);
  });

  it('挂到 harness 后 snapshot 与 loaded 可用', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(workspacePlugin);
    const ws = harness.services.get<WorkspaceService>('workspace')!;
    expect(ws.snapshot().title).toBe('个人工作台');
    expect(ws.tiles().length).toBeGreaterThanOrEqual(5);
    expect(ws.loaded().some((p) => p.id === 'workspace')).toBe(true);
  });
});
