import type { Plugin } from '@wizard-harness/core';
import type { TrajectoryService } from '@wizard-harness/contracts';
import { createTrajectoryStore } from './store.js';
import { TRAJECTORY_HTML } from './page.js';

/**
 * trajectory 插件：执行轨迹。session 记对话，这里记拼提示词 / HTTP / 工具进出。
 * 说明文档：docs/plugins/trajectory.html
 */
let impl: TrajectoryService | undefined;

function live(): TrajectoryService {
  if (!impl) throw new Error('trajectory 未就绪');
  return impl;
}

const api: TrajectoryService = {
  start: (opts) => live().start(opts),
  get: (id) => live().get(id),
  current: () => live().current(),
  forSession: (sessionId) => live().forSession(sessionId),
  list: () => live().list(),
  latest: () => live().latest(),
  snapshot: (id) => live().snapshot(id),
  record: (sessionId, kind, data) => live().record(sessionId, kind, data),
};

const trajectoryPlugin: Plugin = {
  manifest: {
    id: 'trajectory',
    version: '0.1.0',
    name: '执行轨迹',
    description: '记录 run / 拼提示词 / HTTP / 工具调用与返回。不替代 session。',
    provides: ['trajectory'],
    config: {},
    tier: 'standard',
  },
  inject: { logger: false },
  api,
  ui: {
    title: '执行轨迹',
    width: 420,
    height: 640,
    rpc: { trajectory: ['latest', 'list', 'snapshot'] },
    content: TRAJECTORY_HTML,
  },
  register(c) {
    impl = createTrajectoryStore((action, target, payload) => {
      c.emit({ action, target, payload });
    });
    c.logger?.info?.('trajectory 插件就绪');
    c.effect(() => () => {
      impl = undefined;
    });
  },
};

export default trajectoryPlugin;
