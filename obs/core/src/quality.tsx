import React, { useState } from 'react';

/** 质检数据行：单个文件较上次质检的修改状态 */
export interface QualityRow {
  rel: string;
  lines: number;
  status: 'unchanged' | 'modified' | 'added' | 'removed';
  lastHash: string;
  curHash: string;
  lastIssues: string[];
}

/** 质检面板数据（由 obs/gui 主进程实时计算后经 IPC 提供） */
export interface QualityData {
  generatedAt: string;
  baseAt: string | null;
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
  /** 手动刷新回调 */
  onRefresh?: () => void;
}

type Filter = 'all' | QualityRow['status'];

const STATUS_TEXT: Record<QualityRow['status'], string> = {
  unchanged: '未修改',
  modified: '已修改',
  added: '新增',
  removed: '删除',
};

const short = (h: string): string => (h ? `${h.slice(0, 8)}…` : '—');

/** 质量检测面板：文件较上次质检的修改状态（实时数据由壳注入） */
export function QualityPanel({ data, error, loading, onRefresh }: QualityPanelProps): React.ReactElement {
  const [filter, setFilter] = useState<Filter>('all');
  const [viewMode, setViewMode] = useState<'flat' | 'folder'>('flat');
  const [query, setQuery] = useState('');
  const c = data.counts;
  const rows = data.rows.filter((r) => filter === 'all' || r.status === filter);
  /** 路径过滤器：匹配文件相对路径（含目录） */
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.rel.toLowerCase().includes(q));
  /** 首次加载（尚无任何数据）→ 面板主体显示加载动画 */
  const firstLoad = data.rows.length === 0 && loading === true;

  /** 文件夹视图：按目录分组（目录 → 文件行），组内/组间按字典序 */
  const folders = (() => {
    const map = new Map<string, QualityRow[]>();
    for (const r of shown) {
      const i = r.rel.lastIndexOf('/');
      const dir = i > 0 ? r.rel.slice(0, i) : '（根目录）';
      const list = map.get(dir) ?? [];
      list.push(r);
      map.set(dir, list);
    }
    return [...map.entries()]
      .map(([dir, items]) => ({ dir, items }))
      .sort((a, b) => a.dir.localeCompare(b.dir));
  })();

  /** 带数字的胶囊 tab：数字即统计，点击过滤；每个 tab 带语义色 */
  const tabs: { key: Filter; label: string; count: number; color: string }[] = [
    { key: 'all', label: '全部', count: c.total, color: '#79c0ff' },
    { key: 'unchanged', label: '未修改', count: c.unchanged, color: '#7ee787' },
    { key: 'modified', label: '已修改', count: c.modified, color: '#d29922' },
    { key: 'added', label: '新增', count: c.added, color: '#79c0ff' },
    { key: 'removed', label: '删除', count: c.removed, color: '#ff7b72' },
  ];

  const badge = (status: QualityRow['status']): React.ReactElement => (
    <span className={`qp-badge qp-b-${status}`}>{STATUS_TEXT[status]}</span>
  );

  const issues = (r: QualityRow): React.ReactElement => {
    // 新增/无记录：没有"上次检查"，显示占位而不是误导性的"通过"
    if (r.status === 'added' || !r.lastHash) return <span className="qp-dim">—</span>;
    return r.lastIssues.length > 0 ? (
      <span className="qp-badge qp-b-modified" title={r.lastIssues.join('\n')}>
        ⚠ {r.lastIssues.length} 项
      </span>
    ) : (
      <span className="qp-badge qp-b-unchanged">✓ 通过</span>
    );
  };

  return (
    <div className="qp">
      <style>{`
        .qp { font: 13px/1.6 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; padding: 18px 20px; }
        .qp-head { display:flex; align-items:baseline; gap:12px; margin-bottom:14px; }
        .qp-title { font-size:16px; font-weight:700; margin:0; color:#e6e6ef; letter-spacing:.01em; }
        .qp-sub { color:#a8a8bd; font-size:12px; }
        .qp-sub .mono { font-family:ui-monospace,Consolas,monospace; }
        .qp-refresh { margin-left:auto; background:rgba(255,255,255,.04); color:#a8a8bd;
                      border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:5px 16px;
                      cursor:pointer; font-size:12px; font-family:inherit; display:inline-flex;
                      align-items:center; gap:6px;
                      transition:color .12s ease, border-color .12s ease; }
        .qp-refresh:hover:not(:disabled) { color:#e6e6ef; border-color:rgba(255,255,255,.16); }
        .qp-refresh:disabled { opacity:.6; cursor:default; }
        .qp-spin { width:12px; height:12px; border:2px solid rgba(255,255,255,.2); border-top-color:#79c0ff;
                   border-radius:50%; animation:qp-rot .7s linear infinite; display:inline-block; flex:none; }
        .qp-spin-lg { width:20px; height:20px; border-width:2.5px; }
        @keyframes qp-rot { to { transform:rotate(360deg); } }
        .qp-loading { display:flex; align-items:center; justify-content:center; gap:10px;
                      padding:48px 0; color:#a8a8bd; font-size:13px; }
        .qp-err { color:#ff7b72; font-size:12px; margin-bottom:10px; }
        .qp-filters { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .qp-filters button { display:flex; align-items:center; gap:7px; background:rgba(255,255,255,.04);
                             color:#a8a8bd; border:1px solid rgba(255,255,255,.08); border-radius:16px;
                             padding:5px 14px; cursor:pointer; font-size:12px; font-family:inherit;
                             transition:color .12s ease, border-color .12s ease, background .12s ease; }
        .qp-filters button:hover { color:#e6e6ef; border-color:rgba(255,255,255,.16); }
        .qp-filters button.active { color:var(--qp-c); border-color:var(--qp-c); font-weight:600;
                                    background:color-mix(in srgb, var(--qp-c) 14%, transparent); }
        .qp-count { min-width:20px; height:18px; padding:0 6px; border-radius:999px; display:inline-flex;
                    align-items:center; justify-content:center; font-size:11px; font-weight:700;
                    background:rgba(255,255,255,.08); color:#a8a8bd; transition:all .12s ease; }
        .qp-filters button .qp-count { color:var(--qp-c); background:color-mix(in srgb, var(--qp-c) 12%, transparent); }
        .qp-filters button.active .qp-count { background:color-mix(in srgb, var(--qp-c) 22%, transparent); color:var(--qp-c); }
        .qp-tools { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .qp-view { display:flex; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
                   border-radius:8px; overflow:hidden; }
        .qp-view button { background:transparent; border:none; color:#a8a8bd; padding:5px 14px;
                          font-size:12px; font-family:inherit; cursor:pointer;
                          transition:color .12s ease, background .12s ease; }
        .qp-view button:hover { color:#e6e6ef; }
        .qp-view button.active { background:rgba(121,192,255,.16); color:#79c0ff; font-weight:600; }
        .qp-search { margin-left:auto; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.08);
                     border-radius:14px; padding:5px 12px; font-size:12px; color:#e6e6ef;
                     font-family:inherit; outline:none; min-width:180px;
                     transition:border-color .12s ease, background .12s ease; }
        .qp-search:focus { border-color:rgba(121,192,255,.45); background:rgba(0,0,0,.38); }
        .qp-search::placeholder { color:#a8a8bd; }
        .qp-group td { background:rgba(255,255,255,.04); color:#e6e6ef; font-weight:600;
                       font-size:12px; padding:6px 12px; letter-spacing:.01em; }
        .qp-group-icon { margin-right:6px; }
        .qp-group-n { margin-left:8px; color:#a8a8bd; font-weight:400; font-size:11px; }
        .qp table { width:100%; border-collapse:collapse; background:rgba(255,255,255,.045);
                    border:1px solid rgba(255,255,255,.08); border-radius:12px; overflow:hidden; }
        .qp th,.qp td { text-align:left; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:top; }
        .qp th { color:#a8a8bd; font-weight:600; font-size:11px; background:rgba(255,255,255,.03); }
        .qp tr:last-child td { border-bottom:none; }
        .qp tbody tr:hover td { background:rgba(255,255,255,.03); }
        .qp .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; }
        .qp .dim { color:#8b949e; }
        .qp-badge { display:inline-block; font-size:11px; padding:2px 10px; border-radius:999px; font-weight:600; white-space:nowrap; }
        .qp-b-unchanged { color:#7ee787; background:rgba(126,231,135,.12); }
        .qp-b-modified { color:#d29922; background:rgba(210,153,34,.14); }
        .qp-b-added { color:#79c0ff; background:rgba(121,192,255,.14); }
        .qp-b-removed { color:#ff7b72; background:rgba(255,123,114,.12); text-decoration:line-through; }
      `}</style>

      <div className="qp-head">
        <h2 className="qp-title">质量检测</h2>
        <span className="qp-sub">
          生成 <span className="mono">{data.generatedAt.slice(0, 19).replace('T', ' ')}</span>
          {' · '}基准 <span className="mono">{data.baseAt ? data.baseAt.slice(0, 19).replace('T', ' ') : '无记录'}</span>
        </span>
        <button className="qp-refresh" onClick={onRefresh} disabled={loading}>刷新</button>
      </div>

      {error && <div className="qp-err">拉取失败：{error}</div>}

      {firstLoad ? (
        <div className="qp-loading">
          <span className="qp-spin qp-spin-lg" />
          加载中…
        </div>
      ) : (
      <>
      <div className="qp-filters">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={filter === t.key ? 'active' : ''}
            onClick={() => setFilter(t.key)}
            style={{ ['--qp-c' as string]: t.color }}
          >
            {t.label}
            <span className="qp-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="qp-tools">
        <div className="qp-view">
          <button className={viewMode === 'flat' ? 'active' : ''} onClick={() => setViewMode('flat')}>平铺</button>
          <button className={viewMode === 'folder' ? 'active' : ''} onClick={() => setViewMode('folder')}>文件夹</button>
        </div>
        <input
          className="qp-search"
          placeholder="过滤文件路径…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <table>
        <thead>
          <tr><th>状态</th><th>文件</th><th>行数</th><th>上次 hash</th><th>当前 hash</th><th>上次检查</th></tr>
        </thead>
        <tbody>
          {viewMode === 'flat'
            ? shown.map((r) => (
                <tr key={r.rel}>
                  <td>{badge(r.status)}</td>
                  <td className="mono">{r.rel}</td>
                  <td className="dim">{r.lines || '—'}</td>
                  <td className="mono dim" title={r.lastHash || ''}>{short(r.lastHash)}</td>
                  <td className="mono" title={r.curHash}>{r.curHash ? short(r.curHash) : '—'}</td>
                  <td>{issues(r)}</td>
                </tr>
              ))
            : folders.map((g) => (
                <React.Fragment key={g.dir}>
                  <tr className="qp-group">
                    <td colSpan={6}>
                      <span className="qp-group-icon">📁</span> {g.dir}
                      <span className="qp-group-n">{g.items.length}</span>
                    </td>
                  </tr>
                  {g.items.map((r) => (
                    <tr key={r.rel}>
                      <td>{badge(r.status)}</td>
                      <td className="mono">{r.rel.slice(g.dir.length + 1)}</td>
                      <td className="dim">{r.lines || '—'}</td>
                      <td className="mono dim" title={r.lastHash || ''}>{short(r.lastHash)}</td>
                      <td className="mono" title={r.curHash}>{r.curHash ? short(r.curHash) : '—'}</td>
                      <td>{issues(r)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
        </tbody>
      </table>
      </>
      )}
    </div>
  );
}
