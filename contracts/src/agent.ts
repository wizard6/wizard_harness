/**
 * 服务契约层：agent 服务。
 *
 * 契约属于系统而非任何插件。live agent = 一个 createScope + 绑定一条 session。
 * 管身份与可见性，不管循环（agent-loop），不管 System Prompt（system-prompt 插件）。
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
}

export interface AgentSpawnOpts {
  id?: string;
  /** 不传则 start 一条新 session */
  sessionId?: string;
  title?: string;
}

export interface AgentService {
  spawn(opts?: AgentSpawnOpts): AgentHandle;
  get(id: string): AgentHandle | undefined;
  list(): readonly AgentInfo[];
  stop(id: string): Promise<void>;
}
