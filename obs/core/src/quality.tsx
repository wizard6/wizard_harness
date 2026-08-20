import React, { useEffect, useMemo, useRef, useState } from 'react';

/** 质检数据行：单个文件较上次质检的修改状态（基线扫描 + 智能评审两个维度） */
export interface QualityRow {
  rel: string;
  lines: number;
  /** 基线维度修改状态（相对结构检查基准 hash） */
  status: 'unchanged' | 'modified' | 'added' | 'removed';
  /** 基线扫描基准 hash */
  lastHash: string;
  curHash: string;
  /** 基线扫描问题 */
  lastIssues: string[];
  /** 智能评审基准 hash */
  aiHash: string;
  /** 智能评审结论（空 = 通过） */
  aiIssues: string[];
  /** 智能维度修改状态（相对智能评审基准 hash） */
  aiStatus: 'unchanged' | 'modified' | 'added' | 'removed';
}

/** 质检面板数据（由 obs/gui 主进程实时计算后经 IPC 提供） */
export interface QualityData {
  generatedAt: string;
  /** 基线扫描对照时间（上次结构检查） */
  baseAt: string | null;
  /** 智能评审对照时间（各文件 aiCheckedAt 的最近一次） */
  aiAt: string | null;
  counts: {
    total: number;
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  };
  rows: QualityRow[];
}

export interface QualityPanelProps {
  data: QualityData;
  /** 最近一次拉取是否失败（用于展示错误态） */
  error?: string | null;
  /** 数据拉取中（显示加载动画） */
  loading?: boolean;
  /** 基线扫描执行中 */
  scanning?: boolean;
  /** 手动刷新回调（只重读状态，不跑检查） */
  onRefresh?: () => void;
  /** 基线扫描回调（跑 quality-check 并更新基线） */
  onRuleScan?: () => void;
  /** 在编辑器中打开源文件 */
  onOpenFile?: (rel: string) => void;
}

type Filter = 'all' | QualityRow['status'];
type Dim = 'base' | 'smart';
type DimCounts = QualityData['counts'];
type ReviewFilter = 'all' | 'pass' | 'wait' | 'none' | 'fail';
type LinesFilter = 'all' | 'lt80' | 'mid' | 'gt300';
type HashFilter = 'all' | 'changed' | 'same';

type FolderNode = {
  name: string;
  path: string;
  count: number;
  children: FolderNode[];
};

const STATUS_TEXT: Record<QualityRow['status'], string> = {
  unchanged: '未修改',
  modified: '已修改',
  added: '新增',
  removed: '删除',
};

const short = (h: string): string => (h ? `${h.slice(0, 8)}…` : '—');

const fmtAt = (iso: string | null | undefined): string => {
  if (!iso) return '无记录';
  return iso.slice(0, 19).replace('T', ' ');
};

/** 按某一维统计胶囊数字（与另一维过滤无关，避免两维互相污染） */
function dimCounts(rows: QualityRow[], key: 'status' | 'aiStatus'): DimCounts {
  const c: DimCounts = { total: rows.length, unchanged: 0, modified: 0, added: 0, removed: 0 };
  for (const r of rows) c[r[key]] += 1;
  return c;
}

const fileName = (rel: string): string => {
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(i + 1) : rel;
};

const fileDir = (rel: string): string => {
  const i = rel.lastIndexOf('/');
  return i > 0 ? rel.slice(0, i) : '';
};

const inFolder = (rel: string, folder: string): boolean => {
  if (!folder) return true;
  return rel === folder || rel.startsWith(`${folder}/`);
};

function reviewKind(r: QualityRow, dim: Dim): Exclude<ReviewFilter, 'all'> {
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
function hashKind(r: QualityRow, dim: Dim): 'changed' | 'same' | 'none' {
  const last = dim === 'base' ? r.lastHash : r.aiHash;
  if (!last) return 'none';
  return last !== r.curHash ? 'changed' : 'same';
}

type ColSkip = 'status' | 'query' | 'lines' | 'review' | 'hash';

/** 列筛选：skip 本列时用于表头下拉计数（Excel 口径，与目录树同源） */
function rowPass(
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

function linesMatch(lines: number, f: LinesFilter): boolean {
  if (f === 'all') return true;
  if (f === 'lt80') return lines > 0 && lines < 80;
  if (f === 'mid') return lines >= 80 && lines <= 300;
  return lines > 300;
}

/** 目录树：结构来自全部文件，计数跟随当前列筛选（不含目录本身） */
function buildFolderTree(all: QualityRow[], counted: QualityRow[]): FolderNode {
  type Mut = { name: string; path: string; count: number; kids: Map<string, Mut> };
  const root: Mut = { name: '全部', path: '', count: counted.length, kids: new Map() };
  const walk = (rel: string, add: number) => {
    const dir = fileDir(rel);
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

/** 质量检测面板：一次只看一个维度，基线扫描与智能评审互不混用 */
export function QualityPanel({ data, error, loading, scanning, onRefresh, onRuleScan, onOpenFile }: QualityPanelProps): React.ReactElement {
  const [dim, setDim] = useState<Dim>('base');
  const [baseFilter, setBaseFilter] = useState<Filter>('all');
  const [smartFilter, setSmartFilter] = useState<Filter>('all');
  const [folderFilter, setFolderFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [linesFilter, setLinesFilter] = useState<LinesFilter>('all');
  const [hashFilter, setHashFilter] = useState<HashFilter>('all');
  const prevScanning = useRef(Boolean(scanning));
  const treeInited = useRef(false);

  const baseCounts = dimCounts(data.rows, 'status');
  const smartCounts = dimCounts(data.rows, 'aiStatus');
  const filter = dim === 'base' ? baseFilter : smartFilter;
  const setFilter = dim === 'base' ? setBaseFilter : setSmartFilter;
  const statusOf = (r: QualityRow): QualityRow['status'] => (dim === 'base' ? r.status : r.aiStatus);
  const lastHashOf = (r: QualityRow): string => (dim === 'base' ? r.lastHash : r.aiHash);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (prevScanning.current && !scanning) setDim('base');
    prevScanning.current = Boolean(scanning);
  }, [scanning]);

  const colFiltered = useMemo(
    () => data.rows.filter((r) => rowPass(r, dim, filter, q, linesFilter, reviewFilter, hashFilter)),
    [data.rows, dim, filter, q, linesFilter, reviewFilter, hashFilter],
  );
  const tree = useMemo(() => buildFolderTree(data.rows, colFiltered), [data.rows, colFiltered]);

  useEffect(() => {
    if (treeInited.current || tree.children.length === 0) return;
    treeInited.current = true;
    setExpanded(new Set(tree.children.map((c) => c.path)));
  }, [tree]);

  useEffect(() => {
    if (!folderFilter) return;
    const parts = folderFilter.split('/');
    let acc = '';
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        next.add(acc);
      }
      return next;
    });
  }, [folderFilter]);

  const shown = colFiltered.filter((r) => inFolder(r.rel, folderFilter));
  const firstLoad = data.rows.length === 0 && loading === true;

  const accent = dim === 'base' ? '#79c0ff' : '#a371f7';
  const statusCounts = useMemo(() => {
    const pool = data.rows.filter((r) => rowPass(r, dim, filter, q, linesFilter, reviewFilter, hashFilter, 'status'));
    return dimCounts(pool, dim === 'base' ? 'status' : 'aiStatus');
  }, [data.rows, dim, filter, q, linesFilter, reviewFilter, hashFilter]);
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: statusCounts.total },
    { key: 'unchanged', label: '未修改', count: statusCounts.unchanged },
    { key: 'modified', label: '已修改', count: statusCounts.modified },
    { key: 'added', label: '新增', count: statusCounts.added },
    { key: 'removed', label: '删除', count: statusCounts.removed },
  ];
  const reviewCounts = useMemo(() => {
    const pool = data.rows.filter((r) => rowPass(r, dim, filter, q, linesFilter, reviewFilter, hashFilter, 'review'));
    const c = { all: pool.length, pass: 0, wait: 0, none: 0, fail: 0 };
    for (const r of pool) c[reviewKind(r, dim)] += 1;
    return c;
  }, [data.rows, dim, filter, q, linesFilter, reviewFilter, hashFilter]);
  const hashCounts = useMemo(() => {
    const pool = data.rows.filter((r) => rowPass(r, dim, filter, q, linesFilter, reviewFilter, hashFilter, 'hash'));
    let changed = 0;
    let same = 0;
    for (const r of pool) {
      const k = hashKind(r, dim);
      if (k === 'changed') changed += 1;
      else if (k === 'same') same += 1;
    }
    return { all: pool.length, changed, same };
  }, [data.rows, dim, filter, q, linesFilter, reviewFilter, hashFilter]);

  const toggleExpand = (p: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const badge = (status: QualityRow['status']): React.ReactElement => (
    <span className={`qp-badge qp-b-${status}`}>{STATUS_TEXT[status]}</span>
  );

  const review = (r: QualityRow): React.ReactElement => {
    const kind = reviewKind(r, dim);
    const issues = dim === 'base' ? r.lastIssues : r.aiIssues;
    if (kind === 'none') {
      return (
        <span className="qp-badge qp-b-none" title={dim === 'base' ? '尚无基线评审' : '尚未做智能评审'}>
          未评审
        </span>
      );
    }
    if (kind === 'wait') {
      return (
        <span
          className="qp-badge qp-b-wait"
          title={dim === 'base' ? '相对基线已改，待重新扫描' : '相对智能评审基线已改，等待重新评审'}
        >
          {dim === 'base' ? '待重查' : '待评审'}
        </span>
      );
    }
    if (kind === 'fail') {
      return (
        <span className="qp-badge qp-b-fail" title={issues.join('\n')}>
          ⚠ {issues.length} 项
        </span>
      );
    }
    return <span className="qp-badge qp-b-pass">✓ 通过</span>;
  };

  const fingerprint = (r: QualityRow): React.ReactElement => {
    const last = lastHashOf(r);
    const st = statusOf(r);
    if (st === 'added' || !last) {
      return <span className="mono dim" title={r.curHash}>{short(r.curHash)}</span>;
    }
    if (st === 'removed') {
      return <span className="mono dim" title={last}>{short(last)}</span>;
    }
    if (st === 'modified') {
      return (
        <span className="qp-hash-diff" title={`${last}\n→\n${r.curHash}`}>
          <span className="mono dim">{short(last)}</span>
          <span className="qp-hash-arrow">→</span>
          <span className="mono">{short(r.curHash)}</span>
        </span>
      );
    }
    return <span className="mono dim" title={r.curHash}>{short(r.curHash)}</span>;
  };

  const fileCell = (r: QualityRow): React.ReactElement => {
    const dir = fileDir(r.rel);
    const name = fileName(r.rel);
    const segs = dir ? dir.split('/') : [];
    let acc = '';
    return (
      <td className="qp-file" title={r.rel}>
        {segs.map((seg) => {
          acc = acc ? `${acc}/${seg}` : seg;
          const prefix = acc;
          return (
            <React.Fragment key={prefix}>
              <button
                type="button"
                className={`qp-path-seg${folderFilter === prefix ? ' on' : ''}`}
                title={`筛选 ${prefix}`}
                onClick={() => setFolderFilter(prefix)}
              >
                {seg}
              </button>
              <span className="qp-slash">/</span>
            </React.Fragment>
          );
        })}
        <button
          type="button"
          className="qp-name"
          title={onOpenFile ? '在编辑器中打开' : name}
          onClick={() => onOpenFile?.(r.rel)}
        >
          {name}
        </button>
      </td>
    );
  };

  const renderRow = (r: QualityRow): React.ReactElement => (
    <tr key={r.rel} className={statusOf(r) === 'modified' ? 'qp-row-mod' : undefined}>
      <td>{badge(statusOf(r))}</td>
      {fileCell(r)}
      <td className="dim">{r.lines || '—'}</td>
      <td>{review(r)}</td>
      <td>{fingerprint(r)}</td>
    </tr>
  );

  const renderTree = (node: FolderNode, depth: number): React.ReactNode => {
    const hasKids = node.children.length > 0;
    const open = !node.path || expanded.has(node.path);
    const active = folderFilter === node.path;
    return (
      <React.Fragment key={node.path || '/'}>
        <div
          className={`qp-tree-row${active ? ' on' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => setFolderFilter(node.path)}
          title={node.path || '全部文件'}
        >
          {hasKids ? (
            <button type="button" className="qp-tree-caret" onClick={(e) => toggleExpand(node.path, e)}>
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="qp-tree-caret qp-tree-leaf" />
          )}
          <span className="qp-tree-name">{node.name}</span>
          <span className="qp-tree-n">{node.count}</span>
        </div>
        {hasKids && open ? node.children.map((ch) => renderTree(ch, depth + 1)) : null}
      </React.Fragment>
    );
  };

  const dimBtn = (id: Dim, label: string, c: DimCounts, hint: string): React.ReactElement => (
    <button
      type="button"
      className={`qp-dim-btn ${id}${dim === id ? ' active' : ''}`}
      title={hint}
      onClick={() => setDim(id)}
    >
      {label}
      <span className="qp-dim-stats">
        <span className={`mod${c.modified ? ' on' : ''}`} title="已修改">改 {c.modified}</span>
        <span className={`add${c.added ? ' on' : ''}`} title="新增">增 {c.added}</span>
        <span className={`del${c.removed ? ' on' : ''}`} title="删除">删 {c.removed}</span>
      </span>
    </button>
  );

  const clearFilters = () => {
    setFilter('all');
    setQuery('');
    setFolderFilter('');
    setReviewFilter('all');
    setLinesFilter('all');
    setHashFilter('all');
  };
  const hasFilters =
    filter !== 'all' || Boolean(q) || Boolean(folderFilter) || reviewFilter !== 'all' || linesFilter !== 'all' || hashFilter !== 'all';

  return (
    <div className={`qp qp-${dim}`} style={{ ['--qp-accent' as string]: accent }}>
      <style>{`
        .qp { font: 13px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
              padding: 14px 18px 12px; height: 100%; box-sizing: border-box;
              display: flex; flex-direction: column; min-height: 0;
              --qp-accent: #79c0ff; }
        .qp-smart { --qp-accent: #a371f7; }
        .qp-head { display:flex; align-items:center; gap:12px; margin-bottom:8px; flex:none; }
        .qp-sub { color:#8b949e; font-size:11px; margin:0 auto 0 4px; min-width:0;
                  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qp-sub .mono { font-family:ui-monospace,Consolas,monospace; }
        .qp-actions { display:inline-flex; align-items:center; gap:2px; flex:none; }
        .qp-act { background:transparent; color:#a8a8bd; border:none; border-radius:6px;
                  padding:6px 10px; cursor:pointer; font-size:12px; font-family:inherit;
                  display:inline-flex; align-items:center; gap:6px; }
        .qp-act:hover:not(:disabled) { color:#e6e6ef; background:rgba(255,255,255,.06); }
        .qp-act:disabled { opacity:.55; cursor:default; }
        .qp-act.primary { color:#79c0ff; }
        .qp-act.primary:hover:not(:disabled) { color:#bcdfff; background:rgba(121,192,255,.1); }
        .qp-spin { width:12px; height:12px; border:2px solid rgba(255,255,255,.2); border-top-color:#79c0ff;
                   border-radius:50%; animation:qp-rot .7s linear infinite; display:inline-block; flex:none; }
        .qp-spin-lg { width:20px; height:20px; border-width:2.5px; }
        @keyframes qp-rot { to { transform:rotate(360deg); } }
        .qp-loading { display:flex; align-items:center; justify-content:center; gap:10px;
                      padding:48px 0; color:#a8a8bd; font-size:13px; flex:1; }
        .qp-err { color:#ff7b72; font-size:12px; margin-bottom:10px; flex:none; }
        .qp-dims { display:flex; gap:2px; flex:none; }
        .qp-dim-btn { background:transparent; border:none; color:#8b8b9c; padding:5px 10px;
                      font-size:13px; font-family:inherit; cursor:pointer; display:inline-flex;
                      align-items:center; gap:10px; font-weight:600; border-radius:8px;
                      transition:color .12s ease, background .12s ease; }
        .qp-dim-btn:hover { color:#e6e6ef; background:rgba(255,255,255,.05); }
        .qp-dim-btn.base.active { color:#9ecbff; background:rgba(121,192,255,.1); }
        .qp-dim-btn.smart.active { color:#c4b0f0; background:rgba(163,113,247,.1); }
        .qp-dim-stats { display:flex; gap:7px; font-size:11px; font-weight:600; letter-spacing:.02em; }
        .qp-dim-stats .mod { color:#8a7a4a; }
        .qp-dim-stats .add { color:#5d7a96; }
        .qp-dim-stats .del { color:#8a5e5c; }
        .qp-dim-stats .mod.on { color:#d4b44a; }
        .qp-dim-stats .add.on { color:#7db0d8; }
        .qp-dim-stats .del.on { color:#e08b86; }
        .qp-folder-chip { display:inline-flex; align-items:center; max-width:88px;
                          background:rgba(255,255,255,.05); color:#c8c8d4;
                          border:1px solid rgba(255,255,255,.1); border-radius:6px;
                          padding:2px 6px; font-size:11px; font-family:inherit; cursor:pointer;
                          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:none; }
        .qp-folder-chip:hover { border-color:rgba(255,255,255,.2); color:#e6e6ef; }
        .qp-th { display:flex; flex-direction:row; align-items:center; gap:6px;
                 white-space:nowrap; font-weight:600; min-width:0; }
        .qp-th-label { color:#a8a8bd; font-size:11px; flex:none; }
        .qp-th-filter, .qp-th-input {
          box-sizing:border-box; background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.1); border-radius:6px; color:#d7d7e0;
          font-size:11px; font-family:inherit; outline:none; padding:3px 6px; height:24px;
        }
        .qp-th-filter { min-width:0; max-width:118px; flex:1; }
        .qp-th-input { width:112px; flex:none; }
        .qp-th-filter:focus, .qp-th-input:focus { border-color:rgba(255,255,255,.22); }
        .qp-th-filter option { background:#1b1b24; }
        .qp-th-input::placeholder { color:#7a7a8a; }
        .qp-th-clear { width:20px; height:20px; flex:none; border:none; border-radius:4px;
                       background:transparent; color:#8b8b9c; cursor:pointer; font-size:13px;
                       line-height:20px; padding:0; }
        .qp-th-clear:hover { color:#e6e6ef; background:rgba(255,255,255,.08); }
        .qp-st-unchanged { color:#7ee787 !important; }
        .qp-st-modified { color:#d29922 !important; }
        .qp-st-added { color:var(--qp-accent) !important; }
        .qp-st-removed { color:#ff7b72 !important; }
        .qp-rv-pass { color:#7ee787 !important; }
        .qp-rv-wait { color:#d29922 !important; }
        .qp-rv-none { color:#a8a8bd !important; }
        .qp-rv-fail { color:#ff7b72 !important; }
        .qp-hs-changed { color:#d29922 !important; }
        .qp-hs-same { color:#7ee787 !important; }
        .qp-body { display:flex; flex:1; min-height:0; gap:10px; }
        .qp-tree { width:228px; flex:none; overflow:auto; scrollbar-gutter:stable;
                   border:1px solid rgba(255,255,255,.08); border-radius:12px;
                   background:rgba(255,255,255,.045); padding:8px 6px; }
        .qp-tree-row { display:flex; align-items:center; gap:4px; padding:3px 8px 3px 0;
                       border-radius:6px; cursor:pointer; color:#c8c8d4; font-size:12px; }
        .qp-tree-row:hover { background:rgba(255,255,255,.05); color:#e6e6ef; }
        .qp-tree-row.on { background:color-mix(in srgb, var(--qp-accent) 16%, transparent); color:var(--qp-accent); }
        .qp-tree-caret { width:16px; flex:none; background:none; border:none; color:inherit;
                         cursor:pointer; font-size:11px; padding:0; font-family:inherit; }
        .qp-tree-leaf { visibility:hidden; }
        .qp-tree-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qp-tree-n { margin-left:auto; color:#8b949e; font-size:10px; font-weight:600; flex:none; }
        .qp-tree-row.on .qp-tree-n { color:var(--qp-accent); }
        .qp-table-wrap { flex:1; min-width:0; min-height:0; overflow:auto; border:1px solid rgba(255,255,255,.08);
                         border-radius:12px; background:rgba(255,255,255,.045);
                         scrollbar-gutter: stable; }
        .qp table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .qp th,.qp td { text-align:center; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:middle; }
        .qp th { color:#a8a8bd; font-weight:600; font-size:11px; background:#1b1b24;
                 position:sticky; top:0; z-index:1; text-align:left; vertical-align:middle;
                 white-space:nowrap; }
        .qp td.qp-file { text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qp-path-seg, .qp-name, .qp-slash { font: inherit; }
        .qp-path-seg, .qp-name { background:none; border:none; padding:0; cursor:pointer;
                                 font-family:ui-monospace,Consolas,monospace; font-size:12px; }
        .qp-path-seg { color:#8b949e; }
        .qp-path-seg:hover, .qp-path-seg.on { color:var(--qp-accent); text-decoration:underline; }
        .qp-slash { color:#6e6e80; }
        .qp-name { color:#e6e6ef; }
        .qp-name:hover { color:var(--qp-accent); text-decoration:underline; }
        .qp tr:last-child td { border-bottom:none; }
        .qp tbody tr:hover td { background:rgba(255,255,255,.03); }
        .qp tbody tr.qp-row-mod td { background:rgba(210,153,34,.05); }
        .qp .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; }
        .qp .dim { color:#8b949e; }
        .qp-badge { display:inline-flex; align-items:center; justify-content:center;
                    min-width:76px; height:22px; box-sizing:border-box;
                    font-size:11px; padding:0 10px; border-radius:999px; font-weight:600;
                    white-space:nowrap; border:1px solid transparent; }
        .qp-b-unchanged { color:#7ee787; background:rgba(126,231,135,.12); }
        .qp-b-modified { color:#d29922; background:rgba(210,153,34,.14); }
        .qp-b-added { color:var(--qp-accent); background:color-mix(in srgb, var(--qp-accent) 14%, transparent); }
        .qp-b-removed { color:#ff7b72; background:rgba(255,123,114,.12); text-decoration:line-through; }
        .qp-b-pass { color:#7ee787; background:rgba(126,231,135,.12); }
        .qp-b-fail { color:#ff7b72; background:rgba(255,123,114,.12); }
        .qp-b-wait { color:#d29922; border-style:dashed; border-color:#d29922; background:transparent; }
        .qp-b-none { color:#a8a8bd; border-style:dashed; border-color:rgba(168,168,189,.45); background:transparent; }
        .qp-hash-diff { display:inline-flex; align-items:center; gap:6px; }
        .qp-hash-arrow { color:#d29922; font-size:11px; }
        .qp-empty { text-align:center !important; color:#a8a8bd; padding:36px 12px !important; }
        .qp-empty button { margin-left:10px; background:transparent; color:var(--qp-accent); border:none;
                           cursor:pointer; font-family:inherit; font-size:12px; }
        .qp-foot { flex:none; margin-top:8px; color:#8b949e; font-size:11px; }
      `}</style>

      <div className="qp-head">
        <div className="qp-dims">
          {dimBtn('base', '基线', baseCounts, '结构规则扫描结果')}
          {dimBtn('smart', '智能', smartCounts, '智能评审结果，与基线相互独立')}
        </div>
        <span className="qp-sub">
          {dim === 'base' ? '基线对照' : '智能对照'}{' '}
          <span className="mono">{fmtAt(dim === 'base' ? data.baseAt : data.aiAt)}</span>
        </span>
        <div className="qp-actions">
          {hasFilters && (
            <button type="button" className="qp-act" onClick={clearFilters} title="清除全部筛选">
              清除
            </button>
          )}
          {onRuleScan && (
            <button
              type="button"
              className="qp-act primary"
              onClick={onRuleScan}
              disabled={scanning || loading}
              title="按规则扫描源码结构，只更新基线；不会改动智能评审"
            >
              {scanning ? (
                <>
                  <span className="qp-spin" />
                  扫描中
                </>
              ) : (
                '基线扫描'
              )}
            </button>
          )}
          <button type="button" className="qp-act" onClick={onRefresh} disabled={loading} title="重新读取质检状态（不执行扫描）">
            刷新
          </button>
        </div>
      </div>

      {error && <div className="qp-err">拉取失败：{error}</div>}

      {firstLoad ? (
        <div className="qp-loading">
          <span className="qp-spin qp-spin-lg" />
          加载中…
        </div>
      ) : (
      <>
      <div className="qp-body">
      <aside className="qp-tree">{renderTree(tree, 0)}</aside>
      <div className="qp-table-wrap">
      <table>
        <colgroup>
          <col style={{ width: 168 }} />
          <col />
          <col style={{ width: 118 }} />
          <col style={{ width: 148 }} />
          <col style={{ width: 148 }} />
        </colgroup>
        <thead>
          <tr>
            <th>
              <div className="qp-th">
                <span className="qp-th-label">状态</span>
                <select
                  className={`qp-th-filter${filter === 'all' ? '' : ` qp-st-${filter}`}`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as Filter)}
                >
                  {tabs.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label} {t.count}
                    </option>
                  ))}
                </select>
              </div>
            </th>
            <th>
              <div className="qp-th">
                <span className="qp-th-label">文件</span>
                {folderFilter ? (
                  <button type="button" className="qp-folder-chip" title="清除目录筛选" onClick={() => setFolderFilter('')}>
                    {fileName(folderFilter) || folderFilter} ×
                  </button>
                ) : null}
                <input
                  className="qp-th-input"
                  placeholder="过滤…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setQuery('');
                      setFolderFilter('');
                    }
                  }}
                />
                {(query || folderFilter) && (
                  <button
                    type="button"
                    className="qp-th-clear"
                    title="清除文件筛选"
                    onClick={() => {
                      setQuery('');
                      setFolderFilter('');
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </th>
            <th>
              <div className="qp-th">
                <span className="qp-th-label">行数</span>
                <select
                  className="qp-th-filter"
                  value={linesFilter}
                  onChange={(e) => setLinesFilter(e.target.value as LinesFilter)}
                >
                  <option value="all">全部</option>
                  <option value="lt80">&lt; 80</option>
                  <option value="mid">80–300</option>
                  <option value="gt300">&gt; 300</option>
                </select>
              </div>
            </th>
            <th>
              <div className="qp-th">
                <span className="qp-th-label">评审</span>
                <select
                  className={`qp-th-filter${reviewFilter === 'all' ? '' : ` qp-rv-${reviewFilter}`}`}
                  value={reviewFilter}
                  onChange={(e) => setReviewFilter(e.target.value as ReviewFilter)}
                >
                  <option value="all">全部 {reviewCounts.all}</option>
                  <option value="pass">通过 {reviewCounts.pass}</option>
                  <option value="wait">{dim === 'base' ? '待重查' : '待评审'} {reviewCounts.wait}</option>
                  <option value="none">未评审 {reviewCounts.none}</option>
                  <option value="fail">有问题 {reviewCounts.fail}</option>
                </select>
              </div>
            </th>
            <th>
              <div className="qp-th">
                <span className="qp-th-label">指纹</span>
                <select
                  className={`qp-th-filter${hashFilter === 'all' ? '' : ` qp-hs-${hashFilter}`}`}
                  value={hashFilter}
                  onChange={(e) => setHashFilter(e.target.value as HashFilter)}
                >
                  <option value="all">全部 {hashCounts.all}</option>
                  <option value="changed">已变化 {hashCounts.changed}</option>
                  <option value="same">未变化 {hashCounts.same}</option>
                </select>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td className="qp-empty" colSpan={5}>
                {hasFilters ? '没有匹配的文件' : '没有符合筛选的文件'}
                {hasFilters && (
                  <button type="button" onClick={clearFilters}>
                    清除筛选
                  </button>
                )}
              </td>
            </tr>
          ) : (
            shown.map((r) => renderRow(r))
          )}
        </tbody>
      </table>
      </div>
      </div>
      <div className="qp-foot">显示 {shown.length} / {data.rows.length} · 当前{dim === 'base' ? '基线' : '智能'} · {filter === 'all' ? '全部' : STATUS_TEXT[filter]}{folderFilter ? ` · ${folderFilter}` : ''}</div>
      </>
      )}
    </div>
  );
}
