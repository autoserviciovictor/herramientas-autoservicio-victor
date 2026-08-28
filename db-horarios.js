const { query, obtenerPool } = require("./db");

const BLOQUEO_HORARIOS = "autoservicio-victor:horarios";
let esquemaAsegurado = false;
let promesaEsquema = null;

async function asegurarEsquemaHorarios() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;

  promesaEsquema = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS schedule_shifts (
      sector_id TEXT NOT NULL,
      shift_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#64748b',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_text TEXT NOT NULL DEFAULT '',
      shift_type TEXT NOT NULL DEFAULT 'continuo',
      second_start_time TEXT NOT NULL DEFAULT '',
      second_end_time TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sector_id, shift_id)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS schedule_calendar (
      sector_id TEXT NOT NULL,
      month_key CHAR(7) NOT NULL,
      employee TEXT NOT NULL,
      day_num SMALLINT NOT NULL CHECK(day_num BETWEEN 1 AND 31),
      shift_value TEXT NOT NULL,
      updated_text TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_by_name TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sector_id, month_key, employee, day_num)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS schedule_details (
      sector_id TEXT NOT NULL,
      month_key CHAR(7) NOT NULL,
      employee TEXT NOT NULL,
      day_num SMALLINT NOT NULL CHECK(day_num BETWEEN 1 AND 31),
      detail_type TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      observation TEXT NOT NULL DEFAULT '',
      updated_text TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sector_id, month_key, employee, day_num)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS schedule_replacements (
      id BIGSERIAL PRIMARY KEY,
      sector_id TEXT NOT NULL,
      month_key CHAR(7) NOT NULL,
      original_employee TEXT NOT NULL,
      replacement_employee TEXT NOT NULL,
      date_from TEXT NOT NULL DEFAULT '',
      date_to TEXT NOT NULL DEFAULT '',
      observation TEXT NOT NULL DEFAULT '',
      updated_text TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await query(`CREATE TABLE IF NOT EXISTS schedule_personnel_order (
      sector_id TEXT NOT NULL,
      employee TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_text TEXT NOT NULL DEFAULT '',
      calendar_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sector_id, employee)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS schedule_audit (
      id BIGSERIAL PRIMARY KEY,
      occurred_text TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      user_role TEXT NOT NULL DEFAULT '',
      sector_name TEXT NOT NULL DEFAULT '',
      month_key TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await query(`CREATE INDEX IF NOT EXISTS schedule_calendar_sector_month_idx ON schedule_calendar(sector_id, month_key)`);
    await query(`CREATE INDEX IF NOT EXISTS schedule_details_sector_month_idx ON schedule_details(sector_id, month_key)`);
    await query(`CREATE INDEX IF NOT EXISTS schedule_order_sector_idx ON schedule_personnel_order(sector_id, sort_order)`);
    await query(`CREATE INDEX IF NOT EXISTS schedule_audit_created_idx ON schedule_audit(created_at DESC)`);

    esquemaAsegurado = true;
  })();

  try {
    await promesaEsquema;
  } finally {
    promesaEsquema = null;
  }
}

async function conTransaccionHorarios(callback) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext($1))", [BLOQUEO_HORARIOS]);
    const resultado = await callback(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch (_) {}
    throw error;
  } finally {
    cliente.release();
  }
}

function ejecutarConsulta(cliente, texto, parametros = []) {
  return cliente ? cliente.query(texto, parametros) : query(texto, parametros);
}

async function importarHorariosAtomico(datos, claveMigracion) {
  return conTransaccionHorarios(async (cliente) => {
    const ya = await cliente.query(
      "SELECT 1 FROM app_data_migrations WHERE migration_key=$1",
      [claveMigracion],
    );
    if (ya.rowCount) return false;

    for (const f of datos.turnos || []) {
      await cliente.query(
        `INSERT INTO schedule_shifts(sector_id,shift_id,start_time,end_time,color,active,updated_text,shift_type,second_start_time,second_end_time)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        f,
      );
    }
    for (const f of datos.calendario || []) {
      await cliente.query(
        `INSERT INTO schedule_calendar(sector_id,month_key,employee,day_num,shift_value,updated_text,updated_by,updated_by_name)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        f,
      );
    }
    for (const f of datos.detalles || []) {
      await cliente.query(
        `INSERT INTO schedule_details(sector_id,month_key,employee,day_num,detail_type,reason,observation,updated_text,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        f,
      );
    }
    for (const f of datos.reemplazos || []) {
      await cliente.query(
        `INSERT INTO schedule_replacements(sector_id,month_key,original_employee,replacement_employee,date_from,date_to,observation,updated_text,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        f,
      );
    }
    for (const f of datos.orden || []) {
      await cliente.query(
        `INSERT INTO schedule_personnel_order(sector_id,employee,sort_order,updated_text,calendar_enabled)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        f,
      );
    }
    for (const f of datos.auditoria || []) {
      await registrarAuditoriaFilas([f], cliente);
    }

    await cliente.query(
      `INSERT INTO app_data_migrations(migration_key,details)
       VALUES($1,$2::jsonb) ON CONFLICT (migration_key) DO NOTHING`,
      [
        claveMigracion,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(datos).map(([k, v]) => [k, (v || []).length]),
          ),
        ),
      ],
    );
    return true;
  });
}

async function listarTurnosFilas(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT sector_id,shift_id,start_time,end_time,color,active,updated_text,shift_type,second_start_time,second_end_time
     FROM schedule_shifts ORDER BY sector_id,shift_id`,
  );
  return r.rows.map((x) => [
    x.sector_id,
    x.shift_id,
    x.start_time,
    x.end_time,
    x.color,
    x.active ? "Sí" : "No",
    x.updated_text,
    x.shift_type,
    x.second_start_time,
    x.second_end_time,
  ]);
}

async function reemplazarTurnosSector(sector, filas) {
  return conTransaccionHorarios(async (cliente) => {
    await cliente.query("DELETE FROM schedule_shifts WHERE sector_id=$1", [sector]);
    for (const f of filas) {
      await cliente.query(
        `INSERT INTO schedule_shifts(sector_id,shift_id,start_time,end_time,color,active,updated_text,shift_type,second_start_time,second_end_time)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          f[0], f[1], f[2], f[3], f[4],
          String(f[5]).toLowerCase() !== "no",
          f[6] || "", f[7] || "continuo", f[8] || "", f[9] || "",
        ],
      );
    }
  });
}

async function listarCalendarioFilas(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT sector_id,month_key,employee,day_num,shift_value,updated_text,updated_by,updated_by_name
     FROM schedule_calendar ORDER BY sector_id,month_key,employee,day_num`,
  );
  return r.rows.map((x) => [
    x.sector_id, x.month_key, x.employee, x.day_num, x.shift_value,
    x.updated_text, x.updated_by, x.updated_by_name,
  ]);
}

async function listarDetallesFilas(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT sector_id,month_key,employee,day_num,detail_type,reason,observation,updated_text,updated_by
     FROM schedule_details ORDER BY sector_id,month_key,employee,day_num`,
  );
  return r.rows.map((x) => [
    x.sector_id, x.month_key, x.employee, x.day_num, x.detail_type,
    x.reason, x.observation, x.updated_text, x.updated_by,
  ]);
}

async function reemplazarCalendarioDetallesPorAlcances(
  calendario,
  detalles,
  alcances,
  cliente,
) {
  if (!cliente) throw new Error("La escritura de calendario requiere una transacción de Horarios");

  const unicos = [...new Map(
    (alcances || [])
      .filter((x) => x && x.sector && x.mes)
      .map((x) => [`${x.sector}||${x.mes}`, { sector: x.sector, mes: x.mes }]),
  ).values()];

  for (const alcance of unicos) {
    await cliente.query(
      "DELETE FROM schedule_calendar WHERE sector_id=$1 AND month_key=$2",
      [alcance.sector, alcance.mes],
    );
    await cliente.query(
      "DELETE FROM schedule_details WHERE sector_id=$1 AND month_key=$2",
      [alcance.sector, alcance.mes],
    );
  }

  const permitidos = new Set(unicos.map((x) => `${x.sector}||${x.mes}`));
  for (const f of calendario) {
    if (!permitidos.has(`${f[0]}||${f[1]}`)) continue;
    await cliente.query(
      `INSERT INTO schedule_calendar(sector_id,month_key,employee,day_num,shift_value,updated_text,updated_by,updated_by_name)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      f,
    );
  }
  for (const f of detalles) {
    if (!permitidos.has(`${f[0]}||${f[1]}`)) continue;
    await cliente.query(
      `INSERT INTO schedule_details(sector_id,month_key,employee,day_num,detail_type,reason,observation,updated_text,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      f,
    );
  }
}

async function listarOrdenFilas(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT sector_id,employee,sort_order,updated_text,calendar_enabled
     FROM schedule_personnel_order ORDER BY sector_id,sort_order,employee`,
  );
  return r.rows.map((x) => [
    x.sector_id,
    x.employee,
    x.sort_order,
    x.updated_text,
    x.calendar_enabled ? "Sí" : "No",
  ]);
}

async function reemplazarOrdenSector(sector, filas, cliente = null) {
  const ejecutar = async (conexion) => {
    await conexion.query("DELETE FROM schedule_personnel_order WHERE sector_id=$1", [sector]);
    for (const f of filas) {
      await conexion.query(
        `INSERT INTO schedule_personnel_order(sector_id,employee,sort_order,updated_text,calendar_enabled)
         VALUES($1,$2,$3,$4,$5)`,
        [
          f[0], f[1], Number(f[2]) || 0, f[3] || "",
          String(f[4] || "Sí").toLowerCase() !== "no",
        ],
      );
    }
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionHorarios(ejecutar);
}

async function guardarVisibilidadOrden(sector, empleado, habilitado, actualizado) {
  return conTransaccionHorarios(async (cliente) => {
    await cliente.query(
      `INSERT INTO schedule_personnel_order(sector_id,employee,sort_order,updated_text,calendar_enabled)
       VALUES($1,$2,COALESCE((SELECT MAX(sort_order)+1 FROM schedule_personnel_order WHERE sector_id=$1),1),$3,$4)
       ON CONFLICT(sector_id,employee) DO UPDATE SET
         updated_text=EXCLUDED.updated_text,
         calendar_enabled=EXCLUDED.calendar_enabled,
         updated_at=NOW()`,
      [sector, empleado, actualizado, habilitado],
    );
  });
}

async function registrarAuditoriaFilas(filas, cliente = null) {
  for (const f of filas) {
    await ejecutarConsulta(
      cliente,
      `INSERT INTO schedule_audit(occurred_text,username,user_name,user_role,sector_name,month_key,action)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      f,
    );
  }
}

module.exports = {
  asegurarEsquemaHorarios,
  conTransaccionHorarios,
  importarHorariosAtomico,
  listarTurnosFilas,
  reemplazarTurnosSector,
  listarCalendarioFilas,
  listarDetallesFilas,
  reemplazarCalendarioDetallesPorAlcances,
  listarOrdenFilas,
  reemplazarOrdenSector,
  guardarVisibilidadOrden,
  registrarAuditoriaFilas,
};
