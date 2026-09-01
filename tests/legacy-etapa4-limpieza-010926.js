const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");

const funcionesLegacy = [
  "asegurarHojaUsuarios",
  "filaAUsuario",
  "obtenerProductosLegacy",
  "obtenerProductosMaestrosLegacy",
  "asegurarHojaOperacionesOffline",
  "buscarOperacionOffline(id, usuario)",
  "asegurarHojaHistorialAdministracion",
  "asegurarHojaSectores",
  "asegurarHojasHorariosLegacy",
  "asegurarHojaAuditoriaHorariosLegacy",
  "leerBanoLegacy",
  "obtenerTareasLegacy",
  "eliminarFilaDeHoja",
  "eliminarRegistrosSector",
  "obtenerVencimientosLegacy",
  "asegurarHojasNotificaciones",
  "encolarEscrituraNotificaciones",
  "asegurarHojaHistorialVencimientos",
  "registroAFilaReposicion",
  "obtenerListasReposicionLegacy",
  "obtenerAuxiliaresLegacy",
  "asegurarHojaTareas",
  "asegurarHojaBano",
  "asegurarHojaVencimientos",
  "asegurarHojaListas",
  "leerRangoAuxiliarLegacy",
];

for (const nombre of funcionesLegacy) {
  assert(!server.includes(nombre), `Etapa 4: reapareció código legacy: ${nombre}`);
}

const constantesLegacy = [
  "AUTO_MIGRATE_SHEETS",
  "USUARIOS_SHEET_NAME",
  "SECTORES_SHEET_NAME",
  "AUDITORIA_HORARIOS_SHEET_NAME",
  "CALENDARIO_HORARIOS_SHEET_NAME",
  "TURNOS_HORARIOS_SHEET_NAME",
  "ORDEN_HORARIOS_SHEET_NAME",
  "DETALLES_HORARIOS_SHEET_NAME",
  "REEMPLAZOS_HORARIOS_SHEET_NAME",
  "HISTORIAL_VENCIMIENTOS_SHEET_NAME",
  "HISTORIAL_ADMIN_SHEET_NAME",
  "PUSH_SUBSCRIPTIONS_SHEET_NAME",
  "NOTIFICATION_LOG_SHEET_NAME",
  "NOTIFICATION_CENTER_SHEET_NAME",
  "OFFLINE_OPERATIONS_SHEET_NAME",
  "TAREAS_SHEET_NAME",
  "TAREAS_BANO_SHEET_NAME",
  "VENCIMIENTOS_SHEET_NAME",
  "PRODUCTOS_SHEET_NAME",
];
for (const nombre of constantesLegacy) {
  assert(!server.includes(nombre), `Etapa 4: reapareció constante legacy: ${nombre}`);
}

assert(server.includes('const SHEET_NAME = "Stock"'), "Etapa 4: Inventario debe conservar únicamente la hoja Stock para Toro");
assert(server.includes("INVENTORY_SHEETS_CONFIGURED"), "Etapa 4: debe conservarse la integración operativa de Inventario con Sheets");
assert(server.includes("PostgreSQL es la fuente canónica de datos"), "Etapa 4: debe quedar explícita la fuente canónica PostgreSQL");
assert(!server.includes("Señales históricas conservadas para la suite de regresión"), "Etapa 4: los tests no deben exigir comentarios históricos");

console.log("Etapa 4 limpieza legacy: OK");
