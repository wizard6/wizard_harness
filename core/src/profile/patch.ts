import type { ApplyPatchesResult, PatchOptions, PluginEntry } from './types.js';

function cloneEntry(e: PluginEntry): PluginEntry {
  return {
    id: e.id,
    name: e.name,
    ...(e.disabled !== undefined ? { disabled: e.disabled } : {}),
    ...(e.config !== undefined ? { config: { ...e.config } } : {}),
  };
}

function asEntry(raw: unknown, label: string): PluginEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label}：insert 项必须是对象`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) throw new Error(`${label}：缺少 id`);
  if (typeof o.name !== 'string' || !o.name) throw new Error(`${label}：缺少 name（${o.id}）`);
  if (o.config !== undefined && (typeof o.config !== 'object' || o.config === null || Array.isArray(o.config))) {
    throw new Error(`${label}：config 必须为对象（${o.id}）`);
  }
  if (o.disabled !== undefined && typeof o.disabled !== 'boolean') {
    throw new Error(`${label}：disabled 必须为布尔值（${o.id}）`);
  }
  return cloneEntry({
    id: o.id,
    name: o.name,
    disabled: o.disabled as boolean | undefined,
    config: o.config as Record<string, unknown> | undefined,
  });
}

/** 把 JSON 值校验为 patch 数组；非数组直接失败（fail-loud） */
export function parsePatchList(raw: unknown, label: string): PatchOptions[] {
  if (!Array.isArray(raw)) throw new Error(`${label}：patch 必须是顶层数组`);
  return raw.map((item, i) => parsePatchRow(item, `${label}[${i}]`));
}

function parsePatchRow(raw: unknown, label: string): PatchOptions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label}：patch 行必须是对象`);
  }
  const o = raw as Record<string, unknown>;
  const row: PatchOptions = {};
  if (o.id !== undefined) {
    if (typeof o.id !== 'string' || !o.id) throw new Error(`${label}：id 必须为非空字符串`);
    row.id = o.id;
  }
  if (o.name !== undefined) {
    if (typeof o.name !== 'string' || !o.name) throw new Error(`${label}：name 必须为字符串`);
    row.name = o.name;
  }
  if (o.disabled !== undefined) {
    if (typeof o.disabled !== 'boolean') throw new Error(`${label}：disabled 必须为布尔值`);
    row.disabled = o.disabled;
  }
  if (o.config !== undefined) {
    if (typeof o.config !== 'object' || o.config === null || Array.isArray(o.config)) {
      throw new Error(`${label}：config 必须为对象`);
    }
    row.config = { ...(o.config as Record<string, unknown>) };
  }
  if (o.insert !== undefined) {
    if (!Array.isArray(o.insert)) throw new Error(`${label}：insert 必须为数组`);
    row.insert = o.insert.map((e, j) => asEntry(e, `${label}.insert[${j}]`));
  }
  for (const k of ['before', 'after'] as const) {
    if (o[k] !== undefined) {
      if (typeof o[k] !== 'string' || !o[k]) throw new Error(`${label}：${k} 必须为非空字符串`);
      row[k] = o[k] as string;
    }
  }
  if (!row.id && !row.insert?.length) {
    throw new Error(`${label}：需要 id（覆盖）或 insert（插入）`);
  }
  return row;
}

/**
 * 将 patch 行应用到条目列表。输入不修改；无 patch 时也返回新数组（detachment）。
 * 单次扫描建索引：insert 的行可被后续同行覆盖。
 */
export function applyEntryPatches(
  base: readonly PluginEntry[],
  patches: readonly PatchOptions[],
): ApplyPatchesResult {
  const entries = base.map(cloneEntry);
  const warnings: string[] = [];
  const indexOf = (id: string) => entries.findIndex((e) => e.id === id);

  for (const patch of patches) {
    if (patch.id) {
      const i = indexOf(patch.id);
      if (i < 0) {
        warnings.push(`patch 目标 id 不存在：${patch.id}`);
      } else {
        const cur = entries[i];
        if (!cur) {
          warnings.push(`patch 目标 id 不存在：${patch.id}`);
        } else {
          const next = cloneEntry(cur);
          if (patch.name !== undefined) next.name = patch.name;
          if (patch.disabled !== undefined) next.disabled = patch.disabled;
          if (patch.config !== undefined) next.config = { ...patch.config };
          entries[i] = next;
        }
      }
    }
    if (patch.insert?.length) {
      let idx = entries.length;
      if (patch.before) {
        const i = indexOf(patch.before);
        if (i < 0) warnings.push(`insert.before 未找到：${patch.before}`);
        else idx = i;
      } else if (patch.after) {
        const i = indexOf(patch.after);
        if (i < 0) warnings.push(`insert.after 未找到：${patch.after}`);
        else idx = i + 1;
      }
      const seen = new Set(entries.map((e) => e.id));
      for (const e of patch.insert) {
        if (seen.has(e.id)) throw new Error(`重复 entry id：${e.id}`);
        seen.add(e.id);
        entries.splice(idx++, 0, cloneEntry(e));
      }
    }
  }
  return { entries, warnings };
}

/** 多层 patch 先展平再一次 apply（single flatten，避免层间重建索引漂移） */
export function composeLayers(layers: readonly (readonly PatchOptions[])[]): ApplyPatchesResult {
  return applyEntryPatches([], layers.flat());
}
