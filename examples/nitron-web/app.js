const el = document.getElementById('now');
function tick() {
  if (!el) return;
  el.textContent = '本地时间 ' + new Date().toLocaleString();
}
tick();
setInterval(tick, 1000);
