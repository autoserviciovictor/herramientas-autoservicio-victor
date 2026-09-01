const fs = require("fs");
const assert = require("assert");

const front = fs.readFileSync("tareas.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const db = fs.readFileSync("db-tareas-bano.js", "utf8");

assert(front.includes('TASK_ORDER_PENDING_KEY = "autoservicio_tareas_orden_pendiente_v1"'), "Falta orden local solo-pendiente");
assert(front.includes("limpiarOrdenTareasPendienteLocal"), "El orden confirmado no se limpia del respaldo temporal");
assert(front.includes("await sincronizarOrdenTareasPendiente()"), "El arranque no reintenta un orden pendiente");
assert(front.includes("aplicarCambiosPendientesTareas"), "Una respuesta remota puede pisar cambios locales más nuevos");
assert(front.includes("changedIds"), "La edición de configuración sigue enviando toda la colección");
assert(!front.includes("guardarOrdenTareasLocal("), "Quedó activa la fuente de verdad local anterior");
assert(!front.includes('const TASK_ORDER_KEY = "autoservicio_tareas_orden_v2"'), "Quedó activa la clave vieja de orden");

for (const fn of ["guardarTareaDb", "eliminarTareasDb", "guardarAsignacionTareaDb", "eliminarAsignacionTareaDb"]) {
  assert(db.includes(`async function ${fn}`), `Falta ${fn}`);
  assert(server.includes(fn), `${fn} no está conectado al runtime`);
}
assert(!server.includes("reemplazarTareasDb"), "server.js todavía puede reemplazar toda la tabla de tareas");
assert(!db.includes('c.query("DELETE FROM tasks")'), "db-tareas-bano.js conserva el borrado masivo de tareas");
assert(db.includes("ON CONFLICT (task_id) DO UPDATE SET"), "La configuración de tareas no usa UPSERT");
assert(db.includes("ON CONFLICT (task_id,work_date,shift_type) DO UPDATE SET"), "Las asignaciones no usan UPSERT");
assert(/ON CONFLICT \(task_id\) DO UPDATE SET[\s\S]*updated_at=NOW\(\)/.test(db), "UPSERT de tarea incompleto");
assert(!/ON CONFLICT \(task_id\) DO UPDATE SET[\s\S]{0,500}sort_order=/.test(db), "Un guardado normal todavía puede pisar sort_order");

console.log("Etapa 1 estabilización de Tareas 31/08: OK");
