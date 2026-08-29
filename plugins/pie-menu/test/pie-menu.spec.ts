import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { PIE_MENU_SERVICE } from '@wizard-harness/contracts';
import type { PieMenuService } from '@wizard-harness/contracts';
import { createPieMenuHost } from '../src/host.js';
import pieMenuPlugin from '../src/index.js';
import { PIE_MENU_HTML } from '../src/page.js';

describe('pie-menu', () => {
  it('manifest + HUD UI', () => {
    expect(pieMenuPlugin.manifest.id).toBe('pie-menu');
    expect(pieMenuPlugin.ui?.hud).toBe(false);
    expect(pieMenuPlugin.ui?.rpc).toEqual({
      pieMenu: ['snapshot', 'get', 'activate'],
    });
    expect(PIE_MENU_HTML).toContain('pieMenu');
    expect(PIE_MENU_HTML).toContain('wedge');
    expect(PIE_MENU_HTML).toContain('node');
  });

  it('host：子菜单进入；叶子 openPlugin / action', () => {
    const host = createPieMenuHost();
    const snap = host.snapshot();
    expect(snap.root.children?.length).toBeGreaterThan(3);

    const tools = host.activate('tools');
    expect(tools.effect).toBe('submenu');
    if (tools.effect === 'submenu') {
      expect(tools.node.children?.some((c) => c.id === 'pomodoro')).toBe(true);
    }

    const open = host.activate('agent');
    expect(open).toEqual({ effect: 'openPlugin', pluginId: 'app-ui' });

    const close = host.activate('close');
    expect(close).toEqual({ effect: 'action', action: 'close' });
  });

  it('registerItem 可扩展菜单', () => {
    const host = createPieMenuHost();
    const stop = host.registerItem('tools', {
      id: 'custom-x',
      label: '自定义',
      icon: 'X',
      kind: 'action',
      action: 'custom-x',
    });
    expect(host.get('custom-x')?.label).toBe('自定义');
    stop();
    expect(host.get('custom-x')).toBeUndefined();
  });

  it('harness 挂载后服务可用', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(pieMenuPlugin);
    const svc = harness.services.get<PieMenuService>(PIE_MENU_SERVICE)!;
    expect(svc.snapshot().root.id).toBe('root');
  });
});
