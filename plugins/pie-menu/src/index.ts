import type { Plugin } from '@wizard-harness/core';
import { PIE_MENU_SERVICE } from '@wizard-harness/contracts';
import type { PieMenuItemInput, PieMenuService } from '@wizard-harness/contracts';
import { createPieMenuHost } from './host.js';
import { PIE_MENU_HTML } from './page.js';

/**
 * pie-menu：Kando 风格扇形快捷菜单（HUD）。
 * 说明文档：docs/plugins/pie-menu.html
 */
let impl: ReturnType<typeof createPieMenuHost> | undefined;

function live(): ReturnType<typeof createPieMenuHost> {
  if (!impl) throw new Error('pieMenu 未就绪');
  return impl;
}

const api: PieMenuService = {
  snapshot: () => live().snapshot(),
  get: (id) => live().get(id),
  activate: (id) => live().activate(id),
  setRoot: (root: PieMenuItemInput) => live().setRoot(root),
  registerItem: (parentId, item) => live().registerItem(parentId, item),
};

const pieMenuPlugin: Plugin = {
  manifest: {
    id: 'pie-menu',
    version: '0.1.0',
    name: '扇形菜单',
    description:
      'Kando 风格扇形快捷菜单：嵌套扇区、点选与拖拽标记；可打开插件或自定义 action。',
    provides: [PIE_MENU_SERVICE],
    tier: 'standard',
  },
  api,
  ui: {
    title: '扇形菜单',
    // 不用透明 hud：Windows 下经常看不见；由 main.cjs 对 pie-menu 开实色全屏层
    hud: false,
    width: 720,
    height: 720,
    rpc: {
      pieMenu: ['snapshot', 'get', 'activate'],
    },
    content: PIE_MENU_HTML,
  },
  register(ctx) {
    impl = createPieMenuHost();
    ctx.effect(() => () => {
      impl = undefined;
    });
    ctx.logger?.info?.('pie-menu 就绪（Kando-style HUD）');
  },
};

export default pieMenuPlugin;
