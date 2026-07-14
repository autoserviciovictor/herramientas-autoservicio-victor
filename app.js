import {
    cargarProductosDesdeServidor,
    sincronizarProductosDesdeServidor,
    obtenerProductoActualizadoPorCodigo,
    descargarExcel,
    buscarProductoPorCodigo,
    buscarProductosPorTexto,
    obtenerProductos,
    obtenerProductosCargados,
    guardarCantidadEnProducto,
    modificarStockProducto,
    obtenerCantidadProductos,
    obtenerContador,
    reiniciarContador,
    obtenerConteosUbicacion,
    listarVencimientos,
    guardarVencimiento,
    buscarProductoMaestroPorCodigo,
    actualizarVencimiento,
    eliminarVencimiento,
    actualizarOfertaVencimiento
} from "./excel.js?v=502-navegacion-inventario";

import {
    iniciarScanner,
    detenerScanner
} from "./scanner.js?v=502-navegacion-inventario";

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
    configurarFeedback,
    reproducirConfirmacion,
    renderResultadosBusqueda,
    mostrarEditorStock,
    actualizarTotalEditor,
    obtenerValoresEditor,
    activarModoCantidad,
    desactivarModoCantidad,
    activarTabProductos,
    actualizarConteosUbicacion
} from "./ui.js?v=502-navegacion-inventario";

import { inicializarReposicion, refrescarReposicion, prepararReposicion } from "./reposicion.js?v=502-navegacion-inventario";

let ubicacionActual = "salon";
let productoActual = null;
let productoEditando = null;
let scannerActivo = false;
let tabProductosActual = "productos";
let guardando = false;
let corrigiendo = false;
let sincronizando = false;
let sincronizacionAutomatica = null;
let productoVencimientoActual = null;
let guardandoVencimiento = false;
let vencimientosCache = [];
let filtroVencimientos = "todos";
let busquedaVencimientos = "";
let vencimientoSeleccionado = null;
let vencTabActual = "cargar";
const INTERVALO_SINCRONIZACION = 7000;

const $ = (id) => document.getElementById(id);

const elementos = {
    btnActualizarProductos: $("btnActualizarProductos"),
    btnAbrirScanner: $("btnAbrirScanner"),
    btnCerrarScanner: $("btnCerrarScanner"),
    btnCodigoManualToggle: $("btnCodigoManualToggle"),
    manualPanel: $("manualPanel"),
    codigoManualInput: $("codigoManualInput"),
    btnBuscarManual: $("btnBuscarManual"),
    scanPanel: $("scanPanel"),
    cameraCard: $("cameraCard"),
    btnSalon: $("btnSalon"),
    btnDeposito: $("btnDeposito"),
    btnGuardarCantidad: $("btnGuardarCantidad"),
    btnMenosCantidad: $("btnMenosCantidad"),
    btnMasCantidad: $("btnMasCantidad"),
    btnCancelarCantidad: $("btnCancelarCantidad"),
    cantidadInput: $("cantidadInput"),
    btnDescargar: $("btnDescargar"),
    checkSonidos: $("checkSonidos"),
    checkVibracion: $("checkVibracion"),
    btnReiniciar: $("btnReiniciar"),
    buscadorProducto: $("buscadorProducto"),
    tabProductos: $("tabProductos"),
    tabCargados: $("tabCargados"),
    btnVolverProductos: $("btnVolverProductos"),
    editarSalon: $("editarSalon"),
    editarDeposito: $("editarDeposito"),
    btnMenosSalon: $("btnMenosSalon"),
    btnMasSalon: $("btnMasSalon"),
    btnMenosDeposito: $("btnMenosDeposito"),
    btnMasDeposito: $("btnMasDeposito"),
    btnGuardarCorreccion: $("btnGuardarCorreccion"),
    btnVencAbrirScanner: $("btnVencAbrirScanner"),
    btnVencCerrarScanner: $("btnVencCerrarScanner"),
    btnVencManualToggle: $("btnVencManualToggle"),
    vencManualPanel: $("vencManualPanel"),
    vencCodigoManualInput: $("vencCodigoManualInput"),
    btnVencBuscarManual: $("btnVencBuscarManual"),
    vencCameraCard: $("vencCameraCard"),
    vencProductoCard: $("vencProductoCard"),
    vencEstadoProducto: $("vencEstadoProducto"),
    vencNombreProducto: $("vencNombreProducto"),
    vencCodigoProducto: $("vencCodigoProducto"),
    vencFormCard: $("vencFormCard"),
    vencFechaInput: $("vencFechaInput"),
    vencSalonInput: $("vencSalonInput"),
    vencDepositoInput: $("vencDepositoInput"),
    btnVencMenosSalon: $("btnVencMenosSalon"),
    btnVencMasSalon: $("btnVencMasSalon"),
    btnVencMenosDeposito: $("btnVencMenosDeposito"),
    btnVencMasDeposito: $("btnVencMasDeposito"),
    vencTotalTexto: $("vencTotalTexto"),
    btnVencGuardar: $("btnVencGuardar"),
    btnVencCancelarCarga: $("btnVencCancelarCarga"),
    btnVencActualizar: $("btnVencActualizar"),
    vencListado: $("vencListado"),
    vencBuscador: $("vencBuscador"),
    vencResumen: $("vencResumen"),
    vencListadoTitulo: $("vencListadoTitulo"),
    vencTabBtns: document.querySelectorAll("[data-venc-tab]"),
    vencModal: $("vencModal"),
    vencModalVista: $("vencModalVista"),
    vencModalEditar: $("vencModalEditar"),
    vencModalEliminar: $("vencModalEliminar"),
    btnVencModalCerrar: $("btnVencModalCerrar"),
    btnVencEditarAbrir: $("btnVencEditarAbrir"),
    btnVencEliminarAbrir: $("btnVencEliminarAbrir"),
    btnVencGuardarEdicion: $("btnVencGuardarEdicion"),
    btnVencCancelarEdicion: $("btnVencCancelarEdicion"),
    btnVencConfirmarEliminar: $("btnVencConfirmarEliminar"),
    btnVencCancelarEliminar: $("btnVencCancelarEliminar"),
    vencEditFechaInput: $("vencEditFechaInput"),
    vencEditSalonInput: $("vencEditSalonInput"),
    vencEditDepositoInput: $("vencEditDepositoInput"),
    btnVencEditMenosSalon: $("btnVencEditMenosSalon"),
    btnVencEditMasSalon: $("btnVencEditMasSalon"),
    btnVencEditMenosDeposito: $("btnVencEditMenosDeposito"),
    btnVencEditMasDeposito: $("btnVencEditMasDeposito"),
    vencEditTotalTexto: $("vencEditTotalTexto"),
    vencFiltroBtns: document.querySelectorAll("[data-venc-filtro]")
};

inicializar();

async function inicializar() {
    ocultarSplash();
    cambiarPantalla("inicio");
    actualizarUbicacion(ubicacionActual);
    actualizarEstadoExcel(0);
    actualizarContador(0);
    actualizarConteosUbicacion({ salon: 0, deposito: 0 });
    activarBotonGuardar(false);
    activarBotonDescargar(false);
    actualizarEstadoCamara(false);
    mostrarScannerCerrado();
    limpiarProducto();
    desactivarModoCantidad();
    configurarFeedback({ sonidos: true, vibracion: true });
    configurarEventos();
    inicializarReposicion();

    await cargarProductos();
}

async function entrarPantalla(nombre) {
    if (nombre !== "inventario") cerrarScanner(true);
    if (nombre !== "vencimientos") cerrarScannerVencimientos(false);

    if (elementos.buscadorProducto) elementos.buscadorProducto.value = "";
    if (elementos.vencBuscador) elementos.vencBuscador.value = "";
    busquedaVencimientos = "";

    if (nombre === "productos" || nombre === "cargados") {
        tabProductosActual = nombre === "cargados" ? "cargados" : "productos";
    }

    cambiarPantalla(nombre);

    if (["inventario", "productos", "cargados", "ajustes"].includes(nombre)) {
        await sincronizarEnSegundoPlano();
        if (nombre === "productos" || nombre === "cargados") refrescarProductos();
    }
    if (nombre === "vencimientos") cambiarTabVencimientos("cargar");
    if (nombre === "anotar") { prepararReposicion(); await refrescarReposicion(); }
}

function configurarEventos() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => entrarPantalla(btn.dataset.pantalla));
    });

    document.querySelectorAll("[data-modulo]").forEach(btn => {
        btn.addEventListener("click", () => entrarPantalla(btn.dataset.modulo));
    });

    elementos.btnActualizarProductos.addEventListener("click", cargarProductos);
    elementos.btnAbrirScanner.addEventListener("click", abrirScannerManual);
    elementos.btnCerrarScanner.addEventListener("click", () => cerrarScanner(true));
    elementos.btnCodigoManualToggle.addEventListener("click", alternarCargaManual);
    elementos.btnBuscarManual.addEventListener("click", procesarCodigoManual);
    elementos.codigoManualInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") procesarCodigoManual();
    });
    elementos.btnSalon.addEventListener("click", () => cambiarUbicacion("salon"));
    elementos.btnDeposito.addEventListener("click", () => cambiarUbicacion("deposito"));

    elementos.btnGuardarCantidad.addEventListener("click", guardarCantidadActual);
    elementos.btnCancelarCantidad.addEventListener("click", cancelarProductoActual);
    elementos.cantidadInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") guardarCantidadActual();
    });
    elementos.btnMenosCantidad.addEventListener("click", () => cambiarCantidad(elementos.cantidadInput, -1, 1));
    elementos.btnMasCantidad.addEventListener("click", () => cambiarCantidad(elementos.cantidadInput, 1, 1));

    elementos.btnDescargar.addEventListener("click", manejarDescargaExcel);
    elementos.checkSonidos.addEventListener("change", actualizarPreferenciasFeedback);
    elementos.checkVibracion.addEventListener("change", actualizarPreferenciasFeedback);
    elementos.btnReiniciar.addEventListener("click", manejarReinicio);

    elementos.buscadorProducto.addEventListener("input", refrescarProductos);
    elementos.btnVolverProductos.addEventListener("click", () => {
        cambiarPantalla(tabProductosActual === "cargados" ? "cargados" : "productos");
        refrescarProductos();
        sincronizarEnSegundoPlano();
    });

    elementos.editarSalon.addEventListener("input", actualizarTotalEditor);
    elementos.editarDeposito.addEventListener("input", actualizarTotalEditor);
    elementos.btnMenosSalon.addEventListener("click", () => cambiarCantidad(elementos.editarSalon, -1, 0, actualizarTotalEditor));
    elementos.btnMasSalon.addEventListener("click", () => cambiarCantidad(elementos.editarSalon, 1, 0, actualizarTotalEditor));
    elementos.btnMenosDeposito.addEventListener("click", () => cambiarCantidad(elementos.editarDeposito, -1, 0, actualizarTotalEditor));
    elementos.btnMasDeposito.addEventListener("click", () => cambiarCantidad(elementos.editarDeposito, 1, 0, actualizarTotalEditor));
    elementos.btnGuardarCorreccion.addEventListener("click", guardarCorreccion);

    elementos.btnVencAbrirScanner?.addEventListener("click", abrirScannerVencimientos);
    elementos.btnVencCerrarScanner?.addEventListener("click", () => cerrarScannerVencimientos(true));
    elementos.btnVencManualToggle?.addEventListener("click", alternarCargaManualVencimientos);
    elementos.btnVencBuscarManual?.addEventListener("click", procesarCodigoManualVencimientos);
    elementos.vencCodigoManualInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") procesarCodigoManualVencimientos();
    });
    elementos.vencSalonInput?.addEventListener("input", actualizarTotalVencimiento);
    elementos.vencDepositoInput?.addEventListener("input", actualizarTotalVencimiento);
    elementos.btnVencMenosSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencSalonInput, -1, 0, actualizarTotalVencimiento));
    elementos.btnVencMasSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencSalonInput, 1, 0, actualizarTotalVencimiento));
    elementos.btnVencMenosDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencDepositoInput, -1, 0, actualizarTotalVencimiento));
    elementos.btnVencMasDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencDepositoInput, 1, 0, actualizarTotalVencimiento));
    elementos.btnVencGuardar?.addEventListener("click", guardarVencimientoActual);
    elementos.btnVencCancelarCarga?.addEventListener("click", cancelarCargaVencimiento);
    elementos.btnVencActualizar?.addEventListener("click", cargarListadoVencimientos);
    elementos.vencBuscador?.addEventListener("input", () => {
        busquedaVencimientos = elementos.vencBuscador.value || "";
        renderListadoVencimientos();
    });
    elementos.vencFiltroBtns?.forEach(btn => {
        btn.addEventListener("click", () => {
            aplicarFiltroVencimientos(btn.dataset.vencFiltro || "todos");
        });
    });
    elementos.vencTabBtns?.forEach(btn => {
        btn.addEventListener("click", () => {
            cambiarTabVencimientos(btn.dataset.vencTab || "cargar");
        });
    });
    elementos.vencListado?.addEventListener("click", manejarClickListadoVencimientos);
    elementos.vencResumen?.addEventListener("click", manejarClickResumenVencimientos);
    elementos.btnVencModalCerrar?.addEventListener("click", cerrarModalVencimiento);
    elementos.vencModal?.addEventListener("click", (e) => { if (e.target === elementos.vencModal) cerrarModalVencimiento(); });
    elementos.btnVencEditarAbrir?.addEventListener("click", mostrarEdicionVencimiento);
    elementos.btnVencEliminarAbrir?.addEventListener("click", mostrarConfirmacionEliminarVencimiento);
    elementos.btnVencCancelarEdicion?.addEventListener("click", () => vencimientoSeleccionado && abrirDetalleVencimiento(vencimientoSeleccionado));
    elementos.btnVencCancelarEliminar?.addEventListener("click", () => vencimientoSeleccionado && abrirDetalleVencimiento(vencimientoSeleccionado));
    elementos.btnVencGuardarEdicion?.addEventListener("click", guardarEdicionVencimiento);
    elementos.btnVencConfirmarEliminar?.addEventListener("click", confirmarEliminarVencimiento);
    elementos.vencEditSalonInput?.addEventListener("input", actualizarTotalEdicionVencimiento);
    elementos.vencEditDepositoInput?.addEventListener("input", actualizarTotalEdicionVencimiento);
    elementos.btnVencEditMenosSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencEditSalonInput, -1, 0, actualizarTotalEdicionVencimiento));
    elementos.btnVencEditMasSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencEditSalonInput, 1, 0, actualizarTotalEdicionVencimiento));
    elementos.btnVencEditMenosDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencEditDepositoInput, -1, 0, actualizarTotalEdicionVencimiento));
    elementos.btnVencEditMasDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencEditDepositoInput, 1, 0, actualizarTotalEdicionVencimiento));
}

function cambiarTabVencimientos(tab) {
    vencTabActual = tab || "cargar";
    const titulos = { cargar: ["Vencimientos", "Control de fechas"], proximos: ["Próximos a vencer", "Control de fechas"], vencidos: ["Productos vencidos", "Control de fechas"] };
    const actual = titulos[vencTabActual] || titulos.cargar;
    if ($("brandHeaderTitulo")) $("brandHeaderTitulo").textContent = actual[0];
    if ($("brandHeaderSubtitulo")) $("brandHeaderSubtitulo").textContent = actual[1];
    if (elementos.vencBuscador) elementos.vencBuscador.value = "";
    busquedaVencimientos = "";
    filtroVencimientos = "todos";
    elementos.vencTabBtns?.forEach(b => b.classList.toggle("activo", (b.dataset.vencTab || "cargar") === vencTabActual));
    elementos.vencFiltroBtns?.forEach(b => b.classList.toggle("activo", (b.dataset.vencFiltro || "todos") === filtroVencimientos));

    const enCarga = vencTabActual === "cargar";
    elementos.btnVencAbrirScanner?.closest(".venc-actions-card")?.classList.toggle("oculto", !enCarga || Boolean(productoVencimientoActual));
    if (!enCarga) {
        elementos.vencCameraCard?.classList.add("oculto");
        elementos.vencFormCard?.classList.add("oculto");
        elementos.vencProductoCard?.classList.add("oculto");
    } else {
        elementos.vencProductoCard?.classList.toggle("oculto", !productoVencimientoActual);
        if (productoVencimientoActual) elementos.vencFormCard?.classList.remove("oculto");
    }

    actualizarVisibilidadPanelesVencimientos();
    renderListadoVencimientos();
    cargarListadoVencimientos();
}

function actualizarVisibilidadPanelesVencimientos() {
    const enCarga = vencTabActual === "cargar";
    const enProximos = vencTabActual === "proximos";
    const resumen = elementos.vencResumen || $("vencResumen");
    const filtros = document.querySelector(".venc-filtros");
    const buscador = elementos.vencBuscador;

    resumen?.classList.toggle("oculto", !enCarga);
    // Un solo título: el encabezado rojo identifica la pantalla.
    const cabeceraLista = document.querySelector("#pantallaVencimientos .venc-list-head");
    cabeceraLista?.classList.toggle("oculto", !enCarga);
    filtros?.classList.toggle("oculto", !enProximos);
    buscador?.classList.toggle("oculto", enCarga);
    if (buscador && enCarga) buscador.value = "";
}

function aplicarFiltroVencimientos(filtro) {
    filtroVencimientos = filtro || "todos";
    if (["7", "15", "30", "oferta", "sinOferta"].includes(filtroVencimientos)) vencTabActual = "proximos";
    if (filtroVencimientos === "vencidos") vencTabActual = "vencidos";
    elementos.vencTabBtns?.forEach(b => b.classList.toggle("activo", (b.dataset.vencTab || "cargar") === vencTabActual));
    elementos.vencFiltroBtns?.forEach(b => b.classList.toggle("activo", (b.dataset.vencFiltro || "todos") === filtroVencimientos));
    actualizarVisibilidadPanelesVencimientos();
    renderListadoVencimientos();
}

function manejarClickResumenVencimientos(event) {
    const card = event.target.closest("[data-venc-resumen]");
    if (!card) return;
    aplicarFiltroVencimientos(card.dataset.vencResumen || "todos");
}

async function cargarProductos() {
    try {
        activarBotonGuardar(false);
        activarBotonDescargar(false);
        productoActual = null;
        productoEditando = null;
        limpiarProducto("Conectando con Google Sheets...");
        desactivarModoCantidad();
        mostrarMensaje("Cargando productos...", "ok");

        const cantidad = await cargarProductosDesdeServidor();

        actualizarEstadoExcel(cantidad);
        actualizarContador(obtenerContador());
        actualizarConteosUbicacion(obtenerConteosUbicacion());
        activarBotonDescargar(cantidad > 0);
        limpiarProducto("Esperando escaneo...");
        refrescarProductos();

        mostrarMensaje("Google Sheets conectado", "ok");
        reproducirConfirmacion("guardado");
        iniciarSincronizacionAutomatica();
        mostrarScannerCerrado();
    } catch (error) {
        actualizarEstadoExcel(0);
        activarBotonDescargar(false);
        limpiarProducto("Error de conexión");
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

function mostrarScannerCerrado() {
    if (elementos.cameraCard) elementos.cameraCard.classList.add("oculto");
    if (elementos.scanPanel) elementos.scanPanel.classList.remove("oculto");
}

function mostrarScannerAbierto() {
    if (elementos.scanPanel) elementos.scanPanel.classList.add("oculto");
    if (elementos.cameraCard) elementos.cameraCard.classList.remove("oculto");
}

function ocultarControlesEscaneo() {
    if (elementos.scanPanel) elementos.scanPanel.classList.add("oculto");
    if (elementos.cameraCard) elementos.cameraCard.classList.add("oculto");
}

function alternarCargaManual() {
    const abrir = elementos.manualPanel.classList.contains("oculto");
    elementos.manualPanel.classList.toggle("oculto", !abrir);
    elementos.btnCodigoManualToggle.textContent = abrir ? "Cancelar código manual" : "Ingresar código manualmente";
    if (abrir) elementos.codigoManualInput.focus();
    else elementos.codigoManualInput.value = "";
}

async function procesarCodigoManual() {
    const codigo = String(elementos.codigoManualInput.value || "").trim();
    if (!codigo) {
        mostrarMensaje("Ingresá un código", "error");
        return;
    }

    elementos.codigoManualInput.value = "";
    elementos.manualPanel.classList.add("oculto");
    elementos.btnCodigoManualToggle.textContent = "Ingresar código manualmente";
    await manejarCodigoEscaneado(codigo);
}

async function abrirScannerManual() {
    if (obtenerCantidadProductos() === 0) {
        mostrarMensaje("Primero conectá Google Sheets", "error");
        return;
    }

    if (scannerActivo) return;

    try {
        limpiarProducto("Esperando escaneo...");
        desactivarModoCantidad();
        productoActual = null;
        mostrarScannerAbierto();
        await iniciarScanner("video", manejarCodigoEscaneado);
        scannerActivo = true;
        actualizarEstadoCamara(true);
        mostrarMensaje("Escáner activo", "ok");
    } catch (error) {
        scannerActivo = false;
        actualizarEstadoCamara(false);
        mostrarScannerCerrado();
        mostrarMensaje("No se pudo iniciar la cámara. Revisá permisos.", "error");
        console.error(error);
    }
}

function cerrarScanner(mostrarBoton = true) {
    detenerScanner();
    scannerActivo = false;
    actualizarEstadoCamara(false);

    if (mostrarBoton) {
        mostrarScannerCerrado();
    } else {
        ocultarControlesEscaneo();
    }
}

function cancelarProductoActual() {
    productoActual = null;
    elementos.cantidadInput.value = 1;
    activarBotonGuardar(false);
    desactivarModoCantidad();
    limpiarProducto("Esperando escaneo...");
    cerrarScanner(true);
    mostrarMensaje("Carga cancelada", "ok");
}

async function manejarCodigoEscaneado(codigo) {
    if (guardando) return;

    if (obtenerCantidadProductos() === 0) {
        mostrarMensaje("Primero conectá Google Sheets", "error");
        return;
    }

    cerrarScanner(false);

    let resultado = buscarProductoPorCodigo(codigo);

    if (resultado.encontrado) {
        try {
            // V2.1.1: antes de contar, trae el dato actualizado desde Google Sheets.
            resultado = await obtenerProductoActualizadoPorCodigo(codigo);
        } catch (error) {
            console.warn("No se pudo refrescar el producto antes de contar:", error);
        }
    }

    if (!resultado.encontrado) {
        productoActual = null;
        mostrarProductoNoEncontrado(codigo);
        activarBotonGuardar(false);
        desactivarModoCantidad();
        mostrarMensaje("Producto no encontrado", "error");
        reproducirConfirmacion("error");
        mostrarScannerCerrado();
        return;
    }

    productoActual = resultado.producto;
    mostrarProducto(productoActual);
    activarBotonGuardar(true);
    elementos.cantidadInput.value = 1;
    activarModoCantidad();
    mostrarMensaje("Producto encontrado", "ok");
    reproducirConfirmacion("ok");
}

async function guardarCantidadActual() {
    try {
        if (guardando) return;

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

        guardando = true;
        activarBotonGuardar(false);
        mostrarMensaje("Guardando en Google Sheets...", "ok");

        const resultado = await guardarCantidadEnProducto(productoActual.indice, cantidad, ubicacionActual);

        actualizarContador(resultado.contador);
        actualizarConteosUbicacion(obtenerConteosUbicacion());
        refrescarProductos();
        sincronizarEnSegundoPlano();
        mostrarMensaje(`Guardado: +${cantidad}`, "ok");
        reproducirConfirmacion("guardado");

        productoActual = null;
        elementos.cantidadInput.value = 1;

        setTimeout(() => {
            limpiarProducto("Esperando escaneo...");
            desactivarModoCantidad();
            mostrarScannerCerrado();
        }, 350);
    } catch (error) {
        activarBotonGuardar(Boolean(productoActual));
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    } finally {
        guardando = false;
    }
}

function cambiarCantidad(input, diferencia, minimo = 0, callback = null) {
    const actual = Number(input.value) || 0;
    const nuevo = Math.max(minimo, actual + diferencia);
    input.value = nuevo;
    if (callback) callback();
}

function cambiarTabProductos(tab) {
    tabProductosActual = tab === "cargados" ? "cargados" : "productos";
    if (elementos.buscadorProducto) elementos.buscadorProducto.value = "";
    sincronizarEnSegundoPlano().finally(refrescarProductos);
}

function refrescarProductos() {
    const total = obtenerCantidadProductos();
    const texto = elementos.buscadorProducto.value || "";
    const consulta = texto.trim();

    if (total === 0) {
        renderResultadosBusqueda([], seleccionarProductoParaEditar, { tab: tabProductosActual, total: 0, consulta });
        return;
    }

    let resultados;
    if (tabProductosActual === "cargados") {
        resultados = consulta
            ? buscarProductosPorTexto(consulta, 80, true)
            : obtenerProductosCargados(80);
    } else {
        resultados = consulta
            ? buscarProductosPorTexto(consulta, 80, false)
            : obtenerProductos(80);
    }

    renderResultadosBusqueda(resultados, seleccionarProductoParaEditar, {
        tab: tabProductosActual,
        total,
        consulta
    });
}

function seleccionarProductoParaEditar(producto) {
    productoEditando = producto;
    mostrarEditorStock(producto);
}

async function guardarCorreccion() {
    try {
        if (corrigiendo) return;

        if (!productoEditando) {
            mostrarMensaje("Seleccioná un producto", "error");
            return;
        }

        corrigiendo = true;
        elementos.btnGuardarCorreccion.disabled = true;
        mostrarMensaje("Guardando corrección...", "ok");

        const valores = obtenerValoresEditor();
        const producto = await modificarStockProducto(productoEditando.indice, valores.salon, valores.deposito);

        productoEditando = null;
        cambiarPantalla(tabProductosActual === "cargados" ? "cargados" : "productos");
        refrescarProductos();
        sincronizarEnSegundoPlano();

        if (productoActual && productoActual.codigo === producto.codigo) {
            productoActual = producto;
            mostrarProducto(producto);
        }

        mostrarMensaje("Stock corregido", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    } finally {
        corrigiendo = false;
        elementos.btnGuardarCorreccion.disabled = false;
    }
}

function manejarDescargaExcel() {
    try {
        descargarExcel();
        mostrarMensaje("Descargando Excel", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    }
}

function actualizarPreferenciasFeedback() {
    configurarFeedback({
        sonidos: elementos.checkSonidos.checked,
        vibracion: elementos.checkVibracion.checked
    });
}

function manejarReinicio() {
    const confirmar = confirm("¿Querés reiniciar los contadores locales de esta app?");
    if (!confirmar) return;

    const nuevoContador = reiniciarContador();
    actualizarContador(nuevoContador);
    actualizarConteosUbicacion(obtenerConteosUbicacion());
    refrescarProductos();
    mostrarMensaje("Contador local reiniciado", "ok");
}

function iniciarSincronizacionAutomatica() {
    if (sincronizacionAutomatica) return;

    sincronizacionAutomatica = setInterval(() => {
        sincronizarEnSegundoPlano();
    }, INTERVALO_SINCRONIZACION);
}

async function sincronizarEnSegundoPlano() {
    if (sincronizando || guardando || corrigiendo || obtenerCantidadProductos() === 0) return;

    try {
        sincronizando = true;
        const cantidad = await sincronizarProductosDesdeServidor();
        actualizarEstadoExcel(cantidad);
        actualizarConteosUbicacion(obtenerConteosUbicacion());

        if (productoActual) {
            const actualizado = buscarProductoPorCodigo(productoActual.codigo);
            if (actualizado.encontrado) {
                productoActual = actualizado.producto;
                mostrarProducto(productoActual);
            }
        }

        if (productoEditando) {
            const actualizado = buscarProductoPorCodigo(productoEditando.codigo);
            if (actualizado.encontrado) {
                productoEditando = actualizado.producto;
            }
        }

        refrescarProductos();
    } catch (error) {
        console.warn("No se pudo sincronizar en segundo plano:", error);
    } finally {
        sincronizando = false;
    }
}



function alternarCargaManualVencimientos() {
    const abrir = elementos.vencManualPanel?.classList.contains("oculto");
    elementos.vencManualPanel?.classList.toggle("oculto", !abrir);
    if (elementos.btnVencManualToggle) elementos.btnVencManualToggle.textContent = abrir ? "Cancelar código manual" : "Ingresar código manualmente";
    if (abrir) elementos.vencCodigoManualInput?.focus();
    else if (elementos.vencCodigoManualInput) elementos.vencCodigoManualInput.value = "";
}

async function procesarCodigoManualVencimientos() {
    const codigo = String(elementos.vencCodigoManualInput?.value || "").trim();
    if (!codigo) {
        mostrarMensaje("Ingresá un código", "error");
        return;
    }
    elementos.vencCodigoManualInput.value = "";
    elementos.vencManualPanel?.classList.add("oculto");
    if (elementos.btnVencManualToggle) elementos.btnVencManualToggle.textContent = "Ingresar código manualmente";
    await manejarCodigoVencimiento(codigo);
}

function mostrarScannerVencimientosAbierto() {
    elementos.vencCameraCard?.classList.remove("oculto");
    elementos.btnVencAbrirScanner?.closest(".venc-actions-card")?.classList.add("oculto");
}

function cerrarScannerVencimientos(mostrarMensajeCierre = false) {
    detenerScanner();
    scannerActivo = false;
    elementos.vencCameraCard?.classList.add("oculto");
    elementos.btnVencAbrirScanner?.closest(".venc-actions-card")?.classList.remove("oculto");
    if (mostrarMensajeCierre) mostrarMensaje("Escáner cerrado", "ok");
}

function ocultarAccionesVencimientos() {
    elementos.btnVencAbrirScanner?.closest(".venc-actions-card")?.classList.add("oculto");
    elementos.vencManualPanel?.classList.add("oculto");
}

function mostrarAccionesVencimientos() {
    if (vencTabActual === "cargar") {
        elementos.btnVencAbrirScanner?.closest(".venc-actions-card")?.classList.remove("oculto");
    }
}

function reiniciarFormularioVencimientos() {
    productoVencimientoActual = null;
    elementos.vencManualPanel?.classList.add("oculto");
    if (elementos.btnVencManualToggle) elementos.btnVencManualToggle.textContent = "Ingresar código manualmente";
    if (elementos.vencFechaInput) elementos.vencFechaInput.value = "";
    if (elementos.vencSalonInput) elementos.vencSalonInput.value = 0;
    if (elementos.vencDepositoInput) elementos.vencDepositoInput.value = 0;
    actualizarTotalVencimiento();
    elementos.vencFormCard?.classList.add("oculto");
    elementos.vencProductoCard?.classList.add("oculto");
    elementos.vencProductoCard?.classList.remove("found", "error");
    elementos.vencProductoCard?.classList.add("empty");
    if (elementos.vencEstadoProducto) elementos.vencEstadoProducto.textContent = "Esperando código";
    if (elementos.vencNombreProducto) elementos.vencNombreProducto.textContent = "Escaneá o ingresá un código...";
    if (elementos.vencCodigoProducto) elementos.vencCodigoProducto.textContent = "-";
}

function cancelarCargaVencimiento() {
    cerrarScannerVencimientos(false);
    reiniciarFormularioVencimientos();
    mostrarAccionesVencimientos();
    mostrarMensaje("Carga cancelada", "ok");
}

async function abrirScannerVencimientos() {
    if (scannerActivo) return;

    try {
        productoVencimientoActual = null;
        mostrarScannerVencimientosAbierto();
        await iniciarScanner("videoVencimientos", manejarCodigoVencimiento);
        scannerActivo = true;
        mostrarMensaje("Escáner activo", "ok");
    } catch (error) {
        scannerActivo = false;
        elementos.vencCameraCard?.classList.add("oculto");
        elementos.btnVencAbrirScanner?.closest(".venc-actions-card")?.classList.remove("oculto");
        mostrarMensaje("No se pudo iniciar la cámara. Revisá permisos.", "error");
        console.error(error);
    }
}

async function manejarCodigoVencimiento(codigo) {
    if (vencTabActual !== "cargar") cambiarTabVencimientos("cargar");
    cerrarScannerVencimientos(false);

    let resultado = { encontrado: false };
    try {
        resultado = await buscarProductoMaestroPorCodigo(codigo);
    } catch (error) {
        console.warn("No se encontró en Productos:", error);
    }

    if (!resultado.encontrado) {
        productoVencimientoActual = null;
        elementos.vencProductoCard?.classList.remove("oculto");
        elementos.vencProductoCard?.classList.remove("empty", "found");
        elementos.vencProductoCard?.classList.add("error");
        elementos.vencEstadoProducto.textContent = "Código no encontrado";
        elementos.vencNombreProducto.textContent = "No encontramos este código en la base maestra.";
        elementos.vencCodigoProducto.textContent = codigo;
        elementos.vencFormCard?.classList.add("oculto");
        mostrarAccionesVencimientos();
        mostrarMensaje("Producto no encontrado", "error");
        reproducirConfirmacion("error");
        return;
    }

    productoVencimientoActual = resultado.producto;
    elementos.vencProductoCard?.classList.remove("oculto");
    elementos.vencProductoCard?.classList.remove("empty", "error");
    elementos.vencProductoCard?.classList.add("found");
    elementos.vencEstadoProducto.textContent = "Producto encontrado";
    elementos.vencNombreProducto.textContent = productoVencimientoActual.articulo;
    elementos.vencCodigoProducto.textContent = `Código: ${productoVencimientoActual.codigo}`;
    elementos.vencFormCard?.classList.remove("oculto");
    ocultarAccionesVencimientos();
    elementos.vencFechaInput.focus();
    actualizarTotalVencimiento();
    mostrarMensaje("Producto encontrado", "ok");
    reproducirConfirmacion("ok");
}

function actualizarTotalVencimiento() {
    const salon = Number(elementos.vencSalonInput?.value) || 0;
    const deposito = Number(elementos.vencDepositoInput?.value) || 0;
    if (elementos.vencTotalTexto) elementos.vencTotalTexto.textContent = salon + deposito;
}

async function guardarVencimientoActual() {
    try {
        if (guardandoVencimiento) return;
        if (!productoVencimientoActual) {
            mostrarMensaje("Primero escaneá un producto", "error");
            return;
        }
        const vencimiento = elementos.vencFechaInput.value;
        const salon = Number(elementos.vencSalonInput.value) || 0;
        const deposito = Number(elementos.vencDepositoInput.value) || 0;
        if (!vencimiento) {
            mostrarMensaje("Cargá la fecha de vencimiento", "error");
            elementos.vencFechaInput.focus();
            return;
        }
        if (salon + deposito <= 0) {
            mostrarMensaje("Cargá salón o depósito", "error");
            return;
        }

        guardandoVencimiento = true;
        elementos.btnVencGuardar.disabled = true;
        mostrarMensaje("Guardando vencimiento...", "ok");

        await guardarVencimiento({
            codigo: productoVencimientoActual.codigo,
            articulo: productoVencimientoActual.articulo,
            vencimiento,
            salon,
            deposito
        });

        reiniciarFormularioVencimientos();
        mostrarAccionesVencimientos();

        await cargarListadoVencimientos();
        mostrarMensaje("Vencimiento guardado", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    } finally {
        guardandoVencimiento = false;
        if (elementos.btnVencGuardar) elementos.btnVencGuardar.disabled = false;
    }
}

async function cargarListadoVencimientos() {
    try {
        if (!elementos.vencListado) return;
        elementos.vencListado.textContent = "Cargando vencimientos...";
        vencimientosCache = await listarVencimientos();
        renderListadoVencimientos();
    } catch (error) {
        if (elementos.vencListado) elementos.vencListado.innerHTML = `<div class="venc-list-empty">${error.message}</div>`;
    }
}

function diasHastaVencimiento(fecha) {
    if (!fecha) return 99999;
    const hoy = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
    const vence = new Date(String(fecha) + "T00:00:00");
    if (Number.isNaN(vence.getTime())) return 99999;
    return Math.ceil((vence - hoy) / 86400000);
}

function formatearFecha(fecha) {
    if (!fecha) return "-";
    const partes = String(fecha).split("-");
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return fecha;
}

function tieneOferta(item) {
    const texto = String(item.oferta || "").trim().toLowerCase();
    return ["sí", "si", "true", "1", "oferta", "activo", "activa"].includes(texto);
}

function claseEstadoVencimiento(item) {
    const estado = String(item.estado || "").toLowerCase();
    const dias = diasHastaVencimiento(item.vencimiento);
    if (estado.includes("vencido") || dias < 0) return "venc-vencido";
    if (dias <= 7) return "venc-7";
    if (dias <= 15) return "venc-15";
    if (dias <= 30 || estado.includes("próximo") || estado.includes("proximo")) return "venc-30";
    return "venc-vigente";
}

function textoEstadoVencimiento(item) {
    const dias = diasHastaVencimiento(item.vencimiento);
    if (dias < 0) {
        const vencidoHace = Math.abs(dias);
        return vencidoHace === 1 ? "Vencido ayer" : `Vencido hace ${vencidoHace} días`;
    }
    if (dias === 0) return "Vence hoy";
    if (dias === 1) return "Falta 1 día";
    if (dias <= 30) return `Faltan ${dias} días`;
    return "Vigente";
}

function bucketVencimiento(item) {
    const dias = diasHastaVencimiento(item.vencimiento);
    if (dias < 0) return "vencidos";
    if (dias <= 7) return "7";
    if (dias <= 15) return "15";
    if (dias <= 30) return "30";
    return "vigente";
}

function filtrarVencimientos() {
    const q = vencTabActual === "cargar" ? "" : String(busquedaVencimientos || "").trim().toLowerCase();
    return vencimientosCache.filter(item => {
        const bucket = bucketVencimiento(item);

        if (vencTabActual === "proximos" && !["7", "15", "30"].includes(bucket)) return false;
        if (vencTabActual === "vencidos" && bucket !== "vencidos") return false;

        if (vencTabActual === "proximos") {
            if (filtroVencimientos === "7" && bucket !== "7") return false;
            if (filtroVencimientos === "15" && bucket !== "15") return false;
            if (filtroVencimientos === "30" && bucket !== "30") return false;
            if (filtroVencimientos === "oferta" && !tieneOferta(item)) return false;
            if (filtroVencimientos === "sinOferta" && tieneOferta(item)) return false;
        }

        if (q) {
            const texto = `${item.codigo || ""} ${item.articulo || ""}`.toLowerCase();
            if (!texto.includes(q)) return false;
        }
        return true;
    });
}

function renderResumenVencimientos() {
    const resumen = {
        vencidos: vencimientosCache.filter(item => bucketVencimiento(item) === "vencidos").length,
        siete: vencimientosCache.filter(item => bucketVencimiento(item) === "7").length,
        quince: vencimientosCache.filter(item => bucketVencimiento(item) === "15").length,
        treinta: vencimientosCache.filter(item => bucketVencimiento(item) === "30").length,
    };
    const el = elementos.vencResumen || $("vencResumen");
    if (!el) return;
    el.innerHTML = `
        <button type="button" class="venc-resumen-card venc-resumen-7" data-venc-resumen="7"><span>7 días</span><strong>${resumen.siete}</strong></button>
        <button type="button" class="venc-resumen-card venc-resumen-15" data-venc-resumen="15"><span>15 días</span><strong>${resumen.quince}</strong></button>
        <button type="button" class="venc-resumen-card venc-resumen-30" data-venc-resumen="30"><span>30 días</span><strong>${resumen.treinta}</strong></button>
        <button type="button" class="venc-resumen-card venc-resumen-vencidos" data-venc-resumen="vencidos"><span>Vencidos</span><strong>${resumen.vencidos}</strong></button>
    `;
}

function renderListadoVencimientos() {
    if (!elementos.vencListado) return;
    renderResumenVencimientos();
    actualizarVisibilidadPanelesVencimientos();

    if (elementos.vencListadoTitulo) {
        elementos.vencListadoTitulo.textContent = vencTabActual === "cargar"
            ? "Últimos registros cargados"
            : (vencTabActual === "vencidos" ? "Productos vencidos" : "Próximos a vencer");
    }

    const limite = vencTabActual === "cargar" ? 6 : 80;
    const baseLista = filtrarVencimientos();
    const ordenada = [...baseLista].sort((a, b) => {
        if (vencTabActual === "cargar") {
            return String(b.id || b.fechaCarga || "").localeCompare(String(a.id || a.fechaCarga || ""));
        }
        return diasHastaVencimiento(a.vencimiento) - diasHastaVencimiento(b.vencimiento);
    });
    const lista = ordenada.slice(0, limite);

    if (!lista.length) {
        elementos.vencListado.className = "venc-list-empty";
        elementos.vencListado.textContent = vencimientosCache.length ? "No hay registros con ese filtro." : "Todavía no hay vencimientos cargados.";
        return;
    }

    elementos.vencListado.className = `venc-list venc-list-${vencTabActual}`;
    elementos.vencListado.innerHTML = lista.map(item => {
        const clase = claseEstadoVencimiento(item);
        const cantidad = Number(item.total) || ((Number(item.salon) || 0) + (Number(item.deposito) || 0));
        const articulo = item.articulo || "Sin descripción";
        const codigo = item.codigo || "-";
        const fecha = formatearFecha(item.vencimiento);
        const salon = Number(item.salon) || 0;
        const deposito = Number(item.deposito) || 0;
        const estado = textoEstadoVencimiento(item);
        const ofertaActiva = tieneOferta(item);

        if (vencTabActual === "cargar") {
            return `
                <article class="venc-item venc-item-reciente ${clase}" data-id="${item.id}">
                    <div class="venc-reciente-info">
                        <strong>${articulo}</strong>
                        <div class="venc-reciente-meta">
                            <span>📅 ${fecha}</span>
                            <em class="venc-reciente-dias ${clase}">${estado}</em>
                        </div>
                    </div>
                    <b>${cantidad} unid.</b>
                </article>
            `;
        }

        if (vencTabActual === "vencidos") {
            return `
                <article class="venc-item venc-item-vencido-registro venc-vencido" data-id="${item.id}">
                    <div class="venc-vencido-body">
                        <strong>${articulo}</strong>
                        <span class="venc-code">Código: ${codigo}</span>
                        <div class="venc-vencido-fecha"><span>📅 Venció: <b>${fecha}</b></span><em>${estado}</em></div>
                        <div class="venc-vencido-grid">
                            <span><small>Salón</small><b>${salon}</b></span>
                            <span><small>Depósito</small><b>${deposito}</b></span>
                            <span><small>Total</small><b>${cantidad} unid.</b></span>
                        </div>
                    </div>
                    <button type="button" class="venc-card-action danger venc-delete-only" data-venc-accion="eliminar">Eliminar</button>
                </article>
            `;
        }

        return `
            <article class="venc-item venc-item-proximo ${clase} ${ofertaActiva ? "venc-con-oferta" : ""}" data-id="${item.id}">
                <div class="venc-offer-top ${ofertaActiva ? "activa" : "pendiente"}">${ofertaActiva ? "🏷️ OFERTA ACTIVA" : "Sin oferta"}</div>
                <div class="venc-item-main venc-proximo-main">
                    <div>
                        <strong>${articulo}</strong>
                        <span class="venc-code">Código: ${codigo}</span>
                    </div>
                </div>
                <div class="venc-proximo-fecha-row">
                    <span class="venc-date-pill">📅 ${fecha}</span>
                    <b class="venc-state-pill ${clase}">${estado}</b>
                </div>
                <div class="venc-proximo-grid">
                    <span><small>Salón</small><b>${salon}</b></span>
                    <span><small>Depósito</small><b>${deposito}</b></span>
                    <span><small>Total</small><b>${cantidad} unid.</b></span>
                </div>
                <div class="venc-proximo-actions venc-proximo-actions-3">
                    <button type="button" class="venc-card-action offer ${ofertaActiva ? "active" : ""}" data-venc-accion="oferta">${ofertaActiva ? "Quitar oferta" : "Marcar oferta"}</button>
                    <button type="button" class="venc-card-action" data-venc-accion="editar">Editar</button>
                    <button type="button" class="venc-card-action danger" data-venc-accion="eliminar">Eliminar</button>
                </div>
            </article>
        `;
    }).join("");
}

function manejarClickListadoVencimientos(event) {
    const card = event.target.closest(".venc-item");
    if (!card) return;
    const accion = event.target.closest("[data-venc-accion]")?.dataset.vencAccion;
    if (!accion) return;
    const item = vencimientosCache.find(registro => String(registro.id) === String(card.dataset.id));
    if (!item) return;
    vencimientoSeleccionado = item;
    if (accion === "oferta" && vencTabActual === "proximos") {
        alternarOfertaVencimiento(item);
        return;
    }
    if (accion === "editar" && vencTabActual === "proximos") {
        abrirDetalleVencimiento(item);
        mostrarEdicionVencimiento();
        return;
    }
    if (accion === "eliminar") {
        abrirDetalleVencimiento(item);
        mostrarConfirmacionEliminarVencimiento();
    }
}

async function alternarOfertaVencimiento(item) {
    if (!item?.id) return;
    try {
        mostrarMensaje(tieneOferta(item) ? "Quitando oferta..." : "Marcando oferta...", "ok");
        const nuevaOferta = !tieneOferta(item);
        await actualizarOfertaVencimiento(item.id, nuevaOferta);
        await cargarListadoVencimientos();
        mostrarMensaje(nuevaOferta ? "Oferta marcada" : "Oferta quitada", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    }
}

function mostrarPanelModal(panel) {
    [elementos.vencModalVista, elementos.vencModalEditar, elementos.vencModalEliminar].forEach(el => el?.classList.add("oculto"));
    panel?.classList.remove("oculto");
}

function abrirDetalleVencimiento(item) {
    vencimientoSeleccionado = item;
    const setText = (id, valor) => { const el = $(id); if (el) el.textContent = valor; };
    setText("vencModalTitulo", item.articulo || "Sin descripción");
    setText("vencModalCodigo", item.codigo || "-");
    setText("vencModalFecha", formatearFecha(item.vencimiento));
    setText("vencModalSalon", item.salon || 0);
    setText("vencModalDeposito", item.deposito || 0);
    setText("vencModalTotal", item.total || 0);
    const estado = $("vencModalEstado");
    if (estado) {
        estado.textContent = textoEstadoVencimiento(item);
        estado.className = `venc-modal-status ${claseEstadoVencimiento(item)}`;
    }
    mostrarPanelModal(elementos.vencModalVista);
    elementos.vencModal?.classList.remove("oculto");
    elementos.vencModal?.setAttribute("aria-hidden", "false");
}

function cerrarModalVencimiento() {
    elementos.vencModal?.classList.add("oculto");
    elementos.vencModal?.setAttribute("aria-hidden", "true");
    vencimientoSeleccionado = null;
}

function mostrarEdicionVencimiento() {
    const item = vencimientoSeleccionado;
    if (!item) return;
    const titulo = $("vencEditarTitulo");
    if (titulo) titulo.textContent = item.articulo || "Editar registro";
    if (elementos.vencEditFechaInput) elementos.vencEditFechaInput.value = item.vencimiento || "";
    if (elementos.vencEditSalonInput) elementos.vencEditSalonInput.value = item.salon || 0;
    if (elementos.vencEditDepositoInput) elementos.vencEditDepositoInput.value = item.deposito || 0;
    actualizarTotalEdicionVencimiento();
    mostrarPanelModal(elementos.vencModalEditar);
}

function actualizarTotalEdicionVencimiento() {
    const salon = Number(elementos.vencEditSalonInput?.value) || 0;
    const deposito = Number(elementos.vencEditDepositoInput?.value) || 0;
    if (elementos.vencEditTotalTexto) elementos.vencEditTotalTexto.textContent = salon + deposito;
}

async function guardarEdicionVencimiento() {
    const item = vencimientoSeleccionado;
    if (!item) return;
    const vencimiento = elementos.vencEditFechaInput?.value;
    const salon = Number(elementos.vencEditSalonInput?.value) || 0;
    const deposito = Number(elementos.vencEditDepositoInput?.value) || 0;
    if (!vencimiento) { mostrarMensaje("Cargá la fecha de vencimiento", "error"); return; }
    if (salon + deposito <= 0) { mostrarMensaje("Cargá salón o depósito", "error"); return; }
    try {
        elementos.btnVencGuardarEdicion.disabled = true;
        mostrarMensaje("Actualizando registro...", "ok");
        await actualizarVencimiento(item.id, { vencimiento, salon, deposito });
        await cargarListadoVencimientos();
        cerrarModalVencimiento();
        mostrarMensaje("Registro actualizado", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    } finally {
        if (elementos.btnVencGuardarEdicion) elementos.btnVencGuardarEdicion.disabled = false;
    }
}

function mostrarConfirmacionEliminarVencimiento() {
    const item = vencimientoSeleccionado;
    if (!item) return;
    const texto = $("vencEliminarTexto");
    if (texto) texto.textContent = `${item.articulo || "Producto"} · Vence ${formatearFecha(item.vencimiento)}`;
    mostrarPanelModal(elementos.vencModalEliminar);
}

async function confirmarEliminarVencimiento() {
    const item = vencimientoSeleccionado;
    if (!item) return;
    try {
        elementos.btnVencConfirmarEliminar.disabled = true;
        mostrarMensaje("Eliminando registro...", "ok");
        await eliminarVencimiento(item.id);
        await cargarListadoVencimientos();
        cerrarModalVencimiento();
        mostrarMensaje("Registro eliminado", "ok");
        reproducirConfirmacion("guardado");
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    } finally {
        if (elementos.btnVencConfirmarEliminar) elementos.btnVencConfirmarEliminar.disabled = false;
    }
}

window.addEventListener("beforeunload", () => {
    detenerScanner();
});


document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sincronizarEnSegundoPlano();
});
