async function rpc(service, method, args = []) {
  const res = await fetch('/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, method, args }),
  });
  return res.json();
}

function show(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function boot() {
  const inspect = await rpc('webPipeline', 'inspect');
  const graph = await rpc('webPipeline', 'pipelineGraph');
  if (!inspect.ok) {
    show('status', inspect.error || 'webPipeline 未暴露。请用 pnpm web-dev 启动。');
    return;
  }
  show('status', {
    inspect: inspect.result,
    graph: graph.ok ? graph.result : graph.error,
  });
}

async function run(runNitron) {
  show('out', '运行中…');
  const result = await rpc('webPipeline', 'runPipeline', [{ runNitron }]);
  show('out', result.ok ? result.result : result.error);
  await boot();
}

document.getElementById('run')?.addEventListener('click', () => void run(false));
document.getElementById('apk')?.addEventListener('click', () => void run(true));
void boot();
