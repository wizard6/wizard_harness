/** Agent Skills：发现 SKILL.md、目录注入 prompt-context、按需读取全文 */
export const SKILLS_SERVICE = 'skills';

export interface SkillInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly enabled: boolean;
  readonly alwaysApply: boolean;
}

export interface SkillDetail extends SkillInfo {
  readonly body: string;
}

export interface SkillsSnapshot {
  readonly scannedAt: number;
  readonly scanDirs: readonly string[];
  readonly skills: readonly SkillInfo[];
  readonly enabledCount: number;
  readonly alwaysApplyCount: number;
}

export interface SkillsService {
  snapshot(): SkillsSnapshot;
  list(): readonly SkillInfo[];
  get(id: string): SkillDetail | undefined;
  scan(): SkillsSnapshot;
  setEnabled(id: string, enabled: boolean): SkillsSnapshot;
  setAlwaysApply(id: string, alwaysApply: boolean): SkillsSnapshot;
}
