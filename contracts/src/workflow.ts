/**
 * 服务契约层：workflow 服务。
 *
 * 固定调度：按图走节点。节点种类由其它插件 registerNode 登记，本服务不内置业务节点。
 * 一次 run 的节点状态由本服务持有，不借用 session。
 *
 * 与 agent 的交汇（调度器只提供原语，不自己登记工具、不内置 agent 节点）：
 * - 节点当工具：handler.asTool 声明 + exec(kind)；tools.register 由后续插件做
 * - 节点选 agent：ctx.agentLoop / node.agentId；kind=agent 的 handler 由后续插件 registerNode
 */
import type { AgentService } from './agent.js';
import type { AgentLoopService } from './agent-loop.js';
import type { ToolsService } from './tools.js';

export const WORKFLOW_SERVICE = 'workflow';

/** 工具名约定：wf.<kind>。真正 register 不在本服务。 */
export function workflowToolName(kind: string): string {
  return `wf.${kind.trim()}`;
}

export interface WorkflowNodeContext {
  readonly tools?: ToolsService;
  readonly agent?: AgentService;
  readonly agentLoop?: AgentLoopService;
  readonly signal?: AbortSignal;
}

export interface WorkflowNodeAsTool {
  readonly name?: string;
  readonly description?: string;
}

export interface WorkflowNodePorts {
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
}

/** 一种节点。新种类实现本接口并 registerNode，不要改调度器。 */
export interface WorkflowNodeHandler {
  readonly kind: string;
  readonly ports?: WorkflowNodePorts;
  /** 声明可被当成 agent 工具。调度器不调用 tools.register。 */
  readonly asTool?: WorkflowNodeAsTool;
  execute(
    node: WorkflowNode,
    inputs: Record<string, unknown>,
    ctx: WorkflowNodeContext,
  ): Promise<Record<string, unknown>>;
}

export interface WorkflowListedKind {
  readonly kind: string;
  readonly ports?: WorkflowNodePorts;
  readonly asTool?: { readonly name: string; readonly description?: string };
}

/** 端口取值：run 入参 / 上游节点输出 / 字面量 */
export type WorkflowWire =
  | { readonly from: 'input'; readonly key: string }
  | { readonly from: 'node'; readonly node: string; readonly key: string }
  | { readonly from: 'value'; readonly value: unknown };

export interface WorkflowNode {
  readonly id: string;
  readonly kind: string;
  readonly in?: Readonly<Record<string, WorkflowWire>>;
  readonly tool?: string;
  readonly params?: Readonly<Record<string, unknown>>;
  /** 本节点选用的 live agent。kind=agent 时有意义；其它 kind 可忽略 */
  readonly agentId?: string;
}

export interface WorkflowGraph {
  readonly id?: string;
  /** v1：数组顺序即调度顺序 */
  readonly nodes: readonly WorkflowNode[];
}

export interface WorkflowNodeRecord {
  readonly nodeId: string;
  readonly kind: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly ok: boolean;
  readonly error?: string;
}

export interface WorkflowRun {
  readonly id: string;
  readonly graphId?: string;
  readonly status: 'running' | 'ok' | 'error' | 'cancelled';
  readonly nodes: readonly WorkflowNodeRecord[];
  readonly error?: string;
}

export interface WorkflowRunOpts {
  graph?: WorkflowGraph;
  input?: Readonly<Record<string, unknown>>;
}

export interface WorkflowExecOpts {
  params?: Readonly<Record<string, unknown>>;
  agentId?: string;
  signal?: AbortSignal;
  nodeId?: string;
}

export interface WorkflowService {
  /** 登记节点种类；返回撤销函数 */
  registerNode(handler: WorkflowNodeHandler): () => void;
  /** 已登记种类（含 asTool 解析后的工具名） */
  listNodes(): readonly WorkflowListedKind[];
  /** 跑一种节点，不建图、不写入 latest()。供工具封装。 */
  exec(kind: string, inputs?: Readonly<Record<string, unknown>>, opts?: WorkflowExecOpts): Promise<Record<string, unknown>>;
  run(opts?: WorkflowRunOpts): Promise<WorkflowRun>;
  cancel(runId: string): void;
  get(id: string): WorkflowRun | undefined;
  latest(): WorkflowRun | undefined;
}
