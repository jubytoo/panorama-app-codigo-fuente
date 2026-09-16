// Recarga (ignorando caché) una ventana identificada por una subcadena de
// su título/URL, vía Chrome DevTools Protocol. Uso:
//   node scripts/cdp_reload.js "<substring título/url>"
async function main() {
  const [, , needle] = process.argv;
  const listResp = await fetch('http://localhost:9222/json');
  const targets = await listResp.json();
  const target = targets.find((t) => (t.title || '').includes(needle) || (t.url || '').includes(needle));
  if (!target) {
    console.error('No se encontró ventana con:', needle, '\nDisponibles:', targets.map((t) => t.title + ' | ' + t.url));
    process.exit(1);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 1200));
  console.log('reloaded', target.title);
  ws.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
