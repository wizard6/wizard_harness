window.wh.getState().then((state) => {
  const pluginsEl = document.getElementById('plugins');
  pluginsEl.innerHTML = state.plugins
    .map(
      (p) =>
        `<li>${p.name} <code>${p.version}</code>` +
        (p.hasUi ? `<button data-id="${p.id}">弹窗</button>` : '') +
        `</li>`,
    )
    .join('');

  pluginsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && btn.dataset.id) window.wh.openPlugin(btn.dataset.id);
  });

  const timeline = document.getElementById('timeline');
  timeline.innerHTML = state.events.length
    ? state.events
        .map(
          (e) =>
            `<li class="ev">[${new Date(e.ts).toISOString().slice(11, 19)}] ${e.actor} → ${
              e.action
            } ${e.target || ''}</li>`,
        )
        .join('')
    : '<li>暂无事件</li>';
});
