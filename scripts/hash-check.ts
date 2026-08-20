#!/usr/bin/env node
/**
 * hash-check：实时对比"上次质检 hash ↔ 当前文件 hash"的修改状态。
 *
 * 用法：pnpm hash:check
 *
 * - 重新计算全部源码文件的当前 hash（CLI 带进度条）；
 * - 与 .quality-state.json（上次质检记录）对比 → 未修改 / 已修改 / 新增 / 删除；
 * - 生成 docs/hash-viewer.html（数据内嵌，file:// 直接打开即看）。
 *
 * 注意：本工具只计算与对比，不更新质检状态（刷新状态请跑 pnpm quality）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, collectFiles, normalize, sha256, toRel } from './hash-util.js';

const STATE_FILE = join(ROOT, '.quality-state.json');
const VIEWER = join(ROOT, 'docs', 'hash-viewer.html');

interface LastFile {
  hash: string;
  issues?: string[];
  checkedAt?: string;
}
interface LastState {
  files?: Record<string, LastFile>;
  global?: { typecheck?: { at?: string } };
}

type Status = 'unchanged' | 'modified' | 'added' | 'removed';

interface Row {
  rel: string;
  lines: number;
  status: Status;
  lastHash: string;
  curHash: string;
  lastIssues: string[];
}

/** CLI 进度条（单行覆盖刷新） */
function progress(done: number, total: number, label: string): string {
  const width = 24;
  const pct = done / total;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `\r[${bar}] ${String(Math.round(pct * 100)).padStart(3)}% ${done}/${total} ${label}`;
}

function loadState(): LastState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as LastState;
  } catch {
    return {};
  }
}

function main(): void {
  const files = collectFiles();
  const state = loadState();
  const last = state.files ?? {};
  const total = files.length;
  const rows: Row[] = [];

  for (let i = 0; i < files.length; i++) {
    const abs = files[i];
    const rel = toRel(abs);
    const content = normalize(readFileSync(abs, 'utf8'));
    const curHash = sha256(content);
    const prev = last[rel];
    const status: Status = !prev ? 'added' : prev.hash !== curHash ? 'modified' : 'unchanged';
    rows.push({
      rel,
      lines: content.split('\n').length,
      status,
      lastHash: prev?.hash ?? '',
      curHash,
      lastIssues: prev?.issues ?? [],
    });
    process.stdout.write(progress(i + 1, total, rel));
  }
  process.stdout.write('\n');

  // 删除的文件（上次有记录、当前不存在）
  const known = new Set(rows.map((r) => r.rel));
  for (const [rel, prev] of Object.entries(last)) {
    if (!known.has(rel)) {
      rows.push({ rel, lines: 0, status: 'removed', lastHash: prev.hash, curHash: '', lastIssues: prev.issues ?? [] });
    }
  }

  // 汇总
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const modified = rows.filter((r) => r.status === 'modified');
  console.log(`\n对比基准：上次质检 ${state.global?.typecheck?.at ?? '（无记录）'}`);
  console.log(
    `文件 ${rows.length}：未修改 ${count('unchanged')} · 已修改 ${count('modified')} · 新增 ${count('added')} · 删除 ${count('removed')}`,
  );
  if (modified.length) {
    console.log(`已修改：\n  ${modified.map((r) => `${r.rel}（${r.lines} 行）`).join('\n  ')}`);
  }

  writeFileSync(VIEWER, renderHtml(rows, state, new Date().toISOString()), 'utf8');
  console.log(`\n查看器 → docs/hash-viewer.html（浏览器直接打开）`);
}

/* ---------- HTML 查看器（数据内嵌，file:// 可开） ---------- */

function renderHtml(rows: Row[], state: LastState, now: string): string {
  const data = JSON.stringify({ generatedAt: now, baseAt: state.global?.typecheck?.at ?? null, rows });
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>文件修改状态（较上次质检）</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --line:#30363d; --txt:#e6edf3; --dim:#8b949e;
          --ok:#3fb950; --mod:#d29922; --add:#58a6ff; --del:#f85149; --accent:#58a6ff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt);
         font:14px/1.6 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--dim); margin-bottom:20px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 16px; }
  .card .k { color:var(--dim); font-size:12px; }
  .card .v { font-size:22px; font-weight:700; margin-top:2px; }
  .filters { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
  .filters button { background:var(--card); color:var(--txt); border:1px solid var(--line);
                    border-radius:8px; padding:6px 14px; cursor:pointer; font-size:13px; }
  .filters button.active { border-color:var(--accent); color:var(--accent); }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th,td { text-align:left; padding:7px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--dim); font-weight:600; font-size:12px; background:rgba(255,255,255,.03); }
  tr:last-child td { border-bottom:none; }
  .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; }
  .badge { display:inline-block; font-size:11px; padding:1px 10px; border-radius:10px; font-weight:600; }
  .b-unchanged { color:var(--ok); border:1px solid var(--ok); }
  .b-modified { color:var(--mod); border:1px solid var(--mod); }
  .b-added { color:var(--add); border:1px solid var(--add); }
  .b-removed { color:var(--del); border:1px solid var(--del); text-decoration:line-through; }
  .dim { color:var(--dim); }
  .hl { color:var(--mod); font-weight:700; }
  ul { margin:2px 0 0; padding-left:16px; color:#d29922; font-size:12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>文件修改状态 <span class="dim" style="font-size:13px;font-weight:400">较上次质检</span></h1>
  <div class="sub">生成时间：<span class="mono" id="genAt"></span> · 对比基准（上次质检）：<span class="mono" id="baseAt"></span></div>

  <div class="cards" id="cards"></div>

  <div class="filters" id="filters">
    <button data-f="all" class="active">全部</button>
    <button data-f="modified">已修改</button>
    <button data-f="added">新增</button>
    <button data-f="removed">删除</button>
    <button data-f="unchanged">未修改</button>
  </div>

  <table>
    <thead><tr><th>状态</th><th>文件</th><th>行数</th><th>上次 hash</th><th>当前 hash</th><th>上次检查</th></tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>
<script id="hash-data" type="application/json">${data}</script>
<script>
  const data = JSON.parse(document.getElementById('hash-data').textContent);
  const statusText = { unchanged: '未修改', modified: '已修改', added: '新增', removed: '删除' };
  const short = (h) => (h ? h.slice(0, 8) + '…' : '—');
  const okIssues = (r) => r.lastIssues && r.lastIssues.length
    ? '<span class="badge b-modified" title="' + r.lastIssues.join('\n') + '">⚠ ' + r.lastIssues.length + ' 项</span>'
    : '<span class="badge b-unchanged">✓ 通过</span>';

  document.getElementById('genAt').textContent = data.generatedAt;
  document.getElementById('baseAt').textContent = data.baseAt || '（无记录，全部视为新增）';

  function counts() {
    const c = { unchanged: 0, modified: 0, added: 0, removed: 0 };
    for (const r of data.rows) c[r.status]++;
    return c;
  }
  function renderCards(c) {
    document.getElementById('cards').innerHTML = [
      ['文件总数', data.rows.length, ''],
      ['未修改', c.unchanged, 'var(--ok)'],
      ['已修改', c.modified, c.modified ? 'var(--mod)' : ''],
      ['新增', c.added, c.added ? 'var(--add)' : ''],
      ['删除', c.removed, c.removed ? 'var(--del)' : ''],
    ].map(([k, v, color]) =>
      '<div class="card"><div class="k">' + k + '</div><div class="v" style="color:' + color + '">' + v + '</div></div>').join('');
  }
  function render(filter) {
    const rows = data.rows.filter((r) => filter === 'all' || r.status === filter);
    document.getElementById('tbody').innerHTML = rows.map((r) =>
      '<tr>' +
      '<td><span class="badge b-' + r.status + '">' + statusText[r.status] + '</span></td>' +
      '<td class="mono">' + r.rel + '</td>' +
      '<td class="num dim">' + (r.lines || '—') + '</td>' +
      '<td class="mono dim" title="' + (r.lastHash || '') + '">' + short(r.lastHash) + '</td>' +
      '<td class="mono" title="' + r.curHash + '">' + (r.curHash ? short(r.curHash) : '—') + '</td>' +
      '<td>' + okIssues(r) + '</td>' +
      '</tr>').join('');
  }
  const c = counts();
  renderCards(c);
  document.getElementById('filters').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    document.querySelectorAll('#filters button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    render(btn.dataset.f);
  });
  render('all');
</script>
</body>
</html>`;
}

main();
