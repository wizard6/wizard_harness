import type { ToolboxScriptKind } from '@wizard-harness/contracts';

const KINDS = new Set<ToolboxScriptKind>(['shell', 'open_path', 'open_url']);

export interface ToolboxParamConfig {
  readonly key: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly default?: string;
}

export interface ToolboxScriptConfig {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly kind: ToolboxScriptKind;
  readonly command?: string;
  readonly path?: string;
  readonly url?: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly params?: readonly ToolboxParamConfig[];
}

export function toolboxToolName(name: string): string {
  return `box.${name.trim()}`;
}

export function toolboxWorkflowKind(name: string): string {
  return `box.${name.trim()}`;
}

function asScript(raw: unknown, index: number): ToolboxScriptConfig {
  if (!raw || typeof raw !== 'object') throw new Error(`scripts[${index}] 必须是对象`);
  const row = raw as Record<string, unknown>;
  const name = String(row.name ?? '').trim();
  if (!name) throw new Error(`scripts[${index}].name 必填`);
  if (!/^[a-z][a-z0-9_]*$/i.test(name)) {
    throw new Error(`scripts[${index}].name 仅允许字母数字下划线：${name}`);
  }
  const kind = String(row.kind ?? 'shell').trim() as ToolboxScriptKind;
  if (!KINDS.has(kind)) throw new Error(`scripts[${index}].kind 无效：${kind}`);
  const description = row.description === undefined ? undefined : String(row.description);
  const command = row.command === undefined ? undefined : String(row.command);
  const path = row.path === undefined ? undefined : String(row.path);
  const url = row.url === undefined ? undefined : String(row.url);
  const cwd = row.cwd === undefined ? undefined : String(row.cwd);
  const timeoutMs = row.timeoutMs === undefined ? undefined : Number(row.timeoutMs);
  const label = row.label === undefined ? undefined : String(row.label);
  let params: ToolboxParamConfig[] | undefined;
  if (row.params !== undefined) {
    if (!Array.isArray(row.params)) throw new Error(`scripts[${index}].params 必须是数组`);
    params = row.params.map((p, j) => {
      if (!p || typeof p !== 'object') throw new Error(`scripts[${index}].params[${j}] 必须是对象`);
      const pr = p as Record<string, unknown>;
      const key = String(pr.key ?? '').trim();
      if (!key) throw new Error(`scripts[${index}].params[${j}].key 必填`);
      return {
        key,
        label: pr.label === undefined ? undefined : String(pr.label),
        placeholder: pr.placeholder === undefined ? undefined : String(pr.placeholder),
        default: pr.default === undefined ? undefined : String(pr.default),
      };
    });
  }
  if (kind === 'shell' && !command?.trim()) {
    throw new Error(`scripts[${index}] shell 需要 command`);
  }
  if (kind === 'open_path' && path === undefined) {
    throw new Error(`scripts[${index}] open_path 需要 path`);
  }
  if (kind === 'open_url' && !url?.trim()) {
    throw new Error(`scripts[${index}] open_url 需要 url`);
  }
  return { name, label, description, kind, command, path, url, cwd, timeoutMs, params };
}

export function parseScripts(config: Record<string, unknown>): ToolboxScriptConfig[] {
  const raw = config.scripts;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('toolbox.config.scripts 必须是数组');
  const seen = new Set<string>();
  const out: ToolboxScriptConfig[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const script = asScript(raw[i], i);
    if (seen.has(script.name)) throw new Error(`scripts 名称重复：${script.name}`);
    seen.add(script.name);
    out.push(script);
  }
  return out;
}

export const DEFAULT_SCRIPTS: ToolboxScriptConfig[] = [
  {
    name: 'open_folder',
    label: '打开文件夹',
    description: '在资源管理器中打开工作区目录。可选 path 子目录。',
    kind: 'open_path',
    path: '{{path}}',
    params: [{ key: 'path', label: '子路径', placeholder: '留空=工作区根' }],
  },
];
