/** 不透明、按对象身份比较的 scope key */
export type ScopeKey = object;

const S = {
  kEventSubject: Symbol('wh.event.scope'),
  parents: new WeakMap<ScopeKey, ScopeKey>(),
  tags: new WeakMap<object, ScopeKey>(),
};

export function bindScopeParent(key: ScopeKey, parent: ScopeKey): ScopeParentBinding {
  const link = (next: ScopeKey) => {
    for (let cursor: ScopeKey | undefined = next; cursor !== undefined; cursor = S.parents.get(cursor)) {
      if (cursor === key) throw new Error('scope parent 成环');
    }
    S.parents.set(key, next);
  };
  if (S.parents.has(key)) {
    throw new Error('scope key 已绑定 parent；改绑请用 bind 返回的 rebind');
  }
  link(parent);
  return { rebind: link };
}

export function scopeParentOf(key: ScopeKey): ScopeKey | undefined {
  return S.parents.get(key);
}

export interface ScopeParentBinding {
  rebind(parent: ScopeKey): void;
}

export function scopeChainOf(key: ScopeKey | undefined): ScopeKey[] {
  const chain: ScopeKey[] = [];
  for (let cursor = key; cursor !== undefined; cursor = S.parents.get(cursor)) chain.push(cursor);
  return chain;
}

export function tagContext(ctx: object, key: ScopeKey): void {
  S.tags.set(ctx, key);
}

export function scopeOf(ctx: object): ScopeKey | undefined {
  return S.tags.get(ctx);
}

/** 未打标监听器全收；打标的只收 subject 或其祖先 */
export function scopeAdmits(listenerTag: ScopeKey | undefined, subject: ScopeKey | undefined): boolean {
  if (listenerTag === undefined) return true;
  for (let cursor = subject; cursor !== undefined; cursor = S.parents.get(cursor)) {
    if (cursor === listenerTag) return true;
  }
  return false;
}

export function setEventSubject(event: object, key: ScopeKey | undefined): void {
  if (key !== undefined) (event as Record<symbol, ScopeKey>)[S.kEventSubject] = key;
}

export function eventSubjectOf(event: object): ScopeKey | undefined {
  return (event as Record<symbol, ScopeKey | undefined>)[S.kEventSubject];
}
