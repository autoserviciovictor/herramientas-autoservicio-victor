const { query, obtenerPool } = require("./db");

const BLOQUEO_INVENTARIO_PRODUCTOS = "autoservicio-victor:inventario-productos";
let esquemaAsegurado = false;
let promesaEsquema = null;

function ejecutarConsulta(cliente, texto, parametros = []) {
  return cliente ? cliente.query(texto, parametros) : query(texto, parametros);
}

async function asegurarEsquemaInventarioProductos() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;

  promesaEsquema = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS inventory_stock (
      inventory_id BIGSERIAL PRIMARY KEY,
      legacy_row INTEGER UNIQUE,
      code TEXT NOT NULL DEFAULT '',
      article TEXT NOT NULL DEFAULT '',
      stock_total DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(stock_total >= 0),
      salon DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(salon >= 0),
      deposito DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK(deposito >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS inventory_stock_code_idx ON inventory_stock(code)`);

    await query(`CREATE TABLE IF NOT EXISTS product_catalog (
      catalog_id BIGSERIAL PRIMARY KEY,
      legacy_row INTEGER UNIQUE,
      code TEXT NOT NULL,
      article TEXT NOT NULL,
      price DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS product_catalog_code_idx ON product_catalog(code)`);
    await query(`CREATE INDEX IF NOT EXISTS product_catalog_article_idx ON product_catalog(article)`);
    esquemaAsegurado = true;
  })();

  try {
    await promesaEsquema;
  } finally {
    promesaEsquema = null;
  }
}

async function conTransaccionInventarioProductos(callback) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      BLOQUEO_INVENTARIO_PRODUCTOS,
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

function numeroNoNegativo(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function filaInventario(row) {
  return {
    inventoryId: Number(row.inventory_id),
    filaGoogle: Number(row.legacy_row) || 0,
    codigo: String(row.code || ""),
    articulo: String(row.article || ""),
    stock: Number(row.stock_total) || 0,
    salon: Number(row.salon) || 0,
    deposito: Number(row.deposito) || 0,
  };
}

function filaCatalogo(row) {
  return {
    codigo: String(row.code || ""),
    articulo: String(row.article || ""),
    precio: row.price === null || row.price === undefined ? null : Number(row.price),
  };
}

async function importarInventarioProductosAtomico(datos, claveMigracion) {
  return conTransaccionInventarioProductos(async (cliente) => {
    const ya = await cliente.query(
      "SELECT 1 FROM app_data_migrations WHERE migration_key=$1",
      [claveMigracion],
    );
    if (ya.rowCount) return false;

    const inventario = (datos?.inventario || [])
      .map((producto) => {
        const codigo = String(producto?.codigo || "").trim();
        const articulo = String(producto?.articulo || "").trim();
        if (!codigo && !articulo) return null;
        const legacyRow = Number(producto?.filaGoogle);
        return {
          legacy_row: Number.isInteger(legacyRow) && legacyRow > 0 ? legacyRow : null,
          code: codigo,
          article: articulo,
          stock_total: numeroNoNegativo(producto?.stock),
          salon: numeroNoNegativo(producto?.salon),
          deposito: numeroNoNegativo(producto?.deposito),
        };
      })
      .filter(Boolean);
    if (inventario.length) {
      await cliente.query(
        `INSERT INTO inventory_stock(legacy_row,code,article,stock_total,salon,deposito)
         SELECT legacy_row,code,article,stock_total,salon,deposito
         FROM jsonb_to_recordset($1::jsonb) AS x(
           legacy_row INTEGER, code TEXT, article TEXT, stock_total DOUBLE PRECISION,
           salon DOUBLE PRECISION, deposito DOUBLE PRECISION
         )`,
        [JSON.stringify(inventario)],
      );
    }

    const catalogo = (datos?.catalogo || [])
      .map((producto, indice) => {
        const code = String(producto?.codigo || "").trim();
        const article = String(producto?.articulo || "").trim();
        if (!code || !article) return null;
        const legacyRow = Number(producto?.filaGoogle);
        return {
          legacy_row: Number.isInteger(legacyRow) && legacyRow > 0 ? legacyRow : indice + 2,
          code,
          article,
          price: producto?.precio === null || producto?.precio === undefined || producto?.precio === ""
            ? null
            : Number(producto.precio),
        };
      })
      .filter(Boolean);
    if (catalogo.length) {
      await cliente.query(
        `INSERT INTO product_catalog(legacy_row,code,article,price)
         SELECT legacy_row,code,article,price
         FROM jsonb_to_recordset($1::jsonb) AS x(
           legacy_row INTEGER, code TEXT, article TEXT, price DOUBLE PRECISION
         )`,
        [JSON.stringify(catalogo)],
      );
    }

    await cliente.query(
      `INSERT INTO app_data_migrations(migration_key,details)
       VALUES($1,$2::jsonb) ON CONFLICT(migration_key) DO NOTHING`,
      [
        claveMigracion,
        JSON.stringify({
          inventario: (datos?.inventario || []).length,
          catalogo: (datos?.catalogo || []).length,
        }),
      ],
    );
    return true;
  });
}

async function listarInventarioDb(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT inventory_id,legacy_row,code,article,stock_total,salon,deposito
     FROM inventory_stock
     ORDER BY COALESCE(legacy_row, 2147483647), inventory_id`,
  );
  return r.rows.map(filaInventario);
}

async function buscarInventarioPorCodigoDb(codigo, cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT inventory_id,legacy_row,code,article,stock_total,salon,deposito
     FROM inventory_stock WHERE code=$1
     ORDER BY COALESCE(legacy_row, 2147483647), inventory_id LIMIT 1`,
    [String(codigo || "")],
  );
  return r.rows[0] ? filaInventario(r.rows[0]) : null;
}

async function crearInventarioDb(codigo, articulo, cliente = null) {
  const ejecutar = async (c) => {
    const existente = await buscarInventarioPorCodigoDb(codigo, c);
    if (existente) return existente;
    const siguiente = await c.query(
      "SELECT GREATEST(COALESCE(MAX(legacy_row),1)+1,2) AS siguiente FROM inventory_stock",
    );
    const r = await c.query(
      `INSERT INTO inventory_stock(legacy_row,code,article,stock_total,salon,deposito)
       VALUES($1,$2,$3,0,0,0)
       RETURNING inventory_id,legacy_row,code,article,stock_total,salon,deposito`,
      [Number(siguiente.rows[0]?.siguiente) || 2, String(codigo || ""), String(articulo || "")],
    );
    return filaInventario(r.rows[0]);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionInventarioProductos(ejecutar);
}

async function actualizarInventarioDb(producto, { recalcularTotal = false } = {}, cliente = null) {
  const ejecutar = async (c) => {
    let actual = null;
    if (Number(producto?.inventoryId) > 0) {
      const r = await c.query(
        `SELECT inventory_id,legacy_row,code,article,stock_total,salon,deposito
         FROM inventory_stock WHERE inventory_id=$1 FOR UPDATE`,
        [Number(producto.inventoryId)],
      );
      if (r.rows[0]) actual = filaInventario(r.rows[0]);
    }
    if (!actual) actual = await buscarInventarioPorCodigoDb(producto?.codigo, c);
    if (!actual) return null;

    const salon = numeroNoNegativo(producto?.salon);
    const deposito = numeroNoNegativo(producto?.deposito);
    const stockUbicaciones = salon + deposito;
    const stockActual = numeroNoNegativo(producto?.stock);
    const stock = recalcularTotal ? stockUbicaciones : Math.max(stockActual, stockUbicaciones);
    const r = await c.query(
      `UPDATE inventory_stock
       SET code=$2,article=$3,stock_total=$4,salon=$5,deposito=$6,updated_at=NOW()
       WHERE inventory_id=$1
       RETURNING inventory_id,legacy_row,code,article,stock_total,salon,deposito`,
      [
        actual.inventoryId,
        String(producto?.codigo || actual.codigo),
        String(producto?.articulo || actual.articulo),
        stock,
        salon,
        deposito,
      ],
    );
    return filaInventario(r.rows[0]);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionInventarioProductos(ejecutar);
}

async function sumarInventarioDb(codigo, ubicacion, cantidad, articuloFallback = "", cliente = null) {
  const ejecutar = async (c) => {
    let producto = await buscarInventarioPorCodigoDb(codigo, c);
    if (!producto) {
      if (!articuloFallback) return null;
      producto = await crearInventarioDb(codigo, articuloFallback, c);
    }
    const delta = numeroNoNegativo(cantidad);
    producto.stock = numeroNoNegativo(producto.stock) + delta;
    if (ubicacion === "deposito") producto.deposito = numeroNoNegativo(producto.deposito) + delta;
    else producto.salon = numeroNoNegativo(producto.salon) + delta;
    return actualizarInventarioDb(producto, { recalcularTotal: false }, c);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionInventarioProductos(ejecutar);
}

async function corregirInventarioDb(codigo, salon, deposito, cliente = null) {
  const ejecutar = async (c) => {
    const producto = await buscarInventarioPorCodigoDb(codigo, c);
    if (!producto) return null;
    producto.salon = numeroNoNegativo(salon);
    producto.deposito = numeroNoNegativo(deposito);
    return actualizarInventarioDb(producto, { recalcularTotal: true }, c);
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionInventarioProductos(ejecutar);
}

async function listarCatalogoDb(cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT code,article,price FROM product_catalog
     ORDER BY COALESCE(legacy_row, 2147483647), catalog_id`,
  );
  return r.rows.map(filaCatalogo);
}

async function buscarCatalogoPorCodigoDb(codigo, cliente = null) {
  const r = await ejecutarConsulta(
    cliente,
    `SELECT code,article,price FROM product_catalog WHERE code=$1
     ORDER BY COALESCE(legacy_row, 2147483647), catalog_id LIMIT 1`,
    [String(codigo || "")],
  );
  return r.rows[0] ? filaCatalogo(r.rows[0]) : null;
}

async function reemplazarCatalogoDb(catalogo, cliente = null) {
  const ejecutar = async (c) => {
    const filas = (catalogo || [])
      .map((producto, indice) => ({
        legacy_row: indice + 2,
        code: String(producto?.codigo || "").trim(),
        article: String(producto?.articulo || "").trim(),
        price: producto?.precio === null || producto?.precio === undefined || producto?.precio === ""
          ? null
          : Number(producto.precio),
      }))
      .filter((producto) => producto.code && producto.article);
    await c.query("DELETE FROM product_catalog");
    if (!filas.length) return;
    await c.query(
      `INSERT INTO product_catalog(legacy_row,code,article,price)
       SELECT legacy_row,code,article,price
       FROM jsonb_to_recordset($1::jsonb) AS x(
         legacy_row INTEGER, code TEXT, article TEXT, price DOUBLE PRECISION
       )`,
      [JSON.stringify(filas)],
    );
  };
  if (cliente) return ejecutar(cliente);
  return conTransaccionInventarioProductos(ejecutar);
}

module.exports = {
  BLOQUEO_INVENTARIO_PRODUCTOS,
  asegurarEsquemaInventarioProductos,
  conTransaccionInventarioProductos,
  importarInventarioProductosAtomico,
  listarInventarioDb,
  buscarInventarioPorCodigoDb,
  crearInventarioDb,
  actualizarInventarioDb,
  sumarInventarioDb,
  corregirInventarioDb,
  listarCatalogoDb,
  buscarCatalogoPorCodigoDb,
  reemplazarCatalogoDb,
};
