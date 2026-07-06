import { API_BASE_URL } from "./config.js?v=313-contador-numero";

let datos = [];
let contador = 0;
let ultimosEscaneados = [];

function apiUrl(ruta) {
    const base = String(API_BASE_URL || "").replace(/\/$/, "");
    return `${base}${ruta}`;
}

function normalizarNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= 0 ? numero : 0;
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
    const respuesta = await fetch(apiUrl(ruta), {
        headers: {
            "Content-Type": "application/json"
        },
        ...opciones
    });

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
    const resultados = [];
    for (let i = 0; i < datos.length; i++) {
        const producto = armarProducto(datos[i], i);
        if (producto.stock > 0) resultados.push(producto);
        if (resultados.length >= limite) break;
    }
    return resultados;
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
    const consulta = normalizarTexto(texto).toLowerCase();
    const resultados = [];

    for (let i = 0; i < datos.length; i++) {
        const producto = armarProducto(datos[i], i);
        if (soloCargados && producto.stock <= 0) continue;

        if (!consulta) {
            resultados.push(producto);
        } else {
            const codigo = producto.codigo.toLowerCase();
            const articulo = producto.articulo.toLowerCase();
            if (codigo.includes(consulta) || articulo.includes(consulta)) resultados.push(producto);
        }

        if (resultados.length >= limite) break;
    }

    return resultados;
}

export async function guardarCantidadEnProducto(indice, cantidad, ubicacion) {
    if (!datos[indice]) throw new Error("Producto inválido");

    const cantidadNumerica = normalizarNumero(cantidad);
    if (cantidadNumerica <= 0) throw new Error("Ingresá una cantidad válida");

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
    return { producto, contador, ultimos: obtenerUltimosEscaneados() };
}

export async function modificarStockProducto(indice, salon, deposito) {
    if (!datos[indice]) throw new Error("Producto inválido");

    const productoBase = armarProducto(datos[indice], indice);

    const data = await pedirJson("/corregir", {
        method: "POST",
        body: JSON.stringify({
            codigo: productoBase.codigo,
            salon: normalizarNumero(salon),
            deposito: normalizarNumero(deposito)
        })
    });

    const producto = guardarProductoLocal(data.producto);
    registrarUltimo(producto);
    return producto;
}

export function descargarExcel() {
    if (datos.length === 0) throw new Error("Primero conectá Google Sheets");
    window.location.href = apiUrl("/descargar");
}
