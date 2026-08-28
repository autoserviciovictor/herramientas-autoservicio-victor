const { query, obtenerPool } = require("./db");

const BLOQUEO_LISTAS_REPOSICION = "autoservicio-victor:listas-reposicion";
let esquemaAsegurado = false;
let promesaEsquema = null;

function ejecutarConsulta(cliente, texto, parametros = []) {
  return cliente ? cliente.query(texto, parametros) : query(texto, parametros);
}

async function asegurarEsquemaListasReposicion() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;
  promesaEsquema = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS replenishment_list_entries (
      entry_pk BIGSERIAL PRIMARY KEY,
      legacy_row INTEGER UNIQUE,
      entry_id TEXT NOT NULL UNIQUE,
      user_key TEXT NOT NULL,
      list_no TEXT NOT NULL CHECK(list_no IN ('1','2')),
      code TEXT NOT NULL,
      article TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      state TEXT NOT NULL DEFAULT 'pendiente' CHECK(state IN ('pendiente','completado')),
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
      updated_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS replenishment_list_user_list_idx
      ON replenishment_list_entries(user_key,list_no,state,sort_order,entry_pk)`);
    await query(`CREATE INDEX IF NOT EXISTS replenishment_list_code_idx
      ON replenishment_list_entries(code)`);
    esquemaAsegurado = true;
  })();
  try {
    await promesaEsquema;
  } finally {
    promesaEsquema = null;
  }
}

async function conTransaccionListasReposicion(callback) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      BLOQUEO_LISTAS_REPOSICION,
    ]);
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

function listaNormalizada(valor) {
  return String(valor) === "2" ? "2" : "1";
}

function cantidadPositiva(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function estadoNormalizado(valor) {
  return texto(valor).toLowerCase() === "completado" ? "completado" : "pendiente";
}

function filaRegistro(row) {
  return {
    filaGoogle: Number(row.legacy_row) || 0,
    id: texto(row.entry_id),
    usuario: texto(row.user_key).toLowerCase(),
    lista: listaNormalizada(row.list_no),
    codigo: texto(row.code),
    articulo: texto(row.article),
    cantidad: Number(row.quantity) || 1,
    estado: estadoNormalizado(row.state),
    orden: Number(row.sort_order) || 0,
    actualizado: texto(row.updated_text),
  };
}

function normalizarRegistros(registros, { preservarLegacy = false } = {}) {
  return (registros || [])
    .map((r, indice) => {
      const id = texto(r?.id);
      const usuario = texto(r?.usuario).toLowerCase();
      const codigo = texto(r?.codigo);
      const articulo = texto(r?.articulo);
      if (!id || !usuario || !codigo || !articulo) return null;
      const legacyRow = Number(r?.filaGoogle);
      return {
        legacy_row: preservarLegacy && Number.isInteger(legacyRow) && legacyRow > 0 ? legacyRow : indice + 2,
        entry_id: id,
        user_key: usuario,
        list_no: listaNormalizada(r?.lista),
        code: codigo,
        article: articulo,
        quantity: cantidadPositiva(r?.cantidad),
        state: estadoNormalizado(r?.estado),
        sort_order: Math.max(0, Number(r?.orden) || 0),
        updated_text: texto(r?.actualizado),
      };
    })
    .filter(Boolean);
}

async function insertarRegistros(cliente, registros, opciones = {}) {
  const filas = normalizarRegistros(registros, opciones);
  if (!filas.length) return 0;
  await cliente.query(
    `INSERT INTO replenishment_list_entries(
       legacy_row,entry_id,user_key,list_no,code,article,quantity,state,sort_order,updated_text
     )
     SELECT legacy_row,entry_id,user_key,list_no,code,article,quantity,state,sort_order,updated_text
     FROM jsonb_to_recordset($1::jsonb) AS x(
       legacy_row INTEGER, entry_id TEXT, user_key TEXT, list_no TEXT, code TEXT,
       article TEXT, quantity INTEGER, state TEXT, sort_order INTEGER, updated_text TEXT
     )`,
    [JSON.stringify(filas)],
  );
  return filas.length;
}

async function importarListasReposicionAtomico(registros, claveMigracion) {
  return conTransaccionListasReposicion(async (cliente) => {
    const ya = await cliente.query(
      "SELECT 1 FROM app_data_migrations WHERE migration_key=$1",
      [claveMigracion],
    );
    if (ya.rowCount) return false;
    const cantidad = await insertarRegistros(cliente, registros, { preservarLegacy: true });
    await cliente.query(
      `INSERT INTO app_data_migrations(migration_key,details)
       VALUES($1,$2::jsonb) ON CONFLICT(migration_key) DO NOTHING`,
      [claveMigracion, JSON.stringify({ listas_reposicion: cantidad })],
    );
    return true;
  });
}

async function listarListasReposicionDb(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT entry_pk,legacy_row,entry_id,user_key,list_no,code,article,quantity,state,sort_order,updated_text
     FROM replenishment_list_entries
     ORDER BY COALESCE(legacy_row,2147483647), entry_pk`,
  );
  return r.rows.map(filaRegistro);
}

async function reemplazarListasReposicionDb(registros, cliente = null) {
  const ejecutar = async (c) => {
    await c.query("DELETE FROM replenishment_list_entries");
    return insertarRegistros(c, registros);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionListasReposicion(ejecutar);
}

module.exports = {
  BLOQUEO_LISTAS_REPOSICION,
  asegurarEsquemaListasReposicion,
  conTransaccionListasReposicion,
  importarListasReposicionAtomico,
  listarListasReposicionDb,
  reemplazarListasReposicionDb,
};
