const { query, obtenerPool } = require("./db");

const BLOQUEO_TAREAS_BANO = "autoservicio-victor:tareas-bano";
let esquemaAsegurado = false;
let promesaEsquema = null;

async function asegurarEsquemaTareasBano() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;

  promesaEsquema = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      sector_key TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 10 CHECK(duration_min BETWEEN 1 AND 480),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      weekdays JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
      updated_text TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await query(`CREATE TABLE IF NOT EXISTS task_assignments (
      task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
      work_date TEXT NOT NULL,
      shift_type TEXT NOT NULL CHECK(shift_type IN ('manana','tarde')),
      responsibles JSONB NOT NULL DEFAULT '[]'::jsonb,
      state TEXT NOT NULL DEFAULT 'pendiente',
      completed_by TEXT NOT NULL DEFAULT '',
      completed_time TEXT NOT NULL DEFAULT '',
      extra JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(task_id, work_date, shift_type)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS bathroom_rotation_config (
      config_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(config_id = 1),
      participants JSONB NOT NULL DEFAULT '[]'::jsonb,
      anchor_date TEXT NOT NULL,
      updated_text TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await query(`CREATE TABLE IF NOT EXISTS bathroom_rotation_history (
      work_date TEXT PRIMARY KEY,
      responsible_key TEXT NOT NULL DEFAULT '',
      confirmed_by TEXT NOT NULL DEFAULT '',
      confirmed_time TEXT NOT NULL DEFAULT '',
      verified_by TEXT NOT NULL DEFAULT '',
      verified_time TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`ALTER TABLE bathroom_rotation_history ADD COLUMN IF NOT EXISTS responsible_key TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE bathroom_rotation_history ADD COLUMN IF NOT EXISTS verified_by TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE bathroom_rotation_history ADD COLUMN IF NOT EXISTS verified_time TEXT NOT NULL DEFAULT ''`);

    await query(`CREATE INDEX IF NOT EXISTS tasks_sector_idx ON tasks(sector_key, active)`);
    await query(`CREATE INDEX IF NOT EXISTS task_assignments_date_idx ON task_assignments(work_date, shift_type)`);
    await query(`CREATE INDEX IF NOT EXISTS bathroom_history_updated_idx ON bathroom_rotation_history(updated_at DESC)`);
    esquemaAsegurado = true;
  })();

  try {
    await promesaEsquema;
  } finally {
    promesaEsquema = null;
  }
}

async function conTransaccionTareasBano(callback) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext($1))", [BLOQUEO_TAREAS_BANO]);
    const resultado = await callback(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    try { await cliente.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    cliente.release();
  }
}

function ejecutarConsulta(cliente, texto, parametros = []) {
  return cliente ? cliente.query(texto, parametros) : query(texto, parametros);
}

function limpiarDias(dias) {
  const lista = Array.isArray(dias) ? dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  return lista.length ? [...new Set(lista)] : [0,1,2,3,4,5,6];
}

function limpiarAsignacion(valor) {
  const a = valor && typeof valor === "object" ? valor : {};
  const listaResponsables = Array.isArray(a.responsables)
    ? a.responsables
    : typeof a.responsables === "string"
      ? a.responsables.split(",")
      : [];
  const responsables = [...new Set(listaResponsables.map((x) => String(x || "").trim()).filter(Boolean))];
  const extra = { ...a };
  delete extra.responsables;
  delete extra.estado;
  delete extra.completadaPor;
  delete extra.completadaHora;
  return {
    responsables,
    estado: String(a.estado || "pendiente").trim() || "pendiente",
    completadaPor: String(a.completadaPor || "").trim(),
    completadaHora: String(a.completadaHora || "").trim(),
    extra,
  };
}

async function insertarTarea(cliente, tarea, actualizadoTexto = "", actualizadoPor = "") {
  const id = String(tarea?.id || "").trim();
  if (!id) return;
  await cliente.query(
    `INSERT INTO tasks(task_id,sector_key,name,duration_min,active,weekdays,updated_text,updated_by)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
    [
      id,
      String(tarea?.sector || "General").trim() || "General",
      String(tarea?.nombre || "Tarea").trim() || "Tarea",
      Math.max(1, Math.min(480, Number(tarea?.duracionMin || tarea?.duracion || 10) || 10)),
      tarea?.activo !== false,
      JSON.stringify(limpiarDias(tarea?.diasSemana)),
      actualizadoTexto,
      actualizadoPor,
    ],
  );

  const asignaciones = tarea?.asignaciones && typeof tarea.asignaciones === "object" ? tarea.asignaciones : {};
  for (const [fecha, turnos] of Object.entries(asignaciones)) {
    if (!turnos || typeof turnos !== "object") continue;
    for (const turno of ["manana", "tarde"]) {
      if (turnos[turno] == null) continue;
      const a = limpiarAsignacion(turnos[turno]);
      await cliente.query(
        `INSERT INTO task_assignments(task_id,work_date,shift_type,responsibles,state,completed_by,completed_time,extra)
         VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb)`,
        [id, String(fecha), turno, JSON.stringify(a.responsables), a.estado, a.completadaPor, a.completadaHora, JSON.stringify(a.extra)],
      );
    }
  }
}

async function importarTareasBanoAtomico(datos, claveMigracion) {
  return conTransaccionTareasBano(async (cliente) => {
    const ya = await cliente.query("SELECT 1 FROM app_data_migrations WHERE migration_key=$1", [claveMigracion]);
    if (ya.rowCount) return false;

    for (const tarea of datos?.tareas || []) {
      await insertarTarea(cliente, tarea, tarea.actualizadoTexto || "", tarea.actualizadoPor || "");
    }

    const bano = datos?.bano || {};
    await cliente.query(
      `INSERT INTO bathroom_rotation_config(config_id,participants,anchor_date,updated_text,updated_by)
       VALUES(1,$1::jsonb,$2,$3,$4)
       ON CONFLICT (config_id) DO NOTHING`,
      [JSON.stringify(Array.isArray(bano.participantes) ? bano.participantes : []), String(bano.fechaAncla || ""), String(bano.actualizadoTexto || ""), String(bano.actualizadoPor || "")],
    );
    for (const item of Array.isArray(bano.historial) ? bano.historial : []) {
      const fecha = String(item?.fecha || "").trim();
      if (!fecha) continue;
      await cliente.query(
        `INSERT INTO bathroom_rotation_history(work_date,responsible_key,confirmed_by,confirmed_time,verified_by,verified_time,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (work_date) DO NOTHING`,
        [
          fecha,
          String(item?.responsable || item?.responsableClave || "").trim(),
          String(item?.usuario || "").trim(),
          String(item?.hora || "").trim(),
          String(item?.supervisadoPor || item?.verificadoPor || "").trim(),
          String(item?.horaVerificacion || "").trim(),
          String(bano.actualizadoPor || ""),
        ],
      );
    }

    await cliente.query(
      `INSERT INTO app_data_migrations(migration_key,details)
       VALUES($1,$2::jsonb) ON CONFLICT (migration_key) DO NOTHING`,
      [claveMigracion, JSON.stringify({ tareas: (datos?.tareas || []).length, historialBano: (bano.historial || []).length })],
    );
    return true;
  });
}

async function listarTareasDb(cliente = null) {
  const [rt, ra] = await Promise.all([
    ejecutarConsulta(cliente, `SELECT task_id,sector_key,name,duration_min,active,weekdays FROM tasks ORDER BY task_id`),
    ejecutarConsulta(cliente, `SELECT task_id,work_date,shift_type,responsibles,state,completed_by,completed_time,extra FROM task_assignments ORDER BY task_id,work_date,shift_type`),
  ]);
  const mapa = new Map(rt.rows.map((x) => [x.task_id, {
    id: x.task_id,
    sector: x.sector_key,
    nombre: x.name,
    duracionMin: Number(x.duration_min),
    activo: Boolean(x.active),
    diasSemana: limpiarDias(x.weekdays),
    asignaciones: {},
  }]));
  for (const x of ra.rows) {
    const tarea = mapa.get(x.task_id);
    if (!tarea) continue;
    tarea.asignaciones[x.work_date] = tarea.asignaciones[x.work_date] || {};
    tarea.asignaciones[x.work_date][x.shift_type] = {
      ...(x.extra && typeof x.extra === "object" ? x.extra : {}),
      responsables: Array.isArray(x.responsibles) ? x.responsibles : [],
      estado: x.state || "pendiente",
      completadaPor: x.completed_by || "",
      completadaHora: x.completed_time || "",
    };
  }
  return [...mapa.values()];
}

async function reemplazarTareasDb(tareas, actualizadoTexto = "", actualizadoPor = "", cliente = null) {
  const ejecutar = async (c) => {
    await c.query("DELETE FROM tasks");
    for (const tarea of tareas || []) await insertarTarea(c, tarea, actualizadoTexto, actualizadoPor);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionTareasBano(ejecutar);
}

async function leerBanoDb(cliente = null) {
  const [rc, rh] = await Promise.all([
    ejecutarConsulta(cliente, `SELECT participants,anchor_date FROM bathroom_rotation_config WHERE config_id=1`),
    ejecutarConsulta(cliente, `SELECT work_date,responsible_key,confirmed_by,confirmed_time,verified_by,verified_time FROM bathroom_rotation_history ORDER BY work_date DESC, updated_at DESC`),
  ]);
  const config = rc.rows[0] || {};
  return {
    participantes: Array.isArray(config.participants) ? config.participants : [],
    fechaAncla: config.anchor_date || new Date().toISOString().slice(0,10),
    historial: rh.rows.map((x) => ({
      fecha: x.work_date,
      responsable: x.responsible_key || "",
      usuario: x.confirmed_by || "",
      hora: x.confirmed_time || "",
      supervisadoPor: x.verified_by || "",
      horaVerificacion: x.verified_time || "",
    })),
  };
}

async function guardarBanoDb(config, actualizadoTexto = "", actualizadoPor = "", cliente = null) {
  const ejecutar = async (c) => {
    const participantes = [...new Set((config?.participantes || []).map((x) => String(x || "").trim()).filter(Boolean))];
    const fechaAncla = String(config?.fechaAncla || "").trim() || new Date().toISOString().slice(0,10);
    await c.query(
      `INSERT INTO bathroom_rotation_config(config_id,participants,anchor_date,updated_text,updated_by,updated_at)
       VALUES(1,$1::jsonb,$2,$3,$4,NOW())
       ON CONFLICT(config_id) DO UPDATE SET participants=EXCLUDED.participants,anchor_date=EXCLUDED.anchor_date,updated_text=EXCLUDED.updated_text,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [JSON.stringify(participantes), fechaAncla, actualizadoTexto, actualizadoPor],
    );
    await c.query("DELETE FROM bathroom_rotation_history");
    for (const item of Array.isArray(config?.historial) ? config.historial : []) {
      const fecha = String(item?.fecha || "").trim();
      if (!fecha) continue;
      await c.query(
        `INSERT INTO bathroom_rotation_history(work_date,responsible_key,confirmed_by,confirmed_time,verified_by,verified_time,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(work_date) DO UPDATE SET
           responsible_key=EXCLUDED.responsible_key,
           confirmed_by=EXCLUDED.confirmed_by,
           confirmed_time=EXCLUDED.confirmed_time,
           verified_by=EXCLUDED.verified_by,
           verified_time=EXCLUDED.verified_time,
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()`,
        [
          fecha,
          String(item?.responsable || item?.responsableClave || "").trim(),
          String(item?.usuario || "").trim(),
          String(item?.hora || "").trim(),
          String(item?.supervisadoPor || item?.verificadoPor || "").trim(),
          String(item?.horaVerificacion || "").trim(),
          actualizadoPor,
        ],
      );
    }
    return { participantes, fechaAncla, historial: Array.isArray(config?.historial) ? config.historial : [] };
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionTareasBano(ejecutar);
}

module.exports = {
  BLOQUEO_TAREAS_BANO,
  asegurarEsquemaTareasBano,
  conTransaccionTareasBano,
  importarTareasBanoAtomico,
  listarTareasDb,
  reemplazarTareasDb,
  leerBanoDb,
  guardarBanoDb,
};
