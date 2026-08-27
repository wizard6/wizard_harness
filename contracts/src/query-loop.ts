/**
 * 服务契约层：queryLoop 服务。
 *
 * 可扩展 query 循环（公开的 Claude Code 架构：模型 ↔ 工具直到 end_turn）。
 * 仍提供 agentLoop 兼容面；hook 只挂在 queryLoop.use。
 */
import type { AgentLoopResult, AgentLoopRunOpts, AgentLoopService } from './agent-loop.js';

export const QUERY_LOOP_SERVICE = 'queryLoop';

export type QueryStage =
  | 'before-turn'
  | 'assemble'
  | 'after-model'
  | 'before-tool'
  | 'after-tool'
  | 'after-turn';

export type QueryHookAction = 'continue' | 'stop' | 'skip-tools';

export interface QueryHookResult {
  readonly action: QueryHookAction;
  readonly reason?: string;
}

export interface QueryToolIntent {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly id?: string;
}

export interface QueryHookContext {
  readonly stage: QueryStage;
  readonly turn: number;
  readonly maxTurns: number;
  readonly agentId: string;
  readonly sessionId: string;
  readonly signal: AbortSignal;
  text: string;
  intents: QueryToolIntent[];
}

export interface QueryHook {
  readonly name: string;
  readonly stages: readonly QueryStage[];
  run(ctx: QueryHookContext): Promise<QueryHookResult | void> | QueryHookResult | void;
}

export interface QueryLoopInspect {
  readonly paradigm: 'query';
  readonly hooks: readonly string[];
  readonly maxSteps: number;
}

export interface QueryLoopService extends AgentLoopService {
  use(hook: QueryHook): () => void;
  inspect(): QueryLoopInspect;
}
