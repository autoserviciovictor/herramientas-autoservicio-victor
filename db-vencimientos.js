const { query, obtenerPool } = require("./db");

const BLOQUEO_VENCIMIENTOS = "autoservicio-victor:vencimientos";
let esquemaAsegurado = false;
let promesaEsquema = null;

function ejecutarConsulta(cliente, texto, parametros = []) {
  return cliente ? cliente.query(texto, parametros) : query(texto, parametros);
}

async function asegurarEsquemaVencimientos() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;
  promesaEsquema = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS expiration_records (
      expiration_pk BIGSERIAL PRIMARY KEY,
      legacy_row INTEGER UNIQUE,
      record_id TEXT NOT NULL UNIQUE,
      load_date TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      article TEXT NOT NULL DEFAULT '',
      expiry_date TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      salon_quantity INTEGER NOT NULL DEFAULT 0 CHECK(salon_quantity >= 0),
      deposit_quantity INTEGER NOT NULL DEFAULT 0 CHECK(deposit_quantity >= 0),
      offer BOOLEAN NOT NULL DEFAULT FALSE,
      category TEXT NOT NULL DEFAULT 'Sin clasificar',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`ALTER TABLE expiration_records ADD COLUMN IF NOT EXISTS salon_quantity INTEGER NOT NULL DEFAULT 0 CHECK(salon_quantity >= 0)`);
    await query(`ALTER TABLE expiration_records ADD COLUMN IF NOT EXISTS deposit_quantity INTEGER NOT NULL DEFAULT 0 CHECK(deposit_quantity >= 0)`);
    await query(`UPDATE expiration_records
      SET salon_quantity=quantity, deposit_quantity=0
      WHERE quantity > 0 AND salon_quantity=0 AND deposit_quantity=0`);
    await query(`UPDATE expiration_records
      SET quantity=GREATEST(0, salon_quantity) + GREATEST(0, deposit_quantity)
      WHERE quantity <> GREATEST(0, salon_quantity) + GREATEST(0, deposit_quantity)`);
    await query(`CREATE INDEX IF NOT EXISTS expiration_records_code_idx ON expiration_records(code)`);
    await query(`CREATE INDEX IF NOT EXISTS expiration_records_expiry_idx ON expiration_records(expiry_date)`);
    await query(`CREATE INDEX IF NOT EXISTS expiration_records_category_idx ON expiration_records(category)`);
    esquemaAsegurado = true;
  })();
  try {
    await promesaEsquema;
  } finally {
    promesaEsquema = null;
  }
}

async function conTransaccionVencimientos(callback) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext($1))", [BLOQUEO_VENCIMIENTOS]);
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

function texto(valor) {
  return String(valor ?? "").trim();
}

function enteroNoNegativo(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function ofertaABoolean(valor) {
  const normalizado = texto(valor).toLowerCase();
  return ["si", "sí", "true", "1", "oferta", "activo", "activa"].includes(normalizado);
}

function filaVencimiento(row) {
  return {
    vencimientoPk: Number(row.expiration_pk),
    filaGoogle: Number(row.legacy_row) || 0,
    id: texto(row.record_id),
    fecha_carga: texto(row.load_date),
    codigo: texto(row.code),
    articulo: texto(row.article),
    vencimiento: texto(row.expiry_date),
    salon: Number(row.salon_quantity) || 0,
    deposito: Number(row.deposit_quantity) || 0,
    cantidad: (Number(row.salon_quantity) || 0) + (Number(row.deposit_quantity) || 0),
    oferta: row.offer ? "Sí" : "No",
    rubro: texto(row.category) || "Sin clasificar",
  };
}

async function importarVencimientosAtomico(vencimientos, claveMigracion) {
  return conTransaccionVencimientos(async (cliente) => {
    const ya = await cliente.query(
      "SELECT 1 FROM app_data_migrations WHERE migration_key=$1",
      [claveMigracion],
    );
    if (ya.rowCount) return false;

    const filas = (vencimientos || [])
      .map((item, indice) => {
        const id = texto(item?.id) || `LEGACY-${indice + 1}`;
        const legacyRow = Number(item?.filaGoogle);
        return {
          legacy_row: Number.isInteger(legacyRow) && legacyRow > 0 ? legacyRow : indice + 2,
          record_id: id,
          load_date: texto(item?.fecha_carga),
          code: texto(item?.codigo),
          article: texto(item?.articulo),
          expiry_date: texto(item?.vencimiento),
          salon_quantity: enteroNoNegativo(item?.salon ?? item?.cantidad),
          deposit_quantity: enteroNoNegativo(item?.deposito),
          offer: ofertaABoolean(item?.oferta),
          category: texto(item?.rubro) || "Sin clasificar",
        };
      })
      .filter((item) => item.record_id && (item.code || item.article));

    if (filas.length) {
      await cliente.query(
        `INSERT INTO expiration_records(
           legacy_row,record_id,load_date,code,article,expiry_date,quantity,salon_quantity,deposit_quantity,offer,category
         )
         SELECT legacy_row,record_id,load_date,code,article,expiry_date,
                salon_quantity + deposit_quantity,salon_quantity,deposit_quantity,offer,category
         FROM jsonb_to_recordset($1::jsonb) AS x(
           legacy_row INTEGER, record_id TEXT, load_date TEXT, code TEXT, article TEXT,
           expiry_date TEXT, salon_quantity INTEGER, deposit_quantity INTEGER, offer BOOLEAN, category TEXT
         )`,
        [JSON.stringify(filas)],
      );
    }

    await cliente.query(
      `INSERT INTO app_data_migrations(migration_key,details)
       VALUES($1,$2::jsonb) ON CONFLICT(migration_key) DO NOTHING`,
      [claveMigracion, JSON.stringify({ vencimientos: filas.length })],
    );
    return true;
  });
}

async function listarVencimientosDb(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT expiration_pk,legacy_row,record_id,load_date,code,article,expiry_date,quantity,salon_quantity,deposit_quantity,offer,category
     FROM expiration_records
     ORDER BY COALESCE(legacy_row,2147483647), expiration_pk`,
  );
  return r.rows.map(filaVencimiento);
}

async function buscarVencimientoPorIdDb(id, cliente = null, { bloquear = false } = {}) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT expiration_pk,legacy_row,record_id,load_date,code,article,expiry_date,quantity,salon_quantity,deposit_quantity,offer,category
     FROM expiration_records WHERE record_id=$1${bloquear ? " FOR UPDATE" : ""}`,
    [texto(id)],
  );
  return r.rows[0] ? filaVencimiento(r.rows[0]) : null;
}

async function crearVencimientoDb(registro, cliente = null) {
  const ejecutar = async (c) => {
    const siguiente = await c.query(
      "SELECT GREATEST(COALESCE(MAX(legacy_row),1)+1,2) AS siguiente FROM expiration_records",
    );
    const r = await c.query(
      `INSERT INTO expiration_records(
         legacy_row,record_id,load_date,code,article,expiry_date,quantity,salon_quantity,deposit_quantity,offer,category
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING expiration_pk,legacy_row,record_id,load_date,code,article,expiry_date,quantity,salon_quantity,deposit_quantity,offer,category`,
      [
        Number(siguiente.rows[0]?.siguiente) || 2,
        texto(registro?.id),
        texto(registro?.fecha_carga),
        texto(registro?.codigo),
        texto(registro?.articulo),
        texto(registro?.vencimiento),
        enteroNoNegativo(registro?.salon) + enteroNoNegativo(registro?.deposito),
        enteroNoNegativo(registro?.salon),
        enteroNoNegativo(registro?.deposito),
        ofertaABoolean(registro?.oferta),
        texto(registro?.rubro) || "Sin clasificar",
      ],
    );
    return filaVencimiento(r.rows[0]);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionVencimientos(ejecutar);
}

async function actualizarVencimientoDb(id, cambios, cliente = null) {
  const ejecutar = async (c) => {
    const actual = await buscarVencimientoPorIdDb(id, c, { bloquear: true });
    if (!actual) return null;
    const r = await c.query(
      `UPDATE expiration_records SET
         expiry_date=$2, quantity=$3, salon_quantity=$4, deposit_quantity=$5, offer=$6, category=$7, updated_at=NOW()
       WHERE expiration_pk=$1
       RETURNING expiration_pk,legacy_row,record_id,load_date,code,article,expiry_date,quantity,salon_quantity,deposit_quantity,offer,category`,
      [
        actual.vencimientoPk,
        cambios?.vencimiento === undefined ? actual.vencimiento : texto(cambios.vencimiento),
        enteroNoNegativo(cambios?.salon === undefined ? actual.salon : cambios.salon) +
          enteroNoNegativo(cambios?.deposito === undefined ? actual.deposito : cambios.deposito),
        cambios?.salon === undefined ? actual.salon : enteroNoNegativo(cambios.salon),
        cambios?.deposito === undefined ? actual.deposito : enteroNoNegativo(cambios.deposito),
        cambios?.oferta === undefined ? ofertaABoolean(actual.oferta) : ofertaABoolean(cambios.oferta),
        cambios?.rubro === undefined ? actual.rubro : (texto(cambios.rubro) || "Sin clasificar"),
      ],
    );
    return filaVencimiento(r.rows[0]);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionVencimientos(ejecutar);
}

async function eliminarVencimientoDb(id, cliente = null) {
  const ejecutar = async (c) => {
    const actual = await buscarVencimientoPorIdDb(id, c, { bloquear: true });
    if (!actual) return null;
    await c.query("DELETE FROM expiration_records WHERE expiration_pk=$1", [actual.vencimientoPk]);
    return actual;
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionVencimientos(ejecutar);
}

module.exports = {
  BLOQUEO_VENCIMIENTOS,
  asegurarEsquemaVencimientos,
  conTransaccionVencimientos,
  importarVencimientosAtomico,
  listarVencimientosDb,
  buscarVencimientoPorIdDb,
  crearVencimientoDb,
  actualizarVencimientoDb,
  eliminarVencimientoDb,
};
