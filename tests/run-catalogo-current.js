const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const archivos = fs.readdirSync(__dirname)
  .filter((nombre) => /^catalogo-.*\.js$/.test(nombre))
  .filter((nombre) => nombre !== 'run-catalogo-current.js')
  .sort();

let fallas = 0;
for (const nombre of archivos) {
  const resultado = spawnSync(process.execPath, [path.join(__dirname, nombre)], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: 'pipe', timeout: 20000,
  });
  if (resultado.status !== 0) {
    fallas++;
    console.error(`\nFAIL ${nombre}`);
    process.stderr.write(resultado.stdout || '');
    process.stderr.write(resultado.stderr || '');
  }
}
if (fallas) {
  console.error(`\nSuite Catálogo: ${fallas} prueba(s) fallaron de ${archivos.length}.`);
  process.exit(1);
}
console.log(`Suite Catálogo: OK (${archivos.length} pruebas).`);
