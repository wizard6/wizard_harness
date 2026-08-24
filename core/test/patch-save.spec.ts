import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PATCH_FILENAME } from '../src/profile/load.js';
import { readHomePatch, upsertHomePatch } from '../src/profile/save.js';

describe('home patch 持久化', () => {
  it('upsertHomePatch 按 id 合并并写文件', () => {
    const home = mkdtempSync(join(tmpdir(), 'wh-patch-'));
    upsertHomePatch(home, { id: 'hello', disabled: true });
    upsertHomePatch(home, { id: 'logger', disabled: false });
    upsertHomePatch(home, { id: 'hello', config: { level: 'debug' } });

    const rows = readHomePatch(home);
    expect(rows).toEqual([
      { id: 'hello', disabled: true, config: { level: 'debug' } },
      { id: 'logger', disabled: false },
    ]);
    const raw = JSON.parse(readFileSync(join(home, PATCH_FILENAME), 'utf8'));
    expect(raw).toHaveLength(2);
  });
});
