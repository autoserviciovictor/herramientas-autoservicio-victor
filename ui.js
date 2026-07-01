const elementos = {
    splash: document.getElementById("splash"),
    pantallas: {
        inventario: document.getElementById("pantallaInventario"),
        corregir: document.getElementById("pantallaCorregir"),
        ajustes: document.getElementById("pantallaAjustes")
    },
    navBtns: document.querySelectorAll(".nav-btn"),
    toast: document.getElementById("toast"),
    estadoExcelTexto: document.getElementById("estadoExcelTexto"),
    estadoCamaraTexto: document.getElementById("estadoCamaraTexto"),
    productoCard: document.getElementById("productoCard"),
    estadoProducto: document.getElementById("estadoProducto"),
    nombreProducto: document.getElementById("nombreProducto"),
    codigoProducto: document.getElementById("codigoProducto"),
    stockSalon: document.getElementById("stockSalon"),
    stockDeposito: document.getElementById("stockDeposito"),
    stockTotal: document.getElementById("stockTotal"),
    cantidadInput: document.getElementById("cantidadInput"),
    btnGuardarCantidad: document.getElementById("btnGuardarCantidad"),
    contadorTexto: document.getElementById("contadorTexto"),
    ubicacionActualTexto: document.getElementById("ubicacionActualTexto"),
    btnSalon: document.getElementById("btnSalon"),
    btnDeposito: document.getElementById("btnDeposito"),
    btnDescargar: document.getElementById("btnDescargar"),
    btnLinterna: document.getElementById("btnLinterna"),
    resultadoBusqueda: document.getElementById("resultadoBusqueda"),
    editorStock: document.getElementById("editorStock"),
    editarNombreProducto: document.getElementById("editarNombreProducto"),
    editarCodigoProducto: document.getElementById("editarCodigoProducto"),
    editarSalon: document.getElementById("editarSalon"),
    editarDeposito: document.getElementById("editarDeposito"),
    editarTotal: document.getElementById("editarTotal")
};

let temporizadorToast = null;
let sonidoHabilitado = true;
let vibracionHabilitada = true;

export function ocultarSplash() {
    setTimeout(() => elementos.splash.classList.add("oculto"), 650);
}

export function cambiarPantalla(nombre) {
    Object.entries(elementos.pantallas).forEach(([clave, pantalla]) => {
        pantalla.classList.toggle("activa", clave === nombre);
    });

    elementos.navBtns.forEach(btn => {
        btn.classList.toggle("activo", btn.dataset.pantalla === nombre);
    });
}

export function mostrarMensaje(texto, tipo = "ok") {
    clearTimeout(temporizadorToast);

    elementos.toast.textContent = texto;
    elementos.toast.className = `toast mostrar ${tipo}`;

    temporizadorToast = setTimeout(() => {
        elementos.toast.className = "toast";
    }, 2300);
}

export function actualizarEstadoExcel(cantidad) {
    elementos.estadoExcelTexto.textContent = `🟢 ${cantidad} productos cargados`;
}

export function actualizarEstadoCamara(activa) {
    elementos.estadoCamaraTexto.textContent = activa ? "Cámara activa" : "Cámara detenida";
}

export function actualizarUbicacion(ubicacion) {
    const esSalon = ubicacion === "salon";
    elementos.btnSalon.classList.toggle("activo", esSalon);
    elementos.btnDeposito.classList.toggle("activo", !esSalon);
    elementos.ubicacionActualTexto.textContent = esSalon ? "Salón" : "Depósito";
}

export function mostrarProducto(producto) {
    elementos.productoCard.classList.remove("empty", "error", "found");
    void elementos.productoCard.offsetWidth;
    elementos.productoCard.classList.add("found");

    elementos.estadoProducto.textContent = "Producto encontrado";
    elementos.nombreProducto.textContent = producto.articulo;
    elementos.codigoProducto.textContent = producto.codigo || "Sin código";
    elementos.stockSalon.textContent = producto.salon;
    elementos.stockDeposito.textContent = producto.deposito;
    elementos.stockTotal.textContent = producto.stock;
}

export function mostrarProductoNoEncontrado(codigo) {
    elementos.productoCard.classList.remove("empty", "found");
    elementos.productoCard.classList.add("error");

    elementos.estadoProducto.textContent = "No encontrado";
    elementos.nombreProducto.textContent = "Producto inexistente";
    elementos.codigoProducto.textContent = codigo;
    elementos.stockSalon.textContent = "-";
    elementos.stockDeposito.textContent = "-";
    elementos.stockTotal.textContent = "-";
}

export function limpiarProducto(texto = "Apuntá al código de barras") {
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
    elementos.contadorTexto.textContent = numero;
}

export function activarBotonGuardar(estado) {
    elementos.btnGuardarCantidad.disabled = !estado;
}

export function activarBotonDescargar(estado) {
    elementos.btnDescargar.disabled = !estado;
}

export function activarBotonLinterna(estado) {
    elementos.btnLinterna.disabled = !estado;
}

export function actualizarBotonLinterna(activa) {
    elementos.btnLinterna.classList.toggle("activo", activa);
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

        const frecuencia = tipo === "error" ? 180 : tipo === "guardado" ? 740 : 520;
        osc.frequency.value = frecuencia;
        osc.type = "sine";

        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.13);
    } catch (error) {
        // Algunos navegadores bloquean audio hasta que el usuario interactúa. No es grave.
    }
}

export function renderResultadosBusqueda(lista, onSeleccionar) {
    elementos.resultadoBusqueda.innerHTML = "";

    if (!lista.length) {
        elementos.resultadoBusqueda.innerHTML = `<div class="result-item"><strong>No hay resultados</strong><span>Buscá por nombre o código</span></div>`;
        return;
    }

    lista.forEach(producto => {
        const btn = document.createElement("button");
        btn.className = "result-item";
        btn.innerHTML = `
            <strong>${producto.articulo}</strong>
            <span>Código: ${producto.codigo || "-"} · Salón ${producto.salon} · Depósito ${producto.deposito} · Total ${producto.stock}</span>
        `;
        btn.addEventListener("click", () => onSeleccionar(producto));
        elementos.resultadoBusqueda.appendChild(btn);
    });
}

export function mostrarEditorStock(producto) {
    elementos.editorStock.classList.remove("oculto");
    elementos.editarNombreProducto.textContent = producto.articulo;
    elementos.editarCodigoProducto.textContent = producto.codigo || "Sin código";
    elementos.editarSalon.value = producto.salon;
    elementos.editarDeposito.value = producto.deposito;
    actualizarTotalEditor();
}

export function ocultarEditorStock() {
    elementos.editorStock.classList.add("oculto");
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
