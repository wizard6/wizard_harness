import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { PERSONA_SERVICE, PERSONA_SOUL_LIMIT } from '@wizard-harness/contracts';
import type { PersonaService, PromptContextService, SessionService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import personaPlugin from '../src/index.js';
import { PERSONA_HTML } from '../src/page.js';
import { createPersonaHost, DEFAULT_SOUL, soulChars } from '../src/host.js';

function persistFile() {
  return join(mkdtempSync(join(tmpdir(), 'wh-persona-')), 'persona.json');
}

async function boot(opts?: { persistFile?: string; withTools?: boolean; withPrompt?: boolean }) {
  const harness = createHarness({
    bus: createEventBus(),
    config: opts?.persistFile ? { persona: { persistFile: opts.persistFile } } : {},
  });
  await harness.registry.register(sessionPlugin);
  if (opts?.withPrompt !== false) await harness.registry.register(promptContextPlugin);
  if (opts?.withTools !== false) await harness.registry.register(toolsPlugin);
  await harness.registry.register(personaPlugin);
  return harness;
}

describe('persona 插件', () => {
  it('服务名 + 可选 prompt-context / tools + 弹窗 rpc', () => {
    expect(PERSONA_SERVICE).toBe('persona');
    expect(personaPlugin.manifest.provides).toEqual(['persona']);
    expect(personaPlugin.manifest.version).toBe('0.3.0');
    expect(personaPlugin.inject).toEqual({ promptContext: false, logger: false, tools: false });
    expect(personaPlugin.ui?.rpc).toEqual({
      persona: ['snapshot', 'list', 'read', 'save', 'create', 'update', 'activate', 'remove'],
    });
    expect(PERSONA_HTML).toContain('wh.call("persona"');
    expect(PERSONA_HTML).toContain('硅灵');
    expect(PERSONA_HTML).toContain('身份基线');
    expect(PERSONA_HTML).toContain('/ 3000');
    expect(PERSONA_HTML).not.toContain('条记忆');
    expect(PERSONA_HTML).not.toContain('addMemory');
  });

  it('默认 soul 含 OTA 人格；无记忆字段', () => {
    const host = createPersonaHost();
    const snap = host.snapshot();
    expect(snap.profile.name).toBe('默认助手');
    expect(snap.profile.soul).toContain('观察-思考-行动');
    expect(snap.profile.soul).toContain('# 习惯');
    expect(snap.preview).toBe(DEFAULT_SOUL);
    expect(snap.limit).toBe(PERSONA_SOUL_LIMIT);
    expect(snap.chars).toBe(soulChars(DEFAULT_SOUL));
    expect(snap.chars).toBeLessThanOrEqual(PERSONA_SOUL_LIMIT);
    expect(host.read().isDefault).toBe(true);
    expect(host.soul()).toBe(DEFAULT_SOUL);
    expect(snap.profile).not.toHaveProperty('memories');
  });

  it('create / activate / update / remove 多份切换', () => {
    const host = createPersonaHost();
    const created = host.create({
      name: '小织',
      personality: '我是小织，会先把问题拆清楚再动手。',
      role: '编程搭档',
      voiceStyle: '简洁直接',
      habits: ['改完跑测试'],
    });
    expect(created.profile.name).toBe('小织');
    expect(created.profiles).toHaveLength(2);
    expect(created.profile.soul).toContain('名称：小织');
    expect(created.profile.soul).toContain('角色：编程搭档');
    expect(host.soul()).toContain('小织');

    const other = host.create({ name: 'Nova', soul: '# 硅格\n我是 Nova。', activate: false });
    expect(other.profiles).toHaveLength(3);
    expect(host.snapshot().profile.name).toBe('小织');

    host.activate(other.profile.id);
    expect(host.snapshot().profile.name).toBe('Nova');
    host.update({ soul: '# 硅格\n我是 Nova，擅长拆解复杂任务。' });
    expect(host.soul()).toContain('拆解复杂任务');

    host.remove(other.profile.id);
    expect(host.list()).toHaveLength(2);
    expect(host.snapshot().profile.name).toBe('默认助手');
  });

  it('soul 超过 3000 字拒绝写入', () => {
    const host = createPersonaHost();
    const tooLong = '字'.repeat(PERSONA_SOUL_LIMIT + 1);
    expect(() => host.create({ name: '过长', soul: tooLong })).toThrow(/3000/);
    expect(() => host.update({ soul: tooLong })).toThrow(/3000/);
  });

  it('无 prompt-context 仍可注册（可替换）', async () => {
    const harness = await boot({ withTools: false, withPrompt: false });
    const persona = harness.services.get<PersonaService>('persona');
    expect(persona?.soul()).toContain('观察-思考-行动');
  });

  it('卸载后 persona_* 工具与 prompt 登记一并撤销', async () => {
    const harness = await boot({ withTools: true });
    const tools = harness.services.get<ToolsService>('tools')!;
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    expect(tools.list().some((t) => t.name === 'persona_create')).toBe(true);
    expect(pc.inspect().sources.some((s) => s.name === 'persona:core')).toBe(true);
    expect(pc.inspect().sources.some((s) => s.name === 'persona:memory')).toBe(false);
    await harness.registry.unregister('persona');
    expect(tools.list().some((t) => t.name === 'persona_create')).toBe(false);
    expect(pc.inspect().sources.some((s) => s.name === 'persona:core')).toBe(false);
  });

  it('guide 含 3000 上限与 create/update/switch', () => {
    const host = createPersonaHost({ persistFile: persistFile() });
    const g = host.guide();
    expect(g.limit).toBe(3000);
    expect(g.workflow.join(' ')).toContain('persona_create');
    expect(g.workflow.join(' ')).toContain('persona_switch');
    expect(g.template).toContain('# 硅格');
  });

  it('v1 persona.json 迁移为单份 soul，丢掉 memories', () => {
    const file = persistFile();
    writeFileSync(
      file,
      JSON.stringify({
        id: 'legacy',
        name: '乙',
        personality: '少说话',
        habits: ['先看仓库'],
        memories: [{ id: 'm1', text: '不该再出现', pinned: true, at: 1 }],
        meta: { role: '助手', voiceStyle: '极简', tone: '', traits: ['克制'], boundaries: '', tagline: '' },
        updatedAt: 1,
      }),
      'utf8',
    );
    const host = createPersonaHost({ persistFile: file });
    expect(host.snapshot().profile.name).toBe('乙');
    expect(host.soul()).toContain('少说话');
    expect(host.soul()).toContain('极简');
    expect(host.soul()).not.toContain('不该再出现');
    host.save({ name: '乙', soul: host.soul() });
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version: number; profiles: { soul: string }[] };
    expect(raw.version).toBe(2);
    expect(raw.profiles).toHaveLength(1);
    expect(JSON.stringify(raw)).not.toContain('memories');
  });

  it('登记 persona:core；默认人设带 authoring-hint；不登记 memory', async () => {
    const harness = await boot({ withTools: false });
    const persona = harness.services.get<PersonaService>('persona')!;
    const pc = harness.services.get<PromptContextService>('promptContext')!;
    const session = harness.services.get<SessionService>('session')!;
    const names = pc.inspect().sources.map((s) => `${s.kind}:${s.name}`);
    expect(names).toEqual(expect.arrayContaining(['section:persona:core', 'section:persona:authoring-hint']));
    expect(names.some((n) => n.includes('persona:memory'))).toBe(false);

    const sess = session.start({ title: 'p' });
    const empty = pc.assemble({ sessionId: sess.id });
    expect(empty.systemText).toContain('观察-思考-行动');
    expect(empty.systemText).toContain('persona_guide');

    persona.create({ name: '甲', soul: '# 硅格\n只保留身份基线。' });
    const next = pc.assemble({ sessionId: sess.id });
    expect(next.systemText).toContain('只保留身份基线');
    expect(next.contextText).not.toContain('相关记忆');
  });

  it('登记 create / update / switch 工具集', async () => {
    const harness = await boot({ withTools: true });
    const tools = harness.services.get<ToolsService>('tools')!;
    const names = tools.list().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'persona_list',
        'persona_read',
        'persona_guide',
        'persona_create',
        'persona_update',
        'persona_switch',
      ]),
    );
    expect(names.some((n) => n === 'persona_remember')).toBe(false);

    const created = await tools.call('persona_create', {
      name: 'Nova',
      personality: '我是 Nova，擅长拆解复杂任务。',
      role: '全栈助手',
      voice_style: '清晰克制',
    });
    expect(created.ok).toBe(true);

    const persona = harness.services.get<PersonaService>('persona')!;
    expect(persona.snapshot().profile.name).toBe('Nova');
    expect(persona.soul()).toContain('全栈助手');

    const listed = await tools.call('persona_list', {});
    expect(listed.ok).toBe(true);

    await tools.call('persona_update', { soul: '# 硅格\nNova 已更新。' });
    expect(persona.soul()).toContain('已更新');

    const first = persona.list().find((r) => r.name === '默认助手')!;
    await tools.call('persona_switch', { id: first.id });
    expect(persona.snapshot().profile.name).toBe('默认助手');
  });
});
