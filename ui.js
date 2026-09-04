import { escapeHTML as esc } from "./shared/dom-utils.js?v=1960-d21-cierre-etapa6-010926";

const elementos = {
  splash: document.getElementById("splash"),
  pantallas: {
    inicio: document.getElementById("pantallaInicio"),
    vencimientos: document.getElementById("pantallaVencimientos"),
    cartelOferta: document.getElementById("pantallaCartelOferta"),
    anotar: document.getElementById("pantallaAnotar"),
    precios: document.getElementById("pantallaPrecios"),
    etiquetas: document.getElementById("pantallaEtiquetas"),
    horarios: document.getElementById("pantallaHorarios"),
    tareas: document.getElementById("pantallaTareas"),
    bano: document.getElementById("pantallaBano"),
    productos: document.getElementById("pantallaProductos"),
    editarProducto: document.getElementById("pantallaEditarProducto"),
    ajustes: document.getElementById("pantallaAjustes"),
    catalogo: document.getElementById("pantallaCatalogoAdmin"),
    admin: document.getElementById("pantallaAdmin"),
  },
  navBtns: document.querySelectorAll(".nav-btn"),
  toast: document.getElementById("toast"),
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
  modalStockSalon: document.getElementById("modalStockSalon"),
  modalStockDeposito: document.getElementById("modalStockDeposito"),
  inventarioMetricaProductos: document.getElementById(
    "inventarioMetricaProductos",
  ),
  inventarioMetricaUnidades: document.getElementById(
    "inventarioMetricaUnidades",
  ),
  inventarioMetricaSalon: document.getElementById("inventarioMetricaSalon"),
  inventarioMetricaDeposito: document.getElementById(
    "inventarioMetricaDeposito",
  ),
  cantidadInput: document.getElementById("cantidadInput"),
  btnGuardarCantidad: document.getElementById("btnGuardarCantidad"),
  contadorSalonTexto: document.getElementById("contadorSalonTexto"),
  contadorDepositoTexto: document.getElementById("contadorDepositoTexto"),
  btnSalon: document.getElementById("btnSalon"),
  btnDeposito: document.getElementById("btnDeposito"),
  resultadoBusqueda: document.getElementById("resultadoBusqueda"),
  resumenProductos: document.getElementById("resumenProductos"),
  editarNombreProducto: document.getElementById("editarNombreProducto"),
  editarCodigoProducto: document.getElementById("editarCodigoProducto"),
  editarSalon: document.getElementById("editarSalon"),
  editarDeposito: document.getElementById("editarDeposito"),
  editarTotal: document.getElementById("editarTotal"),
};

let temporizadorToast = null;
let sonidoHabilitado = true;
let vibracionHabilitada = true;

export function ocultarSplash() {
  setTimeout(() => elementos.splash.classList.add("oculto"), 650);
}

function moduloDePantalla(nombre) {
  if (["inventario", "productos", "cargados", "editarProducto"].includes(nombre)) return "inventario";
  if (nombre === "cartelOferta") return "vencimientos";
  return nombre;
}

function actualizarEstadoPantalla(nombre) {
  document.body.dataset.screen = nombre;
  document.body.dataset.module = moduloDePantalla(nombre);
}

export function cambiarPantalla(nombre) {
  actualizarEstadoPantalla(nombre);
  const pantallaReal = ["inventario", "productos", "cargados"].includes(nombre)
    ? "productos"
    : nombre;
  Object.entries(elementos.pantallas).forEach(([clave, pantalla]) => {
    if (!pantalla) return;
    const activa = clave === pantallaReal;
    pantalla.classList.toggle("activa", activa);
    pantalla.setAttribute("aria-hidden", activa ? "false" : "true");
    if (activa) pantalla.hidden = false;
  });

  const pantallaNav = nombre === "editarProducto" ? "productos" : nombre === "cartelOferta" ? "vencimientos" : nombre;

  elementos.navBtns.forEach((btn) => {
    btn.classList.toggle("activo", btn.dataset.pantalla === pantallaNav);
  });
  document.querySelectorAll("[data-inventory-tab]").forEach((btn) => {
    btn.classList.toggle("activo", btn.dataset.inventoryTab === pantallaNav);
    btn.setAttribute(
      "aria-selected",
      btn.dataset.inventoryTab === pantallaNav ? "true" : "false",
    );
  });

  document.body.classList.toggle("en-inicio", nombre === "inicio");
  document.body.classList.toggle("en-vencimientos", ["vencimientos", "cartelOferta"].includes(nombre));
  document.body.classList.toggle("en-cartel-oferta", nombre === "cartelOferta");
  document.body.classList.toggle("en-anotar", nombre === "anotar");
  document.body.classList.toggle("en-precios", nombre === "precios");
  document.body.classList.toggle("en-etiquetas", nombre === "etiquetas");
  document.body.classList.toggle("en-horarios", nombre === "horarios");
  document.body.classList.toggle("en-tareas", nombre === "tareas");
  document.body.classList.toggle("en-bano", nombre === "bano");
  document.body.classList.toggle("en-ajustes", nombre === "ajustes");
  document.body.classList.toggle("en-catalogo", nombre === "catalogo");
  document.body.classList.toggle("en-admin", nombre === "admin");
  document.body.classList.toggle(
    "en-modulo-inventario",
    ["inventario", "productos", "cargados", "editarProducto"].includes(nombre),
  );
  document.body.classList.toggle(
    "en-editor-producto",
    nombre === "editarProducto",
  );
}

export function mostrarMensaje() {
  // Los avisos flotantes globales fueron retirados: no deben aparecer
  // por detrás de los modales ni durante la carga de productos.
}


export function actualizarEstadoCamara(activa) {
  elementos.estadoCamaraTexto.textContent = activa
    ? "Escáner activo"
    : "Escáner cerrado";
  elementos.textoCamara.textContent = activa
    ? "Apuntá al código de barras"
    : "";
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
  elementos.codigoProducto.textContent = producto.codigo
    ? `Código: ${producto.codigo}`
    : "Sin código";
  elementos.stockSalon.textContent = producto.salon;
  elementos.stockDeposito.textContent = producto.deposito;
  elementos.stockTotal.textContent = producto.stock;
  if (elementos.modalStockSalon)
    elementos.modalStockSalon.textContent = producto.salon;
  if (elementos.modalStockDeposito)
    elementos.modalStockDeposito.textContent = producto.deposito;
}

export function mostrarProductoNoEncontrado(codigo) {
  elementos.productoCard.classList.remove("oculto");
  elementos.productoCard.classList.remove("empty", "found");
  elementos.productoCard.classList.add("error");
  elementos.estadoProducto.textContent = "Código no encontrado";
  elementos.nombreProducto.textContent =
    "No encontramos este código en la lista de productos.";
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


export function actualizarConteosUbicacion(
  conteos = { salon: 0, deposito: 0 },
) {
  const salon = Number(conteos.salon) || 0;
  const deposito = Number(conteos.deposito) || 0;
  // V3.1.2: estos valores son CANTIDAD DE PRODUCTOS contados, no suma de unidades.
  // Ejemplo: Coca salón 20 + Azúcar salón 5 = 2 productos.
  if (elementos.contadorSalonTexto)
    elementos.contadorSalonTexto.textContent = String(salon);
  if (elementos.contadorDepositoTexto)
    elementos.contadorDepositoTexto.textContent = String(deposito);
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
    osc.frequency.value =
      tipo === "error" ? 180 : tipo === "guardado" ? 740 : 520;
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
  const {
    total = 0,
    consulta = "",
    estadisticas = null,
  } = opciones;
  const tab = "cargados";

  document.body.classList.toggle(
    "inventario-vista-cargados",
    tab === "cargados",
  );
  document.querySelectorAll("[data-inventory-tab]").forEach((btn) => {
    const activo = btn.dataset.inventoryTab === tab;
    btn.classList.toggle("activo", activo);
    btn.setAttribute("aria-selected", activo ? "true" : "false");
  });

  if (!total)
    elementos.resumenProductos.textContent =
      "Conectá Google Sheets para ver productos.";
  else if (tab === "cargados")
    elementos.resumenProductos.textContent = consulta
      ? `Resultados cargados para “${consulta}”`
      : `${Array.isArray(estadisticas) ? estadisticas.length : lista.length} productos con stock`;
  else
    elementos.resumenProductos.textContent = consulta
      ? `Resultados para “${consulta}”`
      : `${total} productos`;

  if (tab === "cargados") {
    const baseEstadisticas = Array.isArray(estadisticas) ? estadisticas : lista;
    const productosCargados = baseEstadisticas.filter(
      (p) =>
        Number(p.stock || 0) > 0 ||
        Number(p.salon || 0) > 0 ||
        Number(p.deposito || 0) > 0,
    );
    const salon = productosCargados.reduce(
      (acc, p) => acc + (Number(p.salon) || 0),
      0,
    );
    const deposito = productosCargados.reduce(
      (acc, p) => acc + (Number(p.deposito) || 0),
      0,
    );
    const unidadesTotales = productosCargados.reduce(
      (acc, p) => acc + Math.max(0, Number(p.stock) || 0),
      0,
    );
    if (elementos.inventarioMetricaProductos)
      elementos.inventarioMetricaProductos.textContent =
        productosCargados.length;
    if (elementos.inventarioMetricaUnidades)
      elementos.inventarioMetricaUnidades.textContent = unidadesTotales;
    if (elementos.inventarioMetricaSalon)
      elementos.inventarioMetricaSalon.textContent = salon;
    if (elementos.inventarioMetricaDeposito)
      elementos.inventarioMetricaDeposito.textContent = deposito;
  }

  if (!lista.length) {
    elementos.resultadoBusqueda.innerHTML =
      tab === "cargados"
        ? `<div class="result-empty result-empty-large inventory-empty-state"><span class="empty-state-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-box"></use></svg></span><strong>Todavía no hay productos con stock cargado</strong><small>Los productos que cargues aparecerán acá.</small></div>`
        : `<div class="result-empty inventory-empty-state"><strong>No se encontraron productos</strong><small>Probá con otro nombre o código.</small></div>`;
    return;
  }

  lista.forEach((producto) => {
    const btn = document.createElement("button");
    btn.className = `inventory-product-card ${tab === "productos" ? "result-item-simple" : "result-item-loaded"}`;
    const modificado =
      producto.ultimaModificacion ||
      producto.fechaModificacion ||
      producto.updatedAt ||
      "";
    if (tab === "productos") {
      btn.innerHTML = `
                <span class="inventory-product-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-box"></use></svg></span>
                <div class="result-product-copy"><strong>${esc(producto.articulo)}</strong><span class="result-code">${esc(producto.codigo || "-")}</span></div>
                <span class="result-chevron" aria-hidden="true">›</span>`;
    } else {
      btn.innerHTML = `
                <span class="inventory-product-icon inventory-product-icon-loaded" aria-hidden="true"><svg class="app-icon"><use href="#icon-box"></use></svg></span>
                <div class="result-product-copy"><strong>${esc(producto.articulo)}</strong><span class="result-code">${esc(producto.codigo || "-")}</span></div>
                <span class="result-chevron" aria-hidden="true">›</span>
                <div class="result-stock-row">
                    <b class="stock-salon"><small>Salón</small>${producto.salon}</b>
                    <b class="stock-deposito"><small>Depósito</small>${producto.deposito}</b>
                    <b class="stock-total"><small>Total</small>${producto.stock}</b>
                </div>
                <div class="result-sync-row"><span>✓ Sincronizado</span>${modificado ? `<time>${esc(modificado)}</time>` : ""}</div>`;
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

  const overlay = document.getElementById("pantallaEditarProducto");
  overlay?.classList.remove("oculto");
  overlay?.classList.add("activo");
  overlay?.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-abierto", "inventory-edit-open");
  requestAnimationFrame(() => elementos.editarSalon?.focus({ preventScroll: true }));
}

export function ocultarEditorStock() {
  const overlay = document.getElementById("pantallaEditarProducto");
  overlay?.classList.add("oculto");
  overlay?.classList.remove("activo");
  overlay?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-abierto", "inventory-edit-open");
}

export function actualizarTotalEditor() {
  const salon = Number(elementos.editarSalon.value) || 0;
  const deposito = Number(elementos.editarDeposito.value) || 0;
  elementos.editarTotal.textContent = salon + deposito;
}

export function obtenerValoresEditor() {
  return {
    salon: Number(elementos.editarSalon.value) || 0,
    deposito: Number(elementos.editarDeposito.value) || 0,
  };
}

export function activarModoCantidad() {
  elementos.quantityCard.classList.remove("oculto");
}

export function desactivarModoCantidad() {
  elementos.quantityCard.classList.add("oculto");
}

// Selector visual unificado para opciones de la aplicación.
(function crearSelectorVisualGlobal() {
  if (window.AppChoicePicker) return;
  let overlay = null;
  let resolver = null;
  let focoAnterior = null;
  const cerrarConEscape = (e) => {
    if (e.key === "Escape" && overlay && !overlay.classList.contains("oculto")) {
      e.preventDefault();
      overlay._cerrar?.();
    }
  };
  function asegurar() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "appChoicePicker";
    overlay.className = "app-choice-overlay oculto";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
          <section class="app-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="appChoiceTitle">
            <header class="app-choice-head">
              <div><span class="app-choice-kicker">Seleccionar</span><h2 id="appChoiceTitle">Elegir opción</h2></div>
              <button type="button" class="app-choice-close" aria-label="Cerrar"><svg class="app-icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </header>
            <div id="appChoiceList" class="app-choice-list"></div>
          </section>`;
    document.body.appendChild(overlay);
    const cerrar = (valor = null) => {
      overlay.classList.add("oculto");
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-abierto");
      document.removeEventListener("keydown", cerrarConEscape);
      const r = resolver;
      resolver = null;
      const foco = focoAnterior;
      focoAnterior = null;
      if (r) r(valor);
      requestAnimationFrame(() => foco?.isConnected && foco.focus?.({ preventScroll: true }));
    };
    overlay.querySelector(".app-choice-close").onclick = () => cerrar();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cerrar();
    });
    overlay._cerrar = cerrar;
    return overlay;
  }
  window.AppChoicePicker = {
    open({
      title = "Elegir opción",
      kicker = "Seleccionar",
      options = [],
      value = "",
    }) {
      const root = asegurar();
      if (resolver) root._cerrar();
      root.querySelector("#appChoiceTitle").textContent = title;
      root.querySelector(".app-choice-kicker").textContent = kicker;
      const list = root.querySelector("#appChoiceList");
      list.innerHTML = options
        .map(
          (
            o,
          ) => `<button type="button" class="app-choice-option ${String(o.value) === String(value) ? "seleccionada" : ""}" data-value="${String(o.value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">
              ${o.color ? `<i class="app-choice-swatch" style="background:${o.color}">${o.badge || ""}</i>` : o.icon ? `<span class="app-choice-icon">${o.icon}</span>` : ""}
              <span class="app-choice-copy"><strong>${o.label}</strong>${o.description ? `<small>${o.description}</small>` : ""}</span>
              <span class="app-choice-check"><svg class="app-icon" aria-hidden="true"><use href="#icon-check"></use></svg></span>
            </button>`,
        )
        .join("");
      return new Promise((resolve) => {
        resolver = resolve;
        list
          .querySelectorAll(".app-choice-option")
          .forEach(
            (btn) => (btn.onclick = () => root._cerrar(btn.dataset.value)),
          );
        focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        root.classList.remove("oculto");
        root.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-abierto");
        document.removeEventListener("keydown", cerrarConEscape);
        document.addEventListener("keydown", cerrarConEscape);
        requestAnimationFrame(() => root.querySelector(".app-choice-close")?.focus({ preventScroll: true }));
        setTimeout(
          () =>
            list
              .querySelector(".seleccionada")
              ?.scrollIntoView({ block: "nearest" }),
          30,
        );
      });
    },
  };
})();
