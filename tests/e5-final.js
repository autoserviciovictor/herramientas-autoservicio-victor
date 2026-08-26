const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const version = JSON.parse(read("version.json"));
const build = version.assetBuild;
assert(/^1960-d21-/.test(build), "La aplicación debe usar un build D21 unificado vigente");

const html = read("index.html");
const style = read("style.css");
const shell = read("app-shell.css");
const notif = read("notification-center.js");
const push = read("notifications.js");
const dialog = read("dialog.js");
const sw = read("service-worker.js");
const pwa = read("pwa.js");

// HTML: IDs únicos y contratos básicos de accesibilidad en diálogos.
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const seen = new Set();
const duplicates = [];
for (const id of ids) {
  if (seen.has(id)) duplicates.push(id);
  seen.add(id);
}
assert(duplicates.length === 0, `IDs HTML duplicados: ${duplicates.join(", ")}`);

for (const match of html.matchAll(/<([a-z0-9-]+)\b([^>]*\brole="dialog"[^>]*)>/gi)) {
  const attrs = match[2];
  const labelled = attrs.match(/\baria-labelledby="([^"]+)"/i)?.[1] || "";
  const modal = attrs.match(/\baria-modal="([^"]+)"/i)?.[1] || "";
  assert(labelled && seen.has(labelled), `Dialog sin aria-labelledby válido: ${match[0].slice(0, 120)}`);
  assert(modal === "true" || modal === "false", `Dialog sin aria-modal explícito: ${labelled}`);
}

for (const match of html.matchAll(/<button\b([^>]*)>/gi)) {
  assert(/\btype="(?:button|submit|reset)"/i.test(match[1]), `Botón sin type: ${match[0].slice(0, 120)}`);
}

assert(html.includes('aria-describedby="appDialogMensaje"'), "AppDialog debe describirse con su mensaje");
assert(html.includes('id="notificationCenterCount" role="status" aria-live="polite"'), "Contador de notificaciones debe anunciar cambios");
assert(html.includes('aria-controls="notificationCenterOverlay"'), "Botones de notificaciones deben declarar el diálogo controlado");

// Notificaciones: tema semántico, teclado, foco y scroll.
assert(!style.includes("background: #faf8f4;"), "El drawer de notificaciones no debe conservar fondo claro fijo");
assert(style.includes("z-index: var(--app-z-notification, 2200)"), "Notificaciones deben usar la escala global de z-index");
assert(style.includes("height: 100dvh") && style.includes("scrollbar-color"), "Notificaciones deben usar viewport dinámico y scrollbar tematizable");
assert(notif.includes('evento.key === "Escape"') && notif.includes('evento.key !== "Tab"'), "Notificaciones deben soportar Escape y trap de foco");
assert(notif.includes("ultimoFoco") && notif.includes("foco?.isConnected"), "Notificaciones deben devolver el foco al cerrar");
assert(shell.includes("body.notification-center-open"), "Notificaciones deben bloquear el scroll del fondo");

// Diálogo compartido: dark mode, Escape, trap de foco y retorno de foco.
assert(dialog.includes('evento.key === "Escape"') && dialog.includes('evento.key !== "Tab"'), "AppDialog debe soportar Escape y trap de foco");
assert(dialog.includes("app-dialog-open") && shell.includes("body.app-dialog-open"), "AppDialog debe bloquear el scroll del fondo");
assert(dialog.includes("ultimoFoco") && dialog.includes("foco?.isConnected"), "AppDialog debe devolver el foco al cerrar");
assert(style.includes("background: var(--ds-surface, #fff)") && style.includes("--ds-control-bg"), "AppDialog y controles deben usar tokens semánticos");
assert(style.includes('html[data-theme="dark"] .admin-shift-modal input[type="time"]'), "Modal Editar horario debe tener controles oscuros explícitos");
assert(style.includes("color-scheme: dark"), "Controles nativos deben adaptarse al tema oscuro");

assert((style.match(/\.horario-cell\.turno-ausente\{/g) || []).length === 1, "No debe quedar duplicado exacto de turno ausente");
assert((style.match(/\.horario-cell\.turno-licencia\{/g) || []).length === 1, "No debe quedar duplicado exacto de turno licencia");

// Responsive y capas: no volver a 100vh ni z-index arbitrarios extremos.
for (const file of ["style.css", "app-shell.css", "design-components.css", "horarios-redesign.css", "desktop-layout.css"]) {
  const css = read(file);
  assert(!/(^|[^d])100vh\b/.test(css), `${file} conserva 100vh en vez de 100dvh`);
  assert(!/z-index\s*:\s*99999\b/.test(css), `${file} conserva z-index 99999`);
}

// PWA/cache: build final coherente, localhost sin SW, assets pesados realmente lazy.
assert(sw.includes(`const CACHE_VERSION = "autoservicio-v${build}"`), "Cache del SW no coincide con assetBuild");
assert(!sw.includes("xlsx.full.min.js"), "XLSX lazy no debe precachearse en App Shell");
assert(!sw.includes("EXTERNOS_OPCIONALES") && !sw.includes("guardarExternosOpcionales"), "ZXing lazy no debe descargarse durante instalación del SW");
assert(pwa.includes(`const SW_RUNTIME_REVISION = "${build}"`), "PWA debe registrar la revisión vigente");
const localStart = pwa.indexOf("if (esDesarrolloLocal) {");
const localReturn = pwa.indexOf("return;", localStart);
const registerPos = pwa.indexOf("navigator.serviceWorker.register", localStart);
assert(localStart >= 0 && localReturn > localStart && registerPos > localReturn, "Localhost debe salir antes de registrar Service Worker");
assert(push.includes("function esDesarrolloLocal()") && push.includes("notificaciones push se habilitan únicamente fuera de localhost"), "Push no debe esperar un SW inexistente en desarrollo local");

// Todos los assets/imports versionados mantienen una sola revisión final.
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|html|json|md)$/.test(entry.name) && entry.name !== "xlsx.full.min.js") files.push(full);
  }
}
walk(root);
const buildAnterior = ["1960", "d21", "stable1"].join("-");
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(buildAnterior)) throw new Error(`${path.relative(root, file)} conserva el build anterior stable1`);
}

console.log("Entrega 5 dark mode/notificaciones/auditoría final regression tests: OK");
