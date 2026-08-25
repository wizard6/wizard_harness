import { describe, expect, it } from 'vitest';
import { CascadeRestoreBook } from '../src/cascade-restore.js';

describe('CascadeRestoreBook', () => {
  it('手动卸载记录级联孤儿，重装父插件时可恢复', () => {
    const book = new CascadeRestoreBook();
    book.recordManualUninstall('parent', ['child-a', 'child-b']);
    expect(book.orphansForParents(['parent'])).toEqual(['child-a', 'child-b']);
    book.markRestored(['child-a']);
    expect(book.orphansForParents(['parent'])).toEqual(['child-b']);
  });

  it('手动卸载的插件不会作为孤儿恢复', () => {
    const book = new CascadeRestoreBook();
    book.recordManualUninstall('parent', ['child']);
    book.recordManualUninstall('child', []);
    expect(book.orphansForParents(['parent'])).toEqual([]);
    expect(book.isManual('child')).toBe(true);
  });

  it('热重载级联记入孤儿但不记入 manual', () => {
    const book = new CascadeRestoreBook();
    book.recordReloadCascade('parent', ['dep']);
    expect(book.orphansForParents(['parent'])).toEqual(['dep']);
    expect(book.isManual('dep')).toBe(false);
    expect(book.isManual('parent')).toBe(false);
  });

  it('快照往返', () => {
    const book = CascadeRestoreBook.fromSnapshot({
      manualUninstalls: ['x'],
      orphans: { a: 'p', b: 'p' },
    });
    expect(book.isManual('x')).toBe(true);
    expect(book.orphansForParents(['p']).sort()).toEqual(['a', 'b']);
    expect(book.toSnapshot()).toEqual({
      manualUninstalls: ['x'],
      orphans: { a: 'p', b: 'p' },
    });
  });
});
