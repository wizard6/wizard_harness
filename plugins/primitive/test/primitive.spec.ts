import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { PrimitiveService } from '@wizard-harness/contracts';
import { createPrimitiveHost } from '../src/host.js';
import { SEED_PRIMITIVES } from '../src/catalog.js';
import primitivePlugin from '../src/index.js';

describe('primitive host', () => {
  it('列出种子并按标签过滤', () => {
    const host = createPrimitiveHost();
    expect(host.list().length).toBe(SEED_PRIMITIVES.length);
    expect(host.get('observe-first')?.body).toContain('证据');
    const forbid = host.listByTag('forbid');
    expect(forbid.some((p) => p.id === 'forbid-local-patch')).toBe(true);
    expect(forbid.every((p) => p.tags.includes('forbid') || p.thinkKind === 'forbid')).toBe(true);
  });

  it('thinkKind 也可当作标签', () => {
    const host = createPrimitiveHost();
    const observe = host.listByTag('observe');
    expect(observe.some((p) => p.id === 'observe-first')).toBe(true);
    const tags = host.tags().map((t) => t.tag);
    expect(tags).toContain('think');
    expect(tags).toContain('observe');
    expect(tags).toContain('behavior');
    expect(tags).toContain('evaluate');
    expect(tags).toContain('guide');
    expect(host.snapshot().approvedTags).toEqual(['behavior', 'evaluate', 'guide']);
  });

  it('空标签等于全部', () => {
    const host = createPrimitiveHost();
    expect(host.listByTag('').length).toBe(host.list().length);
  });

  it('树：父分解子；缺 parent 为根', () => {
    const host = createPrimitiveHost();
    const roots = host.tree().map((n) => n.id);
    expect(roots).toEqual(expect.arrayContaining(['observe-first', 'cell-not-director', 'not-a-skill']));
    const observe = host.tree().find((n) => n.id === 'observe-first')!;
    expect(observe.children.map((c) => c.id)).toEqual(
      expect.arrayContaining(['evidence-or-stop', 'split-declared-only']),
    );
    const evidence = observe.children.find((c) => c.id === 'evidence-or-stop')!;
    expect(evidence.children.map((c) => c.id)).toContain('forbid-local-patch');
    expect(host.get('evidence-or-stop')?.parentId).toBe('observe-first');
  });

  it('双向链：从任一端都能走到另一端', () => {
    const host = createPrimitiveHost();
    const fromObs = host.neighbors('observe-first').filter((n) => n.relation === 'link');
    expect(fromObs.some((n) => n.id === 'evidence-or-stop' && n.dir === 'out' && n.kind === 'then')).toBe(true);
    const fromEvi = host.neighbors('evidence-or-stop').filter((n) => n.relation === 'link');
    expect(fromEvi.some((n) => n.id === 'observe-first' && n.dir === 'in' && n.kind === 'then')).toBe(true);
    const fromCell = host.neighbors('cell-not-director').filter((n) => n.relation === 'link');
    expect(fromCell.some((n) => n.id === 'not-a-skill' && n.dir === 'in' && n.kind === 'constrains')).toBe(true);
  });

  it('内部路由：入口后按 guide→evaluate→behavior 封顶', () => {
    const host = createPrimitiveHost();
    const empty = host.route({ limit: 5 });
    expect(empty.steps.length).toBeGreaterThan(0);
    expect(empty.steps.length).toBeLessThanOrEqual(5);
    expect(empty.algorithm).toContain('guide');
    const hit = host.route({ hint: '证据', limit: 5 });
    expect(hit.seeds.length).toBeGreaterThan(0);
    expect(hit.steps.some((s) => s.id === 'evidence-or-stop' || s.id === 'observe-first')).toBe(true);
    const from = host.route({ startId: 'observe-first', limit: 5 });
    expect(from.seeds).toEqual(['observe-first']);
    expect(from.load).toBe(from.steps.length);
  });
});

describe('primitive plugin', () => {
  it('register 后可 snapshot / get', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(primitivePlugin);
    const svc = harness.services.get<PrimitiveService>('primitive')!;
    const snap = svc.snapshot();
    expect(snap.primitives.length).toBeGreaterThan(0);
    expect(snap.tags.length).toBeGreaterThan(0);
    expect(snap.primitives[0]).not.toHaveProperty('body');
    expect(snap.tree.length).toBeGreaterThan(0);
    expect(snap.links.length).toBeGreaterThan(0);
    expect(svc.neighbors('observe-first').length).toBeGreaterThan(0);
    expect(svc.get('not-a-skill')?.tags).toContain('contrast');
    expect(svc.get('missing-id')).toBeUndefined();
  });
});
