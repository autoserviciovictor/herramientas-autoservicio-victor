import { API_BASE_URL, APP_ASSET_BUILD } from "./config.js?v=1960-d21-limpieza-controlada-270826-a";

const XLSX_SCRIPT_URL = new URL(`./xlsx.full.min.js?v=${APP_ASSET_BUILD}`, import.meta.url).href;
let promesaCargaXLSX = null;

async function asegurarXLSX() {
  if (globalThis.XLSX?.read && globalThis.XLSX?.utils) return globalThis.XLSX;
  if (!promesaCargaXLSX) {
    promesaCargaXLSX = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-autoservicio-xlsx="1"]');
      const completar = () => {
        if (globalThis.XLSX?.read && globalThis.XLSX?.utils) resolve(globalThis.XLSX);
        else reject(new Error("El lector de Excel no quedó disponible."));
      };
      const fallar = () => reject(new Error("No se pudo cargar el lector de Excel."));
      if (!script) {
        script = document.createElement("script");
        script.src = XLSX_SCRIPT_URL;
        script.async = true;
        script.dataset.autoservicioXlsx = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", completar, { once: true });
      script.addEventListener("error", fallar, { once: true });
      if (globalThis.XLSX?.read && globalThis.XLSX?.utils) completar();
    }).catch((error) => {
      promesaCargaXLSX = null;
      throw error;
    });
  }
  return promesaCargaXLSX;
}

const $ = (id) => document.getElementById(id);
const MODULOS_PERMISO = [
  "inventario",
  "vencimientos",
  "anotar",
  "precios",
  "horarios",
  "tareas",
];
function permisosCompatibles(permisos, rol = "personal") {
  if (rol === "administrador")
    return Object.fromEntries(MODULOS_PERMISO.map((m) => [m, true]));
  const valor = permisos && typeof permisos === "object" ? permisos : {};
  return Object.fromEntries(
    MODULOS_PERMISO.map((m) => [m, valor[m] !== false]),
  );
}
function leerPermisosModal() {
  return Object.fromEntries(
    MODULOS_PERMISO.map((m) => [
      m,
      Boolean(document.querySelector(`[data-permiso-modulo="${m}"]`)?.checked),
    ]),
  );
}
function aplicarPermisosModal(permisos, rol = "personal") {
  const valores = permisosCompatibles(permisos, rol);
  document.querySelectorAll("[data-permiso-modulo]").forEach((input) => {
    input.checked = valores[input.dataset.permisoModulo] !== false;
  });
  actualizarEstadoPermisosPorRol();
}
function actualizarEstadoPermisosPorRol() {
  const rolActual = $("adminUsuarioRol")?.value || "personal";
  const esAdmin = rolActual === "administrador";
  document.querySelectorAll("[data-permiso-modulo]").forEach((input) => {
    input.disabled = esAdmin;
    if (esAdmin) input.checked = true;
  });
  $("adminPermisosAdminAviso")?.classList.toggle("oculto", !esAdmin);
  $("adminUsuarioPermisos")?.classList.toggle("es-admin", esAdmin);
  actualizarResumenPermisosUsuario();
}

function actualizarResumenPermisosUsuario() {
  const boton = $("adminUsuarioPermisosToggle");
  if (!boton) return;
  const rol = $("adminUsuarioRol")?.value || "personal";
  const marcados = [
    ...document.querySelectorAll("[data-permiso-modulo]"),
  ].filter((input) => input.checked).length;
  const resumen = boton.querySelector(".admin-permissions-toggle-summary");
  if (resumen) {
    resumen.textContent =
      rol === "administrador" || marcados === MODULOS_PERMISO.length
        ? "Acceso completo"
        : marcados === 0
          ? "Sin módulos"
          : `${marcados} de ${MODULOS_PERMISO.length} módulos`;
  }
}

function posicionarSelectorPermisosUsuario() {
  const panel = $("adminUsuarioPermisosPanel");
  const boton = $("adminUsuarioPermisosToggle");
  if (!panel || panel.hidden || !boton) return;

  const rect = boton.getBoundingClientRect();
  const margen = 8;
  const separacion = 6;
  const anchoDisponible = Math.max(180, window.innerWidth - margen * 2);
  const ancho = Math.min(Math.max(rect.width, 180), anchoDisponible);
  const izquierda = Math.min(
    Math.max(margen, rect.left),
    Math.max(margen, window.innerWidth - margen - ancho),
  );
  const altoDeseado = Math.min(panel.scrollHeight || 0, 290);
  const espacioAbajo = Math.max(
    0,
    window.innerHeight - rect.bottom - separacion - margen,
  );
  const espacioArriba = Math.max(0, rect.top - separacion - margen);
  const abreArriba = altoDeseado > espacioAbajo && espacioArriba > espacioAbajo;
  const espacioElegido = abreArriba ? espacioArriba : espacioAbajo;
  const altoMaximo = Math.max(110, Math.min(290, espacioElegido));

  panel.classList.toggle("opens-up", abreArriba);
  panel.style.position = "fixed";
  panel.style.left = `${Math.round(izquierda)}px`;
  panel.style.right = "auto";
  panel.style.width = `${Math.round(ancho)}px`;
  panel.style.maxHeight = `${Math.round(altoMaximo)}px`;
  if (abreArriba) {
    panel.style.top = "auto";
    panel.style.bottom = `${Math.round(window.innerHeight - rect.top + separacion)}px`;
  } else {
    panel.style.bottom = "auto";
    panel.style.top = `${Math.round(rect.bottom + separacion)}px`;
  }
}

function abrirSelectorPermisosUsuario() {
  const panel = $("adminUsuarioPermisosPanel");
  const boton = $("adminUsuarioPermisosToggle");
  const fieldset = $("adminUsuarioPermisos");
  if (!panel || !boton || !fieldset) return;

  const cuerpo = fieldset.closest(".admin-user-modal-body");
  const scrollTop = cuerpo?.scrollTop ?? 0;

  cerrarSelectoresInlineUsuario();
  if (panel.parentNode !== document.body) document.body.appendChild(panel);
  panel.classList.add("is-portal");
  panel.hidden = false;
  boton.setAttribute("aria-expanded", "true");
  fieldset.classList.add("desplegado");
  posicionarSelectorPermisosUsuario();

  if (cuerpo) {
    cuerpo.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      cuerpo.scrollTop = scrollTop;
      posicionarSelectorPermisosUsuario();
    });
  }
}

function prepararSelectorPermisosUsuario() {
  const fieldset = $("adminUsuarioPermisos");
  if (!fieldset || fieldset.dataset.dropdownReady === "1") return;
  fieldset.dataset.dropdownReady = "1";
  fieldset.classList.add("admin-permissions-select");

  const legend = fieldset.querySelector("legend");
  const descripcion = fieldset.querySelector(":scope > p");
  const grid = fieldset.querySelector(".admin-permissions-grid");
  const nota = $("adminPermisosAdminAviso");
  if (!grid) return;

  if (legend) legend.classList.add("admin-permissions-legend-visible");

  const boton = document.createElement("button");
  boton.type = "button";
  boton.id = "adminUsuarioPermisosToggle";
  boton.className = "admin-permissions-toggle app-select-custom__trigger";
  boton.setAttribute("aria-expanded", "false");
  boton.setAttribute("aria-haspopup", "listbox");
  boton.innerHTML = `
    <span class="app-select-custom__value admin-permissions-toggle-summary">Acceso completo</span>
    <span class="app-select-custom__chevron" aria-hidden="true"><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></span>`;

  const panel = document.createElement("div");
  panel.id = "adminUsuarioPermisosPanel";
  panel.className = "admin-permissions-dropdown-panel";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;
  if (descripcion) panel.appendChild(descripcion);
  panel.appendChild(grid);
  if (nota) panel.appendChild(nota);

  fieldset.appendChild(boton);
  fieldset.appendChild(panel);

  boton.addEventListener("click", () => {
    const abrir = panel.hidden;
    window.AppSelect?.closeAll?.();
    if (abrir) abrirSelectorPermisosUsuario();
    else cerrarSelectorPermisosUsuario();
  });
  fieldset.querySelectorAll("[data-permiso-modulo]").forEach((input) => {
    input.addEventListener("change", () => {
      // El panel de permisos se portaliza a <body>; por eso el change ya no
      // burbujea hasta #adminUsuarioModal. Actualizamos explícitamente el
      // resumen y el estado del botón Guardar al cambiar un módulo.
      actualizarResumenPermisosUsuario();
      limpiarMensajeUsuarioModal();
      actualizarEstadoGuardarUsuario();
    });
  });
  document.addEventListener("click", (event) => {
    if (!fieldset.contains(event.target) && !panel.contains(event.target))
      cerrarSelectorPermisosUsuario();
  });
  window.addEventListener("resize", posicionarSelectorPermisosUsuario, {
    passive: true,
  });
  document.addEventListener("scroll", posicionarSelectorPermisosUsuario, true);
  actualizarResumenPermisosUsuario();
}

function cerrarSelectorPermisosUsuario() {
  const panel = $("adminUsuarioPermisosPanel");
  const boton = $("adminUsuarioPermisosToggle");
  const fieldset = $("adminUsuarioPermisos");
  if (panel) {
    panel.hidden = true;
    panel.classList.remove("is-portal", "opens-up");
    [
      "position",
      "left",
      "right",
      "top",
      "bottom",
      "width",
      "max-height",
    ].forEach((prop) => panel.style.removeProperty(prop));
    if (fieldset && panel.parentNode !== fieldset) fieldset.appendChild(panel);
  }
  boton?.setAttribute("aria-expanded", "false");
  fieldset?.classList.remove("desplegado");
}

function preservarScrollModalEnSelect(trigger) {
  const cuerpo = trigger?.closest(
    ".admin-user-modal-body, .admin-sector-modal-body",
  );
  if (!trigger || !cuerpo || trigger.dataset.stableModalScroll === "1") return;
  trigger.dataset.stableModalScroll = "1";
  let scrollGuardado = cuerpo.scrollTop;

  trigger.addEventListener(
    "pointerdown",
    () => {
      scrollGuardado = cuerpo.scrollTop;
    },
    { passive: true },
  );
  trigger.addEventListener("click", () => {
    cuerpo.scrollTop = scrollGuardado;
    requestAnimationFrame(() => {
      cuerpo.scrollTop = scrollGuardado;
    });
  });
}

let usuarios = [];
let sectores = [];
let historialVencimientos = [];
let historialAdministracion = [];
let historialPeriodo = "hoy";
let historialLimite = 20;
let historialBusquedaTimer = null;
let importacionPendiente = null;
let importacionResumenPendiente = null;
let usuarioModalInicial = "";
let sectorModalInicial = "";
let resumenSistema = {};
let adminUsuariosPagina = 1;
const adminUsuariosPorPagina = 12;
let adminUsuariosVista = "grid";
let adminUsuariosSeleccionados = new Set();
let adminUsuariosCargados = false;
let historialPagina = 1;
let historialPorPagina = 10;
let adminUltimaActualizacion = null;
let adminActividadExpandida = false;
let adminSectoresPagina = 1;
const adminSectoresPorPagina = 6;

const IMPORTACION_HOJA_ESPERADA = "RptStockInventarioValuado";
const IMPORTACION_MIN_PRODUCTOS = 1000;

function mensaje(texto, tipo = "") {
  const el = $("adminMensaje");
  if (!el) return;
  el.textContent = texto;
  el.className = `admin-message ${tipo}`.trim();
  clearTimeout(mensaje.timer);
  mensaje.timer = setTimeout(() => {
    el.textContent = "";
    el.className = "admin-message";
  }, 4500);
}

async function api(ruta, opciones = {}) {
  const r = await fetch(`${API_BASE_URL}${ruta}`, opciones);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false)
    throw new Error(data.mensaje || "No se pudo completar la operación");
  return data;
}

function ocultarPanelAdmin() {
  const panel = $("pantallaAdmin");
  if (!panel) return;
  panel.classList.remove("activa");
  panel.setAttribute("aria-hidden", "true");
}

function mostrarPanel() {
  if (!window.AutoservicioAuth?.esAdmin()) {
    window.AutoservicioNavigate?.("inicio");
    return;
  }
  window.AutoservicioNavigate?.("admin");
  const panel = $("pantallaAdmin");
  if (panel) {
    panel.hidden = false;
    panel.classList.add("activa");
    panel.setAttribute("aria-hidden", "false");
  }
  cambiarTab("inicio");
  cargarTodo();
}

function fechaHoyArgentinaAdmin() {
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function cargarResumen() {
  const data = await api("/admin/resumen");
  if (!Number.isFinite(Number(data.vencimientosHoy))) {
    try {
      const listado = await api("/vencimientos");
      const hoy = fechaHoyArgentinaAdmin();
      data.vencimientosHoy = (listado.vencimientos || []).filter(
        (item) => String(item?.vencimiento || "").trim() === hoy,
      ).length;
    } catch {
      data.vencimientosHoy = 0;
    }
  }
  resumenSistema = data || {};
  establecerTexto("adminProductos", Number.isFinite(Number(data.productos)) ? Number(data.productos).toLocaleString("es-AR") : "—");
  establecerTexto("adminProductosDetalle", "En catálogo");

  const tieneProximos30 = Number.isFinite(Number(data.vencimientosProximos30));
  establecerTexto("adminVencimientos", tieneProximos30 ? Number(data.vencimientosProximos30).toLocaleString("es-AR") : (data.vencimientos ?? "—"));
  establecerTexto("adminVencimientosDetalle", tieneProximos30 ? "Próximos 30 días" : "Registrados");

  establecerTexto("adminServidorEstado", "Activo");
  const version = String(data.version || "").trim();
  establecerTexto("adminVersionSistema", version ? `v${version.replace(/^v/i, "")}` : "—");
  establecerTexto("adminVersionDetalle", data.build ? `Build ${data.build}` : "Versión actual");

  adminUltimaActualizacion = new Date();
  const ultima = $("adminUltimaActualizacion");
  const operador = window.AutoservicioAuth?.getUsuario?.()?.nombre || window.AutoservicioAuth?.getUsuario?.()?.usuario || "Administrador";
  if (ultima) {
    const fecha = adminUltimaActualizacion.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const hora = adminUltimaActualizacion.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    ultima.textContent = `${fecha} ${hora} por ${operador}`;
  }
  const storage = $("adminStorageLabel");
  if (storage) storage.textContent = "Capacidad no expuesta por el servidor";
  const storageBar = $("adminStorageBar");
  if (storageBar) {
    storageBar.classList.add("is-unavailable");
    storageBar.querySelector("i")?.style.setProperty("width", "0%");
  }
  actualizarMetricasAdmin();
}

async function cargarSectores() {
  const data = await api("/admin/sectores");
  sectores = data.sectores || [];
  poblarFiltroSectoresUsuarios();
  renderSectores();
  poblarSectoresUsuario();
}
function sectorPorId(id) {
  return sectores.find((s) => s.id === id);
}
function etiquetaRol(valor) {
  return (
    {
      personal: "Personal",
      supervisor: "Supervisor",
      administracion: "Administración",
      administrador: "Administrador",
    }[valor] || "Personal"
  );
}

function establecerTexto(id, valor) {
  const el = $(id);
  if (el) el.textContent = valor;
}

function usuariosDelSector(id) {
  if (!id) return [];
  return usuarios.filter((u) => {
    const todos = new Set([u.sector, ...(Array.isArray(u.sectores) ? u.sectores : [])].filter(Boolean));
    return todos.has(id);
  });
}

function actualizarMetricasAdmin() {
  const activos = usuarios.filter((u) => u.activo !== false).length;
  const inactivos = Math.max(0, usuarios.length - activos);
  const sectoresActivos = sectores.filter((s) => s.activo !== false).length;
  const sectoresInactivos = Math.max(0, sectores.length - sectoresActivos);
  const supervisores = usuarios.filter((u) => u.activo !== false && u.rol === "supervisor").length;
  const asignados = usuarios.filter((u) => u.sector || (Array.isArray(u.sectores) && u.sectores.some(Boolean))).length;
  const porcentaje = sectores.length ? Math.round((sectoresActivos / sectores.length) * 100) : 0;

  establecerTexto("adminHomeUsuariosActivos", activos || 0);
  establecerTexto("adminHomeUsuariosDetalle", `${inactivos} inactivos`);
  establecerTexto("adminHomeSectores", sectores.length || 0);
  establecerTexto("adminHomeSectoresDetalle", `${sectoresActivos} activos`);
  establecerTexto("adminHomeEstado", resumenSistema.servidor === "conectado" ? "Óptimo" : "Activo");
  establecerTexto("adminHomeEstadoDetalle", "");
  const vencimientosHoy = Number(resumenSistema.vencimientosHoy);
  establecerTexto(
    "adminHomeVencimientos",
    Number.isFinite(vencimientosHoy) ? vencimientosHoy.toLocaleString("es-AR") : "0",
  );
  establecerTexto("adminHomeVencimientosDetalle", "Vencen hoy");
  establecerTexto("adminHomeUsuariosCardActivos", activos || 0);
  establecerTexto("adminHomeUsuariosCardInactivos", inactivos || 0);
  establecerTexto("adminHomeSectoresCardActivos", sectoresActivos || 0);
  establecerTexto("adminHomeSectoresCardInactivos", sectoresInactivos || 0);
  establecerTexto("adminHomeProductosCard", resumenSistema.productos ?? "—");
  establecerTexto("adminHomeVersionCard", resumenSistema.version || "—");

  establecerTexto("adminUsuariosActivosMetrica", activos || 0);
  establecerTexto("adminUsuariosActivosDetalle", `${usuarios.length || 0} registrados`);
  establecerTexto("adminUsuariosSectoresMetrica", sectoresActivos || 0);
  establecerTexto("adminUsuariosModulosMetrica", MODULOS_PERMISO.length);
  establecerTexto("adminUsuariosSaludMetrica", resumenSistema.servidor === "conectado" ? "Óptimo" : "Activo");
  establecerTexto("adminUsuariosTotalMetrica", usuarios.length || 0);
  establecerTexto("adminUsuariosSistema", activos || 0);
  establecerTexto("adminUsuariosSistemaDetalle", "Activos");

  establecerTexto("adminSectoresActivosMetrica", sectoresActivos || 0);
  establecerTexto("adminSectoresActivosDetalle", `${porcentaje}% del total`);
  establecerTexto("adminSectoresUsuariosMetrica", asignados || 0);
  establecerTexto("adminSectoresSupervisoresMetrica", supervisores || 0);
  establecerTexto("adminSectoresProductosMetrica", Number(resumenSistema.productos) ? Number(resumenSistema.productos).toLocaleString("es-AR") : "—");
  establecerTexto("adminSectoresProductosDetalle", Number(resumenSistema.productos) ? "Productos disponibles en el catálogo" : "Sin datos de catálogo");
  establecerTexto("adminSectoresOperativosMetrica", `${porcentaje}%`);
}

function poblarFiltroSectoresUsuarios() {
  const select = $("adminUsuariosFiltroSector");
  if (!select) return;
  const actual = select.value || "todos";
  select.innerHTML = '<option value="todos">Todos</option><option value="sin-sector">Sin sector</option>' + sectores
    .slice()
    .sort((a,b) => String(a.nombre||"").localeCompare(String(b.nombre||""), "es"))
    .map((s) => `<option value="${escaparHtml(s.id)}">${escaparHtml(s.nombre)}</option>`)
    .join("");
  if ([...select.options].some((o) => o.value === actual)) select.value = actual;
}

function colorRol(rol) {
  return ({ administrador: "role-admin", administracion: "role-adminops", supervisor: "role-supervisor", personal: "role-personal" }[rol] || "role-personal");
}

function renderHomeActividad() {
  const cont = $("adminHomeActividad");
  if (!cont) return;
  const items = historialAdministracion.slice(0, adminActividadExpandida ? 12 : 4);
  const botonVerTodas = $("adminHomeVerHistorial");
  if (botonVerTodas) {
    botonVerTodas.textContent = adminActividadExpandida ? "Ver menos" : "Ver todas";
    botonVerTodas.disabled = historialAdministracion.length <= 4;
  }
  cont.classList.toggle("is-empty", !items.length);
  if (!items.length) {
    cont.innerHTML = '<div class="admin-empty-compact">Todavía no hay actividad administrativa registrada.</div>';
    return;
  }
  const iconos = { usuario: "#icon-user", sector: "#icon-building", sistema: "#icon-settings", catalogo: "#icon-box" };
  cont.innerHTML = items.map((h) => {
    const clase = accionNormalizada(h.accion);
    const accion = escaparHtml(h.accion || "Movimiento");
    const entidad = escaparHtml(h.entidad || "Sistema");
    const identificador = escaparHtml(h.identificador || "");
    const responsable = escaparHtml(h.nombre || h.usuario || "Administrador");
    const descripcion = escaparHtml(h.detalle || [entidad, identificador].filter(Boolean).join(" · ") || "Actividad administrativa");
    const icono = iconos[String(h.entidad || "").toLowerCase()] || "#icon-clipboard";
    return `<div class="admin-home-activity-item action-${clase}"><span class="admin-home-activity-icon"><svg class="app-icon"><use href="${icono}"></use></svg></span><div><strong>${accion}${identificador ? ` · ${identificador}` : ""}</strong><small>${descripcion}</small></div><span class="admin-home-activity-user">${responsable}</span><time>${escaparHtml(h.fecha || "")} ${escaparHtml(h.hora || "")}</time></div>`;
  }).join("");
}

async function cargarHistorialAdministracion() {
  try {
    const data = await api("/admin/historial-administracion");
    historialAdministracion = Array.isArray(data.historial) ? data.historial : [];
  } catch (error) {
    historialAdministracion = [];
  }
  renderHomeActividad();
}

function actualizarSelectoresUsuario() {
  const rol = $("adminUsuarioRol");
  const sec2 = $("adminUsuarioSectorSecundario");
  const fila2 = $("adminUsuarioSectorSecundarioFila");
  const esSupervisor = rol?.value === "supervisor";
  fila2?.classList.toggle("oculto", !esSupervisor);
  if (!esSupervisor && sec2) sec2.value = "";
  ["adminUsuarioRol", "adminUsuarioSector", "adminUsuarioSectorSecundario"].forEach(
    (id) => window.AppSelect?.refresh?.(id),
  );
}

function cerrarSelectoresInlineUsuario() {
  window.AppSelect?.closeAll?.();
}

const COLORES_ADMIN = [
  { valor: "#b72e35", nombre: "Rojo" },
  { valor: "#ef4444", nombre: "Rojo claro" },
  { valor: "#f97316", nombre: "Naranja" },
  { valor: "#f59e0b", nombre: "Ámbar" },
  { valor: "#eab308", nombre: "Amarillo" },
  { valor: "#22c55e", nombre: "Verde" },
  { valor: "#14b8a6", nombre: "Turquesa" },
  { valor: "#0ea5e9", nombre: "Celeste" },
  { valor: "#2563eb", nombre: "Azul" },
  { valor: "#7c3aed", nombre: "Violeta" },
  { valor: "#db2777", nombre: "Rosa" },
  { valor: "#64748b", nombre: "Gris" },
];
function normalizarColor(valor, respaldo = "#b72e35") {
  const v = String(valor || "")
    .trim()
    .toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : respaldo;
}
function nombreColor(valor) {
  const v = normalizarColor(valor);
  return (
    COLORES_ADMIN.find((c) => c.valor === v)?.nombre || "Color personalizado"
  );
}
function renderPaletaColor(tipo, valor) {
  const esSector = tipo === "sector";
  const input = $(esSector ? "adminSectorColor" : "adminHorarioColor");
  const cont = $(
    esSector ? "adminSectorColorPalette" : "adminHorarioColorPalette",
  );
  const nombre = $(
    esSector ? "adminSectorColorNombre" : "adminHorarioColorNombre",
  );
  if (!input || !cont) return;
  const actual = normalizarColor(valor, esSector ? "#b72e35" : "#f59e0b");
  input.value = actual;
  const opciones = [...COLORES_ADMIN];
  if (!opciones.some((c) => c.valor === actual))
    opciones.unshift({ valor: actual, nombre: "Color actual" });
  cont.innerHTML = opciones
    .map(
      (c) =>
        `<button type="button" class="admin-color-option ${c.valor === actual ? "seleccionado" : ""}" data-color="${c.valor}" role="radio" aria-checked="${c.valor === actual}" aria-label="${c.nombre}" title="${c.nombre}"><span style="background:${c.valor}"></span></button>`,
    )
    .join("");
  if (nombre) nombre.textContent = nombreColor(actual);
  cont.querySelectorAll(".admin-color-option").forEach((btn) =>
    btn.addEventListener("click", () => {
      const elegido = normalizarColor(btn.dataset.color, actual);
      input.value = elegido;
      cont.querySelectorAll(".admin-color-option").forEach((x) => {
        const activo = x === btn;
        x.classList.toggle("seleccionado", activo);
        x.setAttribute("aria-checked", String(activo));
      });
      if (nombre) nombre.textContent = nombreColor(elegido);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }),
  );
}

function poblarSectoresUsuario(valorPrincipal = null, valorSecundario = null) {
  const principal = $("adminUsuarioSector");
  const secundario = $("adminUsuarioSectorSecundario");
  if (!principal || !secundario) return;

  const actualPrincipal =
    valorPrincipal === null ? principal.value : String(valorPrincipal || "");
  const actualSecundario =
    valorSecundario === null ? secundario.value : String(valorSecundario || "");

  const opcionesPrincipal = sectores.filter(
    (sector) =>
      (sector.activo || sector.id === actualPrincipal) &&
      sector.id !== actualSecundario,
  );
  const opcionesSecundario = sectores.filter(
    (sector) =>
      (sector.activo || sector.id === actualSecundario) &&
      sector.id !== actualPrincipal,
  );

  principal.innerHTML =
    `<option value="">Sin sector</option>` +
    opcionesPrincipal
      .map(
        (sector) =>
          `<option value="${sector.id}">${escaparHtml(sector.nombre)}${sector.activo ? "" : " (inactivo)"}</option>`,
      )
      .join("");
  secundario.innerHTML =
    `<option value="">Sin segundo sector</option>` +
    opcionesSecundario
      .map(
        (sector) =>
          `<option value="${sector.id}">${escaparHtml(sector.nombre)}${sector.activo ? "" : " (inactivo)"}</option>`,
      )
      .join("");

  principal.value = opcionesPrincipal.some((sector) => sector.id === actualPrincipal)
    ? actualPrincipal
    : "";
  secundario.value = opcionesSecundario.some((sector) => sector.id === actualSecundario)
    ? actualSecundario
    : "";
  if (principal.value && principal.value === secundario.value) secundario.value = "";
  actualizarSelectoresUsuario();
}
function iconoSector(sec) {
  const nombre = normalizarTexto(sec?.nombre || "");
  if (/deposito|almacen/.test(nombre)) return "#icon-warehouse";
  if (/verduler|fruta|vegetal/.test(nombre)) return "#icon-leaf";
  if (/fiambr|lacteo|queso/.test(nombre)) return "#icon-food";
  if (/carnicer|carne/.test(nombre)) return "#icon-tag";
  if (/admin|oficina/.test(nombre)) return "#icon-clipboard";
  if (/caja|checkout|venta/.test(nombre)) return "#icon-store";
  return "#icon-building";
}

function renderPaginacionSectores(total) {
  const cont = $("adminSectoresPaginacion");
  if (!cont) return;
  if (!total) { cont.innerHTML = ""; return; }
  const paginas = Math.max(1, Math.ceil(total / adminSectoresPorPagina));
  adminSectoresPagina = Math.min(Math.max(1, adminSectoresPagina), paginas);
  const botones = [];
  botones.push(`<button type="button" data-sector-page="${Math.max(1, adminSectoresPagina - 1)}" ${adminSectoresPagina === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>`);
  for (let i = 1; i <= paginas; i += 1) {
    if (paginas > 7 && i > 2 && i < paginas - 1 && Math.abs(i - adminSectoresPagina) > 1) {
      if (!botones.at(-1)?.includes("ellipsis")) botones.push('<span class="admin-pagination-ellipsis">…</span>');
      continue;
    }
    botones.push(`<button type="button" data-sector-page="${i}" class="${i === adminSectoresPagina ? "activo" : ""}">${i}</button>`);
  }
  botones.push(`<button type="button" data-sector-page="${Math.min(paginas, adminSectoresPagina + 1)}" ${adminSectoresPagina === paginas ? "disabled" : ""} aria-label="Página siguiente">›</button>`);
  cont.innerHTML = botones.join("");
  cont.querySelectorAll("button[data-sector-page]").forEach((btn) => btn.addEventListener("click", () => {
    adminSectoresPagina = Number(btn.dataset.sectorPage) || 1;
    renderSectores();
  }));
}

function renderSectores() {
  const cont = $("adminSectoresLista");
  if (!cont) return;
  const q = normalizarTexto($("adminSectoresBuscar")?.value || "");
  const estado = $("adminSectoresFiltroEstado")?.value || "todos";
  const filtrados = sectores.filter((sec) => {
    if (estado === "activo" && sec.activo === false) return false;
    if (estado === "inactivo" && sec.activo !== false) return false;
    if (q && !normalizarTexto(`${sec.nombre || ""} ${sec.supervisorNombre || ""}`).includes(q)) return false;
    return true;
  });

  const paginas = Math.max(1, Math.ceil(filtrados.length / adminSectoresPorPagina));
  adminSectoresPagina = Math.min(Math.max(1, adminSectoresPagina), paginas);
  const inicio = (adminSectoresPagina - 1) * adminSectoresPorPagina;
  const visibles = filtrados.slice(inicio, inicio + adminSectoresPorPagina);

  if (!filtrados.length) {
    cont.innerHTML = `<div class="empty-state">No hay sectores que coincidan con la búsqueda.</div>`;
    establecerTexto("adminSectoresPaginacionResumen", `0 de ${sectores.length} sectores`);
    renderPaginacionSectores(0);
    actualizarMetricasAdmin();
    return;
  }

  cont.innerHTML = visibles.map((sec) => {
    const asignados = usuariosDelSector(sec.id).length;
    const icono = iconoSector(sec);
    return `<article class="admin-sector-row ${sec.activo === false ? "inactivo" : ""}" data-sector-id="${escaparHtml(sec.id)}">
      <div class="admin-sector-cell-main"><span class="admin-sector-row-icon" style="--sector-color:${escaparHtml(sec.color || "#ef3340")}"><svg class="app-icon"><use href="${icono}"></use></svg></span><div><strong>${escaparHtml(sec.nombre)}</strong><small>${escaparHtml(sec.colorNombre || "Color asignado al sector")}</small></div></div>
      <div class="admin-sector-supervisor">${escaparHtml(sec.supervisorNombre || "Sin asignar")}</div>
      <div class="admin-sector-users-count"><strong>${asignados}</strong><span>${asignados === 1 ? "usuario" : "usuarios"}</span></div>
      <div class="admin-sector-products-count"><strong>—</strong><span>sin relación</span></div>
      <div><span class="user-status ${sec.activo === false ? "inactivo" : "activo"}">${sec.activo === false ? "Inactivo" : "Activo"}</span></div>
      <div class="admin-sector-row-actions"><button type="button" class="btn-editar-sector"><svg class="app-icon"><use href="#icon-edit"></use></svg><span>Editar</span></button></div>
    </article>`;
  }).join("");

  cont.querySelectorAll(".btn-editar-sector").forEach((b) => b.addEventListener("click", () => abrirSectorModal(sectorPorId(b.closest("[data-sector-id]").dataset.sectorId))));

  const desde = inicio + 1;
  const hasta = inicio + visibles.length;
  establecerTexto("adminSectoresPaginacionResumen", `Mostrando ${desde} a ${hasta} de ${filtrados.length} sectores`);
  renderPaginacionSectores(filtrados.length);
  actualizarMetricasAdmin();
}

function poblarSupervisoresSector(actual = "") {
  const sel = $("adminSectorSupervisor");
  if (!sel) return;
  const candidatos = usuarios.filter(
    (u) =>
      u.activo &&
      String(u.rol || "")
        .trim()
        .toLowerCase() === "supervisor",
  );
  sel.innerHTML =
    '<option value="">Sin supervisor</option>' +
    candidatos
      .map(
        (u) =>
          `<option value="${u.usuario}">${escaparHtml(u.nombre)} (@${u.usuario})</option>`,
      )
      .join("");
  sel.value = candidatos.some((u) => u.usuario === actual) ? actual : "";
  window.AppSelect?.refresh?.("adminSectorSupervisor");
}

async function abrirSectorModal(sec = null) {
  if (!usuarios.length) await cargarUsuarios().catch(() => {});
  $("adminSectorModalTitulo").textContent = sec ? "Editar sector" : "Nuevo sector";
  if ($("adminSectorModalResumen")) $("adminSectorModalResumen").textContent = sec
    ? "Actualizá la información y configuración del sector."
    : "Creá un nuevo sector y definí su configuración.";
  if ($("btnAdminGuardarSector")) $("btnAdminGuardarSector").textContent = sec ? "Guardar cambios" : "Crear sector";
  $("adminSectorOriginal").value = sec?.id || "";
  $("adminSectorNombre").value = sec?.nombre || "";
  renderPaletaColor("sector", sec?.color || "#b72e35");
  $("adminSectorActivo").checked = sec?.activo !== false;
  $("adminSectorActivoFila")?.classList.remove("oculto");
  $("btnAdminEliminarSector")?.classList.toggle("oculto", !sec);
  $("adminSectorDangerZone")?.classList.toggle("oculto", !sec);
  poblarSupervisoresSector(sec?.supervisor || "");
  $("adminSectorModal").classList.remove("oculto");
  document.body.classList.add("modal-abierto");
  const cuerpoSector = $("adminSectorModal")?.querySelector(".admin-sector-modal-body");
  if (cuerpoSector) cuerpoSector.scrollTop = 0;
  sectorModalInicial = estadoSectorModal();
  actualizarEstadoGuardarSector();
}
function estadoSectorModal() {
  return JSON.stringify({
    nombre: $("adminSectorNombre")?.value || "",
    color: $("adminSectorColor")?.value || "",
    supervisor: $("adminSectorSupervisor")?.value || "",
    activo: Boolean($("adminSectorActivo")?.checked),
  });
}
function actualizarEstadoGuardarSector() {
  const boton = $("btnAdminGuardarSector");
  if (!boton || !sectorModalInicial) return;
  const editando = Boolean($("adminSectorOriginal")?.value);
  const nombreValido = Boolean($("adminSectorNombre")?.value.trim());
  boton.disabled = !nombreValido || (editando && estadoSectorModal() === sectorModalInicial);
}
function cerrarSectorModalDirecto() {
  $("adminSectorModal")?.classList.add("oculto");
  document.body.classList.remove("modal-abierto");
  sectorModalInicial = "";
}
async function cerrarSectorModal() {
  if (
    !$("adminSectorModal") ||
    $("adminSectorModal").classList.contains("oculto")
  )
    return;
  if (sectorModalInicial && estadoSectorModal() !== sectorModalInicial) {
    const salir = await window.AppDialog?.confirm({
      titulo: "Descartar cambios",
      mensaje: "Hay cambios sin guardar en el sector. ¿Querés descartarlos?",
      confirmarTexto: "Descartar",
      cancelarTexto: "Seguir editando",
      peligro: true,
    });
    if (!salir) return;
  }
  cerrarSectorModalDirecto();
}
function mensajeSectores(t, tipo = "ok") {
  const e = $("adminSectoresMensaje");
  if (!e) return;
  e.textContent = t;
  e.className = `admin-message ${tipo}`;
  clearTimeout(mensajeSectores.timer);
  mensajeSectores.timer = setTimeout(() => {
    e.textContent = "";
    e.className = "admin-message";
  }, 3500);
}
async function eliminarSectorActual() {
  const id = $("adminSectorOriginal").value;
  if (!id) return;
  const sec = sectorPorId(id);
  const confirmado = await window.AppDialog?.confirm({
    titulo: "Eliminar sector",
    mensaje: `Se eliminará definitivamente el sector ${sec?.nombre || id}. Esta acción no se puede deshacer.`,
    confirmarTexto: "Eliminar sector",
    cancelarTexto: "Cancelar",
    peligro: true,
  });
  if (!confirmado) return;
  const boton = $("btnAdminEliminarSector");
  if (boton) boton.disabled = true;
  try {
    await api(`/admin/sectores/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    cerrarSectorModalDirecto();
    await Promise.all([cargarSectores(), cargarUsuarios(), cargarHistorialAdministracion()]);
    mensajeSectores("Sector eliminado.");
  } catch (e) {
    mensajeSectores(e.message, "error");
  } finally {
    if (boton) boton.disabled = false;
  }
}
async function guardarSector() {
  const original = $("adminSectorOriginal").value;
  const payload = {
    nombre: $("adminSectorNombre").value.trim(),
    color: $("adminSectorColor").value,
    supervisor: $("adminSectorSupervisor").value,
    activo: $("adminSectorActivo").checked,
  };
  if (!payload.nombre)
    return mensajeSectores("Ingresá el nombre del sector.", "error");
  const boton = $("btnAdminGuardarSector");
  if (boton) boton.disabled = true;
  try {
    if (original)
      await api(`/admin/sectores/${encodeURIComponent(original)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    else
      await api("/admin/sectores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    cerrarSectorModalDirecto();
    await Promise.all([cargarSectores(), cargarUsuarios(), cargarHistorialAdministracion()]);
    mensajeSectores(original ? "Sector actualizado." : "Sector creado.");
  } catch (e) {
    mensajeSectores(e.message, "error");
  } finally {
    if (boton && !$("adminSectorModal")?.classList.contains("oculto")) actualizarEstadoGuardarSector();
  }
}

function cantidadModulosUsuario(u) {
  return u?.rol === "administrador"
    ? MODULOS_PERMISO.length
    : MODULOS_PERMISO.filter((m) => permisosCompatibles(u?.permisos)[m]).length;
}

function tonoAvatarUsuario(u) {
  const clave = String(u?.usuario || u?.nombre || "usuario");
  let hash = 0;
  for (let i = 0; i < clave.length; i += 1) hash = ((hash << 5) - hash + clave.charCodeAt(i)) | 0;
  return `avatar-tone-${Math.abs(hash) % 5}`;
}

async function cargarUsuarios() {
  const data = await api("/admin/usuarios");
  let recibidos = Array.isArray(data.usuarios) ? data.usuarios : [];
  // Evita presentar un cero transitorio si Google Sheets responde vacío durante una recarga.
  if (!recibidos.length && !adminUsuariosCargados) {
    await new Promise((resolve) => setTimeout(resolve, 220));
    const reintento = await api("/admin/usuarios").catch(() => null);
    if (Array.isArray(reintento?.usuarios) && reintento.usuarios.length) recibidos = reintento.usuarios;
  }
  usuarios = recibidos;
  adminUsuariosCargados = true;
  adminUsuariosSeleccionados = new Set([...adminUsuariosSeleccionados].filter((id) => usuarios.some((u) => u.usuario === id)));
  establecerTexto("adminUsuariosSistema", usuarios.filter((u) => u.activo !== false).length);
  establecerTexto("adminUsuariosSistemaDetalle", "Activos");
  poblarFiltroSectoresUsuarios();
  actualizarMetricasAdmin();
  renderUsuarios();
}

function renderUsuarios() {
  const cont = $("adminUsuariosLista");
  if (!cont) return;
  const q = normalizarTexto($("adminUsuariosBuscar")?.value || "");
  const estado = $("adminUsuariosFiltroEstado")?.value || "todos";
  const sector = $("adminUsuariosFiltroSector")?.value || "todos";
  const rol = $("adminUsuariosFiltroRol")?.value || "todos";
  const orden = $("adminUsuariosOrden")?.value || "nombre";
  let filtrados = usuarios.filter((u) => {
    if (estado === "activo" && u.activo === false) return false;
    if (estado === "inactivo" && u.activo !== false) return false;
    if (rol !== "todos" && u.rol !== rol) return false;
    const idsSectores = [u.sector, ...(Array.isArray(u.sectores) ? u.sectores : [])].filter(Boolean);
    if (sector === "sin-sector" && idsSectores.length) return false;
    if (sector !== "todos" && sector !== "sin-sector" && !idsSectores.includes(sector)) return false;
    if (q) {
      const nombresSectores = idsSectores.map((id) => sectorPorId(id)?.nombre || "").join(" ");
      const texto = normalizarTexto(`${u.nombre || ""} ${u.usuario || ""} ${etiquetaRol(u.rol)} ${nombresSectores}`);
      if (!texto.includes(q)) return false;
    }
    return true;
  });
  filtrados.sort((a,b) => {
    if (orden === "rol") return etiquetaRol(a.rol).localeCompare(etiquetaRol(b.rol), "es") || String(a.nombre||a.usuario).localeCompare(String(b.nombre||b.usuario), "es");
    if (orden === "estado") return Number(a.activo === false) - Number(b.activo === false) || String(a.nombre||a.usuario).localeCompare(String(b.nombre||b.usuario), "es");
    return String(a.nombre||a.usuario).localeCompare(String(b.nombre||b.usuario), "es");
  });
  const paginas = Math.max(1, Math.ceil(filtrados.length / adminUsuariosPorPagina));
  adminUsuariosPagina = Math.min(Math.max(1, adminUsuariosPagina), paginas);
  const inicio = (adminUsuariosPagina - 1) * adminUsuariosPorPagina;
  const visibles = filtrados.slice(inicio, inicio + adminUsuariosPorPagina);
  cont.classList.toggle("vista-lista", adminUsuariosVista === "list");
  if (!visibles.length) {
    const mensajeVacio = adminUsuariosCargados && !usuarios.length ? "No hay usuarios registrados en el sistema." : "No hay usuarios que coincidan con los filtros.";
    cont.innerHTML = `<div class="empty-state">${mensajeVacio}</div>`;
  } else {
    cont.innerHTML = visibles.map((u) => {
      const cantidadModulos = cantidadModulosUsuario(u);
      const rolTexto = etiquetaRol(u.rol);
      const sectorTexto = u.rol === "administrador" ? "Todos los sectores" : (sectorPorId(u.sector)?.nombre || "Sin sector");
      const iniciales = (u.nombre || u.usuario || "U").split(/\s+/).map((p) => p[0]).join("").slice(0,2).toUpperCase();
      const seleccionado = adminUsuariosSeleccionados.has(u.usuario);
      const tonoAvatar = tonoAvatarUsuario(u);
      return `<article class="admin-user-card admin-user-card-official ${u.activo === false ? "inactivo" : ""}" data-usuario="${escaparHtml(u.usuario)}">
        <label class="admin-user-card-check"><input type="checkbox" class="admin-user-select" aria-label="Seleccionar ${escaparHtml(u.nombre || u.usuario)}" ${seleccionado ? "checked" : ""}></label>
        <div class="admin-user-card-top"><span class="admin-avatar ${tonoAvatar}">${escaparHtml(iniciales)}</span><div class="admin-user-title"><strong>${escaparHtml(u.nombre || u.usuario)}</strong><span>@${escaparHtml(u.usuario)}</span></div><span class="user-status ${u.activo === false ? "inactivo" : "activo"}">${u.activo === false ? "Inactivo" : "Activo"}</span></div>
        <span class="admin-role-pill ${colorRol(u.rol)}">${escaparHtml(rolTexto)}</span>
        <div class="admin-user-card-meta"><div><small>Sector</small><strong>${escaparHtml(sectorTexto)}</strong></div><div><small>Módulos</small><strong class="admin-module-badge">${cantidadModulos}</strong></div></div>
        <div class="admin-user-card-buttons"><button type="button" class="btn-editar-usuario"><svg class="app-icon"><use href="#icon-edit"></use></svg><span>Editar</span></button><button type="button" class="btn-eliminar-usuario"><svg class="app-icon"><use href="#icon-close"></use></svg><span>Eliminar</span></button></div>
      </article>`;
    }).join("");
  }
  cont.querySelectorAll(".btn-editar-usuario").forEach((btn) => btn.addEventListener("click", () => abrirEditarUsuario(btn.closest("[data-usuario]").dataset.usuario)));
  cont.querySelectorAll(".btn-eliminar-usuario").forEach((btn) => btn.addEventListener("click", () => eliminarUsuario(btn.closest("[data-usuario]").dataset.usuario)));
  cont.querySelectorAll(".admin-user-select").forEach((input) => input.addEventListener("change", () => {
    const clave = input.closest("[data-usuario]")?.dataset.usuario;
    if (!clave) return;
    if (input.checked) adminUsuariosSeleccionados.add(clave); else adminUsuariosSeleccionados.delete(clave);
    actualizarSeleccionUsuarios(visibles);
  }));

  const resumen = $("adminUsuariosPaginacionResumen");
  if (resumen) resumen.textContent = filtrados.length ? `Mostrando ${inicio + 1} a ${Math.min(inicio + visibles.length, filtrados.length)} de ${filtrados.length} usuarios` : `0 usuarios`;
  const pag = $("adminUsuariosPaginacion");
  if (pag) {
    const botones = [];
    botones.push(`<button type="button" data-page="${Math.max(1, adminUsuariosPagina-1)}" ${adminUsuariosPagina===1?'disabled':''}>‹</button>`);
    for (let i=1; i<=paginas; i++) {
      if (paginas > 7 && i > 2 && i < paginas-1 && Math.abs(i-adminUsuariosPagina)>1) { if (!botones.some((x)=>x.includes('data-ellipsis'))) botones.push('<span data-ellipsis>…</span>'); continue; }
      botones.push(`<button type="button" data-page="${i}" class="${i===adminUsuariosPagina?'activo':''}">${i}</button>`);
    }
    botones.push(`<button type="button" data-page="${Math.min(paginas, adminUsuariosPagina+1)}" ${adminUsuariosPagina===paginas?'disabled':''}>›</button>`);
    pag.innerHTML = botones.join("");
    pag.querySelectorAll("button[data-page]").forEach((b) => b.addEventListener("click", () => { adminUsuariosPagina = Number(b.dataset.page)||1; renderUsuarios(); }));
  }
  actualizarSeleccionUsuarios(visibles);
  actualizarMetricasAdmin();
}

function actualizarSeleccionUsuarios(visibles = []) {
  const cantidad = adminUsuariosSeleccionados.size;
  establecerTexto("adminUsuariosSeleccionResumen", `${cantidad} seleccionado${cantidad === 1 ? "" : "s"}`);
  const accion = $("adminUsuariosAccionMasiva");
  if (accion) accion.disabled = cantidad === 0;
  const todos = $("adminUsuariosSeleccionarTodos");
  if (todos) {
    const claves = visibles.map((u) => u.usuario);
    todos.checked = Boolean(claves.length && claves.every((id) => adminUsuariosSeleccionados.has(id)));
    todos.indeterminate = Boolean(claves.some((id) => adminUsuariosSeleccionados.has(id)) && !todos.checked);
  }
}

async function aplicarAccionMasivaUsuarios(accion) {
  const seleccion = usuarios.filter((u) => adminUsuariosSeleccionados.has(u.usuario));
  if (!seleccion.length || !["activar", "desactivar"].includes(accion)) return;
  const activo = accion === "activar";
  const confirmado = await window.AppDialog?.confirm({
    titulo: activo ? "Activar usuarios" : "Desactivar usuarios",
    mensaje: `${activo ? "Se activarán" : "Se desactivarán"} ${seleccion.length} usuario${seleccion.length === 1 ? "" : "s"}.`,
    confirmarTexto: activo ? "Activar" : "Desactivar",
    cancelarTexto: "Cancelar",
    peligro: !activo,
  });
  if (!confirmado) return;
  for (const u of seleccion) {
    if (!activo && u.usuario === window.AutoservicioAuth?.getUsuario?.()?.usuario) continue;
    await api(`/admin/usuarios/${encodeURIComponent(u.usuario)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo }) });
  }
  adminUsuariosSeleccionados.clear();
  await cargarUsuarios();
  mensaje(activo ? "Usuarios activados." : "Usuarios desactivados.", "ok");
}

async function eliminarUsuario(clave) {
  const u = usuarios.find((x) => x.usuario === clave);
  if (!u) return;
  const confirmado = await window.AppDialog?.confirm({
    titulo: "Eliminar usuario",
    mensaje: `Se eliminará definitivamente a ${u.nombre || u.usuario}. Esta acción no se puede deshacer.`,
    confirmarTexto: "Eliminar usuario",
    cancelarTexto: "Cancelar",
    peligro: true,
  });
  if (!confirmado) return;
  const tarjeta = document.querySelector(
    `[data-usuario="${CSS.escape(clave)}"]`,
  );
  const botones = tarjeta?.querySelectorAll("button") || [];
  botones.forEach((b) => (b.disabled = true));
  try {
    await api(`/admin/usuarios/${encodeURIComponent(clave)}`, {
      method: "DELETE",
    });
    await Promise.all([cargarUsuarios(), cargarSectores(), cargarHistorialAdministracion()]);
    mensaje("Usuario eliminado", "ok");
  } catch (e) {
    mensaje(e.message, "error");
    botones.forEach((b) => (b.disabled = false));
  }
}

function actualizarAccionesModalUsuario(editando) {
  const eliminar = $("btnAdminEliminarUsuario");
  const acciones = $("adminUsuarioModalAcciones");
  eliminar?.classList.toggle("oculto", !editando);
  acciones?.classList.toggle("solo-guardar", !editando);
}

async function abrirNuevoUsuario() {
  if (!sectores.length) await cargarSectores().catch(() => {});
  $("adminUsuarioModalTitulo").textContent = "Crear usuario";
  $("adminUsuarioModalKicker").textContent = "Nuevo acceso";
  $("adminUsuarioModalResumen").textContent = "Completá los datos y permisos";
  $("adminUsuarioAvatarModal").textContent = "U";
  $("adminUsuarioOriginal").value = "";
  $("adminUsuarioNombre").value = "";
  $("adminUsuarioUsuario").value = "";
  $("adminUsuarioUsuario").disabled = false;
  $("adminUsuarioPassword").value = "";
  restablecerVisibilidadPasswordUsuario();
  $("adminUsuarioPassword").placeholder = "Mínimo 8 caracteres";
  if ($("adminUsuarioPasswordAyuda")) $("adminUsuarioPasswordAyuda").textContent = "Mínimo 8 caracteres.";
  if ($("btnAdminGuardarUsuario")) $("btnAdminGuardarUsuario").textContent = "Crear usuario";
  actualizarAccionesModalUsuario(false);
  $("adminUsuarioRol").value = "personal";
  poblarSectoresUsuario("", "");
  aplicarPermisosModal(null, "personal");
  $("adminUsuarioActivo").checked = true;
  $("adminUsuarioActivoFila").classList.add("oculto");
  $("adminUsuarioEstadoSeccion")?.classList.add("oculto");
  limpiarMensajeUsuarioModal();
  cerrarSelectorPermisosUsuario();
  cerrarSelectoresInlineUsuario();
  actualizarResumenPermisosUsuario();
  $("adminUsuarioModal").classList.remove("oculto");
  document.body.classList.add("modal-abierto");
  const cuerpoUsuario = $("adminUsuarioModal")?.querySelector(".admin-user-modal-body");
  if (cuerpoUsuario) cuerpoUsuario.scrollTop = 0;
  usuarioModalInicial = estadoUsuarioModal();
  actualizarEstadoGuardarUsuario();
}

function abrirEditarUsuario(clave) {
  const u = usuarios.find((x) => x.usuario === clave);
  if (!u) return;
  $("adminUsuarioModalTitulo").textContent = "Editar usuario";
  $("adminUsuarioModalKicker").textContent = "Gestión de usuarios";
  $("adminUsuarioModalResumen").textContent =
    `${u.nombre} · ${etiquetaRol(u.rol)}`;
  $("adminUsuarioAvatarModal").textContent = (u.nombre || u.usuario || "U")
    .slice(0, 1)
    .toUpperCase();
  $("adminUsuarioOriginal").value = u.usuario;
  $("adminUsuarioNombre").value = u.nombre;
  $("adminUsuarioUsuario").value = u.usuario;
  $("adminUsuarioUsuario").disabled = true;
  $("adminUsuarioPassword").value = "";
  restablecerVisibilidadPasswordUsuario();
  $("adminUsuarioPassword").placeholder = "Dejar vacío para no cambiar";
  if ($("adminUsuarioPasswordAyuda")) $("adminUsuarioPasswordAyuda").textContent = "Dejá el campo vacío para conservar la contraseña actual.";
  if ($("btnAdminGuardarUsuario")) $("btnAdminGuardarUsuario").textContent = "Guardar cambios";
  actualizarAccionesModalUsuario(true);
  const rol = [
    "administrador",
    "administracion",
    "supervisor",
    "personal",
  ].includes(String(u.rol || "").toLowerCase())
    ? String(u.rol).toLowerCase()
    : "personal";
  $("adminUsuarioRol").value = rol;
  poblarSectoresUsuario(
    u.sector || "",
    (u.sectores || []).find((x) => x && x !== u.sector) || "",
  );
  aplicarPermisosModal(u.permisos, rol);
  $("adminUsuarioActivo").checked = u.activo !== false;
  $("adminUsuarioActivoFila").classList.remove("oculto");
  $("adminUsuarioEstadoSeccion")?.classList.remove("oculto");
  limpiarMensajeUsuarioModal();
  cerrarSelectorPermisosUsuario();
  cerrarSelectoresInlineUsuario();
  actualizarResumenPermisosUsuario();
  $("adminUsuarioModal").classList.remove("oculto");
  document.body.classList.add("modal-abierto");
  const cuerpoUsuario = $("adminUsuarioModal")?.querySelector(".admin-user-modal-body");
  if (cuerpoUsuario) cuerpoUsuario.scrollTop = 0;
  usuarioModalInicial = estadoUsuarioModal();
  actualizarEstadoGuardarUsuario();
}

function estadoUsuarioModal() {
  return JSON.stringify({
    nombre: $("adminUsuarioNombre")?.value || "",
    usuario: $("adminUsuarioUsuario")?.value || "",
    rol: $("adminUsuarioRol")?.value || "",
    sector: $("adminUsuarioSector")?.value || "",
    sector2: $("adminUsuarioSectorSecundario")?.value || "",
    activo: Boolean($("adminUsuarioActivo")?.checked),
    permisos: leerPermisosModal(),
    password: $("adminUsuarioPassword")?.value || "",
  });
}

function actualizarEstadoGuardarUsuario() {
  const boton = $("btnAdminGuardarUsuario");
  if (!boton || $("adminUsuarioModal")?.classList.contains("oculto")) return;
  const editando = Boolean($("adminUsuarioOriginal")?.value);
  const sinCambios = editando && Boolean(usuarioModalInicial) && estadoUsuarioModal() === usuarioModalInicial;
  boton.disabled = sinCambios;
  boton.setAttribute("aria-disabled", String(sinCambios));
  boton.title = sinCambios ? "Modificá algún dato para guardar cambios" : "";
}

function restablecerVisibilidadPasswordUsuario() {
  const input = $("adminUsuarioPassword");
  const boton = $("btnAdminUsuarioPasswordVisible");
  if (input) input.type = "password";
  if (boton) {
    boton.setAttribute("aria-pressed", "false");
    boton.setAttribute("aria-label", "Mostrar contraseña");
    const use = boton.querySelector("use");
    if (use) use.setAttribute("href", "#icon-eye");
  }
}

function alternarVisibilidadPasswordUsuario() {
  const input = $("adminUsuarioPassword");
  const boton = $("btnAdminUsuarioPasswordVisible");
  if (!input || !boton) return;
  const mostrar = input.type === "password";
  input.type = mostrar ? "text" : "password";
  boton.setAttribute("aria-pressed", String(mostrar));
  boton.setAttribute("aria-label", mostrar ? "Ocultar contraseña" : "Mostrar contraseña");
  const use = boton.querySelector("use");
  if (use) use.setAttribute("href", mostrar ? "#icon-eye-off" : "#icon-eye");
  input.focus({ preventScroll: true });
}

function asegurarMensajeUsuarioModal() {
  let el = $("adminUsuarioModalMensaje");
  if (el) return el;
  const acciones = $("btnAdminGuardarUsuario")?.parentElement;
  if (!acciones) return null;
  el = document.createElement("div");
  el.id = "adminUsuarioModalMensaje";
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "assertive");
  Object.assign(el.style, {
    display: "none",
    flexBasis: "100%",
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 12px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1.35",
    textAlign: "left",
  });
  acciones.style.flexWrap = "wrap";
  acciones.prepend(el);
  return el;
}

function mensajeUsuarioModal(texto = "", tipo = "error") {
  const el = asegurarMensajeUsuarioModal();
  if (!el) return mensaje(texto, tipo);
  const visible = Boolean(String(texto || "").trim());
  el.textContent = visible ? texto : "";
  el.style.display = visible ? "block" : "none";
  el.style.background = tipo === "ok" ? "#e8f7ee" : "#fff0f1";
  el.style.color = tipo === "ok" ? "#167344" : "#b4232d";
  el.style.border = tipo === "ok" ? "1px solid #b8e6ca" : "1px solid #f3c2c6";
}

function limpiarMensajeUsuarioModal() {
  mensajeUsuarioModal("");
}

function cerrarUsuarioModalDirecto() {
  limpiarMensajeUsuarioModal();
  cerrarSelectorPermisosUsuario();
  cerrarSelectoresInlineUsuario();
  restablecerVisibilidadPasswordUsuario();
  $("adminUsuarioModal")?.classList.add("oculto");
  document.body.classList.remove("modal-abierto");
  usuarioModalInicial = "";
}
async function cerrarUsuarioModal() {
  if (
    !$("adminUsuarioModal") ||
    $("adminUsuarioModal").classList.contains("oculto")
  )
    return;
  if (usuarioModalInicial && estadoUsuarioModal() !== usuarioModalInicial) {
    const salir = await window.AppDialog?.confirm({
      titulo: "Descartar cambios",
      mensaje: "Hay cambios sin guardar en el usuario. ¿Querés descartarlos?",
      confirmarTexto: "Descartar",
      cancelarTexto: "Seguir editando",
      peligro: true,
    });
    if (!salir) return;
  }
  cerrarUsuarioModalDirecto();
}

async function guardarUsuario() {
  const original = $("adminUsuarioOriginal").value;
  const payload = {
    nombre: $("adminUsuarioNombre").value.trim(),
    usuario: $("adminUsuarioUsuario").value.trim(),
    password: $("adminUsuarioPassword").value,
    rol: $("adminUsuarioRol").value,
    permisos: leerPermisosModal(),
    sector: $("adminUsuarioSector")?.value || "",
    sectores: [
      $("adminUsuarioSector")?.value || "",
      $("adminUsuarioSectorSecundario")?.value || "",
    ].filter(Boolean),
    activo: $("adminUsuarioActivo").checked,
  };
  limpiarMensajeUsuarioModal();
  if (!original && !/^[a-z0-9._-]{3,30}$/i.test(payload.usuario)) {
    $("adminUsuarioUsuario")?.focus();
    return mensajeUsuarioModal(
      "El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.",
      "error",
    );
  }
  if (!original && payload.password.length < 8) {
    $("adminUsuarioPassword")?.focus();
    return mensajeUsuarioModal(
      "La contraseña debe tener al menos 8 caracteres.",
      "error",
    );
  }
  if (original && payload.password && payload.password.length < 8) {
    $("adminUsuarioPassword")?.focus();
    return mensajeUsuarioModal(
      "La contraseña debe tener al menos 8 caracteres.",
      "error",
    );
  }
  if (payload.rol === "supervisor" && !payload.sector)
    return mensajeUsuarioModal(
      "Seleccioná al menos un sector para el supervisor.",
      "error",
    );
  if (
    payload.sectores.length === 2 &&
    payload.sectores[0] === payload.sectores[1]
  )
    return mensajeUsuarioModal(
      "El segundo sector debe ser diferente del principal.",
      "error",
    );
  const btn = $("btnAdminGuardarUsuario");
  btn.disabled = true;
  try {
    if (original)
      await api(`/admin/usuarios/${encodeURIComponent(original)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    else
      await api("/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    cerrarUsuarioModalDirecto();
    mensaje(original ? "Usuario actualizado" : "Usuario creado", "ok");
    await Promise.all([cargarUsuarios(), cargarSectores(), cargarHistorialAdministracion()]);
  } catch (e) {
    mensajeUsuarioModal(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function escaparHtml(valor = "") {
  return String(valor).replace(
    /[&<>'"]/g,
    (caracter) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[caracter],
  );
}

function normalizarTexto(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fechaHistorialAFecha(valor = "", hora = "") {
  const texto = String(valor).trim();
  let partes;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    partes = texto.split("-").map(Number);
    const [anio, mes, dia] = partes;
    const [h = 0, m = 0, seg = 0] = String(hora).split(":").map(Number);
    return new Date(anio, mes - 1, dia, h, m, seg);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(texto)) {
    partes = texto.split("/").map(Number);
    let [dia, mes, anio] = partes;
    if (anio < 100) anio += 2000;
    const [h = 0, m = 0, seg = 0] = String(hora).split(":").map(Number);
    return new Date(anio, mes - 1, dia, h, m, seg);
  }
  const fecha = new Date(`${texto} ${hora}`.trim());
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function inicioDelDia(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function accionNormalizada(accion = "") {
  return normalizarTexto(accion).replace(/[^a-z]/g, "");
}

function obtenerHistorialFiltrado() {
  const usuario = $("adminHistorialUsuario")?.value || "";
  const accion = $("adminHistorialAccion")?.value || "";
  const busqueda = normalizarTexto($("adminHistorialBuscar")?.value || "");
  const ahora = new Date();
  const hoy = inicioDelDia(ahora);

  return historialVencimientos.filter((item) => {
    const fecha = fechaHistorialAFecha(item.fecha, item.hora);
    if (historialPeriodo !== "todo") {
      if (!fecha) return false;
      const inicio = new Date(hoy);
      const dias =
        historialPeriodo === "hoy" ? 0 : Number(historialPeriodo) - 1;
      inicio.setDate(inicio.getDate() - dias);
      if (fecha < inicio || fecha > ahora) return false;
    }
    const claveUsuario = item.usuario || item.nombre || "";
    if (usuario && claveUsuario !== usuario) return false;
    if (accion && accionNormalizada(item.accion) !== accion) return false;
    if (busqueda) {
      const contenido = normalizarTexto(
        `${item.articulo || ""} ${item.codigo || ""}`,
      );
      const terminos = busqueda.split(/\s+/).filter(Boolean);
      if (!terminos.every((termino) => contenido.includes(termino)))
        return false;
    }
    return true;
  });
}

function actualizarUsuariosHistorial() {
  const select = $("adminHistorialUsuario");
  if (!select) return;
  const actual = select.value;
  const mapa = new Map();
  historialVencimientos.forEach((item) => {
    const clave = item.usuario || item.nombre || "";
    if (clave) mapa.set(clave, item.nombre || item.usuario || clave);
  });
  const opciones = [...mapa.entries()].sort((a, b) =>
    a[1].localeCompare(b[1], "es"),
  );
  select.innerHTML =
    '<option value="">Todos</option>' +
    opciones
      .map(
        ([valor, etiqueta]) =>
          `<option value="${escaparHtml(valor)}">${escaparHtml(etiqueta)}</option>`,
      )
      .join("");
  if ([...select.options].some((opcion) => opcion.value === actual))
    select.value = actual;
}

function inicialesHistorial(nombre = "") {
  return String(nombre || "U")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) => parte[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";
}

function formatearHoraVisible(valor = "") {
  const match = String(valor || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(valor || "").trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function datosAccionHistorial(accion = "") {
  const clave = accionNormalizada(accion);
  if (clave === "elimino") return { clave, etiqueta: "Eliminó", icono: "#icon-trash" };
  if (clave === "creo") return { clave, etiqueta: "Creó", icono: "#icon-plus-circle" };
  if (clave === "edito") return { clave, etiqueta: "Editó", icono: "#icon-edit" };
  return { clave: clave || "movimiento", etiqueta: accion || "Movimiento", icono: "#icon-clock" };
}

function datosCambioHistorial(item = {}) {
  const detalle = String(item.detalle || "").trim();
  const match = detalle.match(/Antes:\s*([^·]+?)\s*·\s*Después:\s*(.+)$/i);
  if (!match) return null;
  const antes = match[1].trim().split(/\s*\/\s*/);
  const despues = match[2].trim().split(/\s*\/\s*/);
  return {
    fechaAntes: formatearFechaVisible(antes[0] || ""),
    fechaDespues: formatearFechaVisible(despues[0] || ""),
    cantidadAntes: String(antes[1] || "").trim(),
    cantidadDespues: String(despues[1] || "").trim(),
  };
}

function valorVencimientoHistorial(item = {}) {
  const cambio = datosCambioHistorial(item);
  const actual = formatearFechaVisible(item.vencimiento || "") || "—";
  if (accionNormalizada(item.accion) === "edito" && cambio?.fechaAntes && cambio?.fechaDespues && cambio.fechaAntes !== cambio.fechaDespues) {
    return `<span>${escaparHtml(cambio.fechaAntes)}</span><b class="admin-history-arrow">→</b><span>${escaparHtml(cambio.fechaDespues)}</span>`;
  }
  return `<span>${escaparHtml(actual)}</span>`;
}

function cantidadDetalleHistorial(item = {}) {
  const detalle = String(item.detalle || "").trim();
  const match = detalle.match(/(?:^|[·;\s])Cantidad:\s*(-?\d+(?:[.,]\d+)?)/i);
  return match ? String(match[1]).replace(",", ".").trim() : "";
}

function valorCantidadHistorial(item = {}) {
  const cambio = datosCambioHistorial(item);
  const actual = String(item.cantidad ?? "").trim();
  if (accionNormalizada(item.accion) === "edito" && cambio?.cantidadAntes && cambio?.cantidadDespues && cambio.cantidadAntes !== cambio.cantidadDespues) {
    return `<span>${escaparHtml(cambio.cantidadAntes)}</span><b class="admin-history-arrow">→</b><span>${escaparHtml(cambio.cantidadDespues)}</span>`;
  }
  const cantidad = actual || cambio?.cantidadDespues || cantidadDetalleHistorial(item);
  return `<span>${escaparHtml(cantidad || "—")}</span>`;
}

function renderResumenHistorial(items) {
  const cont = $("adminHistorialResumen");
  if (!cont) return;
  const periodoTexto = historialPeriodo === "hoy" ? "Hoy" : historialPeriodo === "todo" ? "Todo el historial" : `Últimos ${historialPeriodo} días`;
  const total = `<div class="admin-history-total-card"><span class="admin-history-total-icon"><svg class="app-icon" aria-hidden="true"><use href="#icon-trend-up"></use></svg></span><div><small>Movimientos totales</small><strong>${items.length}</strong><span>${items.length ? periodoTexto : "Sin resultados"}</span></div></div>`;
  if (!items.length) {
    cont.innerHTML = total;
    cont.classList.add("is-empty");
    return;
  }
  cont.classList.remove("is-empty");
  const usuarios = new Map();
  items.forEach((item) => {
    const nombre = item.nombre || item.usuario || "Sin usuario";
    usuarios.set(nombre, (usuarios.get(nombre) || 0) + 1);
  });
  const tonos = ["red", "violet", "green", "amber", "blue", "cyan"];
  const detalle = [...usuarios.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, 6)
    .map(([nombre, cantidad], index) => `<span class="history-user-stat tone-${tonos[index % tonos.length]}"><b>${escaparHtml(inicialesHistorial(nombre))}</b><em><strong>${escaparHtml(nombre)}</strong><small>${cantidad}</small></em></span>`)
    .join("");
  cont.innerHTML = `${total}<div class="admin-history-summary-users">${detalle}</div>`;
}

function formatearFechaVisible(valor = "") {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return texto.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => `${d}/${m}/${y}`);
}

function renderHistorialVencimientos() {
  const cont = $("adminHistorialLista");
  const botonMas = $("btnAdminHistorialMas");
  if (!cont) return;
  const filtrados = obtenerHistorialFiltrado();
  renderResumenHistorial(filtrados);
  if (!filtrados.length) {
    cont.innerHTML = '<div class="empty-state admin-history-empty"><svg class="app-icon"><use href="#icon-clock"></use></svg><strong>Sin movimientos</strong><span>No hay movimientos que coincidan con los filtros.</span></div>';
    botonMas?.classList.add("oculto");
    renderPaginacionHistorial(0, 1);
    return;
  }
  historialPorPagina = Math.max(1, Number($("adminHistorialPorPagina")?.value || historialPorPagina || 10));
  const paginas = Math.max(1, Math.ceil(filtrados.length / historialPorPagina));
  historialPagina = Math.min(Math.max(1, historialPagina), paginas);
  const inicioPagina = (historialPagina - 1) * historialPorPagina;
  const visibles = filtrados.slice(inicioPagina, inicioPagina + historialPorPagina);
  cont.innerHTML = visibles.map((h, indice) => {
    const accion = datosAccionHistorial(h.accion);
    const articulo = escaparHtml(h.articulo || "Producto");
    const usuarioNombre = h.nombre || h.usuario || "Sin usuario";
    const usuario = escaparHtml(usuarioNombre);
    const codigo = escaparHtml(h.codigo || "");
    const fecha = escaparHtml(formatearFechaVisible(h.fecha || "—"));
    const hora = escaparHtml(formatearHoraVisible(h.hora || ""));
    return `<article class="admin-history-card accion-${accion.clave}" data-history-index="${inicioPagina + indice}">
      <div class="admin-history-toggle">
        <span class="admin-history-action"><svg class="app-icon" aria-hidden="true"><use href="${accion.icono}"></use></svg><span>${escaparHtml(accion.etiqueta)}</span></span>
        <span class="admin-history-product"><strong>${articulo}</strong><small>${codigo ? `Código: ${codigo}` : "Sin código"}</small></span>
        <span class="admin-history-detail-summary"><strong>${valorVencimientoHistorial(h)}</strong></span>
        <span class="admin-history-date"><strong><span>${fecha}</span>${hora ? `<span>${hora}</span>` : ""}</strong></span>
        <span class="admin-history-user"><span class="admin-history-user-avatar">${escaparHtml(inicialesHistorial(usuarioNombre))}</span><strong>${usuario}</strong></span>
        <span class="admin-history-quantity"><strong>${valorCantidadHistorial(h)}</strong></span>
      </div>
    </article>`;
  }).join("");
  botonMas?.classList.add("oculto");
  renderPaginacionHistorial(filtrados.length, paginas);
}

function renderPaginacionHistorial(total, paginas) {
  const cont = $("adminHistorialPaginacion");
  if (!cont) return;
  if (!total) {
    cont.innerHTML = "";
    return;
  }
  const botones = [];
  botones.push(`<button type="button" data-history-page="${Math.max(1, historialPagina - 1)}" ${historialPagina === 1 ? "disabled" : ""} aria-label="Página anterior">«</button>`);
  const visibles = new Set();
  if (paginas <= 7) {
    for (let i = 1; i <= paginas; i += 1) visibles.add(i);
  } else {
    [1, 2, 3, paginas, historialPagina - 1, historialPagina, historialPagina + 1].forEach((n) => {
      if (n >= 1 && n <= paginas) visibles.add(n);
    });
  }
  const orden = [...visibles].sort((a, b) => a - b);
  let anterior = 0;
  orden.forEach((pagina) => {
    if (anterior && pagina - anterior > 1) botones.push('<span class="admin-pagination-ellipsis" aria-hidden="true">…</span>');
    botones.push(`<button type="button" data-history-page="${pagina}" class="${pagina === historialPagina ? "activo" : ""}">${pagina}</button>`);
    anterior = pagina;
  });
  botones.push(`<button type="button" data-history-page="${Math.min(paginas, historialPagina + 1)}" ${historialPagina === paginas ? "disabled" : ""} aria-label="Página siguiente">»</button>`);
  cont.innerHTML = botones.join("");
  cont.querySelectorAll("button[data-history-page]").forEach((btn) => btn.addEventListener("click", () => {
    historialPagina = Number(btn.dataset.historyPage) || 1;
    renderHistorialVencimientos();
  }));
}

function reiniciarPaginacionHistorial() {
  historialPagina = 1;
  renderHistorialVencimientos();
}

async function cargarHistorialVencimientos() {
  const data = await api("/admin/historial-vencimientos");
  historialVencimientos = data.historial || [];
  actualizarUsuariosHistorial();
  reiniciarPaginacionHistorial();
}

async function cargarTodo() {
  establecerTexto("adminHomeNombre", window.AutoservicioAuth?.getUsuario?.()?.nombre || window.AutoservicioAuth?.getUsuario?.()?.usuario || "Administrador");
  if ($("adminServidorEstado")) $("adminServidorEstado").textContent = "Comprobando";
  try {
    await cargarUsuarios();
    await Promise.all([cargarResumen(), cargarSectores(), cargarHistorialVencimientos(), cargarHistorialAdministracion()]);
    actualizarMetricasAdmin();
    return true;
  } catch (e) {
    if ($("adminServidorEstado")) $("adminServidorEstado").textContent = "Sin conexión";
    establecerTexto("adminHomeEstado", "Revisar");
    establecerTexto("adminHomeEstadoDetalle", e.message || "No se pudo consultar el servidor");
    mensaje(e.message, "error");
    return false;
  }
}

function cambiarTab(tab) {
  const destino = ["inicio", "usuarios", "sectores", "sistema"].includes(tab) ? tab : "inicio";
  document.querySelectorAll(".admin-tab-panel").forEach((p) => p.classList.toggle("oculto", p.id !== `adminTab-${destino}`));
  document.body.dataset.adminView = destino;
  sessionStorage.setItem("autoservicio_admin_vista", destino);
  if (destino === "usuarios") renderUsuarios();
  if (destino === "sectores") renderSectores();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function actualizarAccionBotonVolverGlobal() {
  const boton = $("adminHeaderBackBtn");
  if (!boton) return;
  const desdeHistorial = document.body.classList.contains("venc-historial-open");
  const etiqueta = desdeHistorial ? "Volver a Vencimientos" : "Volver al inicio de Administración";
  boton.setAttribute("aria-label", etiqueta);
  boton.setAttribute("title", etiqueta);
}

function abrirHistorialVencimientosUI() {
  if (!window.AutoservicioAuth?.esAdmin?.()) return;
  const shell = document.querySelector("#pantallaVencimientos > .venc-pro-shell");
  const historial = $("vencHistorialAdmin");
  shell?.classList.add("oculto");
  historial?.classList.remove("oculto");
  historial?.setAttribute("aria-hidden", "false");
  document.body.classList.add("venc-historial-open");
  actualizarAccionBotonVolverGlobal();
  cargarHistorialVencimientos().catch((e) => mensaje(e.message, "error"));
  window.scrollTo({ top: 0, behavior: "auto" });
}

function cerrarHistorialVencimientosUI() {
  const shell = document.querySelector("#pantallaVencimientos > .venc-pro-shell");
  const historial = $("vencHistorialAdmin");
  historial?.classList.add("oculto");
  historial?.setAttribute("aria-hidden", "true");
  shell?.classList.remove("oculto");
  document.body.classList.remove("venc-historial-open");
  actualizarAccionBotonVolverGlobal();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function abrirAdmin() {
  if (window.AutoservicioAuth?.esAdmin()) mostrarPanel();
  else ocultarPanelAdmin();
}

function normalizarEncabezadoImportacion(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectarColumnasImportacion(filas) {
  const alias = {
    codigo: [
      "codigo",
      "codigo de barras",
      "cod barra",
      "cod barras",
      "ean",
      "barcode",
    ],
    articulo: ["articulo", "descripcion", "producto", "nombre articulo"],
    stock: ["stock", "existencia", "cantidad"],
    precio: [
      "precio",
      "precio venta",
      "precio de venta",
      "p venta",
      "importe",
      "venta",
    ],
    subtotal: ["sub total", "subtotal", "total valuado", "valor total"],
  };
  for (let r = 0; r < Math.min(filas.length, 50); r++) {
    const normalizados = (filas[r] || []).map(normalizarEncabezadoImportacion);
    const buscar = (lista) =>
      normalizados.findIndex((v) =>
        lista.some((a) => v === a || v.includes(a)),
      );
    const encontrados = {
      codigo: buscar(alias.codigo),
      articulo: buscar(alias.articulo),
      stock: buscar(alias.stock),
      precio: buscar(alias.precio),
      subtotal: buscar(alias.subtotal),
    };
    if (encontrados.codigo < 0 || encontrados.articulo < 0) continue;
    const posiciones = Object.entries(encontrados)
      .filter(([, i]) => i >= 0)
      .sort((a, b) => a[1] - b[1]);
    const rangos = {};
    posiciones.forEach(([nombre, inicio], indice) => {
      rangos[nombre] = {
        inicio,
        fin:
          indice + 1 < posiciones.length
            ? posiciones[indice + 1][1]
            : normalizados.length,
      };
    });
    return {
      fila: r,
      rangos,
      formatoValuado: encontrados.precio >= 0 && encontrados.subtotal >= 0,
    };
  }
  return null;
}

function leerCampoImportacion(fila, rango) {
  if (!rango) return "";
  for (let i = rango.inicio; i < rango.fin; i++) {
    const valor = fila?.[i];
    if (valor !== null && valor !== undefined && String(valor).trim() !== "")
      return valor;
  }
  return "";
}

function expandirNotacionCientificaImportacion(texto) {
  const coincidencia = String(texto).match(
    /^([+-]?)(\d+)(?:[.,](\d+))?[eE]([+-]?\d+)$/,
  );
  if (!coincidencia) return String(texto);
  const signo = coincidencia[1] === "-" ? "-" : "";
  const enteros = coincidencia[2];
  const decimales = coincidencia[3] || "";
  const exponente = Number(coincidencia[4]);
  if (!Number.isInteger(exponente) || Math.abs(exponente) > 100)
    return String(texto);
  const digitos = enteros + decimales;
  const posicion = enteros.length + exponente;
  if (posicion <= 0) return signo + "0".repeat(-posicion) + digitos;
  if (posicion >= digitos.length)
    return signo + digitos + "0".repeat(posicion - digitos.length);
  return signo + digitos.slice(0, posicion) + "." + digitos.slice(posicion);
}

function limpiarCodigoImportacion(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  let texto = String(valor)
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^'+/, "")
    .replace(/\s+/g, "");
  if (!texto) return "";
  texto = expandirNotacionCientificaImportacion(texto);
  return texto.replace(/^(\d+)[.,]0+$/, "$1");
}

function claveCodigoImportacion(valor) {
  const codigo = limpiarCodigoImportacion(valor);
  if (!codigo) return "";
  return /^\d+$/.test(codigo) ? codigo.replace(/^0+(?=\d)/, "") : codigo;
}

function parsearPrecioImportacion(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!texto) return null;
  if (texto.includes(",") && texto.includes("."))
    texto =
      texto.lastIndexOf(",") > texto.lastIndexOf(".")
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto.replace(/,/g, "");
  else if (texto.includes(","))
    texto = texto.replace(/\./g, "").replace(",", ".");
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function abrirVistaPreviaImportacion(resumen, archivoNombre) {
  importacionResumenPendiente = resumen;
  $("adminImportarPreviewArchivo").textContent = archivoNombre;
  $("adminImportarPreviewProcesados").textContent = resumen.procesados ?? 0;
  $("adminImportarPreviewTotal").textContent =
    resumen.totalCatalogo ?? resumen.procesados ?? 0;

  const validaciones = Array.isArray(resumen.validaciones)
    ? resumen.validaciones
    : [];
  const cajaValidaciones = $("adminImportarPreviewValidaciones");
  if (cajaValidaciones) {
    cajaValidaciones.innerHTML = validaciones
      .map(
        (item) => `
      <div class="admin-import-validation ${item.ok ? "ok" : "error"}">
        <span aria-hidden="true">${item.ok ? "✓" : "✕"}</span>
        <strong>${escaparHtml(item.texto)}</strong>
      </div>`,
      )
      .join("");
  }

  const importacionValida =
    resumen.importacionValida !== false &&
    validaciones.every((item) => item.ok !== false);
  const botonConfirmar = $("btnAdminConfirmarImportacion");
  if (botonConfirmar) {
    botonConfirmar.disabled = !importacionValida;
    botonConfirmar.textContent = importacionValida
      ? "Reemplazar catálogo"
      : "Archivo no válido";
  }

  const advertencias = [];
  if (resumen.duplicadosArchivo)
    advertencias.push(
      `${resumen.duplicadosArchivo} código(s) duplicado(s) exacto(s) dentro del archivo; se conservará la última aparición`,
    );
  if (resumen.sinCodigo)
    advertencias.push(`${resumen.sinCodigo} fila(s) sin código`);
  if (resumen.sinArticulo)
    advertencias.push(`${resumen.sinArticulo} fila(s) sin artículo`);
  if (resumen.codigosInvalidos)
    advertencias.push(`${resumen.codigosInvalidos} código(s) inválido(s)`);
  if (resumen.preciosInvalidos)
    advertencias.push(
      `${resumen.preciosInvalidos} precio(s) inválido(s); se guardarán vacíos`,
    );

  const cajaAdvertencias = $("adminImportarPreviewAdvertencias");
  if (cajaAdvertencias) {
    cajaAdvertencias.innerHTML = advertencias.length
      ? `<strong>Revisar:</strong><ul>${advertencias.map((texto) => `<li>${escaparHtml(texto)}</li>`).join("")}</ul>`
      : "<strong>Archivo correcto:</strong> no se detectaron filas problemáticas.";
    cajaAdvertencias.classList.toggle(
      "sin-advertencias",
      advertencias.length === 0,
    );
  }

  const modal = $("adminImportarPreviewModal");
  modal?.classList.remove("oculto");
  modal?.setAttribute("aria-hidden", "false");
}

function cerrarVistaPreviaImportacion() {
  const modal = $("adminImportarPreviewModal");
  modal?.classList.add("oculto");
  modal?.setAttribute("aria-hidden", "true");
}

function extraerProductosImportacion(filas, columnas) {
  const mapa = new Map();
  const estadisticas = {
    filasVacias: 0,
    sinCodigo: 0,
    sinArticulo: 0,
    codigosInvalidos: 0,
    preciosInvalidos: 0,
    duplicadosArchivo: 0,
    filasIgnoradas: 0,
  };

  for (let i = columnas.fila + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const tieneDatos = fila.some(
      (valor) =>
        valor !== null && valor !== undefined && String(valor).trim() !== "",
    );
    if (!tieneDatos) {
      estadisticas.filasVacias++;
      continue;
    }

    const codigo = limpiarCodigoImportacion(
      leerCampoImportacion(fila, columnas.rangos.codigo),
    );
    const articulo = String(
      leerCampoImportacion(fila, columnas.rangos.articulo) ?? "",
    ).trim();
    const precioOriginal = columnas.rangos.precio
      ? leerCampoImportacion(fila, columnas.rangos.precio)
      : "";
    const precio = columnas.rangos.precio
      ? parsearPrecioImportacion(precioOriginal)
      : null;

    if (!codigo) {
      estadisticas.sinCodigo++;
      estadisticas.filasIgnoradas++;
      continue;
    }
    if (!articulo) {
      estadisticas.sinArticulo++;
      estadisticas.filasIgnoradas++;
      continue;
    }
    if (!/^\d+$/.test(codigo)) {
      estadisticas.codigosInvalidos++;
      estadisticas.filasIgnoradas++;
      continue;
    }
    if (
      columnas.rangos.precio &&
      String(precioOriginal ?? "").trim() !== "" &&
      precio === null
    )
      estadisticas.preciosInvalidos++;
    const clave = claveCodigoImportacion(codigo);
    if (mapa.has(clave)) estadisticas.duplicadosArchivo++;

    // Los códigos numéricos con y sin ceros iniciales representan el mismo
    // producto (por ejemplo 00663 y 663). Se conserva la última aparición.
    mapa.set(clave, { codigo, articulo, precio });
  }
  return { productos: [...mapa.values()], ...estadisticas };
}

async function importarArchivoCatalogo(archivo) {
  await asegurarXLSX();
  const estado = $("adminImportarEstado");
  estado.textContent = "Validando archivo…";

  const extensionValida = /\.xlsx$/i.test(archivo.name || "");
  const datos = await archivo.arrayBuffer();
  const libro = window.XLSX.read(datos, { type: "array", raw: true });
  const hojaNombre =
    libro.SheetNames.find(
      (nombre) =>
        normalizarEncabezadoImportacion(nombre) ===
        normalizarEncabezadoImportacion(IMPORTACION_HOJA_ESPERADA),
    ) || "";
  const hojaEncontrada = Boolean(hojaNombre);
  const filas = hojaEncontrada
    ? window.XLSX.utils.sheet_to_json(libro.Sheets[hojaNombre], {
        header: 1,
        defval: "",
        raw: false,
      })
    : [];
  const columnas = hojaEncontrada ? detectarColumnasImportacion(filas) : null;
  const tieneCodigo = Boolean(columnas?.rangos?.codigo);
  const tieneArticulo = Boolean(columnas?.rangos?.articulo);
  const tienePrecio = Boolean(columnas?.rangos?.precio);
  const extraidos = columnas
    ? extraerProductosImportacion(filas, columnas)
    : {
        productos: [],
        filasVacias: 0,
        sinCodigo: 0,
        sinArticulo: 0,
        codigosInvalidos: 0,
        preciosInvalidos: 0,
        duplicadosArchivo: 0,
        filasIgnoradas: 0,
      };
  const cantidadSuficiente =
    extraidos.productos.length >= IMPORTACION_MIN_PRODUCTOS;

  const validaciones = [
    { ok: extensionValida, texto: "Formato XLSX válido" },
    {
      ok: hojaEncontrada,
      texto: `Hoja ${IMPORTACION_HOJA_ESPERADA} encontrada`,
    },
    { ok: tieneCodigo, texto: "Columna Código encontrada" },
    { ok: tieneArticulo, texto: "Columna Artículo encontrada" },
    { ok: tienePrecio, texto: "Columna Precio encontrada" },
    {
      ok: cantidadSuficiente,
      texto: cantidadSuficiente
        ? `${extraidos.productos.length} productos detectados`
        : `Se requieren al menos ${IMPORTACION_MIN_PRODUCTOS} productos válidos`,
    },
  ];
  const importacionValida = validaciones.every((item) => item.ok);

  if (!importacionValida) {
    importacionPendiente = null;
    const resumen = {
      ...extraidos,
      procesados: extraidos.productos.length,
      totalCatalogo: extraidos.productos.length,
      validaciones,
      importacionValida: false,
    };
    delete resumen.productos;
    estado.textContent =
      "El archivo no cumple la estructura requerida. No se modificó ningún dato.";
    abrirVistaPreviaImportacion(resumen, archivo.name);
    return;
  }

  importacionPendiente = {
    productos: extraidos.productos,
    archivoNombre: archivo.name,
    hojaNombre,
    estadisticas: { ...extraidos, validaciones, importacionValida: true },
  };
  estado.textContent = `Analizando ${extraidos.productos.length} productos…`;
  const data = await api("/admin/importar-productos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productos: extraidos.productos, confirmar: false }),
  });
  const resumen = {
    ...(data.resumen || {}),
    ...extraidos,
    validaciones,
    importacionValida: true,
  };
  delete resumen.productos;
  importacionResumenPendiente = resumen;
  estado.textContent =
    "Archivo validado. Confirmá para reemplazar completamente Productos.";
  abrirVistaPreviaImportacion(resumen, archivo.name);
}

function construirResumenImportacionFinal(r) {
  const advertencias = [];
  if (r.duplicadosArchivo)
    advertencias.push(
      `${r.duplicadosArchivo} duplicado(s) exacto(s) resuelto(s) dentro del archivo`,
    );
  if (r.filasIgnoradas)
    advertencias.push(`${r.filasIgnoradas} fila(s) ignorada(s)`);
  if (r.preciosInvalidos)
    advertencias.push(`${r.preciosInvalidos} precio(s) inválido(s)`);
  const detalleAdvertencias = advertencias.length
    ? `<br><span>Advertencias: ${advertencias.join(" · ")}.</span>`
    : "";
  return `<strong>Catálogo reemplazado</strong><span>Se guardaron ${r.totalCatalogo || r.procesados || 0} productos.</span>${detalleAdvertencias}<span>La hoja Stock no fue modificada.</span>`;
}

async function confirmarImportacionCatalogo() {
  if (!importacionPendiente) return;
  const boton = $("btnAdminConfirmarImportacion");
  const estado = $("adminImportarEstado");
  boton.disabled = true;
  boton.textContent = "Importando…";
  try {
    const data = await api("/admin/importar-productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productos: importacionPendiente.productos,
        confirmar: true,
      }),
    });
    const r = {
      ...(data.resumen || {}),
      ...(importacionPendiente.estadisticas || {}),
    };
    delete r.productos;
    cerrarVistaPreviaImportacion();
    estado.innerHTML = construirResumenImportacionFinal(r);
    importacionPendiente = null;
    importacionResumenPendiente = null;
    mensaje("Catálogo reemplazado", "ok");
    await Promise.all([cargarResumen(), cargarHistorialAdministracion()]);
  } finally {
    boton.disabled = false;
    boton.textContent = "Reemplazar catálogo";
  }
}

async function actualizarSistemaDesdeUI(boton, etiqueta = "Actualizar ahora") {
  if (!boton || boton.disabled) return;
  const htmlOriginal = boton.innerHTML;
  boton.disabled = true;
  boton.setAttribute("aria-busy", "true");
  boton.innerHTML = `<svg class="app-icon spin"><use href="#icon-refresh"></use></svg> Actualizando…`;
  try {
    const correcto = await cargarTodo();
    if (correcto) {
      establecerTexto("adminSyncStatus", "Sincronizado");
      mensaje("Datos del sistema actualizados.", "ok");
    }
  } catch (error) {
    mensaje(error.message || "No se pudo actualizar el sistema.", "error");
  } finally {
    boton.disabled = false;
    boton.removeAttribute("aria-busy");
    boton.innerHTML = htmlOriginal || etiqueta;
  }
}

async function procesarArchivoImportacionDesdeUI(archivo) {
  if (!archivo) return;
  try {
    await importarArchivoCatalogo(archivo);
  } catch (error) {
    establecerTexto("adminImportarEstado", error.message);
    mensaje(error.message, "error");
    importacionPendiente = null;
  }
}

function exportarRespaldoAdministrativo() {
  const contenido = {
    generado: new Date().toISOString(),
    version: resumenSistema.version || null,
    build: resumenSistema.build || null,
    resumen: resumenSistema,
    usuarios: usuarios.map(({ passwordHash, ...u }) => u),
    sectores,
  };
  const blob = new Blob([JSON.stringify(contenido, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `respaldo-administracion-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 300);
  mensaje("Respaldo administrativo generado.", "ok");
}

document.addEventListener("DOMContentLoaded", () => {
  [
    "adminUsuarioRol",
    "adminUsuarioSector",
    "adminUsuarioSectorSecundario",
    "adminSectorSupervisor",
  ].forEach((id) => {
    window.AppSelect?.enhance?.(id);
    const select = $(id);
    const wrapper = select?.closest(".app-select-custom");
    wrapper?.classList.add("admin-rubro-app-select");
    wrapper?.querySelector(".app-select-custom__menu")?.classList.add("admin-rubro-select-menu");
    const trigger = wrapper?.querySelector(".app-select-custom__trigger");
    trigger?.addEventListener("click", cerrarSelectorPermisosUsuario, true);
    preservarScrollModalEnSelect(trigger);
  });
  prepararSelectorPermisosUsuario();
  $("adminHeaderBackBtn")?.addEventListener("click", (event) => {
    if (!document.body.classList.contains("venc-historial-open")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cerrarHistorialVencimientosUI();
  }, true);
  $("adminHeaderBackBtn")?.addEventListener("click", () => cambiarTab("inicio"));
  document.querySelectorAll('.pro-global-nav[data-modulo="admin"]').forEach((btn) =>
    btn.addEventListener("click", () =>
      setTimeout(() => {
        cambiarTab("inicio");
        cargarTodo();
      }, 0),
    ),
  );
  document.querySelectorAll("[data-admin-open]").forEach((btn) => btn.addEventListener("click", () => cambiarTab(btn.dataset.adminOpen)));
  $("adminUsuariosBuscar")?.addEventListener("input", () => { adminUsuariosPagina = 1; renderUsuarios(); });
  ["adminUsuariosFiltroEstado", "adminUsuariosFiltroSector", "adminUsuariosFiltroRol", "adminUsuariosOrden"].forEach((id) => $(id)?.addEventListener("change", () => { adminUsuariosPagina = 1; renderUsuarios(); }));
  $("adminUsuariosVistaGrid")?.addEventListener("click", () => { adminUsuariosVista = "grid"; $("adminUsuariosVistaGrid")?.classList.add("activo"); $("adminUsuariosVistaLista")?.classList.remove("activo"); renderUsuarios(); });
  $("adminUsuariosVistaLista")?.addEventListener("click", () => { adminUsuariosVista = "list"; $("adminUsuariosVistaLista")?.classList.add("activo"); $("adminUsuariosVistaGrid")?.classList.remove("activo"); renderUsuarios(); });
  $("adminUsuariosSeleccionarTodos")?.addEventListener("change", (event) => { const inputs = [...document.querySelectorAll("#adminUsuariosLista .admin-user-select")]; inputs.forEach((input) => { input.checked = event.target.checked; const clave = input.closest("[data-usuario]")?.dataset.usuario; if (!clave) return; if (event.target.checked) adminUsuariosSeleccionados.add(clave); else adminUsuariosSeleccionados.delete(clave); }); const visibles = inputs.map((input) => ({ usuario: input.closest("[data-usuario]")?.dataset.usuario })).filter((u) => u.usuario); actualizarSeleccionUsuarios(visibles); });
  $("adminUsuariosAccionMasiva")?.addEventListener("change", async (event) => { const accion = event.target.value; event.target.value = ""; if (accion) await aplicarAccionMasivaUsuarios(accion).catch((e) => mensaje(e.message, "error")); });
  $("adminSectoresBuscar")?.addEventListener("input", () => { adminSectoresPagina = 1; renderSectores(); });
  $("adminSectoresFiltroEstado")?.addEventListener("change", () => { adminSectoresPagina = 1; renderSectores(); });
  $("adminQuickActualizar")?.addEventListener("click", cargarTodo);
  $("adminQuickImportar")?.addEventListener("click", () => { cambiarTab("sistema"); setTimeout(() => $("adminImportarArchivo")?.click(), 80); });
  $("adminQuickAyuda")?.addEventListener("click", async () => {
    const ir = await window.AppDialog?.confirm({
      titulo: "Centro de ayuda",
      mensaje: "Usuarios administra cuentas y permisos. Sectores organiza responsables y áreas. Sistema concentra sincronización, catálogo y respaldo. El historial de vencimientos se consulta desde Vencimientos.",
      confirmarTexto: "Ir a Vencimientos",
      cancelarTexto: "Cerrar",
    });
    if (ir) window.AutoservicioNavigate?.("vencimientos");
  });
  document.querySelectorAll("#adminTab-inicio [data-admin-kpi-target]").forEach((tarjeta) => {
    if (tarjeta.dataset.adminKpiBound === "1") return;
    tarjeta.dataset.adminKpiBound = "1";
    const abrir = () => {
      const destino = tarjeta.dataset.adminKpiTarget;
      if (destino === "vencimientos") window.AutoservicioNavigate?.("vencimientos");
      else if (["usuarios", "sectores", "sistema"].includes(destino)) cambiarTab(destino);
    };
    tarjeta.addEventListener("click", abrir);
    tarjeta.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      abrir();
    });
  });
  $("adminHomeVerHistorial")?.addEventListener("click", () => {
    adminActividadExpandida = !adminActividadExpandida;
    renderHomeActividad();
  });
  $("btnVencHistorialHeader")?.addEventListener("click", abrirHistorialVencimientosUI);
  $("btnVencHistorialMobile")?.addEventListener("click", abrirHistorialVencimientosUI);
  const adminScreenObserver = new MutationObserver(() => {
    if (document.body.dataset.screen !== "vencimientos" && document.body.classList.contains("venc-historial-open")) cerrarHistorialVencimientosUI();
  });
  adminScreenObserver.observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
  $("btnAbrirAdminHome")?.addEventListener("click", abrirAdmin);
  $("btnAdminActualizar")?.addEventListener("click", (event) => actualizarSistemaDesdeUI(event.currentTarget));
  $("btnAdminSincronizar")?.addEventListener("click", (event) => actualizarSistemaDesdeUI(event.currentTarget, "Sincronizar"));
  $("btnAdminVerHistorialSistema")?.addEventListener("click", () => {
    adminActividadExpandida = true;
    cambiarTab("inicio");
    renderHomeActividad();
    setTimeout(() => $("adminHomeActividad")?.closest(".admin-recent-card")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  });
  $("btnAdminReportes")?.addEventListener("click", () => { window.AutoservicioNavigate?.("vencimientos"); setTimeout(abrirHistorialVencimientosUI, 80); });
  $("btnAdminExportarConfig")?.addEventListener("click", exportarRespaldoAdministrativo);
  $("btnAdminStorageDetalles")?.addEventListener("click", () => cambiarTab("sistema"));
  $("btnAdminNuevoUsuario")?.addEventListener("click", abrirNuevoUsuario);
  $("btnAdminNuevoSector")?.addEventListener("click", () => abrirSectorModal());
  $("btnAdminCerrarSector")?.addEventListener("click", cerrarSectorModal);
  $("btnAdminGuardarSector")?.addEventListener("click", guardarSector);
  $("adminSectorModal")?.addEventListener("click", (e) => {
    if (e.target.id === "adminSectorModal") cerrarSectorModal();
  });
  $("adminSectorModal")?.addEventListener("input", actualizarEstadoGuardarSector);
  $("adminSectorModal")?.addEventListener("change", actualizarEstadoGuardarSector);
  $("btnAdminCerrarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminGuardarUsuario")?.addEventListener("click", guardarUsuario);
  $("btnAdminUsuarioPasswordVisible")?.addEventListener("click", alternarVisibilidadPasswordUsuario);
  $("btnAdminEliminarUsuario")?.addEventListener("click", async () => {
    const usuario = $("adminUsuarioOriginal")?.value;
    if (!usuario) return;
    await eliminarUsuario(usuario);
    if (!usuarios.some((u) => u.usuario === usuario))
      cerrarUsuarioModalDirecto();
  });
  $("adminUsuarioModal")?.addEventListener("click", (e) => {
    if (e.target.id === "adminUsuarioModal") cerrarUsuarioModal();
  });
  $("adminUsuarioModal")?.addEventListener("input", () => {
    limpiarMensajeUsuarioModal();
    actualizarEstadoGuardarUsuario();
  });
  $("adminUsuarioModal")?.addEventListener("change", () => {
    limpiarMensajeUsuarioModal();
    actualizarEstadoGuardarUsuario();
  });
  $("btnAdminEliminarSector")?.addEventListener("click", eliminarSectorActual);
  $("adminUsuarioRol")?.addEventListener("change", () => {
    actualizarEstadoPermisosPorRol();
    actualizarSelectoresUsuario();
  });
  $("adminUsuarioSector")?.addEventListener("change", () => {
    poblarSectoresUsuario(
      $("adminUsuarioSector")?.value || "",
      $("adminUsuarioSectorSecundario")?.value || "",
    );
  });
  $("adminUsuarioSectorSecundario")?.addEventListener("change", () => {
    poblarSectoresUsuario(
      $("adminUsuarioSector")?.value || "",
      $("adminUsuarioSectorSecundario")?.value || "",
    );
  });
  document.querySelectorAll(".admin-period-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      historialPeriodo = btn.dataset.periodo || "hoy";
      document
        .querySelectorAll(".admin-period-btn")
        .forEach((item) => item.classList.toggle("activo", item === btn));
      reiniciarPaginacionHistorial();
    }),
  );
  $("adminHistorialUsuario")?.addEventListener("change", () => {
    const select = $("adminHistorialUsuario");
    establecerTexto("adminHistorialUsuarioTexto", select?.value ? select.options[select.selectedIndex]?.textContent : "Todos los usuarios");
    reiniciarPaginacionHistorial();
  });
  $("adminHistorialAccion")?.addEventListener("change", () => {
    const select = $("adminHistorialAccion");
    establecerTexto("adminHistorialAccionTexto", select?.value ? select.options[select.selectedIndex]?.textContent : "Todas las acciones");
    reiniciarPaginacionHistorial();
  });
  $("adminHistorialPorPagina")?.addEventListener("change", () => { historialPagina = 1; renderHistorialVencimientos(); });
  $("adminHistorialBuscar")?.addEventListener("input", () => {
    clearTimeout(historialBusquedaTimer);
    historialBusquedaTimer = setTimeout(reiniciarPaginacionHistorial, 180);
  });
  $("btnAdminImportarArchivo")?.addEventListener("click", () =>
    $("adminImportarArchivo")?.click(),
  );
  $("adminImportarArchivo")?.addEventListener("change", async (event) => {
    const archivo = event.target.files?.[0];
    if (archivo) await procesarArchivoImportacionDesdeUI(archivo);
    event.target.value = "";
  });
  const dropzone = $("adminImportDropzone");
  dropzone?.addEventListener("click", () => $("adminImportarArchivo")?.click());
  dropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("adminImportarArchivo")?.click();
    }
  });
  ["dragenter", "dragover"].forEach((tipo) => dropzone?.addEventListener(tipo, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  }));
  ["dragleave", "drop"].forEach((tipo) => dropzone?.addEventListener(tipo, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  }));
  dropzone?.addEventListener("drop", async (event) => {
    const archivo = event.dataTransfer?.files?.[0];
    if (archivo) await procesarArchivoImportacionDesdeUI(archivo);
  });
  $("btnAdminCerrarImportacion")?.addEventListener("click", () => {
    cerrarVistaPreviaImportacion();
    importacionPendiente = null;
    importacionResumenPendiente = null;
  });
  $("btnAdminConfirmarImportacion")?.addEventListener("click", async () => {
    try {
      await confirmarImportacionCatalogo();
    } catch (error) {
      mensaje(error.message, "error");
      $("adminImportarEstado").textContent = error.message;
    }
  });
  $("btnAdminHistorialMas")?.addEventListener("click", () => {
    historialLimite += 20;
    renderHistorialVencimientos();
  });
  $("btnVencHistorialHeader")?.classList.toggle("oculto", !window.AutoservicioAuth?.esAdmin?.());
  $("btnVencHistorialMobile")?.classList.toggle("oculto", !window.AutoservicioAuth?.esAdmin?.());
  ocultarPanelAdmin();
  window.addEventListener("autoservicio:sesion", (event) => {
    const esAdmin = event.detail?.rol === "administrador";
    $("btnVencHistorialHeader")?.classList.toggle("oculto", !esAdmin);
    $("btnVencHistorialMobile")?.classList.toggle("oculto", !esAdmin);
    establecerTexto("adminHomeNombre", event.detail?.nombre || event.detail?.usuario || "Administrador");
    if (!esAdmin) { ocultarPanelAdmin(); cerrarHistorialVencimientosUI(); }
  });
});

document
  .getElementById("adminUsuarioNombre")
  ?.addEventListener("input", (e) => {
    const av = $("adminUsuarioAvatarModal");
    if (av)
      av.textContent = (e.target.value.trim() || "U").slice(0, 1).toUpperCase();
  });

window.AdminModule = {
  async abrirTab(tab = "inicio") {
    await cargarTodo();
    cambiarTab(tab);
  },
  reiniciar() {
    cambiarTab("inicio");
    const buscar = document.getElementById("adminHistorialBuscar");
    if (buscar) buscar.value = "";
    const usuario = document.getElementById("adminHistorialUsuario");
    if (usuario) usuario.value = "";
    const accion = document.getElementById("adminHistorialAccion");
    if (accion) accion.value = "";
    window.scrollTo({ top: 0, behavior: "auto" });
  },
};
