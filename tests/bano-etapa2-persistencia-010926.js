const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");
const db = fs.readFileSync("db-tareas-bano.js", "utf8");

assert(!db.includes("DELETE FROM bathroom_rotation_history"), "Etapa 2: no debe existir borrado total del historial de Baño");
assert(!server.includes("guardarBanoServidor("), "Etapa 2: no debe quedar activo el guardado completo legacy de Baño");
assert(!db.includes("async function guardarBanoDb("), "Etapa 2: no debe quedar activa la función legacy guardarBanoDb");
assert(db.includes("async function guardarConfiguracionBanoDb("), "Etapa 2: falta guardado puntual de configuración");
assert(db.includes("async function guardarRegistroBanoDb("), "Etapa 2: falta UPSERT puntual del historial");
assert(db.includes("ON CONFLICT(work_date) DO UPDATE SET"), "Etapa 2: el historial debe persistirse mediante UPSERT por fecha");
assert(server.includes("await guardarConfiguracionBanoServidor("), "Etapa 2: configuración de Baño no usa la escritura incremental");
assert((server.match(/await guardarRegistroBanoServidor\(registro, req\.usuario, cliente\);/g) || []).length === 2, "Etapa 2: confirmar y verificar deben persistir solo el registro modificado");
assert(server.includes("actual.historial = completarHistorialBano(actual);"), "Etapa 2: la respuesta debe conservar el historial virtual completo");

console.log("Baño Etapa 2 persistencia incremental regression tests: OK");
