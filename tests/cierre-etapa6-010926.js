const fs = require('fs');
const assert = require('assert');
const path = require('path');

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const version = JSON.parse(read('version.json'));
const build = version.assetBuild;

assert.strictEqual(version.date, '2026-09-01', 'la fecha de release debe corresponder al cierre de Etapa 6');
assert(build.includes('cierre-etapa6-010926'), 'assetBuild debe identificar el cierre de Etapa 6');
assert(read('config.js').includes(`APP_ASSET_BUILD = "${build}"`), 'config.js debe usar el build de version.json');
assert(read('pwa.js').includes(`SW_RUNTIME_REVISION = "${build}"`), 'PWA debe usar el mismo build');
assert(read('service-worker.js').includes(`CACHE_VERSION = "autoservicio-v${build}"`), 'Service Worker debe usar el mismo build');

const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|html|css)$/.test(entry.name) && !full.includes(`${path.sep}tests${path.sep}`)) sourceFiles.push(full);
  }
}
walk(root);
const oldBuild = '1960-d21-limpieza-controlada-270826-a';
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  assert(!text.includes(oldBuild), `no debe quedar el build viejo en ${path.relative(root, file)}`);
}

const server = read('server.js');
assert(server.includes('const ES_PRODUCCION = process.env.NODE_ENV === "production";'), 'debe existir modo producción explícito');
assert(server.includes('(!ES_PRODUCCION && ALLOWED_ORIGINS.length === 0)'), 'CORS abierto sin lista solo debe permitirse fuera de producción');
assert(server.includes('Producción requiere ALLOWED_ORIGINS configurado'), 'producción debe fallar si ALLOWED_ORIGINS no está configurado');

const pkg = JSON.parse(read('package.json'));
assert(pkg.scripts['test:e2e'], 'debe existir comando opcional test:e2e');
console.log('Cierre Etapa 6 regression tests: OK');
