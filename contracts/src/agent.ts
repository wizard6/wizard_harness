/**
 * 服务契约层：agent 服务。
 *
 * 契约属于系统而非任何插件。live agent = 一个 createScope + 绑定一条 session。
 * 管身份与可见性，不管「想 → 调模型 → 调工具」那条循环（那是后续 agent-loop）。
 */
import type { PluginContext } from '@wizard-harness/core';

export const AGENT_SERVICE = 'agent';

export interface AgentInfo {
  id: string;
  sessionId: string;
}

export interface AgentHandle extends AgentInfo {
  /** 打标子上下文：经它 provide 的服务只对本 agent 可见 */
  readonly ctx: PluginContext;
  /** 最近一次写入 session 的 system 消息（append-only，改 prompt 会再追加一条） */
  readonly systemPrompt?: string;
}

export interface AgentSpawnOpts {
  id?: string;
  /** 不传则 start 一条新 session */
  sessionId?: string;
  title?: string;
  /** 若有，spawn 时 append 一条 role=system 的 message */
  systemPrompt?: string;
}

export interface AgentService {
  spawn(opts?: AgentSpawnOpts): AgentHandle;
  get(id: string): AgentHandle | undefined;
  list(): readonly AgentInfo[];
  /** 再 append 一条 system message；不改历史（session 只追加） */
  setSystemPrompt(id: string, content: string): void;
  stop(id: string): Promise<void>;
}
