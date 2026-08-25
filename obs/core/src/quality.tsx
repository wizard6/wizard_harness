import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  STATUS_TEXT,
  buildFolderTree,
  dimCounts,
  fmt,
  hashKind,
  linesMatch,
  pathOf,
  reviewKind,
  rowPass,
  type Dim,
  type DimCounts,
  type Filter,
  type FolderNode,
  type HashFilter,
  type LinesFilter,
  type ReviewFilter,
} from './quality-helpers.js';
import { QUALITY_PANEL_CSS } from './quality-styles.js';

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
  /** 在代码浏览器独立窗口中打开 */
  onOpenFile?: (rel: string) => void;
}

/** 质量检测面板：一次只看一个维度，基线扫描与智能评审互不混用 */
export function QualityPanel({
  data,
  error,
  loading,
  scanning,
  onRefresh,
  onRuleScan,
  onOpenFile,
}: QualityPanelProps): React.ReactElement {
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

  const shown = colFiltered.filter((r) => pathOf.inFolder(r.rel, folderFilter));
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
      const preview = issues[0] ?? '';
      const more = issues.length > 1 ? ` 等 ${issues.length} 项` : '';
      return (
        <div className="qp-review-fail">
          <span className="qp-badge qp-b-fail">⚠ {issues.length} 项</span>
          <span className="qp-issue-preview" title={issues.join('\n')}>
            {preview}
            {more}
          </span>
        </div>
      );
    }
    return <span className="qp-badge qp-b-pass">✓ 通过</span>;
  };

  const fingerprint = (r: QualityRow): React.ReactElement => {
    const last = lastHashOf(r);
    const st = statusOf(r);
    if (st === 'added' || !last) {
      return <span className="mono dim" title={r.curHash}>{fmt.short(r.curHash)}</span>;
    }
    if (st === 'removed') {
      return <span className="mono dim" title={last}>{fmt.short(last)}</span>;
    }
    if (st === 'modified') {
      return (
        <span className="qp-hash-diff" title={`${last}\n→\n${r.curHash}`}>
          <span className="mono dim">{fmt.short(last)}</span>
          <span className="qp-hash-arrow">→</span>
          <span className="mono">{fmt.short(r.curHash)}</span>
        </span>
      );
    }
    return <span className="mono dim" title={r.curHash}>{fmt.short(r.curHash)}</span>;
  };

  const fileCell = (r: QualityRow): React.ReactElement => {
    const dir = pathOf.fileDir(r.rel);
    const name = pathOf.fileName(r.rel);
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
          title={onOpenFile ? '在代码浏览器窗口打开' : name}
          onClick={() => onOpenFile?.(r.rel)}
        >
          {name}
        </button>
      </td>
    );
  };

  const renderRow = (r: QualityRow): React.ReactElement => {
    const fail = reviewKind(r, dim) === 'fail';
    const mod = statusOf(r) === 'modified';
    const rowCls = [mod ? 'qp-row-mod' : '', fail ? 'qp-row-fail' : ''].filter(Boolean).join(' ') || undefined;
    return (
    <tr key={r.rel} className={rowCls}>
      <td className="qp-status">{badge(statusOf(r))}</td>
      {fileCell(r)}
      <td className="dim qp-num">{r.lines || '—'}</td>
      <td className="qp-review">{review(r)}</td>
      <td className="qp-fp">{fingerprint(r)}</td>
    </tr>
    );
  };

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
      <style>{QUALITY_PANEL_CSS}</style>

      <div className="qp-head">
        <div className="qp-dims">
          {dimBtn('base', '基线', baseCounts, '结构规则扫描结果')}
          {dimBtn('smart', '智能', smartCounts, '智能评审结果，与基线相互独立')}
        </div>
        <span className="qp-sub">
          {dim === 'base' ? '基线对照' : '智能对照'}{' '}
          <span className="mono">{fmt.at(dim === 'base' ? data.baseAt : data.aiAt)}</span>
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
          <col style={{ width: 92 }} />
          <col />
          <col style={{ width: 72 }} />
          <col style={{ width: 'min(36%, 320px)' }} />
          <col style={{ width: 120 }} />
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
                    {pathOf.fileName(folderFilter) || folderFilter} ×
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
