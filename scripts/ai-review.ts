#!/usr/bin/env node
/**
 * ai-review：把 AI 评审结论写回质检状态（.quality-state.json）。
 *
 * 用法：pnpm quality:ai -- <rel> "<issue1>|<issue2>|..."
 *   - rel：文件相对路径（如 core/src/registrar/registrar.ts）
 *   - issues：以 | 分隔的评审结论；不传或为空 = 通过
 *
 * 语义：写回后该文件的 AI 评审基准（aiHash）= 当前 hash，
 *       下次检测时若文件再变化，AI 维度会标"已修改"（待重新评审）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, normalize, sha256 } from './hash-util.js';

const STATE_FILE = join(ROOT, '.quality-state.json');

const raw = process.argv.slice(2).filter((a) => a !== '--');
const rel = raw[0];
const issues = (raw[1] ?? '')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean);

if (!rel) {
  console.error('用法：pnpm quality:ai -- <rel> "<issue1>|<issue2>..."');
  process.exit(1);
}

const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
if (!state.files?.[rel]) {
  console.error(`状态里没有 ${rel}（请先运行 pnpm quality）`);
  process.exit(1);
}

const abs = join(ROOT, ...rel.split('/'));
const hash = sha256(normalize(readFileSync(abs, 'utf8')));
state.files[rel].aiHash = hash;
state.files[rel].aiIssues = issues;
state.files[rel].aiCheckedAt = new Date().toISOString();
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
console.log(`[quality:ai] ${rel} → ${issues.length ? issues.join('；') : '通过'}`);
