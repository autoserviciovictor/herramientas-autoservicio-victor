import { API_BASE_URL, APP_VERSION_LABEL } from "./config.js?v=1960-d21-auditoria-correcciones-260826-d";
import {
  cargarProductosDesdeServidor,
  sincronizarProductosDesdeServidor,
  obtenerProductoActualizadoPorCodigo,
  buscarProductoPorCodigo,
  buscarProductosPorTexto,
  obtenerProductosCargados,
  guardarCantidadEnProducto,
  modificarStockProducto,
  obtenerCantidadProductos,
  obtenerConteosUbicacion,
  listarVencimientos,
  guardarVencimiento,
  cargarCatalogoMaestroDesdeServidor,
  buscarProductoMaestroLocalPorCodigo,
  buscarProductosMaestrosPorTexto,
  buscarProductoMaestroPorCodigo,
  asegurarProductoInventarioLocalDesdeMaestro,
  actualizarVencimiento,
  eliminarVencimiento,
  actualizarOfertaVencimiento,
} from "./excel.js?v=1960-d21-auditoria-correcciones-260826-d";

import { iniciarScanner, detenerScanner } from "./scanner.js?v=1960-d21-auditoria-correcciones-260826-d";
import {
  PRODUCT_LOADER_CAMERA_ERROR,
  establecerModoCargaProducto,
  limpiarErrorCargaProducto,
  mostrarErrorCargaProducto,
} from "./product-loader.js?v=1960-d21-auditoria-correcciones-260826-d";

import {
  ocultarSplash,
  cambiarPantalla,
  mostrarMensaje,
  actualizarEstadoCamara,
  actualizarUbicacion,
  mostrarProducto,
  mostrarProductoNoEncontrado,
  limpiarProducto,
  activarBotonGuardar,
  configurarFeedback,
  reproducirConfirmacion,
  renderResultadosBusqueda,
  mostrarEditorStock,
  ocultarEditorStock,
  actualizarTotalEditor,
  obtenerValoresEditor,
  activarModoCantidad,
  desactivarModoCantidad,
  actualizarConteosUbicacion,
} from "./ui.js?v=1960-d21-auditoria-correcciones-260826-d";

import {
  inicializarReposicion,
  refrescarReposicion,
  prepararReposicion,
  resolverSalidaReposicion,
  reiniciarReposicion,
} from "./reposicion.js?v=1960-d21-auditoria-correcciones-260826-d";
import { coincideBusqueda } from "./search.js?v=1960-d21-auditoria-correcciones-260826-d";
import { escapeHTML } from "./shared/dom-utils.js?v=1960-d21-auditoria-correcciones-260826-d";

let ubicacionActual = "salon";
let productoActual = null;
let productoEditando = null;
let scannerActivo = false;
let tabProductosActual = "cargados";
let guardando = false;
let corrigiendo = false;
let sincronizando = false;
let sincronizacionAutomatica = null;
let productoVencimientoActual = null;
let guardandoVencimiento = false;
let vencimientosCache = [];
let filtroVencimientos = "todos";
let filtroRubroVencimientos = "todos";
let busquedaVencimientos = "";
let ordenVencimientos = "proximo";
let vistaVencimientos = "grid";
const gruposVencimientosAbiertos = new Set(["7"]);
let vencimientoSeleccionado = null;
let vencTabActual = "cargar";
let vencTabRetornoCarga = "cargar";
const INTERVALO_SINCRONIZACION = 7000;
let pantallaActualApp = "inicio";
let inventarioRetornoCarga = "cargados";
let snapshotProductoEditando = null;
let snapshotVencimientoEditando = null;
let resolucionCambiosPendientes = null;
let resumenInicioUltimaCarga = 0;
let resumenInicioPromesa = null;
let resumenInicioDatosActuales = null;
const RESUMEN_INICIO_TTL = 30000;

const $ = (id) => document.getElementById(id);

const elementos = {
  inventarioFab: $("inventarioFab"),
  btnInventarioCargarDesktop: $("btnInventarioCargarDesktop"),
  inventarioCargaModal: $("inventarioCargaModal"),
  btnManualDesdeScanner: $("btnManualDesdeScanner"),
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
  buscadorProducto: $("buscadorProducto"),
  btnVolverProductos: $("btnVolverProductos"),
  editarSalon: $("editarSalon"),
  editarDeposito: $("editarDeposito"),
  btnMenosSalon: $("btnMenosSalon"),
  btnMasSalon: $("btnMasSalon"),
  btnMenosDeposito: $("btnMenosDeposito"),
  btnMasDeposito: $("btnMasDeposito"),
  btnGuardarCorreccion: $("btnGuardarCorreccion"),
  btnEliminarStockInventario: $("btnEliminarStockInventario"),
  inventarioCameraError: $("inventarioCameraError"),
  vencimientosFab: $("vencimientosFab"),
  vencCargaModal: $("vencCargaModal"),
  vencScanStart: $("vencScanStart"),
  btnVencCerrarModal: $("btnVencCerrarModal"),
  btnVencManualDesdeScanner: $("btnVencManualDesdeScanner"),
  btnVencAbrirScanner: $("btnVencAbrirScanner"),
  btnVencManualToggle: $("btnVencManualToggle"),
  vencManualPanel: $("vencManualPanel"),
  vencCodigoManualInput: $("vencCodigoManualInput"),
  btnVencBuscarManual: $("btnVencBuscarManual"),
  vencManualSugerencias: $("vencManualSugerencias"),
  vencCameraCard: $("vencCameraCard"),
  vencCameraError: $("vencCameraError"),
  vencProductoCard: $("vencProductoCard"),
  vencEstadoProducto: $("vencEstadoProducto"),
  vencNombreProducto: $("vencNombreProducto"),
  vencCodigoProducto: $("vencCodigoProducto"),
  vencFormCard: $("vencFormCard"),
  vencFechaInput: $("vencFechaInput"),
  vencCantidadInput: $("vencCantidadInput"),
  vencTotalTexto: $("vencTotalTexto"),
  btnVencGuardar: $("btnVencGuardar"),
  btnVencCancelarCarga: $("btnVencCancelarCarga"),
  vencListado: $("vencListado"),
  vencBuscador: $("vencBuscador"),
  vencResumen: $("vencResumen"),
  vencListadoTitulo: $("vencListadoTitulo"),
  vencTabBtns: document.querySelectorAll("[data-venc-tab]"),
  vencModal: $("vencModal"),
  vencModalEditar: $("vencModalEditar"),
  vencModalEliminar: $("vencModalEliminar"),
  btnVencModalCerrar: $("btnVencModalCerrar"),
  btnVencEliminarAbrir: $("btnVencEliminarAbrir"),
  btnVencGuardarEdicion: $("btnVencGuardarEdicion"),
  btnVencConfirmarEliminar: $("btnVencConfirmarEliminar"),
  btnVencCancelarEliminar: $("btnVencCancelarEliminar"),
  vencEditFechaInput: $("vencEditFechaInput"),
  vencEditCantidadInput: $("vencEditCantidadInput"),
  vencEditTotalTexto: $("vencEditTotalTexto"),
};

function asegurarUIRubrosVencimientos() {
  const edit = $("vencModalEditar");
  if (edit && !$("vencEditError")) {
    const error = document.createElement("div");
    error.id = "vencEditError";
    error.className = "venc-edit-error oculto";
    error.setAttribute("role", "alert");
    edit.appendChild(error);
  }

  const bar = $("vencRubrosFiltros");
  if (bar && bar.dataset.ready !== "1") {
    bar.dataset.ready = "1";
    bar.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-venc-rubro]");
      if (!btn) return;
      const valor = btn.dataset.vencRubro || "todos";
      filtroRubroVencimientos = valor || "todos";
      filtroVencimientos = "todos";
      bar.querySelectorAll("[data-venc-rubro]").forEach((b) => {
        b.classList.toggle(
          "activo",
          (b.dataset.vencRubro || "todos") === filtroRubroVencimientos,
        );
      });
      actualizarEtiquetaFiltros();
      renderListadoVencimientos();
    });
  }

  document.querySelectorAll("[data-venc-edit-oferta]").forEach((btn) => {
    if (btn.dataset.ready === "1") return;
    btn.dataset.ready = "1";
    btn.addEventListener("click", () => {
      establecerOfertaEdicionVencimiento(btn.dataset.vencEditOferta || "sin");
    });
  });
}

function obtenerMenuSelectApp(wrapper) {
  return wrapper?._appSelectMenu || wrapper?.querySelector(".app-select-custom__menu") || null;
}

function restaurarMenuSelectApp(wrapper) {
  if (!wrapper) return;
  const menu = obtenerMenuSelectApp(wrapper);
  if (!menu) return;
  menu.classList.remove("is-portal", "is-open", "opens-up");
  menu.style.removeProperty("left");
  menu.style.removeProperty("right");
  menu.style.removeProperty("top");
  menu.style.removeProperty("bottom");
  menu.style.removeProperty("width");
  menu.style.removeProperty("max-height");
  menu.style.removeProperty("position");
  if (menu.parentNode !== wrapper) wrapper.appendChild(menu);
}

function cerrarSelectsApp(excepto = null) {
  document.querySelectorAll(".app-select-custom.is-open").forEach((custom) => {
    if (custom === excepto) return;
    custom.classList.remove("is-open", "opens-up");
    custom
      .querySelector(".app-select-custom__trigger")
      ?.setAttribute("aria-expanded", "false");
    restaurarMenuSelectApp(custom);
  });
}

function sincronizarSelectApp(select) {
  const custom = select?.closest(".app-select-custom");
  if (!select || !custom) return;
  const trigger = custom.querySelector(".app-select-custom__trigger");
  const text = trigger?.querySelector(".app-select-custom__value");
  const opcion = select.options[select.selectedIndex];
  if (text) text.textContent = opcion?.textContent?.trim() || "Seleccionar";
  if (trigger) {
    trigger.disabled = Boolean(select.disabled);
    trigger.setAttribute("aria-disabled", select.disabled ? "true" : "false");
    trigger.classList.toggle("is-placeholder", !select.value);
  }
  custom.classList.toggle("is-disabled", Boolean(select.disabled));
  obtenerMenuSelectApp(custom)?.querySelectorAll(".app-select-custom__option").forEach((btn) => {
    const selected = btn.dataset.value === select.value;
    btn.classList.toggle("is-selected", selected);
    btn.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

function reconstruirOpcionesSelectApp(select) {
  const custom = select?.closest(".app-select-custom");
  const menu = obtenerMenuSelectApp(custom);
  if (!select || !custom || !menu) return;
  menu.replaceChildren();
  Array.from(select.options).forEach((opcion) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-select-custom__option";
    btn.dataset.value = opcion.value;
    btn.setAttribute("role", "option");
    btn.textContent = opcion.textContent.trim();
    btn.disabled = Boolean(opcion.disabled);
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      select.value = btn.dataset.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sincronizarSelectApp(select);
      cerrarSelectsApp();
    });
    menu.appendChild(btn);
  });
  sincronizarSelectApp(select);
}

function sincronizarSelectAppPorId(id) {
  sincronizarSelectApp($(id));
}

function posicionarMenuSelectApp(wrapper) {
  if (!wrapper?.classList.contains("is-open")) return;
  const trigger = wrapper.querySelector(".app-select-custom__trigger");
  const menu = obtenerMenuSelectApp(wrapper);
  if (!trigger || !menu) return;

  if (menu.parentNode !== document.body) document.body.appendChild(menu);
  menu.classList.add("is-portal");

  wrapper.classList.remove("opens-up");
  menu.classList.remove("opens-up");
  const triggerRect = trigger.getBoundingClientRect();
  const margenViewport = 8;
  const separacion = 6;
  const anchoDisponible = Math.max(120, window.innerWidth - margenViewport * 2);
  const anchoMenu = Math.min(Math.max(triggerRect.width, 120), anchoDisponible);
  const izquierda = Math.min(
    Math.max(margenViewport, triggerRect.left),
    Math.max(margenViewport, window.innerWidth - margenViewport - anchoMenu),
  );
  const altoDeseado = Math.min(menu.scrollHeight || 0, 260);
  const espacioAbajo = Math.max(0, window.innerHeight - triggerRect.bottom - separacion - margenViewport);
  const espacioArriba = Math.max(0, triggerRect.top - separacion - margenViewport);
  const abreArriba = altoDeseado > espacioAbajo && espacioArriba > espacioAbajo;
  const espacioElegido = abreArriba ? espacioArriba : espacioAbajo;
  const altoMaximo = Math.max(72, Math.min(260, espacioElegido));

  if (abreArriba) {
    wrapper.classList.add("opens-up");
    menu.classList.add("opens-up");
  } else {
    wrapper.classList.remove("opens-up");
    menu.classList.remove("opens-up");
  }
  menu.style.position = "fixed";
  menu.style.left = `${Math.round(izquierda)}px`;
  menu.style.right = "auto";
  menu.style.width = `${Math.round(anchoMenu)}px`;
  menu.style.maxHeight = `${Math.round(altoMaximo)}px`;
  if (abreArriba) {
    menu.style.top = "auto";
    menu.style.bottom = `${Math.round(window.innerHeight - triggerRect.top + separacion)}px`;
  } else {
    menu.style.bottom = "auto";
    menu.style.top = `${Math.round(triggerRect.bottom + separacion)}px`;
  }
  menu.classList.add("is-open");
}

function configurarSelectApp(id) {
  const select = $(id);
  if (!select || select.dataset.customReady === "1") return;
  select.dataset.customReady = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "app-select-custom";
  wrapper.dataset.selectId = id;
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add("app-select-custom__native");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "app-select-custom__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute(
    "aria-label",
    select.getAttribute("aria-label") || "Seleccionar opción",
  );
  trigger.innerHTML = `<span class="app-select-custom__value"></span><span class="app-select-custom__chevron" aria-hidden="true"><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></span>`;

  const menu = document.createElement("div");
  menu.className = "app-select-custom__menu";
  menu.setAttribute("role", "listbox");
  wrapper._appSelectMenu = menu;

  trigger.addEventListener("click", () => {
    const abrir = !wrapper.classList.contains("is-open");
    cerrarSelectsApp(wrapper);
    wrapper.classList.toggle("is-open", abrir);
    if (!abrir) {
      wrapper.classList.remove("opens-up");
      restaurarMenuSelectApp(wrapper);
    }
    trigger.setAttribute("aria-expanded", abrir ? "true" : "false");
    if (abrir) requestAnimationFrame(() => posicionarMenuSelectApp(wrapper));
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      wrapper.classList.remove("is-open", "opens-up");
      trigger.setAttribute("aria-expanded", "false");
      restaurarMenuSelectApp(wrapper);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
    if ((event.key === "Enter" || event.key === " ") && !wrapper.classList.contains("is-open")) return;
    event.preventDefault();
    if (!wrapper.classList.contains("is-open")) {
      cerrarSelectsApp(wrapper);
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => posicionarMenuSelectApp(wrapper));
    }
    const disponibles = [...menu.querySelectorAll(".app-select-custom__option:not(:disabled)")];
    if (!disponibles.length) return;
    const actual = document.activeElement?.classList?.contains("app-select-custom__option")
      ? document.activeElement
      : menu.querySelector(".app-select-custom__option.is-selected:not(:disabled)");
    let indice = Math.max(0, disponibles.indexOf(actual));
    if (event.key === "ArrowDown") indice = Math.min(disponibles.length - 1, indice + (actual ? 1 : 0));
    if (event.key === "ArrowUp") indice = Math.max(0, indice - 1);
    if (event.key === "Home") indice = 0;
    if (event.key === "End") indice = disponibles.length - 1;
    if ((event.key === "Enter" || event.key === " ") && actual) {
      actual.click();
      trigger.focus();
      return;
    }
    requestAnimationFrame(() => disponibles[indice]?.focus());
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cerrarSelectsApp();
      trigger.focus();
      return;
    }
    const disponibles = [...menu.querySelectorAll(".app-select-custom__option:not(:disabled)")];
    const indiceActual = disponibles.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      let indice = Math.max(0, indiceActual);
      if (event.key === "ArrowDown") indice = Math.min(disponibles.length - 1, indice + 1);
      if (event.key === "ArrowUp") indice = Math.max(0, indice - 1);
      if (event.key === "Home") indice = 0;
      if (event.key === "End") indice = disponibles.length - 1;
      disponibles[indice]?.focus();
    }
  });

  select.addEventListener("change", () => sincronizarSelectApp(select));
  wrapper.append(trigger, menu);
  reconstruirOpcionesSelectApp(select);
  new MutationObserver(() => reconstruirOpcionesSelectApp(select)).observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "label", "selected"],
  });
}

function configurarSelectsVencimientos() {
  [
    "vencOrdenSelect",
    "vencRubroInput",
    "vencEditRubroInput",
  ].forEach(configurarSelectApp);
}

function configurarSelectsAdministracion() {
  [
    "adminUsuariosFiltroEstado",
    "adminUsuariosFiltroSector",
    "adminUsuariosFiltroRol",
    "adminUsuariosMinModulos",
    "adminUsuariosAccionMasiva",
    "adminUsuariosOrden",
    "adminUsuariosPorPagina",
    "adminSectoresFiltroEstado",
    "adminHistorialUsuario",
    "adminHistorialAccion",
    "adminHistorialPorPagina",
  ].forEach(configurarSelectApp);
}

window.AppSelect = Object.assign(window.AppSelect || {}, {
  enhance: configurarSelectApp,
  refresh: (idOrSelect) => {
    const select = typeof idOrSelect === "string" ? $(idOrSelect) : idOrSelect;
    reconstruirOpcionesSelectApp(select);
  },
  closeAll: cerrarSelectsApp,
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".app-select-custom, .app-select-custom__menu.is-portal")) cerrarSelectsApp();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") cerrarSelectsApp();
});

const reposicionarSelectsAppAbiertos = () => {
  document.querySelectorAll(".app-select-custom.is-open").forEach(posicionarMenuSelectApp);
};
window.addEventListener("resize", reposicionarSelectsAppAbiertos, { passive: true });
document.addEventListener("scroll", reposicionarSelectsAppAbiertos, true);

function normalizarRubroFiltro(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

asegurarUIRubrosVencimientos();
configurarSelectsVencimientos();
configurarSelectsAdministracion();
inicializar();

window.addEventListener("autoservicio:sesion", () => {
  resumenInicioUltimaCarga = 0;
  if (document.body.dataset.screen === "inicio")
    actualizarResumenInicio({ forzar: true });

  // Si la app arrancó sin sesión, la copia local de Inventario está vacía.
  // Una vez autenticado, cargar siempre los datos reales del servidor.
  if (window.AutoservicioAuth?.puedeVerModulo?.("inventario")) {
    cargarProductos().catch((error) =>
      console.warn("No se pudo recargar Inventario después del login:", error),
    );
  }
});
window.addEventListener("autoservicio:sincronizado", () => {
  resumenInicioUltimaCarga = 0;
  if (document.body.dataset.screen === "inicio")
    actualizarResumenInicio({ forzar: true });
});
window.addEventListener("focus", () => {
  if (document.body.dataset.screen === "inicio") actualizarResumenInicio();
});

let navegacionInternaActiva = false;

function moduloDePantalla(nombre = pantallaActualApp) {
  if (
    ["inventario", "productos", "cargados", "editarProducto"].includes(nombre)
  )
    return "inventario";
  if (nombre === "bano") return "tareas";
  return nombre;
}

function actualizarFabInventario() {
  const visible = pantallaActualApp === "cargados";
  elementos.inventarioFab?.classList.toggle("oculto", !visible);
}

function establecerModoCargaInventario(modo = "scanner") {
  return establecerModoCargaProducto({
    inicio: elementos.scanPanel,
    panelManual: elementos.manualPanel,
    botonManual: elementos.btnCodigoManualToggle,
    error: elementos.inventarioCameraError,
    modo,
    limpiarInput: () => {
      if (elementos.codigoManualInput) elementos.codigoManualInput.value = "";
    },
    limpiarSugerencias: () => limpiarSugerenciasManual("inventario"),
    enfocarInput: () => elementos.codigoManualInput?.focus(),
  });
}

function resetearCargaInventario() {
  cerrarScanner(false);
  productoActual = null;
  elementos.inventarioCargaModal?.classList.remove("inventory-has-product");
  if (elementos.cantidadInput) elementos.cantidadInput.value = 1;
  activarBotonGuardar(false);
  desactivarModoCantidad();
  limpiarProducto("Esperando escaneo...");
  establecerModoCargaInventario("scanner");
  mostrarScannerCerrado();
}

async function abrirCargaInventario() {
  if (pantallaActualApp !== "cargados") return;
  inventarioRetornoCarga = pantallaActualApp;
  resetearCargaInventario();
  try {
    await cargarCatalogoMaestroDesdeServidor();
  } catch (error) {
    console.warn("No se pudo precargar el catálogo maestro para Inventario", error);
  }
  elementos.inventarioCargaModal?.classList.remove("oculto");
  elementos.inventarioCargaModal?.setAttribute("aria-hidden", "false");
  elementos.inventarioFab?.setAttribute("aria-expanded", "true");
  document.body.classList.add("inventory-scan-open");

  // Esperamos a que el modal quede visible antes de pedir la cámara.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      abrirScannerManual();
    });
  });
}

function abrirIngresoManualDesdeScanner() {
  cerrarScanner(true);
  establecerModoCargaInventario("manual");
}

function cerrarCargaInventario(mensaje = "") {
  resetearCargaInventario();
  elementos.inventarioCargaModal?.classList.add("oculto");
  elementos.inventarioCargaModal?.setAttribute("aria-hidden", "true");
  elementos.inventarioFab?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("inventory-scan-open");
  if (mensaje) mostrarMensaje(mensaje, "ok");
}

function reiniciarEstadoModulo(modulo) {
  if (!modulo || modulo === "inicio") return;
  if (modulo === "inventario") {
    cerrarScanner(true);
    productoEditando = null;
    snapshotProductoEditando = null;
    tabProductosActual = "cargados";
    if (elementos.buscadorProducto) elementos.buscadorProducto.value = "";
    if (elementos.codigoManualInput) elementos.codigoManualInput.value = "";
    limpiarProducto();
    desactivarModoCantidad();
  }
  if (modulo === "vencimientos") {
    cerrarScannerVencimientos(false);
    if (elementos.vencBuscador) elementos.vencBuscador.value = "";
    if (elementos.vencCodigoManualInput)
      elementos.vencCodigoManualInput.value = "";
    busquedaVencimientos = "";
    filtroVencimientos = "todos";
    filtroRubroVencimientos = "todos";
    ordenVencimientos = "proximo";
    vistaVencimientos = "grid";
    gruposVencimientosAbiertos.clear();
    gruposVencimientosAbiertos.add("7");
    cambiarTabVencimientos("cargar");
  }
  if (modulo === "anotar") reiniciarReposicion?.();
  if (modulo === "precios") window.PreciosModule?.reiniciar?.();
  if (modulo === "horarios") window.HorariosModule?.reiniciar?.();
  if (modulo === "tareas") {
    if (pantallaActualApp === "bano") window.BanoModule?.reiniciar?.();
    else window.TareasModule?.reiniciar?.();
  }
  if (modulo === "admin") window.AdminModule?.reiniciar?.();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function intentarBloquearOrientacion() {
  try {
    if (
      screen.orientation?.lock &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        navigator.standalone)
    ) {
      screen.orientation.lock("portrait").catch(() => {});
    }
  } catch (_) {}
}

function registrarEstadoNavegacion(nombre, reemplazar = false) {
  const state = {
    autoservicio: true,
    pantalla: nombre,
    modulo: moduloDePantalla(nombre),
  };
  const fn = reemplazar ? "replaceState" : "pushState";
  history[fn](state, "", location.pathname + location.search);
}

function fechaHoyLocalIso() {
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}


function numeroVisibleResumen(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0
    ? Math.round(numero).toLocaleString("es-AR")
    : "—";
}

async function obtenerJsonResumen(ruta) {
  const respuesta = await fetch(`${API_BASE_URL}${ruta}`, {
    headers: { Accept: "application/json" },
  });
  const data = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || data?.ok === false)
    throw Object.assign(new Error(data?.mensaje || `No se pudo cargar ${ruta}`), {
      status: respuesta.status,
    });
  return data;
}

function minutosHoraResumen(valor) {
  const match = String(valor || "")
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?(?:\s*([AP]M))?$/);
  if (!match) return null;
  let hora = Number(match[1]);
  const minuto = Number(match[2] || 0);
  if (match[3] === "PM" && hora < 12) hora += 12;
  if (match[3] === "AM" && hora === 12) hora = 0;
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
  return hora * 60 + minuto;
}

function minutoDentroRangoResumen(actual, inicio, fin) {
  const desde = minutosHoraResumen(inicio);
  const hasta = minutosHoraResumen(fin);
  if (desde === null || hasta === null || desde === hasta) return false;
  return hasta > desde
    ? actual >= desde && actual < hasta
    : actual >= desde || actual < hasta;
}

function turnoActivoResumen(valorTurno, turnos = [], minutoActual) {
  const valor = String(valorTurno || "").trim();
  const clave = valor.toLowerCase();
  if (!clave || ["franco", "vacaciones", "ausente", "licencia"].includes(clave))
    return false;
  const configurado = turnos.find(
    (turno) => String(turno?.id || "").trim().toLowerCase() === clave,
  );
  if (configurado) {
    if (minutoDentroRangoResumen(minutoActual, configurado.inicio, configurado.fin))
      return true;
    return configurado.tipo === "cortado" &&
      minutoDentroRangoResumen(minutoActual, configurado.inicio2, configurado.fin2);
  }
  const directo = valor.match(
    /^\s*(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s*$/,
  );
  return directo
    ? minutoDentroRangoResumen(minutoActual, directo[1], directo[2])
    : false;
}

function minutoActualArgentinaResumen() {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const valor = (tipo) =>
    Number(partes.find((parte) => parte.type === tipo)?.value || 0);
  return valor("hour") * 60 + valor("minute");
}

function normalizarEmpleadoResumen(valor) {
  return String(valor || "").trim().toLowerCase().replace(/\s+/g, "");
}

function sumarDiasIsoResumen(fechaIso, dias) {
  const [y, m, d] = String(fechaIso).split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function fechasSemanaActualResumen() {
  const hoy = fechaHoyLocalIso();
  const [y, m, d] = hoy.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const diaSemana = fecha.getUTCDay();
  const lunes = sumarDiasIsoResumen(hoy, diaSemana === 0 ? -6 : 1 - diaSemana);
  return new Set(Array.from({ length: 7 }, (_, indice) => sumarDiasIsoResumen(lunes, indice)));
}

function normalizarFechaResumen(valor) {
  const texto = String(valor || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const match = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return texto;
  return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
}

function detalleTareasInicioDesdeApi(tareas = [], sectores = []) {
  const hoy = fechaHoyLocalIso();
  const listaSectores = Array.isArray(sectores) ? sectores : [];
  const detalles = [];
  for (const tarea of Array.isArray(tareas) ? tareas : []) {
    const asignaciones = tarea?.asignaciones || {};
    const asignacionesDia = asignaciones[hoy] || Object.entries(asignaciones).find(
      ([fecha]) => normalizarFechaResumen(fecha) === hoy,
    )?.[1];
    if (!asignacionesDia || typeof asignacionesDia !== "object") continue;
    for (const [turno, asignacion] of Object.entries(asignacionesDia)) {
      if (!asignacion || typeof asignacion !== "object") continue;
      detalles.push({
        id: tarea?.id,
        nombre: tarea?.nombre || "Tarea",
        sector: tarea?.sector || "General",
        turno,
        estado: String(asignacion?.estado || "").trim().toLowerCase() === "completada"
          ? "completada"
          : "pendiente",
        responsables: Array.isArray(asignacion?.responsables)
          ? asignacion.responsables.map((nombre) => String(nombre || "").trim()).filter(Boolean)
          : [],
      });
    }
  }
  return {
    sectoresTareasInicio: listaSectores.map((sector) => ({
      id: sector?.id || sector?.nombre || "",
      nombre: sector?.nombre || sector?.id || "Sector",
      color: sector?.color || "#718096",
    })),
    tareasHoyDetalle: detalles,
  };
}

async function completarDetalleInicio(resumenBase = {}) {
  const resumen = { ...(resumenBase || {}) };
  const puede = (modulo) =>
    window.AutoservicioAuth?.puedeVerModulo?.(modulo) !== false;
  const usuarioActual = window.AutoservicioAuth?.getUsuario?.() || {};
  const rol = String(usuarioActual?.rol || "").trim().toLowerCase();
  const puedeElegirSector = ["administrador", "administracion", "supervisor"].includes(rol);
  const trabajos = [];

  if (puede("vencimientos") && !Array.isArray(resumen.vencimientosHoyDetalle)) {
    trabajos.push(
      listarVencimientos()
        .then((vencimientos) => {
          const hoy = fechaHoyLocalIso();
          const items = (Array.isArray(vencimientos) ? vencimientos : [])
            .filter((item) => normalizarFechaResumen(item?.vencimiento) === hoy)
            .map((item) => ({
              id: item?.id,
              articulo: item?.articulo || item?.descripcion || "Sin descripción",
              codigo: item?.codigo || "",
              // listarVencimientos centraliza la compatibilidad de cantidad con
              // registros actuales y con el esquema anterior (total/salón/depósito).
              cantidad: Math.max(0, Number(item?.cantidad) || 0),
              rubro: item?.rubro || "Sin clasificar",
            }));
          resumen.vencimientosHoyDetalle = items;
          resumen.vencimientosHoy = items.length;
        })
        .catch(() => {
          resumen.vencimientosHoyDetalle = [];
        }),
    );
  }

  const faltaDetalleTareas =
    !Array.isArray(resumen.tareasHoyDetalle) ||
    !Array.isArray(resumen.sectoresTareasInicio);
  if (puede("tareas") && faltaDetalleTareas) {
    trabajos.push(
      Promise.all([obtenerJsonResumen("/tareas"), obtenerJsonResumen("/tareas/contexto")])
        .then(([dataTareas, contexto]) => {
          const derivado = detalleTareasInicioDesdeApi(
            dataTareas?.tareas || [],
            contexto?.sectores || [],
          );
          resumen.tareasHoyDetalle = derivado.tareasHoyDetalle;
          resumen.sectoresTareasInicio = derivado.sectoresTareasInicio;
          resumen.puedeElegirSectorTareasInicio = puedeElegirSector;
        })
        .catch(() => {
          resumen.tareasHoyDetalle = Array.isArray(resumen.tareasHoyDetalle)
            ? resumen.tareasHoyDetalle
            : [];
          resumen.sectoresTareasInicio = Array.isArray(resumen.sectoresTareasInicio)
            ? resumen.sectoresTareasInicio
            : [];
          resumen.puedeElegirSectorTareasInicio = puedeElegirSector;
        }),
    );
  }

  await Promise.all(trabajos);
  return resumen;
}

async function resumenInicioFallback() {
  const puede = (modulo) =>
    window.AutoservicioAuth?.puedeVerModulo?.(modulo) !== false;
  const resumen = {
    stockContado: null,
    vencimientosCriticos: null,
    personalEnTurno: null,
    tareasCompletadasHoy: null,
    tareasAsignadasHoy: null,
    tareasPorcentajeHoy: null,
    tareasCompletadasSemana: null,
    tareasAsignadasSemana: null,
    tareasPorcentajeSemana: null,
  };

  const trabajos = [];
  if (puede("inventario")) {
    trabajos.push(
      obtenerJsonResumen("/productos")
        .then((data) => {
          resumen.stockContado = (data.productos || []).filter(
            (producto) => Number(producto?.stock) > 0,
          ).length;
        })
        .catch(() => {}),
    );
  }
  if (puede("vencimientos")) {
    trabajos.push(
      obtenerJsonResumen("/vencimientos")
        .then((data) => {
          resumen.vencimientosCriticos = (data.vencimientos || []).filter((item) => {
            const dias = diasHastaVencimiento(item?.vencimiento);
            return Number.isFinite(dias) && dias >= 0 && dias <= 7;
          }).length;
        })
        .catch(() => {}),
    );
  }
  if (puede("horarios")) {
    trabajos.push(
      (async () => {
        try {
          const contexto = await obtenerJsonResumen("/horarios/contexto");
          const sectores = Array.isArray(contexto.sectores) ? contexto.sectores : [];
          const hoy = fechaHoyLocalIso();
          const mes = hoy.slice(0, 7);
          const dia = Number(hoy.slice(8, 10));
          const minutoActual = minutoActualArgentinaResumen();
          const respuestas = await Promise.allSettled(
            sectores.map((sector) =>
              obtenerJsonResumen(
                `/horarios/calendario?sector=${encodeURIComponent(sector.id)}&mes=${encodeURIComponent(mes)}`,
              ),
            ),
          );
          const presentes = new Set();
          respuestas.forEach((resultado) => {
            if (resultado.status !== "fulfilled") return;
            const data = resultado.value || {};
            const turnos = Array.isArray(data.turnos) ? data.turnos : [];
            (data.celdas || [])
              .filter((celda) => Number(celda?.dia) === dia)
              .forEach((celda) => {
                if (!turnoActivoResumen(celda.turno, turnos, minutoActual)) return;
                const empleado = normalizarEmpleadoResumen(celda.empleado);
                if (empleado) presentes.add(empleado);
              });
          });
          resumen.personalEnTurno = presentes.size;
        } catch {}
      })(),
    );
  }
  if (puede("tareas")) {
    trabajos.push(
      obtenerJsonResumen("/tareas")
        .then((data) => {
          const fechas = fechasSemanaActualResumen();
          let total = 0;
          let completadas = 0;
          (data.tareas || []).forEach((tarea) => {
            Object.entries(tarea?.asignaciones || {}).forEach(([fecha, asignacionesDia]) => {
              if (!fechas.has(fecha) || !asignacionesDia || typeof asignacionesDia !== "object")
                return;
              Object.values(asignacionesDia).forEach((asignacion) => {
                const responsables = Array.isArray(asignacion?.responsables)
                  ? asignacion.responsables.filter((nombre) => String(nombre || "").trim())
                  : [];
                total += responsables.length;
                if (String(asignacion?.estado || "").trim().toLowerCase() === "completada")
                  completadas += responsables.length;
              });
            });
          });
          resumen.tareasAsignadasSemana = total;
          resumen.tareasCompletadasSemana = completadas;
          resumen.tareasPorcentajeSemana = total
            ? Math.round((completadas / total) * 100)
            : 0;

          const hoy = fechaHoyLocalIso();
          let totalHoy = 0;
          let completadasHoy = 0;
          (data.tareas || []).forEach((tarea) => {
            const asignacionesDia = tarea?.asignaciones?.[hoy] || Object.entries(tarea?.asignaciones || {}).find(([fecha]) => normalizarFechaResumen(fecha) === hoy)?.[1];
            if (!asignacionesDia || typeof asignacionesDia !== "object") return;
            Object.values(asignacionesDia).forEach((asignacion) => {
              if (!asignacion || typeof asignacion !== "object") return;
              totalHoy += 1;
              if (String(asignacion?.estado || "").trim().toLowerCase() === "completada") completadasHoy += 1;
            });
          });
          resumen.tareasAsignadasHoy = totalHoy;
          resumen.tareasCompletadasHoy = completadasHoy;
          resumen.tareasPorcentajeHoy = totalHoy ? Math.round((completadasHoy / totalHoy) * 100) : 0;
        })
        .catch(() => {}),
    );
  }

  await Promise.all(trabajos);
  return resumen;
}


const TEXTO_BANO_INICIO_DEFAULT =
  "Controlá la rotación, responsables y confirmaciones de limpieza.";

function diasEntreIsoResumen(desde, hasta) {
  const parse = (valor) => {
    const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const a = parse(desde), b = parse(hasta);
  return a == null || b == null ? null : Math.floor((b - a) / 86400000);
}

async function actualizarResponsableBanoInicio() {
  const estado = $("proBathroomStatus");
  if (!estado || window.AutoservicioAuth?.puedeVerModulo?.("tareas") === false) return;
  estado.textContent = TEXTO_BANO_INICIO_DEFAULT;
  try {
    const [bano, usuarios] = await Promise.all([
      obtenerJsonResumen("/tareas/bano"),
      obtenerJsonResumen("/tareas/usuarios"),
    ]);
    const cfg = bano?.config || {};
    const participantes = Array.isArray(cfg.participantes)
      ? cfg.participantes.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (!participantes.length) return;

    const hoy = fechaHoyLocalIso();
    const ancla = String(cfg.fechaAncla || cfg.fechaInicio || hoy);
    const dias = diasEntreIsoResumen(ancla, hoy);
    if (!Number.isFinite(dias) || ((dias % 2) + 2) % 2 !== 0) return;

    const turno = Math.floor(dias / 2);
    const indice = ((turno % participantes.length) + participantes.length) % participantes.length;
    const clave = participantes[indice];
    const listaUsuarios = Array.isArray(usuarios?.usuarios) ? usuarios.usuarios : [];
    const usuarioAsignado = listaUsuarios.find(
      (u) => String(u?.usuario || "").trim().toLowerCase() === clave.toLowerCase(),
    );
    const nombre = String(usuarioAsignado?.nombre || usuarioAsignado?.usuario || clave).trim();
    if (nombre) estado.textContent = `Hoy le toca limpiar a ${nombre}.`;
  } catch (_) {
    // El banner conserva el texto neutro si el resumen de baño no está disponible.
  }
}

function claveSectorResumen(valor) {
  return String(valor || "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function renderVencimientosHoyInicio(resumen = {}) {
  const box = $("proHomeVencimientosHoy");
  if (!box) return;
  const items = Array.isArray(resumen.vencimientosHoyDetalle)
    ? resumen.vencimientosHoyDetalle
    : [];
  if (!items.length) {
    box.innerHTML = `<div class="pro-home-live-empty"><span class="pro-module-icon pro-orange"><svg class="app-icon"><use href="#icon-calendar"></use></svg></span><div><strong>Sin vencimientos para hoy</strong><small>No hay productos registrados con vencimiento en la fecha de hoy.</small></div></div>`;
    return;
  }
  box.innerHTML = items
    .map((item) => {
      const rubro = escapeHTML(nombreRubroVencimiento(item?.rubro));
      const articulo = escapeHTML(item?.articulo || "Sin descripción");
      const cantidad = Math.max(0, Number(item?.cantidad) || 0);
      return `<div class="pro-home-live-row pro-home-expiry-row"><span class="pro-home-live-icon pro-home-live-icon-expiry"><svg class="app-icon"><use href="#icon-calendar"></use></svg></span><strong>${articulo}</strong><span class="pro-home-live-meta">${rubro}</span><span class="pro-home-live-badge is-danger">${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}</span></div>`;
    })
    .join("");
}

function renderTareasHoyInicio(resumen = {}) {
  const box = $("proHomeTareasHoy");
  const select = $("proHomeTaskSector");
  const wrap = $("proHomeTaskSectorWrap");
  const label = $("proHomeTaskSectorLabel");
  if (!box || !select || !wrap || !label) return;

  const sectores = Array.isArray(resumen.sectoresTareasInicio)
    ? resumen.sectoresTareasInicio
    : [];
  const tareas = Array.isArray(resumen.tareasHoyDetalle)
    ? resumen.tareasHoyDetalle
    : [];
  const puedeElegir = resumen.puedeElegirSectorTareasInicio === true;
  const valorAnterior = select.value;
  select.innerHTML = sectores
    .map((sector) => `<option value="${escapeHTML(sector.id || sector.nombre || "")}">${escapeHTML(sector.nombre || sector.id || "Sector")}</option>`)
    .join("");
  configurarSelectApp("proHomeTaskSector");
  reconstruirOpcionesSelectApp(select);

  const usuarioActual = window.AutoservicioAuth?.getUsuario?.() || {};
  const sectorUsuario = String(usuarioActual.sector || "").trim();
  const valoresDisponibles = [...select.options].map((opcion) => opcion.value);
  const preferido = valoresDisponibles.includes(valorAnterior)
    ? valorAnterior
    : valoresDisponibles.includes(sectorUsuario)
      ? sectorUsuario
      : valoresDisponibles[0] || "";
  select.value = preferido;
  sincronizarSelectApp(select);

  wrap.classList.toggle("oculto", !puedeElegir);
  const sectorActivo = sectores.find((sector) =>
    [sector?.id, sector?.nombre].some(
      (valor) => claveSectorResumen(valor) === claveSectorResumen(select.value || preferido),
    ),
  );
  label.textContent = puedeElegir ? "" : sectorActivo?.nombre || sectorUsuario || "Mi sector";
  label.classList.toggle("oculto", puedeElegir);

  if (select.dataset.homeBound !== "1") {
    select.dataset.homeBound = "1";
    select.addEventListener("change", () => renderTareasHoyInicio(resumenInicioDatosActuales || {}));
  }

  const clavesSector = new Set(
    [sectorActivo?.id, sectorActivo?.nombre, select.value]
      .map(claveSectorResumen)
      .filter(Boolean),
  );
  const visibles = tareas.filter((tarea) => clavesSector.has(claveSectorResumen(tarea?.sector)));
  const total = $("proHomeTaskTotal");
  if (total) total.textContent = `${visibles.length} ${visibles.length === 1 ? "tarea" : "tareas"}`;
  if (!visibles.length) {
    box.innerHTML = `<div class="pro-home-live-empty"><span class="pro-module-icon pro-purple"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><div><strong>Sin tareas para hoy</strong><small>No hay tareas asignadas para ${escapeHTML(sectorActivo?.nombre || select.value || "este sector")}.</small></div></div>`;
    return;
  }

  box.innerHTML = visibles
    .map((tarea) => {
      const completada = tarea?.estado === "completada";
      const responsables = Array.isArray(tarea?.responsables) ? tarea.responsables.filter(Boolean) : [];
      const detalle = [tarea?.turno === "tarde" ? "Tarde" : "Mañana", responsables.join(", ")].filter(Boolean).join(" · ");
      return `<div class="pro-home-live-row pro-home-task-row"><span class="pro-home-task-dot ${completada ? "is-complete" : ""}"></span><strong>${escapeHTML(tarea?.nombre || "Tarea")}</strong><span class="pro-home-live-meta">${escapeHTML(detalle)}</span><span class="pro-home-live-badge ${completada ? "is-success" : "is-pending"}">${completada ? "Completada" : "Pendiente"}</span></div>`;
    })
    .join("");
}

function aplicarResumenInicio(resumen = {}) {
  resumenInicioDatosActuales = resumen;
  const stock = $("proMetricStock");
  const vencimientos = $("proMetricVenc");
  const personal = $("proMetricPersonal");
  const tareas = $("proMetricTareas");
  if (stock) stock.textContent = numeroVisibleResumen(resumen.stockContado);
  if (vencimientos)
    vencimientos.textContent = numeroVisibleResumen(resumen.vencimientosCriticos);
  if (personal)
    personal.textContent = numeroVisibleResumen(resumen.personalEnTurno);
  const detalleHoy = Array.isArray(resumen.tareasHoyDetalle) ? resumen.tareasHoyDetalle : [];
  const completadasHoy = Number.isFinite(Number(resumen.tareasCompletadasHoy))
    ? Number(resumen.tareasCompletadasHoy)
    : detalleHoy.filter((item) => item?.estado === "completada").length;
  const asignadasHoy = Number.isFinite(Number(resumen.tareasAsignadasHoy))
    ? Number(resumen.tareasAsignadasHoy)
    : detalleHoy.length;
  if (tareas) tareas.textContent = numeroVisibleResumen(completadasHoy);

  const progreso = $("proMetricTareasProgress");
  const porcentaje = Math.max(0, Math.min(100, Number.isFinite(Number(resumen.tareasPorcentajeHoy))
    ? Number(resumen.tareasPorcentajeHoy)
    : (asignadasHoy ? Math.round((completadasHoy / asignadasHoy) * 100) : 0)));
  if (progreso) {
    progreso.style.width = `${porcentaje}%`;
    progreso.setAttribute("aria-valuenow", String(porcentaje));
    progreso.title = `${numeroVisibleResumen(completadasHoy)} de ${numeroVisibleResumen(asignadasHoy)} tareas completadas hoy`;
  }
  renderVencimientosHoyInicio(resumen);
  renderTareasHoyInicio(resumen);
}

async function actualizarResumenInicio({ forzar = false } = {}) {
  if (!window.AutoservicioAuth?.getUsuario?.()) return;
  if (!forzar && Date.now() - resumenInicioUltimaCarga < RESUMEN_INICIO_TTL) return;
  if (resumenInicioPromesa) return resumenInicioPromesa;

  resumenInicioPromesa = (async () => {
    let resumen = null;
    try {
      resumen = await obtenerJsonResumen("/dashboard/resumen");
    } catch (error) {
      // Compatibilidad con servidores que todavía no tienen el endpoint agregado.
      resumen = await resumenInicioFallback();
    }
    // El servidor publicado puede tener todavía la versión anterior de /dashboard/resumen.
    // Completamos los bloques de Inicio con los endpoints existentes, sin depender del deploy nuevo.
    resumen = await completarDetalleInicio(resumen || {});
    aplicarResumenInicio(resumen || {});
    await actualizarResponsableBanoInicio();
    resumenInicioUltimaCarga = Date.now();
  })().finally(() => {
    resumenInicioPromesa = null;
  });
  return resumenInicioPromesa;
}

window.addEventListener("autoservicio:bano-actualizado", () => {
  if (document.body.dataset.screen === "inicio") void actualizarResponsableBanoInicio();
});

function prepararAccesosMetricasInicio() {
  document.querySelectorAll("#pantallaInicio [data-dashboard-target]").forEach((tarjeta) => {
    if (tarjeta.dataset.dashboardBound === "1") return;
    tarjeta.dataset.dashboardBound = "1";
    const abrir = () => window.AutoservicioNavigate?.(tarjeta.dataset.dashboardTarget);
    tarjeta.addEventListener("click", abrir);
    tarjeta.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      abrir();
    });
  });
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
  actualizarFabInventario();
  actualizarFabVencimientos();
  registrarEstadoNavegacion("inicio", true);
  intentarBloquearOrientacion();
  actualizarUbicacion(ubicacionActual);
  actualizarConteosUbicacion({ salon: 0, deposito: 0 });
  activarBotonGuardar(false);
  actualizarEstadoCamara(false);
  mostrarScannerCerrado();
  limpiarProducto();
  desactivarModoCantidad();
  configurarFeedback({ sonidos: true, vibracion: true });
  configurarEventos();
  prepararAccesosMetricasInicio();
  configurarFechasMinimasVencimientos();
  inicializarReposicion();

  // Evitar una lectura protegida antes de validar la sesión. Inventario se
  // recarga al recibir `autoservicio:sesion` y también al entrar al módulo.
  if (window.AutoservicioAuth?.getToken?.()) await cargarProductos();
}

async function entrarPantalla(nombre, opciones = {}) {
  if (nombre === "inventario" || nombre === "productos") nombre = "cargados";
  const pantallaAnterior = pantallaActualApp;
  const moduloAnterior = moduloDePantalla(pantallaAnterior);
  let moduloNuevo = moduloDePantalla(nombre);
  if (!window.AutoservicioAuth?.puedeVerModulo?.(moduloNuevo)) {
    window.AutoservicioDialog?.alert?.({
      title: "Sin permiso",
      message: "Este módulo no está habilitado para tu usuario.",
    });
    nombre = "inicio";
    moduloNuevo = "inicio";
  }
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
  if (moduloAnterior !== moduloNuevo && moduloAnterior !== "inicio")
    reiniciarEstadoModulo(moduloAnterior);

  if (nombre !== "inventario") cerrarScanner(true);
  if (nombre !== "vencimientos") {
    cerrarScannerVencimientos(false);
    elementos.vencCargaModal?.classList.add("oculto");
    elementos.vencCargaModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("venc-scan-open");
  }
  if (nombre !== "precios") window.PreciosModule?.desactivar?.();
  if (nombre !== "horarios") window.HorariosModule?.desactivar?.();
  if (nombre !== "tareas") window.TareasModule?.desactivar?.();
  if (nombre !== "bano") window.BanoModule?.desactivar?.();

  if (elementos.buscadorProducto) elementos.buscadorProducto.value = "";
  if (elementos.vencBuscador) elementos.vencBuscador.value = "";
  busquedaVencimientos = "";

  if (nombre === "cargados") {
    tabProductosActual = "cargados";
  }

  cambiarPantalla(nombre);
  pantallaActualApp = nombre;
  actualizarFabInventario();
  actualizarFabVencimientos();
  if (!opciones.desdeHistorial && pantallaAnterior !== nombre) {
    const navegacionInternaInventario =
      moduloAnterior === "inventario" && moduloNuevo === "inventario";
    registrarEstadoNavegacion(nombre, navegacionInternaInventario);
  }

  if (nombre === "productos" || nombre === "cargados")
    mostrarCargandoEn($("resultadoBusqueda"), "Cargando productos...");
  if (["inventario", "productos", "cargados", "ajustes"].includes(nombre)) {
    await sincronizarEnSegundoPlano();
    if (nombre === "productos" || nombre === "cargados") refrescarProductos();
  }
  if (nombre === "vencimientos") cambiarTabVencimientos("cargar");
  if (["cargados", "vencimientos"].includes(nombre)) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    });
  }
  if (nombre === "inicio") actualizarResumenInicio();
  if (nombre === "anotar") {
    prepararReposicion();
    await refrescarReposicion();
  }
  if (nombre === "precios") await window.PreciosModule?.activar?.();
  if (nombre === "horarios") window.HorariosModule?.activar?.();
  if (nombre === "tareas") window.TareasModule?.activar?.();
  if (nombre === "bano") await window.BanoModule?.activar?.();
  if (nombre === "admin" && !window.AutoservicioAuth?.esAdmin()) {
    cambiarPantalla("inicio");
  }
}

window.AutoservicioNavigate = entrarPantalla;

async function abrirDestinoInicial() {
  const params = new URLSearchParams(window.location.search);
  const modulo = params.get("modulo");
  let manejado = false;

  if (modulo === "inventario") {
    await entrarPantalla("cargados");
    manejado = true;
  } else if (modulo === "anotar") {
    await entrarPantalla("anotar");
    manejado = true;
  } else if (modulo === "precios") {
    await entrarPantalla("precios");
    manejado = true;
  } else if (modulo === "horarios") {
    await entrarPantalla("horarios");
    manejado = true;
  } else if (modulo === "tareas") {
    const vista = params.get("vista");
    if (vista === "bano") {
      await entrarPantalla("bano");
    } else {
      await entrarPantalla("tareas");
      const fecha = params.get("fecha");
      if (fecha) window.TareasModule?.seleccionarFecha?.(fecha);
    }
    manejado = true;
  } else if (modulo === "bano") {
    await entrarPantalla("bano");
    manejado = true;
  } else if (modulo === "vencimientos") {
    await entrarPantalla("vencimientos");
    cambiarTabVencimientos("proximos");
    manejado = true;
  } else if (modulo === "admin") {
    await entrarPantalla("admin");
    manejado = true;
  }

  if (manejado)
    window.history.replaceState({}, document.title, window.location.pathname);
}


window.addEventListener("popstate", (event) => {
  if (navegacionInternaActiva) return;
  navegacionInternaActiva = true;
  const destino = event.state?.pantalla || "inicio";
  entrarPantalla(destino, { forzar: true, desdeHistorial: true }).finally(
    () => {
      navegacionInternaActiva = false;
    },
  );
});
window.addEventListener("orientationchange", intentarBloquearOrientacion);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) intentarBloquearOrientacion();
});

function configurarEventos() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => entrarPantalla(btn.dataset.pantalla));
  });

  document.querySelectorAll("[data-inventory-tab]").forEach((btn) => {
    btn.addEventListener("click", () =>
      entrarPantalla(btn.dataset.inventoryTab),
    );
  });

  document.querySelectorAll("[data-modulo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const destino = btn.dataset.modulo;
      entrarPantalla(destino);
    });
  });

  elementos.inventarioFab?.addEventListener("click", abrirCargaInventario);
  elementos.btnInventarioCargarDesktop?.addEventListener(
    "click",
    abrirCargaInventario,
  );
  elementos.inventarioCargaModal
    ?.querySelector("[data-inventory-scan-close]")
    ?.addEventListener("click", () => cerrarCargaInventario());
  elementos.btnAbrirScanner.addEventListener("click", abrirScannerManual);
  elementos.btnManualDesdeScanner?.addEventListener(
    "click",
    abrirIngresoManualDesdeScanner,
  );
  elementos.btnCerrarScanner.addEventListener("click", () =>
    cerrarCargaInventario("Carga cerrada"),
  );
  elementos.btnCodigoManualToggle.addEventListener(
    "click",
    alternarCargaManual,
  );
  elementos.btnBuscarManual.addEventListener("click", procesarCodigoManual);
  elementos.codigoManualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") procesarCodigoManual();
  });
  elementos.codigoManualInput.addEventListener("input", () =>
    renderSugerenciasManual("inventario"),
  );
  elementos.btnSalon.addEventListener("click", () => cambiarUbicacion("salon"));
  elementos.btnDeposito.addEventListener("click", () =>
    cambiarUbicacion("deposito"),
  );

  elementos.btnGuardarCantidad.addEventListener("click", guardarCantidadActual);
  elementos.btnCancelarCantidad.addEventListener(
    "click",
    cancelarProductoActual,
  );
  elementos.cantidadInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") guardarCantidadActual();
  });
  elementos.btnMenosCantidad.addEventListener("click", () =>
    cambiarCantidad(elementos.cantidadInput, -1, 1),
  );
  elementos.btnMasCantidad.addEventListener("click", () =>
    cambiarCantidad(elementos.cantidadInput, 1, 1),
  );

  elementos.checkSonidos?.addEventListener(
    "change",
    actualizarPreferenciasFeedback,
  );
  elementos.checkVibracion?.addEventListener(
    "change",
    actualizarPreferenciasFeedback,
  );

  elementos.buscadorProducto.addEventListener("input", refrescarProductos);
  elementos.btnVolverProductos.addEventListener(
    "click",
    cancelarEdicionProducto,
  );
  $("pantallaEditarProducto")?.addEventListener("click", (event) => {
    if (event.target === $("pantallaEditarProducto")) cancelarEdicionProducto();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && productoEditando) cancelarEdicionProducto();
  });

  elementos.editarSalon.addEventListener("input", actualizarTotalEditor);
  elementos.editarDeposito.addEventListener("input", actualizarTotalEditor);
  elementos.btnMenosSalon.addEventListener("click", () =>
    cambiarCantidad(elementos.editarSalon, -1, 0, actualizarTotalEditor),
  );
  elementos.btnMasSalon.addEventListener("click", () =>
    cambiarCantidad(elementos.editarSalon, 1, 0, actualizarTotalEditor),
  );
  elementos.btnMenosDeposito.addEventListener("click", () =>
    cambiarCantidad(elementos.editarDeposito, -1, 0, actualizarTotalEditor),
  );
  elementos.btnMasDeposito.addEventListener("click", () =>
    cambiarCantidad(elementos.editarDeposito, 1, 0, actualizarTotalEditor),
  );
  elementos.btnGuardarCorreccion.addEventListener("click", guardarCorreccion);
  elementos.btnEliminarStockInventario?.addEventListener(
    "click",
    eliminarStockInventario,
  );

  elementos.vencimientosFab?.addEventListener(
    "click",
    abrirCargaVencimientosModal,
  );
  $("btnVencCargaHeader")?.addEventListener(
    "click",
    abrirCargaVencimientosModal,
  );
  elementos.btnVencCerrarModal?.addEventListener("click", () =>
    cerrarCargaVencimientosModal(),
  );
  elementos.vencCargaModal
    ?.querySelector("[data-venc-scan-close]")
    ?.addEventListener("click", () => cerrarCargaVencimientosModal());
  elementos.btnVencManualDesdeScanner?.addEventListener(
    "click",
    abrirIngresoManualVencimientosDesdeScanner,
  );
  elementos.btnVencAbrirScanner?.addEventListener(
    "click",
    abrirScannerVencimientos,
  );

  elementos.btnVencManualToggle?.addEventListener(
    "click",
    alternarCargaManualVencimientos,
  );
  elementos.btnVencBuscarManual?.addEventListener(
    "click",
    procesarCodigoManualVencimientos,
  );
  elementos.vencCodigoManualInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") procesarCodigoManualVencimientos();
  });
  elementos.vencCodigoManualInput?.addEventListener("input", () =>
    renderSugerenciasManual("vencimientos"),
  );
  elementos.vencCantidadInput?.addEventListener(
    "input",
    actualizarTotalVencimiento,
  );
  elementos.btnVencGuardar?.addEventListener("click", guardarVencimientoActual);
  elementos.btnVencCancelarCarga?.addEventListener(
    "click",
    cancelarCargaVencimiento,
  );
  elementos.vencBuscador?.addEventListener("input", () => {
    busquedaVencimientos = elementos.vencBuscador.value || "";
    renderListadoVencimientos();
  });
  $("vencOrdenSelect")?.addEventListener("change", (event) => {
    ordenVencimientos = event.target.value || "proximo";
    renderListadoVencimientos();
  });
  $("vencVistaGrid")?.addEventListener("click", () =>
    cambiarVistaVencimientos("grid"),
  );
  $("vencVistaLista")?.addEventListener("click", () =>
    cambiarVistaVencimientos("lista"),
  );
  elementos.vencTabBtns?.forEach((btn) => {
    btn.addEventListener("click", () => {
      cambiarTabVencimientos(btn.dataset.vencTab || "cargar");
    });
  });
  elementos.vencListado?.addEventListener(
    "click",
    manejarClickListadoVencimientos,
  );
  elementos.vencResumen?.addEventListener(
    "click",
    manejarClickResumenVencimientos,
  );
  elementos.btnVencModalCerrar?.addEventListener("click", () =>
    resolverSalidaVencimiento(cerrarModalVencimiento),
  );
  elementos.vencModal?.addEventListener("click", (e) => {
    if (e.target === elementos.vencModal)
      resolverSalidaVencimiento(cerrarModalVencimiento);
  });
  elementos.btnVencEliminarAbrir?.addEventListener(
    "click",
    mostrarConfirmacionEliminarVencimiento,
  );
  elementos.btnVencCancelarEliminar?.addEventListener(
    "click",
    () => vencimientoSeleccionado && mostrarEdicionVencimiento(),
  );
  elementos.btnVencGuardarEdicion?.addEventListener(
    "click",
    guardarEdicionVencimiento,
  );
  elementos.btnVencConfirmarEliminar?.addEventListener(
    "click",
    confirmarEliminarVencimiento,
  );
  elementos.vencEditCantidadInput?.addEventListener(
    "input",
    actualizarTotalEdicionVencimiento,
  );
  $("vencEditRubroInput")?.addEventListener(
    "change",
    limpiarErrorEdicionVencimiento,
  );
  $("btnCambiosContinuar")?.addEventListener("click", () => {
    cerrarModalCambiosPendientes();
    resolucionCambiosPendientes?.continuar?.();
    resolucionCambiosPendientes = null;
  });
  $("btnCambiosDescartar")?.addEventListener("click", () => {
    const fn = resolucionCambiosPendientes?.descartar;
    cerrarModalCambiosPendientes();
    resolucionCambiosPendientes = null;
    fn?.();
  });
  $("btnCambiosGuardar")?.addEventListener("click", async () => {
    const fn = resolucionCambiosPendientes?.guardar;
    cerrarModalCambiosPendientes();
    resolucionCambiosPendientes = null;
    await fn?.();
  });
}

function cambiarTabVencimientos() {
  vencTabActual = "proximos";
  filtroVencimientos = "todos";
  filtroRubroVencimientos = "todos";
  actualizarEtiquetaFiltros();
  actualizarVisibilidadPanelesVencimientos();
  actualizarFabVencimientos();
  renderListadoVencimientos();
  cargarListadoVencimientos();
}

function actualizarVisibilidadPanelesVencimientos() {
  $("vencResumenCard")?.classList.remove("oculto");
  elementos.vencBuscador?.classList.remove("oculto");
  $("vencRubrosFiltros")?.classList.remove("oculto");
}

function sincronizarRubrosVencimientos() {
  const bar = $("vencRubrosFiltros");
  bar?.querySelectorAll("button[data-venc-rubro]").forEach((btn) =>
    btn.classList.toggle(
      "activo",
      (btn.dataset.vencRubro || "todos") === filtroRubroVencimientos,
    ),
  );
}

function actualizarEtiquetaFiltros() {
  sincronizarRubrosVencimientos();
}

function aplicarFiltroVencimientos(filtro) {
  filtroVencimientos = filtro || "todos";
  vencTabActual = "proximos";
  actualizarEtiquetaFiltros();
  renderListadoVencimientos();
}

function manejarClickResumenVencimientos(event) {
  const card = event.target.closest("[data-venc-resumen]");
  if (!card) return;
  const bucket = card.dataset.vencResumen || "todos";
  if (bucket !== "todos") gruposVencimientosAbiertos.add(bucket);
  aplicarFiltroVencimientos(bucket);
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

    actualizarConteosUbicacion(obtenerConteosUbicacion());
    limpiarProducto("Esperando escaneo...");
    refrescarProductos();

    mostrarMensaje("Google Sheets conectado", "ok");
    reproducirConfirmacion("guardado");
    iniciarSincronizacionAutomatica();
    mostrarScannerCerrado();
  } catch (error) {
      limpiarProducto("Error de conexión");
    mostrarMensaje(error.message, "error");
    reproducirConfirmacion("error");
    console.error(error);
  }
}

function cambiarUbicacion(ubicacion) {
  ubicacionActual = ubicacion;
  actualizarUbicacion(ubicacion);
  mostrarMensaje(
    `Ubicación: ${ubicacion === "salon" ? "Salón" : "Depósito"}`,
    "ok",
  );
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
  const contenedor =
    tipo === "vencimientos"
      ? elementos.vencManualSugerencias
      : elementos.manualSugerencias;
  if (!contenedor) return;
  contenedor.innerHTML = "";
  contenedor.classList.add("oculto");
}

async function renderSugerenciasManual(tipo) {
  const input =
    tipo === "vencimientos"
      ? elementos.vencCodigoManualInput
      : elementos.codigoManualInput;
  const contenedor =
    tipo === "vencimientos"
      ? elementos.vencManualSugerencias
      : elementos.manualSugerencias;
  if (!input || !contenedor) return;
  const consulta = String(input.value || "").trim();
  if (consulta.length < 2) {
    limpiarSugerenciasManual(tipo);
    return;
  }
  let resultados = [];
  if (tipo === "vencimientos") {
    try {
      await cargarCatalogoMaestroDesdeServidor();
    } catch (error) {
      console.warn("No se pudo cargar Productos para Vencimientos", error);
    }
    resultados = buscarProductosMaestrosPorTexto(consulta, 5);
  } else {
    // Inventario debe poder buscar tanto en el catálogo maestro como entre
    // productos que ya existen en Inventario. Así no queda inutilizable si el
    // catálogo maestro tarda, falla o todavía no fue refrescado.
    try {
      await cargarCatalogoMaestroDesdeServidor();
    } catch (error) {
      console.warn("No se pudo cargar Productos para Inventario", error);
    }
    const maestros = buscarProductosMaestrosPorTexto(consulta, 8);
    const inventario = buscarProductosPorTexto(consulta, 8, false);
    const vistos = new Set();
    resultados = [...maestros, ...inventario].filter((producto) => {
      const clave = String(producto?.codigo || producto?.articulo || "")
        .trim()
        .toLowerCase();
      if (!clave || vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    }).slice(0, 8);
  }
  contenedor.innerHTML = "";
  if (!resultados.length) {
    contenedor.innerHTML =
      '<div class="manual-no-results">No se encontraron productos.</div>';
    contenedor.classList.remove("oculto");
    return;
  }
  resultados.forEach((producto) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "manual-suggestion-item";
    const nombre = document.createElement("strong");
    nombre.textContent = producto.articulo || "Sin descripción";
    const codigo = document.createElement("span");
    codigo.textContent = producto.codigo || "Sin código";

    boton.append(nombre, codigo);

    boton.addEventListener("click", async () => {
      input.value = producto.codigo;
      limpiarSugerenciasManual(tipo);
      if (tipo === "vencimientos") {
        await procesarCodigoManualVencimientos();
      } else {
        asegurarProductoInventarioLocalDesdeMaestro(producto);
        await procesarCodigoManual();
      }
    });
    contenedor.appendChild(boton);
  });
  contenedor.classList.remove("oculto");
}

function alternarCargaManual() {
  const abrir = elementos.manualPanel?.classList.contains("oculto");
  cerrarScanner(true);
  establecerModoCargaInventario(abrir ? "manual" : "scanner");
  if (!abrir) requestAnimationFrame(() => abrirScannerManual());
}

async function procesarCodigoManual() {
  const consulta = String(elementos.codigoManualInput.value || "").trim();
  if (!consulta) {
    mostrarErrorCargaProducto(
      elementos.inventarioCameraError,
      "Ingresá un código o nombre para buscar el producto.",
    );
    return;
  }
  let exacto = buscarProductoPorCodigo(consulta);
  let codigo = consulta;
  if (!exacto.encontrado) {
    try {
      await cargarCatalogoMaestroDesdeServidor();
    } catch (error) {
      console.warn("No se pudo cargar el catálogo maestro para Inventario", error);
    }
    const maestroExacto = buscarProductoMaestroLocalPorCodigo(consulta);
    if (maestroExacto.encontrado) {
      exacto = asegurarProductoInventarioLocalDesdeMaestro(maestroExacto.producto);
      codigo = maestroExacto.producto.codigo;
    } else {
      const maestros = buscarProductosMaestrosPorTexto(consulta, 8);
      const inventario = buscarProductosPorTexto(consulta, 8, false);
      const combinados = [...maestros, ...inventario].filter((producto, indice, todos) =>
        todos.findIndex((otro) => String(otro?.codigo || "") === String(producto?.codigo || "")) === indice
      );
      if (combinados.length !== 1) {
        await renderSugerenciasManual("inventario");
        mostrarErrorCargaProducto(
          elementos.inventarioCameraError,
          combinados.length
            ? "Elegí un producto de la lista."
            : "No se encontraron productos.",
        );
        return;
      }
      const elegido = combinados[0];
      const yaInventario = buscarProductoPorCodigo(elegido.codigo);
      exacto = yaInventario.encontrado
        ? yaInventario
        : asegurarProductoInventarioLocalDesdeMaestro(elegido);
      codigo = elegido.codigo;
    }
  }
  establecerModoCargaInventario("scanner");
  await manejarCodigoEscaneado(codigo);
}

async function abrirScannerManual() {
  try {
    await cargarCatalogoMaestroDesdeServidor();
  } catch (error) {
    console.warn("No se pudo precargar el catálogo maestro para el escáner", error);
  }

  if (scannerActivo) return;

  try {
    limpiarErrorCargaProducto(elementos.inventarioCameraError);
    limpiarProducto("Esperando escaneo...");
    desactivarModoCantidad();
    productoActual = null;
    mostrarScannerAbierto();
    await iniciarScanner("video", manejarCodigoEscaneado);
    scannerActivo = true;
    actualizarEstadoCamara(true);
  } catch (error) {
    scannerActivo = false;
    actualizarEstadoCamara(false);
    mostrarScannerCerrado();
    establecerModoCargaInventario("scanner");
    mostrarErrorCargaProducto(
      elementos.inventarioCameraError,
      PRODUCT_LOADER_CAMERA_ERROR,
    );
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
  resetearCargaInventario();
}

async function manejarCodigoEscaneado(codigo) {
  if (guardando) return;

  cerrarScanner(false);

  let resultado = buscarProductoPorCodigo(codigo);
  if (!resultado.encontrado) {
    try {
      await cargarCatalogoMaestroDesdeServidor();
      const maestro = buscarProductoMaestroLocalPorCodigo(codigo);
      if (maestro.encontrado)
        resultado = asegurarProductoInventarioLocalDesdeMaestro(maestro.producto);
    } catch (error) {
      console.warn("No se pudo resolver el código contra Productos", error);
    }
  }

  if (resultado.encontrado && resultado.producto?.filaGoogle) {
    try {
      // Si ya existe en Inventario, refrescamos el stock real. Un producto que
      // viene solamente del catálogo maestro todavía no tiene fila y debe pasar
      // directo al flujo de carga para que /guardar lo cree.
      resultado = await obtenerProductoActualizadoPorCodigo(codigo);
    } catch (error) {
      console.warn("No se pudo refrescar el producto antes de contar:", error);
    }
  }

  if (!resultado.encontrado) {
    productoActual = null;
    elementos.inventarioCargaModal?.classList.remove("inventory-has-product");
    mostrarProductoNoEncontrado(codigo);
    activarBotonGuardar(false);
    desactivarModoCantidad();
    reproducirConfirmacion("error");
    mostrarScannerCerrado();
    return;
  }

  productoActual = resultado.producto;
  ocultarControlesEscaneo();
  elementos.scanPanel?.classList.remove("manual-active");
  elementos.inventarioCargaModal?.classList.add("inventory-has-product");
  mostrarProducto(productoActual);
  activarBotonGuardar(true);
  elementos.cantidadInput.value = 1;
  activarModoCantidad();
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

    const resultado = await guardarCantidadEnProducto(
      productoActual.indice,
      cantidad,
      ubicacionActual,
    );

    actualizarConteosUbicacion(obtenerConteosUbicacion());
    refrescarProductos();
    sincronizarEnSegundoPlano();
    mostrarMensaje(`Guardado: +${cantidad}`, "ok");
    reproducirConfirmacion("guardado");

    productoActual = null;
    elementos.cantidadInput.value = 1;

    // Cierra inmediatamente y refresca la vista desde la que se abrió.
    cerrarCargaInventario();
    refrescarProductos();
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


function refrescarProductos() {
  const total = obtenerCantidadProductos();
  const texto = elementos.buscadorProducto.value || "";
  const consulta = texto.trim();

  if (total === 0) {
    renderResultadosBusqueda([], seleccionarProductoParaEditar, {
      tab: tabProductosActual,
      total: 0,
      consulta,
    });
    return;
  }

  const estadisticas = obtenerProductosCargados(1000000);
  const resultados = consulta
    ? buscarProductosPorTexto(consulta, 80, true)
    : estadisticas.slice(0, 80);

  renderResultadosBusqueda(resultados, seleccionarProductoParaEditar, {
    tab: tabProductosActual,
    total,
    consulta,
    estadisticas,
  });
}

function seleccionarProductoParaEditar(producto) {
  productoEditando = producto;
  snapshotProductoEditando = {
    salon: Number(producto.salon) || 0,
    deposito: Number(producto.deposito) || 0,
  };
  // Inventario conserva su pantalla visible: la edición se abre como modal flotante.
  mostrarEditorStock(producto);
}

function cancelarEdicionProducto() {
  if (productoEditando && hayCambiosProducto()) {
    resolverSalidaProducto(() => cancelarEdicionProductoForzado());
    return;
  }
  cancelarEdicionProductoForzado();
}
function cancelarEdicionProductoForzado() {
  ocultarEditorStock();
  productoEditando = null;
  snapshotProductoEditando = null;
  const destino = "cargados";
  if (pantallaActualApp !== destino) cambiarPantalla(destino);
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
    const producto = await modificarStockProducto(
      productoEditando.indice,
      valores.salon,
      valores.deposito,
    );

    ocultarEditorStock();
    productoEditando = null;
    snapshotProductoEditando = null;
    const destinoEdicion = "cargados";
    if (pantallaActualApp !== destinoEdicion) cambiarPantalla(destinoEdicion);
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

async function eliminarStockInventario() {
  if (!productoEditando || corrigiendo) return;

  const confirmado = window.AppDialog?.confirm
    ? await window.AppDialog.confirm({
        titulo: "Eliminar producto del inventario",
        mensaje:
          "El stock de salón y depósito quedará en 0. El producto seguirá disponible en el catálogo.",
        confirmarTexto: "Eliminar",
        cancelarTexto: "Cancelar",
        peligro: true,
      })
    : window.confirm(
        "¿Eliminar este producto del inventario? El stock de salón y depósito quedará en 0.",
      );
  if (!confirmado) return;

  try {
    corrigiendo = true;
    elementos.btnEliminarStockInventario.disabled = true;
    elementos.btnGuardarCorreccion.disabled = true;
    const codigo = productoEditando.codigo;
    const producto = await modificarStockProducto(productoEditando.indice, 0, 0);
    ocultarEditorStock();
    productoEditando = null;
    snapshotProductoEditando = null;
    pantallaActualApp = "cargados";
    refrescarProductos();
    sincronizarEnSegundoPlano();
    if (productoActual?.codigo === codigo) {
      productoActual = producto;
      mostrarProducto(producto);
    }
    mostrarMensaje("Producto eliminado del inventario", "ok");
    reproducirConfirmacion("guardado");
  } catch (error) {
    mostrarMensaje(error?.message || "No se pudo eliminar el producto", "error");
    reproducirConfirmacion("error");
  } finally {
    corrigiendo = false;
    if (elementos.btnEliminarStockInventario)
      elementos.btnEliminarStockInventario.disabled = false;
    elementos.btnGuardarCorreccion.disabled = false;
  }
}

function actualizarPreferenciasFeedback() {
  configurarFeedback({
    sonidos: elementos.checkSonidos.checked,
    vibracion: elementos.checkVibracion.checked,
  });
}

function iniciarSincronizacionAutomatica() {
  if (sincronizacionAutomatica) return;

  sincronizacionAutomatica = setInterval(() => {
    sincronizarEnSegundoPlano();
  }, INTERVALO_SINCRONIZACION);
}

async function sincronizarEnSegundoPlano() {
  // La sincronización nunca debe depender de que ya existan productos locales.
  // Si la primera lectura falló (por ejemplo antes de validar la sesión), esta
  // función debe poder reconstruir Inventario desde el servidor partiendo de 0.
  if (sincronizando || guardando || corrigiendo) return;

  try {
    sincronizando = true;
    const cantidad = await sincronizarProductosDesdeServidor();
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

function establecerModoCargaVencimientos(modo = "scanner") {
  const manual = establecerModoCargaProducto({
    inicio: elementos.vencScanStart,
    panelManual: elementos.vencManualPanel,
    botonManual: elementos.btnVencManualToggle,
    error: elementos.vencCameraError,
    modo,
    limpiarInput: () => {
      if (elementos.vencCodigoManualInput)
        elementos.vencCodigoManualInput.value = "";
    },
    limpiarSugerencias: () => limpiarSugerenciasManual("vencimientos"),
    enfocarInput: () => elementos.vencCodigoManualInput?.focus(),
  });
  elementos.vencScanStart?.classList.remove("oculto");
  elementos.vencCameraCard?.classList.add("oculto");
  return manual;
}

function alternarCargaManualVencimientos() {
  const manualActivo =
    elementos.vencScanStart?.classList.contains("manual-active");
  cerrarScannerVencimientos(false);

  if (!manualActivo) {
    establecerModoCargaVencimientos("manual");
    return;
  }

  establecerModoCargaVencimientos("scanner");
  requestAnimationFrame(() => abrirScannerVencimientos());
}

async function procesarCodigoManualVencimientos() {
  const consulta = String(elementos.vencCodigoManualInput?.value || "").trim();
  if (!consulta) {
    mostrarErrorCargaProducto(
      elementos.vencCameraError,
      "Ingresá un código o nombre para buscar el producto.",
    );
    return;
  }
  try {
    await cargarCatalogoMaestroDesdeServidor();
  } catch (error) {
    mostrarErrorCargaProducto(
      elementos.vencCameraError,
      "No se pudieron cargar los productos. Intentá nuevamente.",
    );
    return;
  }
  const exacto = buscarProductoMaestroLocalPorCodigo(consulta);
  let codigo = consulta;
  if (!exacto.encontrado) {
    const resultados = buscarProductosMaestrosPorTexto(consulta, 5);
    if (resultados.length !== 1) {
      await renderSugerenciasManual("vencimientos");
      mostrarErrorCargaProducto(
        elementos.vencCameraError,
        resultados.length
          ? "Elegí un producto de la lista."
          : "No se encontraron productos.",
      );
      return;
    }
    codigo = resultados[0].codigo;
  }
  limpiarSugerenciasManual("vencimientos");
  await manejarCodigoVencimiento(codigo);
}

function actualizarFabVencimientos() {
  const visible = pantallaActualApp === "vencimientos";
  elementos.vencimientosFab?.classList.toggle("oculto", !visible);
}

function resetearCargaVencimientosModal() {
  cerrarScannerVencimientos(false);
  reiniciarFormularioVencimientos();
  if (elementos.vencCodigoManualInput)
    elementos.vencCodigoManualInput.value = "";
  limpiarSugerenciasManual("vencimientos");
  establecerModoCargaVencimientos("scanner");
}

function abrirCargaVencimientosModal() {
  if (pantallaActualApp !== "vencimientos") return;
  vencTabRetornoCarga = vencTabActual;
  resetearCargaVencimientosModal();
  elementos.vencCargaModal?.classList.remove("oculto");
  elementos.vencCargaModal?.setAttribute("aria-hidden", "false");
  elementos.vencimientosFab?.setAttribute("aria-expanded", "true");
  document.body.classList.add("venc-scan-open");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => abrirScannerVencimientos());
  });
}

function cerrarCargaVencimientosModal(mensaje = "") {
  cerrarScannerVencimientos(false);
  reiniciarFormularioVencimientos();
  limpiarSugerenciasManual("vencimientos");
  elementos.vencCargaModal?.classList.add("oculto");
  elementos.vencCargaModal?.setAttribute("aria-hidden", "true");
  elementos.vencimientosFab?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("venc-scan-open");
  if (mensaje) mostrarMensaje(mensaje, "ok");
}

function abrirIngresoManualVencimientosDesdeScanner() {
  cerrarScannerVencimientos(false);
  establecerModoCargaVencimientos("manual");
}

function mostrarScannerVencimientosAbierto() {
  elementos.vencScanStart?.classList.add("oculto");
  elementos.vencCameraCard?.classList.remove("oculto", "scanner-error");
  const mensaje = elementos.vencCameraCard?.querySelector(
    ".camera-overlay strong",
  );
  if (mensaje) mensaje.textContent = "Apuntá al código de barras";
}

function cerrarScannerVencimientos(mostrarMensajeCierre = false) {
  detenerScanner();
  scannerActivo = false;
  elementos.vencCameraCard?.classList.add("oculto");
  if (mostrarMensajeCierre) mostrarMensaje("Escáner cerrado", "ok");
}

function ocultarAccionesVencimientos() {
  elementos.vencScanStart?.classList.add("oculto");
  elementos.vencCameraCard?.classList.add("oculto");
}

function mostrarAccionesVencimientos() {
  establecerModoCargaVencimientos("scanner");
}

function reiniciarFormularioVencimientos() {
  productoVencimientoActual = null;
  establecerModoCargaVencimientos("scanner");
  if (elementos.vencFechaInput) elementos.vencFechaInput.value = "";
  if ($("vencRubroInput")) $("vencRubroInput").value = "";
  sincronizarSelectAppPorId("vencRubroInput");
  if (elementos.vencCantidadInput) elementos.vencCantidadInput.value = 1;
  actualizarTotalVencimiento();
  elementos.vencFormCard?.classList.add("oculto");
  elementos.vencProductoCard?.classList.add("oculto");
  elementos.vencProductoCard?.classList.remove("found", "error");
  elementos.vencProductoCard?.classList.add("empty");
  if (elementos.vencEstadoProducto)
    elementos.vencEstadoProducto.textContent = "Esperando código";
  if (elementos.vencNombreProducto)
    elementos.vencNombreProducto.textContent = "Escaneá o ingresá un código...";
  if (elementos.vencCodigoProducto)
    elementos.vencCodigoProducto.textContent = "-";
}

function cancelarCargaVencimiento() {
  cerrarCargaVencimientosModal("Carga cancelada");
}

async function abrirScannerVencimientos() {
  if (scannerActivo) return;

  try {
    productoVencimientoActual = null;
    limpiarErrorCargaProducto(elementos.vencCameraError);
    mostrarScannerVencimientosAbierto();
    await iniciarScanner("videoVencimientos", manejarCodigoVencimiento);
    scannerActivo = true;
  } catch (error) {
    scannerActivo = false;
    cerrarScannerVencimientos(false);
    establecerModoCargaVencimientos("scanner");
    mostrarErrorCargaProducto(
      elementos.vencCameraError,
      PRODUCT_LOADER_CAMERA_ERROR,
    );
    console.error(error);
  }
}

async function manejarCodigoVencimiento(codigo) {
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
    elementos.vencNombreProducto.textContent =
      "No encontramos este código en la base maestra.";
    elementos.vencCodigoProducto.textContent = codigo;
    elementos.vencFormCard?.classList.add("oculto");
    mostrarAccionesVencimientos();
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
  reproducirConfirmacion("ok");
}

function actualizarTotalVencimiento() {
  const cantidad = Math.max(1, Number(elementos.vencCantidadInput?.value) || 1);
  if (
    elementos.vencCantidadInput &&
    Number(elementos.vencCantidadInput.value) !== cantidad
  )
    elementos.vencCantidadInput.value = cantidad;
  if (elementos.vencTotalTexto) elementos.vencTotalTexto.textContent = cantidad;
}

async function guardarVencimientoActual() {
  try {
    if (guardandoVencimiento) return;
    if (!productoVencimientoActual) {
      mostrarMensaje("Primero escaneá un producto", "error");
      return;
    }
    const vencimiento = elementos.vencFechaInput.value;
    const cantidad = Math.max(
      1,
      Number(elementos.vencCantidadInput.value) || 1,
    );
    const rubro = $("vencRubroInput")?.value || "";
    if (!vencimiento) {
      mostrarMensaje("Cargá la fecha de vencimiento", "error");
      elementos.vencFechaInput.focus();
      return;
    }
    if (!rubro) {
      mostrarMensaje("Seleccioná el rubro", "error");
      $("vencRubroInput")?.focus();
      return;
    }
    if (vencimiento < fechaHoyLocalIso()) {
      mostrarMensaje("La fecha no puede ser anterior a hoy", "error");
      elementos.vencFechaInput.focus();
      return;
    }
    if (cantidad <= 0) {
      mostrarMensaje("Ingresá una cantidad válida", "error");
      return;
    }

    guardandoVencimiento = true;
    elementos.btnVencGuardar.disabled = true;
    mostrarMensaje("Guardando vencimiento...", "ok");

    await guardarVencimiento({
      codigo: productoVencimientoActual.codigo,
      articulo: productoVencimientoActual.articulo,
      vencimiento,
      rubro,
      cantidad,
    });

    cerrarCargaVencimientosModal();
    if (vencTabRetornoCarga && vencTabActual !== vencTabRetornoCarga)
      cambiarTabVencimientos(vencTabRetornoCarga);
    await cargarListadoVencimientos({ mantenerVista: false });
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

function capturarVistaVencimientos(id = "") {
  const tarjeta = id
    ? elementos.vencListado?.querySelector(
        `.venc-item[data-id="${CSS.escape(String(id))}"]`,
      )
    : null;
  return {
    id: id ? String(id) : "",
    top: tarjeta ? tarjeta.getBoundingClientRect().top : null,
    scrollY: window.scrollY,
  };
}

function restaurarVistaVencimientos(vista) {
  if (!vista) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const tarjeta = vista.id
        ? elementos.vencListado?.querySelector(
            `.venc-item[data-id="${CSS.escape(String(vista.id))}"]`,
          )
        : null;
      if (tarjeta && Number.isFinite(vista.top)) {
        const diferencia = tarjeta.getBoundingClientRect().top - vista.top;
        if (Math.abs(diferencia) > 1)
          window.scrollBy({ top: diferencia, left: 0, behavior: "auto" });
        return;
      }
      window.scrollTo({ top: vista.scrollY || 0, left: 0, behavior: "auto" });
    });
  });
}

async function cargarListadoVencimientos(opciones = {}) {
  try {
    if (!elementos.vencListado) return;
    const mantenerVista = Boolean(opciones.mantenerVista);
    const vista = mantenerVista
      ? opciones.vista || capturarVistaVencimientos(opciones.id || "")
      : null;

    // Cuando queremos mantener la posición no reemplazamos la lista por
    // "Cargando...", porque al achicar el contenido el navegador sube la página.
    if (!mantenerVista)
      mostrarCargandoEn(elementos.vencListado, "Cargando vencimientos...");

    const [vencimientos] = await Promise.all([
      listarVencimientos(),
      cargarCatalogoMaestroDesdeServidor().catch((error) => {
        console.warn(
          "No se pudo cargar el catálogo de precios para Vencimientos",
          error,
        );
        return 0;
      }),
    ]);
    vencimientosCache = vencimientos;
    renderListadoVencimientos();

    if (mantenerVista) restaurarVistaVencimientos(vista);
  } catch (error) {
    if (elementos.vencListado)
      elementos.vencListado.textContent =
        error.message || "No se pudieron cargar los vencimientos";
    elementos.vencListado.className = "venc-list-empty";
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
  const texto = String(item.oferta || "")
    .trim()
    .toLowerCase();
  return ["sí", "si", "true", "1", "oferta", "activo", "activa"].includes(
    texto,
  );
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
    return vencidoHace === 1
      ? "Vencido ayer"
      : `Vencido hace ${vencidoHace} días`;
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
  if (dias <= 30) return "30";
  return "fuera";
}


function filtrarVencimientos() {
  const q = String(busquedaVencimientos || "")
    .trim()
    .toLowerCase();
  return vencimientosCache.filter((item) => {
    const bucket = bucketVencimiento(item);
    if (!["7", "15", "30", "vencidos"].includes(bucket)) return false;

    if (filtroVencimientos !== "todos" && bucket !== filtroVencimientos)
      return false;

    if (filtroRubroVencimientos !== "todos") {
      if (normalizarRubroFiltro(item.rubro) !== filtroRubroVencimientos)
        return false;
    }
    if (q && !coincideBusqueda(item, q, ["articulo", "codigo", "rubro"]))
      return false;
    return true;
  });
}

function iconoResumenVencimientos(bucket) {
  if (bucket === "vencidos") {
    return `<svg class="app-icon" aria-hidden="true"><use href="#icon-box"></use></svg>`;
  }
  return `<svg class="app-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>`;
}

function nombreRubroVencimiento(valor) {
  const rubro = String(valor || "").trim();
  if (!rubro) return "Sin clasificar";
  if (rubro === "Bebida") return "Bebidas";
  return rubro;
}

function renderResumenVencimientos() {
  const contarRango = (bucket) => {
    const items = vencimientosCache.filter(
      (item) => bucketVencimiento(item) === bucket,
    );
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
  const fila = (clase, tono, filtro, titulo, datos) => `
    <button type="button" class="venc-resumen-card ${clase} app-kpi-card ${tono}" data-venc-resumen="${filtro}">
      <span class="venc-summary-icon">${iconoResumenVencimientos(filtro)}</span>
      <span class="venc-summary-copy">
        <span class="venc-resumen-rango">${titulo}</span>
        <span class="venc-resumen-datos"><strong>${datos.total}</strong><small>productos</small></span>
        <span class="venc-resumen-oferta"><strong>${datos.oferta}</strong> en oferta</span>
      </span>
    </button>`;
  el.innerHTML = [
    fila("venc-resumen-7", "app-kpi-blue", "7", "Próximos 7 días", resumen.siete),
    fila("venc-resumen-15", "app-kpi-red", "15", "8 a 15 días", resumen.quince),
    fila("venc-resumen-30", "app-kpi-amber", "30", "16 a 30 días", resumen.treinta),
    fila("venc-resumen-vencidos", "app-kpi-green", "vencidos", "Vencidos", resumen.vencidos),
  ].join("");
}

function cambiarVistaVencimientos(vista) {
  vistaVencimientos = vista === "lista" ? "lista" : "grid";
  $("vencVistaGrid")?.classList.toggle("activo", vistaVencimientos === "grid");
  $("vencVistaLista")?.classList.toggle(
    "activo",
    vistaVencimientos === "lista",
  );
  renderListadoVencimientos();
}

function precioVencimiento(item) {
  const encontrado = buscarProductoMaestroLocalPorCodigo(item?.codigo || "");
  return encontrado?.encontrado ? Number(encontrado.producto?.precio) || 0 : 0;
}

function formatearPrecioVencimiento(valor) {
  const numero = Number(valor) || 0;
  if (numero <= 0) return "—";
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(numero)}`;
}

function ordenarListaVencimientos(lista) {
  const resultado = [...lista];
  if (ordenVencimientos === "lejano") {
    return resultado.sort(
      (a, b) =>
        diasHastaVencimiento(b.vencimiento) -
        diasHastaVencimiento(a.vencimiento),
    );
  }
  if (ordenVencimientos === "nombre") {
    return resultado.sort((a, b) =>
      String(a.articulo || "").localeCompare(String(b.articulo || ""), "es", {
        sensitivity: "base",
      }),
    );
  }
  return resultado.sort(
    (a, b) =>
      diasHastaVencimiento(a.vencimiento) - diasHastaVencimiento(b.vencimiento),
  );
}

function datosVisualesVencimiento(item) {
  const bucket = bucketVencimiento(item);
  const clase = claseEstadoVencimiento(item);
  return {
    bucket,
    clase,
    cantidad: Math.max(0, Number(item.cantidad) || 0),
    articulo: escapeHTML(item.articulo || "Sin descripción"),
    codigo: escapeHTML(item.codigo || "-"),
    fecha: escapeHTML(formatearFecha(item.vencimiento)),
    estado: escapeHTML(textoEstadoVencimiento(item)),
    ofertaActiva: tieneOferta(item),
    precio: escapeHTML(formatearPrecioVencimiento(precioVencimiento(item))),
    rubro: escapeHTML(nombreRubroVencimiento(item.rubro)),
    rubroClase: escapeHTML(
      normalizarRubroFiltro(item.rubro || "sin-clasificar"),
    ),
    id: escapeHTML(String(item.id || "")),
  };
}

function crearTarjetaVencimiento(item) {
  const d = datosVisualesVencimiento(item);
  const vencido = d.bucket === "vencidos";
  return `
    <article class="venc-item venc-product-card ${d.clase} ${vencido ? "is-expired" : ""} ${d.ofertaActiva ? "is-offer-active" : ""}" data-id="${d.id}" tabindex="0">
      <div class="venc-product-card__topline">
        <span class="venc-product-card__category rubro-${d.rubroClase}">${d.rubro}</span>
        <span class="venc-product-card__deadline ${d.clase}">${d.estado}</span>
      </div>
      <div class="venc-product-card__identity">
        <strong>${d.articulo}</strong>
        <span>EAN ${d.codigo}</span>
      </div>
      <div class="venc-product-card__data">
        <span><svg class="app-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg><span><small>Vencimiento</small><b>${d.fecha}</b></span></span>
        <span><svg class="app-icon" aria-hidden="true"><use href="#icon-box"></use></svg><span><small>Cantidad</small><b>${d.cantidad} un.</b></span></span>
        <span><svg class="app-icon" aria-hidden="true"><use href="#icon-tag"></use></svg><span><small>Precio unitario</small><b>${d.precio}</b></span></span>
      </div>
      <div class="venc-product-card__footer">
        <span class="venc-offer-state ${d.ofertaActiva ? "is-active" : ""}">${d.ofertaActiva ? "Oferta activa" : "Sin oferta"}</span>
        ${
          vencido
            ? `<button type="button" class="venc-product-card__action is-danger" data-venc-accion="eliminar">Dar de baja</button>`
            : d.ofertaActiva
              ? `<button type="button" class="venc-product-card__action is-active" data-venc-accion="oferta">Quitar oferta</button>`
              : `<button type="button" class="venc-product-card__action" data-venc-accion="oferta">Activar oferta</button>`
        }
      </div>
    </article>`;
}

function crearFilaVencimiento(item) {
  const d = datosVisualesVencimiento(item);
  const vencido = d.bucket === "vencidos";
  return `
    <article class="venc-item venc-list-row ${d.clase} ${vencido ? "is-expired" : ""} ${d.ofertaActiva ? "is-offer-active" : ""}" data-id="${d.id}" tabindex="0">
      <span class="venc-list-cell venc-list-cell--rubro"><span class="venc-product-card__category rubro-${d.rubroClase}">${d.rubro}</span></span>
      <span class="venc-list-cell venc-list-cell--product"><strong>${d.articulo}</strong></span>
      <span class="venc-list-cell venc-list-cell--ean">${d.codigo}</span>
      <span class="venc-list-cell venc-list-cell--date"><strong>${d.fecha}</strong><small class="${d.clase}">${d.estado}</small></span>
      <span class="venc-list-cell venc-list-cell--qty"><strong>${d.cantidad} un.</strong></span>
      <span class="venc-list-cell venc-list-cell--price"><strong>${d.precio}</strong></span>
      <span class="venc-list-cell venc-list-cell--offer"><span class="venc-offer-state ${d.ofertaActiva ? "is-active" : ""}">${d.ofertaActiva ? "Activa" : "Sin oferta"}</span></span>
      <span class="venc-list-row__chevron" aria-hidden="true">›</span>
    </article>`;
}

function renderCuerpoGrupoVencimientos(items) {
  if (vistaVencimientos === "lista") {
    return `
      <div class="venc-list-table">
        <div class="venc-list-table__head" aria-hidden="true">
          <span>Rubro</span><span>Producto</span><span>EAN</span><span>Vencimiento</span><span>Cantidad</span><span>Precio unitario</span><span>Estado de oferta</span><span></span>
        </div>
        <div class="venc-list-table__body">${items.map(crearFilaVencimiento).join("")}</div>
      </div>`;
  }
  return `<div class="venc-range-group__grid">${items.map(crearTarjetaVencimiento).join("")}</div>`;
}

function renderListadoVencimientos() {
  if (!elementos.vencListado) return;
  renderResumenVencimientos();
  actualizarVisibilidadPanelesVencimientos();
  actualizarEtiquetaFiltros();

  if (elementos.vencListadoTitulo)
    elementos.vencListadoTitulo.textContent = "Vencimientos registrados";

  const baseLista = filtrarVencimientos();
  const lista = ordenarListaVencimientos(baseLista);

  if (!lista.length) {
    elementos.vencListado.className = "venc-list-empty venc-pro-empty";
    elementos.vencListado.textContent = vencimientosCache.length
      ? "No hay productos con esos filtros."
      : "Todavía no hay vencimientos cargados.";
    return;
  }

  const definiciones = [
    {
      bucket: "7",
      titulo: "Próximos 7 días",
      detalle: "Vencen entre hoy y 7 días",
    },
    {
      bucket: "15",
      titulo: "8 a 15 días",
      detalle: "Vencen entre 8 y 15 días",
    },
    {
      bucket: "30",
      titulo: "16 a 30 días",
      detalle: "Vencen entre 16 y 30 días",
    },
    {
      bucket: "vencidos",
      titulo: "Vencidos",
      detalle: "Productos con fecha de vencimiento pasada",
    },
  ];

  const grupos =
    filtroVencimientos === "todos"
      ? definiciones
      : definiciones.filter((g) => g.bucket === filtroVencimientos);

  elementos.vencListado.className = `venc-list venc-list-grouped venc-pro-groups ${vistaVencimientos === "lista" ? "is-list-view" : "is-grid-view"}`;

  elementos.vencListado.innerHTML = grupos
    .map((grupo) => {
      const items = lista.filter(
        (item) => bucketVencimiento(item) === grupo.bucket,
      );
      if (!items.length) return "";
      const abierto =
        filtroVencimientos !== "todos" ||
        gruposVencimientosAbiertos.has(grupo.bucket);
      const icono =
        grupo.bucket === "vencidos"
          ? `<svg class="app-icon" aria-hidden="true"><use href="#icon-box"></use></svg>`
          : `<svg class="app-icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>`;
      return `
        <section class="venc-range-group venc-range-group--${grupo.bucket} ${abierto ? "is-open" : "is-collapsed"}" aria-labelledby="vencGrupo${grupo.bucket}">
          <button type="button" class="venc-range-group__header" data-venc-grupo-toggle="${grupo.bucket}" aria-expanded="${abierto ? "true" : "false"}">
            <span class="venc-range-group__icon">${icono}</span>
            <span class="venc-range-group__copy"><h3 id="vencGrupo${grupo.bucket}">${grupo.titulo}</h3><span>${grupo.detalle}</span></span>
            <strong>${items.length} ${items.length === 1 ? "producto" : "productos"}</strong>
            <span class="venc-range-group__chevron" aria-hidden="true"><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></span>
          </button>
          ${abierto ? renderCuerpoGrupoVencimientos(items) : ""}
        </section>`;
    })
    .join("");
}

async function manejarClickListadoVencimientos(event) {
  const grupoToggle = event.target.closest("[data-venc-grupo-toggle]");
  if (grupoToggle) {
    const bucket = grupoToggle.dataset.vencGrupoToggle;
    if (gruposVencimientosAbiertos.has(bucket))
      gruposVencimientosAbiertos.delete(bucket);
    else gruposVencimientosAbiertos.add(bucket);
    renderListadoVencimientos();
    return;
  }
  const card = event.target.closest(".venc-item");
  if (!card) return;
  const accion = event.target.closest("[data-venc-accion]")?.dataset.vencAccion;
  const item = vencimientosCache.find(
    (registro) => String(registro.id) === String(card.dataset.id),
  );
  if (!item) return;
  vencimientoSeleccionado = item;

  if (accion === "oferta" && bucketVencimiento(item) !== "vencidos") {
    alternarOfertaVencimiento(item);
    return;
  }

  if (accion === "eliminar") {
    abrirDetalleVencimiento(item);
    mostrarConfirmacionEliminarVencimiento();
    return;
  }

  if (!accion && vencTabActual === "cargar") {
    // Desde "Registros cargados hoy" pasamos primero a Próximos,
    // ubicamos el mismo producto en la lista y recién ahí abrimos el editor.
    cambiarTabVencimientos("proximos");
    await cargarListadoVencimientos();

    const tarjetaDestino = elementos.vencListado?.querySelector(
      `.venc-item[data-id="${CSS.escape(String(item.id))}"]`,
    );

    if (tarjetaDestino) {
      tarjetaDestino.scrollIntoView({
        behavior: "auto",
        block: "center",
        inline: "nearest",
      });
    }

    vencimientoSeleccionado =
      vencimientosCache.find(
        (registro) => String(registro.id) === String(item.id),
      ) || item;

    abrirDetalleVencimiento(vencimientoSeleccionado);
    mostrarEdicionVencimiento();
    return;
  }

  if (!accion) {
    abrirDetalleVencimiento(item);
    mostrarEdicionVencimiento();
  }
}

async function alternarOfertaVencimiento(item) {
  if (!item?.id) return;
  const vista = capturarVistaVencimientos(item.id);
  try {
    mostrarMensaje(
      tieneOferta(item) ? "Quitando oferta..." : "Marcando oferta...",
      "ok",
    );
    const nuevaOferta = !tieneOferta(item);
    await actualizarOfertaVencimiento(item.id, nuevaOferta);
    await cargarListadoVencimientos({
      mantenerVista: true,
      vista,
      id: item.id,
    });
    mostrarMensaje(nuevaOferta ? "Oferta marcada" : "Oferta quitada", "ok");
    reproducirConfirmacion("guardado");
    return true;
  } catch (error) {
    restaurarVistaVencimientos(vista);
    mostrarMensaje(error.message, "error");
    reproducirConfirmacion("error");
  }
}

function mostrarPanelModal(panel) {
  [elementos.vencModalEditar, elementos.vencModalEliminar].forEach((el) =>
    el?.classList.add("oculto"),
  );
  panel?.classList.remove("oculto");
}

function abrirDetalleVencimiento(item) {
  vencimientoSeleccionado = item;
  elementos.vencModal?.classList.remove("oculto");
  elementos.vencModal?.setAttribute("aria-hidden", "false");
  mostrarEdicionVencimiento();
}

function cerrarModalVencimiento() {
  elementos.vencModal?.classList.add("oculto");
  elementos.vencModal?.setAttribute("aria-hidden", "true");
  vencimientoSeleccionado = null;
  snapshotVencimientoEditando = null;
}

function limpiarErrorEdicionVencimiento() {
  const error = $("vencEditError");
  if (!error) return;
  error.textContent = "";
  error.classList.add("oculto");
}

function mostrarErrorEdicionVencimiento(mensaje, foco = null) {
  const error = $("vencEditError");
  if (error) {
    error.textContent = mensaje;
    error.classList.remove("oculto");
  } else {
    mostrarMensaje(mensaje, "error");
  }
  foco?.focus?.();
}

function establecerOfertaEdicionVencimiento(valor = "sin") {
  const estado = valor === "activa" ? "activa" : "sin";
  const input = $("vencEditOfertaInput");
  if (input) input.value = estado;
  document.querySelectorAll("[data-venc-edit-oferta]").forEach((btn) => {
    btn.classList.toggle(
      "activo",
      (btn.dataset.vencEditOferta || "sin") === estado,
    );
  });
  limpiarErrorEdicionVencimiento();
}

function normalizarCantidadVencimiento(valor) {
  const cantidad = Number(valor);
  return Number.isInteger(cantidad) && cantidad >= 0 ? cantidad : 0;
}

function mostrarEdicionVencimiento() {
  const item = vencimientoSeleccionado;
  if (!item) return;
  limpiarErrorEdicionVencimiento();
  const titulo = $("vencEditarTitulo");
  if (titulo) titulo.textContent = item.articulo || "Editar vencimiento";
  const codigo = $("vencEditarCodigo");
  if (codigo) codigo.textContent = item.codigo || "-";
  if (elementos.vencEditFechaInput)
    elementos.vencEditFechaInput.value = item.vencimiento || "";
  const rubroNormalizado = [
    "Almacén",
    "Bebida",
    "Fiambrería",
    "Lácteos",
  ].includes(item.rubro)
    ? item.rubro
    : "";
  if ($("vencEditRubroInput")) $("vencEditRubroInput").value = rubroNormalizado;
  sincronizarSelectAppPorId("vencEditRubroInput");
  if (elementos.vencEditCantidadInput)
    elementos.vencEditCantidadInput.value = normalizarCantidadVencimiento(
      item.cantidad,
    );
  establecerOfertaEdicionVencimiento(tieneOferta(item) ? "activa" : "sin");
  actualizarTotalEdicionVencimiento();
  snapshotVencimientoEditando = capturarEstadoEdicionVencimiento();
  mostrarPanelModal(elementos.vencModalEditar);
}

function actualizarTotalEdicionVencimiento() {
  const cantidad = normalizarCantidadVencimiento(
    elementos.vencEditCantidadInput?.value,
  );
  if (
    elementos.vencEditCantidadInput &&
    Number(elementos.vencEditCantidadInput.value) !== cantidad
  )
    elementos.vencEditCantidadInput.value = cantidad;
  if (elementos.vencEditTotalTexto)
    elementos.vencEditTotalTexto.textContent = cantidad;
}

async function guardarEdicionVencimiento() {
  const item = vencimientoSeleccionado;
  if (!item) return;
  const vencimiento = elementos.vencEditFechaInput?.value;
  const cantidad = normalizarCantidadVencimiento(
    elementos.vencEditCantidadInput?.value,
  );
  const cantidadOriginal = normalizarCantidadVencimiento(item.cantidad);
  const rubro = $("vencEditRubroInput")?.value || "";
  const ofertaDeseada = $("vencEditOfertaInput")?.value === "activa";
  if (!vencimiento) {
    mostrarErrorEdicionVencimiento(
      "Cargá la fecha de vencimiento",
      elementos.vencEditFechaInput,
    );
    return;
  }
  if (!rubro) {
    mostrarErrorEdicionVencimiento(
      "Seleccioná el rubro",
      $("vencEditRubroInput"),
    );
    return;
  }
  if (vencimiento !== item.vencimiento && vencimiento < fechaHoyLocalIso()) {
    mostrarErrorEdicionVencimiento(
      "La nueva fecha no puede ser anterior a hoy",
      elementos.vencEditFechaInput,
    );
    return;
  }
  if (cantidad < 0 || (cantidad === 0 && cantidadOriginal > 0)) {
    mostrarErrorEdicionVencimiento(
      cantidadOriginal === 0
        ? "Ingresá una cantidad válida"
        : "La cantidad debe ser mayor a 0",
      elementos.vencEditCantidadInput,
    );
    return;
  }
  const vista = capturarVistaVencimientos(item.id);
  try {
    elementos.btnVencGuardarEdicion.disabled = true;
    mostrarMensaje("Actualizando registro...", "ok");
    await actualizarVencimiento(item.id, {
      vencimiento,
      rubro,
      cantidad,
    });
    if (ofertaDeseada !== tieneOferta(item)) {
      await actualizarOfertaVencimiento(item.id, ofertaDeseada);
    }
    await cargarListadoVencimientos({
      mantenerVista: true,
      vista,
      id: item.id,
    });
    snapshotVencimientoEditando = null;
    cerrarModalVencimiento();
    restaurarVistaVencimientos(vista);
    mostrarMensaje("Registro actualizado", "ok");
    reproducirConfirmacion("guardado");
    return true;
  } catch (error) {
    mostrarErrorEdicionVencimiento(
      error.message || "No se pudo actualizar el registro",
    );
    reproducirConfirmacion("error");
    return false;
  } finally {
    if (elementos.btnVencGuardarEdicion)
      elementos.btnVencGuardarEdicion.disabled = false;
  }
}

function mostrarConfirmacionEliminarVencimiento() {
  const item = vencimientoSeleccionado;
  if (!item) return;
  const texto = $("vencEliminarTexto");
  if (texto)
    texto.textContent = `${item.articulo || "Producto"} · Vence ${formatearFecha(item.vencimiento)}`;
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
    if (elementos.btnVencConfirmarEliminar)
      elementos.btnVencConfirmarEliminar.disabled = false;
  }
}

function mostrarCargandoEn(contenedor, texto = "Cargando...") {
  if (!contenedor) return;
  contenedor.innerHTML = `<div class="app-loading"><span class="app-spinner" aria-hidden="true"></span><strong>${texto}</strong></div>`;
}
function hayCambiosProducto() {
  if (!productoEditando || !snapshotProductoEditando) return false;
  const valores = obtenerValoresEditor();
  return (
    Number(valores.salon) !== snapshotProductoEditando.salon ||
    Number(valores.deposito) !== snapshotProductoEditando.deposito
  );
}
function estaEditandoVencimiento() {
  return Boolean(
    snapshotVencimientoEditando &&
    elementos.vencModalEditar &&
    !elementos.vencModalEditar.classList.contains("oculto"),
  );
}
function capturarEstadoEdicionVencimiento() {
  return {
    vencimiento: String(elementos.vencEditFechaInput?.value || ""),
    rubro: String($("vencEditRubroInput")?.value || ""),
    cantidad: normalizarCantidadVencimiento(elementos.vencEditCantidadInput?.value),
    oferta: $("vencEditOfertaInput")?.value === "activa",
  };
}
function hayCambiosVencimiento() {
  if (!estaEditandoVencimiento()) return false;
  const actual = capturarEstadoEdicionVencimiento();
  return (
    actual.vencimiento !== snapshotVencimientoEditando.vencimiento ||
    actual.rubro !== snapshotVencimientoEditando.rubro ||
    actual.cantidad !== snapshotVencimientoEditando.cantidad ||
    actual.oferta !== snapshotVencimientoEditando.oferta
  );
}
function abrirModalCambiosPendientes({
  titulo,
  texto,
  guardar,
  descartar,
  continuar,
}) {
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
  if (!productoEditando) {
    continuar?.();
    return;
  }
  if (!hayCambiosProducto()) {
    ocultarEditorStock();
    productoEditando = null;
    snapshotProductoEditando = null;
    continuar?.();
    return;
  }
  abrirModalCambiosPendientes({
    titulo: "Cambios sin guardar",
    texto: "¿Querés guardar los cambios del producto antes de salir?",
    guardar: async () => {
      const ok = await guardarCorreccion();
      if (ok) continuar?.();
    },
    descartar: () => {
      ocultarEditorStock();
      productoEditando = null;
      snapshotProductoEditando = null;
      continuar?.();
    },
    continuar: () => {},
  });
}
function resolverSalidaVencimiento(continuar) {
  if (!estaEditandoVencimiento()) {
    continuar?.();
    return;
  }
  if (!hayCambiosVencimiento()) {
    snapshotVencimientoEditando = null;
    continuar?.();
    return;
  }
  abrirModalCambiosPendientes({
    titulo: "Cambios sin guardar",
    texto: "¿Querés guardar los cambios del vencimiento antes de salir?",
    guardar: async () => {
      const ok = await guardarEdicionVencimiento();
      if (ok) continuar?.();
    },
    descartar: () => {
      snapshotVencimientoEditando = null;
      cerrarModalVencimiento();
      continuar?.();
    },
    continuar: () => {},
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

window.addEventListener("autoservicio:sesion", () =>
  abrirDestinoInicial().catch(() => {}),
);
