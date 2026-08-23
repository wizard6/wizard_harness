import type { PluginContext } from '@wizard-harness/core';
import type { LlmToolSpec } from './llm.js';

/**
 * 服务契约层：prompt-context 服务。
 *
 * 模型可见上下文组装：sections → system；contexts → user 快照；tools → 工具表。
 * 对齐 DSH system-prompt 的「名窄实宽」职责，本仓库服务名用 promptContext。
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
}
