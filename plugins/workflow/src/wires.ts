import type { WorkflowNode, WorkflowNodeRecord, WorkflowWire } from '@wizard-harness/contracts';

export function resolveWires(
  spec: Readonly<Record<string, WorkflowWire>> | undefined,
  input: Readonly<Record<string, unknown>>,
  done: Readonly<Record<string, WorkflowNodeRecord>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!spec) return out;
  for (const [port, wire] of Object.entries(spec)) {
    out[port] = readWire(wire, input, done);
  }
  return out;
}

function readWire(
  wire: WorkflowWire,
  input: Readonly<Record<string, unknown>>,
  done: Readonly<Record<string, WorkflowNodeRecord>>,
): unknown {
  if (wire.from === 'value') return wire.value;
  if (wire.from === 'input') {
    if (!(wire.key in input)) throw new Error(`缺少 run 入参：${wire.key}`);
    return input[wire.key];
  }
  const rec = done[wire.node];
  if (!rec) throw new Error(`上游节点尚未执行：${wire.node}`);
  if (!(wire.key in rec.outputs)) throw new Error(`节点 ${wire.node} 无输出端口 ${wire.key}`);
  return rec.outputs[wire.key];
}

export function mergeParams(
  node: WorkflowNode,
  wired: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(node.params ?? {}), ...wired };
}
