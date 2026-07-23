import { APP_VERSION } from "./config.js?v=71-entrega4-rendimiento-sync";
import {
    cargarProductosDesdeServidor,
    sincronizarProductosDesdeServidor,
    obtenerProductoActualizadoPorCodigo,
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
    cargarCatalogoMaestroDesdeServidor,
    buscarProductoMaestroLocalPorCodigo,
    buscarProductosMaestrosPorTexto,
    buscarProductoMaestroPorCodigo,
    actualizarVencimiento,
    eliminarVencimiento,
    actualizarOfertaVencimiento
} from "./excel.js?v=71-entrega4-rendimiento-sync";

import {
    iniciarScanner,
    detenerScanner
} from "./scanner.js?v=71-entrega4-rendimiento-sync";

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
    configurarFeedback,
    reproducirConfirmacion,
    renderResultadosBusqueda,
    mostrarEditorStock,
    actualizarTotalEditor,
    obtenerValoresEditor,
    activarModoCantidad,
    desactivarModoCantidad,
    actualizarConteosUbicacion
} from "./ui.js?v=71-entrega4-rendimiento-sync";

import { inicializarReposicion, refrescarReposicion, prepararReposicion, resolverSalidaReposicion } from "./reposicion.js?v=71-entrega4-rendimiento-sync";
import { coincideBusqueda } from "./search.js?v=71-entrega4-rendimiento-sync";

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
let filtroOfertaVencimientos = "todos";
let busquedaVencimientos = "";
let vencimientoSeleccionado = null;
let vencTabActual = "cargar";
const INTERVALO_SINCRONIZACION = 7000;
let pantallaActualApp = "inicio";
let snapshotProductoEditando = null;
let snapshotVencimientoEditando = null;
let resolucionCambiosPendientes = null;

const $ = (id) => document.getElementById(id);

const elementos = {
    btnActualizarProductos: $("btnActualizarProductos"),
    btnAbrirScanner: $("btnAbrirScanner"),
    btnCerrarScanner: $("btnCerrarScanner"),
    btnCodigoManualToggle: $("btnCodigoManualToggle"),
    manualPanel: $("manualPanel"),
    codigoManualInput: $("codigoManualInput"),
    btnBuscarManual: $("btnBuscarManual"),
    manualSugerencias: $("manualSugerencias"),
    scanPanel: $("scanPanel"),
    cameraCard: $("cameraCard"),
    btnSalon: $("btnSalon"),
    btnDeposito: $("btnDeposito"),
    btnGuardarCantidad: $("btnGuardarCantidad"),
    btnMenosCantidad: $("btnMenosCantidad"),
    btnMasCantidad: $("btnMasCantidad"),
    btnCancelarCantidad: $("btnCancelarCantidad"),
    cantidadInput: $("cantidadInput"),
    checkSonidos: $("checkSonidos"),
    checkVibracion: $("checkVibracion"),
    btnReiniciar: $("btnReiniciar"),
    buscadorProducto: $("buscadorProducto"),
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
    vencManualSugerencias: $("vencManualSugerencias"),
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
    btnVencEliminarDesdeVista: $("btnVencEliminarDesdeVista"),
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

function fechaHoyLocalIso() {
    try {
        const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
        const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));
        return `${mapa.year}-${mapa.month}-${mapa.day}`;
    } catch (_) {
        return new Date().toISOString().slice(0, 10);
    }
}

function configurarFechasMinimasVencimientos() {
    const hoy = fechaHoyLocalIso();
    if (elementos.vencFechaInput) elementos.vencFechaInput.min = hoy;
    if (elementos.vencEditFechaInput) elementos.vencEditFechaInput.min = hoy;
}

async function inicializar() {
    ocultarSplash();
    cambiarPantalla("inicio");
    pantallaActualApp = "inicio";
    actualizarUbicacion(ubicacionActual);
    actualizarEstadoExcel(0);
    actualizarContador(0);
    actualizarConteosUbicacion({ salon: 0, deposito: 0 });
    activarBotonGuardar(false);
    actualizarEstadoCamara(false);
    mostrarScannerCerrado();
    limpiarProducto();
    desactivarModoCantidad();
    configurarFeedback({ sonidos: true, vibracion: true });
    actualizarVersionConfiguracion();
    configurarEventos();
    configurarFechasMinimasVencimientos();
    inicializarReposicion();

    await cargarProductos();
}

async function entrarPantalla(nombre, opciones = {}) {
    if (!opciones.forzar) {
        if (pantallaActualApp === "anotar" && nombre !== "anotar") {
            resolverSalidaReposicion(() => entrarPantalla(nombre, { forzar: true }));
            return;
        }
        if (productoEditando && nombre !== "editarProducto") {
            resolverSalidaProducto(() => entrarPantalla(nombre, { forzar: true }));
            return;
        }
        if (estaEditandoVencimiento() && nombre !== "vencimientos") {
            resolverSalidaVencimiento(() => entrarPantalla(nombre, { forzar: true }));
            return;
        }
    }
    if (nombre !== "inventario") cerrarScanner(true);
    if (nombre !== "vencimientos") cerrarScannerVencimientos(false);
    if (nombre !== "precios") window.PreciosModule?.desactivar?.();
    if (nombre !== "horarios") window.HorariosModule?.desactivar?.();

    if (elementos.buscadorProducto) elementos.buscadorProducto.value = "";
    if (elementos.vencBuscador) elementos.vencBuscador.value = "";
    busquedaVencimientos = "";

    if (nombre === "productos" || nombre === "cargados") {
        tabProductosActual = nombre === "cargados" ? "cargados" : "productos";
    }

    cambiarPantalla(nombre);
    pantallaActualApp = nombre;

    if (nombre === "productos" || nombre === "cargados") mostrarCargandoEn($("resultadoBusqueda"), "Cargando productos...");
    if (["inventario", "productos", "cargados", "ajustes"].includes(nombre)) {
        await sincronizarEnSegundoPlano();
        if (nombre === "productos" || nombre === "cargados") refrescarProductos();
    }
    if (nombre === "vencimientos") cambiarTabVencimientos("cargar");
    if (nombre === "anotar") { prepararReposicion(); await refrescarReposicion(); }
    if (nombre === "precios") await window.PreciosModule?.activar?.();
    if (nombre === "horarios") window.HorariosModule?.activar?.();
    if (nombre === "admin" && !window.AutoservicioAuth?.esAdmin()) { cambiarPantalla("inicio"); }
}

window.AutoservicioNavigate = entrarPantalla;

function actualizarVersionConfiguracion() {
    const version = document.getElementById("settingsAppVersion");
    if (version) version.textContent = APP_VERSION;
}

function configurarEventos() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => entrarPantalla(btn.dataset.pantalla));
    });

    document.querySelectorAll("[data-modulo]").forEach(btn => {
        btn.addEventListener("click", () => entrarPantalla(btn.dataset.modulo));
    });

    elementos.btnActualizarProductos?.addEventListener("click", cargarProductos);
    elementos.btnAbrirScanner.addEventListener("click", abrirScannerManual);
    elementos.btnCerrarScanner.addEventListener("click", () => cerrarScanner(true));
    elementos.btnCodigoManualToggle.addEventListener("click", alternarCargaManual);
    elementos.btnBuscarManual.addEventListener("click", procesarCodigoManual);
    elementos.codigoManualInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") procesarCodigoManual();
    });
    elementos.codigoManualInput.addEventListener("input", () => renderSugerenciasManual("inventario"));
    elementos.btnSalon.addEventListener("click", () => cambiarUbicacion("salon"));
    elementos.btnDeposito.addEventListener("click", () => cambiarUbicacion("deposito"));

    elementos.btnGuardarCantidad.addEventListener("click", guardarCantidadActual);
    elementos.btnCancelarCantidad.addEventListener("click", cancelarProductoActual);
    elementos.cantidadInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") guardarCantidadActual();
    });
    elementos.btnMenosCantidad.addEventListener("click", () => cambiarCantidad(elementos.cantidadInput, -1, 1));
    elementos.btnMasCantidad.addEventListener("click", () => cambiarCantidad(elementos.cantidadInput, 1, 1));

    elementos.checkSonidos?.addEventListener("change", actualizarPreferenciasFeedback);
    elementos.checkVibracion?.addEventListener("change", actualizarPreferenciasFeedback);
    elementos.btnReiniciar?.addEventListener("click", manejarReinicio);

    elementos.buscadorProducto.addEventListener("input", refrescarProductos);
    elementos.btnVolverProductos.addEventListener("click", cancelarEdicionProducto);
    $("btnCancelarCorreccion")?.addEventListener("click", cancelarEdicionProducto);

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
    elementos.vencCodigoManualInput?.addEventListener("input", () => renderSugerenciasManual("vencimientos"));
    elementos.vencSalonInput?.addEventListener("input", actualizarTotalVencimiento);
    elementos.vencDepositoInput?.addEventListener("input", actualizarTotalVencimiento);
    elementos.btnVencMenosSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencSalonInput, -1, 0, actualizarTotalVencimiento));
    elementos.btnVencMasSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencSalonInput, 1, 0, actualizarTotalVencimiento));
    elementos.btnVencMenosDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencDepositoInput, -1, 0, actualizarTotalVencimiento));
    elementos.btnVencMasDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencDepositoInput, 1, 0, actualizarTotalVencimiento));
    elementos.btnVencGuardar?.addEventListener("click", guardarVencimientoActual);
    elementos.btnVencCancelarCarga?.addEventListener("click", cancelarCargaVencimiento);
    elementos.vencBuscador?.addEventListener("input", () => {
        busquedaVencimientos = elementos.vencBuscador.value || "";
        renderListadoVencimientos();
    });
    $("btnVencAbrirFiltros")?.addEventListener("click", abrirFiltrosVencimientos);
    $("btnVencCerrarFiltros")?.addEventListener("click", cerrarFiltrosVencimientos);
    $("btnVencAplicarFiltros")?.addEventListener("click", aplicarFiltrosDesdeModal);
    $("btnVencLimpiarFiltros")?.addEventListener("click", limpiarFiltrosVencimientos);
    $("vencFiltrosModal")?.addEventListener("click", (e) => { if (e.target.id === "vencFiltrosModal") cerrarFiltrosVencimientos(); });
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
    elementos.btnVencModalCerrar?.addEventListener("click", () => resolverSalidaVencimiento(cerrarModalVencimiento));
    elementos.vencModal?.addEventListener("click", (e) => { if (e.target === elementos.vencModal) resolverSalidaVencimiento(cerrarModalVencimiento); });
    elementos.btnVencEditarAbrir?.addEventListener("click", mostrarEdicionVencimiento);
    elementos.btnVencEliminarAbrir?.addEventListener("click", mostrarConfirmacionEliminarVencimiento);
    elementos.btnVencEliminarDesdeVista?.addEventListener("click", mostrarConfirmacionEliminarVencimiento);
    elementos.btnVencCancelarEdicion?.addEventListener("click", () => resolverSalidaVencimiento(() => vencimientoSeleccionado && abrirDetalleVencimiento(vencimientoSeleccionado)));
    elementos.btnVencCancelarEliminar?.addEventListener("click", () => vencimientoSeleccionado && abrirDetalleVencimiento(vencimientoSeleccionado));
    elementos.btnVencGuardarEdicion?.addEventListener("click", guardarEdicionVencimiento);
    elementos.btnVencConfirmarEliminar?.addEventListener("click", confirmarEliminarVencimiento);
    elementos.vencEditSalonInput?.addEventListener("input", actualizarTotalEdicionVencimiento);
    elementos.vencEditDepositoInput?.addEventListener("input", actualizarTotalEdicionVencimiento);
    elementos.btnVencEditMenosSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencEditSalonInput, -1, 0, actualizarTotalEdicionVencimiento));
    elementos.btnVencEditMasSalon?.addEventListener("click", () => cambiarCantidad(elementos.vencEditSalonInput, 1, 0, actualizarTotalEdicionVencimiento));
    elementos.btnVencEditMenosDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencEditDepositoInput, -1, 0, actualizarTotalEdicionVencimiento));
    elementos.btnVencEditMasDeposito?.addEventListener("click", () => cambiarCantidad(elementos.vencEditDepositoInput, 1, 0, actualizarTotalEdicionVencimiento));
    $("btnCambiosContinuar")?.addEventListener("click", () => { cerrarModalCambiosPendientes(); resolucionCambiosPendientes?.continuar?.(); resolucionCambiosPendientes=null; });
    $("btnCambiosDescartar")?.addEventListener("click", () => { const fn=resolucionCambiosPendientes?.descartar; cerrarModalCambiosPendientes(); resolucionCambiosPendientes=null; fn?.(); });
    $("btnCambiosGuardar")?.addEventListener("click", async () => { const fn=resolucionCambiosPendientes?.guardar; cerrarModalCambiosPendientes(); resolucionCambiosPendientes=null; await fn?.(); });
}

function cambiarTabVencimientos(tab) {
    vencTabActual = tab || "cargar";
    const titulos = { cargar: ["Vencimientos", "Control de fechas"], proximos: ["Próximos a vencer", "Control de fechas"], vencidos: ["Productos vencidos", "Vencidos"] };
    const actual = titulos[vencTabActual] || titulos.cargar;
    if ($("modulePageTitle")) $("modulePageTitle").textContent = actual[0];
    if ($("modulePageSubtitle")) $("modulePageSubtitle").textContent = actual[1];
    if (elementos.vencBuscador) elementos.vencBuscador.value = "";
    busquedaVencimientos = "";
    filtroVencimientos = "todos";
    filtroOfertaVencimientos = "todos";
    actualizarEtiquetaFiltros();
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
    const resumenCard = $("vencResumenCard");
    const filtros = document.querySelector(".venc-filter-toolbar");
    const buscador = elementos.vencBuscador;

    resumenCard?.classList.toggle("oculto", !enCarga);
    const cabeceraLista = document.querySelector("#pantallaVencimientos .venc-list-head");
    cabeceraLista?.classList.remove("oculto");
    filtros?.classList.toggle("oculto", !enProximos);
    buscador?.classList.toggle("oculto", enCarga);
    if (buscador && enCarga) buscador.value = "";
}

function actualizarEtiquetaFiltros() {
    const el = $("vencFiltrosActivos");
    if (!el) return;
    const estadoTxt = {todos:"Todos", "7":"7 días", "15":"15 días", "30":"30 días"}[filtroVencimientos] || "Todos";
    const ofertaTxt = {todos:"", oferta:"Con oferta", sinOferta:"Sin oferta"}[filtroOfertaVencimientos] || "";
    el.textContent = ofertaTxt ? `${estadoTxt} · ${ofertaTxt}` : estadoTxt;
}
function abrirFiltrosVencimientos() {
    const modal = $("vencFiltrosModal");
    if (!modal) return;
    const e = modal.querySelector(`input[name="vencEstadoFiltro"][value="${filtroVencimientos}"]`);
    const o = modal.querySelector(`input[name="vencOfertaFiltro"][value="${filtroOfertaVencimientos}"]`);
    if (e) e.checked = true; if (o) o.checked = true;
    modal.classList.remove("oculto"); modal.setAttribute("aria-hidden","false");
}
function cerrarFiltrosVencimientos() { const m=$("vencFiltrosModal"); m?.classList.add("oculto"); m?.setAttribute("aria-hidden","true"); }
function aplicarFiltrosDesdeModal() {
    filtroVencimientos = document.querySelector('input[name="vencEstadoFiltro"]:checked')?.value || "todos";
    filtroOfertaVencimientos = document.querySelector('input[name="vencOfertaFiltro"]:checked')?.value || "todos";
    actualizarEtiquetaFiltros(); cerrarFiltrosVencimientos(); renderListadoVencimientos();
}
function limpiarFiltrosVencimientos() {
    filtroVencimientos="todos"; filtroOfertaVencimientos="todos";
    document.querySelector('input[name="vencEstadoFiltro"][value="todos"]')?.click();
    document.querySelector('input[name="vencOfertaFiltro"][value="todos"]')?.click();
    actualizarEtiquetaFiltros(); renderListadoVencimientos();
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
        productoActual = null;
        productoEditando = null;
        limpiarProducto("Conectando con Google Sheets...");
        desactivarModoCantidad();
        mostrarMensaje("Cargando productos...", "ok");

        const cantidad = await cargarProductosDesdeServidor();

        actualizarEstadoExcel(cantidad);
        actualizarContador(obtenerContador());
        actualizarConteosUbicacion(obtenerConteosUbicacion());
        limpiarProducto("Esperando escaneo...");
        refrescarProductos();

        mostrarMensaje("Google Sheets conectado", "ok");
        reproducirConfirmacion("guardado");
        iniciarSincronizacionAutomatica();
        mostrarScannerCerrado();
    } catch (error) {
        actualizarEstadoExcel(0);
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

function limpiarSugerenciasManual(tipo) {
    const contenedor = tipo === "vencimientos" ? elementos.vencManualSugerencias : elementos.manualSugerencias;
    if (!contenedor) return;
    contenedor.innerHTML = "";
    contenedor.classList.add("oculto");
}

async function renderSugerenciasManual(tipo) {
    const input = tipo === "vencimientos" ? elementos.vencCodigoManualInput : elementos.codigoManualInput;
    const contenedor = tipo === "vencimientos" ? elementos.vencManualSugerencias : elementos.manualSugerencias;
    if (!input || !contenedor) return;
    const consulta = String(input.value || "").trim();
    if (consulta.length < 2) { limpiarSugerenciasManual(tipo); return; }
    let resultados = [];
    if (tipo === "vencimientos") {
        try { await cargarCatalogoMaestroDesdeServidor(); } catch (error) { console.warn("No se pudo cargar Productos para Vencimientos", error); }
        resultados = buscarProductosMaestrosPorTexto(consulta, 5);
    } else {
        resultados = buscarProductosPorTexto(consulta, 5, false);
    }
    contenedor.innerHTML = "";
    if (!resultados.length) {
        contenedor.innerHTML = '<div class="manual-no-results">No se encontraron productos.</div>';
        contenedor.classList.remove("oculto");
        return;
    }
    resultados.forEach(producto => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "manual-suggestion-item";
        boton.innerHTML = `<strong>${producto.articulo}</strong><span>${producto.codigo || "Sin código"}</span>`;
        boton.addEventListener("click", async () => {
            input.value = producto.codigo;
            limpiarSugerenciasManual(tipo);
            if (tipo === "vencimientos") await procesarCodigoManualVencimientos();
            else await procesarCodigoManual();
        });
        contenedor.appendChild(boton);
    });
    contenedor.classList.remove("oculto");
}

function alternarCargaManual() {
    const abrir = elementos.manualPanel.classList.contains("oculto");
    elementos.manualPanel.classList.toggle("oculto", !abrir);
    elementos.btnCodigoManualToggle.textContent = abrir ? "Cancelar ingreso manual" : "Ingresar producto manual";
    if (abrir) elementos.codigoManualInput.focus();
    else { elementos.codigoManualInput.value = ""; limpiarSugerenciasManual("inventario"); }
}

async function procesarCodigoManual() {
    const consulta = String(elementos.codigoManualInput.value || "").trim();
    if (!consulta) {
        mostrarMensaje("Ingresá un código o nombre", "error");
        return;
    }
    const exacto = buscarProductoPorCodigo(consulta);
    let codigo = consulta;
    if (!exacto.encontrado) {
        const resultados = buscarProductosPorTexto(consulta, 5, false);
        if (resultados.length !== 1) {
            renderSugerenciasManual("inventario");
            mostrarMensaje(resultados.length ? "Elegí un producto de la lista" : "No se encontraron productos", "error");
            return;
        }
        codigo = resultados[0].codigo;
    }
    elementos.codigoManualInput.value = "";
    limpiarSugerenciasManual("inventario");
    elementos.manualPanel.classList.add("oculto");
    elementos.btnCodigoManualToggle.textContent = "Ingresar producto manual";
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
    snapshotProductoEditando = { salon: Number(producto.salon)||0, deposito: Number(producto.deposito)||0 };
    mostrarEditorStock(producto);
    pantallaActualApp = "editarProducto";
    const volver = $("brandBackBtn");
    if (volver) volver.dataset.modulo = tabProductosActual === "cargados" ? "cargados" : "productos";
}

function cancelarEdicionProducto() {
    if (productoEditando && hayCambiosProducto()) { resolverSalidaProducto(() => cancelarEdicionProductoForzado()); return; }
    cancelarEdicionProductoForzado();
}
function cancelarEdicionProductoForzado() {
    productoEditando = null;
    snapshotProductoEditando = null;
    const destino = tabProductosActual === "cargados" ? "cargados" : "productos";
    cambiarPantalla(destino);
    pantallaActualApp = destino;
    if (elementos.buscadorProducto) elementos.buscadorProducto.value = "";
    refrescarProductos();
    sincronizarEnSegundoPlano();
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
        snapshotProductoEditando = null;
        const destinoEdicion = tabProductosActual === "cargados" ? "cargados" : "productos";
        cambiarPantalla(destinoEdicion);
        pantallaActualApp = destinoEdicion;
        refrescarProductos();
        sincronizarEnSegundoPlano();

        if (productoActual && productoActual.codigo === producto.codigo) {
            productoActual = producto;
            mostrarProducto(producto);
        }

        mostrarMensaje("Stock corregido", "ok");
        reproducirConfirmacion("guardado");
        return true;
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
        return false;
    } finally {
        corrigiendo = false;
        elementos.btnGuardarCorreccion.disabled = false;
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
    if (elementos.btnVencManualToggle) elementos.btnVencManualToggle.textContent = abrir ? "Cancelar ingreso manual" : "Ingresar producto manual";
    if (abrir) elementos.vencCodigoManualInput?.focus();
    else if (elementos.vencCodigoManualInput) { elementos.vencCodigoManualInput.value = ""; limpiarSugerenciasManual("vencimientos"); }
}

async function procesarCodigoManualVencimientos() {
    const consulta = String(elementos.vencCodigoManualInput?.value || "").trim();
    if (!consulta) {
        mostrarMensaje("Ingresá un código o nombre", "error");
        return;
    }
    try { await cargarCatalogoMaestroDesdeServidor(); } catch (error) {
        mostrarMensaje("No se pudo cargar el catálogo Productos", "error");
        return;
    }
    const exacto = buscarProductoMaestroLocalPorCodigo(consulta);
    let codigo = consulta;
    if (!exacto.encontrado) {
        const resultados = buscarProductosMaestrosPorTexto(consulta, 5);
        if (resultados.length !== 1) {
            await renderSugerenciasManual("vencimientos");
            mostrarMensaje(resultados.length ? "Elegí un producto de la lista" : "No se encontraron productos", "error");
            return;
        }
        codigo = resultados[0].codigo;
    }
    elementos.vencCodigoManualInput.value = "";
    limpiarSugerenciasManual("vencimientos");
    elementos.vencManualPanel?.classList.add("oculto");
    if (elementos.btnVencManualToggle) elementos.btnVencManualToggle.textContent = "Ingresar producto manual";
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
    if (elementos.btnVencManualToggle) elementos.btnVencManualToggle.textContent = "Ingresar producto manual";
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
        if (vencimiento < fechaHoyLocalIso()) {
            mostrarMensaje("La fecha no puede ser anterior a hoy", "error");
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
        return true;
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
        mostrarCargandoEn(elementos.vencListado, "Cargando vencimientos...");
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
    // Todo producto vigente con 16 días o más pertenece al grupo azul.
    return "venc-30";
}

function textoEstadoVencimiento(item) {
    const dias = diasHastaVencimiento(item.vencimiento);
    if (dias < 0) {
        const vencidoHace = Math.abs(dias);
        return vencidoHace === 1 ? "Vencido ayer" : `Vencido hace ${vencidoHace} días`;
    }
    if (dias === 0) return "Vence hoy";
    if (dias === 1) return "Falta 1 día";
    return `Faltan ${dias} días`;
}

function bucketVencimiento(item) {
    const dias = diasHastaVencimiento(item.vencimiento);
    if (dias < 0) return "vencidos";
    if (dias <= 7) return "7";
    if (dias <= 15) return "15";
    // El contador azul agrupa todos los vigentes con 16 días o más.
    return "30";
}

function fechaHoyArgentina() {
    try {
        const partes = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Argentina/Buenos_Aires",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());
        const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));
        return `${mapa.year}-${mapa.month}-${mapa.day}`;
    } catch (_) {
        const ahora = new Date();
        const desplazada = new Date(ahora.getTime() - (3 * 60 * 60 * 1000));
        return desplazada.toISOString().slice(0, 10);
    }
}

function fechaCargaVencimiento(item) {
    const valor = String(item?.fecha_carga || item?.fechaCarga || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    const matchLatino = valor.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (matchLatino) {
        const [, dia, mes, anio] = matchLatino;
        return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
    }
    return "";
}

function fueCargadoHoy(item) {
    return fechaCargaVencimiento(item) === fechaHoyArgentina();
}

function filtrarVencimientos() {
    const q = vencTabActual === "cargar" ? "" : String(busquedaVencimientos || "").trim().toLowerCase();
    return vencimientosCache.filter(item => {
        if (vencTabActual === "cargar" && !fueCargadoHoy(item)) return false;
        const bucket = bucketVencimiento(item);

        if (vencTabActual === "proximos" && !["7", "15", "30"].includes(bucket)) return false;
        if (vencTabActual === "vencidos" && bucket !== "vencidos") return false;

        if (vencTabActual === "proximos") {
            if (filtroVencimientos === "7" && bucket !== "7") return false;
            if (filtroVencimientos === "15" && bucket !== "15") return false;
            if (filtroVencimientos === "30" && bucket !== "30") return false;
            if (filtroOfertaVencimientos === "oferta" && !tieneOferta(item)) return false;
            if (filtroOfertaVencimientos === "sinOferta" && tieneOferta(item)) return false;
        }

        if (q && !coincideBusqueda(item, q, ["articulo", "codigo"])) return false;
        return true;
    });
}

function renderResumenVencimientos() {
    const contarRango = (bucket) => {
        const items = vencimientosCache.filter(item => bucketVencimiento(item) === bucket);
        return {
            total: items.length,
            oferta: items.filter(tieneOferta).length,
        };
    };
    const resumen = {
        siete: contarRango("7"),
        quince: contarRango("15"),
        treinta: contarRango("30"),
        vencidos: contarRango("vencidos"),
    };
    const el = elementos.vencResumen || $("vencResumen");
    if (!el) return;
    const fila = (clase, filtro, titulo, datos) => `
        <button type="button" class="venc-resumen-card ${clase}" data-venc-resumen="${filtro}">
            <span class="venc-resumen-rango">${titulo}</span>
            <span class="venc-resumen-datos"><strong>${datos.total}</strong><small>productos</small></span>
            <span class="venc-resumen-oferta"><strong>${datos.oferta}</strong><small>en oferta</small></span>
        </button>`;
    el.innerHTML = [
        fila("venc-resumen-7", "7", "7 días", resumen.siete),
        fila("venc-resumen-15", "15", "15 días", resumen.quince),
        fila("venc-resumen-30", "30", "30 días", resumen.treinta),
        fila("venc-resumen-vencidos", "vencidos", "Vencidos", resumen.vencidos),
    ].join("");
}

function renderListadoVencimientos() {
    if (!elementos.vencListado) return;
    renderResumenVencimientos();
    actualizarVisibilidadPanelesVencimientos();

    if (elementos.vencListadoTitulo) {
        elementos.vencListadoTitulo.textContent = vencTabActual === "cargar"
            ? "Registros cargados hoy"
            : (vencTabActual === "vencidos" ? "Productos vencidos" : "Próximos a vencer");
    }

    const limite = vencTabActual === "cargar" ? 3 : 80;
    const baseLista = filtrarVencimientos();
    const ordenada = [...baseLista].sort((a, b) => {
        if (vencTabActual === "cargar") {
            return String(b.id || b.fecha_carga || b.fechaCarga || "").localeCompare(String(a.id || a.fecha_carga || a.fechaCarga || ""));
        }
        return diasHastaVencimiento(a.vencimiento) - diasHastaVencimiento(b.vencimiento);
    });
    const lista = ordenada.slice(0, limite);

    if (!lista.length) {
        elementos.vencListado.className = "venc-list-empty";
        if (vencTabActual === "cargar") {
            elementos.vencListado.textContent = "Todavía no se cargaron vencimientos hoy.";
        } else {
            elementos.vencListado.textContent = vencimientosCache.length ? "No hay registros con ese filtro." : "Todavía no hay vencimientos cargados.";
        }
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
                    <b>${cantidad}</b>
                </article>
            `;
        }

        if (vencTabActual === "vencidos") {
            return `
                <article class="venc-item venc-item-vencido-registro venc-vencido" data-id="${item.id}" tabindex="0">
                    <div class="venc-card-heading">
                        <strong>${articulo}</strong>
                        <span class="venc-code">Código: ${codigo}</span>
                    </div>
                    <div class="venc-days-hero venc-vencido-hero">${estado}</div>
                    <div class="venc-card-summary">
                        <span class="venc-card-date">Fecha: ${fecha}</span>
                        <span class="venc-card-qty"><strong>${cantidad}</strong><small>${cantidad === 1 ? "unidad" : "unidades"}</small></span>
                    </div>
                </article>
            `;
        }

        return `
            <article class="venc-item venc-item-proximo ${clase} ${ofertaActiva ? "venc-con-oferta" : ""}" data-id="${item.id}" tabindex="0">
                <div class="venc-card-topline">
                    <span class="venc-offer-tag ${ofertaActiva ? "activa" : "pendiente"}">${ofertaActiva ? "🏷️ Oferta activa" : "Sin oferta"}</span>
                </div>
                <div class="venc-card-heading">
                    <strong>${articulo}</strong>
                    <span class="venc-code">Código: ${codigo}</span>
                </div>
                <div class="venc-days-hero ${clase}">${estado}</div>
                <div class="venc-card-summary">
                    <span class="venc-card-date">Fecha: ${fecha}</span>
                    <span class="venc-card-qty"><strong>${cantidad}</strong><small>${cantidad === 1 ? "unidad" : "unidades"}</small></span>
                </div>
                <button type="button" class="venc-card-action offer ${ofertaActiva ? "active" : ""}" data-venc-accion="oferta">${ofertaActiva ? "Quitar oferta" : "Marcar oferta"}</button>
            </article>
        `;
    }).join("");
}

function manejarClickListadoVencimientos(event) {
    const card = event.target.closest(".venc-item");
    if (!card) return;
    const accion = event.target.closest("[data-venc-accion]")?.dataset.vencAccion;
    const item = vencimientosCache.find(registro => String(registro.id) === String(card.dataset.id));
    if (!item) return;
    vencimientoSeleccionado = item;

    if (accion === "oferta" && vencTabActual === "proximos") {
        alternarOfertaVencimiento(item);
        return;
    }

    if (accion === "eliminar") {
        abrirDetalleVencimiento(item);
        mostrarConfirmacionEliminarVencimiento();
        return;
    }

    if (!accion && (vencTabActual === "proximos" || vencTabActual === "vencidos")) {
        abrirDetalleVencimiento(item);
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
        return true;
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
    const esVencido = bucketVencimiento(item) === "vencidos";
    elementos.btnVencEditarAbrir?.classList.toggle("oculto", esVencido);
    mostrarPanelModal(elementos.vencModalVista);
    elementos.vencModal?.classList.remove("oculto");
    elementos.vencModal?.setAttribute("aria-hidden", "false");
}

function cerrarModalVencimiento() {
    elementos.vencModal?.classList.add("oculto");
    elementos.vencModal?.setAttribute("aria-hidden", "true");
    vencimientoSeleccionado = null;
    snapshotVencimientoEditando = null;
}

function mostrarEdicionVencimiento() {
    const item = vencimientoSeleccionado;
    if (!item) return;
    const titulo = $("vencEditarTitulo");
    if (titulo) titulo.textContent = item.articulo || "Editar registro";
    if (elementos.vencEditFechaInput) elementos.vencEditFechaInput.value = item.vencimiento || "";
    if (elementos.vencEditSalonInput) elementos.vencEditSalonInput.value = item.salon || 0;
    if (elementos.vencEditDepositoInput) elementos.vencEditDepositoInput.value = item.deposito || 0;
    snapshotVencimientoEditando = { vencimiento: item.vencimiento || "", salon: Number(item.salon)||0, deposito: Number(item.deposito)||0 };
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
    if (vencimiento !== item.vencimiento && vencimiento < fechaHoyLocalIso()) { mostrarMensaje("La nueva fecha no puede ser anterior a hoy", "error"); elementos.vencEditFechaInput?.focus(); return; }
    if (salon + deposito <= 0) { mostrarMensaje("Cargá salón o depósito", "error"); return; }
    try {
        elementos.btnVencGuardarEdicion.disabled = true;
        mostrarMensaje("Actualizando registro...", "ok");
        await actualizarVencimiento(item.id, { vencimiento, salon, deposito });
        await cargarListadoVencimientos();
        snapshotVencimientoEditando = null;
        cerrarModalVencimiento();
        mostrarMensaje("Registro actualizado", "ok");
        reproducirConfirmacion("guardado");
        return true;
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
        return false;
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
        return true;
    } catch (error) {
        mostrarMensaje(error.message, "error");
        reproducirConfirmacion("error");
    } finally {
        if (elementos.btnVencConfirmarEliminar) elementos.btnVencConfirmarEliminar.disabled = false;
    }
}


function mostrarCargandoEn(contenedor, texto = "Cargando...") {
    if (!contenedor) return;
    contenedor.innerHTML = `<div class="app-loading"><span class="app-spinner" aria-hidden="true"></span><strong>${texto}</strong></div>`;
}
function hayCambiosProducto() {
    if (!productoEditando || !snapshotProductoEditando) return false;
    const valores = obtenerValoresEditor();
    return Number(valores.salon)!==snapshotProductoEditando.salon || Number(valores.deposito)!==snapshotProductoEditando.deposito;
}
function estaEditandoVencimiento() {
    return Boolean(snapshotVencimientoEditando && elementos.vencModalEditar && !elementos.vencModalEditar.classList.contains("oculto"));
}
function hayCambiosVencimiento() {
    if (!estaEditandoVencimiento()) return false;
    return (elementos.vencEditFechaInput?.value||"")!==snapshotVencimientoEditando.vencimiento ||
        (Number(elementos.vencEditSalonInput?.value)||0)!==snapshotVencimientoEditando.salon ||
        (Number(elementos.vencEditDepositoInput?.value)||0)!==snapshotVencimientoEditando.deposito;
}
function abrirModalCambiosPendientes({ titulo, texto, guardar, descartar, continuar }) {
    resolucionCambiosPendientes = { guardar, descartar, continuar };
    $("cambiosPendientesTitulo").textContent = titulo;
    $("cambiosPendientesTexto").textContent = texto;
    $("cambiosPendientesModal")?.classList.remove("oculto");
    document.body.classList.add("modal-abierto");
}
function cerrarModalCambiosPendientes() {
    $("cambiosPendientesModal")?.classList.add("oculto");
    document.body.classList.remove("modal-abierto");
}
function resolverSalidaProducto(continuar) {
    if (!productoEditando) { continuar?.(); return; }
    if (!hayCambiosProducto()) { productoEditando=null; snapshotProductoEditando=null; continuar?.(); return; }
    abrirModalCambiosPendientes({
        titulo: "Cambios sin guardar",
        texto: "¿Querés guardar los cambios del producto antes de salir?",
        guardar: async () => { const ok=await guardarCorreccion(); if(ok) continuar?.(); },
        descartar: () => { productoEditando=null; snapshotProductoEditando=null; continuar?.(); },
        continuar: () => {}
    });
}
function resolverSalidaVencimiento(continuar) {
    if (!estaEditandoVencimiento()) { continuar?.(); return; }
    if (!hayCambiosVencimiento()) { snapshotVencimientoEditando=null; continuar?.(); return; }
    abrirModalCambiosPendientes({
        titulo: "Cambios sin guardar",
        texto: "¿Querés guardar los cambios del vencimiento antes de salir?",
        guardar: async () => { const ok=await guardarEdicionVencimiento(); if(ok) continuar?.(); },
        descartar: () => { snapshotVencimientoEditando=null; cerrarModalVencimiento(); continuar?.(); },
        continuar: () => {}
    });
}

window.addEventListener("beforeunload", (event) => {
    detenerScanner();
    if (hayCambiosProducto() || hayCambiosVencimiento()) {
        event.preventDefault();
        event.returnValue = "";
    }
});


document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sincronizarEnSegundoPlano();
});
