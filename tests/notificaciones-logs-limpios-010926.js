const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  server.includes('if (["entregado", "sin_suscripcion"].includes(estado)) return;'),
  "sin_suscripcion no debe generar un warning individual por usuario",
);
assert(
  server.includes('console.info("[PUSH][VENCIMIENTOS] Resumen", {'),
  "Vencimientos debe emitir un único resumen útil por proceso",
);
for (const campo of [
  "usuariosCategoria",
  "usuariosProcesados",
  "usuariosConSuscripcion",
  "usuariosSinSuscripcion",
  "suscripcionesActivas",
  "enviados",
  "fallidos",
  "omitidosPorDedupe",
]) {
  assert(server.includes(campo), `Falta ${campo} en el resumen Push de Vencimientos`);
}
assert(
  server.includes('console.warn("[PUSH] Entrega no confirmada"'),
  "Los fallos reales de entrega deben seguir quedando visibles en Render",
);

console.log("Logs Push resumidos / sin spam 01/09: OK");
