/**
 * 全局层 + exact-scope overlay。读不建层；merge 沿 parent 链近的盖远的。
 */

import type { PluginContext } from '../registrar/types.js';
import { scopeChainOf, scopeOf } from './keys.js';
import type { ScopeKey } from './keys.js';

export interface ScopeLayer {
  isEmpty(): boolean;
}

interface EntryValues<V> {
  values(): IterableIterator<V>;
  isEmpty(): boolean;
}

/** 插入序具名表；重名由调用方报错 */
export class NamedEntries<V> implements EntryValues<V> {
  private data = new Map<string, V>();

  constructor(private readonly duplicateError: (name: string) => Error) {}

  insert(name: string, value: V): () => void {
    const data = this.data;
    if (data.has(name)) throw this.duplicateError(name);
    data.set(name, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(name);
      if (data.size === 0 && this.data === data) this.data = new Map();
    };
  }

  get(name: string): V | undefined {
    return this.data.get(name);
  }

  has(name: string): boolean {
    return this.data.has(name);
  }

  keys(): IterableIterator<string> {
    return this.data.keys();
  }

  entries(): IterableIterator<[string, V]> {
    return this.data.entries();
  }

  values(): IterableIterator<V> {
    return this.data.values();
  }

  isEmpty(): boolean {
    return this.data.size === 0;
  }
}

/** 匿名表：相等值仍是独立登记 */
export class AnonymousEntries<V> implements EntryValues<V> {
  private data = new Map<symbol, V>();

  append(value: V): () => void {
    const data = this.data;
    const id = Symbol();
    data.set(id, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(id);
      if (data.size === 0 && this.data === data) this.data = new Map();
    };
  }

  values(): IterableIterator<V> {
    return this.data.values();
  }

  isEmpty(): boolean {
    return this.data.size === 0;
  }
}

/** 一层 global + 惰性 exact-scope overlay */
export class ScopedLayers<L extends ScopeLayer> {
  readonly global: L;
  private readonly scoped = new Map<ScopeKey, L>();

  constructor(
    private readonly createLayer: (scope: ScopeKey | undefined) => L,
    private readonly onChange: () => void,
  ) {
    this.global = createLayer(undefined);
  }

  /** 精确层；不沿链、不创建 */
  peek(scope: ScopeKey | undefined): L | undefined {
    if (scope === undefined) return undefined;
    return this.scoped.get(scope);
  }

  /** 远祖先 → 近：便于按序覆盖 */
  chainLayers(scope: ScopeKey | undefined): L[] {
    const out: L[] = [];
    for (const key of scopeChainOf(scope).reverse()) {
      const layer = this.scoped.get(key);
      if (layer !== undefined) out.push(layer);
    }
    return out;
  }

  merge<V>(scope: ScopeKey | undefined, pick: (layer: L) => NamedEntries<V>): Map<string, V> {
    const merged = new Map(pick(this.global).entries());
    for (const layer of this.chainLayers(scope)) {
      for (const [name, value] of pick(layer).entries()) merged.set(name, value);
    }
    return merged;
  }

  visit(fn: (scope: ScopeKey | undefined, layer: L) => void): void {
    fn(undefined, this.global);
    for (const [key, layer] of this.scoped) fn(key, layer);
  }

  layerOf(scope: ScopeKey | undefined): L {
    if (scope === undefined) return this.global;
    let layer = this.scoped.get(scope);
    if (!layer) {
      layer = this.createLayer(scope);
      this.scoped.set(scope, layer);
    }
    return layer;
  }

  reclaim(scope: ScopeKey | undefined, layer: L): void {
    if (scope !== undefined && layer.isEmpty()) this.scoped.delete(scope);
  }

  /**
   * 按 ctx 的 tag 归档一次同步变更，undo 挂到 ctx.effect。
   */
  effect(
    ctx: PluginContext,
    action: (layer: L) => () => void,
    options: { label: string; notify?: boolean },
  ): () => void {
    const scope = scopeOf(ctx);
    const notify = options.notify ?? true;
    const existed = scope === undefined || this.scoped.has(scope);
    const layer = this.layerOf(scope);
    let undo: () => void;
    try {
      undo = action(layer);
    } catch (err) {
      if (scope !== undefined && !existed && layer.isEmpty()) this.scoped.delete(scope);
      throw err;
    }
    const dispose = (): void => {
      undo();
      this.reclaim(scope, layer);
      if (notify) this.onChange();
    };
    ctx.effect(() => dispose);
    if (notify) this.onChange();
    return dispose;
  }
}
