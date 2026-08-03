import { resolveModule, getDesktopNavigationSource } from "./module-registry.js?v=1182";

const elementos = {
    splash: document.getElementById("splash"),
    pantallas: {
        inicio: document.getElementById("pantallaInicio"),
        inventario: document.getElementById("pantallaInventario"),
        vencimientos: document.getElementById("pantallaVencimientos"),
        anotar: document.getElementById("pantallaAnotar"),
        precios: document.getElementById("pantallaPrecios"),
        horarios: document.getElementById("pantallaHorarios"),
        tareas: document.getElementById("pantallaTareas"),
        productos: document.getElementById("pantallaProductos"),
        editarProducto: document.getElementById("pantallaEditarProducto"),
        ajustes: document.getElementById("pantallaAjustes"),
        admin: document.getElementById("pantallaAdmin")
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
    resultadoBusqueda: document.getElementById("resultadoBusqueda"),
    resumenProductos: document.getElementById("resumenProductos"),
    editarNombreProducto: document.getElementById("editarNombreProducto"),
    editarCodigoProducto: document.getElementById("editarCodigoProducto"),
    editarSalon: document.getElementById("editarSalon"),
    editarDeposito: document.getElementById("editarDeposito"),
    editarTotal: document.getElementById("editarTotal")
};

const desktopSidebar = {
    root: document.getElementById("desktopModuleSidebar"),
    nav: document.getElementById("desktopSidebarNav"),
    title: document.getElementById("desktopSidebarTitle"),
    iconUse: document.querySelector("#desktopSidebarIcon use")
};

let desktopSidebarScreen = "inicio";

function renderDesktopSidebar(nombre = desktopSidebarScreen) {
    desktopSidebarScreen = nombre;
    const cfg = getDesktopNavigationSource(nombre);
    if (!desktopSidebar.root || !desktopSidebar.nav || !cfg) {
        desktopSidebar.root?.classList.remove("visible");
        desktopSidebar.root?.setAttribute("aria-hidden", "true");
        return;
    }
    const source = document.querySelector(cfg.selector);
    if (!source) {
        desktopSidebar.root.classList.remove("visible");
        desktopSidebar.root.setAttribute("aria-hidden", "true");
        return;
    }
    desktopSidebar.title.textContent = cfg.title;
    desktopSidebar.iconUse?.setAttribute("href", cfg.icon);
    desktopSidebar.nav.innerHTML = "";
    [...source.querySelectorAll(":scope > button")].filter(btn => !btn.classList.contains("oculto")).forEach((original, index) => {
        const clone = original.cloneNode(true);
        clone.removeAttribute("id");
        clone.classList.add("desktop-sidebar-button");
        clone.dataset.sidebarIndex = String(index);
        clone.dataset.moduleNavProxy = cfg.moduleId;
        clone.setAttribute("aria-current", original.classList.contains("activo") ? "page" : "false");
        clone.onclick = () => {
            original.click();
            setTimeout(() => renderDesktopSidebar(nombre), 0);
        };
        desktopSidebar.nav.appendChild(clone);
    });
    desktopSidebar.root.classList.add("visible");
    desktopSidebar.root.setAttribute("aria-hidden", "false");
}

const sidebarObserver = new MutationObserver(() => {
    if (window.matchMedia("(min-width: 901px)").matches) renderDesktopSidebar();
});
[...document.querySelectorAll(".app-bottom-nav,.admin-bottom-nav")].forEach(nav => sidebarObserver.observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] }));
window.addEventListener("resize", () => renderDesktopSidebar());

let temporizadorToast = null;
let sonidoHabilitado = true;
let vibracionHabilitada = true;
let totalProductos = 0;

export function ocultarSplash() {
    setTimeout(() => elementos.splash.classList.add("oculto"), 650);
}

function actualizarEncabezadoModulo(nombre) {
    const tituloMarca = document.getElementById("brandHeaderTitulo");
    const tituloPagina = document.getElementById("modulePageTitle");
    const subtituloPagina = document.getElementById("modulePageSubtitle");
    const volver = document.getElementById("brandBackBtn");
    const iconoPagina = document.getElementById("modulePageIconUse");
    const module = resolveModule(nombre);

    if (tituloMarca) tituloMarca.textContent = module.title;
    if (iconoPagina) iconoPagina.setAttribute("href", module.icon);
    if (tituloPagina) tituloPagina.textContent = module.pageTitle;
    if (subtituloPagina) {
        subtituloPagina.textContent = module.subtitle;
        subtituloPagina.hidden = !module.subtitle;
    }

    document.body.dataset.module = module.moduleId;
    document.body.dataset.screen = nombre;

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
    document.body.classList.toggle("en-precios", nombre === "precios");
    document.body.classList.toggle("en-horarios", nombre === "horarios");
    document.body.classList.toggle("en-tareas", nombre === "tareas");
    document.body.classList.toggle("en-ajustes", nombre === "ajustes");
    document.body.classList.toggle("en-admin", nombre === "admin");
    document.body.classList.toggle("en-modulo-inventario", ["inventario", "productos", "cargados", "editarProducto"].includes(nombre));
    document.body.classList.toggle("en-editor-producto", nombre === "editarProducto");
    renderDesktopSidebar(nombre);
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
    if (elementos.estadoExcelTexto) elementos.estadoExcelTexto.textContent = cantidad ? "Google Sheets" : "Sin conexión";
    if (elementos.estadoConteoTexto) elementos.estadoConteoTexto.textContent = cantidad ? `${cantidad} productos` : "0 productos";
    if (elementos.estadoExcelAjustes) {
        elementos.estadoExcelAjustes.textContent = cantidad ? `Google Sheets conectado: ${cantidad} productos` : "Sin conexión con Google Sheets";
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
    if (elementos.estadoConteoTexto) elementos.estadoConteoTexto.textContent = totalProductos ? `${totalProductos} productos` : "0 productos";
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
        if (tab === "cargados") {
            elementos.resultadoBusqueda.innerHTML = `
                <div class="result-empty result-empty-large">
                    <span class="empty-state-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-box"></use></svg></span>
                    <strong>Todavía no hay productos con stock cargado</strong>
                    <small>Los productos que cargues aparecerán acá.</small>
                </div>`;
        } else {
            elementos.resultadoBusqueda.innerHTML = `
                <div class="result-empty">
                    <strong>No se encontraron productos</strong>
                    <small>Probá con otro nombre o código.</small>
                </div>`;
        }
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


// Selector visual unificado para opciones de la aplicación.
(function crearSelectorVisualGlobal(){
    if (window.AppChoicePicker) return;
    let overlay = null;
    let resolver = null;
    function asegurar(){
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'appChoicePicker';
        overlay.className = 'app-choice-overlay oculto';
        overlay.setAttribute('aria-hidden','true');
        overlay.innerHTML = `
          <section class="app-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="appChoiceTitle">
            <header class="app-choice-head">
              <div><span class="app-choice-kicker">Seleccionar</span><h2 id="appChoiceTitle">Elegir opción</h2></div>
              <button type="button" class="app-choice-close" aria-label="Cerrar"><svg class="app-icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </header>
            <div id="appChoiceList" class="app-choice-list"></div>
            <button type="button" class="app-choice-cancel">Cancelar</button>
          </section>`;
        document.body.appendChild(overlay);
        const cerrar = (valor=null) => {
            overlay.classList.add('oculto');
            overlay.setAttribute('aria-hidden','true');
            document.body.classList.remove('modal-abierto');
            const r = resolver; resolver = null; if (r) r(valor);
        };
        overlay.querySelector('.app-choice-close').onclick=()=>cerrar();
        overlay.querySelector('.app-choice-cancel').onclick=()=>cerrar();
        overlay.addEventListener('click',e=>{if(e.target===overlay) cerrar();});
        overlay._cerrar=cerrar;
        return overlay;
    }
    window.AppChoicePicker={
        open({title='Elegir opción', kicker='Seleccionar', options=[], value=''}){
            const root=asegurar();
            if(resolver) root._cerrar();
            root.querySelector('#appChoiceTitle').textContent=title;
            root.querySelector('.app-choice-kicker').textContent=kicker;
            const list=root.querySelector('#appChoiceList');
            list.innerHTML=options.map(o=>`<button type="button" class="app-choice-option ${String(o.value)===String(value)?'seleccionada':''}" data-value="${String(o.value).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">
              ${o.color?`<i class="app-choice-swatch" style="background:${o.color}">${o.badge||''}</i>`:(o.icon?`<span class="app-choice-icon">${o.icon}</span>`:'')}
              <span class="app-choice-copy"><strong>${o.label}</strong>${o.description?`<small>${o.description}</small>`:''}</span>
              <span class="app-choice-check"><svg class="app-icon" aria-hidden="true"><use href="#icon-check"></use></svg></span>
            </button>`).join('');
            return new Promise(resolve=>{
                resolver=resolve;
                list.querySelectorAll('.app-choice-option').forEach(btn=>btn.onclick=()=>root._cerrar(btn.dataset.value));
                root.classList.remove('oculto'); root.setAttribute('aria-hidden','false'); document.body.classList.add('modal-abierto');
                setTimeout(()=>list.querySelector('.seleccionada')?.scrollIntoView({block:'nearest'}),30);
            });
        }
    };
})();
