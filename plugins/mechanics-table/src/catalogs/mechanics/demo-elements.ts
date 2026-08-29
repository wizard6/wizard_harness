import type { TableElement } from '@wizard-harness/contracts';

/** 游戏机制 · 演示集（样例，不算正式库） */
export const DEMO_MECHANICS_ELEMENTS: readonly Omit<TableElement, 'kind'>[] = [
  { id: 'demo-goal', symbol: 'Go', name: '目标', group: 'drive', period: 1, atomic: 1, blurb: '清晰可达成的终点或阶段靶心。', demo: 'goal' },
  { id: 'demo-chance', symbol: 'Cn', name: '偶然', group: 'risk', period: 1, atomic: 2, blurb: '骰子与随机结果制造张力。', demo: 'chance' },
  { id: 'demo-resource', symbol: 'Rs', name: '资源', group: 'economy', period: 1, atomic: 3, blurb: '可积累、可消耗的量。', demo: 'resource' },
  { id: 'demo-arena', symbol: 'Ar', name: '场域', group: 'space', period: 1, atomic: 4, blurb: '行动发生的格子或舞台。', demo: 'arena' },
  { id: 'demo-beat', symbol: 'Bt', name: '节拍', group: 'time', period: 1, atomic: 5, blurb: '基础节奏单位，驱动循环。', demo: 'beat' },
  { id: 'demo-ally', symbol: 'Al', name: '同盟', group: 'social', period: 1, atomic: 6, blurb: '合作纽带与增益链接。', demo: 'ally' },

  { id: 'demo-progress', symbol: 'Pg', name: '进度', group: 'drive', period: 2, atomic: 7, blurb: '可见的前进条，降低迷茫。', demo: 'progress' },
  { id: 'demo-risk', symbol: 'Ri', name: '风险', group: 'risk', period: 2, atomic: 8, blurb: '高回报伴随失败可能。', demo: 'risk' },
  { id: 'demo-cost', symbol: 'Co', name: '代价', group: 'economy', period: 2, atomic: 9, blurb: '行动需要支付的成本。', demo: 'cost' },
  { id: 'demo-path', symbol: 'Pa', name: '路径', group: 'space', period: 2, atomic: 10, blurb: '可达性与路线选择。', demo: 'path' },
  { id: 'demo-cooldown', symbol: 'Cd', name: '冷却', group: 'time', period: 2, atomic: 11, blurb: '能力恢复前的等待。', demo: 'cooldown' },
  { id: 'demo-rival', symbol: 'Rv', name: '对手', group: 'social', period: 2, atomic: 12, blurb: '对抗与比较的对象。', demo: 'rival' },

  { id: 'demo-scarcity', symbol: 'Sc', name: '稀缺', group: 'drive', period: 3, atomic: 13, blurb: '有限供给放大欲望。', demo: 'scarcity' },
  { id: 'demo-skill', symbol: 'Sk', name: '技巧', group: 'risk', period: 3, atomic: 14, blurb: '可练习的操作精度。', demo: 'skill' },
  { id: 'demo-trade', symbol: 'Tr', name: '交易', group: 'economy', period: 3, atomic: 15, blurb: '物品或权益的互换。', demo: 'trade' },
  { id: 'demo-fog', symbol: 'Fg', name: '迷雾', group: 'space', period: 3, atomic: 16, blurb: '信息不完全，探索揭开。', demo: 'fog' },
  { id: 'demo-wave', symbol: 'Wv', name: '浪潮', group: 'time', period: 3, atomic: 17, blurb: '强度起伏的周期压力。', demo: 'wave' },
  { id: 'demo-audience', symbol: 'Au', name: '观众', group: 'social', period: 3, atomic: 18, blurb: '被观看带来的表演动力。', demo: 'audience' },

  { id: 'demo-prestige', symbol: 'Px', name: '声望', group: 'drive', period: 4, atomic: 19, blurb: '跨局累积的地位感。', demo: 'prestige' },
  { id: 'demo-pressure', symbol: 'Pu', name: '压迫', group: 'risk', period: 4, atomic: 20, blurb: '时间或空间上的挤压感。', demo: 'pressure' },
  { id: 'demo-craft', symbol: 'Cr', name: '合成', group: 'economy', period: 4, atomic: 21, blurb: '原料组合成更高阶物。', demo: 'craft' },
  { id: 'demo-cover', symbol: 'Cv', name: '掩护', group: 'space', period: 4, atomic: 22, blurb: '遮挡与安全区。', demo: 'cover' },
  { id: 'demo-echo', symbol: 'Eh', name: '回响', group: 'time', period: 4, atomic: 23, blurb: '过去行动在时间上的余波。', demo: 'echo' },
  { id: 'demo-guild', symbol: 'Gu', name: '社群', group: 'social', period: 4, atomic: 24, blurb: '持久的群体归属结构。', demo: 'guild' },
];
