import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const NITRON_COMMAND = 'npx --yes nitron build';

export function nitronConfigPath(cwd: string): string {
  return join(cwd, 'nitron.config.json');
}

export function findApk(cwd: string): string | undefined {
  const candidates = [join(cwd, 'dist', 'app.apk'), join(cwd, 'app.apk')];
  return candidates.find((p) => existsSync(p));
}

export function shouldBuildNitron(runNitron: unknown, env = process.env): boolean {
  if (runNitron === true || runNitron === 'true' || runNitron === 1) return true;
  const flag = String(env.WH_NITRON ?? '').trim();
  return flag === '1' || flag.toLowerCase() === 'true';
}

export async function runNitronBuild(cwd: string, timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const { stdout, stderr } = await execFileAsync(bin, ['--yes', 'nitron', 'build'], {
    cwd,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
}
