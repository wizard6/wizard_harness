import type { PrimitiveLink, PrimitiveRecord } from '@wizard-harness/contracts';

/** 内置种子。只供查看；编排/注入切片未做。 */
export const SEED_PRIMITIVES: readonly PrimitiveRecord[] = [
  {
    id: 'observe-first',
    name: '先观察',
    summary: '没看完证据，后面的结论都不算。',
    thinkKind: 'observe',
    tags: ['think', 'observe', 'evidence', 'guide'],
    body: '必须先列出已经看到的证据与来源。没看完不准下结论，也不准开始改。',
  },
  {
    id: 'evidence-or-stop',
    name: '缺证据则停',
    summary: '关键字段空着就停，不准猜。',
    thinkKind: 'evidence',
    tags: ['think', 'evidence', 'safety', 'evaluate'],
    parentId: 'observe-first',
    body: '关键字段缺失则停止这一格。禁止用猜测、默认值或模型补全来填空。',
  },
  {
    id: 'forbid-local-patch',
    name: '禁止错误层硬补',
    summary: '根因在别处时，不准在当前层打补丁。',
    thinkKind: 'forbid',
    tags: ['think', 'forbid', 'write', 'behavior'],
    parentId: 'evidence-or-stop',
    body: '禁止在错误的层硬补。根因属于规范化器、反序列化或公共对象时，改那一层，不改调用方泄压。',
  },
  {
    id: 'split-declared-only',
    name: '只走写明的分岔',
    summary: '运行期不准发明新分岔。',
    thinkKind: 'split',
    tags: ['think', 'split', 'behavior'],
    parentId: 'observe-first',
    body: '只在预先写明的分歧上分岔。Variance=0 时，禁止由模型临场增加分支。',
  },
  {
    id: 'cell-not-director',
    name: '格子不是导演',
    summary: '格子里可以干活，不能决定下一步怎么想。',
    thinkKind: 'cell',
    tags: ['think', 'cell', 'agent', 'guide'],
    body: 'Cell 内可执行确定性代码或有界调用模型。禁止改边、改 Freeze、改 Forbid、改下一格怎么想。',
  },
  {
    id: 'shadow-not-live',
    name: '影子不出结果',
    summary: '提案只进影子轨，未过闸门不准进活图。',
    thinkKind: 'propose',
    tags: ['think', 'shadow', 'gate', 'behavior'],
    parentId: 'cell-not-director',
    body: '影子轨用同一输入只产出改图提案。未过 Gate 的 diff 不得写入活轨，也不得影响这一次结果。',
  },
  {
    id: 'not-a-skill',
    name: '不是 Skill',
    summary: 'Primitive 不准整包注入上下文。',
    thinkKind: 'forbid',
    tags: ['orchestrate', 'prompt', 'contrast', 'guide'],
    body: 'Primitive 不是 Skill。禁止把本仓库条目按 alwaysApply/目录方式整包注入 prompt-context。选用哪几条由启发式或 AI 编排决定（本切片未实现）。',
  },
];

/** 有向边；宿主按两端建索引，从任一端都能走到另一端。 */
export const SEED_LINKS: readonly PrimitiveLink[] = [
  { source: 'observe-first', target: 'evidence-or-stop', kind: 'then' },
  { source: 'observe-first', target: 'split-declared-only', kind: 'then' },
  { source: 'evidence-or-stop', target: 'forbid-local-patch', kind: 'then' },
  { source: 'cell-not-director', target: 'shadow-not-live', kind: 'then' },
  { source: 'not-a-skill', target: 'cell-not-director', kind: 'constrains' },
  { source: 'forbid-local-patch', target: 'split-declared-only', kind: 'relates' },
];
