import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { TextDecoder } from 'node:util';
import type { Plugin } from '@wizard-harness/core';
import type { ConsoleService, ExecResult } from '@wizard-harness/contracts';

/**
 * console 插件：提供 shell 命令执行能力（Agent 基座的"手"）。
 * api.exec 即服务；弹窗为命令控制台界面。
 */
const execP = promisify(exec);

/** 智能解码：优先 UTF-8 严格解码，失败（Windows GBK 输出）回退 GBK */
function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gbk').decode(buf);
  }
}

/** Windows 下先切 UTF-8 代码页：同时解决输出与中文参数编码 */
const CMD_PREFIX = process.platform === 'win32' ? 'chcp 65001 >nul && ' : '';

/** api 即服务：实现契约层 ConsoleService（core/src/services/console.ts） */
const api: ConsoleService = {
  async exec(command: string, opts?: { timeoutMs?: number }): Promise<ExecResult> {
    try {
      const { stdout, stderr } = await execP(CMD_PREFIX + command, {
        encoding: 'buffer',
        timeout: opts?.timeoutMs ?? 15000,
        windowsHide: true,
      });
      return { stdout: decode(stdout), stderr: decode(stderr), code: 0 };
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; code?: number | null };
      return {
        stdout: e.stdout ? decode(e.stdout) : '',
        stderr: e.stderr ? decode(e.stderr) : String(err),
        code: e.code ?? 1,
      };
    }
  },
};

const consolePlugin: Plugin = {
  manifest: {
    id: 'console',
    version: '0.1.0',
    name: '控制台插件',
    description: '提供 shell 命令执行服务（exec）与弹窗控制台',
    provides: ['console'],
    config: { timeoutMs: 15000 },
    tier: 'core',
    trusted: true,
    highAccessServices: ['console'],
  },
  api,
  ui: {
    title: '控制台',
    width: 560,
    height: 420,
    content: [
      '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>',
      'body{margin:0;font-family:ui-monospace,Consolas,"Microsoft YaHei",monospace;background:#0d1117;color:#e6e6ef}',
      '::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#2c2c3a;border-radius:4px}',
      '.bar{padding:10px 14px;border-bottom:1px solid #262634;display:flex;gap:8px;background:#16161e}',
      'input{flex:1;background:#0d1117;border:1px solid #2c2c3e;border-radius:6px;color:#e6e6ef;padding:7px 10px;font-size:13px;font-family:inherit;outline:none}',
      'input:focus{border-color:#4a6aa0}',
      'button{background:linear-gradient(135deg,#2ea043,#238636);color:#fff;border:none;border-radius:6px;padding:7px 16px;font-size:13px;cursor:pointer}',
      'button:hover{filter:brightness(1.1)}',
      '#out{white-space:pre-wrap;word-break:break-all;padding:14px;font-size:12.5px;line-height:1.6;color:#9cdcfe}',
      '#out .err{color:#ff7b72}',
      '</style></head><body>',
      '<div class="bar"><input id="cmd" placeholder="输入命令，如 dir / node -v / pnpm test" autofocus /><button id="run">执行</button></div>',
      '<div id="out">等待命令…（Ctrl+Enter 或按钮执行）</div>',
      '<script>',
      'var out=document.getElementById("out");var cmd=document.getElementById("cmd");var run=document.getElementById("run");',
      'function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}',
      'async function go(){var c=cmd.value.trim();if(!c)return;',
      'out.innerHTML=esc("> "+c)+"\\n执行中…";',
      'try{var r=await window.wh.execCommand(c);',
      'var html=esc("> "+c)+"\\n\\n"+esc(r.stdout||"")+(r.stderr?"\\n<span class=err>"+esc(r.stderr)+"</span>":"")+"\\n[退出码 "+r.code+"]";',
      'out.innerHTML=html;}catch(e){out.innerHTML="<span class=err>执行失败: "+esc(String(e))+"</span>";}}',
      'run.addEventListener("click",go);',
      'cmd.addEventListener("keydown",function(e){if(e.key==="Enter")go();});',
      '</script></body></html>',
    ].join(''),
  },
  async register() {},
};

export default consolePlugin;
