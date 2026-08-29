import type { ElementGroup } from '@wizard-harness/contracts';

export const NOVEL_GROUPS: readonly ElementGroup[] = [
  { id: 'character', symbol: 'Ch', name: '人物', blurb: '角色与关系', tone: 'social' },
  { id: 'plot', symbol: 'Pl', name: '情节', blurb: '冲突与转折', tone: 'risk' },
  { id: 'world', symbol: 'Wd', name: '世界', blurb: '设定与场域', tone: 'space' },
  { id: 'theme', symbol: 'Th', name: '主题', blurb: '命题与母题', tone: 'drive' },
  { id: 'style', symbol: 'St', name: '文笔', blurb: '声音与修辞', tone: 'economy' },
  { id: 'pacing', symbol: 'Pc', name: '节奏', blurb: '张弛与信息流', tone: 'time' },
];

export const NOVEL_PERIODS = 4;
