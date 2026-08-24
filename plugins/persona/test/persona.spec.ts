import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { PERSONA_SERVICE } from '@wizard-harness/contracts';
import type { PersonaService, PromptContextService, SessionService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import personaPlugin from '../src/index.js';
import { PERSONA_HTML } from '../src/page.js';
import { createPersonaHost, DEFAULT_PERSONALITY } from '../src/host.js';

function persistFile() {
  return join(mkdtempSync(join(tmpdir(), 'wh-persona-')), 'persona.json');
}

async function boot(opts?: { persistFile?: string; withTools?: boolean }) {
  const harness = createHarness({
    bus: createEventBus(),
    config: opts?.persistFile ? { persona: { persistFile: opts.persistFile } } : {},
  });
  await harness.registry.register(sessionPlugin);
  await harness.registry.register(promptContextPlugin);
  if (opts?.withTools !== false) await harness.registry.register(toolsPlugin);
  await harness.registry.register(personaPlugin);
  return harness;
}

describe('persona 插件', () => {
  it('服务名 + 必选 prompt-context + 弹窗 rpc', () => {
    expect(PERSONA_SERVICE).toBe('persona');
    expect(personaPlugin.manifest.provides).toEqual(['persona']);
    expect(personaPlugin.inject).toEqual({ promptContext: true, logger: false, tools: false, agent: false });
    expect(personaPlugin.ui?.rpc).toEqual({
      persona: ['snapshot', 'save', 'addMemory', 'removeMemory', 'pinMemory'],
    });
    expect(PERSONA_HTML).toContain('wh.call("persona"');
  });

  it('默认档案含 OTA 人格；空记忆不占 token', () => {
    const host = createPersonaHost();
    const snap = host.snapshot();
    expect(snap.profile.name).toBe('默认助手');
    expect(snap.profile.personality).toContain('观察-思考-行动');
    expect(snap.profile.habits.length).toBeGreaterThan(0);
    expect(snap.preview.core).toContain('# 人格');
    expect(snap.preview.core).toContain('# 习惯');
    expect(snap.preview.memory).toBe('');
    expect(snap.profile.personality).toBe(DEFAULT_PERSONALITY);
  });

  it('save / 记忆钉住进预览 / 习惯去重', () => {
    const host = createPersonaHost();
    host.save({ name: '甲', personality: '简洁', habits: ['先看仓库', '先看仓库', '  '] });
    const pinned = host.addMemory({ text: '用户偏好中文', pinned: true });
    host.addMemory({ text: '昨天没做完的任务' });
    expect(pinned.profile.name).toBe('甲');
    expect(pinned.profile.habits).toEqual(['先看仓库']);
    expect(host.renderMemory()).toContain('[钉] 用户偏好中文');
    expect(host.renderMemory()).toContain('昨天没做完的任务');
    expect(host.remember({ text: '先看仓库', kind: 'habit' }).profile.habits).toEqual(['先看仓库']);
  });

  it('persistFile 往返', () => {
    const file = persistFile();
    const a = createPersonaHost({ persistFile: file });
    a.save({ name: '乙', personality: '少说话' });
    a.addMemory({ text: '记住这个仓库叫 wizard-harness', pinned: true });
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { name: string; memories: { text: string }[] };
    expect(raw.name).toBe('乙');
    const b = createPersonaHost({ persistFile: file });
    expect(b.snapshot().profile.name).toBe('乙');
    expect(b.snapshot().preview.memory).toContain('wizard-harness');
  });

  it('登记 persona:core / persona:memory；assemble 能看见人格，空记忆不进成品', async () => {
    const harness = await boot({ withTools: false });
    const persona = harness.services.get<PersonaService>('persona')!;
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    const session = harness.services.get<SessionService>('session')!;
    const names = pc.inspect().sources.map((s) => `${s.kind}:${s.name}`);
    expect(names).toEqual(expect.arrayContaining(['section:persona:core', 'context:persona:memory']));
    expect(pc.inspect().sources.find((s) => s.name === 'persona:core')?.live).toBe(true);

    const sess = session.start({ title: 'p' });
    const empty = pc.assemble({ sessionId: sess.id });
    expect(empty.systemText).toContain('观察-思考-行动');
    expect(empty.systemText).toContain('先看工作区');
    expect(empty.contextText).toBe('');

    persona.addMemory({ text: '项目约定用 pnpm', pinned: true });
    const next = pc.assemble({ sessionId: sess.id });
    expect(next.contextText).toContain('项目约定用 pnpm');
  });

  it('有 tools 时登记 persona_remember', async () => {
    const harness = await boot({ withTools: true });
    const tools = harness.services.get<ToolsService>('tools')!;
    expect(tools.list().map((t) => t.name)).toContain('persona_remember');
    const out = await tools.call('persona_remember', { text: '用户不喜欢长回复', pinned: true });
    expect(out.ok).toBe(true);
    expect(out.content).toMatch(/用户不喜欢长回复/);
    const habit = await tools.call('persona_remember', { text: '改完跑测试', kind: 'habit' });
    expect(habit.ok).toBe(true);
    const persona = harness.services.get<PersonaService>('persona')!;
    expect(persona.snapshot().profile.habits).toContain('改完跑测试');
  });
});
