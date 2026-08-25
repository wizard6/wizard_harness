import type { QualityData, QualityRow } from './quality.js';

export type Filter = 'all' | QualityRow['status'];
export type Dim = 'base' | 'smart';
export type DimCounts = QualityData['counts'];
export type ReviewFilter = 'all' | 'pass' | 'wait' | 'none' | 'fail';
export type LinesFilter = 'all' | 'lt80' | 'mid' | 'gt300';
export type HashFilter = 'all' | 'changed' | 'same';

export type FolderNode = {
  name: string;
  path: string;
  count: number;
  children: FolderNode[];
};

export const STATUS_TEXT: Record<QualityRow['status'], string> = {
  unchanged: '未修改',
  modified: '已修改',
  added: '新增',
  removed: '删除',
};

export const fmt = {
  short(h: string): string {
    return h ? `${h.slice(0, 8)}…` : '—';
  },
  at(iso: string | null | undefined): string {
    if (!iso) return '无记录';
    return iso.slice(0, 19).replace('T', ' ');
  },
};

export const pathOf = {
  fileName(rel: string): string {
    const i = rel.lastIndexOf('/');
    return i >= 0 ? rel.slice(i + 1) : rel;
  },
  fileDir(rel: string): string {
    const i = rel.lastIndexOf('/');
    return i > 0 ? rel.slice(0, i) : '';
  },
  inFolder(rel: string, folder: string): boolean {
    if (!folder) return true;
    return rel === folder || rel.startsWith(`${folder}/`);
  },
};

/** 按某一维统计胶囊数字（与另一维过滤无关，避免两维互相污染） */
export function dimCounts(rows: QualityRow[], key: 'status' | 'aiStatus'): DimCounts {
  const c: DimCounts = { total: rows.length, unchanged: 0, modified: 0, added: 0, removed: 0 };
  for (const r of rows) c[r[key]] += 1;
  return c;
}

export function reviewKind(r: QualityRow, dim: Dim): Exclude<ReviewFilter, 'all'> {
  if (dim === 'base') {
    if (r.status === 'added' || !r.lastHash) return 'none';
    if (r.status === 'modified') return 'wait';
    return r.lastIssues.length > 0 ? 'fail' : 'pass';
  }
  if (!r.aiHash || r.aiStatus === 'added') return 'none';
  if (r.aiStatus === 'modified') return 'wait';
  return r.aiIssues.length > 0 ? 'fail' : 'pass';
}

/** 指纹变化：无对照基准不计「未变化」，也不计「已变化」 */
export function hashKind(r: QualityRow, dim: Dim): 'changed' | 'same' | 'none' {
  const last = dim === 'base' ? r.lastHash : r.aiHash;
  if (!last) return 'none';
  return last !== r.curHash ? 'changed' : 'same';
}

type ColSkip = 'status' | 'query' | 'lines' | 'review' | 'hash';

/** 列筛选：skip 本列时用于表头下拉计数（Excel 口径，与目录树同源） */
export function rowPass(
  r: QualityRow,
  dim: Dim,
  status: Filter,
  qn: string,
  lines: LinesFilter,
  review: ReviewFilter,
  hash: HashFilter,
  skip?: ColSkip,
): boolean {
  if (skip !== 'status' && status !== 'all' && (dim === 'base' ? r.status : r.aiStatus) !== status) return false;
  if (skip !== 'query' && qn && !r.rel.toLowerCase().includes(qn)) return false;
  if (skip !== 'lines' && !linesMatch(r.lines, lines)) return false;
  if (skip !== 'review' && review !== 'all' && reviewKind(r, dim) !== review) return false;
  if (skip !== 'hash' && hash !== 'all' && hashKind(r, dim) !== hash) return false;
  return true;
}

export function linesMatch(lines: number, f: LinesFilter): boolean {
  if (f === 'all') return true;
  if (f === 'lt80') return lines > 0 && lines < 80;
  if (f === 'mid') return lines >= 80 && lines <= 300;
  return lines > 300;
}

/** 目录树：结构来自全部文件，计数跟随当前列筛选（不含目录本身） */
export function buildFolderTree(all: QualityRow[], counted: QualityRow[]): FolderNode {
  type Mut = { name: string; path: string; count: number; kids: Map<string, Mut> };
  const root: Mut = { name: '全部', path: '', count: counted.length, kids: new Map() };
  const walk = (rel: string, add: number) => {
    const dir = pathOf.fileDir(rel);
    if (!dir) return;
    let cur = root;
    let acc = '';
    for (const part of dir.split('/')) {
      acc = acc ? `${acc}/${part}` : part;
      let next = cur.kids.get(part);
      if (!next) {
        next = { name: part, path: acc, count: 0, kids: new Map() };
        cur.kids.set(part, next);
      }
      next.count += add;
      cur = next;
    }
  };
  for (const r of all) walk(r.rel, 0);
  for (const r of counted) walk(r.rel, 1);
  const freeze = (n: Mut): FolderNode => ({
    name: n.name,
    path: n.path,
    count: n.count,
    children: [...n.kids.values()].map(freeze).sort((a, b) => a.name.localeCompare(b.name)),
  });
  return freeze(root);
}
