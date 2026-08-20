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

  const card = (label: string, value: number, color = ''): React.ReactElement => (
    <div className="qp-card" key={label}>
      <div className="qp-k">{label}</div>
      <div className="qp-v" style={color ? { color } : undefined}>{value}</div>
    </div>
  );

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

  const filters: Filter[] = ['all', 'modified', 'added', 'removed', 'unchanged'];

  return (
    <div className="qp">
      <style>{`
        .qp { font: 13px/1.6 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; padding: 18px 20px; }
        .qp-head { display:flex; align-items:baseline; gap:12px; margin-bottom:14px; }
        .qp-title { font-size:16px; font-weight:700; margin:0; }
        .qp-sub { color:#8b949e; font-size:12px; }
        .qp-sub .mono { font-family:ui-monospace,Consolas,monospace; }
        .qp-refresh { margin-left:auto; background:#21262d; color:#e6edf3; border:1px solid #30363d;
                      border-radius:8px; padding:5px 14px; cursor:pointer; font-size:12px; }
        .qp-refresh:hover { border-color:#58a6ff; color:#58a6ff; }
        .qp-err { color:#f85149; font-size:12px; margin-bottom:10px; }
        .qp-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-bottom:14px; }
        .qp-card { background:#161b22; border:1px solid #30363d; border-radius:10px; padding:10px 14px; }
        .qp-k { color:#8b949e; font-size:11px; }
        .qp-v { font-size:20px; font-weight:700; margin-top:2px; color:#e6edf3; }
        .qp-filters { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
        .qp-filters button { background:#161b22; color:#e6edf3; border:1px solid #30363d;
                             border-radius:8px; padding:5px 14px; cursor:pointer; font-size:12px; }
        .qp-filters button.active { border-color:#58a6ff; color:#58a6ff; }
        .qp table { width:100%; border-collapse:collapse; background:#161b22; border:1px solid #30363d; border-radius:10px; overflow:hidden; }
        .qp th,.qp td { text-align:left; padding:7px 12px; border-bottom:1px solid #30363d; vertical-align:top; }
        .qp th { color:#8b949e; font-weight:600; font-size:11px; background:rgba(255,255,255,.03); }
        .qp tr:last-child td { border-bottom:none; }
        .qp .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; }
        .qp .dim { color:#8b949e; }
        .qp-badge { display:inline-block; font-size:11px; padding:1px 10px; border-radius:10px; font-weight:600; white-space:nowrap; }
        .qp-b-unchanged { color:#3fb950; border:1px solid #3fb950; }
        .qp-b-modified { color:#d29922; border:1px solid #d29922; }
        .qp-b-added { color:#58a6ff; border:1px solid #58a6ff; }
        .qp-b-removed { color:#f85149; border:1px solid #f85149; text-decoration:line-through; }
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

      <div className="qp-cards">
        {card('文件总数', c.total)}
        {card('未修改', c.unchanged, c.unchanged ? '#3fb950' : '')}
        {card('已修改', c.modified, c.modified ? '#d29922' : '')}
        {card('新增', c.added, c.added ? '#58a6ff' : '')}
        {card('删除', c.removed, c.removed ? '#f85149' : '')}
      </div>

      <div className="qp-filters">
        {filters.map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? '全部' : STATUS_TEXT[f as QualityRow['status']]}
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
