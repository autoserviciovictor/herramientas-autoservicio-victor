const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const XLSX = require("xlsx");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Stock";
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

// V3.0 estable: cola simple por código para soportar varios celulares sin pisar escrituras.
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

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:E`
  });

  const filas = respuesta.data.values || [];
  if (filas.length <= 1) return [];

  return filas.slice(1).map(filaAProducto).filter(producto => producto.codigo || producto.articulo);
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

app.get("/", (req, res) => {
  res.send("Servidor Inventario Victor V3.0 estable funcionando");
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

app.post("/guardar", async (req, res) => {
  try {
    const { codigo, ubicacion, cantidad } = req.body;
    const codigoBuscado = normalizarCodigo(codigo);
    const cantidadNumerica = numero(cantidad);

    if (!codigoBuscado) {
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    }

    if (!["salon", "deposito"].includes(ubicacion)) {
      return res.status(400).json({ ok: false, mensaje: "Ubicación inválida" });
    }

    if (cantidadNumerica <= 0) {
      return res.status(400).json({ ok: false, mensaje: "La cantidad debe ser mayor a 0" });
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

    const productoActualizado = await ejecutarEnCola(codigoBuscado, async () => {
      const producto = await buscarProductoPorCodigo(codigoBuscado);

      if (!producto) {
        const error = new Error("Producto no encontrado");
        error.statusCode = 404;
        throw error;
      }

      producto.salon = numero(salon);
      producto.deposito = numero(deposito);

      return await actualizarProducto(producto);
    });

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

    res.json({ ok: true, mensaje: "Inventario reiniciado" });
  } catch (error) {
    console.error("Error en /reiniciar:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al reiniciar inventario" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Inventario Victor V3.0 estable funcionando en puerto ${PORT}`);
});
