/** 不透明、按对象身份比较的 scope key */
export type ScopeKey = object;

const kEventSubject = Symbol('wh.event.scope');

const scopeParents = new WeakMap<ScopeKey, ScopeKey>();
const scopeTags = new WeakMap<object, ScopeKey>();

export interface ScopeParentBinding {
  rebind(parent: ScopeKey): void;
}

function linkScopeParent(key: ScopeKey, parent: ScopeKey): void {
  for (let cursor: ScopeKey | undefined = parent; cursor !== undefined; cursor = scopeParents.get(cursor)) {
    if (cursor === key) throw new Error('scope parent 成环');
  }
  scopeParents.set(key, parent);
}

export function bindScopeParent(key: ScopeKey, parent: ScopeKey): ScopeParentBinding {
  if (scopeParents.has(key)) {
    throw new Error('scope key 已绑定 parent；改绑请用 bind 返回的 rebind');
  }
  linkScopeParent(key, parent);
  return { rebind: (next) => linkScopeParent(key, next) };
}

export function scopeParentOf(key: ScopeKey): ScopeKey | undefined {
  return scopeParents.get(key);
}

/** 近 → 远：[key, parent, …] */
export function scopeChainOf(key: ScopeKey | undefined): ScopeKey[] {
  const chain: ScopeKey[] = [];
  for (let cursor = key; cursor !== undefined; cursor = scopeParents.get(cursor)) chain.push(cursor);
  return chain;
}

export function tagContext(ctx: object, key: ScopeKey): void {
  scopeTags.set(ctx, key);
}

export function scopeOf(ctx: object): ScopeKey | undefined {
  return scopeTags.get(ctx);
}

/** 未打标监听器全收；打标的只收 subject 或其祖先 */
export function scopeAdmits(listenerTag: ScopeKey | undefined, subject: ScopeKey | undefined): boolean {
  if (listenerTag === undefined) return true;
  for (let cursor = subject; cursor !== undefined; cursor = scopeParents.get(cursor)) {
    if (cursor === listenerTag) return true;
  }
  return false;
}

export function setEventSubject(event: object, key: ScopeKey | undefined): void {
  if (key !== undefined) (event as Record<symbol, ScopeKey>)[kEventSubject] = key;
}

export function eventSubjectOf(event: object): ScopeKey | undefined {
  return (event as Record<symbol, ScopeKey | undefined>)[kEventSubject];
}
