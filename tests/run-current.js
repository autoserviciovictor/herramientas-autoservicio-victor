const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Estas pruebas históricas verifican implementaciones que fueron reemplazadas
// por PostgreSQL o por el layout actual. Se conservan como documentación, pero
// no forman parte de la suite vigente.
const HISTORICAS = new Set([
  "auditoria-correcciones-260826.js",
  "auditoria-mobile-etapa2.js",
  "correcciones-240824.js",
  "cuota-sheets-guardar-260826.js",
  "db-etapa5-inventario-productos-hardening.js",
  "inventario-fix4.js",
  "inventario-fix5.js",
  "inventario-sheets-toro-290826.js",
  "tareas-ancho-titulo.js",
]);
const EXCLUIDAS = new Set(["run-current.js", "run-catalogo-current.js", "check-js.js", "e2e-browser-etapa6.js", ...HISTORICAS]);
const archivos = fs.readdirSync(__dirname)
  .filter((nombre) => nombre.endsWith(".js") && !EXCLUIDAS.has(nombre))
  .sort();

let fallas = 0;
for (const nombre of archivos) {
  const resultado = spawnSync(process.execPath, [path.join(__dirname, nombre)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    stdio: "pipe",
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (resultado.status !== 0) {
    fallas++;
    const detalle = resultado.error?.code === "ETIMEDOUT" ? " (timeout 20s)" : "";
    console.error(`\nFAIL ${nombre}${detalle}`);
    process.stderr.write(resultado.stdout || "");
    process.stderr.write(resultado.stderr || "");
  }
}
if (fallas) {
  console.error(`\nSuite vigente: ${fallas} prueba(s) fallaron de ${archivos.length}.`);
  process.exit(1);
}
console.log(`Suite vigente: OK (${archivos.length} pruebas).`);
