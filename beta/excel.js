import { API_BASE_URL } from "./config.js?v=71-entrega2-importacion";
import { ordenarPorBusqueda } from "./search.js?v=71-entrega2-importacion";

let datos = [];
let catalogoMaestro = [];
let catalogoMaestroCargado = false;
let contador = 0;
let ultimosEscaneados = [];
const CLAVE_MODIFICACIONES = "inventario_modificaciones_v1";

function leerModificaciones() {
    try { return JSON.parse(localStorage.getItem(CLAVE_MODIFICACIONES) || "{}"); } catch (_) { return {}; }
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
    const valido = Number.isInteger(numero) && (permitirCero ? numero >= 0 : numero > 0);
    if (!valido) throw new Error(permitirCero ? "Ingresá una cantidad entera válida" : "Ingresá una cantidad entera mayor a 0");
    return numero;
}

function normalizarTexto(valor) {
    return String(valor ?? "").trim();
}

function armarProducto(fila, indice) {
    const salon = normalizarNumero(fila.salon);
    const deposito = normalizarNumero(fila.deposito);
    const stock = salon + deposito;

    return {
        indice,
        filaGoogle: fila.filaGoogle,
        codigo: normalizarTexto(fila.codigo),
        articulo: normalizarTexto(fila.articulo) || "Sin descripción",
        salon,
        deposito,
        stock
    };
}

function guardarProductoLocal(productoActualizado) {
    const codigo = normalizarTexto(productoActualizado.codigo);
    const indice = datos.findIndex(item => normalizarTexto(item.codigo) === codigo);

    const producto = {
        ...productoActualizado,
        codigo,
        articulo: normalizarTexto(productoActualizado.articulo),
        salon: normalizarNumero(productoActualizado.salon),
        deposito: normalizarNumero(productoActualizado.deposito),
        stock: normalizarNumero(productoActualizado.stock)
    };

    if (indice >= 0) {
        datos[indice] = { ...datos[indice], ...producto };
        return armarProducto(datos[indice], indice);
    }

    datos.push(producto);
    return armarProducto(producto, datos.length - 1);
}

function registrarUltimo(producto) {
    ultimosEscaneados = ultimosEscaneados.filter(item => item.codigo !== producto.codigo);
    ultimosEscaneados.unshift(producto);
    if (ultimosEscaneados.length > 20) ultimosEscaneados.pop();
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
                ...(opciones.headers || {})
            },
            signal: controlador.signal
        });
    } catch (error) {
        if (error?.name === "AbortError") throw new Error("El servidor tardó demasiado en responder");
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
        codigo: normalizarTexto(producto.codigo),
        articulo: normalizarTexto(producto.articulo),
        stock: normalizarNumero(producto.stock),
        salon: normalizarNumero(producto.salon),
        deposito: normalizarNumero(producto.deposito),
        indice
    }));

    return datos.length;
}


export async function cargarCatalogoMaestroDesdeServidor({ forzar = false } = {}) {
    if (catalogoMaestroCargado && !forzar) return catalogoMaestro.length;
    const data = await pedirJson("/productos-maestro");
    catalogoMaestro = (data.productos || []).map(producto => ({
        filaGoogle: producto.filaGoogle,
        codigo: normalizarTexto(producto.codigo),
        articulo: normalizarTexto(producto.articulo) || "Sin descripción",
        precio: Number(producto.precio) || 0
    }));
    catalogoMaestroCargado = true;
    return catalogoMaestro.length;
}

export function buscarProductoMaestroLocalPorCodigo(codigoBuscado) {
    const codigo = normalizarTexto(codigoBuscado);
    const producto = catalogoMaestro.find(item => normalizarTexto(item.codigo) === codigo);
    return producto ? { encontrado: true, producto } : { encontrado: false };
}

export function buscarProductosMaestrosPorTexto(texto, limite = 5) {
    const consulta = String(texto || "").trim();
    if (!consulta) return catalogoMaestro.slice(0, limite);
    return ordenarPorBusqueda(catalogoMaestro, consulta, {
        limite,
        campos: ["articulo", "codigo"]
    });
}

export async function sincronizarProductosDesdeServidor() {
    // V3.0 estable: refresca la copia local para que varios celulares vean los cambios
    // hechos por otros dispositivos sin tener que cerrar la app.
    return await cargarProductosDesdeServidor();
}

export async function obtenerProductoActualizadoPorCodigo(codigoBuscado) {
    const codigo = normalizarTexto(codigoBuscado);
    if (!codigo) return { encontrado: false };

    const data = await pedirJson(`/producto/${encodeURIComponent(codigo)}`);
    const producto = guardarProductoLocal(data.producto);
    return { encontrado: true, producto };
}

export function obtenerCantidadProductos() {
    return datos.length;
}

export function obtenerContador() {
    return contador;
}

export function obtenerConteosUbicacion() {
    // V3.1.2: los contadores muestran productos distintos contados, no unidades.
    // Ejemplo: si Coca tiene salón 24 y Yerba salón 10, Salón contado = 2.
    // Se calcula desde la copia actual de Google Sheets para reflejar cambios de otros celulares.
    return datos.reduce((total, fila) => {
        if (normalizarNumero(fila.salon) > 0) total.salon++;
        if (normalizarNumero(fila.deposito) > 0) total.deposito++;
        return total;
    }, { salon: 0, deposito: 0 });
}

export function obtenerUltimosEscaneados() {
    return [...ultimosEscaneados];
}

export function obtenerProductos(limite = 40) {
    return datos.slice(0, limite).map((fila, indice) => armarProducto(fila, indice));
}

export function obtenerProductosCargados(limite = 80) {
    return datos
        .map((fila, indice) => armarProducto(fila, indice))
        .filter(producto => producto.stock > 0)
        .sort((a, b) => marcaModificacion(b.codigo) - marcaModificacion(a.codigo))
        .slice(0, limite);
}

export function reiniciarContador() {
    contador = 0;
        ultimosEscaneados = [];
    return contador;
}

export function buscarProductoPorCodigo(codigoBuscado) {
    const codigo = normalizarTexto(codigoBuscado);
    const indice = datos.findIndex(fila => normalizarTexto(fila.codigo) === codigo);
    if (indice === -1) return { encontrado: false };
    return { encontrado: true, producto: armarProducto(datos[indice], indice) };
}

export function buscarProductosPorTexto(texto, limite = 40, soloCargados = false) {
    const productos = datos
        .map((fila, indice) => armarProducto(fila, indice))
        .filter(producto => !soloCargados || producto.stock > 0);

    const consulta = String(texto || "").trim();
    if (!consulta) {
        if (soloCargados) productos.sort((a, b) => marcaModificacion(b.codigo) - marcaModificacion(a.codigo));
        return productos.slice(0, limite);
    }

    return ordenarPorBusqueda(productos, consulta, {
        limite,
        campos: ["articulo", "codigo"],
        desempate: soloCargados
            ? (a, b) => marcaModificacion(b.codigo) - marcaModificacion(a.codigo)
            : undefined
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
            ubicacion,
            cantidad: cantidadNumerica
        })
    });

    const producto = guardarProductoLocal(data.producto);

    contador++;
    // El contador general sigue contando guardados locales.
    // Los contadores de Salón/Depósito se recalculan aparte por productos con valor > 0.

    registrarUltimo(producto);
    registrarModificacion(producto.codigo);
    return { producto, contador, ultimos: obtenerUltimosEscaneados() };
}

export async function modificarStockProducto(indice, salon, deposito) {
    if (!datos[indice]) throw new Error("Producto inválido");

    const productoBase = armarProducto(datos[indice], indice);

    const data = await pedirJson("/corregir", {
        method: "POST",
        body: JSON.stringify({
            codigo: productoBase.codigo,
            salon: normalizarEntero(salon),
            deposito: normalizarEntero(deposito)
        })
    });

    const producto = guardarProductoLocal(data.producto);
    registrarUltimo(producto);
    registrarModificacion(producto.codigo);
    return producto;
}

export async function listarVencimientos() {
    const data = await pedirJson("/vencimientos");
    return data.vencimientos || [];
}

export async function buscarProductoMaestroPorCodigo(codigoBuscado) {
    const codigo = normalizarTexto(codigoBuscado);
    if (!codigo) return { encontrado: false };
    const data = await pedirJson(`/producto-maestro/${encodeURIComponent(codigo)}`);
    return { encontrado: true, producto: data.producto };
}

export async function guardarVencimiento(registro) {
    const data = await pedirJson("/vencimientos", {
        method: "POST",
        body: JSON.stringify({
            codigo: normalizarTexto(registro.codigo),
            articulo: normalizarTexto(registro.articulo),
            vencimiento: normalizarTexto(registro.vencimiento),
            salon: normalizarEntero(registro.salon),
            deposito: normalizarEntero(registro.deposito)
        })
    });
    return data.vencimiento;
}


export async function actualizarVencimiento(id, registro) {
    const data = await pedirJson(`/vencimientos/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({
            vencimiento: normalizarTexto(registro.vencimiento),
            salon: normalizarEntero(registro.salon),
            deposito: normalizarEntero(registro.deposito)
        })
    });
    return data.vencimiento;
}

export async function actualizarOfertaVencimiento(id, oferta) {
    const data = await pedirJson(`/vencimientos/${encodeURIComponent(id)}/oferta`, {
        method: "PATCH",
        body: JSON.stringify({ oferta: oferta ? "Sí" : "No" })
    });
    return data.vencimiento;
}

export async function eliminarVencimiento(id) {
    const data = await pedirJson(`/vencimientos/${encodeURIComponent(id)}`, {
        method: "DELETE"
    });
    return data;
}
