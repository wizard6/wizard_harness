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
      if (typeof p !== 'string' || p.length === 0) {
        throw new InvalidPluginError(`manifest.provides 元素必须为非空字符串（${m.id}）`);
      }
    }
  }
}

function validateInjectSpec(spec: unknown, pluginId: string, label: string): void {
  if (Array.isArray(spec)) {
    if (spec.some((x) => typeof x !== 'string' || x.length === 0)) {
      throw new InvalidPluginError(`${label} 字符串数组元素必须为非空字符串（${pluginId}）`);
    }
    return;
  }
  if (typeof spec === 'object' && spec !== null && !Array.isArray(spec)) {
    for (const [key, value] of Object.entries(spec)) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new InvalidPluginError(`${label} 键必须为非空字符串（${pluginId}）`);
      }
      if (typeof value !== 'boolean') {
        throw new InvalidPluginError(`${label}.${key} 必须为布尔值（${pluginId}）`);
      }
    }
    return;
  }
  throw new InvalidPluginError(`${label} 必须为字符串数组或 Record<string, boolean>（${pluginId}）`);
}

function validateUiRpc(rpc: unknown, pluginId: string): void {
  if (typeof rpc !== 'object' || rpc === null || Array.isArray(rpc)) {
    throw new InvalidPluginError(`ui.rpc 必须为对象（${pluginId}）`);
  }
  for (const [service, methods] of Object.entries(rpc)) {
    if (typeof service !== 'string' || service.length === 0) {
      throw new InvalidPluginError(`ui.rpc 服务名必须为非空字符串（${pluginId}）`);
    }
    if (!Array.isArray(methods) || methods.some((m) => typeof m !== 'string' || m.length === 0)) {
      throw new InvalidPluginError(`ui.rpc.${service} 必须为非空字符串数组（${pluginId}）`);
    }
  }
}

/** manifest + inject + ui 形状校验（boot / register 共用） */
export function validatePlugin(plugin: Plugin): void {
  validateManifest(plugin);
  const id = plugin.manifest.id;
  if (plugin.inject !== undefined) validateInjectSpec(plugin.inject, id, 'inject');
  if (plugin.manifest.inject !== undefined) {
    validateInjectSpec(plugin.manifest.inject, id, 'manifest.inject');
  }
  if (plugin.manifest.services !== undefined) {
    validateInjectSpec(plugin.manifest.services, id, 'manifest.services');
  }
  if (plugin.ui !== undefined) {
    if (typeof plugin.ui !== 'object' || plugin.ui === null || Array.isArray(plugin.ui)) {
      throw new InvalidPluginError(`ui 必须为对象（${id}）`);
    }
    if (plugin.ui.content !== undefined && typeof plugin.ui.content !== 'string') {
      throw new InvalidPluginError(`ui.content 必须为字符串（${id}）`);
    }
    if (plugin.ui.hud !== undefined && typeof plugin.ui.hud !== 'boolean') {
      throw new InvalidPluginError(`ui.hud 必须为布尔值（${id}）`);
    }
    if (plugin.ui.rpc !== undefined) validateUiRpc(plugin.ui.rpc, id);
  }
  if (typeof plugin.register !== 'function') {
    throw new InvalidPluginError(`register 必须为函数（${id}）`);
  }
}
