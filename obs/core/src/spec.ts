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
    return `注册 ${reg} / 注销 ${unreg} / 事件 ${events.length}`;
  },
  theme: {
    eventColors: { register: 'green', unregister: 'red', start: 'blue' },
    panel: { bg: '#16161e', fg: '#e6e6ef' },
  },
};
