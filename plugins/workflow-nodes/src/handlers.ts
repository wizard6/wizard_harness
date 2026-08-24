import type { WorkflowGraph, WorkflowNodeHandler, WorkflowNodeKindInfo } from '@wizard-harness/contracts';

/** 原样回传 text */
export const echoHandler: WorkflowNodeHandler = {
  kind: 'echo',
  execute(_node, inputs) {
    return Promise.resolve({ text: String(inputs.text ?? '') });
  },
};

/** 把 text 变成大写 */
export const upperHandler: WorkflowNodeHandler = {
  kind: 'upper',
  execute(_node, inputs) {
    return Promise.resolve({ text: String(inputs.text ?? '').toUpperCase() });
  },
};

export const NODE_KINDS: readonly WorkflowNodeKindInfo[] = [
  { kind: 'echo', inputs: ['text'], outputs: ['text'] },
  { kind: 'upper', inputs: ['text'], outputs: ['text'] },
];

export function kinds(): readonly WorkflowNodeKindInfo[] {
  return NODE_KINDS;
}

/** 示例图：echo ← input.text → upper */
export function demoGraph(): WorkflowGraph {
  return {
    id: 'echo-upper',
    nodes: [
      { id: 'echo', kind: 'echo', in: { text: { from: 'input', key: 'text' } } },
      { id: 'upper', kind: 'upper', in: { text: { from: 'node', node: 'echo', key: 'text' } } },
    ],
  };
}
