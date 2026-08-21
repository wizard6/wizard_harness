import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { Plugin } from '@wizard-harness/core';
import { APP_UI_SERVICE } from '@wizard-harness/contracts';
import type { AppChatService, AppUiService } from '@wizard-harness/contracts';
import appUiPlugin from '../src/index.js';
import { APP_UI_HTML } from '../src/page.js';

const fakeChat: Plugin = {
  manifest: { id: 'app-chat', version: '0.1.0', provides: ['appChat'] },
  api: {
    async send() {
      return { agentId: 'a1', text: 'hi' };
    },
    cancel() {},
  } satisfies AppChatService,
  register() {},
};

describe('app-ui 插件', () => {
  it('薄壳：inject appChat，不直接绑 agentLoop', () => {
    expect(APP_UI_SERVICE).toBe('appUi');
    expect(appUiPlugin.manifest.provides).toEqual(['appUi']);
    expect(appUiPlugin.inject).toEqual({ appChat: true, trajectory: false, logger: false });
    expect(appUiPlugin.ui?.rpc).toEqual({
      appChat: ['send', 'cancel'],
      trajectory: ['latest', 'list', 'snapshot'],
    });
    expect(APP_UI_HTML).toContain('本轮轨迹');
    expect(APP_UI_HTML).toContain('renderTrajectory');
  });

  it('有 appChat 即可注册，并提供 appUi 服务', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(fakeChat);
    await harness.registry.register(appUiPlugin);
    const svc = harness.services.get<AppUiService>('appUi');
    expect(svc?.title).toBe('App demo');
  });
});
