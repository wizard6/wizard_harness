import type { PersonaGuide } from '@wizard-harness/contracts';

export const PERSONA_GUIDE_VERSION = 1;

export const PERSONA_AUTHORING_HINT =
  '你尚未定制专属人格。可先调用 persona_guide 查看字段与模板，再用 persona_apply 一次性写入名字、说话风格、性格与人格正文；之后用 persona_configure 微调。';

export function buildPersonaGuide(persistHint: string): PersonaGuide {
  return {
    version: PERSONA_GUIDE_VERSION,
    persistHint,
    workflow: [
      '1. persona_read — 看清当前档案与是否仍为默认人设',
      '2. persona_guide — 取字段说明与写作模板（本工具）',
      '3. persona_apply — 一次性写入自生成人格（推荐首次定制）',
      '4. persona_configure — 局部修改名字 / 风格 / 性格 / 正文 / 习惯',
      '5. persona_remember — 记事实或追加习惯（与跨会话 memory 桶分工）',
    ],
    fields: [
      {
        key: 'name',
        label: '名字',
        required: true,
        hint: '助手自称或对外名称，如「小织」「Aria」',
        maxLength: 80,
      },
      {
        key: 'role',
        label: '角色定位',
        required: true,
        hint: '你主要帮用户做什么，如「全栈编程搭档」「研究助理」',
        maxLength: 120,
      },
      {
        key: 'voiceStyle',
        label: '说话风格',
        required: true,
        hint: '句式与用词偏好：简洁直接 / 温和细致 / 技术文档风…',
        maxLength: 200,
      },
      {
        key: 'tone',
        label: '语气基调',
        required: false,
        hint: '整体情绪色彩：冷静、热情、克制幽默…',
        maxLength: 120,
      },
      {
        key: 'traits',
        label: '性格特质',
        required: true,
        hint: '3~6 个关键词数组，如 ["好奇","直接","耐心"]',
        maxLength: 40,
      },
      {
        key: 'personality',
        label: '人格正文',
        required: true,
        hint: '第一人称写清身份、原则、与用户协作方式（会进 system）',
        maxLength: 4000,
      },
      {
        key: 'boundaries',
        label: '边界',
        required: false,
        hint: '不做的事、不假装拥有的能力、需先确认再行动的场景',
        maxLength: 800,
      },
      {
        key: 'tagline',
        label: '一句话自述',
        required: false,
        hint: '极短自我介绍，便于开场对齐人设',
        maxLength: 200,
      },
      {
        key: 'habits',
        label: '工作习惯',
        required: false,
        hint: '可执行的小习惯列表，会进 system 习惯段',
        maxLength: 200,
      },
    ],
    template: [
      '【名字】',
      '【角色】',
      '【说话风格】',
      '【语气】',
      '【性格特质】好奇、直接、耐心',
      '【人格正文】我是…。与用户协作时，我会…。遇到不确定会先…。',
      '【边界】不编造执行结果；不跳过测试就宣称完成。',
      '【自述】',
      '【习惯】',
      '- 先看上下文再改文件',
      '- 长任务拆步汇报',
    ].join('\n'),
    checklist: [
      '名字与角色是否一致、好记',
      '说话风格是否具体（避免「友好专业」空泛词）',
      '人格正文是否第一人称、可执行',
      '边界是否覆盖幻觉与越权风险',
      '习惯是否与工具链/仓库约定相符',
    ],
  };
}
