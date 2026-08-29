import type { CatalogSeed } from './types.js';
import { DEMO_MECHANICS_ELEMENTS } from './mechanics/demo-elements.js';
import { FORMAL_MECHANICS_ELEMENTS } from './mechanics/formal-elements.js';
import { MECHANICS_GROUPS, MECHANICS_PERIODS } from './mechanics/groups.js';
import { DEMO_NOVEL_ELEMENTS } from './novel/demo-elements.js';
import { FORMAL_NOVEL_ELEMENTS } from './novel/formal-elements.js';
import { NOVEL_GROUPS, NOVEL_PERIODS } from './novel/groups.js';

export const BUILTIN_CATALOGS: readonly CatalogSeed[] = [
  {
    id: 'mechanics',
    title: '游戏机制',
    blurb: '玩法原子：动机、挑战、经济、空间、时间、社交。',
    periods: MECHANICS_PERIODS,
    groups: MECHANICS_GROUPS,
    formal: FORMAL_MECHANICS_ELEMENTS,
    demo: DEMO_MECHANICS_ELEMENTS,
  },
  {
    id: 'novel',
    title: '小说元素',
    blurb: '叙事原子：人物、情节、世界、主题、文笔、节奏。',
    periods: NOVEL_PERIODS,
    groups: NOVEL_GROUPS,
    formal: FORMAL_NOVEL_ELEMENTS,
    demo: DEMO_NOVEL_ELEMENTS,
  },
];

export type { CatalogSeed } from './types.js';
