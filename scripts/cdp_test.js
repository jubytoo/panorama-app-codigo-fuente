// Script de prueba: se conecta por CDP a la ventana del launcher y ejecuta
// el flujo real (crear proyecto -> abrir dashboard) a través de window.launcherAPI,
// exactamente como lo haría un clic de usuario, para validar el prototipo de punta a punta.
async function main() {
  const listResp = await fetch('http://localhost:9222/json');
  const targets = await listResp.json();
  const launcherTarget = targets.find((t) => t.url.includes('launcher/index.html'));
  if (!launcherTarget) throw new Error('No se encontró la ventana del launcher');

  const ws = new WebSocket(launcherTarget.webSocketDebuggerUrl);
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

  await send('Runtime.enable');

  async function evalExpr(expression, awaitPromise = true) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error('Eval error: ' + JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }

  console.log('--- listProjects (antes) ---');
  console.log(await evalExpr('window.launcherAPI.listProjects()'));

  console.log('--- createProject ---');
  const created = await evalExpr(
    "window.launcherAPI.createProject('Soporte N1 (prueba)', 'Cliente Demo')"
  );
  console.log(created);

  console.log('--- openProject ---');
  await evalExpr(`window.launcherAPI.openProject(${created.id})`);
  console.log('abierto ok');

  await new Promise((r) => setTimeout(r, 2500));

  console.log('--- listProjects (después) ---');
  console.log(await evalExpr('window.launcherAPI.listProjects()'));

  ws.close();
}

main().catch((e) => {
  console.error('FALLO:', e);
  process.exit(1);
});
