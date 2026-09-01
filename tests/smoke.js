const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};

const server = read("server.js");
const auth = read("auth.js");
const app = read("app.js");
const sw = read("service-worker.js");
const style = read("style.css");

assert(server.includes('const APP_VERSION = "19.6.0"'), "server version");
assert(
  !server.includes("limpiarVencimientosAntiguos"),
  "no destructive expiry cleanup",
);
assert(
  server.includes('requerirAlgunModulo("vencimientos")'),
  "expiry permission middleware",
);
assert(
  server.includes("reservarOperacionOfflineDb") && server.includes("finalizarOperacionOfflineDb"),
  "offline idempotency PostgreSQL",
);
assert(
  auth.includes("usuario: usuarioActual.usuario"),
  "offline queue bound to user",
);
assert(auth.includes("cacheOfflineKey"), "offline cache bound to user");
assert(app.includes("escapeHTML(item.articulo"), "expiry dynamic HTML escaped");
assert(
  !style.includes("AUTOSERVICIOAPP · V19 — VENCIMIENTOS REFERENCIA APROBADA"),
  "legacy expiry CSS removed",
);
assert(
  !/\\?v=(?!1960)\\d+/.test(
    [auth, app, sw].join(
      "\
",
    ),
  ),
  "cache versions unified",
);
console.log("V19.6 smoke tests: OK");
