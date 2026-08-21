import React, { useState } from 'react';

export interface CallServiceResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AgentRunPanelProps {
  onCall: (service: string, method: string, args: unknown[]) => Promise<CallServiceResult>;
}

interface Turn {
  prompt: string;
  text: string;
  error?: string;
}

/** App demo：独立页，经壳白名单调 agentLoop.run。 */
export function AgentRunPanel({ onCall }: AgentRunPanelProps): React.ReactElement {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('echo hi');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);

  const run = async () => {
    const q = prompt.trim();
    if (busy || !q) return;
    setBusy(true);
    try {
      const r = await onCall('agentLoop', 'run', [
        { prompt: q, maxSteps: 4, systemPrompt: systemPrompt.trim() || undefined },
      ]);
      const result = r.result as { text?: string } | undefined;
      setTurns((prev) => [
        ...prev,
        r.ok
          ? { prompt: q, text: result?.text ?? JSON.stringify(r.result, null, 2) }
          : { prompt: q, text: '', error: r.error || '失败' },
      ]);
    } catch (err) {
      setTurns((prev) => [...prev, { prompt: q, text: '', error: String(err) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad">
      <style>{AD_CSS}</style>
      <header className="ad-head">
        <div>
          <h1>App demo</h1>
          <p>一次完整 agent 调用：system-prompt → llm → tools。默认 mock，可发 echo hi。</p>
        </div>
      </header>
      <label className="ad-lab">
        System Prompt（可选）
        <textarea
          className="ad-ta"
          rows={2}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are brief."
        />
      </label>
      <div className="ad-log">
        {turns.length === 0 ? (
          <div className="ad-empty">还没有对话。下面输入消息后点发送。</div>
        ) : (
          turns.map((t, i) => (
            <article key={i} className="ad-turn">
              <div className="ad-bubble user">{t.prompt}</div>
              <div className={`ad-bubble bot${t.error ? ' err' : ''}`}>{t.error || t.text}</div>
            </article>
          ))
        )}
      </div>
      <div className="ad-compose">
        <textarea
          className="ad-ta"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run();
          }}
        />
        <button type="button" className="ad-btn" disabled={busy} onClick={() => void run()}>
          {busy ? '运行中…' : '发送'}
        </button>
      </div>
    </div>
  );
}

const AD_CSS = `
  .ad { height:100%; box-sizing:border-box; padding:18px 22px 16px; display:flex; flex-direction:column;
        min-height:0; color:#e6e6ef; font:13px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
  .ad-head { flex:none; margin-bottom:12px; }
  .ad-head h1 { margin:0 0 4px; font-size:18px; font-weight:650; }
  .ad-head p { margin:0; color:#8b949e; font-size:12px; }
  .ad-lab { flex:none; display:flex; flex-direction:column; gap:6px; font-size:12px; color:#8b949e; margin-bottom:10px; }
  .ad-ta { box-sizing:border-box; width:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1);
           border-radius:8px; color:#e6e6ef; font:12px/1.5 ui-monospace,Consolas,monospace; padding:8px 10px; resize:vertical; }
  .ad-log { flex:1; min-height:0; overflow:auto; background:#14141e; border:1px solid rgba(255,255,255,.08);
            border-radius:10px; padding:12px; }
  .ad-empty { color:#8b949e; font-size:12px; padding:24px 8px; text-align:center; }
  .ad-turn { margin-bottom:12px; }
  .ad-bubble { max-width:92%; padding:8px 10px; border-radius:10px; font-size:12px; white-space:pre-wrap; word-break:break-word; }
  .ad-bubble.user { margin-left:auto; background:rgba(121,192,255,.14); color:#9ecbff; }
  .ad-bubble.bot { margin-top:6px; background:rgba(255,255,255,.05); color:#d7d7e4; }
  .ad-bubble.err { color:#ff7b72; background:rgba(255,123,114,.1); }
  .ad-compose { flex:none; display:flex; gap:8px; align-items:flex-end; margin-top:10px; }
  .ad-compose .ad-ta { flex:1; }
  .ad-btn { flex:none; height:34px; background:rgba(126,231,135,.14); border:1px solid rgba(126,231,135,.35);
            color:#7ee787; border-radius:8px; padding:0 14px; font-size:12px; cursor:pointer; font-family:inherit; font-weight:600; }
  .ad-btn:disabled { opacity:.45; cursor:default; }
`;
