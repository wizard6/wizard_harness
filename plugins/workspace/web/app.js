async function rpc(service, method, args = []) {
  if (window.wh && typeof window.wh.call === 'function') {
    return window.wh.call(service, method, args);
  }
  const res = await fetch('/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, method, args }),
  });
  return res.json();
}

const views = {
  home: document.getElementById('view-home'),
  plugins: document.getElementById('view-plugins'),
  publish: document.getElementById('view-publish'),
  soon: document.getElementById('view-soon'),
};
const titles = { home: '概览', plugins: '插件架', publish: '发布', soon: '空位' };

function showView(name, title) {
  const key = views[name] ? name : 'home';
  for (const [id, el] of Object.entries(views)) {
    if (el) el.hidden = id !== key;
  }
  document.getElementById('heading').textContent = title || titles[key] || key;
  for (const btn of document.querySelectorAll('.nav')) {
    btn.classList.toggle('on', key !== 'soon' && btn.dataset.view === key);
  }
}

function tick() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleString();
}

function hourHello() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function renderTiles(tiles) {
  const root = document.getElementById('tiles');
  if (!root) return;
  root.innerHTML = '';
  for (const tile of tiles) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile';
    btn.innerHTML =
      '<div class="t"><span></span><span class="tag"></span></div><div class="b"></div>';
    btn.querySelector('.t span').textContent = tile.title;
    const tag = btn.querySelector('.tag');
    tag.textContent = tile.kind === 'soon' ? '空位' : '打开';
    tag.classList.add(tile.kind === 'soon' ? 'wait' : 'go');
    btn.querySelector('.b').textContent = tile.blurb;
    btn.addEventListener('click', () => {
      if (tile.kind === 'soon') {
        document.getElementById('soon-title').textContent = tile.title;
        document.getElementById('soon-blurb').textContent =
          tile.blurb + ' 业务插件 inject workspace 后 registerTile 即可替换这块。';
        showView('soon', tile.title);
        return;
      }
      showView(tile.view || 'home', titles[tile.view] || tile.title);
    });
    root.appendChild(btn);
  }
}

function renderPlugins(list) {
  const root = document.getElementById('plugin-grid');
  if (!root) return;
  root.innerHTML = '';
  if (!list.length) {
    root.innerHTML = '<p class="muted">还没有加载插件。</p>';
    return;
  }
  for (const p of list) {
    const card = document.createElement('div');
    card.className = 'pcard';
    card.innerHTML = '<div class="t"><span></span><span class="tag go">已加载</span></div><div class="b"></div>';
    card.querySelector('.t span').textContent = p.name || p.id;
    card.querySelector('.b').textContent = p.description || p.id;
    root.appendChild(card);
  }
}

async function boot() {
  if (window.wh && typeof window.wh.call === 'function') {
    const site = document.querySelector('a[href="/site/"]');
    if (site) site.hidden = true;
  }
  document.getElementById('hello').textContent = hourHello();
  const snap = await rpc('workspace', 'snapshot');
  if (snap.ok && snap.result) {
    document.getElementById('kicker').textContent = snap.result.title || '个人工作台';
    renderTiles(snap.result.tiles || []);
  } else {
    document.getElementById('runtime').textContent =
      snap.error || 'workspace 未暴露。请用 pnpm web-dev 或托盘打开。';
  }
  const ld = await rpc('workspace', 'loaded');
  if (ld.ok) {
    const list = ld.result || [];
    document.getElementById('runtime').textContent = '运行中 · ' + list.length + ' 个插件';
    renderPlugins(list);
  } else if (snap.ok) {
    document.getElementById('runtime').textContent = '运行中';
    renderPlugins([]);
  } else {
    document.getElementById('runtime').textContent = String(ld.error || '无法读取插件列表');
  }
}

async function run(runNitron) {
  const out = document.getElementById('pub-out');
  const runBtn = document.getElementById('run');
  const apkBtn = document.getElementById('apk');
  out.textContent = '运行中…';
  runBtn.disabled = true;
  apkBtn.disabled = true;
  try {
    const result = await rpc('webPipeline', 'runPipeline', [{ runNitron }]);
    out.textContent = result.ok ? JSON.stringify(result.result, null, 2) : String(result.error || '失败');
  } finally {
    runBtn.disabled = false;
    apkBtn.disabled = false;
  }
}

tick();
setInterval(tick, 1000);
document.querySelectorAll('.nav').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view, titles[btn.dataset.view]));
});
document.getElementById('run')?.addEventListener('click', () => void run(false));
document.getElementById('apk')?.addEventListener('click', () => void run(true));

function enableHudSurface() {
  if (!window.wh || typeof window.wh.setHudHit !== 'function') return;
  document.documentElement.classList.add('hud');
  let hit = false;
  const send = (next) => {
    if (next === hit) return;
    hit = next;
    window.wh.setHudHit(hit);
  };
  document.addEventListener('mousemove', (e) => {
    const el = e.target;
    send(!!(el && el.closest && el.closest('[data-hud-hit]')));
  });
  document.addEventListener('mouseleave', () => send(false));
  document.getElementById('hud-close')?.addEventListener('click', () => {
    window.wh.windowControl('close');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.wh.windowControl('close');
  });
  send(false);
}

enableHudSurface();
void boot();
