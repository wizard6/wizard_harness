import type { AssembledSection } from '@wizard-harness/contracts';

const VAR_RE = /\{\{([a-z][a-z0-9_]*)\}\}/g;

export function interpolate(
  text: string,
  variables: Readonly<Record<string, string | undefined>>,
  label: string,
): string {
  return text.replace(VAR_RE, (_, name: string) => {
    if (!Object.hasOwn(variables, name)) throw new Error(`${label} 未知变量：${name}`);
    const value = variables[name];
    if (value === undefined) throw new Error(`${label} 变量无值：${name}`);
    return value;
  });
}

export function renderSections(
  sections: readonly AssembledSection[],
  variables: Readonly<Record<string, string | undefined>>,
): string {
  return sections
    .map((s) => interpolate(s.text, variables, `section ${s.name}`))
    .filter((t) => t.length > 0)
    .join('\n\n');
}

export function renderContexts(
  contexts: readonly { name: string; text: string }[],
  variables: Readonly<Record<string, string | undefined>>,
): string {
  const parts = contexts
    .map((c) => interpolate(c.text, variables, `context ${c.name}`))
    .filter((t) => t.length > 0);
  if (!parts.length) return '';
  return ['Current runtime context:', ...parts].join('\n\n');
}
