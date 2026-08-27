import type { ObsSpec } from '@wizard-harness/obs-spec';

/** 注册表专属观测定义（就近 obs/core）。四端渲染器据此渲染各自形态。 */
export const registrySpec: ObsSpec = {
  id: 'registry',
  title: '注册表',
  renderEvent(e) {
    return `${e.actor} → ${e.action}${e.target ? ' ' + e.target : ''}`;
  },
  summarize(events) {
    const reg = events.filter((e) => e.action === 'register').length;
    const unreg = events.filter((e) => e.action === 'unregister').length;
    const active = Math.max(0, reg - unreg);
    return `当前 ${active}（注册 ${reg} / 注销 ${unreg} / 事件 ${events.length}）`;
  },
  theme: {
    // 亮色语义（深色底对比度友好）：绿=注册 / 红=注销 / 蓝=启动
    eventColors: {
      register: '#7ee787',
      unregister: '#ff7b72',
      start: '#79c0ff',
      scan: '#d2a8ff',
      'session/start': '#7ee787',
      'session/append': '#9ecbff',
      'session/compact': '#9ecbff',
      'session/patch': '#9ecbff',
      'llm/request': '#d2a8ff',
      'llm/delta': '#d2a8ff',
      'llm/result': '#d2a8ff',
      'tools/register': '#ffa657',
      'tools/call': '#ffa657',
      'tools/result': '#ffa657',
      'agent/spawn': '#d2a8ff',
      'agent/stop': '#d2a8ff',
      'prompt-context/assemble': '#79c0ff',
      'prompt-context/apply': '#79c0ff',
      'prompt-context/persona': '#79c0ff',
      'persona/save': '#e6c07b',
      'persona/create': '#e6c07b',
      'persona/update': '#e6c07b',
      'persona/switch': '#e6c07b',
      'persona/remove': '#e6c07b',
      'agent-loop/start': '#7ee787',
      'agent-loop/observe': '#79c0ff',
      'agent-loop/think': '#7ee787',
      'agent-loop/act': '#ffa657',
      'agent-loop/done': '#7ee787',
      'agent-loop/end': '#7ee787',
      'agent-loop/cancel': '#ff7b72',
    },
    panel: { bg: '#16161e', fg: '#e6e6ef' },
  },
};
