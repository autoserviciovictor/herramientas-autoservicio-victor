import {
    cargarExcel,
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
    obtenerConteosUbicacion
} from "./excel.js?v=140";

import {
    iniciarScanner,
    detenerScanner
} from "./scanner.js?v=140";

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
} from "./ui.js?v=140";

let ubicacionActual = "salon";
let productoActual = null;
let productoEditando = null;
let scannerActivo = false;
let tabProductosActual = "productos";

const $ = (id) => document.getElementById(id);

const elementos = {
    excelFile: $("excelFile"),
    btnSalon: $("btnSalon"),
    btnDeposito: $("btnDeposito"),
    btnGuardarCantidad: $("btnGuardarCantidad"),
    btnMenosCantidad: $("btnMenosCantidad"),
    btnMasCantidad: $("btnMasCantidad"),
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
    btnGuardarCorreccion: $("btnGuardarCorreccion")
};

inicializar();

function inicializar() {
    ocultarSplash();
    actualizarUbicacion(ubicacionActual);
    actualizarEstadoExcel(0);
    actualizarContador(0);
    actualizarConteosUbicacion({ salon: 0, deposito: 0 });
    activarBotonGuardar(false);
    activarBotonDescargar(false);
    actualizarEstadoCamara(false);
    limpiarProducto();
    desactivarModoCantidad();
    configurarFeedback({ sonidos: true, vibracion: true });

    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const pantalla = btn.dataset.pantalla;
            cambiarPantalla(pantalla);
            if (pantalla === "productos") refrescarProductos();
        });
    });

    elementos.excelFile.addEventListener("change", manejarCargaExcel);
    elementos.btnSalon.addEventListener("click", () => cambiarUbicacion("salon"));
    elementos.btnDeposito.addEventListener("click", () => cambiarUbicacion("deposito"));

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

    elementos.buscadorProducto.addEventListener("input", refrescarProductos);
    elementos.tabProductos.addEventListener("click", () => cambiarTabProductos("productos"));
    elementos.tabCargados.addEventListener("click", () => cambiarTabProductos("cargados"));
    elementos.btnVolverProductos.addEventListener("click", () => {
        cambiarPantalla("productos");
        refrescarProductos();
    });

    elementos.editarSalon.addEventListener("input", actualizarTotalEditor);
    elementos.editarDeposito.addEventListener("input", actualizarTotalEditor);
    elementos.btnMenosSalon.addEventListener("click", () => cambiarCantidad(elementos.editarSalon, -1, 0, actualizarTotalEditor));
    elementos.btnMasSalon.addEventListener("click", () => cambiarCantidad(elementos.editarSalon, 1, 0, actualizarTotalEditor));
    elementos.btnMenosDeposito.addEventListener("click", () => cambiarCantidad(elementos.editarDeposito, -1, 0, actualizarTotalEditor));
    elementos.btnMasDeposito.addEventListener("click", () => cambiarCantidad(elementos.editarDeposito, 1, 0, actualizarTotalEditor));
    elementos.btnGuardarCorreccion.addEventListener("click", guardarCorreccion);
}

async function manejarCargaExcel(e) {
    try {
        const archivo = e.target.files[0];
        const cantidad = await cargarExcel(archivo);

        actualizarEstadoExcel(cantidad);
        actualizarContador(0);
        actualizarConteosUbicacion(obtenerConteosUbicacion());
        activarBotonDescargar(true);
        productoActual = null;
        productoEditando = null;
        limpiarProducto("Esperando escaneo...");
        desactivarModoCantidad();
        refrescarProductos();

        mostrarMensaje("Excel cargado correctamente", "ok");
        reproducirConfirmacion("guardado");

        if (!scannerActivo) await iniciarCamaraSiCorresponde();
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

async function iniciarCamaraSiCorresponde() {
    if (scannerActivo || obtenerCantidadProductos() === 0) return;

    try {
        await iniciarScanner("video", manejarCodigoEscaneado);
        scannerActivo = true;
        actualizarEstadoCamara(true);
        mostrarMensaje("Cámara activa", "ok");
    } catch (error) {
        scannerActivo = false;
        actualizarEstadoCamara(false);
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
        desactivarModoCantidad();
        mostrarMensaje("Producto no encontrado", "error");
        reproducirConfirmacion("error");
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
        actualizarContador(resultado.contador);
        actualizarConteosUbicacion(obtenerConteosUbicacion());
        refrescarProductos();
        mostrarMensaje(`Guardado: +${cantidad}`, "ok");
        reproducirConfirmacion("guardado");

        productoActual = null;
        activarBotonGuardar(false);
        elementos.cantidadInput.value = 1;

        setTimeout(() => {
            limpiarProducto("Esperando escaneo...");
            desactivarModoCantidad();
        }, 350);
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

function guardarCorreccion() {
    try {
        if (!productoEditando) {
            mostrarMensaje("Seleccioná un producto", "error");
            return;
        }

        const valores = obtenerValoresEditor();
        const producto = modificarStockProducto(productoEditando.indice, valores.salon, valores.deposito);
        productoEditando = null;
        cambiarPantalla("productos");
        refrescarProductos();

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
    actualizarConteosUbicacion(obtenerConteosUbicacion());
    refrescarProductos();
    mostrarMensaje("Conteo reiniciado", "ok");
}

window.addEventListener("beforeunload", () => {
    detenerScanner();
});
