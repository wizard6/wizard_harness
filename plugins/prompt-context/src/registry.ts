import {
  AnonymousEntries,
  NamedEntries,
  ScopedLayers,
  type PluginContext,
  type ScopeKey,
} from '@wizard-harness/core';
import type {
  AssembleContext,
  AssembledContextEntry,
  AssembledSection,
  LlmToolSpec,
  PromptAssembly,
  PromptContextEntry,
  PromptContextService,
  PromptSection,
  SessionService,
  TrajectoryService,
} from '@wizard-harness/contracts';
import { renderContexts, renderSections } from './render.js';

const PERSONA_SECTION = 'session:persona';
const PERSONA_ORDER = 0;

interface PromptLayer {
  sections: NamedEntries<PromptSection>;
  contexts: NamedEntries<PromptContextEntry>;
  variables: NamedEntries<(ctx: AssembleContext) => string | undefined>;
  toolProviders: AnonymousEntries<(ctx: AssembleContext) => readonly LlmToolSpec[]>;
  isEmpty(): boolean;
}

function createLayer(): PromptLayer {
  const sections = new NamedEntries<PromptSection>((name) => new Error(`section 重名：${name}`));
  const contexts = new NamedEntries<PromptContextEntry>((name) => new Error(`context 重名：${name}`));
  const variables = new NamedEntries<(ctx: AssembleContext) => string | undefined>(
    (name) => new Error(`variable 重名：${name}`),
  );
  const toolProviders = new AnonymousEntries<(ctx: AssembleContext) => readonly LlmToolSpec[]>();
  return {
    sections,
    contexts,
    variables,
    toolProviders,
    isEmpty() {
      return sections.isEmpty() && contexts.isEmpty() && variables.isEmpty() && toolProviders.isEmpty();
    },
  };
}

function sessionOf(ctx: PluginContext): SessionService {
  const s = ctx.session ?? ctx.get<SessionService>('session');
  if (!s) throw new Error('prompt-context 需要 session 服务');
  return s;
}

function resolveText(
  text: string | ((ctx: AssembleContext) => string),
  assembleCtx: AssembleContext,
): string {
  return typeof text === 'function' ? text(assembleCtx) : text;
}

function sortByOrder<T extends { order: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.order - b.order || 0);
}

/** 模型可见上下文组装注册表；ScopedLayers 归档 section/context/variable/tools。 */
export function createPromptContextRegistry(ctx: PluginContext): PromptContextService {
  const layers = new ScopedLayers(createLayer, () => {});
  const personas = new Map<string, string>();
  const applied = new Map<string, { systemText: string; contextText: string }>();

  function resolveVariables(assembleCtx: AssembleContext, scope: ScopeKey | undefined): Record<string, string | undefined> {
    const merged = layers.merge(scope, (layer) => layer.variables);
    const out: Record<string, string | undefined> = {};
    for (const [name, provider] of merged) out[name] = provider(assembleCtx);
    return out;
  }

  function resolveSections(assembleCtx: AssembleContext, scope: ScopeKey | undefined): AssembledSection[] {
    const merged = layers.merge(scope, (layer) => layer.sections);
    const rows: AssembledSection[] = [];
    for (const [name, section] of merged) {
      rows.push({
        name,
        order: section.order,
        text: resolveText(section.text, assembleCtx),
      });
    }
    const sid = assembleCtx.sessionId;
    if (sid) {
      const persona = personas.get(sid);
      if (persona !== undefined) {
        const idx = rows.findIndex((r) => r.name === PERSONA_SECTION);
        const row: AssembledSection = { name: PERSONA_SECTION, order: PERSONA_ORDER, text: persona };
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
      }
    }
    return sortByOrder(rows);
  }

  function resolveContexts(assembleCtx: AssembleContext, scope: ScopeKey | undefined): AssembledContextEntry[] {
    const merged = layers.merge(scope, (layer) => layer.contexts);
    const rows: AssembledContextEntry[] = [];
    for (const [name, entry] of merged) {
      rows.push({
        name,
        order: entry.order,
        text: resolveText(entry.text, assembleCtx),
      });
    }
    return sortByOrder(rows);
  }

  function resolveTools(assembleCtx: AssembleContext, scope: ScopeKey | undefined): LlmToolSpec[] {
    const seen = new Map<string, LlmToolSpec>();
    const chain = [layers.global, ...layers.chainLayers(scope)];
    for (const layer of chain) {
      for (const provider of layer.toolProviders.values()) {
        for (const spec of provider(assembleCtx)) {
          const name = spec.name?.trim();
          if (!name) continue;
          seen.set(name, { name, description: spec.description });
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    bind(owner: PluginContext) {
      return {
        section: (section) => layers.effect(owner, (layer) => layer.sections.insert(section.name, section), { label: section.name }),
        context: (entry) => layers.effect(owner, (layer) => layer.contexts.insert(entry.name, entry), { label: entry.name }),
        variable: (name, provider) => layers.effect(owner, (layer) => layer.variables.insert(name, provider), { label: name }),
        tools: (provider) => layers.effect(owner, (layer) => layer.toolProviders.append(provider), { label: 'tools' }),
      };
    },
    section(section) {
      return layers.effect(ctx, (layer) => layer.sections.insert(section.name, section), { label: section.name });
    },
    context(entry) {
      return layers.effect(ctx, (layer) => layer.contexts.insert(entry.name, entry), { label: entry.name });
    },
    variable(name, provider) {
      return layers.effect(ctx, (layer) => layer.variables.insert(name, provider), { label: name });
    },
    tools(provider) {
      return layers.effect(ctx, (layer) => layer.toolProviders.append(provider), { label: 'tools' });
    },
    assemble(assembleCtx: AssembleContext = {}) {
      const scope = assembleCtx.scope as ScopeKey | undefined;
      const variables = resolveVariables(assembleCtx, scope);
      const sections = resolveSections(assembleCtx, scope);
      const contexts = resolveContexts(assembleCtx, scope);
      const tools = resolveTools(assembleCtx, scope);
      const systemText = renderSections(sections, variables);
      const contextText = renderContexts(contexts, variables);
      const assembly: PromptAssembly = { sections, contexts, tools, variables, systemText, contextText };
      ctx.emit({
        action: 'prompt-context/assemble',
        target: assembleCtx.sessionId ?? 'global',
        payload: {
          sections: sections.length,
          contexts: contexts.length,
          tools: tools.length,
          systemBytes: systemText.length,
          contextBytes: contextText.length,
        },
      });
      ctx.get<TrajectoryService>('trajectory')?.record(assembleCtx.sessionId ?? 'global', 'prompt', {
        phase: 'assemble',
        systemText,
        contextText,
        tools,
      });
      return assembly;
    },
    apply(sessionId, assembly) {
      const sess = sessionOf(ctx).get(sessionId);
      if (!sess) {
        if (!assembly) return;
        throw new Error(`session 不存在：${sessionId}`);
      }
      const built = assembly ?? this.assemble({ sessionId });
      const prev = applied.get(sessionId);
      if (prev && prev.systemText === built.systemText && prev.contextText === built.contextText) return;

      if (built.systemText) sess.append('message', { role: 'system', content: built.systemText });
      if (built.contextText) sess.append('message', { role: 'user', content: built.contextText });

      applied.set(sessionId, { systemText: built.systemText, contextText: built.contextText });
      ctx.emit({
        action: 'prompt-context/apply',
        target: sessionId,
        payload: {
          systemBytes: built.systemText.length,
          contextBytes: built.contextText.length,
          tools: built.tools.length,
        },
      });
      ctx.get<TrajectoryService>('trajectory')?.record(sessionId, 'prompt', {
        phase: 'apply',
        systemText: built.systemText,
        contextText: built.contextText,
      });
    },
    setPersona(sessionId, content) {
      if (typeof content !== 'string') throw new Error('persona 必须是字符串');
      if (!sessionOf(ctx).get(sessionId)) throw new Error(`session 不存在：${sessionId}`);
      personas.set(sessionId, content);
      applied.delete(sessionId);
      ctx.emit({ action: 'prompt-context/persona', target: sessionId, payload: { bytes: content.length } });
    },
    getPersona(sessionId) {
      return personas.get(sessionId);
    },
  };
}
