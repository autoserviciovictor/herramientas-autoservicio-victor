const { query } = require("./db");
const {
  ESTADOS_IMAGEN,
  ESTADOS_IMAGEN_VALIDOS,
  normalizarEstadoImagen,
  tieneImagenConfirmada,
  validarTransicionImagen,
} = require("./catalogo-imagenes-estado");

function ejecutarConsultaCatalogo(cliente, texto, parametros = []) {
  return cliente ? cliente.query(texto, parametros) : query(texto, parametros);
}

let esquemaAsegurado = false;
let promesaEsquema = null;

const UNIDADES_VENTA = ["unidad", "kg", "pack", "cajon", "bulto", "litro", "metro"];

async function asegurarEsquemaCatalogoPublico() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;

  promesaEsquema = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS catalog_categories (
      category_id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_categories_name_nonempty CHECK (length(btrim(name)) > 0),
      CONSTRAINT catalog_categories_slug_nonempty CHECK (length(btrim(slug)) > 0)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_categories_active_order_idx
      ON catalog_categories(active, sort_order, name)`);

    // product_catalog ya es la fuente maestra de código, artículo y precio.
    // Esta tabla guarda únicamente la configuración comercial/pública para no
    // duplicar los ~5.000 productos ni interferir con Inventario/Precios.
    await query(`CREATE TABLE IF NOT EXISTS catalog_product_settings (
      code TEXT PRIMARY KEY,
      category_id BIGINT REFERENCES catalog_categories(category_id) ON DELETE SET NULL,
      brand TEXT NOT NULL DEFAULT '',
      presentation TEXT NOT NULL DEFAULT '',
      sale_unit TEXT NOT NULL DEFAULT 'unidad',
      image_url TEXT NOT NULL DEFAULT '',
      image_source TEXT NOT NULL DEFAULT '',
      image_status TEXT NOT NULL DEFAULT 'sin_imagen',
      image_candidate_url TEXT NOT NULL DEFAULT '',
      image_candidate_source TEXT NOT NULL DEFAULT '',
      image_candidate_title TEXT NOT NULL DEFAULT '',
      image_candidate_score INTEGER NOT NULL DEFAULT 0,
      image_data BYTEA,
      image_mime TEXT NOT NULL DEFAULT '',
      image_candidate_data BYTEA,
      image_candidate_mime TEXT NOT NULL DEFAULT '',
      image_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
      image_checked_at TIMESTAMPTZ,
      image_error TEXT NOT NULL DEFAULT '',
      visible BOOLEAN NOT NULL DEFAULT FALSE,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_product_settings_code_nonempty CHECK (length(btrim(code)) > 0),
      CONSTRAINT catalog_product_settings_sale_unit_valid CHECK (
        sale_unit IN ('unidad','kg','pack','cajon','bulto','litro','metro')
      ),
      CONSTRAINT catalog_product_settings_image_status_valid CHECK (
        image_status IN ('sin_imagen','buscando','candidato','confirmada','sin_resultado','error')
      )
    )`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_candidate_url TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_candidate_source TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_candidate_title TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_candidate_score INTEGER NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_data BYTEA`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_mime TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_candidate_data BYTEA`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_candidate_mime TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_candidates JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ`);
    await query(`ALTER TABLE catalog_product_settings ADD COLUMN IF NOT EXISTS image_error TEXT NOT NULL DEFAULT ''`);
    // Migración P1A: consolidamos los estados históricos en un único ciclo de vida.
    await query(`ALTER TABLE catalog_product_settings DROP CONSTRAINT IF EXISTS catalog_product_settings_image_status_valid`);
    await query(`UPDATE catalog_product_settings SET image_status='buscando' WHERE image_status='pendiente'`);
    await query(`UPDATE catalog_product_settings SET image_status='candidato' WHERE image_status='revisar'`);
    await query(`UPDATE catalog_product_settings SET image_status='sin_imagen'
      WHERE image_status IS NULL OR image_status NOT IN ('sin_imagen','buscando','candidato','confirmada','sin_resultado','error')`);
    await query(`ALTER TABLE catalog_product_settings ADD CONSTRAINT catalog_product_settings_image_status_valid
      CHECK (image_status IN ('sin_imagen','buscando','candidato','confirmada','sin_resultado','error'))`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_product_settings_image_status_idx
      ON catalog_product_settings(image_status, image_checked_at, code)`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_product_settings_public_idx
      ON catalog_product_settings(visible, category_id, sort_order, code)`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_product_settings_featured_idx
      ON catalog_product_settings(featured, visible, sort_order)`);

    // P4: estado persistente del proceso masivo de imágenes. Un único job
    // permite pausar/reanudar y continuar incluso después de un redeploy.
    await query(`CREATE TABLE IF NOT EXISTS catalog_image_batch_state (
      batch_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (batch_id=1),
      status TEXT NOT NULL DEFAULT 'idle',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      processed INTEGER NOT NULL DEFAULT 0,
      confirmed INTEGER NOT NULL DEFAULT 0,
      review INTEGER NOT NULL DEFAULT 0,
      no_result INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      total_target INTEGER NOT NULL DEFAULT 0,
      last_code TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_image_batch_state_status_valid CHECK (status IN ('idle','running','paused','finished'))
    )`);
    await query(`INSERT INTO catalog_image_batch_state(batch_id) VALUES(1) ON CONFLICT(batch_id) DO NOTHING`);

    esquemaAsegurado = true;
  })();

  try {
    await promesaEsquema;
  } finally {
    promesaEsquema = null;
  }
}

function enteroEnRango(valor, minimo, maximo, fallback) {
  const numero = Number(valor);
  if (!Number.isInteger(numero)) return fallback;
  return Math.max(minimo, Math.min(maximo, numero));
}

function normalizarBusqueda(valor) {
  return String(valor || "").trim().replace(/\s+/g, " ").slice(0, 100);
}

async function obtenerEstadoCatalogoPublicoDb() {
  await asegurarEsquemaCatalogoPublico();
  const resultado = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM product_catalog) AS total_master,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE visible=TRUE) AS total_visible,
      (SELECT COUNT(*)::int FROM catalog_categories WHERE active=TRUE) AS total_categories
  `);
  const fila = resultado.rows[0] || {};
  return {
    productosMaestros: Number(fila.total_master) || 0,
    productosVisibles: Number(fila.total_visible) || 0,
    rubrosActivos: Number(fila.total_categories) || 0,
  };
}

async function listarRubrosPublicosDb() {
  await asegurarEsquemaCatalogoPublico();
  const resultado = await query(`
    SELECT
      c.category_id,
      c.name,
      c.slug,
      c.description,
      c.image_url,
      c.sort_order,
      COUNT(p.code)::int AS product_count
    FROM catalog_categories c
    LEFT JOIN catalog_product_settings s
      ON s.category_id=c.category_id AND s.visible=TRUE
    LEFT JOIN product_catalog p
      ON p.code=s.code AND p.stock > 0
    WHERE c.active=TRUE
    GROUP BY c.category_id, c.name, c.slug, c.description, c.image_url, c.sort_order
    HAVING COUNT(p.code) > 0
    ORDER BY c.name, c.category_id
  `);
  return resultado.rows.map((fila) => ({
    id: Number(fila.category_id),
    nombre: String(fila.name || ""),
    slug: String(fila.slug || ""),
    descripcion: String(fila.description || ""),
    imagen: String(fila.image_url || ""),
    orden: Number(fila.sort_order) || 0,
    productos: Number(fila.product_count) || 0,
  }));
}

async function listarProductosPublicosDb(opciones = {}) {
  await asegurarEsquemaCatalogoPublico();

  const pagina = enteroEnRango(opciones.pagina, 1, 100000, 1);
  const limite = enteroEnRango(opciones.limite, 1, 60, 30);
  const offset = (pagina - 1) * limite;
  const busqueda = normalizarBusqueda(opciones.busqueda);
  const rubro = String(opciones.rubro || "").trim().slice(0, 80);
  const destacado = opciones.destacado === true;

  const condiciones = ["s.visible=TRUE", "c.active=TRUE", "p.stock > 0"];
  const parametros = [];

  if (busqueda) {
    parametros.push(`%${busqueda}%`);
    const indice = parametros.length;
    condiciones.push(`(
      p.article ILIKE $${indice}
      OR p.code ILIKE $${indice}
      OR s.brand ILIKE $${indice}
      OR s.presentation ILIKE $${indice}
    )`);
  }

  if (rubro) {
    parametros.push(rubro);
    const indice = parametros.length;
    condiciones.push(`(c.slug=$${indice} OR c.category_id::text=$${indice})`);
  }

  if (destacado) condiciones.push("s.featured=TRUE");

  const where = condiciones.join(" AND ");
  const conteo = await query(
    `SELECT COUNT(*)::int AS total
     FROM product_catalog p
     JOIN catalog_product_settings s ON s.code=p.code
     JOIN catalog_categories c ON c.category_id=s.category_id
     WHERE ${where}`,
    parametros,
  );

  parametros.push(limite, offset);
  const limiteParam = parametros.length - 1;
  const offsetParam = parametros.length;
  const resultado = await query(
    `SELECT
       p.code, p.article, p.price,
       s.brand, s.presentation, s.sale_unit, s.image_url, s.featured, s.sort_order,
       c.category_id, c.name AS category_name, c.slug AS category_slug
     FROM product_catalog p
     JOIN catalog_product_settings s ON s.code=p.code
     JOIN catalog_categories c ON c.category_id=s.category_id
     WHERE ${where}
     ORDER BY s.featured DESC, c.name, p.article, p.code
     LIMIT $${limiteParam} OFFSET $${offsetParam}`,
    parametros,
  );

  const total = Number(conteo.rows[0]?.total) || 0;
  return {
    pagina,
    limite,
    total,
    paginas: total ? Math.ceil(total / limite) : 0,
    productos: resultado.rows.map((fila) => ({
      codigo: String(fila.code || ""),
      nombre: String(fila.article || ""),
      precio: fila.price === null || fila.price === undefined ? null : Number(fila.price),
      marca: String(fila.brand || ""),
      presentacion: String(fila.presentation || ""),
      unidadVenta: String(fila.sale_unit || "unidad"),
      imagen: String(fila.image_url || ""),
      destacado: Boolean(fila.featured),
      rubro: {
        id: Number(fila.category_id),
        nombre: String(fila.category_name || ""),
        slug: String(fila.category_slug || ""),
      },
    })),
  };
}


function textoLimitado(valor, maximo = 160) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, maximo);
}

function slugCatalogo(valor = "") {
  return textoLimitado(valor, 100)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function booleano(valor, fallback = false) {
  if (valor === true || valor === "true" || valor === 1 || valor === "1") return true;
  if (valor === false || valor === "false" || valor === 0 || valor === "0") return false;
  return fallback;
}

async function obtenerEstadoCatalogoAdminDb() {
  await asegurarEsquemaCatalogoPublico();
  const r = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM product_catalog) AS total,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE visible=TRUE) AS visibles,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE visible=FALSE) AS ocultos_configurados,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE image_status='confirmada') AS imagenes_confirmadas,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE image_status='candidato') AS imagenes_candidatas,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE image_status='buscando') AS imagenes_buscando,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE image_status='sin_resultado') AS imagenes_sin_resultado,
      (SELECT COUNT(*)::int FROM catalog_product_settings WHERE image_status='error') AS imagenes_error,
      (SELECT COUNT(*)::int FROM catalog_categories) AS rubros,
      (SELECT COUNT(*)::int FROM catalog_categories WHERE active=TRUE) AS rubros_activos
  `);
  const f = r.rows[0] || {};
  const total = Number(f.total) || 0;
  const visibles = Number(f.visibles) || 0;
  const configurados = visibles + (Number(f.ocultos_configurados) || 0);
  return {
    total,
    visibles,
    ocultos: Math.max(0, total - visibles),
    configurados,
    pendientesConfigurar: Math.max(0, total - configurados),
    imagenesConfirmadas: Number(f.imagenes_confirmadas) || 0,
    imagenesCandidatas: Number(f.imagenes_candidatas) || 0,
    imagenesBuscando: Number(f.imagenes_buscando) || 0,
    imagenesSinResultado: Number(f.imagenes_sin_resultado) || 0,
    imagenesError: Number(f.imagenes_error) || 0,
    imagenesSinImagen: Math.max(0, total - (Number(f.imagenes_confirmadas) || 0) - (Number(f.imagenes_candidatas) || 0) - (Number(f.imagenes_buscando) || 0) - (Number(f.imagenes_sin_resultado) || 0) - (Number(f.imagenes_error) || 0)),
    rubros: Number(f.rubros) || 0,
    rubrosActivos: Number(f.rubros_activos) || 0,
  };
}

async function listarRubrosAdminDb() {
  await asegurarEsquemaCatalogoPublico();
  const r = await query(`
    SELECT c.category_id, c.name, c.slug, c.description, c.image_url, c.active, c.sort_order,
           COUNT(s.code)::int AS configured_count,
           COUNT(s.code) FILTER (WHERE s.visible=TRUE)::int AS visible_count
    FROM catalog_categories c
    LEFT JOIN catalog_product_settings s ON s.category_id=c.category_id
    GROUP BY c.category_id, c.name, c.slug, c.description, c.image_url, c.active, c.sort_order
    ORDER BY c.name, c.category_id
  `);
  return r.rows.map((f) => ({
    id: Number(f.category_id),
    nombre: String(f.name || ""),
    slug: String(f.slug || ""),
    descripcion: String(f.description || ""),
    imagen: String(f.image_url || ""),
    activo: Boolean(f.active),
    orden: Number(f.sort_order) || 0,
    productos: Number(f.configured_count) || 0,
    visibles: Number(f.visible_count) || 0,
  }));
}

async function crearRubroCatalogoAdminDb(datos = {}) {
  await asegurarEsquemaCatalogoPublico();
  const nombre = textoLimitado(datos.nombre, 80);
  if (!nombre) throw new Error("El nombre del rubro es obligatorio");
  const base = slugCatalogo(datos.slug || nombre) || `rubro-${Date.now()}`;
  let slug = base;
  let intento = 1;
  while (true) {
    const existe = await query(`SELECT 1 FROM catalog_categories WHERE slug=$1 LIMIT 1`, [slug]);
    if (!existe.rowCount) break;
    intento += 1;
    slug = `${base.slice(0, Math.max(1, 76 - String(intento).length))}-${intento}`;
  }
  const r = await query(`
    INSERT INTO catalog_categories(name, slug, description, image_url, active, sort_order, updated_at)
    VALUES($1,$2,$3,$4,$5,$6,NOW())
    RETURNING category_id
  `, [
    nombre,
    slug,
    textoLimitado(datos.descripcion, 500),
    textoLimitado(datos.imagen, 600),
    booleano(datos.activo, true),
    0,
  ]);
  return Number(r.rows[0]?.category_id);
}

async function actualizarRubroCatalogoAdminDb(id, datos = {}) {
  await asegurarEsquemaCatalogoPublico();
  const rubroId = Number(id);
  if (!Number.isInteger(rubroId) || rubroId < 1) throw new Error("Rubro inválido");
  const actual = await query(`SELECT * FROM catalog_categories WHERE category_id=$1`, [rubroId]);
  if (!actual.rowCount) throw new Error("El rubro no existe");
  const f = actual.rows[0];
  const nombre = datos.nombre === undefined ? f.name : textoLimitado(datos.nombre, 80);
  if (!nombre) throw new Error("El nombre del rubro es obligatorio");
  const r = await query(`
    UPDATE catalog_categories
    SET name=$2, description=$3, image_url=$4, active=$5, sort_order=$6, updated_at=NOW()
    WHERE category_id=$1 RETURNING category_id
  `, [
    rubroId,
    nombre,
    datos.descripcion === undefined ? f.description : textoLimitado(datos.descripcion, 500),
    datos.imagen === undefined ? f.image_url : textoLimitado(datos.imagen, 600),
    datos.activo === undefined ? Boolean(f.active) : booleano(datos.activo, Boolean(f.active)),
    Number(f.sort_order) || 0,
  ]);
  return Boolean(r.rowCount);
}

async function eliminarRubroCatalogoAdminDb(id) {
  await asegurarEsquemaCatalogoPublico();
  const rubroId = Number(id);
  if (!Number.isInteger(rubroId) || rubroId < 1) throw new Error("Rubro inválido");
  const usados = await query(`SELECT COUNT(*)::int AS total FROM catalog_product_settings WHERE category_id=$1`, [rubroId]);
  if ((Number(usados.rows[0]?.total) || 0) > 0) {
    const error = new Error("No se puede eliminar un rubro que tiene productos asignados");
    error.status = 409;
    throw error;
  }
  const r = await query(`DELETE FROM catalog_categories WHERE category_id=$1`, [rubroId]);
  if (!r.rowCount) throw new Error("El rubro no existe");
  return true;
}

async function sincronizarVisibilidadStockCatalogoDb(productos = [], cliente = null) {
  if (!cliente) await asegurarEsquemaCatalogoPublico();

  const filas = (productos || [])
    .map((producto) => {
      const code = textoLimitado(producto?.codigo, 160);
      const stock = Number(producto?.stock);
      if (!code) return null;
      return { code, visible: Number.isFinite(stock) && stock > 0 };
    })
    .filter(Boolean);

  if (!filas.length) return { activos: 0, desactivados: 0 };

  // La importación del Excel manda sobre la visibilidad comercial: stock > 0
  // publica; stock <= 0 (o inválido, normalizado a 0) oculta. Se preservan
  // imágenes, rubro, marca, presentación, unidad y destacado.
  await ejecutarConsultaCatalogo(cliente, `
    INSERT INTO catalog_product_settings(code, visible, updated_at)
    SELECT x.code, x.visible, NOW()
    FROM jsonb_to_recordset($1::jsonb) AS x(code TEXT, visible BOOLEAN)
    JOIN product_catalog p ON p.code=x.code
    ON CONFLICT(code) DO UPDATE
      SET visible=EXCLUDED.visible, updated_at=NOW()
  `, [JSON.stringify(filas)]);

  const activos = filas.filter((fila) => fila.visible).length;
  return { activos, desactivados: filas.length - activos };
}

async function sincronizarRubrosImportadosCatalogoDb(productos = [], cliente = null) {
  // El esquema se asegura antes de abrir la transacción principal. Cuando se
  // recibe un cliente, todas las mutaciones posteriores usan la misma sesión.
  if (!cliente) await asegurarEsquemaCatalogoPublico();

  const normalizados = (productos || [])
    .map((producto) => ({
      codigo: textoLimitado(producto?.codigo, 160),
      rubro: textoLimitado(producto?.rubro, 80),
    }))
    .filter((producto) => producto.codigo);

  const preparados = normalizados
    .filter((producto) => producto.rubro)
    .map((producto) => ({ ...producto, slug: slugCatalogo(producto.rubro) }))
    .filter((producto) => producto.slug);

  const rubrosUnicos = [];
  const slugsVistos = new Set();
  for (const producto of preparados) {
    if (slugsVistos.has(producto.slug)) continue;
    slugsVistos.add(producto.slug);
    rubrosUnicos.push({ nombre: producto.rubro, slug: producto.slug });
  }

  for (const rubro of rubrosUnicos) {
    await ejecutarConsultaCatalogo(cliente, `
      INSERT INTO catalog_categories(name, slug, active, sort_order, updated_at)
      VALUES($1,$2,TRUE,0,NOW())
      ON CONFLICT(slug) DO UPDATE SET active=TRUE, name=EXCLUDED.name, updated_at=NOW()
    `, [rubro.nombre, rubro.slug]);
  }

  // Primero se reflejan explícitamente los productos que el Excel deja sin
  // rubro. Esto evita conservar una asignación antigua por accidente.
  const codigosSinRubro = normalizados
    .filter((producto) => !producto.rubro)
    .map((producto) => producto.codigo);
  if (codigosSinRubro.length) {
    await ejecutarConsultaCatalogo(cliente, `
      UPDATE catalog_product_settings
      SET category_id=NULL, updated_at=NOW()
      WHERE code = ANY($1::text[])
    `, [codigosSinRubro]);
  }

  const asignaciones = preparados.map((producto) => ({
    code: producto.codigo,
    slug: producto.slug,
  }));

  if (asignaciones.length) {
    // Se actualiza únicamente category_id; visible, destacado, imágenes,
    // unidad de venta y el resto de la configuración comercial se preservan.
    await ejecutarConsultaCatalogo(cliente, `
      INSERT INTO catalog_product_settings(code, category_id, updated_at)
      SELECT x.code, c.category_id, NOW()
      FROM jsonb_to_recordset($1::jsonb) AS x(code TEXT, slug TEXT)
      JOIN catalog_categories c ON c.slug=x.slug
      JOIN product_catalog p ON p.code=x.code
      ON CONFLICT(code) DO UPDATE
        SET category_id=EXCLUDED.category_id, updated_at=NOW()
    `, [JSON.stringify(asignaciones)]);
  }

  // El Excel reemplaza por completo product_catalog. Las configuraciones de
  // códigos que ya no existen se eliminan para evitar registros huérfanos.
  const huerfanos = await ejecutarConsultaCatalogo(cliente, `
    DELETE FROM catalog_product_settings s
    WHERE NOT EXISTS (SELECT 1 FROM product_catalog p WHERE p.code=s.code)
    RETURNING s.code
  `);

  return {
    rubros: rubrosUnicos.length,
    productosAsignados: asignaciones.length,
    productosSinRubro: codigosSinRubro.length,
    configuracionesHuerfanasEliminadas: huerfanos.rowCount || 0,
  };
}

async function listarProductosCatalogoAdminDb(opciones = {}) {
  await asegurarEsquemaCatalogoPublico();
  const pagina = enteroEnRango(opciones.pagina, 1, 100000, 1);
  const limite = enteroEnRango(opciones.limite, 10, 100, 50);
  const offset = (pagina - 1) * limite;
  const busqueda = normalizarBusqueda(opciones.busqueda);
  const rubro = textoLimitado(opciones.rubro, 80);
  const estado = textoLimitado(opciones.estado, 30);
  const estadoImagen = textoLimitado(opciones.estadoImagen, 30);
  const condiciones = ["1=1"];
  const parametros = [];
  if (busqueda) {
    parametros.push(`%${busqueda}%`);
    const i = parametros.length;
    condiciones.push(`(p.article ILIKE $${i} OR p.code ILIKE $${i} OR COALESCE(s.brand,'') ILIKE $${i} OR COALESCE(s.presentation,'') ILIKE $${i})`);
  }
  if (rubro && rubro !== "todos") {
    if (rubro === "sin-rubro") condiciones.push("s.category_id IS NULL");
    else {
      parametros.push(rubro);
      condiciones.push(`s.category_id::text=$${parametros.length}`);
    }
  }
  if (estado === "visible") condiciones.push("s.visible=TRUE");
  else if (estado === "oculto") condiciones.push("COALESCE(s.visible,FALSE)=FALSE");
  else if (estado === "sin-configurar") condiciones.push("s.code IS NULL");
  else if (estado === "destacado") condiciones.push("s.featured=TRUE");
  if (estadoImagen === "confirmada") condiciones.push("s.image_status='confirmada'");
  else if (estadoImagen === "candidato") condiciones.push("s.image_status='candidato'");
  else if (estadoImagen === "buscando") condiciones.push("s.image_status='buscando'");
  else if (estadoImagen === "sin_resultado") condiciones.push("s.image_status='sin_resultado'");
  else if (estadoImagen === "error") condiciones.push("s.image_status='error'");
  else if (estadoImagen === "sin_imagen") condiciones.push("COALESCE(s.image_status,'sin_imagen')='sin_imagen'");
  const where = condiciones.join(" AND ");
  const conteo = await query(`
    SELECT COUNT(*)::int AS total
    FROM product_catalog p
    LEFT JOIN catalog_product_settings s ON s.code=p.code
    WHERE ${where}
  `, parametros);
  parametros.push(limite, offset);
  const r = await query(`
    SELECT p.code, p.article, p.price,
           s.category_id, c.name AS category_name,
           COALESCE(s.brand,'') AS brand,
           COALESCE(s.presentation,'') AS presentation,
           COALESCE(s.sale_unit,'unidad') AS sale_unit,
           COALESCE(s.image_url,'') AS image_url,
           COALESCE(s.image_status,'sin_imagen') AS image_status,
           COALESCE(s.image_source,'') AS image_source,
           COALESCE(s.image_candidate_url,'') AS image_candidate_url,
           COALESCE(s.image_candidate_source,'') AS image_candidate_source,
           COALESCE(s.image_candidate_title,'') AS image_candidate_title,
           COALESCE(s.image_candidate_score,0) AS image_candidate_score,
           COALESCE(s.image_candidates,'[]'::jsonb) AS image_candidates,
           s.image_checked_at, COALESCE(s.image_error,'') AS image_error,
           COALESCE(s.visible,FALSE) AS visible,
           COALESCE(s.featured,FALSE) AS featured,
           COALESCE(s.sort_order,0) AS sort_order,
           (s.code IS NOT NULL) AS configured
    FROM product_catalog p
    LEFT JOIN catalog_product_settings s ON s.code=p.code
    LEFT JOIN catalog_categories c ON c.category_id=s.category_id
    WHERE ${where}
    ORDER BY COALESCE(s.visible,FALSE) DESC, COALESCE(c.name,'zzzzzzzz'), p.article, p.code
    LIMIT $${parametros.length - 1} OFFSET $${parametros.length}
  `, parametros);
  const total = Number(conteo.rows[0]?.total) || 0;
  return {
    pagina,
    limite,
    total,
    paginas: total ? Math.ceil(total / limite) : 0,
    productos: r.rows.map((f) => ({
      codigo: String(f.code || ""),
      nombre: String(f.article || ""),
      precio: f.price === null || f.price === undefined ? null : Number(f.price),
      rubroId: f.category_id === null || f.category_id === undefined ? null : Number(f.category_id),
      rubro: String(f.category_name || ""),
      marca: String(f.brand || ""),
      presentacion: String(f.presentation || ""),
      unidadVenta: String(f.sale_unit || "unidad"),
      imagen: String(f.image_url || ""),
      estadoImagen: normalizarEstadoImagen(f.image_status),
      fuenteImagen: String(f.image_source || ""),
      candidatoImagen: String(f.image_candidate_url || ""),
      candidatoFuente: String(f.image_candidate_source || ""),
      candidatoTitulo: String(f.image_candidate_title || ""),
      candidatoPuntaje: Number(f.image_candidate_score) || 0,
      candidatosImagen: Array.isArray(f.image_candidates) ? f.image_candidates : [],
      imagenRevisadaEn: f.image_checked_at || null,
      errorImagen: String(f.image_error || ""),
      visible: Boolean(f.visible),
      destacado: Boolean(f.featured),
      orden: Number(f.sort_order) || 0,
      configurado: Boolean(f.configured),
    })),
  };
}

async function obtenerProductoCatalogoAdminDb(codigo) {
  await asegurarEsquemaCatalogoPublico();
  const code = textoLimitado(codigo, 160);
  if (!code) return null;
  const r = await query(`
    SELECT p.code, p.article, p.price,
           s.category_id, c.name AS category_name,
           COALESCE(s.brand,'') AS brand,
           COALESCE(s.presentation,'') AS presentation,
           COALESCE(s.sale_unit,'unidad') AS sale_unit,
           COALESCE(s.image_url,'') AS image_url,
           COALESCE(s.image_status,'sin_imagen') AS image_status,
           COALESCE(s.image_source,'') AS image_source,
           COALESCE(s.image_candidate_url,'') AS image_candidate_url,
           COALESCE(s.image_candidate_source,'') AS image_candidate_source,
           COALESCE(s.image_candidate_title,'') AS image_candidate_title,
           COALESCE(s.image_candidate_score,0) AS image_candidate_score,
           COALESCE(s.image_candidates,'[]'::jsonb) AS image_candidates,
           s.image_checked_at, COALESCE(s.image_error,'') AS image_error,
           COALESCE(s.visible,FALSE) AS visible,
           COALESCE(s.featured,FALSE) AS featured,
           COALESCE(s.sort_order,0) AS sort_order,
           (s.code IS NOT NULL) AS configured
    FROM product_catalog p
    LEFT JOIN catalog_product_settings s ON s.code=p.code
    LEFT JOIN catalog_categories c ON c.category_id=s.category_id
    WHERE p.code=$1
    ORDER BY p.catalog_id
    LIMIT 1
  `, [code]);
  const f = r.rows[0];
  if (!f) return null;
  return {
    codigo: String(f.code || ""),
    nombre: String(f.article || ""),
    precio: f.price === null || f.price === undefined ? null : Number(f.price),
    rubroId: f.category_id === null || f.category_id === undefined ? null : Number(f.category_id),
    rubro: String(f.category_name || ""),
    marca: String(f.brand || ""),
    presentacion: String(f.presentation || ""),
    unidadVenta: String(f.sale_unit || "unidad"),
    imagen: String(f.image_url || ""),
    fuenteImagen: String(f.image_source || ""),
    estadoImagen: normalizarEstadoImagen(f.image_status),
    candidatoImagen: String(f.image_candidate_url || ""),
    candidatoFuente: String(f.image_candidate_source || ""),
    candidatoTitulo: String(f.image_candidate_title || ""),
    candidatoPuntaje: Number(f.image_candidate_score) || 0,
    imagenRevisadaEn: f.image_checked_at || null,
    errorImagen: String(f.image_error || ""),
    visible: Boolean(f.visible),
    destacado: Boolean(f.featured),
    orden: Number(f.sort_order) || 0,
    configurado: Boolean(f.configured),
  };
}

async function actualizarProductoCatalogoAdminDb(codigo, cambios = {}) {
  await asegurarEsquemaCatalogoPublico();
  const code = textoLimitado(codigo, 160);
  if (!code) throw new Error("Código de producto inválido");
  const maestro = await query(`SELECT code, article, price FROM product_catalog WHERE code=$1 ORDER BY catalog_id LIMIT 1`, [code]);
  if (!maestro.rowCount) throw new Error("El producto no existe en el catálogo maestro");
  const base = maestro.rows[0];
  const settings = await query(`SELECT * FROM catalog_product_settings WHERE code=$1`, [code]);
  const s = settings.rows[0] || {};

  const nombre = cambios.nombre === undefined ? String(base.article || "") : textoLimitado(cambios.nombre, 220);
  if (!nombre) throw new Error("El nombre del producto es obligatorio");
  let precio = base.price;
  if (cambios.precio !== undefined) {
    if (cambios.precio === null || cambios.precio === "") precio = null;
    else {
      precio = Number(cambios.precio);
      if (!Number.isFinite(precio) || precio < 0) throw new Error("El precio no es válido");
    }
  }
  await query(`UPDATE product_catalog SET article=$2, price=$3, updated_at=NOW() WHERE code=$1`, [code, nombre, precio]);

  let categoryId = cambios.rubroId === undefined ? (s.category_id ?? null) : cambios.rubroId;
  if (categoryId === "" || categoryId === null) categoryId = null;
  else {
    categoryId = Number(categoryId);
    if (!Number.isInteger(categoryId) || categoryId < 1) throw new Error("El rubro seleccionado no es válido");
    const rubro = await query(`SELECT 1 FROM catalog_categories WHERE category_id=$1`, [categoryId]);
    if (!rubro.rowCount) throw new Error("El rubro seleccionado no existe");
  }
  const saleUnit = cambios.unidadVenta === undefined ? (s.sale_unit || "unidad") : textoLimitado(cambios.unidadVenta, 30).toLowerCase();
  if (!UNIDADES_VENTA.includes(saleUnit)) throw new Error("La unidad de venta no es válida");
  const visibleFinal = cambios.visible === undefined ? Boolean(s.visible) : booleano(cambios.visible, Boolean(s.visible));
  if (visibleFinal && !categoryId) throw new Error("Asigná un rubro antes de hacer visible el producto");
  await query(`
    INSERT INTO catalog_product_settings(code, category_id, brand, presentation, sale_unit, image_url, image_source, image_status, visible, featured, sort_order, updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT(code) DO UPDATE SET
      category_id=EXCLUDED.category_id,
      brand=EXCLUDED.brand,
      presentation=EXCLUDED.presentation,
      sale_unit=EXCLUDED.sale_unit,
      image_url=EXCLUDED.image_url,
      image_source=EXCLUDED.image_source,
      image_status=EXCLUDED.image_status,
      visible=EXCLUDED.visible,
      featured=EXCLUDED.featured,
      sort_order=EXCLUDED.sort_order,
      updated_at=NOW()
  `, [
    code,
    categoryId,
    cambios.marca === undefined ? String(s.brand || "") : textoLimitado(cambios.marca, 120),
    cambios.presentacion === undefined ? String(s.presentation || "") : textoLimitado(cambios.presentacion, 120),
    saleUnit,
    String(s.image_url || ""),
    String(s.image_source || ""),
    normalizarEstadoImagen(s.image_status),
    visibleFinal,
    cambios.destacado === undefined ? Boolean(s.featured) : booleano(cambios.destacado, Boolean(s.featured)),
    Number(s.sort_order) || 0,
  ]);
  return obtenerProductoCatalogoAdminDb(code);
}

async function actualizarVisibilidadProductoCatalogoAdminDb(codigo, visible) {
  return actualizarProductoCatalogoAdminDb(codigo, { visible });
}

async function actualizarVisibilidadMasivaCatalogoAdminDb({ visible, rubroId = null } = {}) {
  await asegurarEsquemaCatalogoPublico();
  const hacerVisible = booleano(visible, false);
  let categoria = rubroId;
  if (categoria === "" || categoria === undefined || categoria === null) categoria = null;
  else {
    categoria = Number(categoria);
    if (!Number.isInteger(categoria) || categoria < 1) throw new Error("El rubro seleccionado no es válido");
    const existe = await query(`SELECT 1 FROM catalog_categories WHERE category_id=$1 LIMIT 1`, [categoria]);
    if (!existe.rowCount) throw new Error("El rubro seleccionado no existe");
  }

  const params = [];
  let filtroRubro = "";
  if (categoria !== null) {
    params.push(categoria);
    filtroRubro = ` AND s.category_id=$${params.length}`;
  }

  if (hacerVisible) {
    const r = await query(`
      UPDATE catalog_product_settings s
      SET visible=TRUE, updated_at=NOW()
      FROM product_catalog p
      WHERE s.code=p.code
        AND s.category_id IS NOT NULL
        AND s.visible IS DISTINCT FROM TRUE
        ${filtroRubro}
      RETURNING s.code
    `, params);
    const sinRubro = categoria === null
      ? await query(`
          SELECT COUNT(*)::int AS total
          FROM product_catalog p
          LEFT JOIN catalog_product_settings s ON s.code=p.code
          WHERE s.category_id IS NULL
        `)
      : { rows: [{ total: 0 }] };
    return {
      visible: true,
      rubroId: categoria,
      actualizados: r.rowCount,
      omitidosSinRubro: Number(sinRubro.rows[0]?.total) || 0,
    };
  }

  const r = await query(`
    UPDATE catalog_product_settings s
    SET visible=FALSE, updated_at=NOW()
    FROM product_catalog p
    WHERE s.code=p.code
      AND s.visible IS DISTINCT FROM FALSE
      ${filtroRubro}
    RETURNING s.code
  `, params);
  return {
    visible: false,
    rubroId: categoria,
    actualizados: r.rowCount,
    omitidosSinRubro: 0,
  };
}

async function guardarResultadoImagenCatalogoDb(codigo, datos = {}, opciones = {}) {
  await asegurarEsquemaCatalogoPublico();
  const code = textoLimitado(codigo, 160);
  if (!code) throw new Error("Código de producto inválido");
  const existe = await query(`SELECT 1 FROM product_catalog WHERE code=$1 LIMIT 1`, [code]);
  if (!existe.rowCount) throw new Error("El producto no existe en el catálogo maestro");
  const actual = await query(`SELECT * FROM catalog_product_settings WHERE code=$1`, [code]);
  const s = actual.rows[0] || {};
  const estadoActual = normalizarEstadoImagen(s.image_status);
  const estadoSolicitado = normalizarEstadoImagen(datos.estado === undefined ? estadoActual : datos.estado);
  const forzarConfirmada = opciones.forzarConfirmada === true;

  // Regla central P1A: una imagen binaria confirmada es permanente. Solo una
  // acción explícita de reemplazo/quitar puede modificarla.
  if (tieneImagenConfirmada(s) && !forzarConfirmada) {
    const intentaModificarConfirmada = datos.estado !== undefined
      || datos.imagen !== undefined
      || datos.fuente !== undefined
      || datos.imagenData !== undefined
      || datos.imagenMime !== undefined
      || datos.candidatoUrl !== undefined
      || datos.candidatoFuente !== undefined
      || datos.candidatoTitulo !== undefined
      || datos.candidatoPuntaje !== undefined
      || datos.candidatoData !== undefined
      || datos.candidatoMime !== undefined
      || datos.candidatos !== undefined;
    if (intentaModificarConfirmada) {
      throw new Error("La imagen confirmada está protegida y no puede ser sobrescrita automáticamente");
    }
  }
  const estado = validarTransicionImagen(estadoActual, estadoSolicitado, { forzar: forzarConfirmada });

  await query(`
    INSERT INTO catalog_product_settings(
      code, category_id, brand, presentation, sale_unit,
      image_url, image_source, image_status, image_data, image_mime,
      image_candidate_url, image_candidate_source, image_candidate_title, image_candidate_score, image_candidate_data, image_candidate_mime, image_candidates,
      image_checked_at, image_error, visible, featured, sort_order, updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,NOW(),$18,$19,$20,$21,NOW())
    ON CONFLICT(code) DO UPDATE SET
      image_url=EXCLUDED.image_url,
      image_source=EXCLUDED.image_source,
      image_status=EXCLUDED.image_status,
      image_data=EXCLUDED.image_data,
      image_mime=EXCLUDED.image_mime,
      image_candidate_url=EXCLUDED.image_candidate_url,
      image_candidate_source=EXCLUDED.image_candidate_source,
      image_candidate_title=EXCLUDED.image_candidate_title,
      image_candidate_score=EXCLUDED.image_candidate_score,
      image_candidate_data=EXCLUDED.image_candidate_data,
      image_candidate_mime=EXCLUDED.image_candidate_mime,
      image_candidates=EXCLUDED.image_candidates,
      image_checked_at=NOW(),
      image_error=EXCLUDED.image_error,
      updated_at=NOW()
  `, [
    code,
    s.category_id ?? null,
    String(s.brand || ""),
    String(s.presentation || ""),
    String(s.sale_unit || "unidad"),
    datos.imagen === undefined ? String(s.image_url || "") : textoLimitado(datos.imagen, 1200),
    datos.fuente === undefined ? String(s.image_source || "") : textoLimitado(datos.fuente, 160),
    estado,
    datos.imagenData === undefined ? (s.image_data || null) : (datos.imagenData || null),
    datos.imagenMime === undefined ? String(s.image_mime || "") : textoLimitado(datos.imagenMime, 80),
    datos.candidatoUrl === undefined ? String(s.image_candidate_url || "") : textoLimitado(datos.candidatoUrl, 1200),
    datos.candidatoFuente === undefined ? String(s.image_candidate_source || "") : textoLimitado(datos.candidatoFuente, 160),
    datos.candidatoTitulo === undefined ? String(s.image_candidate_title || "") : textoLimitado(datos.candidatoTitulo, 220),
    datos.candidatoPuntaje === undefined ? Number(s.image_candidate_score) || 0 : enteroEnRango(datos.candidatoPuntaje, 0, 100, 0),
    datos.candidatoData === undefined ? (s.image_candidate_data || null) : (datos.candidatoData || null),
    datos.candidatoMime === undefined ? String(s.image_candidate_mime || "") : textoLimitado(datos.candidatoMime, 80),
    JSON.stringify(datos.candidatos === undefined ? (Array.isArray(s.image_candidates) ? s.image_candidates : []) : (Array.isArray(datos.candidatos) ? datos.candidatos.slice(0, 24) : [])),
    datos.error === undefined ? String(s.image_error || "") : textoLimitado(datos.error, 500),
    Boolean(s.visible),
    Boolean(s.featured),
    Number(s.sort_order) || 0,
  ]);
  return obtenerProductoCatalogoAdminDb(code);
}

async function confirmarCandidatoImagenCatalogoDb(codigo) {
  await asegurarEsquemaCatalogoPublico();
  const code = textoLimitado(codigo, 160);
  const r = await query(`SELECT image_candidate_url, image_candidate_source, image_candidate_data, image_candidate_mime FROM catalog_product_settings WHERE code=$1`, [code]);
  if (!r.rowCount || !r.rows[0].image_candidate_data) throw new Error("No hay una imagen candidata descargada para confirmar");
  return guardarResultadoImagenCatalogoDb(code, {
    imagen: r.rows[0].image_candidate_url || "",
    fuente: r.rows[0].image_candidate_source || "Revisión manual",
    estado: ESTADOS_IMAGEN.CONFIRMADA,
    imagenData: r.rows[0].image_candidate_data,
    imagenMime: r.rows[0].image_candidate_mime || "image/jpeg",
    candidatoUrl: "",
    candidatoFuente: "",
    candidatoTitulo: "",
    candidatoPuntaje: 0,
    candidatoData: null,
    candidatoMime: "",
    candidatos: [],
    error: "",
  });
}

async function obtenerImagenCatalogoDb(codigo, tipo = "confirmada") {
  await asegurarEsquemaCatalogoPublico();
  const code = textoLimitado(codigo, 160);
  const r = await query(`SELECT image_status, image_data, image_mime, image_candidate_data, image_candidate_mime FROM catalog_product_settings WHERE code=$1`, [code]);
  if (!r.rowCount) return null;
  const f = r.rows[0];
  if (tipo === "candidato") {
    if (normalizarEstadoImagen(f.image_status) !== ESTADOS_IMAGEN.CANDIDATO || !f.image_candidate_data) return null;
    return { data: f.image_candidate_data, mime: String(f.image_candidate_mime || "image/jpeg") };
  }
  if (normalizarEstadoImagen(f.image_status) !== ESTADOS_IMAGEN.CONFIRMADA || !f.image_data) return null;
  return { data: f.image_data, mime: String(f.image_mime || "image/jpeg") };
}

async function quitarImagenCatalogoDb(codigo) {
  return guardarResultadoImagenCatalogoDb(codigo, {
    imagen: "",
    fuente: "",
    estado: "sin_imagen",
    candidatoUrl: "",
    candidatoFuente: "",
    candidatoTitulo: "",
    candidatoPuntaje: 0,
    imagenData: null,
    imagenMime: "",
    candidatoData: null,
    candidatoMime: "",
    candidatos: [],
    error: "",
  }, { forzarConfirmada: true });
}

async function obtenerEstadoProcesoImagenesDb() {
  await asegurarEsquemaCatalogoPublico();
  const r = await query(`SELECT * FROM catalog_image_batch_state WHERE batch_id=1`);
  const f = r.rows[0] || {};
  return {
    estado: String(f.status || "idle"),
    iniciadoEn: f.started_at || null,
    finalizadoEn: f.finished_at || null,
    procesados: Number(f.processed) || 0,
    confirmadas: Number(f.confirmed) || 0,
    revisar: Number(f.review) || 0,
    sinResultado: Number(f.no_result) || 0,
    errores: Number(f.errors) || 0,
    omitidas: Number(f.skipped) || 0,
    totalObjetivo: Number(f.total_target) || 0,
    ultimoCodigo: String(f.last_code || ""),
    mensaje: String(f.message || ""),
    actualizadoEn: f.updated_at || null,
  };
}

async function iniciarProcesoImagenesDb({ reanudar = false } = {}) {
  await asegurarEsquemaCatalogoPublico();
  const actual = await obtenerEstadoProcesoImagenesDb();
  if (reanudar && actual.estado === "paused" && actual.iniciadoEn) {
    await query(`UPDATE catalog_image_batch_state
      SET status='running', finished_at=NULL, message='', updated_at=NOW()
      WHERE batch_id=1`);
    return obtenerEstadoProcesoImagenesDb();
  }
  const c = await query(`
    SELECT COUNT(*)::int AS total
    FROM product_catalog p
    LEFT JOIN catalog_product_settings s ON s.code=p.code
    WHERE COALESCE(s.image_status,'sin_imagen') <> 'confirmada' AND s.image_data IS NULL
  `);
  const total = Number(c.rows[0]?.total) || 0;
  await query(`UPDATE catalog_image_batch_state SET
    status='running', started_at=NOW(), finished_at=NULL,
    processed=0, confirmed=0, review=0, no_result=0, errors=0, skipped=0,
    total_target=$1, last_code='', message='', updated_at=NOW()
    WHERE batch_id=1`, [total]);
  return obtenerEstadoProcesoImagenesDb();
}

async function pausarProcesoImagenesDb() {
  await asegurarEsquemaCatalogoPublico();
  await query(`UPDATE catalog_image_batch_state
    SET status=CASE WHEN status='running' THEN 'paused' ELSE status END,
        message=CASE WHEN status='running' THEN 'Pausado por el usuario' ELSE message END,
        updated_at=NOW()
    WHERE batch_id=1`);
  return obtenerEstadoProcesoImagenesDb();
}

async function finalizarProcesoImagenesDb(mensaje = "") {
  await asegurarEsquemaCatalogoPublico();
  await query(`UPDATE catalog_image_batch_state
    SET status='finished', finished_at=NOW(), message=$1, updated_at=NOW()
    WHERE batch_id=1`, [textoLimitado(mensaje, 500)]);
  return obtenerEstadoProcesoImagenesDb();
}

async function sumarResultadoProcesoImagenesDb(tipo, codigo = "") {
  await asegurarEsquemaCatalogoPublico();
  const columnas = {
    confirmada: "confirmed",
    revisar: "review",
    sin_resultado: "no_result",
    error: "errors",
    omitida: "skipped",
  };
  const columna = columnas[tipo] || "errors";
  await query(`UPDATE catalog_image_batch_state
    SET processed=processed+1, ${columna}=${columna}+1, last_code=$1, updated_at=NOW()
    WHERE batch_id=1`, [textoLimitado(codigo, 160)]);
  return obtenerEstadoProcesoImagenesDb();
}

async function listarPendientesProcesoImagenesDb(limite = 10) {
  await asegurarEsquemaCatalogoPublico();
  const cantidad = enteroEnRango(limite, 1, 30, 10);
  const estado = await obtenerEstadoProcesoImagenesDb();
  if (!estado.iniciadoEn) return [];
  const r = await query(`
    SELECT p.code
    FROM product_catalog p
    LEFT JOIN catalog_product_settings s ON s.code=p.code
    WHERE p.stock > 0
      AND COALESCE(s.image_status,'sin_imagen') <> 'confirmada'
      AND s.image_data IS NULL
      AND (s.image_checked_at IS NULL OR s.image_checked_at < $2)
    ORDER BY s.image_checked_at NULLS FIRST, p.catalog_id
    LIMIT $1
  `, [cantidad, estado.iniciadoEn]);
  return r.rows.map((f) => ({ codigo: String(f.code || "") }));
}

module.exports = {
  UNIDADES_VENTA,
  ESTADOS_IMAGEN: ESTADOS_IMAGEN_VALIDOS,
  asegurarEsquemaCatalogoPublico,
  obtenerEstadoCatalogoPublicoDb,
  listarRubrosPublicosDb,
  listarProductosPublicosDb,
  obtenerEstadoCatalogoAdminDb,
  listarRubrosAdminDb,
  crearRubroCatalogoAdminDb,
  actualizarRubroCatalogoAdminDb,
  eliminarRubroCatalogoAdminDb,
  listarProductosCatalogoAdminDb,
  obtenerProductoCatalogoAdminDb,
  actualizarProductoCatalogoAdminDb,
  actualizarVisibilidadProductoCatalogoAdminDb,
  actualizarVisibilidadMasivaCatalogoAdminDb,
  guardarResultadoImagenCatalogoDb,
  confirmarCandidatoImagenCatalogoDb,
  obtenerImagenCatalogoDb,
  quitarImagenCatalogoDb,
  obtenerEstadoProcesoImagenesDb,
  iniciarProcesoImagenesDb,
  pausarProcesoImagenesDb,
  finalizarProcesoImagenesDb,
  sumarResultadoProcesoImagenesDb,
  listarPendientesProcesoImagenesDb,
  sincronizarVisibilidadStockCatalogoDb,
  sincronizarRubrosImportadosCatalogoDb,
};
