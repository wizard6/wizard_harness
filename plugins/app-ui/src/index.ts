import type { Plugin } from '@wizard-harness/core';
import { APP_UI_SERVICE } from '@wizard-harness/contracts';
import type { AppUiService } from '@wizard-harness/contracts';
import { APP_UI_HTML } from './page.js';

/**
 * app-ui：产品薄壳窗口。只经 ui.rpc 调 appChat，不碰 agentLoop。
 * 说明文档：docs/plugins/app-ui.html
 */
const api: AppUiService = { title: 'Agent demo' };

const appUiPlugin: Plugin = {
  manifest: {
    id: 'app-ui',
    version: '0.1.0',
    name: 'Agent demo',
    description: '产品聊天窗口。经 appChat.send 发消息；新建会话可带 workspace。右栏只读本轮轨迹；顶栏显示沙箱 root。',
    provides: [APP_UI_SERVICE],
    config: {},
    tier: 'standard',
  },
  inject: { appChat: true, promptContext: false, trajectory: false, sandbox: false, logger: false },
  api,
  ui: {
    title: 'Agent demo',
    width: 1080,
    height: 720,
    rpc: {
      appChat: ['send', 'cancel', 'listSessions', 'resumeSession', 'deleteSession'],
      promptContext: ['inspect', 'usage'],
      trajectory: ['latest', 'list', 'snapshot'],
      sandbox: ['info', 'list'],
    },
    content: APP_UI_HTML,
  },
  register(c) {
    if (!c.promptContext && !c.get('promptContext')) {
      c.logger?.warn?.('app-ui：prompt-context 未装入，Agent demo 将显示缺口提示');
    }
    c.logger?.info?.('app-ui 插件就绪（产品薄壳）');
  },
};

export default appUiPlugin;
