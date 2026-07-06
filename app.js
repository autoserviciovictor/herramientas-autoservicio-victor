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
    guardarVencimiento
} from "./excel.js?v=410-vencimientos";

import {
    iniciarScanner,
    detenerScanner
} from "./scanner.js?v=410-vencimientos";

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
} from "./ui.js?v=410-vencimientos";

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
    vencTotalTexto: $("vencTotalTexto"),
    btnVencGuardar: $("btnVencGuardar"),
    btnVencActualizar: $("btnVencActualizar"),
    vencListado: $("vencListado")
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

    await cargarProductos();
}

function configurarEventos() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const pantalla = btn.dataset.pantalla;
            if (pantalla !== "inventario") cerrarScanner(true);
            cambiarPantalla(pantalla);
            if (pantalla === "productos") refrescarProductos();
        });
    });

    document.querySelectorAll("[data-modulo]").forEach(btn => {
        btn.addEventListener("click", () => {
            const modulo = btn.dataset.modulo;
            if (modulo !== "inventario") cerrarScanner(true);
            cambiarPantalla(modulo);
            if (modulo === "vencimientos") cargarListadoVencimientos();
        });
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
    elementos.tabProductos.addEventListener("click", () => cambiarTabProductos("productos"));
    elementos.tabCargados.addEventListener("click", () => cambiarTabProductos("cargados"));
    elementos.btnVolverProductos.addEventListener("click", () => {
        cambiarPantalla("productos");
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
    elementos.btnVencGuardar?.addEventListener("click", guardarVencimientoActual);
    elementos.btnVencActualizar?.addEventListener("click", cargarListadoVencimientos);
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
    elementos.manualPanel.classList.toggle("oculto");
    if (!elementos.manualPanel.classList.contains("oculto")) {
        elementos.codigoManualInput.focus();
    }
}

async function procesarCodigoManual() {
    const codigo = String(elementos.codigoManualInput.value || "").trim();
    if (!codigo) {
        mostrarMensaje("Ingresá un código", "error");
        return;
    }

    elementos.codigoManualInput.value = "";
    elementos.manualPanel.classList.add("oculto");
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
    tabProductosActual = tab;
    activarTabProductos(tab);
    refrescarProductos();
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
        cambiarPantalla("productos");
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
    elementos.vencManualPanel?.classList.toggle("oculto");
    if (!elementos.vencManualPanel?.classList.contains("oculto")) {
        elementos.vencCodigoManualInput.focus();
    }
}

async function procesarCodigoManualVencimientos() {
    const codigo = String(elementos.vencCodigoManualInput?.value || "").trim();
    if (!codigo) {
        mostrarMensaje("Ingresá un código", "error");
        return;
    }
    elementos.vencCodigoManualInput.value = "";
    elementos.vencManualPanel?.classList.add("oculto");
    await manejarCodigoVencimiento(codigo);
}

function mostrarScannerVencimientosAbierto() {
    elementos.vencCameraCard?.classList.remove("oculto");
}

function cerrarScannerVencimientos(mostrarMensajeCierre = false) {
    detenerScanner();
    scannerActivo = false;
    elementos.vencCameraCard?.classList.add("oculto");
    if (mostrarMensajeCierre) mostrarMensaje("Escáner cerrado", "ok");
}

async function abrirScannerVencimientos() {
    if (obtenerCantidadProductos() === 0) {
        mostrarMensaje("Primero conectá Google Sheets", "error");
        return;
    }
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
        mostrarMensaje("No se pudo iniciar la cámara. Revisá permisos.", "error");
        console.error(error);
    }
}

async function manejarCodigoVencimiento(codigo) {
    cerrarScannerVencimientos(false);

    let resultado = buscarProductoPorCodigo(codigo);
    if (resultado.encontrado) {
        try {
            resultado = await obtenerProductoActualizadoPorCodigo(codigo);
        } catch (error) {
            console.warn("No se pudo refrescar el producto:", error);
        }
    }

    if (!resultado.encontrado) {
        productoVencimientoActual = null;
        elementos.vencProductoCard?.classList.remove("empty", "found");
        elementos.vencProductoCard?.classList.add("error");
        elementos.vencEstadoProducto.textContent = "Código no encontrado";
        elementos.vencNombreProducto.textContent = "No encontramos este código en la base maestra.";
        elementos.vencCodigoProducto.textContent = codigo;
        elementos.vencFormCard?.classList.add("oculto");
        mostrarMensaje("Producto no encontrado", "error");
        reproducirConfirmacion("error");
        return;
    }

    productoVencimientoActual = resultado.producto;
    elementos.vencProductoCard?.classList.remove("empty", "error");
    elementos.vencProductoCard?.classList.add("found");
    elementos.vencEstadoProducto.textContent = "Producto encontrado";
    elementos.vencNombreProducto.textContent = productoVencimientoActual.articulo;
    elementos.vencCodigoProducto.textContent = `Código: ${productoVencimientoActual.codigo}`;
    elementos.vencFormCard?.classList.remove("oculto");
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

        elementos.vencFechaInput.value = "";
        elementos.vencSalonInput.value = 0;
        elementos.vencDepositoInput.value = 0;
        actualizarTotalVencimiento();
        elementos.vencFormCard?.classList.add("oculto");
        productoVencimientoActual = null;
        elementos.vencProductoCard?.classList.remove("found", "error");
        elementos.vencProductoCard?.classList.add("empty");
        elementos.vencEstadoProducto.textContent = "Esperando código";
        elementos.vencNombreProducto.textContent = "Escaneá o ingresá un código...";
        elementos.vencCodigoProducto.textContent = "-";

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
        const lista = await listarVencimientos();
        renderListadoVencimientos(lista.slice(0, 12));
    } catch (error) {
        if (elementos.vencListado) elementos.vencListado.innerHTML = `<div class="venc-list-empty">${error.message}</div>`;
    }
}

function renderListadoVencimientos(lista) {
    if (!elementos.vencListado) return;
    if (!lista.length) {
        elementos.vencListado.className = "venc-list-empty";
        elementos.vencListado.textContent = "Todavía no hay vencimientos cargados.";
        return;
    }
    elementos.vencListado.className = "";
    elementos.vencListado.innerHTML = lista.map(item => {
        const estado = String(item.estado || "Vigente").toLowerCase();
        const clase = estado.includes("vencido") ? "venc-vencido" : estado.includes("próximo") || estado.includes("proximo") ? "venc-proximo" : "venc-vigente";
        return `
            <article class="venc-item">
                <strong>${item.articulo || "Sin descripción"}</strong>
                <span>Código: ${item.codigo || "-"}</span>
                <span>Vence: ${item.vencimiento || "-"}</span>
                <div class="venc-badges">
                    <b>Salón ${item.salon || 0}</b>
                    <b>Depósito ${item.deposito || 0}</b>
                    <b>Total ${item.total || 0}</b>
                    <b class="${clase}">${item.estado || "Vigente"}</b>
                </div>
            </article>
        `;
    }).join("");
}

window.addEventListener("beforeunload", () => {
    detenerScanner();
});


document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sincronizarEnSegundoPlano();
});
