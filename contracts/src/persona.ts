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

export interface PersonaProfile {
  readonly id: string;
  readonly name: string;
  readonly personality: string;
  readonly habits: readonly string[];
  readonly memories: readonly PersonaMemory[];
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
}

export interface PersonaRememberInput {
  text: string;
  pinned?: boolean;
  kind?: 'memory' | 'habit';
}

export interface PersonaService {
  snapshot(): PersonaSnapshot;
  save(patch: PersonaSavePatch): PersonaSnapshot;
  addMemory(input: { text: string; pinned?: boolean }): PersonaSnapshot;
  removeMemory(id: string): PersonaSnapshot;
  pinMemory(id: string, pinned: boolean): PersonaSnapshot;
  remember(input: PersonaRememberInput): PersonaSnapshot;
}
