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
    expect(personaPlugin.manifest.version).toBe('0.2.0');
    expect(personaPlugin.inject).toEqual({ promptContext: true, logger: false, tools: false, agent: false });
    expect(personaPlugin.ui?.rpc).toEqual({
      persona: [
        'snapshot',
        'read',
        'save',
        'configure',
        'addMemory',
        'removeMemory',
        'pinMemory',
      ],
    });
    expect(PERSONA_HTML).toContain('wh.call("persona"');
    expect(PERSONA_HTML).toContain('voiceStyle');
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
    expect(host.read().isDefault).toBe(true);
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

  it('apply / configure 写入元数据并进 core 预览', () => {
    const host = createPersonaHost();
    host.apply({
      name: '小织',
      personality: '我是小织，会先把问题拆清楚再动手。',
      role: '编程搭档',
      voiceStyle: '简洁直接',
      tone: '冷静',
      traits: ['好奇', '直接'],
      boundaries: '不编造执行结果',
      tagline: '写代码前先对齐意图',
      habits: ['改完跑测试'],
      replaceHabits: true,
    });
    expect(host.read().isDefault).toBe(false);
    const core = host.renderCore();
    expect(core).toContain('名称：小织');
    expect(core).toContain('角色：编程搭档');
    expect(core).toContain('说话风格：简洁直接');
    expect(core).toContain('性格：好奇、直接');
    expect(core).toContain('边界：不编造执行结果');

    host.configure({ meta: { tone: '温和' } });
    expect(host.renderCore()).toContain('语气：温和');
  });

  it('guide 含字段与模板', () => {
    const host = createPersonaHost({ persistFile: persistFile() });
    const g = host.guide();
    expect(g.version).toBeGreaterThan(0);
    expect(g.fields.some((f) => f.key === 'voiceStyle')).toBe(true);
    expect(g.workflow.join(' ')).toContain('persona_apply');
    expect(g.template).toContain('【名字】');
  });

  it('persistFile 往返含 meta', () => {
    const file = persistFile();
    const a = createPersonaHost({ persistFile: file });
    a.apply({
      name: '乙',
      personality: '少说话',
      role: '助手',
      voiceStyle: '极简',
      traits: ['克制'],
    });
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      name: string;
      meta: { role: string; voiceStyle: string };
    };
    expect(raw.name).toBe('乙');
    expect(raw.meta.role).toBe('助手');
    const b = createPersonaHost({ persistFile: file });
    expect(b.snapshot().profile.name).toBe('乙');
    expect(b.snapshot().profile.meta.voiceStyle).toBe('极简');
  });

  it('登记 persona:core / persona:memory；默认人设带 authoring-hint', async () => {
    const harness = await boot({ withTools: false });
    const persona = harness.services.get<PersonaService>('persona')!;
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    const session = harness.services.get<SessionService>('session')!;
    const names = pc.inspect().sources.map((s) => `${s.kind}:${s.name}`);
    expect(names).toEqual(
      expect.arrayContaining([
        'section:persona:core',
        'section:persona:authoring-hint',
        'context:persona:memory',
      ]),
    );
    expect(pc.inspect().sources.find((s) => s.name === 'persona:core')?.live).toBe(true);

    const sess = session.start({ title: 'p' });
    const empty = pc.assemble({ sessionId: sess.id });
    expect(empty.systemText).toContain('观察-思考-行动');
    expect(empty.systemText).toContain('persona_guide');

    persona.addMemory({ text: '项目约定用 pnpm', pinned: true });
    const next = pc.assemble({ sessionId: sess.id });
    expect(next.contextText).toContain('项目约定用 pnpm');
  });

  it('登记 persona 自生成工具集', async () => {
    const harness = await boot({ withTools: true });
    const tools = harness.services.get<ToolsService>('tools')!;
    const names = tools.list().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'persona_read',
        'persona_guide',
        'persona_apply',
        'persona_configure',
        'persona_remember',
      ]),
    );

    const guide = await tools.call('persona_guide', {});
    expect(guide.ok).toBe(true);

    const applied = await tools.call('persona_apply', {
      name: 'Nova',
      personality: '我是 Nova，擅长拆解复杂任务。',
      role: '全栈助手',
      voice_style: '清晰克制',
      traits: ['耐心', '严谨'],
    });
    expect(applied.ok).toBe(true);

    const persona = harness.services.get<PersonaService>('persona')!;
    expect(persona.snapshot().profile.name).toBe('Nova');
    expect(persona.snapshot().profile.meta.role).toBe('全栈助手');

    const read = await tools.call('persona_read', {});
    expect(read.ok).toBe(true);
    expect(read.content).toMatch(/Nova/);

    const out = await tools.call('persona_remember', { text: '用户不喜欢长回复', pinned: true });
    expect(out.ok).toBe(true);
    expect(out.content).toMatch(/用户不喜欢长回复/);
  });
});
