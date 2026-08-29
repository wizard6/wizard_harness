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

function finishBootSplash(ok) {
  const splash = document.getElementById('boot-splash');
  const shell = document.querySelector('.shell');
  const sub = document.getElementById('boot-sub');
  if (sub) sub.textContent = ok ? '就绪' : '已打开';
  if (shell) {
    shell.classList.remove('is-booting');
    shell.classList.add('is-ready');
  }
  if (!splash) return;
  const reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hold = reduced ? 80 : 420;
  window.setTimeout(() => {
    splash.classList.add('is-done');
    splash.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => splash.remove(), reduced ? 220 : 520);
  }, hold);
}

async function boot() {
  const started = Date.now();
  if (window.wh && typeof window.wh.call === 'function') {
    const site = document.querySelector('a[href="/site/"]');
    if (site) site.hidden = true;
  }
  document.getElementById('hello').textContent = hourHello();
  let ok = false;
  try {
    const snap = await rpc('workspace', 'snapshot');
    if (snap.ok && snap.result) {
      document.getElementById('kicker').textContent = snap.result.title || '个人工作台';
      renderTiles(snap.result.tiles || []);
      ok = true;
    } else {
      document.getElementById('runtime').textContent =
        snap.error || 'workspace 未暴露。请用 pnpm web-dev 或托盘打开。';
    }
    const ld = await rpc('workspace', 'loaded');
    if (ld.ok) {
      const list = ld.result || [];
      document.getElementById('runtime').textContent = '运行中 · ' + list.length + ' 个插件';
      renderPlugins(list);
      ok = true;
    } else if (snap.ok) {
      document.getElementById('runtime').textContent = '运行中';
      renderPlugins([]);
    } else {
      document.getElementById('runtime').textContent = String(ld.error || '无法读取插件列表');
    }
  } finally {
    const minMs =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 700;
    const wait = Math.max(0, minMs - (Date.now() - started));
    window.setTimeout(() => finishBootSplash(ok), wait);
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
  const shell = document.querySelector('.shell');
  const dragBar = document.getElementById('hud-drag');
  let hit = false;
  let dragging = false;
  const send = (next) => {
    if (next === hit) return;
    hit = next;
    window.wh.setHudHit(hit);
  };
  document.addEventListener('mousemove', (e) => {
    if (dragging) return;
    const el = e.target;
    send(!!(el && el.closest && el.closest('[data-hud-hit]')));
  });
  document.addEventListener('mouseleave', () => {
    if (!dragging) send(false);
  });
  document.getElementById('hud-close')?.addEventListener('click', () => {
    window.wh.windowControl('close');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.wh.windowControl('close');
  });

  if (shell) {
    const handles = [dragBar, document.querySelector('.brand'), document.querySelector('.top')].filter(Boolean);
    let origin = null;
    const moveTo = (clientX, clientY) => {
      if (!origin) return;
      const maxX = Math.max(0, window.innerWidth - shell.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - shell.offsetHeight);
      const x = Math.max(0, Math.min(maxX, origin.left + (clientX - origin.x)));
      const y = Math.max(0, Math.min(maxY, origin.top + (clientY - origin.y)));
      shell.style.left = x + 'px';
      shell.style.top = y + 'px';
      shell.style.transform = 'none';
    };
    const onMove = (e) => moveTo(e.clientX, e.clientY);
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      origin = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    for (const handle of handles) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, a, input, textarea')) return;
        const rect = shell.getBoundingClientRect();
        dragging = true;
        origin = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
        send(true);
        e.preventDefault();
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }
  }
  send(false);
}

enableHudSurface();
void boot();
