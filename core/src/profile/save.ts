import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePatchList } from './patch.js';
import type { PatchOptions } from './types.js';
import { PATCH_FILENAME } from './load.js';

/** 读 home 级 wizard.patch.json；缺文件返回 [] */
export function readHomePatch(homeDir: string): PatchOptions[] {
  const file = join(homeDir, PATCH_FILENAME);
  if (!existsSync(file)) return [];
  return parsePatchList(JSON.parse(readFileSync(file, 'utf8')), file);
}

/** 按 id 合并一行 patch 并写回 home 级 wizard.patch.json */
export function upsertHomePatch(homeDir: string, row: PatchOptions): void {
  if (!row.id) throw new Error('upsertHomePatch：缺少 id');
  mkdirSync(homeDir, { recursive: true });
  const file = join(homeDir, PATCH_FILENAME);
  const patches = readHomePatch(homeDir);
  const i = patches.findIndex((p) => p.id === row.id);
  if (i >= 0) patches[i] = { ...patches[i], ...row };
  else patches.push({ ...row });
  writeFileSync(file, `${JSON.stringify(patches, null, 2)}\n`, 'utf8');
}
