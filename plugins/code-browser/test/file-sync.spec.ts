import { describe, expect, it } from 'vitest';
import { FILE_SYNC_JS } from '../src/file-sync.js';

describe('file-sync', () => {
  it('导出轮询脚本', () => {
    expect(FILE_SYNC_JS).toContain('code-editor/changed');
    expect(FILE_SYNC_JS).toContain('startFileSync');
  });
});
