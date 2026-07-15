const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const XLSX = require("xlsx");
require("dotenv").config();

const app = express();
const APP_VERSION = "5.2.1";
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Stock";
const PRODUCTOS_SHEET_NAME = "Productos";
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const API_WRITE_KEY = normalizarTexto(process.env.API_WRITE_KEY);
const RESET_KEY = normalizarTexto(process.env.RESET_KEY);
const ALLOWED_ORIGINS = normalizarTexto(process.env.ALLOWED_ORIGINS)
  .split(",")
  .map(origen => origen.trim())
  .filter(Boolean);

app.use(cors({
  origin(origen, callback) {
    if (!origen || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origen)) {
      return callback(null, true);
    }
    return callback(new Error("Origen no permitido por CORS"));
  }
}));
app.use(express.json({ limit: "10mb" }));

function protegerEscrituras(req, res, next) {
  if (!API_WRITE_KEY) return next();
  const clave = normalizarTexto(req.get("x-api-key"));
  if (clave !== API_WRITE_KEY) {
    return res.status(401).json({ ok: false, mensaje: "No autorizado" });
  }
  next();
}

app.use((req, res, next) => {
  const esEscritura = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (!esEscritura || req.path === "/reiniciar") return next();
  return protegerEscrituras(req, res, next);
});

const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

// V5.1.1 - Caché breve y deduplicación de lecturas para no exceder la cuota de Google Sheets.
const cacheLecturas = new Map();
const promesasLectura = new Map();
const CACHE_TTL = {
  productos: 15000,
  productosMaestros: 60000,
  vencimientos: 20000,
  reposicion: 15000,
  metadata: 300000
};

async function leerConCache(clave, ttl, lector) {
  const ahora = Date.now();
  const guardado = cacheLecturas.get(clave);
  if (guardado && ahora - guardado.fecha < ttl) return guardado.valor;
  if (promesasLectura.has(clave)) return promesasLectura.get(clave);

  const promesa = (async () => {
    try {
      const valor = await lector();
      cacheLecturas.set(clave, { fecha: Date.now(), valor });
      return valor;
    } catch (error) {
      // Si Google limita temporalmente las lecturas, conservar el último dato conocido.
      if (guardado) return guardado.valor;
      throw error;
    } finally {
      promesasLectura.delete(clave);
    }
  })();

  promesasLectura.set(clave, promesa);
  return promesa;
}

function invalidarCache(...claves) {
  claves.forEach(clave => cacheLecturas.delete(clave));
}

// Cola simple por recurso para soportar varios celulares sin pisar escrituras.
// Si dos dispositivos guardan el mismo producto al mismo tiempo, el segundo espera
// a que el primero termine y luego vuelve a leer el valor actualizado.
const colasPorCodigo = new Map();

async function ejecutarEnCola(codigo, tarea) {
  const clave = normalizarCodigo(codigo);
  const colaAnterior = colasPorCodigo.get(clave) || Promise.resolve();

  let liberar;
  const colaActual = new Promise(resolve => { liberar = resolve; });
  const colaEncadenada = colaAnterior.catch(() => {}).then(() => colaActual);
  colasPorCodigo.set(clave, colaEncadenada);

  try {
    await colaAnterior.catch(() => {});
    return await tarea();
  } finally {
    liberar();
    setTimeout(() => {
      if (colasPorCodigo.get(clave) === colaEncadenada) {
        colasPorCodigo.delete(clave);
      }
    }, 100);
  }
}


function normalizarTexto(valor) {
  return String(valor ?? "").trim();
}

function normalizarCodigo(codigo) {
  return normalizarTexto(codigo);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function enteroNoNegativo(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function enteroPositivo(valor) {
  const n = enteroNoNegativo(valor);
  return n !== null && n > 0 ? n : null;
}

function fechaArgentina(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(fecha);
  const obtener = tipo => partes.find(parte => parte.type === tipo)?.value;
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

function fechaHoraArgentinaIso(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(fecha).replace(" ", "T");
  return `${partes}-03:00`;
}

function validarConfiguracion() {
  if (!SPREADSHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error("Faltan variables de entorno: SPREADSHEET_ID, GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY");
  }
}

function filaAProducto(fila, index) {
  const salon = numero(fila[3]);
  const deposito = numero(fila[4]);

  return {
    filaGoogle: index + 2,
    codigo: normalizarTexto(fila[0]),
    articulo: normalizarTexto(fila[1]),
    stock: salon + deposito,
    salon,
    deposito
  };
}

async function obtenerProductos() {
  validarConfiguracion();
  return leerConCache("productos", CACHE_TTL.productos, async () => {
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`
    });
    const filas = respuesta.data.values || [];
    if (filas.length <= 1) return [];
    return filas.slice(1).map(filaAProducto).filter(producto => producto.codigo || producto.articulo);
  });
}

async function buscarProductoPorCodigo(codigoBuscado) {
  const productos = await obtenerProductos();
  const codigo = normalizarCodigo(codigoBuscado);
  return productos.find(producto => producto.codigo === codigo) || null;
}

async function actualizarProducto(producto) {
  const salon = numero(producto.salon);
  const deposito = numero(producto.deposito);
  const stock = salon + deposito;

  const productoActualizado = {
    ...producto,
    stock,
    salon,
    deposito
  };

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${producto.filaGoogle}:E${producto.filaGoogle}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        productoActualizado.codigo,
        productoActualizado.articulo,
        productoActualizado.stock,
        productoActualizado.salon,
        productoActualizado.deposito
      ]]
    }
  });

  return productoActualizado;
}


function filaAProductoMaestro(fila, index) {
  return {
    filaGoogle: index + 2,
    codigo: normalizarTexto(fila[0]),
    articulo: normalizarTexto(fila[1])
  };
}

async function obtenerProductosMaestros() {
  validarConfiguracion();
  return leerConCache("productosMaestros", CACHE_TTL.productosMaestros, async () => {
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PRODUCTOS_SHEET_NAME}!A:B`
    });
    const filas = respuesta.data.values || [];
    if (filas.length <= 1) return [];
    return filas.slice(1).map(filaAProductoMaestro).filter(producto => producto.codigo || producto.articulo);
  });
}

async function buscarProductoMaestroPorCodigo(codigoBuscado) {
  const productos = await obtenerProductosMaestros();
  const codigo = normalizarCodigo(codigoBuscado);
  return productos.find(producto => producto.codigo === codigo) || null;
}

app.get("/", (req, res) => {
  res.send(`Servidor Herramientas Autoservicio Victor V${APP_VERSION} funcionando`);
});

app.get("/productos", async (req, res) => {
  try {
    const productos = await obtenerProductos();
    res.json({ ok: true, total: productos.length, productos });
  } catch (error) {
    console.error("Error en /productos:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener productos" });
  }
});

app.get("/producto/:codigo", async (req, res) => {
  try {
    const producto = await buscarProductoPorCodigo(req.params.codigo);

    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    res.json({ ok: true, producto });
  } catch (error) {
    console.error("Error en /producto/:codigo:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener producto" });
  }
});


app.get("/productos-maestro", async (req, res) => {
  try {
    const productos = await obtenerProductosMaestros();
    res.json({ ok: true, total: productos.length, productos });
  } catch (error) {
    console.error("Error en /productos-maestro:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener productos maestros" });
  }
});

app.get("/producto-maestro/:codigo", async (req, res) => {
  try {
    const producto = await buscarProductoMaestroPorCodigo(req.params.codigo);
    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado en Productos" });
    }
    res.json({ ok: true, producto });
  } catch (error) {
    console.error("Error en /producto-maestro/:codigo:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener producto maestro" });
  }
});

app.post("/guardar", async (req, res) => {
  try {
    const { codigo, ubicacion, cantidad } = req.body;
    const codigoBuscado = normalizarCodigo(codigo);
    const cantidadNumerica = enteroPositivo(cantidad);

    if (!codigoBuscado) {
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    }

    if (!["salon", "deposito"].includes(ubicacion)) {
      return res.status(400).json({ ok: false, mensaje: "Ubicación inválida" });
    }

    if (cantidadNumerica === null) {
      return res.status(400).json({ ok: false, mensaje: "La cantidad debe ser un número entero mayor a 0" });
    }

    const productoActualizado = await ejecutarEnCola(codigoBuscado, async () => {
      const producto = await buscarProductoPorCodigo(codigoBuscado);

      if (!producto) {
        const error = new Error("Producto no encontrado");
        error.statusCode = 404;
        throw error;
      }

      if (ubicacion === "deposito") {
        producto.deposito = numero(producto.deposito) + cantidadNumerica;
      } else {
        producto.salon = numero(producto.salon) + cantidadNumerica;
      }

      return await actualizarProducto(producto);
    });

    invalidarCache("productos");
    res.json({ ok: true, mensaje: "Producto guardado", producto: productoActualizado });
  } catch (error) {
    console.error("Error en /guardar:", error);
    res.status(error.statusCode || 500).json({ ok: false, mensaje: error.message || "Error al guardar producto" });
  }
});

app.post("/corregir", async (req, res) => {
  try {
    const { codigo, salon, deposito } = req.body;
    const codigoBuscado = normalizarCodigo(codigo);

    if (!codigoBuscado) {
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    }

    const salonValidado = enteroNoNegativo(salon);
    const depositoValidado = enteroNoNegativo(deposito);
    if (salonValidado === null || depositoValidado === null) {
      return res.status(400).json({ ok: false, mensaje: "Salón y depósito deben ser números enteros iguales o mayores a 0" });
    }

    const productoActualizado = await ejecutarEnCola(codigoBuscado, async () => {
      const producto = await buscarProductoPorCodigo(codigoBuscado);

      if (!producto) {
        const error = new Error("Producto no encontrado");
        error.statusCode = 404;
        throw error;
      }

      producto.salon = salonValidado;
      producto.deposito = depositoValidado;

      return await actualizarProducto(producto);
    });

    invalidarCache("productos");
    res.json({ ok: true, mensaje: "Producto corregido", producto: productoActualizado });
  } catch (error) {
    console.error("Error en /corregir:", error);
    res.status(error.statusCode || 500).json({ ok: false, mensaje: error.message || "Error al corregir producto" });
  }
});

app.get("/descargar", async (req, res) => {
  try {
    const productos = await obtenerProductos();

    const filas = productos.map(producto => ({
      codigo: producto.codigo,
      articulo: producto.articulo,
      stock: numero(producto.stock),
      salon: numero(producto.salon),
      deposito: numero(producto.deposito)
    }));

    const hoja = XLSX.utils.json_to_sheet(filas, {
      header: ["codigo", "articulo", "stock", "salon", "deposito"]
    });

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Stock");

    const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=inventario-victor.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("Error en /descargar:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al descargar Excel" });
  }
});

app.post("/reiniciar", async (req, res) => {
  try {
    if (!RESET_KEY) {
      return res.status(503).json({ ok: false, mensaje: "El reinicio total está deshabilitado" });
    }
    const clave = normalizarTexto(req.get("x-reset-key") || req.body?.resetKey);
    if (clave !== RESET_KEY) {
      return res.status(401).json({ ok: false, mensaje: "Clave de reinicio inválida" });
    }
    if (normalizarTexto(req.body?.confirmacion) !== "REINICIAR INVENTARIO") {
      return res.status(400).json({ ok: false, mensaje: "Falta la confirmación de reinicio" });
    }
    const productos = await obtenerProductos();

    const valores = productos.map(producto => [
      producto.codigo,
      producto.articulo,
      0,
      0,
      0
    ]);

    if (valores.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2:E${valores.length + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: valores }
      });
    }

    invalidarCache("productos");
    res.json({ ok: true, mensaje: "Inventario reiniciado" });
  } catch (error) {
    console.error("Error en /reiniciar:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al reiniciar inventario" });
  }
});


const VENCIMIENTOS_SHEET_NAME = "Vencimientos";

function fechaIsoHoy() {
  return fechaArgentina();
}

function generarIdVencimiento() {
  const marca = fechaHoraArgentinaIso().replace(/[-:T+]/g, "").slice(0, 14);
  return `V${marca}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
}

function calcularEstadoVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return "Sin fecha";
  const hoy = new Date(fechaIsoHoy() + "T00:00:00");
  const vence = new Date(String(fechaVencimiento) + "T00:00:00");
  if (Number.isNaN(vence.getTime())) return "Sin fecha";
  const dias = Math.ceil((vence - hoy) / 86400000);
  if (dias < 0) return "Vencido";
  if (dias <= 7) return "En 7 días";
  if (dias <= 15) return "En 15 días";
  if (dias <= 30) return "En 30 días";
  return "Vigente";
}

function normalizarOfertaVencimiento(valor) {
  const texto = normalizarTexto(valor).toLowerCase();
  return ["si", "sí", "true", "1", "oferta", "activo", "activa"].includes(texto) ? "Sí" : "No";
}

let hojaVencimientosAsegurada = false;
let promesaHojaVencimientos = null;
async function asegurarHojaVencimientos() {
  if (hojaVencimientosAsegurada) return;
  if (promesaHojaVencimientos) return promesaHojaVencimientos;
  promesaHojaVencimientos = (async () => {
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets || []).some(hoja => hoja.properties?.title === VENCIMIENTOS_SHEET_NAME);

  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: VENCIMIENTOS_SHEET_NAME } } }] }
    });
  }

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${VENCIMIENTOS_SHEET_NAME}!A1:J1`
  });

  const encabezado = respuesta.data.values?.[0] || [];
  const correcto = ["ID", "Fecha carga", "Código", "Artículo", "Vencimiento", "Salón", "Depósito", "Total", "Estado", "Oferta"];
  const necesitaEncabezado = encabezado.length === 0 || encabezado[0] !== "ID" || encabezado.length < 10;
  if (necesitaEncabezado) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A1:J1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [correcto] }
    });
  }
  hojaVencimientosAsegurada = true;
  })();
  try { await promesaHojaVencimientos; }
  finally { promesaHojaVencimientos = null; }
}

function filaAVencimiento(fila, index) {
  return {
    filaGoogle: index + 2,
    id: normalizarTexto(fila[0]) || String(index + 1),
    fecha_carga: normalizarTexto(fila[1]),
    codigo: normalizarTexto(fila[2]),
    articulo: normalizarTexto(fila[3]),
    vencimiento: normalizarTexto(fila[4]),
    salon: numero(fila[5]),
    deposito: numero(fila[6]),
    total: numero(fila[7]),
    estado: calcularEstadoVencimiento(fila[4]),
    oferta: normalizarOfertaVencimiento(fila[9])
  };
}

async function obtenerVencimientos() {
  await asegurarHojaVencimientos();
  return leerConCache("vencimientos", CACHE_TTL.vencimientos, async () => {
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A:J`
    });
    const filas = respuesta.data.values || [];
    return filas.slice(1).map(filaAVencimiento).filter(item => item.codigo || item.articulo || item.id);
  });
}

app.get("/vencimientos", async (req, res) => {
  try {
    const vencimientos = (await obtenerVencimientos()).reverse();
    res.json({ ok: true, total: vencimientos.length, vencimientos });
  } catch (error) {
    console.error("Error en /vencimientos:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener vencimientos" });
  }
});

app.post("/vencimientos", async (req, res) => {
  try {
    const codigo = normalizarCodigo(req.body.codigo);
    const vencimiento = normalizarTexto(req.body.vencimiento);
    const salon = enteroNoNegativo(req.body.salon);
    const deposito = enteroNoNegativo(req.body.deposito);
    const total = salon === null || deposito === null ? null : salon + deposito;

    if (!codigo) return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    if (!vencimiento) return res.status(400).json({ ok: false, mensaje: "Falta la fecha de vencimiento" });
    if (total === null || total <= 0) return res.status(400).json({ ok: false, mensaje: "Salón y depósito deben ser cantidades enteras; cargá al menos una unidad" });

    const producto = await buscarProductoMaestroPorCodigo(codigo);
    const articulo = normalizarTexto(req.body.articulo) || producto?.articulo;
    if (!articulo) return res.status(404).json({ ok: false, mensaje: "Producto no encontrado en la hoja Productos" });

    await asegurarHojaVencimientos();
    const registro = {
      id: generarIdVencimiento(),
      fecha_carga: fechaIsoHoy(),
      codigo,
      articulo,
      vencimiento,
      salon,
      deposito,
      total,
      estado: calcularEstadoVencimiento(vencimiento),
      oferta: normalizarOfertaVencimiento(req.body.oferta)
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[registro.id, registro.fecha_carga, registro.codigo, registro.articulo, registro.vencimiento, registro.salon, registro.deposito, registro.total, registro.estado, registro.oferta]] }
    });

    invalidarCache("vencimientos");
    res.json({ ok: true, mensaje: "Vencimiento guardado", vencimiento: registro });
  } catch (error) {
    console.error("Error en POST /vencimientos:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al guardar vencimiento" });
  }
});

app.put("/vencimientos/:id", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find(item => item.id === id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });

    const salon = enteroNoNegativo(req.body.salon);
    const deposito = enteroNoNegativo(req.body.deposito);
    const vencimiento = normalizarTexto(req.body.vencimiento);
    const total = salon === null || deposito === null ? null : salon + deposito;
    if (!vencimiento) return res.status(400).json({ ok: false, mensaje: "Falta la fecha de vencimiento" });
    if (total === null || total <= 0) return res.status(400).json({ ok: false, mensaje: "Salón y depósito deben ser cantidades enteras; cargá al menos una unidad" });

    const actualizado = { ...registro, vencimiento, salon, deposito, total, estado: calcularEstadoVencimiento(vencimiento), oferta: req.body.oferta === undefined ? registro.oferta : normalizarOfertaVencimiento(req.body.oferta) };
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A${registro.filaGoogle}:J${registro.filaGoogle}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[actualizado.id, actualizado.fecha_carga, actualizado.codigo, actualizado.articulo, actualizado.vencimiento, actualizado.salon, actualizado.deposito, actualizado.total, actualizado.estado, actualizado.oferta]] }
    });
    invalidarCache("vencimientos");
    res.json({ ok: true, mensaje: "Vencimiento actualizado", vencimiento: actualizado });
  } catch (error) {
    console.error("Error en PUT /vencimientos/:id:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al actualizar vencimiento" });
  }
});

app.patch("/vencimientos/:id/oferta", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find(item => item.id === id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });

    const oferta = normalizarOfertaVencimiento(req.body.oferta);
    const actualizado = { ...registro, oferta };
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A${registro.filaGoogle}:J${registro.filaGoogle}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[actualizado.id, actualizado.fecha_carga, actualizado.codigo, actualizado.articulo, actualizado.vencimiento, actualizado.salon, actualizado.deposito, actualizado.total, actualizado.estado, actualizado.oferta]] }
    });
    invalidarCache("vencimientos");
    res.json({ ok: true, mensaje: oferta === "Sí" ? "Oferta marcada" : "Oferta quitada", vencimiento: actualizado });
  } catch (error) {
    console.error("Error en PATCH /vencimientos/:id/oferta:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al actualizar oferta" });
  }
});

app.delete("/vencimientos/:id", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find(item => item.id === id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId: await obtenerSheetId(VENCIMIENTOS_SHEET_NAME), dimension: "ROWS", startIndex: registro.filaGoogle - 1, endIndex: registro.filaGoogle } } }] }
    });
    invalidarCache("vencimientos");
    res.json({ ok: true, mensaje: "Vencimiento eliminado" });
  } catch (error) {
    console.error("Error en DELETE /vencimientos/:id:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al eliminar vencimiento" });
  }
});

async function obtenerSheetId(nombreHoja) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const hoja = (meta.data.sheets || []).find(item => item.properties?.title === nombreHoja);
  if (!hoja) throw new Error(`No existe la hoja ${nombreHoja}`);
  return hoja.properties.sheetId;
}


// V4.7.0 - Reposición. La hoja se crea automáticamente dentro del archivo ya conectado.
const REPOSICION_SHEET_NAME = "Reposicion";

let hojaReposicionAsegurada = false;
let promesaHojaReposicion = null;
async function asegurarHojaReposicion() {
  if (hojaReposicionAsegurada) return;
  if (promesaHojaReposicion) return promesaHojaReposicion;
  promesaHojaReposicion = (async () => {
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets || []).some(hoja => hoja.properties?.title === REPOSICION_SHEET_NAME);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: REPOSICION_SHEET_NAME } } }] }
    });
  }
  const encabezado = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${REPOSICION_SHEET_NAME}!A1:G1`
  });
  if (!(encabezado.data.values || []).length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${REPOSICION_SHEET_NAME}!A1:G1`,
      valueInputOption: "RAW",
      requestBody: { values: [["ID", "Fecha", "Código", "Artículo", "Cantidad", "Estado", "Actualizado"]] }
    });
  }
  hojaReposicionAsegurada = true;
  })();
  try { await promesaHojaReposicion; }
  finally { promesaHojaReposicion = null; }
}

function filaAReposicion(fila, index) {
  return {
    filaGoogle: index + 2,
    id: normalizarTexto(fila[0]),
    fecha: normalizarTexto(fila[1]),
    codigo: normalizarTexto(fila[2]),
    articulo: normalizarTexto(fila[3]),
    cantidad: numero(fila[4]),
    estado: normalizarTexto(fila[5]).toLowerCase() === "completado" ? "completado" : "pendiente",
    actualizado: normalizarTexto(fila[6])
  };
}

async function obtenerReposicion() {
  await asegurarHojaReposicion();
  return leerConCache("reposicion", CACHE_TTL.reposicion, async () => {
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${REPOSICION_SHEET_NAME}!A:G`
    });
    const filas = respuesta.data.values || [];
    if (filas.length <= 1) return [];
    return filas.slice(1).map(filaAReposicion).filter(item => item.id && item.codigo);
  });
}

function fechaIsoActual() { return fechaHoraArgentinaIso(); }
function crearIdReposicion() { return `REP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

app.get("/reposicion", async (req, res) => {
  try {
    const registros = (await obtenerReposicion()).sort((a, b) => String(b.actualizado || b.fecha).localeCompare(String(a.actualizado || a.fecha)));
    res.json({ ok: true, total: registros.length, registros });
  } catch (error) {
    console.error("Error en GET /reposicion:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener reposición" });
  }
});

app.post("/reposicion", async (req, res) => {
  try {
    const codigo = normalizarCodigo(req.body.codigo);
    const articulo = normalizarTexto(req.body.articulo);
    const cantidad = enteroPositivo(req.body.cantidad);
    if (!codigo || !articulo) return res.status(400).json({ ok: false, mensaje: "Falta el producto" });
    if (cantidad === null) return res.status(400).json({ ok: false, mensaje: "Ingresá una cantidad entera mayor a 0" });

    const resultado = await ejecutarEnCola(`reposicion:${codigo}`, async () => {
      invalidarCache("reposicion");
      const registros = await obtenerReposicion();
      const existente = registros.find(item => item.codigo === codigo && item.estado === "pendiente");
      const ahora = fechaIsoActual();
      if (existente) {
        const actualizado = { ...existente, cantidad: existente.cantidad + cantidad, actualizado: ahora };
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${REPOSICION_SHEET_NAME}!A${existente.filaGoogle}:G${existente.filaGoogle}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[actualizado.id, actualizado.fecha, actualizado.codigo, actualizado.articulo, actualizado.cantidad, actualizado.estado, actualizado.actualizado]] }
        });
        return { mensaje: "Cantidad sumada al producto pendiente", registro: actualizado };
      }

      const registro = { id: crearIdReposicion(), fecha: ahora, codigo, articulo, cantidad, estado: "pendiente", actualizado: ahora };
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${REPOSICION_SHEET_NAME}!A:G`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [[registro.id, registro.fecha, registro.codigo, registro.articulo, registro.cantidad, registro.estado, registro.actualizado]] }
      });
      return { mensaje: "Producto anotado", registro };
    });
    invalidarCache("reposicion");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("Error en POST /reposicion:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al guardar reposición" });
  }
});

app.put("/reposicion/:id", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const cantidad = enteroPositivo(req.body.cantidad);
    if (cantidad === null) return res.status(400).json({ ok: false, mensaje: "Ingresá una cantidad entera mayor a 0" });
    const estado = normalizarTexto(req.body.estado).toLowerCase() === "completado" ? "completado" : "pendiente";
    const actualizado = await ejecutarEnCola(`reposicion-id:${id}`, async () => {
      invalidarCache("reposicion");
      const registros = await obtenerReposicion();
      const registro = registros.find(item => item.id === id);
      if (!registro) {
        const error = new Error("Registro no encontrado");
        error.statusCode = 404;
        throw error;
      }
      const resultado = { ...registro, cantidad, estado, actualizado: fechaIsoActual() };
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${REPOSICION_SHEET_NAME}!A${registro.filaGoogle}:G${registro.filaGoogle}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[resultado.id, resultado.fecha, resultado.codigo, resultado.articulo, resultado.cantidad, resultado.estado, resultado.actualizado]] }
      });
      return resultado;
    });
    invalidarCache("reposicion");
    res.json({ ok: true, mensaje: "Reposición actualizada", registro: actualizado });
  } catch (error) {
    console.error("Error en PUT /reposicion/:id:", error);
    res.status(error.statusCode || 500).json({ ok: false, mensaje: error.message || "Error al actualizar reposición" });
  }
});

app.delete("/reposicion/:id", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const registros = await obtenerReposicion();
    const registro = registros.find(item => item.id === id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId: await obtenerSheetId(REPOSICION_SHEET_NAME), dimension: "ROWS", startIndex: registro.filaGoogle - 1, endIndex: registro.filaGoogle } } }] }
    });
    invalidarCache("reposicion");
    res.json({ ok: true, mensaje: "Producto eliminado" });
  } catch (error) {
    console.error("Error en DELETE /reposicion/:id:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al eliminar reposición" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Herramientas Autoservicio Victor V${APP_VERSION} funcionando en puerto ${PORT}`);
});
