import { InvalidPluginError } from './errors.js';
import type { Plugin } from './types.js';

const TIERS = ['core', 'standard', 'experimental'];

/**
 * 校验插件 manifest（运行时 schema 检查）。
 * 不合格直接抛 InvalidPluginError——插件畸形尽早暴露，避免静默运行到一半才出错。
 */
export function validateManifest(plugin: Plugin): void {
  const m = plugin?.manifest;
  if (!m || typeof m !== 'object') {
    throw new InvalidPluginError('缺少有效 manifest');
  }
  if (typeof m.id !== 'string' || m.id.length === 0) {
    throw new InvalidPluginError('manifest.id 必须为非空字符串');
  }
  if (typeof m.version !== 'string' || m.version.length === 0) {
    throw new InvalidPluginError(`manifest.version 必须为非空字符串（${m.id}）`);
  }
  if (m.name !== undefined && typeof m.name !== 'string') {
    throw new InvalidPluginError(`manifest.name 必须为字符串（${m.id}）`);
  }
  if (m.description !== undefined && typeof m.description !== 'string') {
    throw new InvalidPluginError(`manifest.description 必须为字符串（${m.id}）`);
  }
  if (m.tier !== undefined && !TIERS.includes(m.tier)) {
    throw new InvalidPluginError(`manifest.tier 仅允许 ${TIERS.join('/')}（${m.id}，收到 ${String(m.tier)}）`);
  }
  if (m.trusted !== undefined && typeof m.trusted !== 'boolean') {
    throw new InvalidPluginError(`manifest.trusted 必须为布尔值（${m.id}）`);
  }
  if (
    m.config !== undefined &&
    (typeof m.config !== 'object' || m.config === null || Array.isArray(m.config))
  ) {
    throw new InvalidPluginError(`manifest.config 必须为对象（${m.id}）`);
  }
  const stringArrays = [
    ['dependencies', m.dependencies],
    ['services', m.services],
    ['highAccessServices', m.highAccessServices],
  ] as const;
  for (const [key, arr] of stringArrays) {
    if (arr !== undefined && (!Array.isArray(arr) || arr.some((x) => typeof x !== 'string'))) {
      throw new InvalidPluginError(`manifest.${key} 必须为字符串数组（${m.id}）`);
    }
  }
  if (m.provides !== undefined) {
    if (!Array.isArray(m.provides)) {
      throw new InvalidPluginError(`manifest.provides 必须为数组（${m.id}）`);
    }
    for (const p of m.provides) {
      const ok = typeof p === 'string';
      if (!ok) {
        throw new InvalidPluginError(
          `manifest.provides 元素必须为字符串（${m.id}）`,
        );
      }
    }
  }
}
