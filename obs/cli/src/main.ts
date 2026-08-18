#!/usr/bin/env node
import { queryEvents, readEvents, tailEvents } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';

const DEFAULT_FILE = 'docs/logs/events.jsonl';

interface Args {
  command: string;
  file: string;
  actor?: string;
  action?: string;
  target?: string;
  keyword?: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? 'replay', file: DEFAULT_FILE };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--file':
        args.file = argv[++i] ?? '';
        break;
      case '--actor':
        args.actor = argv[++i];
        break;
      case '--action':
        args.action = argv[++i];
        break;
      case '--target':
        args.target = argv[++i];
        break;
      case '--keyword':
        args.keyword = argv[++i];
        break;
      case '--limit':
      case '-n':
        args.limit = Number(argv[++i]);
        break;
    }
  }
  return args;
}

function printEvent(e: PluginEvent): void {
  const t = new Date(e.ts).toISOString();
  const suffix = e.payload ? ' ' + JSON.stringify(e.payload) : '';
  console.log(`[${t}] ${e.actor} → ${e.action}${e.target ? ' ' + e.target : ''}${suffix}`);
}

function usage(): never {
  console.log(
    '用法: wh-obs <replay|query|tail> [--file PATH] [--actor A] [--action X] [--target T] [--keyword K] [--limit N]',
  );
  process.exit(1);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'replay') {
    const events = queryEvents(readEvents(args.file), { limit: args.limit });
    for (const e of events) printEvent(e);
    console.log(`\n共 ${events.length} 条`);
  } else if (args.command === 'query') {
    const events = queryEvents(readEvents(args.file), {
      actor: args.actor,
      action: args.action,
      target: args.target,
      keyword: args.keyword,
      limit: args.limit,
    });
    for (const e of events) printEvent(e);
    console.log(`\n命中 ${events.length} 条`);
  } else if (args.command === 'tail') {
    console.log(`跟踪 ${args.file} ...（Ctrl+C 退出）`);
    tailEvents(args.file, printEvent);
  } else {
    usage();
  }
}

main();
