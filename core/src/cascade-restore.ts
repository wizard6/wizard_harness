/** 记录级联卸载的孤儿插件，供父插件重装时自动恢复（手动卸载的不恢复） */
export interface CascadeRestoreSnapshot {
  readonly manualUninstalls: readonly string[];
  readonly orphans: Readonly<Record<string, string>>;
}

export class CascadeRestoreBook {
  private readonly manual = new Set<string>();
  private readonly orphans = new Map<string, string>();

  static fromSnapshot(raw: CascadeRestoreSnapshot | null | undefined): CascadeRestoreBook {
    const book = new CascadeRestoreBook();
    if (!raw) return book;
    for (const id of raw.manualUninstalls ?? []) book.manual.add(String(id));
    for (const [victim, parent] of Object.entries(raw.orphans ?? {})) {
      book.orphans.set(String(victim), String(parent));
    }
    return book;
  }

  toSnapshot(): CascadeRestoreSnapshot {
    return {
      manualUninstalls: [...this.manual],
      orphans: Object.fromEntries(this.orphans),
    };
  }

  /** 用户主动卸载 parent；cascaded 为其级联卸掉的插件 id（扁平列表） */
  recordManualUninstall(parentId: string, cascaded: readonly string[]): void {
    const parent = String(parentId);
    this.manual.add(parent);
    this.orphans.delete(parent);
    for (const vid of cascaded) {
      const id = String(vid);
      if (!this.manual.has(id)) this.orphans.set(id, parent);
    }
  }

  /** 热重载时：把级联卸掉的插件记为可恢复孤儿（不记入 manual） */
  recordReloadCascade(parentId: string, cascaded: readonly string[]): void {
    const parent = String(parentId);
    for (const vid of cascaded) {
      const id = String(vid);
      if (!this.manual.has(id)) this.orphans.set(id, parent);
    }
  }

  /** 因父插件装入而应尝试恢复的孤儿 id */
  orphansForParents(parentIds: readonly string[]): string[] {
    const parents = new Set(parentIds.map(String));
    return [...this.orphans.entries()]
      .filter(([victim, parent]) => parents.has(parent) && !this.manual.has(victim))
      .map(([victim]) => victim);
  }

  markRestored(ids: readonly string[]): void {
    for (const id of ids) this.orphans.delete(String(id));
  }

  isManual(id: string): boolean {
    return this.manual.has(String(id));
  }
}
