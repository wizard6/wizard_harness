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
export function QualityPanel({ data, error, onRefresh }: QualityPanelProps): React.ReactElement {
  const [filter, setFilter] = useState<Filter>('all');
  const c = data.counts;
  const rows = data.rows.filter((r) => filter === 'all' || r.status === filter);

  /** 带数字的胶囊 tab：数字即统计，点击过滤 */
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: c.total },
    { key: 'unchanged', label: '未修改', count: c.unchanged },
    { key: 'modified', label: '已修改', count: c.modified },
    { key: 'added', label: '新增', count: c.added },
    { key: 'removed', label: '删除', count: c.removed },
  ];

  const badge = (status: QualityRow['status']): React.ReactElement => (
    <span className={`qp-badge qp-b-${status}`}>{STATUS_TEXT[status]}</span>
  );

  const issues = (r: QualityRow): React.ReactElement =>
    r.lastIssues.length > 0 ? (
      <span className="qp-badge qp-b-modified" title={r.lastIssues.join('\n')}>
        ⚠ {r.lastIssues.length} 项
      </span>
    ) : (
      <span className="qp-badge qp-b-unchanged">✓ 通过</span>
    );

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
                      cursor:pointer; font-size:12px; font-family:inherit;
                      transition:color .12s ease, border-color .12s ease; }
        .qp-refresh:hover { color:#e6e6ef; border-color:rgba(255,255,255,.16); }
        .qp-err { color:#ff7b72; font-size:12px; margin-bottom:10px; }
        .qp-filters { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .qp-filters button { display:flex; align-items:center; gap:7px; background:rgba(255,255,255,.04);
                             color:#a8a8bd; border:1px solid rgba(255,255,255,.08); border-radius:16px;
                             padding:5px 14px; cursor:pointer; font-size:12px; font-family:inherit;
                             transition:color .12s ease, border-color .12s ease, background .12s ease; }
        .qp-filters button:hover { color:#e6e6ef; border-color:rgba(255,255,255,.16); }
        .qp-filters button.active { background:rgba(121,192,255,.16); border-color:rgba(121,192,255,.35);
                                    color:#79c0ff; font-weight:600; }
        .qp-count { min-width:20px; height:18px; padding:0 6px; border-radius:999px; display:inline-flex;
                    align-items:center; justify-content:center; font-size:11px; font-weight:700;
                    background:rgba(255,255,255,.08); color:#a8a8bd; }
        .qp-filters button.active .qp-count { background:rgba(121,192,255,.2); color:#79c0ff; }
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
        <button className="qp-refresh" onClick={onRefresh}>刷新</button>
      </div>

      {error && <div className="qp-err">拉取失败：{error}</div>}

      <div className="qp-filters">
        {tabs.map((t) => (
          <button key={t.key} className={filter === t.key ? 'active' : ''} onClick={() => setFilter(t.key)}>
            {t.label}
            <span className="qp-count">{t.count}</span>
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr><th>状态</th><th>文件</th><th>行数</th><th>上次 hash</th><th>当前 hash</th><th>上次检查</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rel}>
              <td>{badge(r.status)}</td>
              <td className="mono">{r.rel}</td>
              <td className="dim">{r.lines || '—'}</td>
              <td className="mono dim" title={r.lastHash || ''}>{short(r.lastHash)}</td>
              <td className="mono" title={r.curHash}>{r.curHash ? short(r.curHash) : '—'}</td>
              <td>{issues(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
