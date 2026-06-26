import {
    cargarExcel,
    descargarExcel,
    buscarProductoPorCodigo,
    guardarCantidadEnProducto,
    deshacerUltimoMovimiento,
    obtenerCantidadProductos
} from "./excel.js?v=31";

import {
    iniciarScanner,
    detenerScanner
} from "./scanner.js?v=31";

import {
    mostrarMensaje,
    actualizarEstadoExcel,
    actualizarUbicacion,
    mostrarProducto,
    mostrarProductoNoEncontrado,
    limpiarProducto,
    actualizarContador,
    actualizarHistorial,
    activarBotonGuardar,
    activarBotonDescargar,
    activarBotonDeshacer,
    cambiarEstadoCamara,
    reproducirConfirmacion
} from "./ui.js?v=31";

let ubicacionActual = "salon";
let productoActual = null;
let scannerActivo = false;

const excelFile = document.getElementById("excelFile");
const btnSalon = document.getElementById("btnSalon");
const btnDeposito = document.getElementById("btnDeposito");
const btnIniciarCamara = document.getElementById("btnIniciarCamara");
const btnDetenerCamara = document.getElementById("btnDetenerCamara");
const btnGuardarCantidad = document.getElementById("btnGuardarCantidad");
const btnDescargar = document.getElementById("btnDescargar");
const btnDeshacer = document.getElementById("btnDeshacer");
const cantidadInput = document.getElementById("cantidadInput");

document.addEventListener("DOMContentLoaded", () => {
    actualizarUbicacion(ubicacionActual);
    actualizarContador(0);
    activarBotonGuardar(false);
    activarBotonDescargar(false);
    activarBotonDeshacer(false);
    cambiarEstadoCamara(false);
});

excelFile.addEventListener("change", async (e) => {
    try {
        const archivo = e.target.files[0];
        const cantidad = await cargarExcel(archivo);

        actualizarEstadoExcel(cantidad);
        actualizarContador(0);
        actualizarHistorial([]);
        activarBotonDescargar(true);
        activarBotonDeshacer(false);
        activarBotonGuardar(false);

        productoActual = null;
        limpiarProducto("Listo para iniciar cámara");

        mostrarMensaje("Excel cargado correctamente", "ok");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        console.error(error);
    }
});

btnSalon.addEventListener("click", () => {
    ubicacionActual = "salon";
    actualizarUbicacion("salon");
});

btnDeposito.addEventListener("click", () => {
    ubicacionActual = "deposito";
    actualizarUbicacion("deposito");
});

btnIniciarCamara.addEventListener("click", async () => {
    if (scannerActivo) {
        mostrarMensaje("La cámara ya está activa", "error");
        return;
    }

    if (obtenerCantidadProductos() === 0) {
        mostrarMensaje("Primero cargá el Excel", "error");
        return;
    }

    try {
        await iniciarScanner("video", manejarCodigoEscaneado);

        scannerActivo = true;
        cambiarEstadoCamara(true);
        mostrarMensaje("Cámara activa", "ok");
    } catch (error) {
        mostrarMensaje("No se pudo iniciar la cámara", "error");
        console.error(error);
    }
});

btnDetenerCamara.addEventListener("click", () => {
    detenerScanner();

    scannerActivo = false;
    productoActual = null;

    cambiarEstadoCamara(false);
    activarBotonGuardar(false);
    limpiarProducto("Cámara detenida");

    mostrarMensaje("Cámara detenida", "ok");
});

btnGuardarCantidad.addEventListener("click", guardarCantidad);

cantidadInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        guardarCantidad();
    }
});

btnDescargar.addEventListener("click", () => {
    try {
        descargarExcel();
        mostrarMensaje("Excel actualizado descargado", "ok");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        console.error(error);
    }
});

btnDeshacer.addEventListener("click", () => {
    const resultado = deshacerUltimoMovimiento();

    if (!resultado) {
        mostrarMensaje("No hay movimientos para deshacer", "error");
        return;
    }

    actualizarContador(resultado.contador);
    actualizarHistorial(resultado.historial);
    activarBotonDeshacer(resultado.historial.length > 0);

    productoActual = null;
    activarBotonGuardar(false);
    limpiarProducto("Último movimiento deshecho");

    mostrarMensaje("Se deshizo el último movimiento", "ok");
});

function manejarCodigoEscaneado(codigo) {
    if (obtenerCantidadProductos() === 0) {
        mostrarMensaje("Primero cargá el Excel", "error");
        return;
    }

    const resultado = buscarProductoPorCodigo(codigo);

    if (!resultado.encontrado) {
        productoActual = null;

        mostrarProductoNoEncontrado(codigo);
        activarBotonGuardar(false);

        reproducirConfirmacion("error");
        mostrarMensaje("Producto no encontrado", "error");
        return;
    }

    productoActual = resultado.producto;

    mostrarProducto(productoActual);
    activarBotonGuardar(true);

    cantidadInput.value = "";
    cantidadInput.focus();

    reproducirConfirmacion("ok");
    mostrarMensaje("Producto encontrado", "ok");
}

function guardarCantidad() {
    if (!productoActual) {
        mostrarMensaje("Primero escaneá un producto", "error");
        return;
    }

    const cantidad = Number(cantidadInput.value);

    if (!cantidad || cantidad <= 0) {
        mostrarMensaje("Ingresá una cantidad válida", "error");
        cantidadInput.focus();
        return;
    }

    const resultado = guardarCantidadEnProducto(
        productoActual.indice,
        cantidad,
        ubicacionActual
    );

    mostrarProducto(resultado.producto);
    actualizarContador(resultado.contador);
    actualizarHistorial(resultado.historial);
    activarBotonDeshacer(true);

    cantidadInput.value = "";
    productoActual = null;
    activarBotonGuardar(false);

    reproducirConfirmacion("guardado");
    mostrarMensaje("Cantidad guardada correctamente", "ok");
}
