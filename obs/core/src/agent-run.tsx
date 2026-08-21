import React, { useEffect, useRef, useState } from 'react';

export interface CallServiceResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AgentRunPanelProps {
  onCall: (service: string, method: string, args: unknown[]) => Promise<CallServiceResult>;
}

interface Bubble {
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  error?: boolean;
}

interface RunOut {
  text?: string;
  agentId?: string;
  provider?: string;
}

const STARTERS = ['你好，介绍一下你自己', '用三句话说明 wizard-harness', '现在方便聊天吗'];

/** App demo：独立聊天页。同一 agent 连发；默认不开工具。 */
export function AgentRunPanel({ onCall }: AgentRunPanelProps): React.ReactElement {
  const [systemPrompt, setSystemPrompt] = useState('你是简洁的助手，用中文回答。');
  const [prompt, setPrompt] = useState('');
  const [useTools, setUseTools] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agentId, setAgentId] = useState<string | undefined>();
  const [provider, setProvider] = useState('');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles, busy]);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const reset = () => {
    if (busy) return;
    setAgentId(undefined);
    setBubbles([]);
    setProvider('');
    boxRef.current?.focus();
  };

  const send = async (raw?: string) => {
    const q = (raw ?? prompt).trim();
    if (busy || !q) return;
    setPrompt('');
    setBusy(true);
    setBubbles((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: '正在回复…', pending: true }]);
    try {
      const r = await onCall('agentLoop', 'run', [
        {
          agentId,
          prompt: q,
          maxSteps: useTools ? 4 : 1,
          useTools,
          systemPrompt: agentId ? undefined : systemPrompt.trim() || undefined,
        },
      ]);
      const out = (r.result ?? {}) as RunOut;
      if (out.agentId) setAgentId(out.agentId);
      if (out.provider) setProvider(out.provider);
      setBubbles((prev) => {
        const next = prev.slice(0, -1);
        if (r.ok) next.push({ role: 'assistant', text: out.text?.trim() || '（空回复）' });
        else next.push({ role: 'assistant', text: r.error || '失败', error: true });
        return next;
      });
    } catch (err) {
      setBubbles((prev) => {
        const next = prev.slice(0, -1);
        next.push({ role: 'assistant', text: String(err), error: true });
        return next;
      });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => boxRef.current?.focus());
    }
  };

  return (
    <div className="ad">
      <style>{AD_CSS}</style>
      <header className="ad-head">
        <div className="ad-title">
          <h1>App demo</h1>
          <span className="ad-chip">{provider ? provider : 'DeepSeek · flash'}</span>
          {agentId ? <span className="ad-chip dim">已接上会话</span> : null}
        </div>
        <button type="button" className="ad-ghost" disabled={busy} onClick={reset}>
          新对话
        </button>
      </header>

      <details className="ad-sys">
        <summary>角色设定</summary>
        <textarea
          className="ad-ta"
          rows={2}
          value={systemPrompt}
          disabled={Boolean(agentId) || busy}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
        {agentId ? <p className="ad-hint">已开始的对话不能改设定，点「新对话」。</p> : null}
      </details>

      <div className="ad-log" ref={logRef}>
        {bubbles.length === 0 ? (
          <div className="ad-empty">
            <p>直接问一句。默认走 DeepSeek，不调工具。</p>
            <div className="ad-starters">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="ad-starter" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          bubbles.map((b, i) => (
            <div key={i} className={`ad-row ${b.role}`}>
              <div className={`ad-bubble ${b.role}${b.error ? ' err' : ''}${b.pending ? ' pending' : ''}`}>
                {b.text}
              </div>
            </div>
          ))
        )}
      </div>

      <footer className="ad-foot">
        <label className="ad-toggle">
          <input type="checkbox" checked={useTools} disabled={busy} onChange={(e) => setUseTools(e.target.checked)} />
          允许调用工具（echo / now / upper）
        </label>
        <div className="ad-compose">
          <textarea
            ref={boxRef}
            className="ad-ta"
            rows={2}
            value={prompt}
            disabled={busy}
            placeholder="问点什么… Enter 发送，Shift+Enter 换行"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="button" className="ad-btn" disabled={busy || !prompt.trim()} onClick={() => void send()}>
            {busy ? '…' : '发送'}
          </button>
        </div>
      </footer>
    </div>
  );
}

const AD_CSS = `
  .ad { height:100%; box-sizing:border-box; padding:14px 18px 12px; display:flex; flex-direction:column;
        min-height:0; color:#e6e6ef; font:13px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
  .ad-head { flex:none; display:flex; align-items:center; gap:12px; margin-bottom:10px; }
  .ad-title { min-width:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .ad-title h1 { margin:0; font-size:16px; font-weight:650; }
  .ad-chip { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid rgba(121,192,255,.28);
             color:#9ecbff; background:rgba(121,192,255,.08); }
  .ad-chip.dim { color:#8b949e; border-color:rgba(255,255,255,.12); background:rgba(255,255,255,.04); }
  .ad-ghost { margin-left:auto; background:transparent; border:1px solid rgba(255,255,255,.12); color:#a8a8bd;
              border-radius:8px; padding:4px 10px; font:12px inherit; cursor:pointer; }
  .ad-ghost:hover:not(:disabled) { color:#e6e6ef; background:rgba(255,255,255,.06); }
  .ad-ghost:disabled { opacity:.4; cursor:default; }
  .ad-sys { flex:none; margin-bottom:10px; color:#8b949e; font-size:12px; }
  .ad-sys summary { cursor:pointer; user-select:none; }
  .ad-sys .ad-ta { margin-top:8px; }
  .ad-hint { margin:6px 0 0; font-size:11px; color:#ffa657; }
  .ad-log { flex:1; min-height:0; overflow:auto; background:#12121a; border:1px solid rgba(255,255,255,.08);
            border-radius:12px; padding:16px 14px; }
  .ad-empty { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;
              color:#8b949e; text-align:center; padding:12px; }
  .ad-empty p { margin:0; }
  .ad-starters { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; max-width:420px; }
  .ad-starter { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); color:#d7d7e4;
                border-radius:999px; padding:6px 12px; font:12px inherit; cursor:pointer; }
  .ad-starter:hover { border-color:rgba(121,192,255,.4); color:#9ecbff; }
  .ad-row { display:flex; margin-bottom:10px; }
  .ad-row.user { justify-content:flex-end; }
  .ad-row.assistant { justify-content:flex-start; }
  .ad-bubble { max-width:78%; padding:9px 12px; border-radius:14px; font-size:13px; line-height:1.55;
               white-space:pre-wrap; word-break:break-word; }
  .ad-bubble.user { background:#1b4f72; color:#eaf6ff; border-bottom-right-radius:4px; }
  .ad-bubble.assistant { background:#1c1c28; color:#e6e6ef; border-bottom-left-radius:4px; }
  .ad-bubble.pending { color:#8b949e; }
  .ad-bubble.err { color:#ffb4ae; background:rgba(255,123,114,.12); }
  .ad-foot { flex:none; margin-top:10px; display:flex; flex-direction:column; gap:8px; }
  .ad-toggle { display:flex; align-items:center; gap:8px; font-size:12px; color:#8b949e; cursor:pointer; }
  .ad-ta { box-sizing:border-box; width:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1);
           border-radius:10px; color:#e6e6ef; font:13px/1.5 inherit; padding:9px 11px; resize:none; }
  .ad-ta:focus { outline:none; border-color:rgba(121,192,255,.45); }
  .ad-ta:disabled { opacity:.55; }
  .ad-compose { display:flex; gap:8px; align-items:flex-end; }
  .ad-compose .ad-ta { flex:1; min-height:44px; }
  .ad-btn { flex:none; height:44px; min-width:72px; background:#238636; border:none; color:#fff;
            border-radius:10px; padding:0 16px; font:13px inherit; font-weight:600; cursor:pointer; }
  .ad-btn:hover:not(:disabled) { background:#2ea043; }
  .ad-btn:disabled { opacity:.4; cursor:default; }
`;
