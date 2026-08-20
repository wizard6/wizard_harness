import { describe, expect, it } from 'vitest';
import {
  bindScopeParent,
  createEventBus,
  createHarness,
  createScope,
  scopeAdmits,
  scopeChainOf,
  scopeOf,
  scopeParentOf,
} from '../src/index.js';
import type { Plugin } from '../src/index.js';

describe('scope 原语', () => {
  it('parent 链近→远；成环抛错', () => {
    const a = {};
    const b = {};
    const c = {};
    bindScopeParent(b, a);
    bindScopeParent(c, b);
    expect(scopeParentOf(c)).toBe(b);
    expect(scopeChainOf(c)).toEqual([c, b, a]);
    expect(() => bindScopeParent(a, c)).toThrow(/成环/);
  });

  it('scopeAdmits：未打标全收；祖先收子孙；子孙不收祖先', () => {
    const parent = {};
    const child = {};
    bindScopeParent(child, parent);
    expect(scopeAdmits(undefined, child)).toBe(true);
    expect(scopeAdmits(parent, child)).toBe(true);
    expect(scopeAdmits(child, parent)).toBe(false);
    expect(scopeAdmits(child, undefined)).toBe(false);
  });
});

describe('createScope 与服务 overlay', () => {
  async function hostCtx() {
    const harness = createHarness({ bus: createEventBus() });
    const plugin: Plugin = { manifest: { id: 'host', version: '1.0.0' }, async register() {} };
    await harness.registry.register(plugin);
    return harness.pluginContext('host')!;
  }

  it('未打标 ctx 的 scopeOf 为 undefined', async () => {
    expect(scopeOf(await hostCtx())).toBeUndefined();
  });

  it('子 scope 看见全局；近层遮盖；dispose 后回落全局', async () => {
    const ctx = await hostCtx();
    ctx.provide('tool', { n: 'global' });
    const key = {};
    const scoped = createScope(ctx, key);
    expect(scopeOf(scoped.ctx)).toBe(key);
    expect(scoped.ctx.get('tool')).toEqual({ n: 'global' });
    scoped.ctx.provide('tool', { n: 'local' });
    expect(scoped.ctx.get('tool')).toEqual({ n: 'local' });
    expect(ctx.get('tool')).toEqual({ n: 'global' });
    await scoped.dispose();
    expect(scoped.ctx.get('tool')).toEqual({ n: 'global' });
  });

  it('事件：祖先监听子孙；反向不收；未打标全收', async () => {
    const ctx = await hostCtx();
    const parentKey = {};
    const childKey = {};
    const parent = createScope(ctx, parentKey);
    const child = createScope(parent.ctx, childKey, { parent: parentKey });
    const seen: string[] = [];
    ctx.on('tick', () => seen.push('global'));
    parent.ctx.on('tick', () => seen.push('parent'));
    child.ctx.on('tick', () => seen.push('child'));

    child.ctx.emit({ action: 'tick' });
    expect(seen).toEqual(['global', 'parent', 'child']);
    seen.length = 0;
    parent.ctx.emit({ action: 'tick' });
    expect(seen).toEqual(['global', 'parent']);
  });
});
