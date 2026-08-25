export const QUALITY_PANEL_CSS = `
        .qp { font: 13px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
              padding: 14px 18px 12px; height: 100%; box-sizing: border-box;
              display: flex; flex-direction: column; min-height: 0;
              --qp-accent: #79c0ff; }
        .qp-smart { --qp-accent: #a371f7; }
        .qp-head { display:flex; align-items:center; gap:12px; margin-bottom:8px; flex:none; }
        .qp-sub { color:#8b949e; font-size:11px; margin:0 auto 0 4px; min-width:0;
                  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qp-sub .mono { font-family:ui-monospace,Consolas,monospace; }
        .qp-actions { display:inline-flex; align-items:center; gap:2px; flex:none; }
        .qp-act { background:transparent; color:#a8a8bd; border:none; border-radius:6px;
                  padding:6px 10px; cursor:pointer; font-size:12px; font-family:inherit;
                  display:inline-flex; align-items:center; gap:6px; }
        .qp-act:hover:not(:disabled) { color:#e6e6ef; background:rgba(255,255,255,.06); }
        .qp-act:disabled { opacity:.55; cursor:default; }
        .qp-act.primary { color:#79c0ff; }
        .qp-act.primary:hover:not(:disabled) { color:#bcdfff; background:rgba(121,192,255,.1); }
        .qp-spin { width:12px; height:12px; border:2px solid rgba(255,255,255,.2); border-top-color:#79c0ff;
                   border-radius:50%; animation:qp-rot .7s linear infinite; display:inline-block; flex:none; }
        .qp-spin-lg { width:20px; height:20px; border-width:2.5px; }
        @keyframes qp-rot { to { transform:rotate(360deg); } }
        .qp-loading { display:flex; align-items:center; justify-content:center; gap:10px;
                      padding:48px 0; color:#a8a8bd; font-size:13px; flex:1; }
        .qp-err { color:#ff7b72; font-size:12px; margin-bottom:10px; flex:none; }
        .qp-dims { display:flex; gap:2px; flex:none; }
        .qp-dim-btn { background:transparent; border:none; color:#8b8b9c; padding:5px 10px;
                      font-size:13px; font-family:inherit; cursor:pointer; display:inline-flex;
                      align-items:center; gap:10px; font-weight:600; border-radius:8px;
                      transition:color .12s ease, background .12s ease; }
        .qp-dim-btn:hover { color:#e6e6ef; background:rgba(255,255,255,.05); }
        .qp-dim-btn.base.active { color:#9ecbff; background:rgba(121,192,255,.1); }
        .qp-dim-btn.smart.active { color:#c4b0f0; background:rgba(163,113,247,.1); }
        .qp-dim-stats { display:flex; gap:7px; font-size:11px; font-weight:600; letter-spacing:.02em; }
        .qp-dim-stats .mod { color:#8a7a4a; }
        .qp-dim-stats .add { color:#5d7a96; }
        .qp-dim-stats .del { color:#8a5e5c; }
        .qp-dim-stats .mod.on { color:#d4b44a; }
        .qp-dim-stats .add.on { color:#7db0d8; }
        .qp-dim-stats .del.on { color:#e08b86; }
        .qp-folder-chip { display:inline-flex; align-items:center; max-width:88px;
                          background:rgba(255,255,255,.05); color:#c8c8d4;
                          border:1px solid rgba(255,255,255,.1); border-radius:6px;
                          padding:2px 6px; font-size:11px; font-family:inherit; cursor:pointer;
                          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:none; }
        .qp-folder-chip:hover { border-color:rgba(255,255,255,.2); color:#e6e6ef; }
        .qp-th { display:flex; flex-direction:row; align-items:center; gap:6px;
                 white-space:nowrap; font-weight:600; min-width:0; }
        .qp-th-label { color:#a8a8bd; font-size:11px; flex:none; }
        .qp-th-filter, .qp-th-input {
          box-sizing:border-box; background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.1); border-radius:6px; color:#d7d7e0;
          font-size:11px; font-family:inherit; outline:none; padding:3px 6px; height:24px;
        }
        .qp-th-filter { min-width:0; max-width:118px; flex:1; }
        .qp-th-input { width:112px; flex:none; }
        .qp-th-filter:focus, .qp-th-input:focus { border-color:rgba(255,255,255,.22); }
        .qp-th-filter option { background:#1b1b24; }
        .qp-th-input::placeholder { color:#7a7a8a; }
        .qp-th-clear { width:20px; height:20px; flex:none; border:none; border-radius:4px;
                       background:transparent; color:#8b8b9c; cursor:pointer; font-size:13px;
                       line-height:20px; padding:0; }
        .qp-th-clear:hover { color:#e6e6ef; background:rgba(255,255,255,.08); }
        .qp-st-unchanged { color:#7ee787 !important; }
        .qp-st-modified { color:#d29922 !important; }
        .qp-st-added { color:var(--qp-accent) !important; }
        .qp-st-removed { color:#ff7b72 !important; }
        .qp-rv-pass { color:#7ee787 !important; }
        .qp-rv-wait { color:#d29922 !important; }
        .qp-rv-none { color:#a8a8bd !important; }
        .qp-rv-fail { color:#ff7b72 !important; }
        .qp-hs-changed { color:#d29922 !important; }
        .qp-hs-same { color:#7ee787 !important; }
        .qp-body { display:flex; flex:1; min-height:0; gap:10px; }
        .qp-tree { width:228px; flex:none; overflow:auto; scrollbar-gutter:stable;
                   border:1px solid rgba(255,255,255,.08); border-radius:12px;
                   background:rgba(255,255,255,.045); padding:8px 6px; }
        .qp-tree-row { display:flex; align-items:center; gap:4px; padding:3px 8px 3px 0;
                       border-radius:6px; cursor:pointer; color:#c8c8d4; font-size:12px; }
        .qp-tree-row:hover { background:rgba(255,255,255,.05); color:#e6e6ef; }
        .qp-tree-row.on { background:color-mix(in srgb, var(--qp-accent) 16%, transparent); color:var(--qp-accent); }
        .qp-tree-caret { width:16px; flex:none; background:none; border:none; color:inherit;
                         cursor:pointer; font-size:11px; padding:0; font-family:inherit; }
        .qp-tree-leaf { visibility:hidden; }
        .qp-tree-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qp-tree-n { margin-left:auto; color:#8b949e; font-size:10px; font-weight:600; flex:none; }
        .qp-tree-row.on .qp-tree-n { color:var(--qp-accent); }
        .qp-table-wrap { flex:1; min-width:0; min-height:0; overflow:auto; border:1px solid rgba(255,255,255,.08);
                         border-radius:12px; background:rgba(255,255,255,.045);
                         scrollbar-gutter: stable; }
        .qp table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .qp th,.qp td { text-align:left; padding:7px 10px; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:middle; }
        .qp th { color:#a8a8bd; font-weight:600; font-size:11px; background:#1b1b24;
                 position:sticky; top:0; z-index:1; vertical-align:middle;
                 white-space:nowrap; }
        .qp td.qp-status, .qp td.qp-num, .qp td.qp-fp { text-align:center; white-space:nowrap; }
        .qp td.qp-file { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qp td.qp-review { vertical-align:top; padding-top:9px; padding-bottom:9px; }
        .qp-path-seg, .qp-name, .qp-slash { font: inherit; }
        .qp-path-seg, .qp-name { background:none; border:none; padding:0; cursor:pointer;
                                 font-family:ui-monospace,Consolas,monospace; font-size:12px; }
        .qp-path-seg { color:#8b949e; }
        .qp-path-seg:hover, .qp-path-seg.on { color:var(--qp-accent); text-decoration:underline; }
        .qp-slash { color:#6e6e80; }
        .qp-name { color:#e6e6ef; }
        .qp-name:hover { color:var(--qp-accent); text-decoration:underline; }
        .qp tr:last-child td { border-bottom:none; }
        .qp tbody tr:hover td { background:rgba(255,255,255,.03); }
        .qp tbody tr.qp-row-mod td { background:rgba(210,153,34,.05); }
        .qp tbody tr.qp-row-fail td { background:rgba(255,123,114,.045); }
        .qp tbody tr.qp-row-fail td.qp-status { box-shadow: inset 3px 0 0 #ff7b72; }
        .qp-review-fail { display:flex; flex-direction:column; align-items:flex-start; gap:3px; min-width:0; max-width:100%; }
        .qp-issue-preview { font-size:10px; line-height:1.4; color:#ffb4ae;
          overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
          white-space:normal; word-break:break-word; }
        .qp .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; }
        .qp .dim { color:#8b949e; }
        .qp-badge { display:inline-flex; align-items:center; justify-content:center;
                    min-width:0; height:22px; box-sizing:border-box;
                    font-size:11px; padding:0 8px; border-radius:999px; font-weight:600;
                    white-space:nowrap; border:1px solid transparent; }
        .qp-status .qp-badge { min-width:64px; }
        .qp-b-unchanged { color:#7ee787; background:rgba(126,231,135,.12); }
        .qp-b-modified { color:#d29922; background:rgba(210,153,34,.14); }
        .qp-b-added { color:var(--qp-accent); background:color-mix(in srgb, var(--qp-accent) 14%, transparent); }
        .qp-b-removed { color:#ff7b72; background:rgba(255,123,114,.12); text-decoration:line-through; }
        .qp-b-pass { color:#7ee787; background:rgba(126,231,135,.12); }
        .qp-b-fail { color:#ff7b72; background:rgba(255,123,114,.12); }
        .qp-b-wait { color:#d29922; border-style:dashed; border-color:#d29922; background:transparent; }
        .qp-b-none { color:#a8a8bd; border-style:dashed; border-color:rgba(168,168,189,.45); background:transparent; }
        .qp-hash-diff { display:inline-flex; align-items:center; gap:6px; }
        .qp-hash-arrow { color:#d29922; font-size:11px; }
        .qp-empty { text-align:center !important; color:#a8a8bd; padding:36px 12px !important; }
        .qp-empty button { margin-left:10px; background:transparent; color:var(--qp-accent); border:none;
                           cursor:pointer; font-family:inherit; font-size:12px; }
        .qp-foot { flex:none; margin-top:8px; color:#8b949e; font-size:11px; }
      `;
