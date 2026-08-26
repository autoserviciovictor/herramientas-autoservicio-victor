const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const ignorar = new Set([".git", "node_modules"]);
const archivos = [];
function recorrer(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignorar.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) recorrer(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) archivos.push(full);
  }
}
recorrer(root);
let errores = 0;
for (const file of archivos.sort()) {
  // Parseamos por stdin con gramática ES module. Esto detecta imports y también
  // bloques huérfanos que `node --check archivo.js` puede tratar distinto según
  // el package type o el contexto CommonJS. El código CommonJS sigue siendo
  // sintácticamente válido bajo esta gramática (require queda como identificador).
  const source = fs.readFileSync(file, "utf8");
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: source,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    errores++;
    console.error(`\n[ERROR] ${path.relative(root, file)}`);
    console.error((result.stderr || result.stdout || "").trim());
  }
}
if (errores) process.exit(1);
console.log(`JavaScript syntax check: OK (${archivos.length} archivos, gramática ES module)`);
