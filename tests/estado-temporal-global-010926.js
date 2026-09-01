const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const prices = fs.readFileSync(path.join(root, "prices.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  app.includes("function reiniciarEstadoTemporalAplicacion()"),
  "Debe existir un reinicio global del estado temporal",
);
assert(
  app.includes('if (!event.detail?.usuario) {\n      reiniciarEstadoTemporalAplicacion();\n      return;'),
  "Cerrar sesión debe reiniciar la interfaz antes de restaurar navegación",
);
assert(
  app.includes('sessionStorage.removeItem("autoservicio_admin_vista")'),
  "La subvista de Administración no debe sobrevivir al cierre de sesión",
);
assert(
  app.includes('history.replaceState(state, "", location.pathname)'),
  "Cerrar sesión debe reemplazar el historial por Inicio y quitar deep-links temporales",
);
assert(
  app.includes('cerrarCargaInventario();') && app.includes('cerrarCargaVencimientosModal();') && app.includes('cerrarModalVencimiento();'),
  "Inventario y Vencimientos deben cerrar cargas/detalles al abandonar el módulo",
);

assert(
  !prices.includes("autoservicio-precios-ultimo-v3") && !prices.includes("leerUltimo()"),
  "El último producto consultado no debe persistirse como estado de pantalla",
);
assert(
  prices.includes("renderUltimo(null);") && prices.includes("RECENT_KEY_BASE"),
  "Consulta de precios debe limpiar el resultado actual sin borrar el historial útil",
);

assert(
  admin.includes("cerrarUsuarioModalDirecto();") &&
    admin.includes("cerrarSectorModalDirecto();") &&
    admin.includes("cerrarVistaPreviaImportacion();"),
  "Administración debe cerrar modales temporales al salir",
);
assert(
  admin.includes('"adminUsuariosBuscar"') &&
    admin.includes('"adminSectoresBuscar"') &&
    admin.includes('input.value = "todos"'),
  "Administración debe reiniciar búsquedas y filtros temporales",
);

console.log("Estado temporal global / cierre de sesión 01/09: OK");
