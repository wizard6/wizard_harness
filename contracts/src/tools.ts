/**
 * 服务契约层：tools 服务。
 *
 * 契约属于系统而非任何插件。登记 / 调用工具；调用结果写入 session（tool-result），
 * 不另存执行记录。薄切片：同步注册表 + 一次 call，不做 agent 循环 / 权限沙箱。
 */
export const TOOLS_SERVICE = 'tools';

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

export interface ToolsService {
  register(spec: ToolSpec): void;
  list(): readonly ToolInfo[];
  call(
    name: string,
    args?: Record<string, unknown>,
    opts?: { sessionId?: string; callId?: string },
  ): Promise<ToolCallResult>;
}
