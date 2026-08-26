import { resolve } from 'node:path';
import type { GitRunResult, GitToolsInfo } from '@wizard-harness/contracts';
import { gitToolName } from './names.js';
import {
  currentBranch,
  isGitRepo,
  probeGit,
  resolveInWorkspace,
  runGit,
} from './exec.js';

const PROTECTED = new Set(['main', 'master']);

export const GIT_ACTIONS = [
  {
    id: 'status',
    label: '状态',
    tool: gitToolName('status'),
    description: 'git status -sb：简短状态与当前分支。',
    tier: 'read' as const,
  },
  {
    id: 'diff',
    label: '差异',
    tool: gitToolName('diff'),
    description: 'git diff。可选 path 限制子路径（工作区内）。',
    tier: 'read' as const,
  },
  {
    id: 'log',
    label: '日志',
    tool: gitToolName('log'),
    description: 'git log --oneline -n 20。',
    tier: 'read' as const,
  },
  {
    id: 'pull',
    label: '拉取',
    tool: gitToolName('pull'),
    description: 'git pull --ff-only。',
    tier: 'remote' as const,
  },
  {
    id: 'add',
    label: '暂存',
    tool: gitToolName('add'),
    description: 'git add。可选 path；默认 -A。',
    tier: 'write' as const,
  },
  {
    id: 'commit',
    label: '提交',
    tool: gitToolName('commit'),
    description: 'git commit -m。需要 message。',
    tier: 'write' as const,
  },
  {
    id: 'push',
    label: '推送',
    tool: gitToolName('push'),
    description: 'git push。默认禁止推送到 main/master，除非配置 allowPushToMain。',
    tier: 'remote' as const,
  },
] as const;

export const GIT_TOOL_NAMES = GIT_ACTIONS.map((a) => a.tool);

export interface GitHostOpts {
  allowPushToMain?: boolean;
  timeoutMs?: number;
}

function asString(v: unknown, fallback = ''): string {
  return v === undefined || v === null ? fallback : String(v);
}

export interface GitHost {
  readonly root: string;
  probe(): ReturnType<typeof probeGit>;
  info(): GitToolsInfo;
  infoAsync(): Promise<GitToolsInfo>;
  run(actionId: string, args?: Record<string, unknown>): Promise<GitRunResult>;
}

export function createGitHost(root: string, opts: GitHostOpts = {}): GitHost {
  const rootAbs = resolve(root);
  const allowPushToMain = Boolean(opts.allowPushToMain);
  const timeoutMs = Math.min(300_000, Math.max(5_000, Number(opts.timeoutMs ?? 60_000)));

  const ensureRepo = () => {
    const probe = probeGit();
    if (!probe.available) throw new Error(probe.hint ?? 'git 不可用');
    if (!isGitRepo(rootAbs)) throw new Error(`不是 git 仓库：${rootAbs}`);
  };

  const guardPush = async () => {
    if (allowPushToMain) return;
    const branch = await currentBranch(rootAbs);
    if (branch && PROTECTED.has(branch)) {
      throw new Error(`禁止推送到保护分支 ${branch}；设置 allowPushToMain 或换分支`);
    }
  };

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<GitRunResult>> = {
    status: async () => runGit(rootAbs, ['status', '-sb'], timeoutMs),
    diff: async (args) => {
      const path = asString(args.path).trim();
      const gitArgs = ['diff'];
      if (path) {
        resolveInWorkspace(rootAbs, path);
        gitArgs.push('--', path);
      }
      return runGit(rootAbs, gitArgs, timeoutMs);
    },
    log: async () => runGit(rootAbs, ['log', '--oneline', '-n', '20'], timeoutMs),
    pull: async () => runGit(rootAbs, ['pull', '--ff-only'], timeoutMs),
    add: async (args) => {
      const path = asString(args.path).trim();
      if (path) {
        resolveInWorkspace(rootAbs, path);
        return runGit(rootAbs, ['add', '--', path], timeoutMs);
      }
      return runGit(rootAbs, ['add', '-A'], timeoutMs);
    },
    commit: async (args) => {
      const message = asString(args.message).trim();
      if (!message) throw new Error('commit 需要 message');
      return runGit(rootAbs, ['commit', '-m', message], timeoutMs);
    },
    push: async () => {
      await guardPush();
      return runGit(rootAbs, ['push'], timeoutMs);
    },
  };

  const baseInfo = (): GitToolsInfo => {
    const probe = probeGit();
    const repo = probe.available && isGitRepo(rootAbs);
    return {
      root: rootAbs,
      probe,
      isRepo: repo,
      tools: [...GIT_TOOL_NAMES],
    };
  };

  return {
    root: rootAbs,
    probe: () => probeGit(),
    info() {
      return baseInfo();
    },
    async infoAsync() {
      const base = baseInfo();
      if (!base.isRepo) return base;
      const branch = await currentBranch(rootAbs);
      return { ...base, branch };
    },
    async run(actionId, args = {}) {
      const id = String(actionId).trim();
      const handler = handlers[id];
      if (!handler) throw new Error(`未知 git 动作：${id}`);
      ensureRepo();
      return handler(args);
    },
  };
}
