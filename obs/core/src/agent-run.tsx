import React, { useState } from 'react';

export interface CallServiceResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AgentRunPanelProps {
  onCall: (service: string, method: string, args: unknown[]) => Promise<CallServiceResult>;
}

/** 观测台「试跑」：经壳白名单调 agentLoop.run，不是通用插件弹窗桥。 */
export function AgentRunPanel({ onCall }: AgentRunPanelProps): React.ReactElement {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('echo hi');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setOut('运行中…');
    try {
      const r = await onCall('agentLoop', 'run', [
        { prompt, maxSteps: 4, systemPrompt: systemPrompt.trim() || undefined },
      ]);
      setOut(r.ok ? JSON.stringify(r.result, null, 2) : r.error || '失败');
    } catch (err) {
      setOut(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ar">
      <p className="ar-lede">调用 <code>agentLoop.run</code>（壳白名单）。System Prompt 经循环转给 system-prompt 插件，不在观测台另存。</p>
      <label className="ar-lab">
        System Prompt（可选）
        <textarea className="ar-ta" rows={3} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      </label>
      <label className="ar-lab">
        用户消息
        <textarea className="ar-ta" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <button type="button" className="ar-btn" disabled={busy} onClick={() => void run()}>
        {busy ? '运行中…' : '运行'}
      </button>
      <pre className="ar-out">{out || '结果会显示在这里'}</pre>
    </div>
  );
}
