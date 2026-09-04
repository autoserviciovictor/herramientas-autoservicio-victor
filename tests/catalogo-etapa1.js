const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const db = fs.readFileSync(path.join(root, "db-catalogo-publico.js"), "utf8");
const html = fs.readFileSync(path.join(root, "catalogo", "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "catalogo", "catalogo-base.js"), "utf8");

assert(server.includes('require("./db-catalogo-publico")'), "server.js debe cargar el módulo de catálogo público");
assert(server.includes('app.get("/catalogo/api/estado"'), "falta endpoint público de estado");
assert(server.includes('app.get("/catalogo/api/rubros"'), "falta endpoint público de rubros");
assert(server.includes('app.get("/catalogo/api/productos"'), "falta endpoint público de productos");

const posPublico = server.indexOf('app.get("/catalogo/api/estado"');
const posSesionGlobal = server.indexOf("// Desde aquí, toda la API de trabajo requiere una sesión válida.");
assert(posPublico > 0 && posPublico < posSesionGlobal, "las rutas públicas deben declararse antes de la sesión global");

assert(db.includes("CREATE TABLE IF NOT EXISTS catalog_categories"), "falta tabla de rubros");
assert(db.includes("CREATE TABLE IF NOT EXISTS catalog_product_settings"), "falta configuración pública de productos");
assert(db.includes("visible BOOLEAN NOT NULL DEFAULT FALSE"), "los productos nuevos deben iniciar ocultos");
assert(db.includes("LIMIT $"), "la consulta pública debe estar paginada");
assert(db.includes("Math.min(maximo"), "el límite público debe estar acotado");

assert(html.includes("Brindamos calidad y atención"), "el eslogan oficial debe estar presente");
assert(!html.toLowerCase().includes("tu barrio"), "no debe existir el eslogan anterior");
assert(js.includes("/catalogo/api/estado"), "el shell público debe verificar la API de catálogo");

console.log("OK catalogo-etapa1: base, seguridad, paginación y ruta pública verificadas");
