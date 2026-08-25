import type {
  AssembledSection,
  ContextUsageCategory,
  ContextUsageCategoryId,
  ContextUsageInput,
  ContextUsageReport,
  LlmToolSpec,
  PromptAssembly,
  SessionEntry,
} from '@wizard-harness/contracts';
import { approxTokens } from './tokens.js';

const CATEGORY_LABELS: Record<ContextUsageCategoryId, string> = {
  'system-prompt': 'System prompt',
  'tool-definitions': 'Tool definitions',
  rules: 'Rules',
  skills: 'Skills',
  'mcp-tools': 'MCP & dynamic tools',
  subagents: 'Subagent definitions',
  'runtime-context': 'Runtime context',
  summarized: 'Summarized conversation',
  conversation: 'Conversation',
};

const SECTION_RE = {
  rule: /(?:^|:)rule(?:s)?(?:$|:)/i,
  skill: /(?:^|:)skill(?:s)?(?:$|:)/i,
  mcp: /(?:^|:)mcp(?:$|:)/i,
  subagent: /(?:^|:)subagent(?:s)?(?:$|:)/i,
};

function sectionBucket(name: string): ContextUsageCategoryId {
  if (SECTION_RE.rule.test(name)) return 'rules';
  if (SECTION_RE.skill.test(name)) return 'skills';
  if (SECTION_RE.mcp.test(name)) return 'mcp-tools';
  if (SECTION_RE.subagent.test(name)) return 'subagents';
  return 'system-prompt';
}

function toolsText(tools: readonly LlmToolSpec[]): string {
  if (!tools.length) return '';
  return JSON.stringify(
    tools.map((t) => ({ name: t.name, description: t.description ?? '' })),
    null,
    2,
  );
}

function isContextSnapshot(content: string, contextText: string): boolean {
  if (!content) return false;
  if (contextText && content === contextText) return true;
  return content.startsWith('Current runtime context:');
}

function collectConversation(
  entries: readonly SessionEntry[],
  contextText: string,
): { text: string; breakdown: { name: string; tokens: number; chars: number; text: string }[] } {
  const breakdown: { name: string; tokens: number; chars: number; text: string }[] = [];
  let idx = 0;
  for (const e of entries) {
    if (e.kind === 'message') {
      const role = String(e.data.role ?? '');
      const content = typeof e.data.content === 'string' ? e.data.content : '';
      if (role === 'system') continue;
      if (role === 'user' && isContextSnapshot(content, contextText)) continue;
      if (!content && role !== 'assistant') continue;
      idx += 1;
      const label = role === 'tool' ? `tool ${e.data.name ?? idx}` : `${role} #${idx}`;
      const block = `[${label}]\n${content}`;
      breakdown.push({ name: label, tokens: approxTokens(block), chars: block.length, text: block });
    } else if (e.kind === 'tool-result') {
      idx += 1;
      const name = typeof e.data.name === 'string' ? e.data.name : 'tool';
      const content = typeof e.data.content === 'string' ? e.data.content : '';
      const block = `[tool-result ${name}]\n${content}`;
      breakdown.push({
        name: `tool-result ${name}`,
        tokens: approxTokens(block),
        chars: block.length,
        text: block,
      });
    }
  }
  const text = breakdown.map((b) => b.text).join('\n\n');
  return { text, breakdown };
}

function collectSummarized(entries: readonly SessionEntry[]): string {
  const parts: string[] = [];
  for (const e of entries) {
    if (e.kind !== 'turn') continue;
    const phase = String(e.data.phase ?? '');
    if (phase === 'compact') {
      const dropped = e.data.dropped;
      parts.push(`[compact] dropped ${String(dropped ?? '?')} older entries`);
      continue;
    }
    const summary = typeof e.data.summary === 'string' ? e.data.summary : '';
    if (summary) parts.push(`[${phase || 'turn'}]\n${summary}`);
  }
  return parts.join('\n\n');
}

function bucketSections(sections: readonly AssembledSection[]): Map<ContextUsageCategoryId, AssembledSection[]> {
  const buckets = new Map<ContextUsageCategoryId, AssembledSection[]>();
  for (const s of sections) {
    const id = sectionBucket(s.name);
    const rows = buckets.get(id) ?? [];
    rows.push(s);
    buckets.set(id, rows);
  }
  return buckets;
}

function makeCategory(
  id: ContextUsageCategoryId,
  text: string,
  breakdown?: { name: string; tokens: number; chars: number; text: string }[],
): ContextUsageCategory | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return {
    id,
    label: CATEGORY_LABELS[id],
    tokens: approxTokens(trimmed),
    chars: trimmed.length,
    text: trimmed,
    breakdown: breakdown?.length ? breakdown : undefined,
  };
}

export function buildContextUsage(
  assembly: PromptAssembly,
  entries: readonly SessionEntry[],
  input: ContextUsageInput = {},
): ContextUsageReport {
  const limitTokens = Math.max(1, input.limitTokens ?? 200_000);
  const sectionBuckets = bucketSections(assembly.sections);
  const categories: ContextUsageCategory[] = [];

  for (const id of ['rules', 'skills', 'mcp-tools', 'subagents', 'system-prompt'] as const) {
    const rows = sectionBuckets.get(id) ?? [];
    if (!rows.length) continue;
    const breakdown = rows.map((s) => ({
      name: s.name,
      tokens: approxTokens(s.text),
      chars: s.text.length,
      text: s.text,
    }));
    const text = rows.map((s) => s.text).filter(Boolean).join('\n\n');
    const cat = makeCategory(id, text, breakdown);
    if (cat) categories.push(cat);
  }

  const toolsBody = toolsText(assembly.tools);
  const toolsCat = makeCategory('tool-definitions', toolsBody);
  if (toolsCat) categories.push(toolsCat);

  const ctxBreakdown = assembly.contexts.map((c) => ({
    name: c.name,
    tokens: approxTokens(c.text),
    chars: c.text.length,
    text: c.text,
  }));
  const runtimeCat = makeCategory('runtime-context', assembly.contextText, ctxBreakdown);
  if (runtimeCat) categories.push(runtimeCat);

  const summarizedText = collectSummarized(entries);
  const summarizedCat = makeCategory('summarized', summarizedText);
  if (summarizedCat) categories.push(summarizedCat);

  const conv = collectConversation(entries, assembly.contextText);
  const convCat = makeCategory('conversation', conv.text, conv.breakdown);
  if (convCat) categories.push(convCat);

  const totalTokens = categories.reduce((sum, c) => sum + c.tokens, 0);
  return {
    limitTokens,
    totalTokens,
    categories,
    sessionId: input.sessionId,
    at: Date.now(),
  };
}
