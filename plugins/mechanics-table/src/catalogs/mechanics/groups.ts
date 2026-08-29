import type { ElementGroup } from '@wizard-harness/contracts';

export const MECHANICS_GROUPS: readonly ElementGroup[] = [
  { id: 'drive', symbol: 'Dr', name: '动机', blurb: '玩家为什么继续玩', tone: 'drive' },
  { id: 'risk', symbol: 'Rk', name: '挑战', blurb: '不确定性与能力检验', tone: 'risk' },
  { id: 'economy', symbol: 'Ec', name: '经济', blurb: '资源进出与交换', tone: 'economy' },
  { id: 'space', symbol: 'Sp', name: '空间', blurb: '场地、路径与可见性', tone: 'space' },
  { id: 'time', symbol: 'Ti', name: '时间', blurb: '节奏、冷却与浪潮', tone: 'time' },
  { id: 'social', symbol: 'So', name: '社交', blurb: '关系与观众', tone: 'social' },
];

export const MECHANICS_PERIODS = 4;
