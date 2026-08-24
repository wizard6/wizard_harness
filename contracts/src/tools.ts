import type { PluginContext } from '@wizard-harness/core';

/**
 * 服务契约层：tools 服务。
 *
 * 契约属于系统而非任何插件。登记 / 调用工具；调用结果写入 session（tool-result），
 * 不另存执行记录。全局层 + scope overlay：同名工具近层遮盖远层。
 */
export const TOOLS_SERVICE = 'tools';

/** 与 core ScopeKey 同构的不透明引用 */
export type ScopeRef = object;

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<unknown> | unknown;
}

export interface ToolSpec {
  name: string;
  description?: string;
  handler: ToolHandler;
}

export interface ToolInfo {
  name: string;
  description?: string;
}

export interface ToolCallResult {
  callId: string;
  name: string;
  content: string;
  ok: boolean;
  sessionId: string;
}

export interface ToolsView {
  register(spec: ToolSpec): void;
  list(): readonly ToolInfo[];
  call(
    name: string,
    args?: Record<string, unknown>,
    opts?: { sessionId?: string; callId?: string },
  ): Promise<ToolCallResult>;
}

export interface ToolsService extends ToolsView {
  /** 在 owner.ctx 的 scope 层登记 / 解析工具（如 agent.ctx） */
  bind(owner: PluginContext): ToolsView;
  /** 按 scope 合并工具表（prompt-context assemble 用） */
  listIn(scope?: ScopeRef): readonly ToolInfo[];
}
