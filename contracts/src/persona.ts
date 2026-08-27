/**
 * 服务契约层：persona 服务。
 *
 * 硅灵 = 恒定身份基线（soul.md 式 SystemPrompt），不是记忆系统。
 * 可保存多份、切换当前份；正文经 prompt-context 的 section 出门，本服务不替代组装器。
 */
export const PERSONA_SERVICE = 'persona';

/** 当前份 soul 的字数上限（按 Unicode 码点计） */
export const PERSONA_SOUL_LIMIT = 3000;

export interface PersonaProfile {
  readonly id: string;
  readonly name: string;
  /** 模型可见的身份基线（soul.md）；上限 PERSONA_SOUL_LIMIT */
  readonly soul: string;
  readonly updatedAt: number;
}

export interface PersonaSummary {
  readonly id: string;
  readonly name: string;
  readonly chars: number;
  readonly active: boolean;
  readonly updatedAt: number;
}

export interface PersonaSnapshot {
  readonly profile: PersonaProfile;
  readonly profiles: readonly PersonaSummary[];
  readonly preview: string;
  readonly chars: number;
  readonly limit: number;
}

export interface PersonaCreateInput {
  name: string;
  soul?: string;
  /** soul 缺省时由下列字段拼成 markdown */
  personality?: string;
  role?: string;
  voiceStyle?: string;
  tone?: string;
  traits?: string[];
  boundaries?: string;
  tagline?: string;
  habits?: string[];
  /** 创建后是否切为当前份，默认 true */
  activate?: boolean;
}

export interface PersonaUpdateInput {
  /** 缺省 = 当前份 */
  id?: string;
  name?: string;
  soul?: string;
  personality?: string;
  role?: string;
  voiceStyle?: string;
  tone?: string;
  traits?: string[];
  boundaries?: string;
  tagline?: string;
  habits?: string[];
}

export interface PersonaSavePatch {
  name?: string;
  soul?: string;
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
  readonly limit: number;
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

export interface PersonaService {
  snapshot(): PersonaSnapshot;
  list(): readonly PersonaSummary[];
  read(id?: string): PersonaReadResult;
  guide(): PersonaGuide;
  /** 新建一份硅灵（可带 soul 或结构化字段） */
  create(input: PersonaCreateInput): PersonaSnapshot;
  /** 更新指定或当前份 */
  update(input: PersonaUpdateInput): PersonaSnapshot;
  /** 切到指定份，之后 assemble 用这份 soul */
  activate(id: string): PersonaSnapshot;
  remove(id: string): PersonaSnapshot;
  /** 保存当前份（弹窗） */
  save(patch: PersonaSavePatch): PersonaSnapshot;
  /** 当前份 soul，给组装器或替换实现读 */
  soul(): string;
}
