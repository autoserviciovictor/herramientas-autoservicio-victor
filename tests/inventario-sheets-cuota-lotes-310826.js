const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const db = fs.readFileSync(path.join(root, "db-inventario-productos.js"), "utf8");

function ok(v, m) { if (!v) throw new Error(m); }

ok(server.includes("async function mapaFilasInventarioSheets()"), "Debe existir una única lectura del mapa de filas por lote");
ok(server.includes('range: `${SHEET_NAME}!A2:A`'), "El lote debe leer la columna de códigos una vez");
ok(!server.includes("async function buscarFilaProductoInventarioSheets"), "No deben quedar lecturas de Sheets por producto");
ok(server.includes("sheets.spreadsheets.values.batchUpdate"), "Los productos existentes deben escribirse con batchUpdate");
ok(/values\.append\([\s\S]*nuevos\.map\(valoresInventarioParaSheets\)/.test(server), "Las altas deben agruparse en un único append");
ok(server.includes("inventarioSheetsBloqueadoHasta"), "Debe existir enfriamiento ante cuota de Google Sheets");
ok(server.includes("activarEsperaCuotaInventarioSheets"), "Debe activarse backoff cuando Google devuelve cuota/rate limit");
ok(server.includes("temporizadorInventarioSheets"), "Las cargas rápidas deben agruparse con debounce");
ok(server.includes("}, 1800);"), "El debounce debe permitir agrupar varios escaneos cercanos");
ok(db.includes("SET legacy_row=NULL"), "Debe liberarse una fila legacy vieja antes de reasignarla");
ok(db.includes("WHERE legacy_row=$2 AND inventory_id<>$1"), "La reparación legacy debe afectar solo al dueño anterior de esa fila");
ok(db.includes("return conTransaccionInventarioProductos(ejecutar)"), "La reasignación de fila debe ser transaccional");

console.log("Inventario Sheets lotes/cuota/legacy_row: OK");
