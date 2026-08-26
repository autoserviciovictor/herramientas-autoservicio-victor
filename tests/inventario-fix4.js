const fs=require("fs"); const assert=require("assert");
const server=fs.readFileSync("server.js","utf8"); const ui=fs.readFileSync("ui.js","utf8");
assert(server.includes("const stockHoja = numero(fila[2])"));
assert(server.includes("stock: Math.max(stockHoja, stockUbicaciones)"));
assert(server.includes("producto.stock = numero(producto.stock) + cantidadNumerica"));
assert(server.includes("actualizarProducto(producto, { recalcularTotal: true })"));
assert(ui.includes("const unidadesTotales = productosCargados.reduce"));
assert(ui.includes("inventarioMetricaUnidades.textContent = unidadesTotales"));
console.log("Inventario fix4 regression tests: OK");
