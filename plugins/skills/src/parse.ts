const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseYamlLine(line: string): { key: string; value: string } | undefined {
  const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
  if (!m) return undefined;
  let value = m[2]!.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key: m[1]!.toLowerCase(), value };
}

function asBool(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === '1';
}

export interface ParsedSkillFile {
  name?: string;
  description?: string;
  alwaysApply: boolean;
  body: string;
}

/** 解析 SKILL.md：可选 YAML frontmatter + 正文 */
export function parseSkillMarkdown(text: string): ParsedSkillFile {
  const trimmed = text.replace(/^\uFEFF/, '');
  const m = trimmed.match(FM_RE);
  if (!m) return { body: trimmed.trim(), alwaysApply: false };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const row = parseYamlLine(line.trim());
    if (row) meta[row.key] = row.value;
  }
  return {
    name: meta.name?.trim() || undefined,
    description: meta.description?.trim() || undefined,
    alwaysApply: asBool(meta.alwaysapply ?? meta['always-apply']),
    body: m[2]!.trim(),
  };
}

export function firstParagraph(body: string, max = 240): string {
  const block = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim())
    .find(Boolean);
  if (!block) return '';
  return block.length <= max ? block : `${block.slice(0, max)}…`;
}
