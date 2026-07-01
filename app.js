import {
    cargarExcel,
    descargarExcel,
    buscarProductoPorCodigo,
    buscarProductosPorTexto,
    guardarCantidadEnProducto,
    modificarStockProducto,
    obtenerCantidadProductos,
    obtenerContador,
    obtenerUltimosEscaneados,
    reiniciarContador
} from "./excel.js?v=100";

import {
    iniciarScanner,
    detenerScanner,
    alternarLinterna,
    linternaDisponible
} from "./scanner.js?v=100";

import {
    ocultarSplash,
    cambiarPantalla,
    mostrarMensaje,
    actualizarEstadoExcel,
    actualizarEstadoCamara,
    actualizarUbicacion,
    mostrarProducto,
    mostrarProductoNoEncontrado,
    limpiarProducto,
    actualizarContador,
    activarBotonGuardar,
    activarBotonDescargar,
    activarBotonLinterna,
    actualizarBotonLinterna,
    configurarFeedback,
    reproducirConfirmacion,
    renderResultadosBusqueda,
    mostrarEditorStock,
    ocultarEditorStock,
    actualizarTotalEditor,
    obtenerValoresEditor
} from "./ui.js?v=100";

let ubicacionActual = "salon";
let productoActual = null;
let productoEditando = null;
let scannerActivo = false;
let linternaActiva = false;

const $ = (id) => document.getElementById(id);

const elementos = {
    excelFile: $("excelFile"),
    btnSalon: $("btnSalon"),
    btnDeposito: $("btnDeposito"),
    btnLinterna: $("btnLinterna"),
    btnGuardarCantidad: $("btnGuardarCantidad"),
    btnMenosCantidad: $("btnMenosCantidad"),
    btnMasCantidad: $("btnMasCantidad"),
    cantidadInput: $("cantidadInput"),
    btnDescargar: $("btnDescargar"),
    checkSonidos: $("checkSonidos"),
    checkVibracion: $("checkVibracion"),
    btnReiniciar: $("btnReiniciar"),
    buscadorProducto: $("buscadorProducto"),
    editarSalon: $("editarSalon"),
    editarDeposito: $("editarDeposito"),
    btnMenosSalon: $("btnMenosSalon"),
    btnMasSalon: $("btnMasSalon"),
    btnMenosDeposito: $("btnMenosDeposito"),
    btnMasDeposito: $("btnMasDeposito"),
    btnGuardarCorreccion: $("btnGuardarCorreccion"),
    btnCancelarCorreccion: $("btnCancelarCorreccion")
};

inicializar();

function inicializar() {
    ocultarSplash();
    actualizarUbicacion(ubicacionActual);
    actualizarContador(0);
    activarBotonGuardar(false);
    activarBotonDescargar(false);
    activarBotonLinterna(false);
    actualizarEstadoCamara(false);
    limpiarProducto();
    configurarFeedback({ sonidos: true, vibracion: true });

    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const pantalla = btn.dataset.pantalla;
            cambiarPantalla(pantalla);

            if (pantalla === "corregir") {
                refrescarBusqueda();
            }
        });
    });

    elementos.excelFile.addEventListener("change", manejarCargaExcel);
    elementos.btnSalon.addEventListener("click", () => cambiarUbicacion("salon"));
    elementos.btnDeposito.addEventListener("click", () => cambiarUbicacion("deposito"));
    elementos.btnLinterna.addEventListener("click", manejarLinterna);

    elementos.btnGuardarCantidad.addEventListener("click", guardarCantidadActual);
    elementos.cantidadInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") guardarCantidadActual();
    });

    elementos.btnMenosCantidad.addEventListener("click", () => cambiarCantidad(elementos.cantidadInput, -1, 1));
    elementos.btnMasCantidad.addEventListener("click", () => cambiarCantidad(elementos.cantidadInput, 1, 1));

    elementos.btnDescargar.addEventListener("click", manejarDescargaExcel);

    elementos.checkSonidos.addEventListener("change", actualizarPreferenciasFeedback);
    elementos.checkVibracion.addEventListener("change", actualizarPreferenciasFeedback);

    elementos.btnReiniciar.addEventListener("click", manejarReinicio);

    elementos.buscadorProducto.addEventListener("input", refrescarBusqueda);

    elementos.editarSalon.addEventListener("input", actualizarTotalEditor);
    elementos.editarDeposito.addEventListener("input", actualizarTotalEditor);
    elementos.btnMenosSalon.addEventListener("click", () => cambiarCantidad(elementos.editarSalon, -1, 0, actualizarTotalEditor));
    elementos.btnMasSalon.addEventListener("click", () => cambiarCantidad(elementos.editarSalon, 1, 0, actualizarTotalEditor));
    elementos.btnMenosDeposito.addEventListener("click", () => cambiarCantidad(elementos.editarDeposito, -1, 0, actualizarTotalEditor));
    elementos.btnMasDeposito.addEventListener("click", () => cambiarCantidad(elementos.editarDeposito, 1, 0, actualizarTotalEditor));
    elementos.btnGuardarCorreccion.addEventListener("click", guardarCorreccion);
    elementos.btnCancelarCorreccion.addEventListener("click", () => {
        productoEditando = null;
        ocultarEditorStock();
    });

    iniciarCamaraAutomaticamenteCuandoSePueda();
}

async function manejarCargaExcel(e) {
    try {
        const archivo = e.target.files[0];
        const cantidad = await cargarExcel(archivo);

        actualizarEstadoExcel(cantidad);
        actualizarContador(0);
        activarBotonDescargar(true);
        productoActual = null;
        productoEditando = null;
        limpiarProducto("Excel cargado. Iniciá la cámara o apuntá al código.");
        ocultarEditorStock();
        refrescarBusqueda();

        mostrarMensaje("Excel cargado correctamente", "ok");
        reproducirConfirmacion("guardado");

        if (!scannerActivo) {
            await iniciarCamaraSiCorresponde();
        }
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
        console.error(error);
    }
}

function cambiarUbicacion(ubicacion) {
    ubicacionActual = ubicacion;
    actualizarUbicacion(ubicacion);
    mostrarMensaje(`Ubicación: ${ubicacion === "salon" ? "Salón" : "Depósito"}`, "ok");
}

async function iniciarCamaraAutomaticamenteCuandoSePueda() {
    // No se inicia sola al abrir para evitar bloqueos de permisos del navegador.
    // Se inicia automáticamente después de cargar Excel si el navegador lo permite.
}

async function iniciarCamaraSiCorresponde() {
    if (scannerActivo || obtenerCantidadProductos() === 0) return;

    try {
        await iniciarScanner("video", manejarCodigoEscaneado);
        scannerActivo = true;
        actualizarEstadoCamara(true);
        activarBotonLinterna(linternaDisponible());
        mostrarMensaje("Cámara activa", "ok");
    } catch (error) {
        scannerActivo = false;
        actualizarEstadoCamara(false);
        activarBotonLinterna(false);
        mostrarMensaje("No se pudo iniciar la cámara. Revisá permisos.", "error");
        console.error(error);
    }
}

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
        mostrarMensaje("Producto no encontrado", "error");
        reproducirConfirmacion("error");
        return;
    }

    productoActual = resultado.producto;
    mostrarProducto(productoActual);
    activarBotonGuardar(true);
    elementos.cantidadInput.value = 1;
    elementos.cantidadInput.focus();
    mostrarMensaje("Producto encontrado", "ok");
    reproducirConfirmacion("ok");
}

function guardarCantidadActual() {
    try {
        if (!productoActual) {
            mostrarMensaje("Primero escaneá un producto", "error");
            reproducirConfirmacion("error");
            return;
        }

        const cantidad = Number(elementos.cantidadInput.value);

        if (!cantidad || cantidad <= 0) {
            mostrarMensaje("Ingresá una cantidad válida", "error");
            elementos.cantidadInput.focus();
            reproducirConfirmacion("error");
            return;
        }

        const resultado = guardarCantidadEnProducto(productoActual.indice, cantidad, ubicacionActual);

        mostrarProducto(resultado.producto);
        actualizarContador(resultado.contador);
        activarBotonGuardar(false);
        elementos.cantidadInput.value = 1;
        productoActual = null;
        refrescarBusqueda();

        mostrarMensaje("Cantidad guardada", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    }
}

function cambiarCantidad(input, diferencia, minimo = 0, callback = null) {
    const actual = Number(input.value) || 0;
    const nuevo = Math.max(minimo, actual + diferencia);
    input.value = nuevo;

    if (callback) callback();
}

function refrescarBusqueda() {
    if (obtenerCantidadProductos() === 0) {
        renderResultadosBusqueda([], seleccionarProductoParaEditar);
        return;
    }

    const texto = elementos.buscadorProducto.value || "";
    const resultados = texto.trim()
        ? buscarProductosPorTexto(texto, 12)
        : obtenerUltimosEscaneados();

    renderResultadosBusqueda(resultados, seleccionarProductoParaEditar);
}

function seleccionarProductoParaEditar(producto) {
    productoEditando = producto;
    mostrarEditorStock(producto);
}

function guardarCorreccion() {
    try {
        if (!productoEditando) {
            mostrarMensaje("Seleccioná un producto", "error");
            return;
        }

        const valores = obtenerValoresEditor();
        const producto = modificarStockProducto(productoEditando.indice, valores.salon, valores.deposito);

        productoEditando = producto;
        mostrarEditorStock(producto);
        refrescarBusqueda();

        if (productoActual && productoActual.indice === producto.indice) {
            productoActual = producto;
            mostrarProducto(producto);
        }

        mostrarMensaje("Stock corregido", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    }
}

function manejarDescargaExcel() {
    try {
        descargarExcel();
        mostrarMensaje("Excel descargado", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    }
}

async function manejarLinterna() {
    try {
        const estado = await alternarLinterna();
        linternaActiva = estado;
        actualizarBotonLinterna(linternaActiva);
    } catch (error) {
        mostrarMensaje("La linterna no está disponible en este celular", "error");
    }
}

function actualizarPreferenciasFeedback() {
    configurarFeedback({
        sonidos: elementos.checkSonidos.checked,
        vibracion: elementos.checkVibracion.checked
    });
}

function manejarReinicio() {
    const confirmar = confirm("¿Querés reiniciar el contador de productos contados?");

    if (!confirmar) return;

    const nuevoContador = reiniciarContador();
    actualizarContador(nuevoContador);
    refrescarBusqueda();
    mostrarMensaje("Conteo reiniciado", "ok");
}

window.addEventListener("beforeunload", () => {
    detenerScanner();
});
