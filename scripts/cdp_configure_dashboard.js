async function main() {
  const listResp = await fetch('http://localhost:9222/json');
  const targets = await listResp.json();
  const target = targets.find((t) => t.url.includes('dashboard/plantilla_dashboard.html'));
  if (!target) throw new Error('No se encontró la ventana del dashboard');

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
  await send('Runtime.enable');

  async function evalExpr(expression, awaitPromise = false) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error('Eval error: ' + JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  console.log('click gate-opt-rename ->', await evalExpr("document.getElementById('gate-opt-rename').click(); 'ok'"));
  await new Promise((r) => setTimeout(r, 400));

  console.log(
    'fill title/date ->',
    await evalExpr(`
      document.getElementById('gate-title-input').value = 'Soporte N1 (piloto Electron)';
      document.getElementById('gate-start-input').value = '2026-09-01';
      'ok'
    `)
  );
  await new Promise((r) => setTimeout(r, 200));

  console.log('click continue ->', await evalExpr("document.getElementById('gate-rename-continue').click(); 'ok'"));
  await new Promise((r) => setTimeout(r, 1500));

  console.log('page title now ->', await evalExpr('document.title'));
  console.log('projectTitle in-memory ->', await evalExpr('window.state ? window.state.projectTitle : "(sin acceso a state)"'));
  console.log('localStorage length ->', await evalExpr('localStorage.length'));
  console.log('panoramaBridge present ->', await evalExpr('!!window.panoramaBridge'));
  console.log('panoramaBridge.projectId ->', await evalExpr('window.panoramaBridge && window.panoramaBridge.projectId'));

  console.log('--- forcing an immediate backup via bridge ---');
  console.log(
    await evalExpr(
      `
      (function(){
        const dump = {};
        for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); dump[k]=localStorage.getItem(k); }
        return window.panoramaBridge.saveBackup(JSON.stringify(dump), 'cdp-test');
      })()
      `,
      true
    )
  );

  ws.close();
}

main().catch((e) => {
  console.error('FALLO:', e);
  process.exit(1);
});
