// Inventario exacto de las llamadas a dbmod.run() en main.js.
// Escáner léxico: ignora cadenas, plantillas, regex y comentarios, y lleva
// una pila de bloques para saber si cada llamada está DE VERDAD dentro de un
// try{} (y de cuál), y dentro de qué función / handler IPC.
'use strict';
const fs = require('fs');
const SRC = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js';
const s = fs.readFileSync(SRC, 'utf8');
const lineOf = (i) => s.slice(0, i).split('\n').length;

let i = 0;
const n = s.length;
let st = 'code';
let tmplDepth = [];      // pila de profundidades de llave para `${}`
const blocks = [];       // pila: {kind:'try'|'catch'|'other'|'fn'|'ipc', name, startLine, depth}
let depth = 0;
const calls = [];
const fnStack = [];

function prevNonSpace(idx) { let j = idx - 1; while (j >= 0 && /\s/.test(s[j])) j--; return j; }
function wordBefore(idx) {
  let j = prevNonSpace(idx);
  let end = j + 1;
  while (j >= 0 && /[A-Za-z_$0-9]/.test(s[j])) j--;
  return s.slice(j + 1, end);
}

while (i < n) {
  const c = s[i], c2 = s.slice(i, i + 2);
  if (st === 'code') {
    if (c2 === '//') { st = 'line'; i += 2; continue; }
    if (c2 === '/*') { st = 'block'; i += 2; continue; }
    if (c === "'") { st = 'sq'; i++; continue; }
    if (c === '"') { st = 'dq'; i++; continue; }
    if (c === '`') { st = 'tmpl'; tmplDepth.push(-1); i++; continue; }
    if (c === '/') {
      // ¿regex o división? heurística: regex si el token anterior no es ident/)/]
      const p = s[prevNonSpace(i)];
      if (p && !/[A-Za-z_$0-9)\]]/.test(p)) { st = 're'; i++; continue; }
    }
    if (s.startsWith('dbmod.run(', i)) {
      const enclosingTry = blocks.filter((b) => b.kind === 'try').slice(-1)[0] || null;
      const enclosingCatch = blocks.filter((b) => b.kind === 'catch').slice(-1)[0] || null;
      calls.push({
        line: lineOf(i),
        fn: fnStack.length ? fnStack[fnStack.length - 1] : '(módulo)',
        inTry: !!enclosingTry,
        tryLine: enclosingTry ? enclosingTry.startLine : null,
        inCatch: !!enclosingCatch,
        catchLine: enclosingCatch ? enclosingCatch.startLine : null,
      });
      i += 10; continue;
    }
    // detectar cabeceras de funcion / ipcMain.handle para el contexto
    let mFn = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(s.slice(i, i + 90));
    if (mFn && (i === 0 || !/[A-Za-z_$0-9.]/.test(s[i - 1]))) { fnStack.push({ name: mFn[1], depth }); }
    let mIpc = /^ipcMain\.handle\(\s*'([^']+)'/.exec(s.slice(i, i + 90));
    if (mIpc) { fnStack.push({ name: "IPC '" + mIpc[1] + "'", depth }); }

    if (c === '{') {
      const w = wordBefore(i);
      let kind = 'other';
      if (w === 'try') kind = 'try';
      else if (w === ')' ) {
        // mirar si es catch(...)
        let j = i - 1; while (j >= 0 && s[j] !== '(') j--;
        if (wordBefore(j) === 'catch') kind = 'catch';
      }
      blocks.push({ kind, startLine: lineOf(i), depth });
      depth++;
      i++; continue;
    }
    if (c === '}') {
      depth--;
      while (blocks.length && blocks[blocks.length - 1].depth >= depth) blocks.pop();
      while (fnStack.length && fnStack[fnStack.length - 1].depth >= depth) fnStack.pop();
      if (tmplDepth.length && tmplDepth[tmplDepth.length - 1] === depth) { tmplDepth.pop(); st = 'tmpl'; }
      i++; continue;
    }
    i++; continue;
  }
  if (st === 'line') { if (c === '\n') st = 'code'; i++; continue; }
  if (st === 'block') { if (c2 === '*/') { st = 'code'; i += 2; continue; } i++; continue; }
  if (st === 'sq') { if (c === '\\') { i += 2; continue; } if (c === "'") st = 'code'; i++; continue; }
  if (st === 'dq') { if (c === '\\') { i += 2; continue; } if (c === '"') st = 'code'; i++; continue; }
  if (st === 're') { if (c === '\\') { i += 2; continue; } if (c === '/') st = 'code'; if (c === '\n') st = 'code'; i++; continue; }
  if (st === 'tmpl') {
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { tmplDepth.pop(); st = 'code'; i++; continue; }
    if (c2 === '${') { tmplDepth[tmplDepth.length - 1] = depth; st = 'code'; depth++; i += 2; continue; }
    i++; continue;
  }
}

const fnName = (f) => (typeof f === 'string' ? f : f.name);
console.log('total dbmod.run(): ' + calls.length);
console.log('');
console.log('linea | try? | tryLine | funcion / handler');
console.log('------+------+---------+------------------');
calls.forEach((c) => {
  console.log(
    String(c.line).padStart(5) + ' | ' +
    (c.inTry ? ' SI ' : ' NO ') + ' | ' +
    String(c.tryLine || '-').padStart(7) + ' | ' +
    fnName(c.fn)
  );
});
console.log('');
console.log('CON try/catch: ' + calls.filter((c) => c.inTry).length);
console.log('SIN try/catch: ' + calls.filter((c) => !c.inTry).length);
