import type { PieMenuItemInput } from '@wizard-harness/contracts';

/** 默认扇形菜单：对接 harness 常用插件入口 */
export const DEFAULT_PIE_ROOT: PieMenuItemInput = {
  id: 'root',
  label: 'Wizard',
  kind: 'submenu',
  children: [
    {
      id: 'agent',
      label: 'Agent',
      icon: 'Ag',
      kind: 'openPlugin',
      pluginId: 'app-ui',
      angle: 0,
    },
    {
      id: 'workspace',
      label: '工作台',
      icon: 'Ws',
      kind: 'openPlugin',
      pluginId: 'workspace',
      angle: 60,
    },
    {
      id: 'tools',
      label: '工具',
      icon: 'Tl',
      kind: 'submenu',
      angle: 120,
      children: [
        {
          id: 'pomodoro',
          label: '番茄钟',
          icon: 'Po',
          kind: 'openPlugin',
          pluginId: 'pomodoro',
        },
        {
          id: 'elements',
          label: '元素表',
          icon: 'El',
          kind: 'openPlugin',
          pluginId: 'element-table',
        },
        {
          id: 'files',
          label: '文件',
          icon: 'Fm',
          kind: 'openPlugin',
          pluginId: 'file-manager',
        },
      ],
    },
    {
      id: 'workflow',
      label: '工作流',
      icon: 'Wf',
      kind: 'openPlugin',
      pluginId: 'app-workflow',
      angle: 180,
    },
    {
      id: 'dev',
      label: '开发',
      icon: 'Dv',
      kind: 'submenu',
      angle: 240,
      children: [
        {
          id: 'code-browser',
          label: '代码浏览',
          icon: 'Br',
          kind: 'openPlugin',
          pluginId: 'code-browser',
        },
        {
          id: 'code-editor',
          label: '编辑器',
          icon: 'Ed',
          kind: 'openPlugin',
          pluginId: 'code-editor',
        },
        {
          id: 'console',
          label: '控制台',
          icon: 'Co',
          kind: 'openPlugin',
          pluginId: 'console',
        },
      ],
    },
    {
      id: 'close',
      label: '关闭',
      icon: '×',
      kind: 'action',
      action: 'close',
      angle: 300,
    },
  ],
};
