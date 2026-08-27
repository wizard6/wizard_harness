import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { KREA_SERVICE } from '@wizard-harness/contracts';
import type { KreaService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import kreaPlugin from '../src/index.js';
import { KREA_HTML } from '../src/page.js';
import { createKreaHost } from '../src/host.js';
import { buildGenerateBody, resolveModel } from '../src/models.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('krea 模型解析', () => {
  it('别名落到官方 path；k2 带比例，flux 带宽高', () => {
    expect(resolveModel('k2').path).toBe('image/krea/krea-2/medium');
    expect(resolveModel('flux').path).toBe('image/bfl/flux-1-dev');
    const k2 = buildGenerateBody(resolveModel('krea-2-medium'), { prompt: 'a lamp', aspect_ratio: '4:5' });
    expect(k2).toMatchObject({ prompt: 'a lamp', aspect_ratio: '4:5', resolution: '1K' });
    const flux = buildGenerateBody(resolveModel('flux'), { prompt: 'aurora', aspect_ratio: '16:9' });
    expect(flux).toMatchObject({ prompt: 'aurora', width: 1280, height: 720 });
  });
});

describe('krea host', () => {
  it('没有 Key 时拒绝出图', async () => {
    const host = createKreaHost({ apiKey: '' });
    expect(host.configured).toBe(false);
    await expect(host.generate({ prompt: 'x' })).rejects.toThrow(/WH_KREA_API_KEY/);
  });

  it('提交后轮询直到拿到 urls', async () => {
    const calls: string[] = [];
    let polls = 0;
    const host = createKreaHost({
      apiKey: 'test-token',
      sleep: async () => undefined,
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.includes('/generate/')) {
          expect(String((init?.headers as Record<string, string>)?.authorization)).toBe('Bearer test-token');
          const body = JSON.parse(String(init?.body ?? '{}')) as { prompt: string };
          expect(body.prompt).toBe('glass lamp');
          return json({
            job_id: '11111111-1111-4111-8111-111111111111',
            status: 'queued',
            created_at: '2026-01-01T00:00:00Z',
            completed_at: null,
            result: null,
          });
        }
        polls += 1;
        if (polls < 2) {
          return json({
            job_id: '11111111-1111-4111-8111-111111111111',
            status: 'processing',
            created_at: '2026-01-01T00:00:00Z',
            result: null,
          });
        }
        return json({
          job_id: '11111111-1111-4111-8111-111111111111',
          status: 'completed',
          created_at: '2026-01-01T00:00:00Z',
          completed_at: '2026-01-01T00:00:08Z',
          result: { urls: ['https://cdn.krea.ai/lamp.png'] },
        });
      },
    });

    const done = await host.generate({ prompt: 'glass lamp', model: 'krea-2-medium' });
    expect(done.status).toBe('completed');
    expect(done.urls).toEqual(['https://cdn.krea.ai/lamp.png']);
    expect(calls.some((c) => c.includes('/generate/image/krea/krea-2/medium'))).toBe(true);
    expect(host.info().recent[0]?.urls[0]).toBe('https://cdn.krea.ai/lamp.png');
  });

  it('wait=false 只返回 job_id', async () => {
    const host = createKreaHost({
      apiKey: 'k',
      fetch: async () =>
        json({
          job_id: '22222222-2222-4222-8222-222222222222',
          status: 'queued',
          created_at: '2026-01-01T00:00:00Z',
          result: null,
        }),
    });
    const pending = await host.generate({ prompt: 'x', wait: false });
    expect(pending.status).toBe('queued');
    expect(pending.urls).toEqual([]);
    expect(pending.hint).toMatch(/krea_job/);
  });
});

describe('krea 插件', () => {
  it('服务名 + inject + ui.rpc', () => {
    expect(KREA_SERVICE).toBe('krea');
    expect(kreaPlugin.manifest.provides).toEqual(['krea']);
    expect(kreaPlugin.inject).toEqual({ tools: true, logger: false, promptContext: false });
    expect(kreaPlugin.ui?.rpc).toEqual({ krea: ['info'] });
    expect(KREA_HTML).toContain('krea');
  });

  it('登记三个工具并写入 prompt-context', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    await harness.registry.register(kreaPlugin);
    const tools = harness.services.get<ToolsService>('tools')!;
    expect(tools.list().map((t) => t.name)).toEqual(
      expect.arrayContaining(['krea_models', 'krea_generate', 'krea_job']),
    );
    expect(harness.services.get<KreaService>('krea')!.info().configured).toBe(false);
    const inspect = harness.services.get('promptContext') as { inspect: () => { sources: Array<{ name: string }> } };
    expect(inspect.inspect().sources.some((s) => s.name === 'tool:krea')).toBe(true);
  });
});
