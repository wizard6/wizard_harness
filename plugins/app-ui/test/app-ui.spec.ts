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
    async listSessions() {
      return [];
    },
    async resumeSession() {
      return { agentId: 'a1', sessionId: 's1', messages: [] };
    },
    async deleteSession(id: string) {
      return { ok: true as const, id };
    },
  } satisfies AppChatService,
  register() {},
};

describe('app-ui 插件', () => {
  it('薄壳：inject appChat · 可选 promptContext，不直接绑 agentLoop', () => {
    expect(APP_UI_SERVICE).toBe('appUi');
    expect(appUiPlugin.manifest.provides).toEqual(['appUi']);
    expect(appUiPlugin.inject).toEqual({
      appChat: true,
      promptContext: false,
      trajectory: false,
      sandbox: false,
      logger: false,
    });
    expect(appUiPlugin.ui?.rpc).toEqual({
      appChat: ['send', 'cancel', 'listSessions', 'resumeSession', 'deleteSession'],
      promptContext: ['inspect', 'usage'],
      trajectory: ['latest', 'list', 'snapshot'],
      sandbox: ['info', 'list'],
    });
    expect(APP_UI_HTML).toContain('sess-count');
    expect(APP_UI_HTML).toContain('搜索会话');
    expect(APP_UI_HTML).toContain('pullSessions');
    expect(APP_UI_HTML).toContain('deleteSession');
    expect(APP_UI_HTML).toContain('sess-del');
    expect(APP_UI_HTML).toContain('删除会话');
    expect(APP_UI_HTML).toContain('renderSessList');
    expect(APP_UI_HTML).toContain('watchDeltas');
    expect(APP_UI_HTML).toContain('humanError');
    expect(APP_UI_HTML).toContain('doCancel');
    expect(APP_UI_HTML).not.toContain('Run workflow');
    expect(APP_UI_HTML).not.toContain('workflow');
    expect(APP_UI_HTML).toContain('本轮轨迹');
    expect(APP_UI_HTML).toContain('New Session');
    expect(APP_UI_HTML).toContain('pullSandbox');
    expect(APP_UI_HTML).toContain('pullPromptContext');
    expect(APP_UI_HTML).toContain('setAgentChip');
    expect(APP_UI_HTML).toContain('id="ctx-usage"');
    expect(APP_UI_HTML).toContain('compose-actions');
    expect(APP_UI_HTML).toContain('上下文');
    expect(APP_UI_HTML).toContain('promptContext","usage');
    expect(APP_UI_HTML).toContain('id="ws"');
    expect(APP_UI_HTML).toContain('workspace');
    expect(APP_UI_HTML).toContain('renderTrajectory');
    expect(APP_UI_HTML).toMatch(/<ul class="formats"[^>]*>\s*<li>markdown<\/li>\s*<\/ul>/);
    expect(APP_UI_HTML).toContain('function renderMarkdown');
    expect(APP_UI_HTML).toContain('function mdHtml');
  });

  it('有 appChat 即可注册，并提供 appUi 服务', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(fakeChat);
    await harness.registry.register(appUiPlugin);
    const svc = harness.services.get<AppUiService>('appUi');
    expect(svc?.title).toBe('Agent demo');
  });
});
