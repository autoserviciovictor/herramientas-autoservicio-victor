const crypto = require("crypto");
const { obtenerPool, query } = require("./db");

let esquemaAsegurado = false;
let promesaEsquema = null;

const ESTADOS_PEDIDO = ["recibido", "preparando", "listo", "entregado", "cancelado"];
const FORMAS_PAGO = ["Efectivo", "Tarjeta", "Transferencia", "Mercado Pago"];
const TIPOS_ENTREGA = ["delivery", "retiro"];
const HORARIOS_DELIVERY = ["12:00", "17:00"];
const PEDIDO_MINIMO_DELIVERY = 50000;

function texto(valor, maximo = 160) {
  return String(valor == null ? "" : valor).trim().replace(/\s+/g, " ").slice(0, maximo);
}

function telefono(valor) {
  return texto(valor, 30).replace(/[^\d+ ()-]/g, "");
}

function cantidad(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 999) return 0;
  return n;
}

function tokenCliente(valor) {
  const token = texto(valor, 100);
  return /^[a-zA-Z0-9_-]{12,100}$/.test(token) ? token : "";
}

function tokenCuenta(valor) {
  const token = texto(valor, 100);
  return /^[a-zA-Z0-9_-]{20,100}$/.test(token) ? token : "";
}

async function asegurarEsquemaCatalogoPedidos() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;

  promesaEsquema = (async () => {
    await query(`CREATE SEQUENCE IF NOT EXISTS catalog_order_number_seq START WITH 1`);

    await query(`CREATE TABLE IF NOT EXISTS catalog_orders (
      order_id BIGSERIAL PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      client_token TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      delivery_type TEXT NOT NULL,
      delivery_address TEXT NOT NULL DEFAULT '',
      delivery_reference TEXT NOT NULL DEFAULT '',
      delivery_time TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recibido',
      total NUMERIC(14,2) NOT NULL DEFAULT 0,
      item_units INTEGER NOT NULL DEFAULT 0,
      item_lines INTEGER NOT NULL DEFAULT 0,
      whatsapp_opened BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_orders_delivery_type_valid CHECK (delivery_type IN ('delivery','retiro')),
      CONSTRAINT catalog_orders_payment_valid CHECK (payment_method IN ('Efectivo','Tarjeta','Transferencia','Mercado Pago')),
      CONSTRAINT catalog_orders_status_valid CHECK (status IN ('recibido','preparando','listo','entregado','cancelado')),
      CONSTRAINT catalog_orders_total_nonnegative CHECK (total >= 0),
      CONSTRAINT catalog_orders_customer_name_nonempty CHECK (length(btrim(customer_name)) >= 3),
      CONSTRAINT catalog_orders_customer_phone_nonempty CHECK (length(btrim(customer_phone)) >= 8)
    )`);

    // Migración compatible con instalaciones donde catalog_orders ya existía
    // antes de incorporar client_token. CREATE TABLE IF NOT EXISTS no agrega
    // columnas nuevas sobre una tabla existente, por eso se asegura aquí.
    await query(`ALTER TABLE catalog_orders
      ADD COLUMN IF NOT EXISTS client_token TEXT`);
    await query(`UPDATE catalog_orders
      SET client_token='legacy_' || order_id::text
      WHERE client_token IS NULL OR btrim(client_token)=''`);
    await query(`ALTER TABLE catalog_orders
      ALTER COLUMN client_token SET NOT NULL`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS catalog_orders_client_token_unique_idx
      ON catalog_orders(client_token)`);

    await query(`CREATE INDEX IF NOT EXISTS catalog_orders_created_idx ON catalog_orders(created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_orders_status_idx ON catalog_orders(status, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_orders_phone_idx ON catalog_orders(customer_phone, created_at DESC)`);
    await query(`ALTER TABLE catalog_orders ADD COLUMN IF NOT EXISTS customer_token TEXT NOT NULL DEFAULT ''`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_orders_customer_token_idx ON catalog_orders(customer_token, created_at DESC)`);

    await query(`CREATE TABLE IF NOT EXISTS catalog_order_items (
      order_item_id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES catalog_orders(order_id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      article TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(14,2) NOT NULL,
      line_total NUMERIC(14,2) NOT NULL,
      sale_unit TEXT NOT NULL DEFAULT 'unidad',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_order_items_quantity_valid CHECK (quantity BETWEEN 1 AND 999),
      CONSTRAINT catalog_order_items_price_nonnegative CHECK (unit_price >= 0 AND line_total >= 0)
    )`);
    await query(`ALTER TABLE catalog_orders
      ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE catalog_orders
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_orders_archived_idx
      ON catalog_orders(archived_at, created_at DESC)`);

    await query(`CREATE INDEX IF NOT EXISTS catalog_order_items_order_idx ON catalog_order_items(order_id, order_item_id)`);

    await query(`CREATE TABLE IF NOT EXISTS catalog_order_status_history (
      history_id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES catalog_orders(order_id) ON DELETE CASCADE,
      previous_status TEXT NOT NULL DEFAULT '',
      new_status TEXT NOT NULL,
      actor_user TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_order_status_history_new_valid CHECK (new_status IN ('recibido','preparando','listo','entregado','cancelado'))
    )`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_order_status_history_order_idx
      ON catalog_order_status_history(order_id, created_at, history_id)`);

    await query(`INSERT INTO catalog_order_status_history(
        order_id, previous_status, new_status, actor_user, actor_name, actor_role, source, created_at
      )
      SELECT o.order_id, '', 'recibido', 'catalogo', 'Catálogo online', 'sistema', 'catalogo', o.created_at
        FROM catalog_orders o
       WHERE NOT EXISTS (
         SELECT 1 FROM catalog_order_status_history h WHERE h.order_id=o.order_id
       )`);

    esquemaAsegurado = true;
  })();

  try {
    await promesaEsquema;
  } finally {
    promesaEsquema = null;
  }
}

function validarCabeceraPedido(pedido = {}) {
  const nombre = texto(pedido.nombre, 80);
  const tel = telefono(pedido.telefono);
  const entrega = texto(pedido.entrega, 20).toLowerCase();
  const direccion = texto(pedido.direccion, 160);
  const referencia = texto(pedido.referencia, 160);
  const horario = texto(pedido.horario, 10);
  const pago = texto(pedido.pago, 40);
  const clientToken = tokenCliente(pedido.clientToken);
  const customerToken = tokenCuenta(pedido.customerToken);

  if (nombre.length < 3) throw Object.assign(new Error("Ingresá nombre y apellido"), { status: 400 });
  if (tel.replace(/\D/g, "").length < 8) throw Object.assign(new Error("Ingresá un teléfono válido"), { status: 400 });
  if (!TIPOS_ENTREGA.includes(entrega)) throw Object.assign(new Error("Tipo de entrega inválido"), { status: 400 });
  if (!FORMAS_PAGO.includes(pago)) throw Object.assign(new Error("Forma de pago inválida"), { status: 400 });
  if (!clientToken) throw Object.assign(new Error("Identificador de pedido inválido"), { status: 400 });

  if (entrega === "delivery") {
    if (direccion.length < 5) throw Object.assign(new Error("Ingresá la dirección de entrega"), { status: 400 });
    if (!HORARIOS_DELIVERY.includes(horario)) throw Object.assign(new Error("Horario de delivery inválido"), { status: 400 });
  }

  return {
    nombre, telefono: tel, entrega,
    direccion: entrega === "delivery" ? direccion : "",
    referencia: entrega === "delivery" ? referencia : "",
    horario: entrega === "delivery" ? horario : "",
    pago, clientToken, customerToken,
  };
}

async function cargarProductosAutoritativos(cliente, items = []) {
  if (!Array.isArray(items) || !items.length || items.length > 150) {
    throw Object.assign(new Error("El pedido debe tener entre 1 y 150 productos"), { status: 400 });
  }

  const consolidados = new Map();
  for (const item of items) {
    const code = texto(item?.codigo, 160);
    const qty = cantidad(item?.cantidad);
    if (!code || !qty) throw Object.assign(new Error("Hay un producto o cantidad inválida"), { status: 400 });
    consolidados.set(code, Math.min(999, (consolidados.get(code) || 0) + qty));
  }

  const codigos = [...consolidados.keys()];
  const r = await cliente.query(
    `SELECT p.code, p.article, p.price, COALESCE(s.sale_unit,'unidad') AS sale_unit
       FROM product_catalog p
       JOIN catalog_product_settings s ON s.code=p.code
       JOIN catalog_categories c ON c.category_id=s.category_id
      WHERE p.code = ANY($1::text[]) AND s.visible=TRUE AND c.active=TRUE`,
    [codigos],
  );

  if (r.rows.length !== codigos.length) {
    throw Object.assign(new Error("Uno o más productos ya no están disponibles en el catálogo"), { status: 409 });
  }

  const porCodigo = new Map(r.rows.map((x) => [String(x.code), x]));
  return codigos.map((code) => {
    const p = porCodigo.get(code);
    const qty = consolidados.get(code);
    const precio = Number(p.price) || 0;
    return {
      codigo: code,
      nombre: String(p.article || ""),
      cantidad: qty,
      precio,
      total: Math.round(precio * qty * 100) / 100,
      unidadVenta: String(p.sale_unit || "unidad"),
    };
  });
}

async function numeroPedidoSiguiente(cliente) {
  const r = await cliente.query(`SELECT nextval('catalog_order_number_seq')::bigint AS n`);
  const n = Number(r.rows[0]?.n) || 1;
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date()).replaceAll("-", "");
  return `CAT-${fecha}-${String(n).padStart(6, "0")}`;
}

async function obtenerPedidoPorTokenDb(clientToken) {
  await asegurarEsquemaCatalogoPedidos();
  const r = await query(
    `SELECT order_id, order_number, total, status, created_at
       FROM catalog_orders WHERE client_token=$1 LIMIT 1`,
    [tokenCliente(clientToken)],
  );
  if (!r.rowCount) return null;
  const f = r.rows[0];
  return {
    id: Number(f.order_id),
    numero: String(f.order_number),
    total: Number(f.total) || 0,
    estado: String(f.status),
    creadoEn: f.created_at,
    existente: true,
  };
}

async function crearPedidoCatalogoDb(pedido = {}) {
  await asegurarEsquemaCatalogoPedidos();
  const cabecera = validarCabeceraPedido(pedido);

  const yaExiste = await obtenerPedidoPorTokenDb(cabecera.clientToken);
  if (yaExiste) return yaExiste;

  const pool = obtenerPool();
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    const productos = await cargarProductosAutoritativos(cliente, pedido.items);
    const total = Math.round(productos.reduce((acc, x) => acc + x.total, 0) * 100) / 100;
    const unidades = productos.reduce((acc, x) => acc + x.cantidad, 0);

    if (cabecera.entrega === "delivery" && total < PEDIDO_MINIMO_DELIVERY) {
      throw Object.assign(
        new Error(`El pedido mínimo para delivery es $ ${PEDIDO_MINIMO_DELIVERY.toLocaleString("es-AR")}`),
        { status: 400 },
      );
    }

    const numero = await numeroPedidoSiguiente(cliente);
    const ins = await cliente.query(
      `INSERT INTO catalog_orders(
        order_number, client_token, customer_name, customer_phone,
        delivery_type, delivery_address, delivery_reference, delivery_time,
        payment_method, status, total, item_units, item_lines, customer_token
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'recibido',$10,$11,$12,$13)
      RETURNING order_id, created_at`,
      [
        numero, cabecera.clientToken, cabecera.nombre, cabecera.telefono,
        cabecera.entrega, cabecera.direccion, cabecera.referencia, cabecera.horario,
        cabecera.pago, total, unidades, productos.length, cabecera.customerToken,
      ],
    );
    const orderId = Number(ins.rows[0].order_id);

    for (const p of productos) {
      await cliente.query(
        `INSERT INTO catalog_order_items(order_id, code, article, quantity, unit_price, line_total, sale_unit)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, p.codigo, p.nombre, p.cantidad, p.precio, p.total, p.unidadVenta],
      );
    }

    await cliente.query(
      `INSERT INTO catalog_order_status_history(
        order_id, previous_status, new_status, actor_user, actor_name, actor_role, source, created_at
      ) VALUES($1,'','recibido','catalogo','Catálogo online','sistema','catalogo',$2)`,
      [orderId, ins.rows[0].created_at],
    );

    await cliente.query("COMMIT");
    return {
      id: orderId,
      numero,
      total,
      estado: "recibido",
      creadoEn: ins.rows[0].created_at,
      existente: false,
    };
  } catch (error) {
    await cliente.query("ROLLBACK");
    if (error?.code === "23505" && cabecera.clientToken) {
      const existente = await obtenerPedidoPorTokenDb(cabecera.clientToken);
      if (existente) return existente;
    }
    throw error;
  } finally {
    cliente.release();
  }
}


async function listarPedidosClienteCatalogoDb(customerToken) {
  await asegurarEsquemaCatalogoPedidos();
  const token = tokenCuenta(customerToken);
  if (!token) throw Object.assign(new Error("Identificador de cuenta inválido"), { status: 400 });
  const r = await query(
    `SELECT order_number,status,total,item_units,item_lines,delivery_type,created_at
       FROM catalog_orders
      WHERE customer_token=$1
      ORDER BY created_at DESC
      LIMIT 100`,
    [token],
  );
  return r.rows.map((x) => ({
    numero: String(x.order_number), estado: String(x.status), total: Number(x.total) || 0,
    unidades: Number(x.item_units) || 0, productos: Number(x.item_lines) || 0,
    entrega: String(x.delivery_type), creadoEn: x.created_at,
  }));
}

async function marcarWhatsappAbiertoPedidoDb(numero) {
  await asegurarEsquemaCatalogoPedidos();
  const n = texto(numero, 40);
  if (!n) return false;
  const r = await query(
    `UPDATE catalog_orders SET whatsapp_opened=TRUE, updated_at=NOW()
      WHERE order_number=$1 RETURNING order_id`,
    [n],
  );
  return r.rowCount > 0;
}

async function listarPedidosCatalogoDb({ pagina = 1, limite = 50, estado = "", busqueda = "", fecha = "", archivados = "" } = {}) {
  await asegurarEsquemaCatalogoPedidos();
  await archivarPedidosDiasAnterioresDb();

  const page = Math.max(1, Number(pagina) || 1);
  const max = Math.max(1, Math.min(100, Number(limite) || 50));
  const offset = (page - 1) * max;
  const e = texto(estado, 30);
  const q = texto(busqueda, 120).toLowerCase();
  const f = texto(fecha, 20).toLowerCase();
  const a = texto(archivados, 20).toLowerCase();

  const params = [];
  const where = [];

  if (a === "si") where.push("o.archived_at IS NOT NULL");
  else if (a === "todos") {}
  else where.push("o.archived_at IS NULL");

  if (e && e !== "todos") {
    if (!ESTADOS_PEDIDO.includes(e)) {
      throw Object.assign(new Error("Estado de pedido inválido"), { status: 400 });
    }
    params.push(e);
    where.push(`o.status=$${params.length}`);
  }

  if (f) {
    if (f !== "hoy") {
      throw Object.assign(new Error("Filtro de fecha inválido"), { status: 400 });
    }
    where.push(`(o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date =
                (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`);
  }

  if (q) {
    params.push(`%${q}%`);
    where.push(`(
      LOWER(o.order_number) LIKE $${params.length}
      OR LOWER(o.customer_name) LIKE $${params.length}
      OR LOWER(o.customer_phone) LIKE $${params.length}
      OR LOWER(o.delivery_address) LIKE $${params.length}
    )`);
  }

  const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await query(
    `SELECT COUNT(*)::int AS total
       FROM catalog_orders o
       ${sqlWhere}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.total) || 0;

  const listParams = [...params, max, offset];
  const limiteParam = listParams.length - 1;
  const offsetParam = listParams.length;

  const r = await query(
    `SELECT o.order_id,o.order_number,o.customer_name,o.customer_phone,o.delivery_type,
            o.delivery_address,o.delivery_reference,o.delivery_time,o.payment_method,o.status,
            o.total,o.item_units,o.item_lines,o.whatsapp_opened,o.internal_notes,o.archived_at,o.created_at,o.updated_at
       FROM catalog_orders o
       ${sqlWhere}
      ORDER BY o.created_at DESC
      LIMIT $${limiteParam} OFFSET $${offsetParam}`,
    listParams,
  );

  return {
    pagina: page,
    limite: max,
    total,
    paginas: Math.max(1, Math.ceil(total / max)),
    pedidos: r.rows.map((f) => ({
      id: Number(f.order_id),
      numero: String(f.order_number),
      cliente: String(f.customer_name),
      telefono: String(f.customer_phone),
      entrega: String(f.delivery_type),
      direccion: String(f.delivery_address),
      referencia: String(f.delivery_reference),
      horario: String(f.delivery_time),
      pago: String(f.payment_method),
      estado: String(f.status),
      total: Number(f.total) || 0,
      unidades: Number(f.item_units) || 0,
      productos: Number(f.item_lines) || 0,
      whatsappAbierto: Boolean(f.whatsapp_opened),
      archivado: Boolean(f.archived_at),
      archivadoEn: f.archived_at,
      creadoEn: f.created_at,
      actualizadoEn: f.updated_at,
    })),
  };
}

async function obtenerPedidoCatalogoAdminDb(numero) {
  await asegurarEsquemaCatalogoPedidos();
  const n = texto(numero, 40);
  if (!n) return null;

  const cab = await query(
    `SELECT o.order_id,o.order_number,o.customer_name,o.customer_phone,o.delivery_type,
            o.delivery_address,o.delivery_reference,o.delivery_time,o.payment_method,o.status,
            o.total,o.item_units,o.item_lines,o.whatsapp_opened,o.internal_notes,o.archived_at,o.created_at,o.updated_at
       FROM catalog_orders o
      WHERE o.order_number=$1
      LIMIT 1`,
    [n],
  );
  if (!cab.rowCount) return null;

  const f = cab.rows[0];
  const items = await query(
    `SELECT code,article,quantity,unit_price,line_total,sale_unit
       FROM catalog_order_items
      WHERE order_id=$1
      ORDER BY order_item_id`,
    [f.order_id],
  );

  const historial = await query(
    `SELECT history_id,previous_status,new_status,actor_user,actor_name,actor_role,source,created_at
       FROM catalog_order_status_history
      WHERE order_id=$1
      ORDER BY created_at ASC, history_id ASC`,
    [f.order_id],
  );

  return {
    id: Number(f.order_id),
    numero: String(f.order_number),
    cliente: String(f.customer_name),
    telefono: String(f.customer_phone),
    entrega: String(f.delivery_type),
    direccion: String(f.delivery_address),
    referencia: String(f.delivery_reference),
    horario: String(f.delivery_time),
    pago: String(f.payment_method),
    estado: String(f.status),
    total: Number(f.total) || 0,
    unidades: Number(f.item_units) || 0,
    productos: Number(f.item_lines) || 0,
    whatsappAbierto: Boolean(f.whatsapp_opened),
    archivado: Boolean(f.archived_at),
    archivadoEn: f.archived_at,
    observacionesInternas: String(f.internal_notes || ""),
    creadoEn: f.created_at,
    actualizadoEn: f.updated_at,
    items: items.rows.map((i) => ({
      codigo: String(i.code),
      nombre: String(i.article),
      cantidad: Number(i.quantity) || 0,
      precio: Number(i.unit_price) || 0,
      total: Number(i.line_total) || 0,
      unidadVenta: String(i.sale_unit || "unidad"),
    })),
    historial: historial.rows.map((h) => ({
      id: Number(h.history_id),
      estadoAnterior: String(h.previous_status || ""),
      estado: String(h.new_status || ""),
      usuario: String(h.actor_user || ""),
      nombre: String(h.actor_name || ""),
      rol: String(h.actor_role || ""),
      origen: String(h.source || "admin"),
      creadoEn: h.created_at,
    })),
  };
}

async function actualizarEstadoPedidoCatalogoDb(numero, estado, actor = {}) {
  await asegurarEsquemaCatalogoPedidos();
  const n = texto(numero, 40);
  const e = texto(estado, 30).toLowerCase();
  if (!n) throw Object.assign(new Error("Pedido inválido"), { status: 400 });
  if (!ESTADOS_PEDIDO.includes(e)) {
    throw Object.assign(new Error("Estado de pedido inválido"), { status: 400 });
  }

  const actorUser = texto(actor.usuario, 80) || "administrador";
  const actorName = texto(actor.nombre, 120) || actorUser;
  const actorRole = texto(actor.rol, 40) || "administrador";

  const pool = obtenerPool();
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const actual = await cliente.query(
      `SELECT order_id,status FROM catalog_orders WHERE order_number=$1 FOR UPDATE`,
      [n],
    );
    if (!actual.rowCount) throw Object.assign(new Error("Pedido no encontrado"), { status: 404 });

    const orderId = Number(actual.rows[0].order_id);
    const anterior = String(actual.rows[0].status || "");
    if (anterior !== e) {
      await cliente.query(`UPDATE catalog_orders SET status=$2, updated_at=NOW() WHERE order_id=$1`, [orderId, e]);
      await cliente.query(
        `INSERT INTO catalog_order_status_history(
          order_id, previous_status, new_status, actor_user, actor_name, actor_role, source
        ) VALUES($1,$2,$3,$4,$5,$6,'admin')`,
        [orderId, anterior, e, actorUser, actorName, actorRole],
      );
    }
    await cliente.query("COMMIT");
    return obtenerPedidoCatalogoAdminDb(n);
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

async function actualizarObservacionesPedidoCatalogoDb(numero, observaciones = "") {
  await asegurarEsquemaCatalogoPedidos();

  const n = texto(numero, 40);
  if (!n) throw Object.assign(new Error("Pedido inválido"), { status: 400 });

  const notas = texto(observaciones, 1000);
  const r = await query(
    `UPDATE catalog_orders
        SET internal_notes=$2, updated_at=NOW()
      WHERE order_number=$1
      RETURNING order_id`,
    [n, notas],
  );

  if (!r.rowCount) {
    throw Object.assign(new Error("Pedido no encontrado"), { status: 404 });
  }

  return obtenerPedidoCatalogoAdminDb(n);
}


async function archivarPedidosDiasAnterioresDb() {
  await asegurarEsquemaCatalogoPedidos();

  const r = await query(
    `UPDATE catalog_orders
        SET archived_at=NOW(), updated_at=NOW()
      WHERE archived_at IS NULL
        AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <
            (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      RETURNING order_id`,
  );

  return Number(r.rowCount) || 0;
}

async function eliminarPedidoArchivadoCatalogoDb(numero) {
  await asegurarEsquemaCatalogoPedidos();

  const n = texto(numero, 40);
  if (!n) throw Object.assign(new Error("Pedido inválido"), { status: 400 });

  const r = await query(
    `DELETE FROM catalog_orders
      WHERE order_number=$1
        AND archived_at IS NOT NULL
      RETURNING order_id, order_number`,
    [n],
  );

  if (!r.rowCount) {
    const existe = await query(
      `SELECT archived_at FROM catalog_orders WHERE order_number=$1 LIMIT 1`,
      [n],
    );
    if (!existe.rowCount) {
      throw Object.assign(new Error("Pedido no encontrado"), { status: 404 });
    }
    throw Object.assign(
      new Error("Solo se pueden eliminar pedidos archivados."),
      { status: 400 },
    );
  }

  return {
    id: Number(r.rows[0].order_id),
    numero: String(r.rows[0].order_number),
  };
}

async function obtenerResumenPedidosCatalogoDb() {
  await asegurarEsquemaCatalogoPedidos();
  await archivarPedidosDiasAnterioresDb();
  const r = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status='recibido')::int AS recibidos,
       COUNT(*) FILTER (WHERE status='preparando')::int AS preparando,
       COUNT(*) FILTER (WHERE status='listo')::int AS listos,
       COUNT(*) FILTER (WHERE status='entregado')::int AS entregados,
       COUNT(*) FILTER (WHERE status='cancelado')::int AS cancelados,
       COALESCE(SUM(total) FILTER (
         WHERE status <> 'cancelado'
           AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date =
               (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
       ),0)::numeric AS venta_hoy
     FROM catalog_orders
    WHERE archived_at IS NULL`
  );
  const x = r.rows[0] || {};
  return {
    total: Number(x.total) || 0,
    recibidos: Number(x.recibidos) || 0,
    preparando: Number(x.preparando) || 0,
    listos: Number(x.listos) || 0,
    entregados: Number(x.entregados) || 0,
    cancelados: Number(x.cancelados) || 0,
    ventaHoy: Number(x.venta_hoy) || 0,
  };
}

module.exports = {
  ESTADOS_PEDIDO,
  FORMAS_PAGO,
  TIPOS_ENTREGA,
  HORARIOS_DELIVERY,
  PEDIDO_MINIMO_DELIVERY,
  asegurarEsquemaCatalogoPedidos,
  crearPedidoCatalogoDb,
  obtenerPedidoPorTokenDb,
  marcarWhatsappAbiertoPedidoDb,
  listarPedidosCatalogoDb,
  obtenerPedidoCatalogoAdminDb,
  actualizarEstadoPedidoCatalogoDb,
  actualizarObservacionesPedidoCatalogoDb,
  archivarPedidosDiasAnterioresDb,
  eliminarPedidoArchivadoCatalogoDb,
  obtenerResumenPedidosCatalogoDb,
  listarPedidosClienteCatalogoDb,
};
