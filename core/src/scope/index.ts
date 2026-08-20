/**
 * 打标注册上下文（对齐 deepseek-harness packages/core/scope）。
 * 经 scoped ctx 的登记：可见性与寿命同一条事实。不是权限门，也不是 isolate。
 */

import type { PluginContext } from '../registrar/types.js';
import { bindScopeParent, scopeAdmits, scopeOf } from './keys.js';
import type { ScopeKey } from './keys.js';

export type { ScopeKey, ScopeParentBinding } from './keys.js';
export {
  bindScopeParent,
  eventSubjectOf,
  scopeAdmits,
  scopeChainOf,
  scopeOf,
  scopeParentOf,
  setEventSubject,
  tagContext,
} from './keys.js';
export { AnonymousEntries, NamedEntries, ScopedLayers } from './layers.js';
export type { ScopeLayer } from './layers.js';

declare const ScopedBrand: unique symbol;
/** 事件分发载体：只承载路由，不暴露 subject 属性 */
export type Scoped<T extends object> = object & { readonly [ScopedBrand]: T };

const carrierKeys = new WeakMap<object, ScopeKey | undefined>();
const forks = new WeakMap<
  PluginContext,
  (key: ScopeKey, pushEffect: (d: () => void) => void) => PluginContext
>();

export function scopeTarget<T extends object>(_base: T, key: ScopeKey | undefined): Scoped<T> {
  const carrier = {
    filter(ctx: object): boolean {
      return scopeAdmits(scopeOf(ctx), key);
    },
  };
  carrierKeys.set(carrier, key);
  return carrier as unknown as Scoped<T>;
}

export function isScopeCarrier(value: unknown): value is Scoped<object> {
  return typeof value === 'object' && value !== null && carrierKeys.has(value);
}

export function carrierKeyOf(value: unknown): ScopeKey | undefined {
  if (!isScopeCarrier(value)) return undefined;
  return carrierKeys.get(value);
}

export interface CreateScopeOptions {
  parent?: ScopeKey;
}

export interface Scope {
  ctx: PluginContext;
  rawDispose: () => Promise<void> | void;
  dispose(): Promise<void>;
}

export function attachScopeFork(
  ctx: PluginContext,
  fork: (key: ScopeKey, pushEffect: (d: () => void) => void) => PluginContext,
): void {
  forks.set(ctx, fork);
}

/**
 * 从插件 ctx 派生打标子上下文。经它登记的服务/副作用归该 key；
 * 插件卸载时自动 dispose（挂到父 ctx.effect）。
 */
export function createScope(ctx: PluginContext, key: ScopeKey, options?: CreateScopeOptions): Scope {
  const fork = forks.get(ctx);
  if (!fork) throw new Error('createScope：ctx 无法派生（不是 harness 插件上下文）');
  if (options?.parent !== undefined) bindScopeParent(key, options.parent);
  const disposers: Array<() => void> = [];
  const scoped = fork(key, (d) => disposers.push(d));
  let done: Promise<void> | undefined;
  const rawDispose = (): Promise<void> => {
    if (!done) {
      done = Promise.resolve().then(() => {
        for (let i = disposers.length - 1; i >= 0; i--) {
          try {
            disposers[i]?.();
          } catch (err) {
            console.error('[scope] dispose 失败:', err);
          }
        }
      });
    }
    return done;
  };
  ctx.effect(() => () => {
    void rawDispose();
  });
  return { ctx: scoped, rawDispose, dispose: rawDispose };
}
