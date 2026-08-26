const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const version = JSON.parse(read("version.json"));
const build = version.assetBuild;
assert(build && /^1960-d21-/.test(build), "version.json debe declarar assetBuild D21");
function jsAplicacion(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "tests"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) jsAplicacion(full, out);
    else if (entry.isFile() && entry.name.endsWith(".js") && entry.name !== "xlsx.full.min.js") out.push(full);
  }
  return out;
}
const imports = [];
for (const file of jsAplicacion(root)) {
  const text = fs.readFileSync(file, "utf8");
  const re = /(?:from\s*|import\s*)["']([^"']+\.js)(?:\?v=([^"']+))?["']/g;
  for (const match of text.matchAll(re)) {
    if (!match[1].startsWith(".")) continue;
    imports.push({ file: path.relative(root, file), target: match[1], version: match[2] || "" });
  }
}
assert(imports.length > 20, "Se esperaban imports ES Module del proyecto");
for (const item of imports) assert(item.version === build, `${item.file} importa ${item.target} con build '${item.version || "SIN VERSION"}', esperado '${build}'`);
const html = read("index.html");
const htmlVersions = [...html.matchAll(/\?v=([^"']+)/g)].map((m) => m[1]);
assert(htmlVersions.length > 10 && htmlVersions.every((v) => v === build), "index.html mezcla versiones de assets");
const sw = read("service-worker.js");
assert(sw.includes(`const CACHE_VERSION = "autoservicio-v${build}"`), "Cache del SW no coincide con assetBuild");
const swVersions = [...sw.matchAll(/\?v=([^"']+)/g)].map((m) => m[1]);
assert(swVersions.length > 10 && swVersions.every((v) => v === build), "Service Worker mezcla builds en App Shell");
const pwa = read("pwa.js");
assert(pwa.includes(`const SW_RUNTIME_REVISION = "${build}"`), "PWA runtime revision no coincide con assetBuild");
const localStart = pwa.indexOf("if (esDesarrolloLocal) {");
const registerPos = pwa.indexOf("navigator.serviceWorker.register", localStart);
const localReturn = pwa.indexOf("return;", localStart);
assert(localStart >= 0 && localReturn > localStart && registerPos > localReturn, "En localhost debe salir antes de registrar el Service Worker");
assert(pwa.includes("Service Worker desactivado en desarrollo local."), "Falta señal de SW desactivado en local");
const scanner = read("scanner.js");
assert(scanner.includes("async function asegurarZXing()") && scanner.includes("await asegurarZXing()"), "ZXing debe cargarse bajo demanda");
assert(!html.includes("@zxing/library@0.23.0/umd/index.min.js"), "ZXing no debe bloquear HTML inicial");
const admin = read("admin.js");
assert(admin.includes("async function asegurarXLSX()") && admin.includes("await asegurarXLSX()"), "XLSX debe cargarse bajo demanda");
assert(!html.includes('<script src="./xlsx.full.min.js'), "XLSX no debe cargarse al inicio");
const repo = read("reposicion.js");
assert(repo.includes("#repoFab") && repo.includes("abrirSelectorCarga()") && repo.includes("repoMobileLoadMenu"), "Debe conservarse flujo del FAB de Mi lista");
console.log(`D21 estabilidad/cache regression tests: OK (${imports.length} imports, build ${build})`);
