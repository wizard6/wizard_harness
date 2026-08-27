import type { PersonaGuide } from '@wizard-harness/contracts';
import { PERSONA_SOUL_LIMIT } from '@wizard-harness/contracts';

export const PERSONA_GUIDE_VERSION = 2;

export const PERSONA_AUTHORING_HINT =
  '你尚未定制专属硅灵。可先 persona_guide 看模板，再用 persona_create 新建一份身份基线（soul，≤3000 字）；多份时用 persona_switch 切换，persona_update 更新当前份。';

export function buildPersonaGuide(persistHint: string): PersonaGuide {
  return {
    version: PERSONA_GUIDE_VERSION,
    persistHint,
    limit: PERSONA_SOUL_LIMIT,
    workflow: [
      '1. persona_list — 有哪些硅灵、谁是当前份',
      '2. persona_read — 读当前或指定 id 的 soul',
      '3. persona_guide — 取字段说明与写作模板（本工具）',
      '4. persona_create — 新建一份身份基线（name + soul，或结构化字段）',
      '5. persona_update — 更新当前或指定 id',
      '6. persona_switch — 切换当前份（之后每轮 assemble 用这份 soul）',
    ],
    fields: [
      {
        key: 'name',
        label: '名称',
        required: true,
        hint: '切换器用的短名，如「小织」「代码搭档」',
        maxLength: 80,
      },
      {
        key: 'soul',
        label: '身份基线',
        required: true,
        hint: 'soul.md 式 Markdown：我是谁、如何协作、边界。会整段进 system。上限 3000 字。',
        maxLength: PERSONA_SOUL_LIMIT,
      },
    ],
    template: [
      '# 我是谁',
      '名称：',
      '角色：',
      '',
      '# 硅格',
      '我是…。与用户协作时，我会…。遇到不确定会先说明假设，不编造结果。',
      '',
      '# 习惯',
      '- 先看工作区再改文件',
      '- 长任务拆步汇报',
    ].join('\n'),
    checklist: [
      `soul 是否 ≤ ${PERSONA_SOUL_LIMIT} 字`,
      '是否写清身份与协作方式（恒定基线，不要塞会话记忆）',
      '边界是否覆盖幻觉与越权',
      '多份硅灵名称是否好区分',
    ],
  };
}
