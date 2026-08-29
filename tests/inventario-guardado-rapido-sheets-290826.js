const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

asegurar(
  server.includes("function dispararSincronizacionInventarioSheets(limite = 25)"),
  "Debe existir un disparador no bloqueante para sincronizar Inventario con Sheets",
);
asegurar(
  server.includes("setImmediate(() =>") &&
    server.includes("sincronizarInventarioPendienteSheets({ limite }).catch"),
  "La sincronización con Sheets debe ejecutarse fuera del tiempo de respuesta",
);

const guardarInicio = server.indexOf('app.post("/guardar"');
const corregirInicio = server.indexOf('app.post("/corregir"');
const guardar = server.slice(guardarInicio, corregirInicio);
const corregir = server.slice(corregirInicio, server.indexOf('const VENCIMIENTOS_SHEET_NAME', corregirInicio));

asegurar(
  guardar.includes("dispararSincronizacionInventarioSheets(25);") &&
    !guardar.includes("await sincronizarInventarioPendienteSheets"),
  "/guardar debe responder después de PostgreSQL sin esperar Google Sheets",
);
asegurar(
  corregir.includes("dispararSincronizacionInventarioSheets(25);") &&
    !corregir.includes("await sincronizarInventarioPendienteSheets"),
  "/corregir debe responder después de PostgreSQL sin esperar Google Sheets",
);
asegurar(
  server.includes("inventory_sheet_sync") ||
    fs.readFileSync(path.join(root, "db-inventario-productos.js"), "utf8").includes("inventory_sheet_sync"),
  "Debe conservarse la cola persistente para reintentar sincronizaciones con Sheets",
);

console.log("Inventario guardado rápido + Sheets en segundo plano: OK");
