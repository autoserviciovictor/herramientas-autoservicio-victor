import {
  iniciarScanner as iniciarScannerCompartido,
  detenerScanner as detenerScannerCompartido,
} from "./scanner.js?v=1960-d21-auditoria-correcciones-260826-d";
import {
  PRODUCT_LOADER_CAMERA_ERROR,
  establecerModoCargaProducto,
  mostrarErrorCargaProducto,
} from "./product-loader.js?v=1960-d21-auditoria-correcciones-260826-d";
import { ordenarPorBusqueda } from "./search.js?v=1960-d21-auditoria-correcciones-260826-d";
import {
  obtenerJsonCacheado,
  precargarCatalogo,
} from "./api-cache.js?v=1960-d21-auditoria-correcciones-260826-d";
import { escapeHTML as esc } from "./shared/dom-utils.js?v=1960-d21-auditoria-correcciones-260826-d";

const $ = (id) => document.getElementById(id);
const LAST_KEY_BASE = "autoservicio-precios-ultimo-v3";
const RECENT_KEY_BASE = "autoservicio-precios-recientes-v2";
const RECENT_MAX = 12;

let productos = [];
let cargados = false;
let cargando = null;
let scannerActivo = false;
let moduloPreciosActivo = false;
let historialExpandido = false;

function usuarioCacheClave() {
  const usuario = window.AutoservicioAuth?.getUsuario?.()?.usuario;
  return encodeURIComponent(String(usuario || "anonimo").trim().toLowerCase());
}

function claveUltimo() {
  return `${LAST_KEY_BASE}:${usuarioCacheClave()}`;
}

function claveRecientes() {
  return `${RECENT_KEY_BASE}:${usuarioCacheClave()}`;
}

function precioNumero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function formatearPrecio(valor) {
  const n = precioNumero(valor);
  if (n === null || n <= 0) return "Precio no disponible";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function normalizarProducto(p) {
  return {
    codigo: String(p?.codigo || "").trim(),
    articulo: String(p?.articulo || "Producto").trim(),
    precio: precioNumero(p?.precio),
    consultadoEn: Number(p?.consultadoEn) || 0,
  };
}

async function cargarProductos({ forzar = false } = {}) {
  if (cargados && !forzar) return productos;
  if (cargando) return cargando;

  cargando = obtenerJsonCacheado("/productos-maestro", {
    ttl: 5 * 60 * 1000,
    forzar,
  })
    .then((data) => (data.productos || []).map(normalizarProducto))
    .then((lista) => {
      productos = lista;
      cargados = true;
      return lista;
    })
    .finally(() => {
      cargando = null;
    });

  return cargando;
}

function leerUltimo() {
  try {
    const raw = JSON.parse(localStorage.getItem(claveUltimo()) || "null");
    return raw ? normalizarProducto(raw) : null;
  } catch (_) {
    return null;
  }
}

function leerRecientes() {
  try {
    const raw = JSON.parse(localStorage.getItem(claveRecientes()) || "[]");
    return Array.isArray(raw) ? raw.map(normalizarProducto).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function guardarRecientes(lista) {
  try {
    localStorage.setItem(claveRecientes(), JSON.stringify(lista.slice(0, RECENT_MAX)));
  } catch (_) {}
}

function agregarReciente(producto) {
  const item = { ...normalizarProducto(producto), consultadoEn: Date.now() };
  const actuales = leerRecientes().filter((p) => {
    if (item.codigo) return p.codigo !== item.codigo;
    return p.articulo.toLowerCase() !== item.articulo.toLowerCase();
  });
  guardarRecientes([item, ...actuales]);
}

function guardarUltimo(producto, { registrar = true } = {}) {
  if (!producto) return;
  const item = { ...normalizarProducto(producto), consultadoEn: Date.now() };
  try {
    localStorage.setItem(claveUltimo(), JSON.stringify(item));
  } catch (_) {}
  if (registrar) agregarReciente(item);
  renderUltimo(item);
  renderRecientes();
}

function renderUltimo(producto) {
  const box = $("precioUltimoResultado");
  if (!box) return;

  if (!producto || (!producto.codigo && !producto.articulo)) {
    box.className = "precio-current-empty";
    box.innerHTML = `
      <span class="precio-current-empty-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-tag"></use></svg></span>
      <strong>Todavía no consultaste un producto</strong>
      <small>Buscá un artículo o escaneá su código con el botón +.</small>`;
    return;
  }

  const disponible = precioNumero(producto.precio) > 0;
  box.className = "precio-current-product";
  box.innerHTML = `
    <div class="precio-current-main">
      <span class="precio-current-product-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-tag"></use></svg></span>
      <div class="precio-current-copy">
        <strong>${esc(producto.articulo)}</strong>
        <small>Código: ${esc(producto.codigo || "Sin código")}</small>
      </div>
    </div>
    <div class="precio-current-divider"></div>
    <div class="precio-current-value ${disponible ? "" : "sin-precio"}">
      <span>Precio actual</span>
      <b>${esc(formatearPrecio(producto.precio))}</b>
    </div>
    <div class="precio-current-updated">
      <svg class="app-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>
      <span>Última actualización: hoy</span>
    </div>`;
}

function renderRecientes() {
  const cont = $("precioRecientesLista");
  const toggle = $("btnPrecioHistorialToggle");
  if (!cont) return;

  const recientes = leerRecientes();
  if (!recientes.length) {
    cont.innerHTML = `
      <div class="precios-recent-empty">
        <span aria-hidden="true"><svg class="app-icon"><use href="#icon-clock"></use></svg></span>
        <strong>Sin consultas recientes</strong>
        <small>Los productos que consultes aparecerán acá.</small>
      </div>`;
    toggle?.classList.add("oculto");
    return;
  }

  const visibles = historialExpandido ? recientes : recientes.slice(0, 3);
  cont.innerHTML = visibles
    .map(
      (producto) => `
        <button type="button" class="precios-recent-row" data-precio-reciente="${esc(producto.codigo || producto.articulo)}">
          <span class="precios-recent-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-tag"></use></svg></span>
          <span class="precios-recent-copy">
            <strong>${esc(producto.articulo)}</strong>
            <small>Código: ${esc(producto.codigo || "Sin código")}</small>
          </span>
          <b class="${precioNumero(producto.precio) > 0 ? "" : "sin-precio"}">${esc(formatearPrecio(producto.precio))}</b>
          <span class="precios-recent-chevron" aria-hidden="true">›</span>
        </button>`,
    )
    .join("");

  cont.querySelectorAll("[data-precio-reciente]").forEach((button, index) => {
    button.addEventListener("click", () => {
      const producto = visibles[index];
      if (!producto) return;
      guardarUltimo(producto);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  if (toggle) {
    toggle.classList.toggle("oculto", recientes.length <= 3);
    toggle.innerHTML = historialExpandido
      ? 'Ver menos <span class="precios-history-chevron is-up" aria-hidden="true"><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></span>'
      : 'Ver más <span class="precios-history-chevron" aria-hidden="true"><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></span>';
  }
}

function buscar(texto, limite = 6) {
  const consulta = String(texto || "").trim();
  if (consulta.length < 2) return [];
  return ordenarPorBusqueda(productos, consulta, {
    limite,
    campos: ["articulo", "codigo"],
  });
}

function ocultarSugerenciasPrincipal() {
  const cont = $("precioConsultaSugerencias");
  if (!cont) return;
  cont.innerHTML = "";
  cont.classList.add("oculto");
}

function renderSugerenciasPrincipal(lista) {
  const cont = $("precioConsultaSugerencias");
  if (!cont) return;
  if (!lista.length) {
    ocultarSugerenciasPrincipal();
    return;
  }

  cont.innerHTML = lista
    .map(
      (producto, index) => `
        <button type="button" class="precios-main-suggestion" data-precio-sugerencia="${index}">
          <span aria-hidden="true"><svg class="app-icon"><use href="#icon-tag"></use></svg></span>
          <span><strong>${esc(producto.articulo)}</strong><small>Código: ${esc(producto.codigo || "Sin código")}</small></span>
          <i aria-hidden="true">›</i>
        </button>`,
    )
    .join("");
  cont.classList.remove("oculto");

  cont.querySelectorAll("[data-precio-sugerencia]").forEach((button) => {
    button.addEventListener("click", () => {
      const producto = lista[Number(button.dataset.precioSugerencia)];
      if (!producto) return;
      const input = $("precioConsultaInput");
      if (input) input.value = producto.articulo;
      ocultarSugerenciasPrincipal();
      guardarUltimo(producto);
    });
  });
}

function toast(texto) {
  window.dispatchEvent(
    new CustomEvent("autoservicio-toast", { detail: { texto } }),
  );
}

async function ejecutarBusquedaPrincipal() {
  const input = $("precioConsultaInput");
  const consulta = String(input?.value || "").trim();
  if (consulta.length < 2) {
    ocultarSugerenciasPrincipal();
    toast("Escribí al menos 2 caracteres");
    return;
  }

  try {
    await cargarProductos();
  } catch (_) {
    toast("No se pudieron cargar los productos");
    return;
  }

  const consultaLower = consulta.toLowerCase();
  const exacto = productos.find(
    (p) =>
      p.codigo === consulta ||
      String(p.articulo || "").trim().toLowerCase() === consultaLower,
  );
  if (exacto) {
    ocultarSugerenciasPrincipal();
    guardarUltimo(exacto);
    return;
  }

  const lista = buscar(consulta, 6);
  if (!lista.length) {
    ocultarSugerenciasPrincipal();
    toast("Producto no encontrado");
    return;
  }
  if (lista.length === 1) {
    ocultarSugerenciasPrincipal();
    guardarUltimo(lista[0]);
    return;
  }
  renderSugerenciasPrincipal(lista);
}

function limpiarSugerencias() {
  const cont = $("precioManualSugerencias");
  if (!cont) return;
  cont.innerHTML = "";
  cont.classList.add("oculto");
}

async function renderSugerencias() {
  const cont = $("precioManualSugerencias");
  const input = $("precioManualInput");
  if (!cont || !input) return;

  const consulta = String(input.value || "").trim();
  if (consulta.length < 2) {
    limpiarSugerencias();
    return;
  }

  try {
    await cargarProductos();
  } catch (_) {}
  const lista = buscar(consulta, 5);
  cont.innerHTML = "";

  if (!lista.length) {
    cont.innerHTML =
      '<div class="manual-no-results">No se encontraron productos.</div>';
    cont.classList.remove("oculto");
    return;
  }

  lista.forEach((producto) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "manual-suggestion-item";

    const nombre = document.createElement("strong");
    nombre.textContent = producto.articulo || "Sin descripción";
    const codigo = document.createElement("span");
    codigo.textContent = producto.codigo || "Sin código";

    button.append(nombre, codigo);
    button.addEventListener("click", () => seleccionarEnModal(producto));
    cont.appendChild(button);
  });
  cont.classList.remove("oculto");
}

function establecerModoCargaPrecios(modo = "scanner") {
  const manual = establecerModoCargaProducto({
    inicio: "preciosActionsCard",
    panelManual: "precioManualPanel",
    botonManual: "btnPrecioManualToggle",
    error: "precioCameraError",
    modo,
    limpiarInput: () => {
      const input = $("precioManualInput");
      if (input) input.value = "";
    },
    limpiarSugerencias,
    enfocarInput: () => $("precioManualInput")?.focus(),
  });
  $("precioCameraCard")?.classList.add("oculto");
  return manual;
}

function mostrarInicioModal() {
  establecerModoCargaPrecios("scanner");
}

function abrirModalConsulta(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!moduloPreciosActivo) return;
  detenerScanner(false);
  mostrarInicioModal();
  const modal = $("precioConsultaModal");
  modal?.classList.remove("oculto");
  modal?.setAttribute("aria-hidden", "false");
  $("preciosFab")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("precio-scan-open");
  const sheet = modal?.querySelector?.(".precio-scan-sheet");
  if (sheet) sheet.scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => iniciarScanner()));
}

function cerrarModalConsulta() {
  detenerScanner(false);
  mostrarInicioModal();
  $("precioConsultaModal")?.classList.add("oculto");
  $("precioConsultaModal")?.setAttribute("aria-hidden", "true");
  $("preciosFab")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("precio-scan-open");
}

function seleccionarEnModal(producto) {
  if (!producto) return;
  const seleccionado = normalizarProducto(producto);
  guardarUltimo(seleccionado);
  cerrarModalConsulta();
  toast("Precio consultado");
}

async function buscarCodigo(codigo) {
  try {
    await cargarProductos();
    const buscado = String(codigo || "").trim();
    const producto = productos.find((item) => item.codigo === buscado);
    if (producto) {
      seleccionarEnModal(producto);
      return;
    }
    establecerModoCargaPrecios("scanner");
    mostrarErrorCargaProducto(
      "precioCameraError",
      "No se encontró el producto. Probá con el ingreso manual.",
    );
  } catch (_) {
    establecerModoCargaPrecios("scanner");
    mostrarErrorCargaProducto(
      "precioCameraError",
      "No se pudieron cargar los productos. Intentá nuevamente.",
    );
  }
}

async function iniciarScanner() {
  detenerScanner(false);
  establecerModoCargaPrecios("scanner");
  $("preciosActionsCard")?.classList.add("oculto");
  $("precioCameraCard")?.classList.remove("oculto");
  scannerActivo = true;

  try {
    await iniciarScannerCompartido("videoPrecios", (codigo) => {
      if (!scannerActivo) return;
      buscarCodigo(codigo);
    });
  } catch (error) {
    scannerActivo = false;
    $("precioCameraCard")?.classList.add("oculto");
    establecerModoCargaPrecios("scanner");
    mostrarErrorCargaProducto("precioCameraError", PRODUCT_LOADER_CAMERA_ERROR);
    console.error(error);
  }
}

function detenerScanner(restaurarAcciones = true) {
  scannerActivo = false;
  detenerScannerCompartido();
  $("precioCameraCard")?.classList.add("oculto");
  if (restaurarAcciones) $("preciosActionsCard")?.classList.remove("oculto");
}

async function abrirManualDesdeScanner() {
  detenerScanner(true);
  await cargarProductos().catch(() => {});
  establecerModoCargaPrecios("manual");
}

function actualizarFab() {
  const fab = $("preciosFab");
  fab?.classList.toggle("oculto", !moduloPreciosActivo);
  fab?.style.removeProperty("pointer-events");
}

async function activar() {
  moduloPreciosActivo = true;
  historialExpandido = false;
  renderUltimo(leerUltimo());
  renderRecientes();
  actualizarFab();
  cargarProductos().catch(() => {});
}

function reiniciarModuloPrecios() {
  cerrarModalConsulta();
  ocultarSugerenciasPrincipal();
  historialExpandido = false;
  const buscador = $("precioConsultaInput");
  if (buscador) buscador.value = "";
  const manual = $("precioManualInput");
  if (manual) manual.value = "";
  renderUltimo(leerUltimo());
  renderRecientes();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function desactivar() {
  moduloPreciosActivo = false;
  cerrarModalConsulta();
  ocultarSugerenciasPrincipal();
  actualizarFab();
}

function init() {
  precargarCatalogo();

  $("preciosFab")?.addEventListener("click", abrirModalConsulta);
  $("btnPrecioCargarDesktop")?.addEventListener("click", abrirModalConsulta);
  $("btnPrecioConsultaBuscar")?.addEventListener("click", ejecutarBusquedaPrincipal);
  $("precioConsultaInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") ejecutarBusquedaPrincipal();
    if (event.key === "Escape") ocultarSugerenciasPrincipal();
  });
  $("precioConsultaInput")?.addEventListener("input", () => {
    if (String($("precioConsultaInput")?.value || "").trim().length < 2)
      ocultarSugerenciasPrincipal();
  });

  $("btnPrecioHistorialToggle")?.addEventListener("click", () => {
    historialExpandido = !historialExpandido;
    renderRecientes();
  });

  $("btnPrecioCerrarModal")?.addEventListener("click", cerrarModalConsulta);
  $("precioConsultaModal")
    ?.querySelector("[data-precio-modal-close]")
    ?.addEventListener("click", cerrarModalConsulta);

  $("btnPrecioAbrirScanner")?.addEventListener("click", iniciarScanner);
  $("btnPrecioManualDesdeScanner")?.addEventListener("click", abrirManualDesdeScanner);

  $("btnPrecioManualToggle")?.addEventListener("click", async () => {
    const manualActivo = $("preciosActionsCard")?.classList.contains("manual-active");
    detenerScanner(true);
    if (!manualActivo) {
      await cargarProductos().catch(() => {});
      establecerModoCargaPrecios("manual");
      return;
    }
    establecerModoCargaPrecios("scanner");
    requestAnimationFrame(() => iniciarScanner());
  });

  $("precioManualInput")?.addEventListener("input", renderSugerencias);
  $("precioManualInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const resultados = buscar(event.currentTarget.value, 5);
    if (resultados.length === 1) seleccionarEnModal(resultados[0]);
    else renderSugerencias();
  });

  $("btnPrecioBuscarManual")?.addEventListener("click", () => {
    const resultados = buscar($("precioManualInput")?.value, 5);
    if (resultados.length === 1) seleccionarEnModal(resultados[0]);
    else renderSugerencias();
  });

  document.addEventListener("click", (event) => {
    const panel = $("precioConsultaSugerencias");
    const search = event.target.closest?.(".precios-search-panel");
    if (panel && !search) ocultarSugerenciasPrincipal();
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !$("precioConsultaModal")?.classList.contains("oculto")
    ) {
      cerrarModalConsulta();
    }
  });

  window.addEventListener("autoservicio:sesion", () => {
    historialExpandido = false;
    renderUltimo(leerUltimo());
    renderRecientes();
  });
}

init();
window.PreciosModule = {
  activar,
  desactivar,
  reiniciar: reiniciarModuloPrecios,
};
