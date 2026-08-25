import type {
  ConsoleService,
  TimerAction,
  ToolboxService,
  WorkflowGraph,
  WorkflowService,
} from '@wizard-harness/contracts';

export interface ActionDeps {
  toolbox?: ToolboxService;
  workflow?: WorkflowService;
  console?: ConsoleService;
  emit: (action: string, target: string, payload?: unknown) => void;
}

export async function runTimerAction(
  action: TimerAction,
  signal: AbortSignal,
  deps: ActionDeps,
): Promise<string> {
  if (signal.aborted) throw new Error('已取消');
  switch (action.kind) {
    case 'event': {
      const name = String(action.action ?? 'timer/tick').trim() || 'timer/tick';
      deps.emit(name, String(action.target ?? 'timer'), action.payload);
      return `event ${name}`;
    }
    case 'toolbox': {
      const tb = deps.toolbox;
      if (!tb) throw new Error('timer 动作 toolbox 需要 toolbox 插件');
      const script = String(action.script ?? '').trim();
      if (!script) throw new Error('toolbox 动作需要 script');
      const r = await tb.run(script, action.args ?? {}, { workspace: action.workspace });
      if (!r.ok) throw new Error(r.error ?? 'toolbox 失败');
      return r.content ?? 'ok';
    }
    case 'workflow': {
      const wf = deps.workflow;
      if (!wf) throw new Error('timer 动作 workflow 需要 workflow 插件');
      const graph = action.graph as WorkflowGraph | undefined;
      if (!graph?.nodes?.length) throw new Error('workflow 动作需要 graph.nodes');
      const run = await wf.run({ graph, input: action.input ?? {} });
      if (run.status === 'error') throw new Error(run.error ?? 'workflow 失败');
      return run.status;
    }
    case 'shell': {
      const shell = deps.console;
      if (!shell) throw new Error('timer 动作 shell 需要 console 插件');
      const command = String(action.command ?? '').trim();
      if (!command) throw new Error('shell 动作需要 command');
      const r = await shell.exec(command);
      if (r.code !== 0) throw new Error(r.stderr || r.stdout || `exit ${r.code}`);
      return r.stdout.trim() || 'ok';
    }
    default:
      throw new Error(`未知动作：${(action as TimerAction).kind}`);
  }
}
