const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const assert = require('assert');

const root = process.cwd();
const mime = {
  '.html':'text/html',
  '.js':'text/javascript',
  '.css':'text/css',
  '.json':'application/json',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.webp':'image/webp',
  '.ico':'image/x-icon'
};

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (c.includes('\\') && fs.existsSync(c)) return c;
      if (!c.includes('\\')) {
        execFileSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio:'ignore' });
        return c;
      }
    } catch (_) {}
  }
  return null;
}

function staticServer() {
  return http.createServer((req,res)=>{
    const u = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const full = path.resolve(root, rel);
    if (
      !full.startsWith(path.resolve(root)) ||
      !fs.existsSync(full) ||
      fs.statSync(full).isDirectory()
    ) {
      res.writeHead(404);
      return res.end('404');
    }

    res.writeHead(200, {
      'Content-Type': mime[path.extname(full)] || 'application/octet-stream',
      'Cache-Control':'no-store'
    });
    fs.createReadStream(full).pipe(res);
  });
}

async function waitJson(url, timeout=8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (_) {}
    await new Promise(r=>setTimeout(r,120));
  }
  throw new Error(`Timeout esperando ${url}`);
}

async function urlDisponible(url, timeout=1200) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const r = await fetch(url, { signal: ctrl.signal, cache:'no-store' });
    clearTimeout(timer);
    return r.ok;
  } catch (_) {
    return false;
  }
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const listeners = [];

  ws.onmessage = (ev)=>{
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else {
      listeners.forEach(fn=>fn(m));
    }
  };

  const opened = new Promise((resolve,reject)=>{
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  return {
    async send(method, params={}) {
      await opened;
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
    },
    on(fn){ listeners.push(fn); },
    close(){ ws.close(); }
  };
}

async function esperarTarget(debugPort, targetId, timeout=8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const pages = await waitJson(`http://127.0.0.1:${debugPort}/json/list`);
    const found = pages.find(p => p.id === targetId || p.targetId === targetId);
    if (found?.webSocketDebuggerUrl) return found;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error(`No apareció el target E2E ${targetId}`);
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.log('E2E Etapa 6: OMITIDO (Chrome/Edge/Chromium no encontrado).');
    return;
  }

  let server = null;
  let appUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5500/index.html';

  if (!(await urlDisponible(appUrl))) {
    server = staticServer();
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    appUrl = `http://127.0.0.1:${server.address().port}/index.html`;
  }

  const debugPort = 19333 + Math.floor(Math.random()*1000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'autoservicio-e2e-'));

  const proc = spawn(browser,[
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-features=BlockInsecurePrivateNetworkRequests',
    '--allow-insecure-localhost',
    'about:blank'
  ],{ stdio:'ignore' });

  let browserClient = null;
  let client = null;

  try {
    const version = await waitJson(`http://127.0.0.1:${debugPort}/json/version`);

    // Crear una pestaña exclusiva para esta prueba. No se reutilizan targets
    // existentes porque Chrome/Edge puede exponer páginas de extensiones primero.
    browserClient = cdp(version.webSocketDebuggerUrl);
    const created = await browserClient.send('Target.createTarget', { url:'about:blank' });
    const target = await esperarTarget(debugPort, created.targetId);

    client = cdp(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    const errors = [];
    client.on(m=>{
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push(
          m.params.exceptionDetails?.exception?.description ||
          m.params.exceptionDetails?.text ||
          'exception'
        );
      }
    });

    await client.send('Page.navigate',{ url:appUrl });

    async function evalValue(expression) {
      const r = await client.send('Runtime.evaluate',{
        expression,
        returnByValue:true,
        awaitPromise:true
      });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    }

    const limite = Date.now() + 10000;
    let ready = false;
    while (Date.now() < limite) {
      try {
        ready = await evalValue(
          `document.readyState !== 'loading' && !!document.getElementById('pantallaTareas')`
        );
      } catch (_) {}
      if (ready) break;
      await new Promise(r=>setTimeout(r,150));
    }

    if (!ready) {
      const actual = await evalValue('location.href');
      const title = await evalValue('document.title');
      const body = await evalValue(
        'document.body ? document.body.innerText.slice(0,180) : ""'
      );
      throw new Error(
        `index.html no terminó de cargar. URL=${actual}; title=${title}; body=${body}`
      );
    }

    const viewports = [
      [320,860],
      [360,800],
      [375,812],
      [390,844],
      [412,915],
      [430,932],
      [1366,768]
    ];

    for (const [width,height] of viewports) {
      await client.send('Emulation.setDeviceMetricsOverride',{
        width,
        height,
        deviceScaleFactor:1,
        mobile:width < 768
      });

      const result = await evalValue(`(()=>{
        document.documentElement.setAttribute('data-theme','dark');
        document.body.classList.add('en-tareas');

        const target=document.getElementById('pantallaTareas');
        document.querySelectorAll('.pantalla').forEach(x=>{x.style.display='none';});
        target.style.cssText='display:block !important; position:fixed; inset:0; overflow:auto; width:100vw; max-width:none;';

        document.querySelectorAll('#pantallaTareas .tareas-view').forEach(
          x=>x.classList.add('oculto')
        );

        const cfg=document.getElementById('tareasVistaConfig');
        cfg.classList.remove('oculto');
        cfg.style.display='block';

        const list=document.getElementById('configTareasLista');
        list.innerHTML='<article class="config-task-row" data-id="e2e"><button class="config-task-drag" type="button">⋮⋮</button><div class="config-task-name"><span class="config-task-icon"></span><strong>Limpieza completa de góndolas y control general del sector</strong></div><span class="config-task-duration">45 min</span><div class="config-task-days-wrap"><span>Lun</span><span>Mié</span><span>Vie</span></div><span class="config-task-status is-active">Activa</span><button class="config-task-open" type="button">Editar</button></article>';

        const row=list.querySelector('.config-task-row');
        const name=row.querySelector('.config-task-name strong');
        const rect=name.getBoundingClientRect();
        const cs=getComputedStyle(name);
        const fontSize=parseFloat(cs.fontSize)||16;
        const lineHeight=parseFloat(cs.lineHeight)||fontSize*1.25;
        const lineCount=Math.max(1,Math.round(rect.height/lineHeight));
        const textLength=(name.textContent||'').trim().length;
        const charsPerLine=textLength/lineCount;

        return {
          targetOverflow:target.scrollWidth > target.clientWidth + 2,
          rowOverflow:row.scrollWidth > row.clientWidth + 2,
          nameWidth:Math.round(rect.width),
          nameHeight:Math.round(rect.height),
          lineCount,
          charsPerLine,
          wordBreak:cs.wordBreak,
          overflowWrap:cs.overflowWrap,
          bodyOverflow:document.documentElement.scrollWidth > innerWidth + 2
        };
      })()`);

      assert(!result.targetOverflow, `Tareas desborda horizontalmente en ${width}px`);
      assert(!result.rowOverflow, `Fila de configuración desborda en ${width}px`);
      assert(!result.bodyOverflow, `Documento desborda horizontalmente en ${width}px`);
      if (width < 768) {
        const anchoMinimo = width <= 320 ? 80 : 90;
        assert(
          result.nameWidth >= anchoMinimo,
          `Nombre de tarea demasiado angosto (${result.nameWidth}px) en ${width}px`
        );
        assert(
          result.charsPerLine >= 4,
          `Nombre de tarea apilado verticalmente (${result.charsPerLine.toFixed(1)} caracteres por línea; ${result.lineCount} líneas) en ${width}px`
        );
      }

      const bano = await evalValue(`(()=>{
        document.body.className='en-bano';
        document.querySelectorAll('.pantalla').forEach(x=>x.style.display='none');
        const t=document.getElementById('pantallaBano');
        t.style.cssText='display:block !important; position:fixed; inset:0; overflow:auto; width:100vw; max-width:none;';
        return {
          overflow:t.scrollWidth>t.clientWidth+2,
          body:document.documentElement.scrollWidth>innerWidth+2
        };
      })()`);

      assert(!bano.overflow && !bano.body, `Baño desborda horizontalmente en ${width}px`);

      const admin = await evalValue(`(()=>{
        document.body.className='en-admin';
        document.querySelectorAll('.pantalla').forEach(x=>x.style.display='none');
        const t=document.getElementById('pantallaAdmin');
        t.style.cssText='display:block !important; position:fixed; inset:0; overflow:auto; width:100vw; max-width:none;';
        return {
          overflow:t.scrollWidth>t.clientWidth+2,
          body:document.documentElement.scrollWidth>innerWidth+2
        };
      })()`);

      assert(
        !admin.overflow && !admin.body,
        `Administración desborda horizontalmente en ${width}px`
      );
    }

    assert.strictEqual(
      errors.length,
      0,
      `Errores JavaScript en navegador: ${errors.join(', ')}`
    );

    console.log(
      `E2E Etapa 6 navegador real: OK (${path.basename(browser)}; 7 viewports).`
    );
  } finally {
    try { client?.close(); } catch (_) {}
    try { browserClient?.close(); } catch (_) {}
    try { proc.kill('SIGKILL'); } catch (_) {}
    try { if (server) server.close(); } catch (_) {}
    try { fs.rmSync(profile,{recursive:true,force:true}); } catch (_) {}
  }
}

main().catch(err=>{
  console.error('E2E Etapa 6: ERROR -',err.message);
  process.exitCode=1;
});
