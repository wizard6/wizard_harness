import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { queryEvents, readEvents, tailEvents } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { registrySpec } from '@wizard-harness/obs-core';

const FILE = process.env.WH_EVENTS || resolve(process.cwd(), 'docs/logs/events.jsonl');
const PORT = Number(process.env.PORT || 8787);

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function currentPlugins(events: PluginEvent[]): { id: string; registeredAt: number }[] {
  const order: string[] = [];
  const active = new Map<string, number>();
  for (const e of events) {
    if (e.action === 'register' && e.target) {
      if (!active.has(e.target)) order.push(e.target);
      active.set(e.target, e.ts);
    } else if (e.action === 'unregister' && e.target) {
      active.delete(e.target);
    }
  }
  return order.filter((id) => active.has(id)).map((id) => ({ id, registeredAt: active.get(id)! }));
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/events') {
    const p = url.searchParams;
    const events = queryEvents(readEvents(FILE), {
      actor: p.get('actor') ?? undefined,
      action: p.get('action') ?? undefined,
      target: p.get('target') ?? undefined,
      keyword: p.get('keyword') ?? undefined,
      limit: p.get('limit') ? Number(p.get('limit')) : undefined,
    });
    sendJson(res, 200, { events, total: events.length });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    const stop = tailEvents(FILE, (e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    req.on('close', stop);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/state') {
    const events = readEvents(FILE);
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.action] = (counts[e.action] ?? 0) + 1;
    sendJson(res, 200, {
      total: events.length,
      counts,
      plugins: currentPlugins(events),
      summary: registrySpec.summarize?.(events),
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`obs-api listening on http://localhost:${PORT}`);
  console.log(`events file: ${FILE}`);
});
