import {
    cargarExcel,
    descargarExcel,
    buscarProductoPorCodigo,
    guardarCantidadEnProducto,
    deshacerUltimoMovimiento,
    obtenerCantidadProductos
} from "./excel.js";

import { iniciarScanner, detenerScanner } from "./scanner.js";

import {
    mostrarMensaje,
    actualizarEstadoExcel,
    actualizarUbicacion,
    mostrarProducto,
    limpiarProducto,
    actualizarContador,
    actualizarHistorial,
    activarBotonGuardar,
    activarBotonDescargar,
    activarBotonDeshacer,
    cambiarEstadoCamara
} from "./ui.js";

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

excelFile.addEventListener("change", async (e) => {
    try {
        const cantidad = await cargarExcel(e.target.files[0]);

        actualizarEstadoExcel(`✅ Excel cargado. Productos: ${cantidad}`);
        activarBotonDescargar(true);
        limpiarProducto("Listo para iniciar cámara");
        mostrarMensaje("Excel listo para usar", "ok");
    } catch (error) {
        mostrarMensaje(error.message, "error");
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
    if (scannerActivo) return;

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
    cambiarEstadoCamara(false);
    limpiarProducto("Cámara detenida");
});

btnGuardarCantidad.addEventListener("click", guardarCantidad);

cantidadInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") guardarCantidad();
});

btnDescargar.addEventListener("click", () => {
    try {
        descargarExcel();
        mostrarMensaje("Excel actualizado descargado", "ok");
    } catch (error) {
        mostrarMensaje(error.message, "error");
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
    limpiarProducto("Último movimiento deshecho");
});

function manejarCodigoEscaneado(codigo) {
    const resultado = buscarProductoPorCodigo(codigo);

    if (!resultado.encontrado) {
        productoActual = null;
        limpiarProducto(`Producto no encontrado: ${codigo}`);
        activarBotonGuardar(false);
        mostrarMensaje("Producto no encontrado", "error");
        return;
    }

    productoActual = resultado.producto;
    mostrarProducto(productoActual);
    activarBotonGuardar(true);

    cantidadInput.value = "";
    cantidadInput.focus();

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

    mostrarMensaje("Cantidad guardada correctamente", "ok");
}
