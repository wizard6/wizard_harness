import type { PluginContext } from '@wizard-harness/core';
import type { LlmToolSpec } from './llm.js';

/**
 * 服务契约层：prompt-context 服务。
 *
 * 模型可见上下文组装：sections → system；contexts → user 快照；tools → 工具表。
 * 本仓库没有 system-prompt 插件；DSH 的「名窄实宽」组装职责由 promptContext 承担。
 */
export const PROMPT_CONTEXT_SERVICE = 'promptContext';

/** 与 core ScopeKey 同构的不透明引用 */
export type ScopeRef = object;

export interface AssembleContext {
  readonly sessionId?: string;
  readonly scope?: ScopeRef;
  readonly signal?: AbortSignal;
}

export interface PromptSection {
  readonly name: string;
  readonly order: number;
  readonly text: string | ((ctx: AssembleContext) => string);
}

export interface PromptContextEntry {
  readonly name: string;
  readonly order: number;
  readonly text: string | ((ctx: AssembleContext) => string);
}

export interface AssembledSection {
  readonly name: string;
  readonly order: number;
  readonly text: string;
}

export interface AssembledContextEntry {
  readonly name: string;
  readonly order: number;
  readonly text: string;
}

export type PromptSourceKind = 'section' | 'context' | 'variable' | 'tools' | 'persona';

/** 一条尚未拼装（或无需拼装）的登记素材 */
export interface PromptSource {
  readonly kind: PromptSourceKind;
  readonly name: string;
  readonly order?: number;
  /** global，或 scope 的可序列化标签 */
  readonly layer: string;
  /** text/provider 是否为函数 */
  readonly live: boolean;
  readonly preview: string;
}

/** 最近一次写入 session 的成品 */
export interface PromptApplied {
  readonly sessionId: string;
  readonly at: number;
  readonly systemText: string;
  readonly contextText: string;
  readonly tools: readonly LlmToolSpec[];
}

/** 素材清单 + 最近拼装/落盘成品 */
export interface PromptInspect {
  readonly sources: readonly PromptSource[];
  readonly assembly?: PromptAssembly;
  readonly assembledAt?: number;
  readonly applied?: PromptApplied;
}

export type ContextUsageCategoryId =
  | 'system-prompt'
  | 'tool-definitions'
  | 'rules'
  | 'skills'
  | 'mcp-tools'
  | 'subagents'
  | 'runtime-context'
  | 'summarized'
  | 'conversation';

export interface ContextUsageBreakdown {
  readonly name: string;
  readonly tokens: number;
  readonly chars: number;
  readonly text: string;
}

export interface ContextUsageCategory {
  readonly id: ContextUsageCategoryId;
  readonly label: string;
  readonly tokens: number;
  readonly chars: number;
  readonly text: string;
  readonly breakdown?: readonly ContextUsageBreakdown[];
}

export interface ContextUsageInput {
  readonly sessionId?: string;
  readonly scope?: ScopeRef;
  /** 上下文窗口 token 上限（仅用于百分比展示，默认 200_000） */
  readonly limitTokens?: number;
}

export interface ContextUsageReport {
  readonly limitTokens: number;
  readonly totalTokens: number;
  readonly categories: readonly ContextUsageCategory[];
  readonly sessionId?: string;
  readonly at: number;
}

export interface PromptAssembly {
  readonly sections: readonly AssembledSection[];
  readonly contexts: readonly AssembledContextEntry[];
  readonly tools: readonly LlmToolSpec[];
  readonly variables: Readonly<Record<string, string | undefined>>;
  /** sections 插值并拼接后的 system 文本 */
  readonly systemText: string;
  /** contexts 拼接后的 user 快照文本；空串表示无动态上下文 */
  readonly contextText: string;
}

export interface PromptContextBinding {
  section(section: PromptSection): () => void;
  context(entry: PromptContextEntry): () => void;
  variable(name: string, provider: (ctx: AssembleContext) => string | undefined): () => void;
  tools(provider: (ctx: AssembleContext) => readonly LlmToolSpec[]): () => void;
}

export interface PromptContextService {
  section(section: PromptSection): () => void;
  context(entry: PromptContextEntry): () => void;
  variable(name: string, provider: (ctx: AssembleContext) => string | undefined): () => void;
  tools(provider: (ctx: AssembleContext) => readonly LlmToolSpec[]): () => void;
  /** 在指定 ctx 的 scope 层登记（如 agent.ctx） */
  bind(owner: PluginContext): PromptContextBinding;
  assemble(ctx?: AssembleContext): PromptAssembly;
  /** 把 assembly 写入 session；内容指纹未变则跳过 */
  apply(sessionId: string, assembly?: PromptAssembly): void;
  /** 按 session 登记一次性 persona（order 0，shadow 同名 section） */
  setPersona(sessionId: string, content: string): void;
  getPersona(sessionId: string): string | undefined;
  /** 登记中的素材 + 最近一次 assemble/apply 成品（弹窗追溯用） */
  inspect(): PromptInspect;
  /** 按类别估算上下文用量（token ≈ chars/4）；可点击查看各类正文 */
  usage(input?: ContextUsageInput): ContextUsageReport;
}
