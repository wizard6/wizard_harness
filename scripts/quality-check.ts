#!/usr/bin/env node
/**
 * quality-check：全局代码质检（带 hash 增量）
 *
 * 用法：pnpm quality  （或 node --import tsx scripts/quality-check.ts）
 *
 * 增量机制：以文件内容 sha256 为修改依据。
 *  - 未修改的文件：复用上次结构检查结果，不重新检查；
 *  - 全部文件未修改：跳过 typecheck / test，复用上次全局结果；
 *  - 任一文件修改：重跑该文件结构检查 + 全局 typecheck / test。
 *
 * 产出：
 *  - docs/quality-report-ai.md   给 AI 的简洁版报告
 *  - docs/quality-report.html    给人的清晰版报告
 *  - .quality-state.json         检查状态（hash 记录，提交到仓库）
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const STATE_FILE = join(ROOT, '.quality-state.json');
const AI_REPORT = join(ROOT, 'docs', 'quality-report-ai.md');
const HTML_REPORT = join(ROOT, 'docs', 'quality-report.html');
/** 文件行数上限：尽量不超过 600 行（除非特殊） */
const MAX_LINES = 600;
/** 顶层函数体行数上限（低内聚信号） */
const MAX_TOP_FUNC = 200;
/** 顶层可执行声明（function/class/const）数量上限（职责过多信号） */
const MAX_TOP_DECL = 10;
/** import 语句数量上限（耦合度信号） */
const MAX_IMPORTS = 12;
/** 已知失败（既有问题，不算回归）：obs/gui typecheck 在改动前已失败（pnpm 输出目录名） */
const KNOWN_FAILURES = ['obs/gui'];

/** 被检查源码目录（含 .ts/.tsx，排除 node_modules/dist/.ignored_core/测试文件） */
const SOURCE_DIRS = ['core/src', 'contracts/src', 'plugins', 'obs'];

interface FileState {
  hash: string;
  issues: string[];
  checkedAt: string;
}
interface GlobalState {
  typecheck: { status: 'pass' | 'fail'; failed: string[]; note?: string; at: string };
  test: { status: 'pass' | 'fail'; summary: string; at: string };
}
interface State {
  schema: 1;
  /** 结构检查规则版本：规则变更时强制全量重查，避免旧缓存生效 */
  rulesVersion: number;
  files: Record<string, FileState>;
  global?: GlobalState;
}

/** 结构检查规则版本（structureCheck 的规则变化时 +1） */
const RULES_VERSION = 3;

/* ---------- 工具 ---------- */

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function collectFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (['node_modules', 'dist', '.ignored_core'].includes(ent.name)) continue;
        walk(p);
      } else if (
        (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx')) &&
        !ent.name.endsWith('.spec.ts') &&
        !ent.name.endsWith('.d.ts')
      ) {
        out.push(p);
      }
    }
  };
  for (const d of SOURCE_DIRS) {
    const full = join(ROOT, d);
    if (existsSync(full)) walk(full);
  }
  return out.sort();
}

/** 文件级结构检查（内容分析，可增量）。rel 为相对路径（用于按目录裁剪规则） */
function structureCheck(content: string, rel: string): string[] {
  const issues: string[] = [];
  const lines = content.split('\n');
  if (lines.length > MAX_LINES) {
    issues.push(`文件过大 ${lines.length} 行 > ${MAX_LINES}（除非特殊）`);
  }

  // 顶层可执行声明数量（function/class/const，不含 interface/type——类型契约天然多声明）
  const topDecls = lines.filter((l) => {
    const t = l.trim();
    if (t.length === 0 || l.startsWith(' ') || l.startsWith('\t')) return false;
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return false;
    return /^(export\s+)?(async\s+)?(function|class|const|let|var)\b/.test(t);
  });
  if (topDecls.length > MAX_TOP_DECL) {
    issues.push(`顶层声明过多 ${topDecls.length} 个 > ${MAX_TOP_DECL}，职责过多，考虑拆分`);
  }

  // 顶层函数体过大（低内聚信号）：从函数定义行到下一个顶层声明行
  const nextTop = (from: number): number => {
    for (let j = from + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t.length === 0) continue;
      if (lines[j].startsWith(' ') || lines[j].startsWith('\t')) continue;
      if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
      return j;
    }
    return lines.length;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (lines[i].startsWith(' ') || lines[i].startsWith('\t')) continue;
    const m = /^(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(t);
    if (!m) continue;
    const end = nextTop(i);
    const body = end - i - 1;
    if (body > MAX_TOP_FUNC) {
      issues.push(`顶层函数 ${m[3]} 过大（${body} 行 > ${MAX_TOP_FUNC}），低内聚/职责过多，考虑拆分`);
    }
    i = end - 1;
  }

  // import 数量（耦合度信号）
  const imports = lines.filter((l) => /^import\s/.test(l)).length;
  if (imports > MAX_IMPORTS) {
    issues.push(`import 过多 ${imports} 个 > ${MAX_IMPORTS}，耦合偏高`);
  }

  const markers = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /TODO|FIXME|HACK|XXX/.test(l))
    .map(({ i }) => i + 1);
  if (markers.length > 0) {
    issues.push(`TODO/FIXME/HACK/XXX × ${markers.length}（行 ${markers.join(', ')}）`);
  }
  // console.log 残留仅约束库代码（core/contracts/plugins）；obs 是运行时壳/观测器，console 输出是其职责
  if (!rel.startsWith('obs/')) {
    const logs = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /console\.(log|debug)\(/.test(l) && !/^\s*(\/\/|\*)/.test(l))
      .map(({ i }) => i + 1);
    if (logs.length > 0) {
      issues.push(`console.log/debug 残留 × ${logs.length}（行 ${logs.join(', ')}）`);
    }
  }
  return issues;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

const PNPM = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';

function run(args: string[]): { code: number; output: string } {
  // Windows：批处理（pnpm.cmd）须经 cmd.exe /c 执行；非 Windows 直接跑 pnpm
  const cmdArgs = process.platform === 'win32' ? ['/c', 'pnpm', ...args] : args;
  const r = spawnSync(PNPM, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? -1, output: stripAnsi(`${r.stdout ?? ''}\n${r.stderr ?? ''}`) };
}

function loadState(): State {
  if (!existsSync(STATE_FILE)) return { schema: 1, rulesVersion: RULES_VERSION, files: {} };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
  } catch {
    return { schema: 1, rulesVersion: RULES_VERSION, files: {} };
  }
}

/* ---------- 全局检查 ---------- */

function checkTypecheck(): { status: 'pass' | 'fail'; failed: string[]; note?: string } {
  // --no-bail：跑完全部包，收集所有失败包（不只第一个）
  const { code, output } = run(['-r', '--no-bail', 'typecheck']);
  // pnpm 10 输出格式：`<目录> typecheck: Failed`（如 obs/gui）
  const failed = [...output.matchAll(/^([\w/-]+) typecheck: Failed/gm)].map((m) => m[1]);
  if (code === 0 && failed.length === 0) return { status: 'pass', failed: [] };
  const newFails = failed.filter((p) => !KNOWN_FAILURES.includes(p));
  return {
    status: 'fail',
    failed,
    note:
      newFails.length > 0
        ? `新失败包：${newFails.join(', ')}`
        : `仅已知失败（${failed.join(', ')}，改动前已存在）`,
  };
}

function checkTest(): { status: 'pass' | 'fail'; summary: string } {
  const { output } = run(['test']);
  const passed = /Tests\s+(\d+) passed/.exec(output);
  const failed = /Tests\s+(\d+) failed/.exec(output);
  const files = /Test Files\s+(\d+) passed/.exec(output);
  const summary = `Test Files ${files?.[1] ?? '?'} passed | Tests ${passed?.[1] ?? 0} passed${failed && failed[1] !== '0' ? ` | ${failed[1]} failed` : ''}`;
  return { status: failed && failed[1] !== '0' ? 'fail' : 'pass', summary };
}

/* ---------- 主流程 ---------- */

interface FileResult {
  rel: string;
  lines: number;
  hash: string;
  issues: string[];
  changed: boolean;
  reused: boolean;
}

function main(): void {
  const files = collectFiles();
  const state = loadState();
  const now = new Date().toISOString();
  // 规则版本变化 → 全量重查（不信任旧缓存）
  const forceFull = state.rulesVersion !== RULES_VERSION;
  const results: FileResult[] = [];
  let changedCount = 0;
  let skippedCount = 0;

  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    const content = readFileSync(f, 'utf8');
    const hash = sha256(content);
    const prev = state.files[rel];
    if (prev && prev.hash === hash && !forceFull) {
      // 未修改：复用上次结构检查结果（无论当时通过与否，问题清单不变）
      results.push({ rel, lines: content.split('\n').length, hash, issues: prev.issues ?? [], changed: false, reused: true });
      skippedCount++;
    } else {
      const issues = structureCheck(content, rel);
      results.push({ rel, lines: content.split('\n').length, hash, issues, changed: true, reused: false });
      changedCount++;
      state.files[rel] = { hash, issues, checkedAt: now };
    }
  }

  // 清理状态：已不存在的文件记录
  const known = new Set(results.map((r) => r.rel));
  for (const rel of Object.keys(state.files)) {
    if (!known.has(rel)) delete state.files[rel];
  }

  // 全局检查：任一文件修改 → 重跑；否则复用
  const needGlobal = changedCount > 0 || !state.global;
  let typecheck: GlobalState['typecheck'];
  let test: GlobalState['test'];
  if (needGlobal) {
    typecheck = { ...checkTypecheck(), at: now };
    test = { ...checkTest(), at: now };
    state.global = { typecheck, test };
  } else {
    typecheck = state.global.typecheck;
    test = state.global.test;
  }

  state.rulesVersion = RULES_VERSION;
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  /* ---------- 报告 ---------- */

  const issueFiles = results.filter((r) => r.issues.length > 0);
  const typeIssues = issueFiles.reduce((n, r) => n + r.issues.length, 0);
  const globalMode = needGlobal ? '已重跑' : '复用上次结果（无修改）';

  // AI 简洁版
  const ai = [
    `# 质量检测报告（AI 版）`,
    ``,
    `- 时间：${now}`,
    `- 范围：${files.length} 个源码文件（core/contracts/plugins/obs）`,
    `- 增量：检查 ${changedCount}，跳过 ${skippedCount}；全局门禁：${globalMode}`,
    ``,
    `## 全局门禁`,
    `- typecheck：${typecheck.status === 'pass' ? '✅ 通过' : '❌ 失败'}${typecheck.failed.length ? `（${typecheck.failed.join(', ')}）` : ''}${typecheck.note ? ` — ${typecheck.note}` : ''}`,
    `- test：${test.status === 'pass' ? '✅ 通过' : '❌ 失败'}（${test.summary}）`,
    ``,
    `## 文件清单（${results.length} 个，含 sha256）`,
    ...results.map(
      (r) =>
        `- ${r.rel}（${r.lines} 行）sha256=${r.hash}${r.changed ? ' [已修改]' : ' [未修改]'}${r.issues.length ? `\n  - ${r.issues.join('\n  - ')}` : ''}`,
    ),
    ``,
    `## 结构问题（${issueFiles.length} 个文件，${typeIssues} 项）`,
    ...(issueFiles.length === 0
      ? ['- 无']
      : issueFiles.map((r) => `- ${r.rel}（${r.lines} 行）${r.changed ? ' [已修改]' : ' [未修改]'}\n  - ${r.issues.join('\n  - ')}`)),
    ``,
    `## 结论`,
    typecheck.status === 'pass' && test.status === 'pass' && typeIssues === 0
      ? `- 全部通过。`
      : `- 需关注：typecheck=${typecheck.status}，test=${test.status}，结构问题 ${typeIssues} 项。`,
  ].join('\n');
  writeFileSync(AI_REPORT, ai, 'utf8');

  // 人清晰版 HTML
  const rows = results
    .map((r) => {
      const badge = r.issues.length === 0
        ? '<span class="ok">✓ 通过</span>'
        : `<span class="warn">⚠ ${r.issues.length} 项</span>`;
      const issues = r.issues.length
        ? `<ul>${r.issues.map((i) => `<li>${i}</li>`).join('')}</ul>`
        : '<span class="dim">—</span>';
      return `<tr><td class="mono">${r.rel}</td><td class="num">${r.lines}</td><td class="mono" title="sha256 ${r.hash}">${r.hash.slice(0, 8)}…</td><td>${r.changed ? '<span class="tag new">已修改</span>' : '<span class="tag reuse">未修改</span>'}</td><td>${badge}</td><td>${issues}</td></tr>`;
    })
    .join('\n');

  const tcBadge = typecheck.status === 'pass'
    ? '<span class="ok">✅ 通过</span>'
    : `<span class="fail">❌ 失败${typecheck.failed.length ? `（${typecheck.failed.join(', ')}）` : ''}</span>`;
  const tBadge = test.status === 'pass'
    ? '<span class="ok">✅ 通过</span>'
    : '<span class="fail">❌ 失败</span>';

  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>wizard-harness 质量检测报告</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --line:#30363d; --txt:#e6edf3; --dim:#8b949e;
          --ok:#3fb950; --warn:#d29922; --fail:#f85149; --accent:#58a6ff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt);
         font:14px/1.6 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--dim); margin-bottom:20px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:24px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .card .k { color:var(--dim); font-size:12px; }
  .card .v { font-size:22px; font-weight:700; margin-top:2px; }
  h2 { font-size:16px; margin:28px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th,td { text-align:left; padding:8px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--dim); font-weight:600; font-size:12px; background:rgba(255,255,255,.03); }
  tr:last-child td { border-bottom:none; }
  .mono { font-family:ui-monospace,Consolas,monospace; font-size:12.5px; }
  .num { text-align:right; color:var(--dim); }
  .ok { color:var(--ok); font-weight:600; }
  .warn { color:var(--warn); font-weight:600; }
  .fail { color:var(--fail); font-weight:600; }
  .dim { color:var(--dim); }
  .tag { display:inline-block; font-size:11px; padding:1px 8px; border-radius:10px; border:1px solid var(--line); }
  .tag.new { color:var(--accent); border-color:var(--accent); }
  .tag.reuse { color:var(--dim); }
  ul { margin:2px 0 0; padding-left:18px; color:#d29922; font-size:12.5px; }
  .gate { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:6px 16px; margin-bottom:8px; display:flex; gap:10px; align-items:baseline; }
  .gate .name { color:var(--dim); font-weight:600; min-width:110px; }
  .gate .detail { color:var(--dim); font-size:12.5px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>wizard-harness 质量检测报告</h1>
  <div class="sub">生成时间：${now} · 检查范围：${files.length} 个源码文件（core / contracts / plugins / obs）</div>

  <div class="cards">
    <div class="card"><div class="k">源码文件</div><div class="v">${files.length}</div></div>
    <div class="card"><div class="k">本次检查 / 复用</div><div class="v">${changedCount} / ${skippedCount}</div></div>
    <div class="card"><div class="k">结构问题文件</div><div class="v" style="color:${issueFiles.length ? 'var(--warn)' : 'var(--ok)'}">${issueFiles.length}</div></div>
    <div class="card"><div class="k">结构问题项</div><div class="v" style="color:${typeIssues ? 'var(--warn)' : 'var(--ok)'}">${typeIssues}</div></div>
  </div>

  <h2>全局门禁 <span class="dim" style="font-size:12px;font-weight:400">（${globalMode}）</span></h2>
  <div class="gate"><span class="name">typecheck</span>${tcBadge}<span class="detail">${typecheck.note ?? ''}</span></div>
  <div class="gate"><span class="name">test</span>${tBadge}<span class="detail">${test.summary}（${test.at.slice(0, 16).replace('T', ' ')}）</span></div>

  <h2>文件级结构检查</h2>
  <table>
    <thead><tr><th>文件</th><th>行数</th><th>sha256</th><th>修改</th><th>状态</th><th>问题</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <h2>增量机制</h2>
  <p class="dim" style="font-size:12.5px">
    以文件内容 sha256 为修改依据（记录于 <span class="mono">.quality-state.json</span>）。
    未修改的文件复用上次结构检查结果；全部文件未修改时跳过 typecheck / test，直接复用上次全局结果。
    状态文件随仓库提交，换机器 / CI 同样生效。
  </p>
</div>
</body>
</html>`;
  writeFileSync(HTML_REPORT, html, 'utf8');
  mkdirSync(join(ROOT, 'docs'), { recursive: true });

  // 终端摘要
  console.log(`[quality] 检查 ${changedCount} 个文件，复用 ${skippedCount} 个；typecheck=${typecheck.status}；test=${test.status}（${test.summary}）`);
  console.log(`[quality] AI 版 → docs/quality-report-ai.md；HTML 版 → docs/quality-report.html`);
}

main();
