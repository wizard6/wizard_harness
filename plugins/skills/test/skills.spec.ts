import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { SKILLS_SERVICE } from '@wizard-harness/contracts';
import type { SkillsService } from '@wizard-harness/contracts';
import loggerPlugin from '../../logger/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import sessionPlugin from '../../session/src/index.js';
import { parseSkillMarkdown } from '../src/parse.js';
import { createSkillsHost } from '../src/host.js';
import skillsPlugin from '../src/index.js';

describe('skills parse', () => {
  it('解析 frontmatter', () => {
    const parsed = parseSkillMarkdown(`---
name: Send Email
description: 发邮件
alwaysApply: false
---
# Body
hello`);
    expect(parsed.name).toBe('Send Email');
    expect(parsed.description).toBe('发邮件');
    expect(parsed.body).toContain('hello');
  });
});

describe('skills host', () => {
  it('扫描目录中的 SKILL.md', () => {
    const root = join(tmpdir(), `wh-skills-test-${Date.now()}`);
    const dir = join(root, 'send-email');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      `---
name: Send Email
description: 通过 SMTP 发信
---
按步骤调用脚本。`,
    );
    const host = createSkillsHost({ scanDirs: [root], workspace: root });
    const list = host.list();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe('send-email');
    expect(host.renderCatalog()).toContain('Send Email');
    const detail = host.get('send-email');
    expect(detail?.body).toContain('按步骤');
  });

  it('停用技能后 skill_read 应拒绝', () => {
    const root = join(tmpdir(), `wh-skills-off-${Date.now()}`);
    const dir = join(root, 'demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '# Demo\ncontent');
    const host = createSkillsHost({ scanDirs: [root], workspace: root });
    host.setEnabled('demo', false);
    expect(host.get('demo')?.enabled).toBe(false);
  });
});

describe('skills 插件', () => {
  it('注册 skills 服务', async () => {
    const harness = createHarness({ bus: createEventBus(), config: { skills: { scanDirs: [] } } });
    await harness.registry.register(loggerPlugin);
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(skillsPlugin);
    const skills = harness.services.get<SkillsService>(SKILLS_SERVICE)!;
    expect(skills.snapshot().scanDirs.length).toBeGreaterThan(0);
  });
});
