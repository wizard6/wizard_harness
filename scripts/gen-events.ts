// 生成演示用事件数据到 docs/logs/events.jsonl
// 运行：pnpm gen:events
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createEventBus, createFileSink, createRegistrar } from '../core/dist/index.js';

const FILE = 'docs/logs/events.jsonl';
mkdirSync(dirname(FILE), { recursive: true });

const bus = createEventBus();
bus.subscribe(createFileSink(FILE));
const registrar = createRegistrar({ bus });

const plugins = [
  {
    manifest: { id: 'plugin-a', version: '1.0.0', name: 'A 插件' },
    async register() {},
    async onStart() {},
  },
  {
    manifest: { id: 'plugin-b', version: '0.9.0', name: 'B 插件' },
    async register() {},
  },
];

for (const p of plugins) {
  await registrar.register(p);
  registrar.get(p.manifest.id);
}
await registrar.unregister('plugin-b');

console.log('已生成事件到', FILE);
