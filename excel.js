import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
import { ordenarPorBusqueda } from "./search.js?v=1960-d21-cierre-etapa6-010926";
import { obtenerJsonCacheado } from "./api-cache.js?v=1960-d21-cierre-etapa6-010926";

let datos = [];
let catalogoMaestro = [];
let catalogoMaestroCargado = false;
const CLAVE_MODIFICACIONES = "inventario_modificaciones_v1";

function leerModificaciones() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_MODIFICACIONES) || "{}");
  } catch (_) {
    return {};
  }
}

function registrarModificacion(codigo) {
  const mapa = leerModificaciones();
  mapa[normalizarTexto(codigo)] = Date.now();
  localStorage.setItem(CLAVE_MODIFICACIONES, JSON.stringify(mapa));
}

function marcaModificacion(codigo) {
  return Number(leerModificaciones()[normalizarTexto(codigo)]) || 0;
}

function apiUrl(ruta) {
  const base = String(API_BASE_URL || "").replace(/\/$/, "");
  return `${base}${ruta}`;
}

function normalizarNumero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function normalizarEntero(valor, { permitirCero = true } = {}) {
  const numero = Number(valor);
  const valido =
    Number.isInteger(numero) && (permitirCero ? numero >= 0 : numero > 0);
  if (!valido)
    throw new Error(
      permitirCero
        ? "Ingresá una cantidad entera válida"
        : "Ingresá una cantidad entera mayor a 0",
    );
  return numero;
}

function normalizarTexto(valor) {
  return String(valor ?? "").trim();
}

function normalizarCodigo(valor) {
  let texto = normalizarTexto(valor)
    .replace(/^'+/, "")
    .replace(/\s+/g, "");
  if (!texto) return "";
  return texto.replace(/^(\d+)[.,]0+$/, "$1");
}

function armarProducto(fila, indice) {
  const salon = normalizarNumero(fila.salon);
  const deposito = normalizarNumero(fila.deposito);
  const stockUbicaciones = salon + deposito;
  const stockServidor = normalizarNumero(fila.stock);
  // Compatibilidad con inventarios históricos: varias filas existentes tienen
  // stock total cargado aunque Salón/Depósito todavía estén vacíos. No debemos
  // hacerlas desaparecer de la vista por recalcular el total exclusivamente
  // desde esas dos columnas. Cuando existen cantidades por ubicación, ellas
  // siguen siendo la fuente principal.
  const stock = stockUbicaciones > 0 ? stockUbicaciones : stockServidor;

  return {
    indice,
    filaGoogle: fila.filaGoogle,
    codigo: normalizarCodigo(fila.codigo),
    articulo: normalizarTexto(fila.articulo) || "Sin descripción",
    salon,
    deposito,
    stock,
  };
}

function guardarProductoLocal(productoActualizado) {
  const codigo = normalizarCodigo(productoActualizado.codigo);
  const indice = datos.findIndex(
    (item) => normalizarCodigo(item.codigo) === codigo,
  );

  const producto = {
    ...productoActualizado,
    codigo,
    articulo: normalizarTexto(productoActualizado.articulo),
    salon: normalizarNumero(productoActualizado.salon),
    deposito: normalizarNumero(productoActualizado.deposito),
    stock: Math.max(
      normalizarNumero(productoActualizado.stock),
      normalizarNumero(productoActualizado.salon) +
        normalizarNumero(productoActualizado.deposito),
    ),
  };

  if (indice >= 0) {
    datos[indice] = { ...datos[indice], ...producto };
    return armarProducto(datos[indice], indice);
  }

  datos.push(producto);
  return armarProducto(producto, datos.length - 1);
}

async function pedirJson(ruta, opciones = {}) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 15000);
  let respuesta;
  try {
    respuesta = await fetch(apiUrl(ruta), {
      ...opciones,
      headers: {
        "Content-Type": "application/json",
        ...(opciones.headers || {}),
      },
      signal: controlador.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError")
      throw new Error("El servidor tardó demasiado en responder");
    throw new Error("No se pudo conectar con el servidor");
  } finally {
    clearTimeout(temporizador);
  }

  let data = null;
  try {
    data = await respuesta.json();
  } catch (_) {
    data = null;
  }

  if (!respuesta.ok || !data?.ok) {
    throw new Error(data?.mensaje || "No se pudo conectar con el servidor");
  }

  return data;
}

export async function cargarProductosDesdeServidor() {
  const data = await pedirJson("/productos");
  datos = (data.productos || []).map((producto, indice) => ({
    filaGoogle: producto.filaGoogle,
    codigo: normalizarCodigo(producto.codigo),
    articulo: normalizarTexto(producto.articulo),
    stock: normalizarNumero(producto.stock),
    salon: normalizarNumero(producto.salon),
    deposito: normalizarNumero(producto.deposito),
    indice,
  }));

  return datos.length;
}

export async function cargarCatalogoMaestroDesdeServidor({
  forzar = false,
} = {}) {
  if (catalogoMaestroCargado && !forzar) return catalogoMaestro.length;
  const data = await obtenerJsonCacheado("/productos-maestro", {
    ttl: 5 * 60 * 1000,
    forzar,
  });
  catalogoMaestro = (data.productos || []).map((producto) => ({
    filaGoogle: producto.filaGoogle,
    codigo: normalizarCodigo(producto.codigo),
    articulo: normalizarTexto(producto.articulo) || "Sin descripción",
    precio: Number(producto.precio) || 0,
  }));
  catalogoMaestroCargado = true;
  return catalogoMaestro.length;
}

export function buscarProductoMaestroLocalPorCodigo(codigoBuscado) {
  const codigo = normalizarCodigo(codigoBuscado);
  const producto = catalogoMaestro.find(
    (item) => normalizarCodigo(item.codigo) === codigo,
  );
  return producto ? { encontrado: true, producto } : { encontrado: false };
}

export function buscarProductosMaestrosPorTexto(texto, limite = 5) {
  const consulta = String(texto || "").trim();
  if (!consulta) return catalogoMaestro.slice(0, limite);
  return ordenarPorBusqueda(catalogoMaestro, consulta, {
    limite,
    campos: ["articulo", "codigo"],
  });
}

export async function sincronizarProductosDesdeServidor() {
  // V3.0 estable: refresca la copia local para que varios celulares vean los cambios
  // hechos por otros dispositivos sin tener que cerrar la app.
  return await cargarProductosDesdeServidor();
}

export async function obtenerProductoActualizadoPorCodigo(codigoBuscado) {
  const codigo = normalizarCodigo(codigoBuscado);
  if (!codigo) return { encontrado: false };

  const data = await pedirJson(`/producto/${encodeURIComponent(codigo)}`);
  const producto = guardarProductoLocal(data.producto);
  return { encontrado: true, producto };
}

export function obtenerCantidadProductos() {
  return datos.length;
}


export function obtenerConteosUbicacion() {
  // V3.1.2: los contadores muestran productos distintos contados, no unidades.
  // Ejemplo: si Coca tiene salón 24 y Yerba salón 10, Salón contado = 2.
  // Se calcula desde la copia actual de Google Sheets para reflejar cambios de otros celulares.
  return datos.reduce(
    (total, fila) => {
      if (normalizarNumero(fila.salon) > 0) total.salon++;
      if (normalizarNumero(fila.deposito) > 0) total.deposito++;
      return total;
    },
    { salon: 0, deposito: 0 },
  );
}


export function obtenerProductos(limite = 40) {
  return datos
    .slice(0, limite)
    .map((fila, indice) => armarProducto(fila, indice));
}

export function obtenerProductosCargados(limite = 80) {
  return datos
    .map((fila, indice) => armarProducto(fila, indice))
    .filter((producto) => producto.stock > 0)
    .sort((a, b) => marcaModificacion(b.codigo) - marcaModificacion(a.codigo))
    .slice(0, limite);
}



export function asegurarProductoInventarioLocalDesdeMaestro(productoMaestro) {
  const codigo = normalizarCodigo(productoMaestro?.codigo);
  if (!codigo) return { encontrado: false };
  const existente = buscarProductoPorCodigo(codigo);
  if (existente.encontrado) return existente;

  const producto = guardarProductoLocal({
    filaGoogle: null,
    codigo,
    articulo: normalizarTexto(productoMaestro?.articulo) || "Sin descripción",
    salon: 0,
    deposito: 0,
    stock: 0,
  });
  return { encontrado: true, producto };
}

export function buscarProductoPorCodigo(codigoBuscado) {
  const codigo = normalizarCodigo(codigoBuscado);
  const indice = datos.findIndex(
    (fila) => normalizarTexto(fila.codigo) === codigo,
  );
  if (indice === -1) return { encontrado: false };
  return { encontrado: true, producto: armarProducto(datos[indice], indice) };
}

export function buscarProductosPorTexto(
  texto,
  limite = 40,
  soloCargados = false,
) {
  const productos = datos
    .map((fila, indice) => armarProducto(fila, indice))
    .filter((producto) => !soloCargados || producto.stock > 0);

  const consulta = String(texto || "").trim();
  if (!consulta) {
    if (soloCargados)
      productos.sort(
        (a, b) => marcaModificacion(b.codigo) - marcaModificacion(a.codigo),
      );
    return productos.slice(0, limite);
  }

  return ordenarPorBusqueda(productos, consulta, {
    limite,
    campos: ["articulo", "codigo"],
    desempate: soloCargados
      ? (a, b) => marcaModificacion(b.codigo) - marcaModificacion(a.codigo)
      : undefined,
  });
}

export async function guardarCantidadEnProducto(indice, cantidad, ubicacion) {
  if (!datos[indice]) throw new Error("Producto inválido");

  const cantidadNumerica = normalizarEntero(cantidad, { permitirCero: false });

  const productoBase = armarProducto(datos[indice], indice);

  const data = await pedirJson("/guardar", {
    method: "POST",
    body: JSON.stringify({
      codigo: productoBase.codigo,
      articulo: productoBase.articulo,
      ubicacion,
      cantidad: cantidadNumerica,
    }),
  });

  let producto;
  if (data.producto) {
    producto = guardarProductoLocal(data.producto);
  } else if (data.pendiente || data.offline) {
    // Auth puede encolar una escritura cuando se corta la red. En ese caso el
    // backend no devuelve `producto`; mantener la copia local utilizable.
    const salonActual = normalizarNumero(productoBase.salon);
    const depositoActual = normalizarNumero(productoBase.deposito);
    const salon = ubicacion === "salon" ? salonActual + cantidadNumerica : salonActual;
    const deposito = ubicacion === "deposito" ? depositoActual + cantidadNumerica : depositoActual;
    producto = guardarProductoLocal({
      ...productoBase,
      salon,
      deposito,
      stock: normalizarNumero(productoBase.stock) + cantidadNumerica,
    });
  } else {
    throw new Error("El servidor no devolvió el producto actualizado");
  }

  registrarModificacion(producto.codigo);
  return { producto, pendiente: Boolean(data.pendiente || data.offline) };
}

export async function modificarStockProducto(indice, salon, deposito) {
  if (!datos[indice]) throw new Error("Producto inválido");

  const productoBase = armarProducto(datos[indice], indice);

  const data = await pedirJson("/corregir", {
    method: "POST",
    body: JSON.stringify({
      codigo: productoBase.codigo,
      salon: normalizarEntero(salon),
      deposito: normalizarEntero(deposito),
    }),
  });

  const producto = guardarProductoLocal(data.producto);
  registrarModificacion(producto.codigo);
  return producto;
}

function enteroVencimientoCompatible(valor) {
  if (Number.isInteger(valor) && valor >= 0) return valor;
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const match = texto.match(/^\d+/);
  if (!match) return null;
  const numero = Number(match[0]);
  return Number.isInteger(numero) && numero >= 0 ? numero : null;
}

function cantidadVencimientoCompatible(registro = {}) {
  // V19.6 usa `cantidad`, pero el servidor de producción puede seguir
  // devolviendo temporalmente el esquema anterior (total / salon / deposito).
  // Priorizamos cualquier cantidad positiva existente sin inventar valores.
  const candidatos = [
    registro.cantidad,
    registro.total,
    registro.cantidad_total,
    registro.cantidadTotal,
    registro.cantidad_lote,
    registro.cantidadLote,
    registro.stock_lote,
    registro.stockLote,
    registro.unidades,
  ];
  for (const valor of candidatos) {
    const numero = enteroVencimientoCompatible(valor);
    if (numero !== null && numero > 0) return numero;
  }

  const salon = enteroVencimientoCompatible(registro.salon ?? registro["salón"]);
  const deposito = enteroVencimientoCompatible(
    registro.deposito ?? registro["depósito"],
  );
  const sumaLegacy = Math.max(0, salon || 0) + Math.max(0, deposito || 0);
  if (sumaLegacy > 0) return sumaLegacy;

  // Solo devolvemos 0 cuando realmente no llegó ninguna cantidad positiva.
  const cantidad = enteroVencimientoCompatible(registro.cantidad);
  return cantidad !== null ? cantidad : 0;
}

function normalizarVencimientoServidor(registro = {}) {
  return {
    ...registro,
    cantidad: cantidadVencimientoCompatible(registro),
  };
}

export async function listarVencimientos() {
  const data = await pedirJson("/vencimientos");
  return (data.vencimientos || []).map(normalizarVencimientoServidor);
}

export async function buscarProductoMaestroPorCodigo(codigoBuscado) {
  const codigo = normalizarCodigo(codigoBuscado);
  if (!codigo) return { encontrado: false };
  const data = await pedirJson(
    `/producto-maestro/${encodeURIComponent(codigo)}`,
  );
  return { encontrado: true, producto: data.producto };
}

export async function guardarVencimiento(registro) {
  const cantidad = normalizarEntero(registro.cantidad);
  const data = await pedirJson("/vencimientos", {
    method: "POST",
    body: JSON.stringify({
      codigo: normalizarTexto(registro.codigo),
      articulo: normalizarTexto(registro.articulo),
      vencimiento: normalizarTexto(registro.vencimiento),
      rubro: normalizarTexto(registro.rubro),
      cantidad,
      // Puente temporal para el backend V19 anterior todavía desplegado:
      // el backend V19.6 prioriza `cantidad`; el anterior calcula salon+deposito.
      salon: cantidad,
      deposito: 0,
    }),
  });
  return data.vencimiento ? normalizarVencimientoServidor(data.vencimiento) : data.vencimiento;
}

export async function actualizarVencimiento(id, registro) {
  const cantidad = normalizarEntero(registro.cantidad);
  const data = await pedirJson(`/vencimientos/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({
      vencimiento: normalizarTexto(registro.vencimiento),
      rubro: normalizarTexto(registro.rubro),
      cantidad,
      // Compatibilidad de escritura con el esquema previo; no aparece en UI.
      salon: cantidad,
      deposito: 0,
    }),
  });
  return data.vencimiento ? normalizarVencimientoServidor(data.vencimiento) : data.vencimiento;
}

export async function actualizarOfertaVencimiento(id, oferta) {
  const data = await pedirJson(
    `/vencimientos/${encodeURIComponent(id)}/oferta`,
    {
      method: "PATCH",
      body: JSON.stringify({ oferta: oferta ? "Sí" : "No" }),
    },
  );
  return data.vencimiento;
}

export async function eliminarVencimiento(id) {
  const data = await pedirJson(`/vencimientos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return data;
}
