export const APP_WORKFLOW_SERVICE = 'appWorkflow';

/** 工作流 Demo 薄壳窗口。只调 workflow.run，不拥有调度与节点。 */
export interface AppWorkflowService {
  readonly title: string;
}
