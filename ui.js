const elementos = {
    splash: document.getElementById("splash"),
    pantallas: {
        inicio: document.getElementById("pantallaInicio"),
        inventario: document.getElementById("pantallaInventario"),
        vencimientos: document.getElementById("pantallaVencimientos"),
        anotar: document.getElementById("pantallaAnotar"),
        productos: document.getElementById("pantallaProductos"),
        editarProducto: document.getElementById("pantallaEditarProducto"),
        ajustes: document.getElementById("pantallaAjustes")
    },
    navBtns: document.querySelectorAll(".nav-btn"),
    toast: document.getElementById("toast"),
    pantallaInventario: document.getElementById("pantallaInventario"),
    estadoConteoTexto: document.getElementById("estadoConteoTexto"),
    estadoExcelTexto: document.getElementById("estadoExcelTexto"),
    estadoCamaraTexto: document.getElementById("estadoCamaraTexto"),
    textoCamara: document.getElementById("textoCamara"),
    productoCard: document.getElementById("productoCard"),
    quantityCard: document.getElementById("quantityCard"),
    estadoProducto: document.getElementById("estadoProducto"),
    nombreProducto: document.getElementById("nombreProducto"),
    codigoProducto: document.getElementById("codigoProducto"),
    stockSalon: document.getElementById("stockSalon"),
    stockDeposito: document.getElementById("stockDeposito"),
    stockTotal: document.getElementById("stockTotal"),
    cantidadInput: document.getElementById("cantidadInput"),
    btnGuardarCantidad: document.getElementById("btnGuardarCantidad"),
    contadorSalonTexto: document.getElementById("contadorSalonTexto"),
    contadorDepositoTexto: document.getElementById("contadorDepositoTexto"),
    estadoExcelAjustes: document.getElementById("estadoExcelAjustes"),
    btnSalon: document.getElementById("btnSalon"),
    btnDeposito: document.getElementById("btnDeposito"),
    btnDescargar: document.getElementById("btnDescargar"),
    resultadoBusqueda: document.getElementById("resultadoBusqueda"),
    resumenProductos: document.getElementById("resumenProductos"),
    editarNombreProducto: document.getElementById("editarNombreProducto"),
    editarCodigoProducto: document.getElementById("editarCodigoProducto"),
    editarSalon: document.getElementById("editarSalon"),
    editarDeposito: document.getElementById("editarDeposito"),
    editarTotal: document.getElementById("editarTotal")
};

let temporizadorToast = null;
let sonidoHabilitado = true;
let vibracionHabilitada = true;
let totalProductos = 0;

export function ocultarSplash() {
    setTimeout(() => elementos.splash.classList.add("oculto"), 650);
}

function actualizarEncabezadoModulo(nombre) {
    const titulo = document.getElementById("brandHeaderTitulo");
    const subtitulo = document.getElementById("brandHeaderSubtitulo");
    const volver = document.getElementById("brandBackBtn");
    if (!titulo || !subtitulo) return;

    const encabezados = {
        inicio: ["🏪 Autoservicio Victor", "Herramientas"],
        inventario: ["Inventario", "Control de stock"],
        productos: ["Productos", "Lista completa"],
        cargados: ["Cargados", "Productos con stock"],
        editarProducto: ["Editar producto", "Inventario"],
        ajustes: ["Ajustes", "Configuración general"],
        vencimientos: ["Vencimientos", "Control de fechas"],
        anotar: ["Anotar reposición", "Reposición de salón"]
    };
    const [textoTitulo, textoSubtitulo] = encabezados[nombre] || encabezados.inicio;
    titulo.textContent = textoTitulo;
    subtitulo.textContent = textoSubtitulo;
    if (volver) {
        const destinos = { editarProducto: "productos" };
        volver.dataset.modulo = destinos[nombre] || "inicio";
        volver.classList.toggle("oculto", nombre === "inicio");
    }
}

export function cambiarPantalla(nombre) {
    actualizarEncabezadoModulo(nombre);
    const pantallaReal = nombre === "cargados" ? "productos" : nombre;
    Object.entries(elementos.pantallas).forEach(([clave, pantalla]) => {
        if (!pantalla) return;
        pantalla.classList.toggle("activa", clave === pantallaReal);
    });

    const pantallaNav = nombre === "editarProducto" ? "productos" : nombre;

    elementos.navBtns.forEach(btn => {
        btn.classList.toggle("activo", btn.dataset.pantalla === pantallaNav);
    });

    document.body.classList.toggle("en-inicio", nombre === "inicio");
    document.body.classList.toggle("en-vencimientos", nombre === "vencimientos");
    document.body.classList.toggle("en-anotar", nombre === "anotar");
    document.body.classList.toggle("en-ajustes", nombre === "ajustes");
    document.body.classList.toggle("en-modulo-inventario", ["inventario", "productos", "cargados", "editarProducto"].includes(nombre));
    document.body.classList.toggle("en-editor-producto", nombre === "editarProducto");
}

export function mostrarMensaje(texto, tipo = "ok") {
    clearTimeout(temporizadorToast);
    elementos.toast.textContent = texto;
    elementos.toast.className = `toast mostrar ${tipo}`;
    temporizadorToast = setTimeout(() => {
        elementos.toast.className = "toast";
    }, 1700);
}

export function actualizarEstadoExcel(cantidad) {
    totalProductos = cantidad;
    elementos.estadoExcelTexto.textContent = cantidad ? "Google Sheets" : "Sin conexión";
    elementos.estadoConteoTexto.textContent = cantidad ? `${cantidad} productos` : "0 productos";
    if (elementos.estadoExcelAjustes) {
        elementos.estadoExcelAjustes.textContent = cantidad ? `✅ Google Sheets conectado: ${cantidad} productos` : "Sin conexión con Google Sheets";
        elementos.estadoExcelAjustes.classList.toggle("cargado", Boolean(cantidad));
    }
}

export function actualizarEstadoCamara(activa) {
    elementos.estadoCamaraTexto.textContent = activa ? "Escáner activo" : "Escáner cerrado";
    elementos.textoCamara.textContent = activa ? "Apuntá al código de barras" : "";
}

export function actualizarUbicacion(ubicacion) {
    const esSalon = ubicacion === "salon";
    elementos.btnSalon.classList.toggle("activo", esSalon);
    elementos.btnDeposito.classList.toggle("activo", !esSalon);
    // La ubicación predeterminada se refleja en los botones de ajustes.
}

export function mostrarProducto(producto) {
    elementos.productoCard.classList.remove("oculto");
    elementos.productoCard.classList.remove("empty", "error", "found");
    void elementos.productoCard.offsetWidth;
    elementos.productoCard.classList.add("found");
    elementos.estadoProducto.textContent = "Producto encontrado";
    elementos.nombreProducto.textContent = producto.articulo;
    elementos.codigoProducto.textContent = producto.codigo ? `Código: ${producto.codigo}` : "Sin código";
    elementos.stockSalon.textContent = producto.salon;
    elementos.stockDeposito.textContent = producto.deposito;
    elementos.stockTotal.textContent = producto.stock;
}

export function mostrarProductoNoEncontrado(codigo) {
    elementos.productoCard.classList.remove("oculto");
    elementos.productoCard.classList.remove("empty", "found");
    elementos.productoCard.classList.add("error");
    elementos.estadoProducto.textContent = "Código no encontrado";
    elementos.nombreProducto.textContent = "No encontramos este código en la lista de productos.";
    elementos.codigoProducto.textContent = codigo;
    elementos.stockSalon.textContent = "-";
    elementos.stockDeposito.textContent = "-";
    elementos.stockTotal.textContent = "-";
}

export function limpiarProducto(texto = "Esperando escaneo...") {
    elementos.productoCard.classList.add("oculto");
    elementos.productoCard.classList.remove("found", "error");
    elementos.productoCard.classList.add("empty");
    elementos.estadoProducto.textContent = "Esperando código";
    elementos.nombreProducto.textContent = texto;
    elementos.codigoProducto.textContent = "-";
    elementos.stockSalon.textContent = "0";
    elementos.stockDeposito.textContent = "0";
    elementos.stockTotal.textContent = "0";
}

export function actualizarContador(numero) {
    // Se mantiene para compatibilidad con la lógica principal.
    // La cabecera muestra solo la cantidad total de productos del Excel.
    elementos.estadoConteoTexto.textContent = totalProductos ? `${totalProductos} productos` : "0 productos";
}

export function actualizarConteosUbicacion(conteos = { salon: 0, deposito: 0 }) {
    const salon = Number(conteos.salon) || 0;
    const deposito = Number(conteos.deposito) || 0;
    // V3.1.2: estos valores son CANTIDAD DE PRODUCTOS contados, no suma de unidades.
    // Ejemplo: Coca salón 20 + Azúcar salón 5 = 2 productos.
    if (elementos.contadorSalonTexto) elementos.contadorSalonTexto.textContent = String(salon);
    if (elementos.contadorDepositoTexto) elementos.contadorDepositoTexto.textContent = String(deposito);
}

export function activarBotonGuardar(estado) {
    elementos.btnGuardarCantidad.disabled = !estado;
}

export function activarBotonDescargar(estado) {
    elementos.btnDescargar.disabled = !estado;
}


export function configurarFeedback({ sonidos, vibracion }) {
    sonidoHabilitado = sonidos;
    vibracionHabilitada = vibracion;
}

export function reproducirConfirmacion(tipo = "ok") {
    if (vibracionHabilitada && "vibrate" in navigator) {
        navigator.vibrate(tipo === "error" ? [40, 40, 40] : 40);
    }

    if (!sonidoHabilitado) return;

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = tipo === "error" ? 180 : tipo === "guardado" ? 740 : 520;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.13);
    } catch (error) {}
}


export function renderResultadosBusqueda(lista, onSeleccionar, opciones = {}) {
    elementos.resultadoBusqueda.innerHTML = "";
    const { tab = "productos", total = 0, consulta = "" } = opciones;

    if (!total) elementos.resumenProductos.textContent = "Conectá Google Sheets para ver productos.";
    else if (tab === "cargados") elementos.resumenProductos.textContent = consulta ? `Resultados cargados para “${consulta}”` : "Productos con stock cargado";
    else elementos.resumenProductos.textContent = consulta ? `Resultados para “${consulta}”` : `${total} productos`;

    if (!lista.length) {
        const mensaje = tab === "cargados" ? "Todavía no hay productos con stock cargado." : "No se encontraron productos.";
        elementos.resultadoBusqueda.innerHTML = `<div class="result-empty"><strong>${mensaje}</strong></div>`;
        return;
    }

    lista.forEach(producto => {
        const btn = document.createElement("button");
        btn.className = `result-item ${tab === "productos" ? "result-item-simple" : "result-item-loaded"}`;
        const modificado = producto.ultimaModificacion || producto.fechaModificacion || producto.updatedAt || "";
        if (tab === "productos") {
            btn.innerHTML = `
                <div class="result-product-copy"><strong>${producto.articulo}</strong><span class="result-code">${producto.codigo || "-"}</span></div>
                <span class="result-chevron" aria-hidden="true">›</span>`;
        } else {
            btn.innerHTML = `
                <div class="result-product-copy"><strong>${producto.articulo}</strong><span class="result-code">${producto.codigo || "-"}</span></div>
                <span class="result-chevron" aria-hidden="true">›</span>
                <div class="result-stock-row">
                    <b class="stock-salon"><small>Salón</small>${producto.salon}</b>
                    <b class="stock-deposito"><small>Depósito</small>${producto.deposito}</b>
                    <b class="stock-total"><small>Total</small>${producto.stock}</b>
                </div>
                <div class="result-sync-row"><span>✓ Sincronizado</span>${modificado ? `<time>${modificado}</time>` : ""}</div>`;
        }
        btn.addEventListener("click", () => onSeleccionar(producto));
        elementos.resultadoBusqueda.appendChild(btn);
    });
}

export function mostrarEditorStock(producto) {
    elementos.editarNombreProducto.textContent = producto.articulo;
    elementos.editarCodigoProducto.textContent = producto.codigo || "Sin código";
    elementos.editarSalon.value = producto.salon;
    elementos.editarDeposito.value = producto.deposito;
    actualizarTotalEditor();
    cambiarPantalla("editarProducto");
}

export function actualizarTotalEditor() {
    const salon = Number(elementos.editarSalon.value) || 0;
    const deposito = Number(elementos.editarDeposito.value) || 0;
    elementos.editarTotal.textContent = salon + deposito;
}

export function obtenerValoresEditor() {
    return {
        salon: Number(elementos.editarSalon.value) || 0,
        deposito: Number(elementos.editarDeposito.value) || 0
    };
}

export function activarModoCantidad() {
    elementos.pantallaInventario.classList.add("modo-cantidad");
    elementos.quantityCard.classList.remove("oculto");
}

export function desactivarModoCantidad() {
    elementos.pantallaInventario.classList.remove("modo-cantidad");
    elementos.quantityCard.classList.add("oculto");
}
