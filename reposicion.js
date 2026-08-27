import { API_BASE_URL } from "./config.js?v=1960-d21-limpieza-controlada-270826-a";
import { iniciarScanner, detenerScanner } from "./scanner.js?v=1960-d21-limpieza-controlada-270826-a";
import {
  PRODUCT_LOADER_CAMERA_ERROR,
  establecerModoCargaProducto,
  limpiarErrorCargaProducto,
  mostrarErrorCargaProducto,
} from "./product-loader.js?v=1960-d21-limpieza-controlada-270826-a";
import { ordenarPorBusqueda } from "./search.js?v=1960-d21-limpieza-controlada-270826-a";
import { obtenerJsonCacheado, precargarCatalogo } from "./api-cache.js?v=1960-d21-limpieza-controlada-270826-a";
import { escapeHTML as escapar } from "./shared/dom-utils.js?v=1960-d21-limpieza-controlada-270826-a";

const $ = (id) => document.getElementById(id);
let productoActual = null;
let registros = [];
let tab = "registro";
let iniciado = false;
let operacionEnCurso = false;
let temporizadorToast = null;
let elementoFocoAntesDelModal = null;
let productosMaestroCache = [];
let listaActual = "1";
let cargandoRegistros = false;
let secuenciaCargaLista = 0;
let ultimaSincronizacionAutomatica = 0;
const colasEstado = new Map();
let filtroEstado = "todos";
let cargaMenuAbierto = false;
let productoEdicionListaId = "";

function esVistaMovilReposicion() {
  return window.matchMedia?.("(max-width: 900px)")?.matches ?? window.innerWidth <= 900;
}

function ordenRegistro(item, indice = 0) {
  const valor = Number(item?.orden);
  return Number.isFinite(valor) && valor > 0 ? valor : indice + 1;
}
function normalizarOrdenRegistros(items = []) {
  return items.map((item, indice) => ({
    ...item,
    orden: ordenRegistro(item, indice),
  }));
}
function compararOrden(a, b) {
  return ordenRegistro(a) - ordenRegistro(b);
}
function normalizarBusquedaLista(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function coincideBusquedaLista(item, consulta) {
  const q = normalizarBusquedaLista(consulta);
  if (!q) return true;
  return (
    normalizarBusquedaLista(item?.articulo).includes(q) ||
    normalizarBusquedaLista(item?.codigo).includes(q)
  );
}

function elementosFocoModal(modal) {
  if (!modal) return [];
  return [...modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((el) => !el.closest('.oculto') && el.getClientRects().length > 0);
}

function manejarTecladoModal(event, modal, cerrar) {
  if (!modal || modal.classList.contains("oculto")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cerrar?.();
    return;
  }
  if (event.key !== "Tab") return;
  const foco = elementosFocoModal(modal);
  if (!foco.length) return;
  const primero = foco[0];
  const ultimo = foco[foco.length - 1];
  if (event.shiftKey && document.activeElement === primero) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && document.activeElement === ultimo) {
    event.preventDefault();
    primero.focus();
  }
}

function usuarioCacheRepo() {
  const u = window.AutoservicioAuth?.getUsuario?.();
  return (
    String(u?.usuario || u?.nombre || "anonimo")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_") || "anonimo"
  );
}
function claveCacheRepo(lista = listaActual) {
  return `autoservicio_repo_${usuarioCacheRepo()}_lista_${String(lista) === "2" ? "2" : "1"}`;
}
function leerCacheRepo(lista = listaActual) {
  try {
    const raw = localStorage.getItem(claveCacheRepo(lista));
    const data = raw ? JSON.parse(raw) : null;
    return Array.isArray(data?.registros) ? data.registros : [];
  } catch {
    return [];
  }
}
function guardarCacheRepo(lista = listaActual) {
  try {
    localStorage.setItem(
      claveCacheRepo(lista),
      JSON.stringify({
        actualizado: Date.now(),
        registros: registros.filter(
          (r) => String(r.lista || lista) === String(lista),
        ),
      }),
    );
  } catch {}
}
function aplicarCacheRepo(lista = listaActual) {
  const cache = leerCacheRepo(lista);
  if (!cache.length) return false;
  registros = normalizarOrdenRegistros(
    cache.map((item) => ({
      ...item,
      lista: String(item.lista || lista) === "2" ? "2" : "1",
    })),
  );
  return true;
}

function apiUrl(ruta) {
  return `${String(API_BASE_URL || "").replace(/\/$/, "")}${ruta}`;
}
async function pedir(ruta, opciones = {}) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 15000);
  let r;
  try {
    r = await fetch(apiUrl(ruta), {
      ...opciones,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(opciones.headers || {}),
      },
      signal: controlador.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError")
      throw new Error("El servidor tardó demasiado en responder");
    throw new Error("No se pudo conectar con el servidor");
  } finally {
    clearTimeout(temporizador);
  }
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) {
    const mensaje = String(data?.mensaje || "");
    if (/quota exceeded|read requests|sheets\.googleapis\.com/i.test(mensaje))
      throw new Error(
        "El servidor está ocupado. Esperá unos segundos y volvé a intentar.",
      );
    throw new Error(mensaje || "No se pudo conectar");
  }
  return data;
}
function toast(texto, tipo = "ok") {
  const t = $("toast");
  if (!t) return;
  clearTimeout(temporizadorToast);
  t.textContent = texto;
  t.setAttribute("role", tipo === "error" ? "alert" : "status");
  t.setAttribute("aria-live", tipo === "error" ? "assertive" : "polite");
  t.className = `toast mostrar ${tipo}`;
  temporizadorToast = setTimeout(() => {
    t.className = "toast";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
  }, 1800);
}
function unidades(n) {
  const v = numero(n);
  return `${v} ${v === 1 ? "unidad" : "unidades"}`;
}
function numero(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
function fechaCorta(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function inicializarReposicion() {
  if (iniciado) return;
  iniciado = true;

  // El FAB se escucha en fase de captura para que ningún listener global
  // posterior pueda cancelar el toque/click. Esto también evita conflictos
  // con otros listeners globales que puedan intervenir en el documento.
  document.addEventListener(
    "click",
    (event) => {
      const fab = event.target?.closest?.("#repoFab");
      if (!fab) return;
      event.preventDefault();
      event.stopPropagation();
      abrirSelectorCarga();
    },
    true,
  );
  $("btnRepoCargar")?.addEventListener("click", (event) => {
    event.stopPropagation();
    alternarMenuCarga();
  });
  $("btnRepoMenuEscanear")?.addEventListener("click", () => {
    cerrarMenuCarga();
    abrirCargaModal();
  });
  $("btnRepoMenuEscribir")?.addEventListener("click", () => {
    cerrarMenuCarga();
    abrirEscribirModal();
  });

  $("btnRepoMobileCerrarCarga")?.addEventListener("click", () => cerrarSelectorCargaMovil({ devolverFoco: true }));
  $("repoMobileLoadMenu")
    ?.querySelector("[data-repo-mobile-load-close]")
    ?.addEventListener("click", () => cerrarSelectorCargaMovil({ devolverFoco: true }));
  $("btnRepoMobileEscanear")?.addEventListener("click", () => {
    cerrarSelectorCargaMovil();
    abrirCargaModal();
  });
  $("btnRepoMobileEscribir")?.addEventListener("click", () => {
    cerrarSelectorCargaMovil();
    abrirEscribirModal();
  });
  $("repoMobileLoadMenu")?.addEventListener("keydown", (event) =>
    manejarTecladoModal(event, $("repoMobileLoadMenu"), cerrarSelectorCargaMovil),
  );

  $("btnRepoCerrarModal")?.addEventListener("click", cerrarCargaModal);
  $("repoCargaModal")
    ?.querySelector("[data-repo-scan-close]")
    ?.addEventListener("click", cerrarCargaModal);
  $("btnRepoManualDesdeScanner")?.addEventListener(
    "click",
    abrirIngresoManualDesdeScanner,
  );
  $("btnRepoAbrirScanner")?.addEventListener("click", abrirScanner);
  $("btnRepoManualToggle")?.addEventListener("click", () => {
    const manualActivo = $("repoActionsCard")?.classList.contains("manual-active");
    cerrarScanner();
    establecerModoCargaRepo(manualActivo ? "scanner" : "manual");
    if (manualActivo) requestAnimationFrame(() => abrirScanner());
  });
  $("btnRepoBuscarManual")?.addEventListener("click", procesarManual);
  $("repoCodigoManualInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") procesarManual();
  });
  $("repoCodigoManualInput")?.addEventListener("input", renderSugerenciasRepo);
  $("btnRepoMenos")?.addEventListener("click", () => cambiarCantidad(-1));
  $("btnRepoMas")?.addEventListener("click", () => cambiarCantidad(1));
  $("btnRepoGuardar")?.addEventListener("click", guardar);

  $("btnRepoCerrarEscribir")?.addEventListener("click", cerrarEscribirModal);
  $("repoEscribirModal")
    ?.querySelector("[data-repo-write-close]")
    ?.addEventListener("click", cerrarEscribirModal);
  $("btnRepoAgregarTexto")?.addEventListener("click", agregarListaEscritaDirecta);

  document
    .querySelectorAll("[data-repo-lista]")
    .forEach((b) =>
      b.addEventListener("click", () => seleccionarLista(b.dataset.repoLista)),
    );

  $("repoBuscador")?.addEventListener("input", render);
  $("repoListado")?.addEventListener("click", manejarAccion);
  $("btnRepoCerrarProductoEdicion")?.addEventListener("click", cerrarEditorProductoLista);
  $("btnRepoMenosProductoEdicion")?.addEventListener("click", () => ajustarCantidadEditorLista(-1));
  $("btnRepoMasProductoEdicion")?.addEventListener("click", () => ajustarCantidadEditorLista(1));
  $("btnRepoGuardarProductoEdicion")?.addEventListener("click", guardarEditorProductoLista);
  $("btnRepoEliminarProductoEdicion")?.addEventListener("click", eliminarDesdeEditorProductoLista);
  $("repoEditarCantidadInput")?.addEventListener("keydown", (event) => { if (event.key === "Enter") guardarEditorProductoLista(); });
  $("repoEditarProductoModal")?.addEventListener("click", (event) => { if (event.target === $("repoEditarProductoModal")) cerrarEditorProductoLista(); });
  $("repoEditarProductoModal")?.addEventListener("keydown", (event) => manejarTecladoModal(event, $("repoEditarProductoModal"), cerrarEditorProductoLista));
  $("btnRepoNuevaListaDesktop")?.addEventListener("click", abrirModalNuevaLista);
  $("btnRepoNuevaListaInline")?.addEventListener("click", abrirModalNuevaLista);

  $("btnRepoFiltro")?.addEventListener("click", (event) => {
    event.stopPropagation();
    alternarFiltroMenu();
  });
  document.querySelectorAll("[data-repo-filtro]").forEach((button) => {
    button.addEventListener("click", () => {
      filtroEstado = String(button.dataset.repoFiltro || "todos");
      document.querySelectorAll("[data-repo-filtro]").forEach((item) => {
        item.classList.toggle("activo", item === button);
      });
      cerrarFiltroMenu();
      render();
    });
  });

  $("btnRepoCancelarNuevaLista")?.addEventListener("click", cerrarModalNuevaLista);
  $("btnRepoConfirmarNuevaLista")?.addEventListener("click", confirmarNuevaLista);
  $("repoNuevaListaModal")?.addEventListener("click", (event) => {
    if (event.target === $("repoNuevaListaModal")) cerrarModalNuevaLista();
  });
  $("repoNuevaListaModal")?.addEventListener("keydown", (event) => manejarTecladoModal(event, $("repoNuevaListaModal"), cerrarModalNuevaLista));

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".repo-load-anchor") && !event.target.closest("#repoFab"))
      cerrarMenuCarga();
    if (!event.target.closest(".repo-filter-anchor")) cerrarFiltroMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("repoMobileLoadMenu")?.classList.contains("oculto"))
      return cerrarSelectorCargaMovil();
    if (!$("repoCargaMenu")?.classList.contains("oculto")) return cerrarMenuCarga();
    if (!$("repoFiltroMenu")?.classList.contains("oculto")) return cerrarFiltroMenu();
    if (!$("repoEscribirModal")?.classList.contains("oculto")) return cerrarEscribirModal();
    if (!$("repoCargaModal")?.classList.contains("oculto")) return cerrarCargaModal();
    if (!$("repoEditarProductoModal")?.classList.contains("oculto")) return cerrarEditorProductoLista();
    if (!$("repoNuevaListaModal")?.classList.contains("oculto")) cerrarModalNuevaLista();
  });

  window.addEventListener("autoservicio:sesion", actualizarUsuarioReposicion);
  window.addEventListener("online", sincronizarReposicionAlVolver);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sincronizarReposicionAlVolver();
  });
  precargarCatalogo();
  sincronizarSelectorListas();
}

function abrirSelectorCarga() {
  if (esVistaMovilReposicion()) {
    abrirSelectorCargaMovil();
    return;
  }
  alternarMenuCarga();
}

function abrirSelectorCargaMovil() {
  const sheet = $("repoMobileLoadMenu");
  if (!sheet) {
    abrirCargaModal();
    return;
  }

  cerrarMenuCarga();
  const numeroLista = $("repoMobileLoadListNumber");
  if (numeroLista) numeroLista.textContent = listaActual;

  sheet.classList.remove("oculto");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("repo-mobile-load-open");
  $("repoFab")?.setAttribute("aria-expanded", "true");

  requestAnimationFrame(() => $("btnRepoMobileEscanear")?.focus({ preventScroll: true }));
}

function cerrarSelectorCargaMovil({ devolverFoco = false } = {}) {
  const sheet = $("repoMobileLoadMenu");
  sheet?.classList.add("oculto");
  sheet?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("repo-mobile-load-open");
  $("repoFab")?.setAttribute("aria-expanded", "false");
  if (devolverFoco) requestAnimationFrame(() => $("repoFab")?.focus({ preventScroll: true }));
}

function alternarMenuCarga() {
  const menu = $("repoCargaMenu");
  if (!menu) return;
  cargaMenuAbierto = menu.classList.contains("oculto");
  menu.classList.toggle("oculto", !cargaMenuAbierto);
  $("btnRepoCargar")?.setAttribute("aria-expanded", cargaMenuAbierto ? "true" : "false");
  $("btnRepoCargar")?.classList.toggle("activo", cargaMenuAbierto);
}

function cerrarMenuCarga() {
  cargaMenuAbierto = false;
  $("repoCargaMenu")?.classList.add("oculto");
  $("btnRepoCargar")?.setAttribute("aria-expanded", "false");
  $("btnRepoCargar")?.classList.remove("activo");
}

function alternarFiltroMenu() {
  const menu = $("repoFiltroMenu");
  if (!menu) return;
  const abrir = menu.classList.contains("oculto");
  menu.classList.toggle("oculto", !abrir);
  $("btnRepoFiltro")?.setAttribute("aria-expanded", abrir ? "true" : "false");
}

function cerrarFiltroMenu() {
  $("repoFiltroMenu")?.classList.add("oculto");
  $("btnRepoFiltro")?.setAttribute("aria-expanded", "false");
}

function cerrarMenusProducto() {
  document.querySelectorAll('[data-repo-accion="menu-producto"]').forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function registroEdicionLista() {
  return registros.find((item) => String(item.id) === String(productoEdicionListaId)) || null;
}

function actualizarControlesLista() {
  const deshabilitarNuevaLista = !registros.length || operacionEnCurso;
  [$("btnRepoNuevaListaDesktop"), $("btnRepoNuevaListaInline")].forEach((button) => {
    if (button) button.disabled = deshabilitarNuevaLista;
  });
}

function abrirEditorProductoLista(id) {
  const registro = registros.find((item) => String(item.id) === String(id));
  const modal = $("repoEditarProductoModal");
  if (!registro || !modal) return;
  productoEdicionListaId = String(id);
  elementoFocoAntesDelModal = document.activeElement;
  if ($("repoEditarProductoNombre")) $("repoEditarProductoNombre").textContent = registro.articulo || "Producto";
  if ($("repoEditarProductoCodigo")) $("repoEditarProductoCodigo").textContent = registro.codigo ? `Código: ${registro.codigo}` : "Sin código";
  if ($("repoEditarCantidadInput")) $("repoEditarCantidadInput").value = String(Math.max(1, numero(registro.cantidad)));
  cerrarMenusProducto();
  modal.classList.remove("oculto");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-abierto", "repo-item-edit-open");
  requestAnimationFrame(() => $("repoEditarCantidadInput")?.focus({ preventScroll: true }));
}

function cerrarEditorProductoLista() {
  if (operacionEnCurso) return;
  const modal = $("repoEditarProductoModal");
  modal?.classList.add("oculto");
  modal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-abierto", "repo-item-edit-open");
  productoEdicionListaId = "";
  if (elementoFocoAntesDelModal instanceof HTMLElement) elementoFocoAntesDelModal.focus({ preventScroll: true });
  elementoFocoAntesDelModal = null;
}

function ajustarCantidadEditorLista(delta) {
  const input = $("repoEditarCantidadInput");
  if (!input) return;
  const actual = Number(input.value) || 1;
  input.value = String(Math.max(1, Math.trunc(actual) + delta));
}

async function guardarEditorProductoLista() {
  const registro = registroEdicionLista();
  const input = $("repoEditarCantidadInput");
  if (!registro || !input || operacionEnCurso) return;
  const cantidad = Number(input.value);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    toast("Cantidad inválida", "error");
    input.focus();
    return;
  }
  const listaRegistro = String(registro.lista || listaActual) === "2" ? "2" : "1";
  const boton = $("btnRepoGuardarProductoEdicion");
  try {
    operacionEnCurso = true;
    if (boton) boton.disabled = true;
    await pedir(`/reposicion/${encodeURIComponent(registro.id)}`, {
      method: "PUT",
      body: JSON.stringify({ cantidad, estado: registro.estado || "pendiente", lista: listaRegistro, codigo: registro.codigo }),
    });
    registro.cantidad = cantidad;
    guardarCacheRepo(listaRegistro);
    operacionEnCurso = false;
    if (boton) boton.disabled = false;
    cerrarEditorProductoLista();
    render();
    toast("Cantidad actualizada");
  } catch (error) {
    operacionEnCurso = false;
    if (boton) boton.disabled = false;
    toast(error.message, "error");
  }
}

async function eliminarDesdeEditorProductoLista() {
  const registro = registroEdicionLista();
  if (!registro || operacionEnCurso) return;
  const confirmar = await window.AutoservicioDialog?.confirm?.({
    title: "Eliminar producto",
    message: `¿Querés eliminar ${registro.articulo || "este producto"} de la lista?`,
    confirmText: "Eliminar producto",
    cancelText: "Cancelar",
    danger: true,
  });
  if (!confirmar) return;
  const listaRegistro = String(registro.lista || listaActual) === "2" ? "2" : "1";
  const boton = $("btnRepoEliminarProductoEdicion");
  try {
    operacionEnCurso = true;
    if (boton) boton.disabled = true;
    await pedir(`/reposicion/${encodeURIComponent(registro.id)}?lista=${listaRegistro}&codigo=${encodeURIComponent(registro.codigo || "")}`, { method: "DELETE" });
    registros = registros.filter((item) => String(item.id) !== String(registro.id));
    guardarCacheRepo(listaRegistro);
    operacionEnCurso = false;
    if (boton) boton.disabled = false;
    cerrarEditorProductoLista();
    render();
    toast("Producto eliminado");
  } catch (error) {
    operacionEnCurso = false;
    if (boton) boton.disabled = false;
    toast(error.message, "error");
  }
}

function abrirEscribirModal() {
  sincronizarSelectorListas();
  const numeroLista = $("repoEscribirListaNumero");
  if (numeroLista) numeroLista.textContent = listaActual;
  $("repoEscribirModal")?.classList.remove("oculto");
  $("repoEscribirModal")?.setAttribute("aria-hidden", "false");
  document.body.classList.add("repo-write-open");
  requestAnimationFrame(() => $("repoTextoLista")?.focus());
}

function cerrarEscribirModal() {
  $("repoEscribirModal")?.classList.add("oculto");
  $("repoEscribirModal")?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("repo-write-open");
}

export function prepararReposicion() {
  cargarProductosMaestroRepo();
  tab = "registro";
  filtroEstado = "todos";
  cerrarMenuCarga();
  cerrarSelectorCargaMovil();
  cerrarFiltroMenu();
  seleccionarLista("1", { refrescar: false });
  actualizarFabRepo();
  render();
  refrescarReposicion({ mostrarCarga: false })
    .then(() => render())
    .catch(() => {});
}

function sincronizarSelectorListas() {
  document.querySelectorAll("[data-repo-lista]").forEach((b) => {
    const activo = String(b.dataset.repoLista || "1") === listaActual;
    b.classList.toggle("activo", activo);
    b.setAttribute("aria-pressed", activo ? "true" : "false");
  });
  const nombre = `Lista ${listaActual}`;
  const modalNombre = $("repoModalListaNombre");
  if (modalNombre) modalNombre.textContent = nombre;
  [$("btnRepoNuevaListaDesktop"), $("btnRepoNuevaListaInline")].forEach((button) => {
    if (button)
      button.setAttribute("aria-label", `Empezar nueva ${nombre.toLowerCase()}`);
  });
  const mobileNumero = $("repoMobileLoadListNumber");
  if (mobileNumero) mobileNumero.textContent = listaActual;
  const escribirNumero = $("repoEscribirListaNumero");
  if (escribirNumero) escribirNumero.textContent = listaActual;
  const listaTitulo = $("repoListaTitulo");
  if (listaTitulo) listaTitulo.textContent = `Productos en Lista ${listaActual}`;
  const fab = $("repoFab");
  if (fab)
    fab.setAttribute("aria-label", `Agregar producto a Lista ${listaActual}`);
}

async function seleccionarLista(valor, { refrescar = true } = {}) {
  const nueva = String(valor) === "2" ? "2" : "1";
  if (listaActual === nueva && refrescar) {
    sincronizarSelectorListas();
    return;
  }
  listaActual = nueva;
  productoActual = null;
  limpiar();
  registros = [];
  const habiaCache = aplicarCacheRepo(nueva);
  sincronizarSelectorListas();
  render();
  if (refrescar) await refrescarReposicion({ mostrarCarga: !habiaCache });
}

export async function refrescarReposicion({ mostrarCarga = true } = {}) {
  const listaSolicitada = listaActual;
  const secuencia = ++secuenciaCargaLista;
  const habiaCache = registros.length > 0 || aplicarCacheRepo(listaSolicitada);
  cargandoRegistros = mostrarCarga && !habiaCache;
  render();
  try {
    const data = await pedir(`/reposicion?lista=${listaSolicitada}`);
    if (secuencia !== secuenciaCargaLista || listaActual !== listaSolicitada)
      return;
    registros = normalizarOrdenRegistros(
      (data.registros || []).map((item) => ({
        ...item,
        lista: String(item.lista || listaSolicitada) === "2" ? "2" : "1",
      })),
    );
    guardarCacheRepo(listaSolicitada);
    } catch (e) {
    if (secuencia === secuenciaCargaLista) toast(e.message, "error");
  } finally {
    if (secuencia === secuenciaCargaLista) {
      cargandoRegistros = false;
      render();
    }
  }
}

function actualizarFabRepo() {
  const visible = tab === "registro";
  $("repoFab")?.classList.toggle("oculto", !visible);
}

function establecerModoCargaRepo(modo = "scanner") {
  const manual = establecerModoCargaProducto({
    inicio: "repoActionsCard",
    panelManual: "repoManualPanel",
    botonManual: "btnRepoManualToggle",
    error: "repoCameraError",
    modo,
    limpiarInput: () => {
      const input = $("repoCodigoManualInput");
      if (input) input.value = "";
    },
    limpiarSugerencias: limpiarSugerenciasRepo,
    enfocarInput: () => $("repoCodigoManualInput")?.focus(),
  });
  $("repoCameraCard")?.classList.add("oculto");
  if (manual) {
    cargarProductosMaestroRepo();
    setTimeout(renderSugerenciasRepo, 50);
  }
  return manual;
}

function resetearCargaModal() {
  productoActual = null;
  if ($("repoCantidadInput")) $("repoCantidadInput").value = 1;
  $("repoCargaModal")?.classList.remove("repo-has-product");
  $("btnRepoManualToggle")?.classList.remove("oculto");
  $("repoProductoCard")?.classList.add("oculto");
  $("repoFormCard")?.classList.add("oculto");
  cerrarScanner();
  establecerModoCargaRepo("scanner");
}

function abrirCargaModal() {
  resetearCargaModal();
  sincronizarSelectorListas();
  $("repoCargaModal")?.classList.remove("oculto");
  $("repoCargaModal")?.setAttribute("aria-hidden", "false");
  document.body.classList.add("repo-scan-open");
  requestAnimationFrame(() => requestAnimationFrame(() => abrirScanner()));
}

function cerrarCargaModal() {
  resetearCargaModal();
  $("repoCargaModal")?.classList.add("oculto");
  $("repoCargaModal")?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("repo-scan-open");
}

function abrirIngresoManualDesdeScanner() {
  cerrarScanner();
  establecerModoCargaRepo("manual");
}

async function abrirScanner() {
  try {
    limpiarErrorCargaProducto("repoCameraError");
    $("repoActionsCard")?.classList.add("oculto");
    $("repoCameraCard")?.classList.remove("oculto");
    await iniciarScanner("videoReposicion", (codigo) => {
      cerrarScanner();
      buscarProducto(codigo);
    });
  } catch (error) {
    $("repoCameraCard")?.classList.add("oculto");
    establecerModoCargaRepo("scanner");
    mostrarErrorCargaProducto("repoCameraError", PRODUCT_LOADER_CAMERA_ERROR);
    console.error(error);
  }
}
function cerrarScanner() {
  detenerScanner();
  $("repoCameraCard")?.classList.add("oculto");
}
async function cargarProductosMaestroRepo({ forzar = false } = {}) {
  if (productosMaestroCache.length && !forzar) return productosMaestroCache;
  try {
    const data = await obtenerJsonCacheado("/productos-maestro", {
      ttl: 5 * 60 * 1000,
      forzar,
    });
    productosMaestroCache = Array.isArray(data.productos) ? data.productos : [];
  } catch (e) {
    console.warn("No se pudo cargar el catálogo para búsqueda manual", e);
  }
  return productosMaestroCache;
}
async function sincronizarReposicionAlVolver() {
  if (document.hidden || !navigator.onLine || operacionEnCurso)
    return;
  const ahora = Date.now();
  if (ahora - ultimaSincronizacionAutomatica < 30000) return;
  ultimaSincronizacionAutomatica = ahora;
  await Promise.allSettled([
    refrescarReposicion({ mostrarCarga: false }),
    cargarProductosMaestroRepo(),
  ]);
}
function limpiarSugerenciasRepo() {
  const c = $("repoManualSugerencias");
  if (!c) return;
  c.innerHTML = "";
  c.classList.add("oculto");
}
async function renderSugerenciasRepo() {
  const input = $("repoCodigoManualInput"),
    c = $("repoManualSugerencias");
  if (!input || !c) return;
  const consulta = String(input.value || "").trim();
  if (consulta.length < 2) {
    limpiarSugerenciasRepo();
    return;
  }
  await cargarProductosMaestroRepo();
  const resultados = ordenarPorBusqueda(productosMaestroCache, consulta, {
    limite: 5,
    campos: ["articulo", "codigo"],
  });
  c.innerHTML = "";
  if (!resultados.length) {
    c.innerHTML =
      '<div class="manual-no-results">No se encontraron productos.</div>';
    c.classList.remove("oculto");
    return;
  }
  resultados.forEach((producto) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "manual-suggestion-item";
    b.innerHTML = `<strong>${escapar(producto.articulo)}</strong><span>${escapar(producto.codigo || "Sin código")}</span>`;
    b.addEventListener("click", () => {
      input.value = producto.codigo;
      limpiarSugerenciasRepo();
      procesarManual();
    });
    c.appendChild(b);
  });
  c.classList.remove("oculto");
}
async function procesarManual() {
  const consulta = $("repoCodigoManualInput")?.value.trim();
  if (!consulta) return;
  await cargarProductosMaestroRepo();
  const exacto = productosMaestroCache.find(
    (p) => String(p.codigo || "").trim() === consulta,
  );
  let codigo = exacto?.codigo || "";
  if (!codigo) {
    const resultados = ordenarPorBusqueda(productosMaestroCache, consulta, {
      limite: 5,
      campos: ["articulo", "codigo"],
    });
    if (resultados.length !== 1) {
      renderSugerenciasRepo();
      mostrarErrorCargaProducto(
        "repoCameraError",
        resultados.length
          ? "Elegí un producto de la lista."
          : "No se encontraron productos.",
      );
      return;
    }
    codigo = resultados[0].codigo;
  }
  establecerModoCargaRepo("scanner");
  buscarProducto(codigo);
}
async function buscarProducto(codigo) {
  try {
    const data = await pedir(`/producto-maestro/${encodeURIComponent(codigo)}`);
    productoActual = data.producto;
    $("repoNombreProducto").textContent = productoActual.articulo;
    $("repoCodigoProducto").textContent = `Código: ${productoActual.codigo}`;
    $("repoCargaModal")?.classList.add("repo-has-product");
    $("repoActionsCard")?.classList.add("oculto");
    $("btnRepoManualToggle")?.classList.add("oculto");
    $("repoManualPanel")?.classList.add("oculto");
    $("repoProductoCard").classList.remove("oculto");
    $("repoFormCard").classList.remove("oculto");
    $("repoCantidadInput").value = 1;
  } catch (e) {
    limpiar();
    establecerModoCargaRepo("scanner");
    mostrarErrorCargaProducto(
      "repoCameraError",
      "No se encontró el producto. Probá con el ingreso manual.",
    );
  }
}
function cambiarCantidad(delta) {
  const i = $("repoCantidadInput");
  i.value = Math.max(1, numero(i.value) + delta);
}
async function guardar() {
  if (!productoActual || operacionEnCurso) return;
  const cantidad = Math.max(1, numero($("repoCantidadInput").value));
  const producto = { ...productoActual };
  const listaGuardada = listaActual;
  try {
    operacionEnCurso = true;
    const boton = $("btnRepoGuardar");
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Guardando...";
    }
    const data = await pedir("/reposicion", {
      method: "POST",
      body: JSON.stringify({
        codigo: producto.codigo,
        articulo: producto.articulo,
        cantidad,
        lista: listaGuardada,
      }),
    });
    const recibido = data.registro;
    if (recibido) {
      const i = registros.findIndex(
        (r) => String(r.codigo) === String(recibido.codigo),
      );
      const normalizado = {
        ...recibido,
        lista: String(recibido.lista || listaGuardada) === "2" ? "2" : "1",
        orden: ordenRegistro(recibido, registros.length),
      };
      if (i >= 0) registros[i] = normalizado;
      else registros.push(normalizado);
      guardarCacheRepo(listaGuardada);
      render();
    }
    toast(`Producto agregado a Lista ${listaGuardada}`);
    cerrarCargaModal();
    await refrescarReposicion({ mostrarCarga: false });
    if (tab === "registro") render();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    operacionEnCurso = false;
    const boton = $("btnRepoGuardar");
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Agregar a mi lista";
    }
  }
}
function limpiar() {
  resetearCargaModal();
}
function parsearLineaDirecta(linea, indice) {
  const original = String(linea || "").trim();
  if (!original) return null;
  const coincidencia = original.match(/^(\d+)\s*(?:[xX]\s*)?(.+)?$/);
  const cantidad = coincidencia ? Math.max(1, Number(coincidencia[1]) || 1) : 1;
  const articulo = (coincidencia?.[2] || original).trim();
  if (!articulo) return null;
  let hash = 2166136261;
  const base = articulo.toLocaleLowerCase("es-AR");
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const codigo = `ESCRITO-${(hash >>> 0).toString(36).toUpperCase()}`;
  return { codigo, articulo, cantidad, indice };
}
async function agregarListaEscritaDirecta() {
  const campo = $("repoTextoLista");
  const items = (campo?.value || "")
    .split(/\r?\n/)
    .map(parsearLineaDirecta)
    .filter(Boolean);
  if (!items.length) return toast("Escribí al menos un producto", "error");
  const boton = $("btnRepoAgregarTexto");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Agregando...";
  }
  try {
    const data = await pedir("/reposicion/lote", {
      method: "POST",
      body: JSON.stringify({
        lista: listaActual,
        items: items.map((item) => ({
          codigo: item.codigo,
          articulo: item.articulo,
          cantidad: item.cantidad,
        })),
      }),
    });
    const recibidos = Array.isArray(data.registros) ? data.registros : [];
    for (const recibido of recibidos) {
      const normalizado = {
        ...recibido,
        lista: String(recibido.lista || listaActual) === "2" ? "2" : "1",
        orden: ordenRegistro(recibido, registros.length),
      };
      const i = registros.findIndex(
        (r) =>
          String(r.id) === String(normalizado.id) ||
          String(r.codigo) === String(normalizado.codigo),
      );
      if (i >= 0) registros[i] = normalizado;
      else registros.push(normalizado);
    }
    registros = normalizarOrdenRegistros(registros).sort(compararOrden);
    guardarCacheRepo(listaActual);
    if (campo) campo.value = "";
    toast(
      `${recibidos.length || items.length} producto${(recibidos.length || items.length) === 1 ? "" : "s"} agregado${(recibidos.length || items.length) === 1 ? "" : "s"}`,
    );
    cerrarEscribirModal();
    tab = "registro";
    actualizarFabRepo();
    render();
    refrescarReposicion({ mostrarCarga: false }).catch(() => {});
  } catch (error) {
    toast(error.message || "No se pudo agregar la lista", "error");
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Agregar a Mi lista";
    }
  }
}

function htmlCargando(texto = "Cargando...") {
  return `<span class="app-spinner" aria-hidden="true"></span><strong>${escapar(texto)}</strong>`;
}
function render() {
  const pantalla = $("pantallaAnotar");
  pantalla?.classList.toggle("repo-is-loading", cargandoRegistros);
  pantalla?.setAttribute("aria-busy", cargandoRegistros ? "true" : "false");
  renderResumenLista();
  renderRecientesListas();
  renderListado();
}

function resumenDeRegistros(items = []) {
  const lista = Array.isArray(items) ? items : [];
  const productos = lista.length;
  const unidadesTotales = lista.reduce((total, item) => total + numero(item?.cantidad), 0);
  const fechas = lista
    .map((item) => new Date(item?.fecha || item?.actualizado || 0))
    .filter((fecha) => !Number.isNaN(fecha.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return {
    productos,
    unidadesTotales,
    ultimaFecha: fechas[0] || null,
  };
}

function renderResumenLista() {
  const resumen = resumenDeRegistros(registros.filter((r) => String(r.lista || listaActual) === listaActual));
  if ($("repoSummaryProducts")) $("repoSummaryProducts").textContent = String(resumen.productos);
  if ($("repoSummaryUnits")) $("repoSummaryUnits").textContent = `${resumen.unidadesTotales} un.`;
  if ($("repoSummaryUpdated")) {
    $("repoSummaryUpdated").textContent = resumen.ultimaFecha
      ? fechaCorta(resumen.ultimaFecha)
      : "—";
  }
  $("repoConfirmHelp")?.classList.toggle("oculto", !resumen.productos);
}

function renderRecientesListas() {
  const contenedor = $("repoRecientes");
  if (!contenedor) return;

  const datos = ["1", "2"].map((lista) => {
    const items = lista === listaActual ? registros : leerCacheRepo(lista);
    return { lista, ...resumenDeRegistros(items) };
  });
  const conDatos = datos.filter((item) => item.productos > 0);

  if (!conDatos.length) {
    contenedor.className = "repo-recent-list vacio";
    contenedor.innerHTML = `<div class="repo-recent-empty"><svg class="app-icon" aria-hidden="true"><use href="#icon-list"></use></svg><span>Aún no hay listas recientes.</span></div>`;
    return;
  }

  contenedor.className = "repo-recent-list";
  contenedor.innerHTML = conDatos
    .map((item) => `<button type="button" class="repo-recent-item${item.lista === listaActual ? " activo" : ""}" data-repo-reciente="${item.lista}">
      <span><strong>Lista ${item.lista}</strong><small>${item.ultimaFecha ? fechaCorta(item.ultimaFecha) : "Sin fecha"}</small></span>
      <b>${item.productos} prod.</b>
    </button>`)
    .join("");

  contenedor.querySelectorAll("[data-repo-reciente]").forEach((button) => {
    button.addEventListener("click", () => seleccionarLista(button.dataset.repoReciente));
  });
}

function editorProductoListaAbierto() {
  const modal = $("repoEditarProductoModal");
  return Boolean(modal && !modal.classList.contains("oculto"));
}

function editorProductoListaTieneCambios() {
  if (!editorProductoListaAbierto()) return false;
  const registro = registroEdicionLista();
  const input = $("repoEditarCantidadInput");
  if (!registro || !input) return false;
  const actual = Number(input.value);
  return Number.isInteger(actual) && actual >= 1 && actual !== numero(registro.cantidad);
}

export async function resolverSalidaReposicion(continuar) {
  if (operacionEnCurso) return;
  if (!editorProductoListaAbierto() || !editorProductoListaTieneCambios()) {
    if (editorProductoListaAbierto()) cerrarEditorProductoLista();
    continuar?.();
    return;
  }
  const descartar = await window.AutoservicioDialog?.confirm?.({
    title: "Cambios sin guardar",
    message: "La nueva cantidad todavía no fue guardada. ¿Querés salir y descartar el cambio?",
    confirmText: "Descartar y salir",
    cancelText: "Seguir editando",
    danger: true,
  });
  if (!descartar) return;
  cerrarEditorProductoLista();
  continuar?.();
}

export function reiniciarReposicion() {
  if (editorProductoListaAbierto()) cerrarEditorProductoLista();
  tab = "registro";
  listaActual = "1";
  filtroEstado = "todos";
  limpiar();
  cerrarMenuCarga();
  cerrarFiltroMenu();
  cerrarEscribirModal();
  const texto = $("repoTextoLista");
  if (texto) texto.value = "";
  const buscador = $("repoBuscador");
  if (buscador) buscador.value = "";
  actualizarFabRepo();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderListado() {
  const c = $("repoListado");
  if (!c) return;

  if (cargandoRegistros) {
    c.className = "repo-products-list repo-products-loading";
    c.innerHTML = htmlCargando("Cargando lista...");
    actualizarControlesLista();
    return;
  }

  const q = ($("repoBuscador")?.value || "").trim();
  const fuente = registros;
  let visibles = q ? fuente.filter((r) => coincideBusquedaLista(r, q)) : fuente.slice();

  if (filtroEstado === "pendientes")
    visibles = visibles.filter((r) => r.estado !== "completado");
  if (filtroEstado === "confirmados")
    visibles = visibles.filter((r) => r.estado === "completado");

  const pendientes = visibles.filter((r) => r.estado !== "completado").sort(compararOrden);
  const completados = visibles.filter((r) => r.estado === "completado").sort(compararOrden);
  const items = [...pendientes, ...completados];

  actualizarControlesLista();

  if (!items.length) {
    c.className = "repo-products-list vacio";
    const hayRegistros = registros.length > 0;
    c.innerHTML = hayRegistros
      ? `<div class="repo-empty-state"><span class="repo-empty-icon"><svg class="app-icon" aria-hidden="true"><use href="#icon-search"></use></svg></span><strong>No encontramos productos.</strong><small>Probá con otra búsqueda o cambiá el filtro.</small></div>`
      : `<div class="repo-empty-state"><span class="repo-empty-icon"><svg class="app-icon" aria-hidden="true"><use href="#icon-box"></use></svg></span><strong>No hay productos anotados.</strong><small>Los productos que agregues aparecerán acá.</small><button type="button" id="btnRepoEmptyCargar">+ Cargar productos</button></div>`;
    $("btnRepoEmptyCargar")?.addEventListener("click", (event) => {
      event.stopPropagation();
      abrirSelectorCarga();
    });
    return;
  }

  c.className = "repo-products-list";
  c.innerHTML = items
    .map((r) => {
      const completado = r.estado === "completado";
      return `<article class="repo-product-row${completado ? " completado" : ""}">
        <button type="button" class="repo-confirm-check${completado ? " completado" : ""}" data-repo-accion="${completado ? "pendiente" : "completar"}" data-id="${escapar(r.id)}" aria-label="${completado ? "Producto confirmado. Volver a pendiente" : "Confirmar producto"}" aria-pressed="${completado ? "true" : "false"}">
          <svg class="app-icon" aria-hidden="true"><use href="#icon-check"></use></svg>
        </button>
        <span class="repo-row-product-icon" aria-hidden="true"><svg class="app-icon"><use href="#icon-box"></use></svg></span>
        <div class="repo-row-copy"><strong>${escapar(r.articulo)}</strong></div>
        <span class="repo-row-qty">${numero(r.cantidad)} un.</span>
        <button type="button" class="repo-row-more" data-repo-accion="menu-producto" data-id="${escapar(r.id)}" aria-label="Editar ${escapar(r.articulo)}" aria-expanded="false">
          <svg class="app-icon" aria-hidden="true"><use href="#icon-more"></use></svg>
        </button>
      </article>`;
    })
    .join("");
}

function ocultarToast() {
  const t = $("toast");
  clearTimeout(temporizadorToast);
  if (t) {
    t.className = "toast";
    t.textContent = "";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
  }
}

function abrirModalNuevaLista() {
  if (operacionEnCurso || !registros.length) return;
  const modal = $("repoNuevaListaModal");
  if (!modal) return confirmarNuevaLista();
  ocultarToast();
  elementoFocoAntesDelModal = document.activeElement;
  modal.classList.remove("oculto");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-abierto");
  requestAnimationFrame(() => $("btnRepoCancelarNuevaLista")?.focus());
}

function cerrarModalNuevaLista() {
  if (operacionEnCurso) return;
  const modal = $("repoNuevaListaModal");
  modal?.classList.add("oculto");
  modal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-abierto");
  if (elementoFocoAntesDelModal instanceof HTMLElement)
    elementoFocoAntesDelModal.focus();
  elementoFocoAntesDelModal = null;
}

async function confirmarNuevaLista() {
  if (operacionEnCurso || !registros.length) return;
  const listaAVaciar = listaActual;
  const respaldo = registros.map((r) => ({ ...r }));
  try {
    operacionEnCurso = true;
    const boton = $("btnRepoConfirmarNuevaLista");
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Comenzando...";
    }
    [$("btnRepoNuevaListaDesktop"), $("btnRepoNuevaListaInline")].forEach((button) => {
      if (button) button.disabled = true;
    });
    registros = [];
    guardarCacheRepo(listaAVaciar);
    render();
    const modal = $("repoNuevaListaModal");
    modal?.classList.add("oculto");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-abierto");
    elementoFocoAntesDelModal = null;
    await pedir(`/reposicion?lista=${listaAVaciar}`, { method: "DELETE" });
    toast(`Lista ${listaAVaciar} lista para comenzar`);
  } catch (error) {
    if (listaActual === listaAVaciar) {
      registros = respaldo;
      guardarCacheRepo(listaAVaciar);
      render();
    }
    toast(error.message, "error");
  } finally {
    operacionEnCurso = false;
    const boton = $("btnRepoConfirmarNuevaLista");
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Empezar nueva lista";
    }
    [$("btnRepoNuevaListaDesktop"), $("btnRepoNuevaListaInline")].forEach((button) => {
      if (button) button.disabled = !registros.length;
    });
  }
}

async function manejarAccion(e) {
  const b = e.target.closest("[data-repo-accion]");
  if (!b) return;

  const id = String(b.dataset.id || "");
  const r = registros.find((x) => String(x.id) === id);
  if (!r) return toast("No se encontró el producto en la lista", "error");

  const accion = String(b.dataset.repoAccion || "");
  if (accion === "menu-producto") {
    abrirEditorProductoLista(id);
    return;
  }

  const listaRegistro = String(r.lista || listaActual) === "2" ? "2" : "1";

  if (accion !== "completar" && accion !== "pendiente") return;
  const nuevoEstado = accion === "completar" ? "completado" : "pendiente";
  r.estado = nuevoEstado;
  guardarCacheRepo(listaRegistro);
  render();
  encolarSincronizacionEstado(id, listaRegistro);
}

function encolarSincronizacionEstado(id, listaRegistro) {
  const anterior = colasEstado.get(id) || Promise.resolve();
  const siguiente = anterior
    .catch(() => {})
    .then(async () => {
      const actual = registros.find((x) => String(x.id) === String(id));
      if (!actual) return;
      const estadoAEnviar = actual.estado || "pendiente";
      const boton = document.querySelector(
        `[data-repo-accion][data-id="${CSS.escape(String(id))}"]`,
      );
      boton?.classList.add("sincronizando");
      try {
        await pedir(`/reposicion/${encodeURIComponent(actual.id)}`, {
          method: "PUT",
          body: JSON.stringify({
            cantidad: numero(actual.cantidad),
            estado: estadoAEnviar,
            lista: listaRegistro,
            codigo: actual.codigo,
          }),
        });
        actual._intentosSync = 0;
        guardarCacheRepo(listaRegistro);
      } catch (err) {
        const intentos = Number(actual._intentosSync || 0) + 1;
        actual._intentosSync = intentos;
        if (intentos <= 2) {
          toast("No se pudo sincronizar. Reintentando...", "error");
          setTimeout(
            () => encolarSincronizacionEstado(id, listaRegistro),
            2500 * intentos,
          );
        } else {
          toast(
            "Cambio guardado en el teléfono. Se sincronizará más tarde.",
            "error",
          );
        }
      } finally {
        const actualBoton = document.querySelector(
          `[data-repo-accion][data-id="${CSS.escape(String(id))}"]`,
        );
        actualBoton?.classList.remove("sincronizando");
      }
    });
  colasEstado.set(id, siguiente);
  siguiente.finally(() => {
    if (colasEstado.get(id) === siguiente) colasEstado.delete(id);
  });
}
