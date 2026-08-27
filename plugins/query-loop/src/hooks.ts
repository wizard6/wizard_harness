import type { QueryHook, QueryHookContext, QueryHookResult, QueryStage } from '@wizard-harness/contracts';

export function createHookRegistry() {
  const hooks: QueryHook[] = [];

  return {
    list: () => hooks.map((h) => h.name),
    use(hook: QueryHook): () => void {
      hooks.push(hook);
      return () => {
        const i = hooks.indexOf(hook);
        if (i >= 0) hooks.splice(i, 1);
      };
    },
    async run(stage: QueryStage, ctx: QueryHookContext): Promise<QueryHookResult> {
      for (const hook of hooks) {
        if (!hook.stages.includes(stage)) continue;
        const out = await hook.run({ ...ctx, stage });
        if (out?.action && out.action !== 'continue') return out;
      }
      return { action: 'continue' };
    },
  };
}
