/**
 * 服务契约层：persona 服务。
 *
 * 当前助手的人格 / 习惯 / 相关记忆。正文经 prompt-context 的 section/context 出门，
 * 本服务不替代组装器。
 */
export const PERSONA_SERVICE = 'persona';

export interface PersonaMemory {
  readonly id: string;
  readonly text: string;
  readonly pinned: boolean;
  readonly at: number;
}

/** 助手元数据：名字、风格、性格等结构化设定 */
export interface PersonaMeta {
  readonly role: string;
  readonly voiceStyle: string;
  readonly tone: string;
  readonly traits: readonly string[];
  readonly boundaries: string;
  readonly tagline: string;
}

export interface PersonaProfile {
  readonly id: string;
  readonly name: string;
  readonly personality: string;
  readonly habits: readonly string[];
  readonly memories: readonly PersonaMemory[];
  readonly meta: PersonaMeta;
  readonly updatedAt: number;
}

export interface PersonaPreview {
  readonly core: string;
  readonly memory: string;
}

export interface PersonaAgentRef {
  readonly id: string;
  readonly sessionId: string;
}

export interface PersonaSnapshot {
  readonly profile: PersonaProfile;
  readonly preview: PersonaPreview;
  readonly agents: readonly PersonaAgentRef[];
}

export interface PersonaSavePatch {
  name?: string;
  personality?: string;
  habits?: string[];
  meta?: Partial<PersonaMeta>;
}

/** 局部修改人格档案（元数据 + 正文） */
export interface PersonaConfigurePatch extends PersonaSavePatch {}

/** 一次性写入完整自生成人格 */
export interface PersonaApplyInput {
  name: string;
  personality: string;
  role?: string;
  voiceStyle?: string;
  tone?: string;
  traits?: string[];
  boundaries?: string;
  tagline?: string;
  habits?: string[];
  /** true 时覆盖习惯；false 时与现有习惯去重合并 */
  replaceHabits?: boolean;
}

export interface PersonaGuideField {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly hint: string;
  readonly maxLength: number;
}

export interface PersonaGuide {
  readonly version: number;
  readonly persistHint: string;
  readonly workflow: readonly string[];
  readonly fields: readonly PersonaGuideField[];
  readonly template: string;
  readonly checklist: readonly string[];
}

export interface PersonaReadResult {
  readonly snapshot: PersonaSnapshot;
  readonly persistFile: string | null;
  readonly isDefault: boolean;
}

export interface PersonaRememberInput {
  text: string;
  pinned?: boolean;
  kind?: 'memory' | 'habit';
}

export interface PersonaService {
  snapshot(): PersonaSnapshot;
  read(): PersonaReadResult;
  guide(): PersonaGuide;
  save(patch: PersonaSavePatch): PersonaSnapshot;
  configure(patch: PersonaConfigurePatch): PersonaSnapshot;
  apply(input: PersonaApplyInput): PersonaSnapshot;
  addMemory(input: { text: string; pinned?: boolean }): PersonaSnapshot;
  removeMemory(id: string): PersonaSnapshot;
  pinMemory(id: string, pinned: boolean): PersonaSnapshot;
  remember(input: PersonaRememberInput): PersonaSnapshot;
}
