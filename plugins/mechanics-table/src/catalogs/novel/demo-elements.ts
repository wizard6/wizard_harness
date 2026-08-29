import type { TableElement } from '@wizard-harness/contracts';

/** 小说元素 · 演示集（样例，不算正式库） */
export const DEMO_NOVEL_ELEMENTS: readonly Omit<TableElement, 'kind'>[] = [
  { id: 'novel-hero', symbol: 'Hr', name: '主角', group: 'character', period: 1, atomic: 1, blurb: '读者跟随的核心视点人物。', demo: 'ally' },
  { id: 'novel-hook', symbol: 'Hk', name: '钩子', group: 'plot', period: 1, atomic: 2, blurb: '开篇抓住注意力的承诺。', demo: 'goal' },
  { id: 'novel-setting', symbol: 'Se', name: '场景', group: 'world', period: 1, atomic: 3, blurb: '故事发生的具体时空。', demo: 'arena' },
  { id: 'novel-motif', symbol: 'Mo', name: '母题', group: 'theme', period: 1, atomic: 4, blurb: '反复出现的意象或命题。', demo: 'echo' },
  { id: 'novel-voice', symbol: 'Vo', name: '声音', group: 'style', period: 1, atomic: 5, blurb: '叙述者独特的语气。', demo: 'wave' },
  { id: 'novel-beat', symbol: 'Be', name: '节拍', group: 'pacing', period: 1, atomic: 6, blurb: '场景内最小叙事单位。', demo: 'beat' },

  { id: 'novel-foil', symbol: 'Fo', name: '对照', group: 'character', period: 2, atomic: 7, blurb: '衬托主角特质的配角。', demo: 'rival' },
  { id: 'novel-turn', symbol: 'Tu', name: '转折', group: 'plot', period: 2, atomic: 8, blurb: '局势不可逆的变化点。', demo: 'chance' },
  { id: 'novel-rule', symbol: 'Ru', name: '规则', group: 'world', period: 2, atomic: 9, blurb: '世界内部逻辑与限制。', demo: 'cover' },
  { id: 'novel-irony', symbol: 'Ir', name: '反讽', group: 'theme', period: 2, atomic: 10, blurb: '表层与深层意义的错位。', demo: 'fog' },
  { id: 'novel-image', symbol: 'Im', name: '意象', group: 'style', period: 2, atomic: 11, blurb: '可感知的具体画面。', demo: 'prestige' },
  { id: 'novel-gap', symbol: 'Ga', name: '留白', group: 'pacing', period: 2, atomic: 12, blurb: '信息故意不说满。', demo: 'cooldown' },

  { id: 'novel-arc', symbol: 'Ac', name: '弧光', group: 'character', period: 3, atomic: 13, blurb: '人物信念或能力的变迁。', demo: 'progress' },
  { id: 'novel-stakes', symbol: 'Sk', name: '赌注', group: 'plot', period: 3, atomic: 14, blurb: '失败的可见代价。', demo: 'risk' },
  { id: 'novel-lore', symbol: 'Lo', name: '传说', group: 'world', period: 3, atomic: 15, blurb: '埋在背景里的历史层。', demo: 'path' },
  { id: 'novel-question', symbol: 'Qe', name: '问句', group: 'theme', period: 3, atomic: 16, blurb: '作品真正想追问的问题。', demo: 'scarcity' },
  { id: 'novel-texture', symbol: 'Tx', name: '质感', group: 'style', period: 3, atomic: 17, blurb: '句子的密度与触感。', demo: 'resource' },
  { id: 'novel-cliff', symbol: 'Cl', name: '悬念', group: 'pacing', period: 3, atomic: 18, blurb: '切断信息制造急切。', demo: 'pressure' },

  { id: 'novel-cast', symbol: 'Ca', name: '群像', group: 'character', period: 4, atomic: 19, blurb: '多视角交织的人物网。', demo: 'guild' },
  { id: 'novel-payoff', symbol: 'Py', name: '兑现', group: 'plot', period: 4, atomic: 20, blurb: '早期铺垫的最终回报。', demo: 'craft' },
  { id: 'novel-map', symbol: 'Mp', name: '图谱', group: 'world', period: 4, atomic: 21, blurb: '可导航的空间或势力图。', demo: 'trade' },
  { id: 'novel-echo', symbol: 'Ec', name: '呼应', group: 'theme', period: 4, atomic: 22, blurb: '首尾或跨章的主题回响。', demo: 'echo' },
  { id: 'novel-silence', symbol: 'Si', name: '静默', group: 'style', period: 4, atomic: 23, blurb: '用省略制造重量。', demo: 'generic' },
  { id: 'novel-breath', symbol: 'Br', name: '呼吸', group: 'pacing', period: 4, atomic: 24, blurb: '高潮后的释放与余韵。', demo: 'wave' },
];
