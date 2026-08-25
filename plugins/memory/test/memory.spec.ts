import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { MEMORY_SERVICE } from '@wizard-harness/contracts';
import type { MemoryService, PromptContextService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import memoryPlugin from '../src/index.js';
import { calculateScore } from '../src/decay.js';
import { createMemoryHost } from '../src/host.js';
import { MEMORY_HTML } from '../src/page.js';
import type { BucketRecord } from '../src/types.js';

const dirs: string[] = [];

function vaultDir() {
  const d = mkdtempSync(join(tmpdir(), 'wh-memory-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) {
    try {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

async function boot(dir: string) {
  const harness = createHarness({
    bus: createEventBus(),
    config: { memory: { vaultDir: dir } },
  });
  await harness.registry.register(sessionPlugin);
  await harness.registry.register(promptContextPlugin);
  await harness.registry.register(toolsPlugin);
  await harness.registry.register(memoryPlugin);
  return harness;
}

function sample(partial: Partial<BucketRecord> = {}): BucketRecord {
  const t = Date.now();
  return {
    id: 'x',
    name: 'n',
    body: 'body',
    domain: '未分类',
    tags: [],
    valence: 0.5,
    arousal: 0.5,
    importance: 5,
    type: 'dynamic',
    created: t,
    lastActive: t,
    activationCount: 0,
    pinned: false,
    resolved: false,
    dontSurface: false,
    whyRemembered: '',
    sourceTool: 'hold',
    ...partial,
  };
}

describe('memory 插件', () => {
  it('服务名 + inject + 弹窗 rpc', () => {
    expect(MEMORY_SERVICE).toBe('memory');
    expect(memoryPlugin.manifest.provides).toEqual(['memory']);
    expect(memoryPlugin.inject).toEqual({ promptContext: true, logger: false, tools: false });
    expect(memoryPlugin.ui?.rpc).toEqual({
      memory: ['snapshot', 'pulse', 'list', 'get', 'breath', 'search', 'hold', 'grow', 'trace'],
    });
    expect(MEMORY_HTML).toContain('wh.call("memory"');
  });

  it('pinned 满分；resolved 降分；空 breath 不占文案噪音之外的空串', () => {
    expect(calculateScore(sample({ pinned: true }))).toBe(999);
    const fresh = calculateScore(sample({ resolved: false, importance: 8, arousal: 0.9 }));
    const done = calculateScore(sample({ resolved: true, importance: 8, arousal: 0.9 }));
    expect(fresh).toBeGreaterThan(done);
    const host = createMemoryHost({ vaultDir: vaultDir() });
    expect(host.renderBreath()).toBe('');
  });

  it('hold / search / breath / trace archive≠delete / reinforce', () => {
    const host = createMemoryHost({ vaultDir: vaultDir() });
    const a = host.hold({
      content: '用户希望用中文讨论 wizard-harness 记忆插件',
      name: '中文偏好',
      importance: 9,
      pinned: true,
    });
    host.hold({
      content: '昨天约好继续做 Ombre 对照分析',
      name: '未完成的对照',
      importance: 8,
      arousal: 0.8,
    });
    expect(a.pinned).toBe(true);
    const hits = host.search({ query: '中文' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.bucket.name).toContain('中文');
    const breath = host.breath();
    expect(breath.core.some((b) => b.id === a.id)).toBe(true);
    expect(breath.text).toContain('我的记忆');

    const open = host.list().find((b) => b.name.includes('对照'))!;
    const archived = host.trace(open.id, { archive: true });
    expect(archived.type).toBe('archived');
    expect(host.get(open.id)?.type).toBe('archived');
    const restored = host.trace(open.id, { restore: true, reinforce: true });
    expect(restored.type).toBe('dynamic');
    expect(restored.activationCount).toBeGreaterThan(0);
  });

  it('grow 拆多条；pulse 计数；prompt-context 登记 memory:breath', async () => {
    const dir = vaultDir();
    const harness = await boot(dir);
    const memory = harness.services.get<MemoryService>('memory')!;
    const grown = memory.grow({
      content: '第一件大事。第二件关于检索。第三件关于衰减。',
    });
    expect(grown.length).toBeGreaterThanOrEqual(2);
    const pulse = memory.pulse();
    expect(pulse.active).toBeGreaterThanOrEqual(grown.length);
    expect(pulse.vaultDir).toBe(dir);

    const prompts = harness.services.get<PromptContextService>('promptContext')!;
    const names = prompts.inspect().sources.map((s) => `${s.kind}:${s.name}`);
    expect(names).toEqual(expect.arrayContaining(['context:memory:breath']));

    const session = harness.services.get<{ start: (o?: { title?: string }) => { id: string } }>('session')!;
    const sid = session.start({ title: 'm' }).id;
    memory.hold({ content: '组装可见的一条跨会话经历', importance: 9 });
    const assembled = prompts.assemble({ sessionId: sid });
    expect(assembled.contextText).toContain('我的记忆');

    const tools = harness.services.get<ToolsService>('tools')!;
    const toolNames = tools.list().map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'memory_breath',
        'memory_search',
        'memory_hold',
        'memory_trace',
        'memory_pulse',
      ]),
    );
  });
});
