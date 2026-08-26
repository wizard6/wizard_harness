const MUTED = '#8b949e';
const GREEN = '#7ee787';
const BLUE = '#79c0ff';
const RED = '#ff7b72';
export { MUTED, GREEN, BLUE, RED };
export const PANEL_CSS = `
    .rp { font: 13px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
          padding: 14px 18px 12px; height: 100%; box-sizing: border-box;
          display: flex; flex-direction: column; min-height: 0; color: #e6e6ef; }
    .rp-head { display:flex; align-items:center; gap:12px; margin-bottom:10px; flex:none; }
    .rp-tabs { display:flex; gap:2px; flex:none; }
    .rp-tab { background:transparent; border:none; color:#8b8b9c; padding:5px 10px;
              font-size:13px; font-family:inherit; cursor:pointer; display:inline-flex;
              align-items:center; gap:6px; font-weight:600; border-radius:8px; }
    .rp-tab:hover { color:#e6e6ef; background:rgba(255,255,255,.05); }
    .rp-tab.on { color:#9ecbff; background:rgba(121,192,255,.1); }
    .rp-tab-n { font-size:11px; font-weight:600; color:#8b949e; }
    .rp-tab.on .rp-tab-n { color:#79c0ff; }
    .rp-trail { margin-left:auto; display:inline-flex; align-items:center; }
    .rp-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex:none; flex-wrap:wrap; }
    .rp-tag-filters { display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .rp-sub { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); color:${MUTED};
              border-radius:6px; padding:3px 10px; height:24px; box-sizing:border-box;
              font-size:11px; cursor:pointer; font-family:inherit; }
    .rp-sub:hover { color:#e6e6ef; border-color:rgba(255,255,255,.18); }
    .rp-sub.on { background:rgba(121,192,255,.14); border-color:rgba(121,192,255,.35); color:${BLUE}; font-weight:600; }
    .rp-sub.primary { background:rgba(121,192,255,.16); border-color:rgba(121,192,255,.4); color:#9ecbff; font-weight:600; }
    .rp-sub.primary:hover { background:rgba(121,192,255,.24); color:#e6e6ef; }
    .rp-sub:disabled { opacity:.45; cursor:default; }
    .rp-banner { flex:none; margin:-2px 0 10px; padding:8px 12px; border-radius:8px; font-size:12px; line-height:1.5;
                 border:1px solid rgba(255,255,255,.1); color:#d7d7e4; }
    .rp-banner.ok { border-color:rgba(126,231,135,.3); background:rgba(126,231,135,.08); color:${GREEN}; }
    .rp-banner.warn { border-color:rgba(255,166,87,.3); background:rgba(255,166,87,.08); color:#ffa657; }
    .rp-banner.err { border-color:rgba(255,123,114,.35); background:rgba(255,123,114,.08); color:${RED}; }
    .rp-card.fresh { border-color:rgba(126,231,135,.5); box-shadow:0 0 0 1px rgba(126,231,135,.18); }
    .rp-search { margin-left:auto; box-sizing:border-box; background:rgba(255,255,255,.04);
                 border:1px solid rgba(255,255,255,.1); border-radius:6px; color:#d7d7e0;
                 font-size:11px; font-family:inherit; outline:none; padding:3px 8px; height:24px; width:200px; }
    .rp-search:focus { border-color:rgba(255,255,255,.22); }
    .rp-search::placeholder { color:#7a7a8a; }
    .rp-body { flex:1; min-height:0; overflow:auto; }
    .rp-empty { color:${MUTED}; text-align:center; padding:36px 12px; }
    .rp-card { background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08);
               border-radius:12px; padding:12px 14px; margin-bottom:8px; }
    .rp-card:hover { background:rgba(255,255,255,.06); }
    .rp-card-head { display:flex; align-items:center; gap:8px; min-width:0; }
    .rp-name { font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .rp-name.open { cursor:pointer; }
    .rp-name.open:hover { color:${BLUE}; }
    .rp-meta { margin-left:auto; display:flex; gap:6px; align-items:center; flex:none; }
    .rp-desc { margin:4px 0 0; font-size:12px; color:${MUTED}; line-height:1.5; }
    .rp-tier { font-size:10px; padding:1px 7px; border-radius:999px; flex:none;
               border:1px solid rgba(255,255,255,.12); color:${MUTED}; font-weight:600; letter-spacing:.03em; }
    .rp-tier.core { color:${BLUE}; border-color:rgba(121,192,255,.35); background:rgba(121,192,255,.08); }
    .rp-tier.exp { color:#ffa657; border-color:rgba(255,166,87,.35); background:rgba(255,166,87,.08); }
    .rp-tag { font-size:10px; padding:1px 7px; border-radius:999px; flex:none;
              border:1px solid rgba(126,231,135,.28); color:${GREEN}; font-weight:600;
              background:rgba(126,231,135,.08); letter-spacing:.02em; }
    .rp-ver { color:${GREEN}; font-size:11px; font-family:ui-monospace,Consolas,monospace; }
    .rp-foot { display:flex; gap:6px; margin-top:10px; align-items:center; flex-wrap:wrap; }
    .rp-live { font-size:11px; color:${GREEN}; font-weight:600; }
    .rp-chip { font-size:11px; padding:2px 8px; border-radius:6px; cursor:pointer;
               background:rgba(121,192,255,.1); border:1px solid rgba(121,192,255,.22); color:${BLUE};
               font-family:ui-monospace,Consolas,monospace; }
    .rp-chip:hover { background:rgba(121,192,255,.2); }
    .rp-chip.plain { cursor:default; }
    .rp-chip .id { color:${MUTED}; margin-left:6px; font-family:inherit; }
    .rp-actions { margin-left:auto; display:flex; gap:6px; }
    .rp-btn { background:transparent; color:#a8a8bd;
              border:1px solid rgba(255,255,255,.12); border-radius:6px; padding:3px 10px;
              font-size:12px; cursor:pointer; font-family:inherit; }
    .rp-btn:hover { color:#e6e6ef; background:rgba(255,255,255,.08); }
    .rp-btn.danger { color:${RED}; border-color:rgba(255,123,114,.35); }
    .rp-btn.danger:hover { background:rgba(255,123,114,.1); }
    .rp-cfg { margin-top:8px; border-top:1px solid rgba(255,255,255,.06); padding-top:6px; }
    .rp-cfg-row { display:flex; justify-content:space-between; gap:12px; font-size:11px; padding:3px 0; }
    .rp-cfg-k { color:${MUTED}; flex:none; }
    .rp-cfg-v { color:#e6e6ef; font-family:ui-monospace,Consolas,monospace; word-break:break-all; text-align:right; }
    .rp-tl { list-style:none; padding:0; margin:0; }
    .rp-tl-item { display:grid; grid-template-columns:56px 150px 16px 1fr; gap:8px;
                  align-items:baseline; padding:6px 8px; border-radius:6px; }
    .rp-tl-item:hover { background:rgba(255,255,255,.04); }
    .rp-tl-time { color:${MUTED}; font-size:11px; font-family:ui-monospace,Consolas,monospace; }
    .rp-tl-actor { color:#cfcfe0; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .rp-tl-arrow { color:${MUTED}; font-size:12px; }
    .rp-tl-text { font-size:12px; word-break:break-all; font-family:ui-monospace,Consolas,monospace; }
`;