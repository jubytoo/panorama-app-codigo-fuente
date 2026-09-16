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

  async function evalExpr(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error('Eval error: ' + JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  // Busca cualquier botón visible con texto "Ahora no" y lo pulsa (cierra el aviso de carpeta de backup nativo).
  console.log(
    await evalExpr(`
      (function(){
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.trim() === 'Ahora no');
        if(btn){ btn.click(); return 'clicked'; }
        return 'not-found';
      })()
    `)
  );

  await new Promise((r) => setTimeout(r, 800));
  console.log('h1 page-title text ->', await evalExpr("document.getElementById('page-title') ? document.getElementById('page-title').textContent : '(no encontrado)'"));
  console.log('console errors check: xlsx defined ->', await evalExpr('typeof XLSX'));
  console.log('console errors check: pptxgen defined ->', await evalExpr('typeof PptxGenJS'));

  ws.close();
}

main().catch((e) => {
  console.error('FALLO:', e);
  process.exit(1);
});
