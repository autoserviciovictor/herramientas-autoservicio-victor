import { API_BASE_URL } from "./config.js?v=1960-d21-limpieza-controlada-270826-a";
import {
  escapeHTML as esc,
  formatDuration as duracionTexto,
} from "./shared/dom-utils.js?v=1960-d21-limpieza-controlada-270826-a";
import {
  shiftSectionTemplate,
  emptyTaskListTemplate,
} from "./modules/tareas/task-view.js?v=1960-d21-limpieza-controlada-270826-a";

const $ = (id) => document.getElementById(id);
const KEY = "autoservicio_tareas_v3";
const OLD_KEYS = ["autoservicio_tareas_v2", "autoservicio_tareas_v1"];
const BANO_KEY = "autoservicio_bano_config_v1";
const BANO_HISTORY_KEY = "autoservicio_bano_historial_v1";
const PENDING_KEY = "autoservicio_tareas_pendientes_v1";
const DIAS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
let fechaSeleccionada = inicioDia(new Date());
let semanaBase = inicioSemana(fechaSeleccionada);
let tareaEditando = null;
let tareaEstadoSeleccionado = true;
let tareaModalEstadoInicial = null;
let activo = false;
let vistaActual = "tareas";
let sectorSeleccionado = "";
let usuariosTareas = [];
let asignarDisponibles = [];
let solicitudResponsables = 0;
let tareasMemoria = [];
let contextoTareas = {
  sectores: [],
  puedeAsignar: false,
  puedeConfigurar: false,
};
let guardadoRemotoEnCurso = Promise.resolve();
let banoMemoria = null;
let banoActivo = false;
let banoVistaActual = "resumen";
let banoParticipantesBorrador = null;
let asignacionEditando = null;
let asignarUsuarioSeleccionado = "";
let asignarTareasSeleccionadas = new Set();
let activacionTareasEnCurso = null;
let planSemanaBase = null;
let planGuardando = false;
let planModalEstado = null;
const tareasCompletando = new Set();
const ROLES_GESTION_TAREAS = ["administrador", "administracion", "supervisor"];
function puedeGestionarTareasPorRol() {
  return ROLES_GESTION_TAREAS.includes(usuario()?.rol);
}

/* Selector visual propio del módulo Tareas.
   Mantiene el <select> real como fuente de valor y evita el menú nativo
   del navegador en escritorio y móvil. Reutiliza el componente visual
   global .app-select-custom para no crear una segunda identidad gráfica. */
function sincronizarSelectVisualTareas(select) {
  if (!select) return;
  const wrapper = select.closest('.app-select-custom');
  if (!wrapper || wrapper.dataset.owner !== 'tareas') return;
  const trigger = wrapper.querySelector('.app-select-custom__trigger');
  const valor = trigger?.querySelector('.app-select-custom__value');
  const menu = wrapper.querySelector('.app-select-custom__menu');
  if (!trigger || !valor || !menu) return;

  const firma = [...select.options]
    .map((o) => `${o.value}\u0001${o.textContent}\u0001${o.disabled ? 1 : 0}`)
    .join('\u0002');
  if (wrapper.dataset.optionsSignature !== firma) {
    wrapper.dataset.optionsSignature = firma;
    menu.innerHTML = '';
    [...select.options].forEach((opcion) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-select-custom__option';
      btn.dataset.value = opcion.value;
      btn.setAttribute('role', 'option');
      btn.textContent = opcion.textContent.trim();
      btn.disabled = Boolean(opcion.disabled);
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        select.value = btn.dataset.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sincronizarSelectVisualTareas(select);
        wrapper.classList.remove('is-open', 'opens-up');
        trigger.setAttribute('aria-expanded', 'false');
      });
      menu.appendChild(btn);
    });
  }

  const opcion = select.options[select.selectedIndex];
  valor.textContent = opcion?.textContent?.trim() || 'Seleccionar';
  trigger.classList.toggle('is-placeholder', !select.value);
  menu.querySelectorAll('.app-select-custom__option').forEach((btn) => {
    const activo = btn.dataset.value === select.value;
    btn.classList.toggle('is-selected', activo);
    btn.setAttribute('aria-selected', activo ? 'true' : 'false');
  });
}

function cerrarSelectsVisualesTareas(excepto = null) {
  document
    .querySelectorAll('.app-select-custom[data-owner="tareas"].is-open')
    .forEach((wrapper) => {
      if (wrapper === excepto) return;
      wrapper.classList.remove('is-open', 'opens-up');
      wrapper
        .querySelector('.app-select-custom__trigger')
        ?.setAttribute('aria-expanded', 'false');
    });
}

function posicionarSelectVisualTareas(wrapper) {
  const trigger = wrapper?.querySelector('.app-select-custom__trigger');
  const menu = wrapper?.querySelector('.app-select-custom__menu');
  if (!wrapper?.classList.contains('is-open') || !trigger || !menu) return;
  wrapper.classList.remove('opens-up');
  const r = trigger.getBoundingClientRect();
  const espacioAbajo = window.innerHeight - r.bottom - 14;
  const espacioArriba = r.top - 14;
  const alto = Math.min(menu.scrollHeight || 0, 260);
  if (alto > espacioAbajo && espacioArriba > espacioAbajo)
    wrapper.classList.add('opens-up');
}

function configurarSelectVisualTareas(id) {
  const select = $(id);
  if (!select || select.dataset.tareasCustomReady === '1') return;
  select.dataset.tareasCustomReady = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'app-select-custom tareas-select-custom';
  wrapper.dataset.owner = 'tareas';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('app-select-custom__native');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'app-select-custom__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute(
    'aria-label',
    select.getAttribute('aria-label') || 'Seleccionar opción',
  );
  trigger.innerHTML = `<span class="app-select-custom__value"></span><span class="app-select-custom__chevron" aria-hidden="true"><svg class="app-icon"><use href="#icon-chevron-down"></use></svg></span>`;

  const menu = document.createElement('div');
  menu.className = 'app-select-custom__menu';
  menu.setAttribute('role', 'listbox');
  wrapper.append(trigger, menu);

  trigger.addEventListener('click', () => {
    const abrir = !wrapper.classList.contains('is-open');
    cerrarSelectsVisualesTareas(wrapper);
    wrapper.classList.toggle('is-open', abrir);
    trigger.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (abrir) {
      sincronizarSelectVisualTareas(select);
      requestAnimationFrame(() => posicionarSelectVisualTareas(wrapper));
    } else wrapper.classList.remove('opens-up');
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    wrapper.classList.remove('is-open', 'opens-up');
    trigger.setAttribute('aria-expanded', 'false');
  });
  select.addEventListener('change', () => sincronizarSelectVisualTareas(select));

  const observer = new MutationObserver(() => sincronizarSelectVisualTareas(select));
  observer.observe(select, { childList: true, subtree: true });
  sincronizarSelectVisualTareas(select);
}

function prepararSelectoresVisualesTareas() {
  [
    'configEstadoFiltro',
    'configDiaFiltro',
    'tareaDuracionHoras',
    'tareaDuracionMinutos',
  ].forEach(configurarSelectVisualTareas);
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.app-select-custom[data-owner="tareas"]'))
    cerrarSelectsVisualesTareas();
});

function inicioDia(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function inicioSemana(d) {
  const x = inicioDia(d),
    day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
  return x;
}
function iso(d) {
  const x = inicioDia(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function parseFecha(v) {
  const [y, m, d] = String(v || "")
    .split("-")
    .map(Number);
  return y ? new Date(y, m - 1, d) : inicioDia(new Date());
}
function fmt(d, opt = {}) {
  return new Intl.DateTimeFormat("es-AR", opt).format(d);
}
function leerJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
function guardarJSON(key, v) {
  localStorage.setItem(key, JSON.stringify(v));
}
function claveUsuarioLocal(base) {
  const clave = String(usuario()?.usuario || "anon")
    .trim()
    .toLowerCase();
  return `${base}:${clave}`;
}
function leerJSONUsuario(base, fallback) {
  return leerJSON(claveUsuarioLocal(base), fallback);
}
function guardarJSONUsuario(base, valor) {
  guardarJSON(claveUsuarioLocal(base), valor);
}
function eliminarJSONUsuario(base) {
  localStorage.removeItem(claveUsuarioLocal(base));
}
function leer() {
  return tareasMemoria.length || localStorage.getItem(claveUsuarioLocal(KEY))
    ? tareasMemoria
    : leerJSONUsuario(KEY, []);
}
function guardarLocal(v) {
  tareasMemoria = Array.isArray(v) ? v : [];
  guardarJSONUsuario(KEY, tareasMemoria);
}
async function sincronizarTareas(v, deletedIds = []) {
  if (!puedeGestionarTareasPorRol()) return false;
  const anterior = leerJSONUsuario(PENDING_KEY, { tareas: [], deletedIds: [] });
  const pendientes = {
    tareas: Array.isArray(v) ? v : [],
    deletedIds: [
      ...new Set(
        [...(anterior?.deletedIds || []), ...deletedIds].filter(Boolean),
      ),
    ],
  };
  guardarJSONUsuario(PENDING_KEY, pendientes);
  let exito = false;
  guardadoRemotoEnCurso = guardadoRemotoEnCurso
    .then(async () => {
      const r = await fetch(`${API_BASE_URL}/tareas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendientes),
      });
      const data = await r.json();
      if (!r.ok || !data.ok)
        throw new Error(
          data.mensaje || "No se pudieron sincronizar las tareas",
        );
      if (Array.isArray(data.tareas)) guardarLocal(data.tareas);
      eliminarJSONUsuario(PENDING_KEY);
      exito = true;
    })
    .catch((error) =>
      window.AutoservicioDialog?.alert?.({
        title: "Cambios guardados en el dispositivo",
        message: `${error.message || "No se pudo conectar con el servidor"}. Se volverán a enviar automáticamente al ingresar nuevamente.`,
      }),
    );
  await guardadoRemotoEnCurso;
  return exito;
}
function guardar(v, opciones = {}) {
  guardarLocal(v);
  void sincronizarTareas(v, opciones.deletedIds || []);
}
async function cargarContextoTareas() {
  const intentos = [
    `${API_BASE_URL}/tareas/contexto`,
    `${API_BASE_URL}/horarios/contexto`,
  ];
  for (const url of intentos) {
    try {
      const r = await fetch(url),
        data = await r.json();
      if (
        r.ok &&
        data.ok &&
        Array.isArray(data.sectores) &&
        data.sectores.length
      ) {
        contextoTareas = {
          ...contextoTareas,
          ...data,
          puedeAsignar: data.puedeAsignar ?? puedeGestionarTareasPorRol(),
          puedeConfigurar: data.puedeConfigurar ?? puedeGestionarTareasPorRol(),
        };
        return;
      }
    } catch {}
  }
  contextoTareas = {
    sectores: [],
    puedeAsignar: false,
    puedeConfigurar: puedeGestionarTareasPorRol(),
    errorSectores: true,
  };
}
async function cargarTareasRemotas() {
  const locales = leerJSONUsuario(KEY, []),
    pendientes = leerJSONUsuario(PENDING_KEY, null);
  try {
    if (pendientes?.tareas && puedeGestionarTareasPorRol())
      await sincronizarTareas(pendientes.tareas, pendientes.deletedIds || []);
    const r = await fetch(`${API_BASE_URL}/tareas`),
      data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudieron cargar las tareas");
    tareasMemoria = Array.isArray(data.tareas) ? data.tareas : [];
    if (
      usuario()?.rol === "administrador" &&
      !tareasMemoria.length &&
      locales.length
    ) {
      guardarLocal(locales);
      await sincronizarTareas(locales);
      tareasMemoria = locales;
    } else guardarLocal(tareasMemoria);
  } catch {
    tareasMemoria = locales;
  }
}
function usuario() {
  return window.AutoservicioAuth?.getUsuario?.() || {};
}
function puedeAsignar() {
  return contextoTareas.puedeAsignar || puedeGestionarTareasPorRol();
}
function puedeConfigurar() {
  return contextoTareas.puedeConfigurar || puedeGestionarTareasPorRol();
}
function claveSector(v) {
  return String(v || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}
function sectoresUnicos(valores) {
  const mapa = new Map();
  for (const valor of valores) {
    const limpio = String(valor || "").trim();
    if (!limpio) continue;
    const clave = claveSector(limpio);
    if (!mapa.has(clave)) mapa.set(clave, limpio);
  }
  return [...mapa.values()];
}
function sectoresUsuario() {
  return sectoresUnicos(
    (contextoTareas.sectores || []).map((s) => s.nombre || s.id),
  );
}
function todosLosSectores() {
  const delContexto = sectoresUsuario();
  const deTareas = leer()
    .map((t) => t.sector)
    .filter(Boolean);
  return sectoresUnicos([...delContexto, ...deTareas]).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );
}
function sectoresPermitidos() {
  return sectoresUsuario().length ? sectoresUsuario() : todosLosSectores();
}
function opcionSectorTareas(nombre, actual = "") {
  const info = (contextoTareas.sectores || []).find((sector) =>
    [sector?.id, sector?.nombre].some(
      (valor) => normalClave(valor) === normalClave(nombre),
    ),
  );
  return {
    value: nombre,
    label: info?.nombre || nombre,
    color: info?.color || "#718096",
    description:
      normalClave(nombre) === normalClave(actual)
        ? "Sector actual"
        : "Cambiar a este sector",
  };
}

function sectorInicialUsuario() {
  const u = usuario() || {};
  return String(
    u.sector ||
      u.sectorPersonal ||
      u.sector_principal ||
      u.sectorPrincipal ||
      "",
  ).trim();
}
function normalizarSector() {
  const permitidos = sectoresPermitidos();
  const preferido = sectorInicialUsuario();
  if (!sectorSeleccionado) {
    sectorSeleccionado =
      (preferido && permitidos.includes(preferido)
        ? preferido
        : permitidos[0]) ||
      preferido ||
      "";
    return;
  }
  if (permitidos.length && !permitidos.includes(sectorSeleccionado))
    sectorSeleccionado =
      (preferido && permitidos.includes(preferido)
        ? preferido
        : permitidos[0]) || "";
}
function normalizarTurnoPermitido(v) {
  const x = String(v || "").toLowerCase();
  if (x === "manana" || x === "tarde" || x === "ambos") return x;
  if (x.includes("15:00") || x.includes("tarde")) return "tarde";
  return "manana";
}
function duracionAInput(v) {
  const n = Math.max(1, Number(v) || 10),
    h = Math.floor(n / 60),
    m = n % 60;
  return `${String(Math.min(h, 8)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function duracionDesdeInput(v) {
  const [h, m] = String(v || "")
    .split(":")
    .map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}
function prepararSelectorDuracion() {
  const horas = $("tareaDuracionHoras"),
    mins = $("tareaDuracionMinutos");
  if (!horas || !mins) return;
  horas.innerHTML = Array.from(
    { length: 9 },
    (_, i) => `<option value="${i}">${i} h</option>`,
  ).join("");
  mins.innerHTML = Array.from(
    { length: 60 },
    (_, i) => `<option value="${i}">${String(i).padStart(2, "0")} min</option>`,
  ).join("");
  const sync = () => {
    $("tareaDuracion").value =
      `${String(horas.value).padStart(2, "0")}:${String(mins.value).padStart(2, "0")}`;
    actualizarEstadoGuardarTarea();
  };
  horas.onchange = sync;
  mins.onchange = sync;
  prepararSelectoresVisualesTareas();
}
function establecerDuracionSelector(total) {
  const n = Math.max(1, Number(total) || 10),
    h = Math.min(8, Math.floor(n / 60)),
    m = n % 60;
  $("tareaDuracionHoras").value = String(h);
  $("tareaDuracionMinutos").value = String(m);
  $("tareaDuracion").value = duracionAInput(n);
  sincronizarSelectVisualTareas($("tareaDuracionHoras"));
  sincronizarSelectVisualTareas($("tareaDuracionMinutos"));
}

function migrar() {
  if (localStorage.getItem(claveUsuarioLocal(KEY))) return;
  let prev = [];
  for (const k of OLD_KEYS) {
    prev = leerJSON(claveUsuarioLocal(k), []);
    if (prev.length) break;
  }
  const hoy = iso(new Date());
  guardar(
    prev.map((t, i) => {
      const dia = parseFecha(t.fecha || hoy).getDay();
      const dias =
        Array.isArray(t.diasSemana) && t.diasSemana.length
          ? t.diasSemana
          : [dia];
      const turno = normalizarTurnoPermitido(t.turnoPermitido || t.turno);
      const asignaciones = {};
      if (t.responsables) {
        const fecha = t.fecha || hoy;
        asignaciones[fecha] = {
          [turno === "tarde" ? "tarde" : "manana"]: {
            responsables: String(t.responsables)
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            estado: t.estado === "completada" ? "completada" : "pendiente",
            completadaPor: t.completadaPor || "",
            completadaHora: t.completadaHora || "",
          },
        };
      }
      return {
        id: t.id || crypto.randomUUID?.() || String(Date.now() + i),
        nombre: t.nombre || "Tarea",
        descripcion: t.descripcion || "",
        sector: t.sector || "General",
        duracionMin: parseInt(t.duracion) || 10,
        diasSemana: dias,
        turnoPermitido: turno,
        activo: t.activo !== false,
        asignaciones,
      };
    }),
  );
}
function seed() {
  migrar();
  if (!leer().length) guardar([]);
  if (!localStorage.getItem(claveUsuarioLocal(BANO_KEY)))
    guardarJSONUsuario(BANO_KEY, { participantes: [], fechaAncla: iso(new Date()) });
  else {
    const cfg = leerJSONUsuario(BANO_KEY, {});
    guardarJSONUsuario(BANO_KEY, {
      participantes: Array.isArray(cfg.participantes) ? cfg.participantes : [],
      fechaAncla: cfg.fechaAncla || cfg.fechaInicio || iso(new Date()),
    });
  }
}

function diasTarea(t) {
  const dias = Array.isArray(t?.diasSemana)
    ? t.diasSemana
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  return dias.length ? [...new Set(dias)] : [0, 1, 2, 3, 4, 5, 6];
}
function correspondeDia(t, fecha) {
  return (
    t.activo !== false && diasTarea(t).includes(parseFecha(fecha).getDay())
  );
}
function diasSeleccionadosModal() {
  return [
    ...document.querySelectorAll(
      '#tareaDiasSemana input[type="checkbox"]:checked',
    ),
  ].map((x) => Number(x.value));
}
function establecerDiasModal(dias) {
  const seleccion = new Set(
    (Array.isArray(dias) && dias.length ? dias : [0, 1, 2, 3, 4, 5, 6]).map(
      Number,
    ),
  );
  document
    .querySelectorAll('#tareaDiasSemana input[type="checkbox"]')
    .forEach((input) => {
      input.checked = seleccion.has(Number(input.value));
    });
}
function textoDiasTarea(t) {
  const dias = diasTarea(t);
  if (dias.length === 7) return "Todos los días";
  const nombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return dias.map((d) => nombres[d]).join(" · ");
}
function etiquetaDiasTarea(t) {
  return `<span class="config-task-days" title="Días de realización"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>${esc(textoDiasTarea(t))}</span>`;
}
function turnosPermitidos(t) {
  return ["manana", "tarde"];
}
function asignacion(t, fecha, turno) {
  return t.asignaciones?.[fecha]?.[turno] || null;
}
function asignacionesDelDia() {
  const fecha = iso(fechaSeleccionada),
    out = [];
  leer()
    .filter((t) => (t.sector || "General") === sectorSeleccionado)
    .forEach((t) => {
      for (const turno of turnosPermitidos(t)) {
        const a = asignacion(t, fecha, turno);
        if (a)
          out.push({
            ...t,
            _turno: turno,
            _asignacion: a,
            estado: a.estado || "pendiente",
            _canManage: puedeAsignar(),
          });
      }
    });
  return out;
}
function renderDias() {
  const box = $("tareasDias");
  if (!box) return;
  box.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(semanaBase);
    d.setDate(d.getDate() + i);
    const b = document.createElement("button");
    b.type = "button";
    b.className = [
      iso(d) === iso(fechaSeleccionada) ? "activo" : "",
      iso(d) === iso(new Date()) ? "hoy" : "",
    ]
      .filter(Boolean)
      .join(" ");
    b.innerHTML = `<strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span>`;
    b.onclick = () => {
      fechaSeleccionada = d;
      renderTareas();
    };
    box.appendChild(b);
  }
}
function renderResumen(items = []) {
  const box = $("tareasResumen");
  if (!box) return;

  // Cada tarea asignada a una persona cuenta como una asignación individual.
  // Ej.: una misma tarea con 3 responsables suma 3 al total, porque en la vista
  // diaria aparece una vez dentro de la tarjeta de cada responsable.
  const cantidadResponsables = (item) =>
    (item?._asignacion?.responsables || [])
      .map((nombre) => String(nombre || "").trim())
      .filter(Boolean).length;

  const total = items.reduce(
    (acum, item) => acum + cantidadResponsables(item),
    0,
  );
  const completadas = items.reduce(
    (acum, item) =>
      acum + (item.estado === "completada" ? cantidadResponsables(item) : 0),
    0,
  );
  const pendientes = Math.max(0, total - completadas);
  const personas = new Set(
    items.flatMap((t) =>
      (t._asignacion?.responsables || [])
        .map((nombre) => String(nombre || "").trim())
        .filter(Boolean),
    ),
  ).size;
  const porcentaje = total ? Math.round((completadas / total) * 100) : 0;
  box.classList.remove("oculto");
  box.innerHTML = `
    <article class="tareas-kpi is-total app-kpi-card app-kpi-blue"><span class="tareas-kpi-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><div><small>Tareas del día</small><strong>${total}</strong><span>asignadas</span></div></article>
    <article class="tareas-kpi is-complete app-kpi-card app-kpi-red"><span class="tareas-kpi-icon"><svg class="app-icon"><use href="#icon-check"></use></svg></span><div><small>Completadas</small><strong>${completadas}</strong><span>${porcentaje}% del total</span></div></article>
    <article class="tareas-kpi is-pending app-kpi-card app-kpi-amber"><span class="tareas-kpi-icon"><svg class="app-icon"><use href="#icon-clock"></use></svg></span><div><small>Pendientes</small><strong>${pendientes}</strong><span>${Math.max(0, 100 - porcentaje)}% del total</span></div></article>
    <article class="tareas-kpi is-people app-kpi-card app-kpi-green"><span class="tareas-kpi-icon"><svg class="app-icon"><use href="#icon-user"></use></svg></span><div><small>Personas asignadas</small><strong>${personas}</strong><span>en la jornada</span></div></article>`;
}
function renderLista(items) {
  const box = $("tareasLista");
  if (!items.length) {
    box.innerHTML = emptyTaskListTemplate();
    return;
  }
  const unicas = [
    ...new Map(items.map((t) => [`${t.id}::${t._turno}`, t])).values(),
  ];
  const manana = unicas.filter((t) => t._turno === "manana"),
    tarde = unicas.filter((t) => t._turno === "tarde");
  box.innerHTML =
    shiftSectionTemplate("manana", manana) +
    shiftSectionTemplate("tarde", tarde);
}
function renderTareas() {
  actualizarNavegacionTareas();
  normalizarSector();
  const items = asignacionesDelDia();
  $("tareasSectorNombre").textContent = sectorSeleccionado;
  const puedeCambiarSector = sectoresPermitidos().length > 1;
  $("btnTareasCambiarSector").disabled = !puedeCambiarSector;
  $("btnTareasCambiarSector").classList.toggle(
    "sector-unico",
    !puedeCambiarSector,
  );
  $("btnTareasSemanaActual").textContent =
    `${fmt(semanaBase, { day: "2-digit", month: "short" })} - ${fmt(new Date(semanaBase.getFullYear(), semanaBase.getMonth(), semanaBase.getDate() + 6), { day: "2-digit", month: "short" })}`;
  $("tareasFechaTitulo").textContent = fmt(fechaSeleccionada, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).toUpperCase();
  $("btnTareasPlanificacion")?.classList.toggle("oculto", !puedeAsignar());
  $("btnTareasConfiguracion")?.classList.toggle("oculto", !puedeConfigurar());
  renderDias();
  renderResumen(items);
  renderLista(items);
}

function semanaPlanificacionPorDefecto() {
  const hoy = inicioDia(new Date());
  if (hoy.getDay() === 0) {
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    return inicioSemana(manana);
  }
  return inicioSemana(hoy);
}
function fechaPlanDia(indice) {
  const d = new Date(planSemanaBase || semanaPlanificacionPorDefecto());
  d.setDate(d.getDate() + indice);
  return d;
}
function asignacionesCeldaPlan(t, fecha) {
  const data = t?.asignaciones?.[fecha] || {};
  return ["manana", "tarde"]
    .map((turno) => ({ turno, a: data[turno] }))
    .filter((x) => x.a && (x.a.responsables || []).length);
}
function planResponsables(a) {
  return (a?.responsables || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}
function planResponsablesHTML(a, turno) {
  const nombres = planResponsables(a);
  const lista = nombres.length ? nombres : ["Sin responsable"];
  const completada = a?.estado === "completada";
  return lista
    .map(
      (nombre) =>
        `<span class="tareas-plan-assignee turno-${turno} ${completada ? "is-complete" : ""}"><small>${turno === "manana" ? "M" : "T"}</small><strong class="tareas-plan-person">${esc(nombre)}</strong>${completada ? '<b class="tareas-plan-done">✓</b>' : ""}</span>`,
    )
    .join("");
}
function renderPlanificacion() {
  const grid = $("tareasPlanGrid"),
    resumen = $("tareasPlanResumen");
  if (!grid) return;
  normalizarSector();
  if (!planSemanaBase) planSemanaBase = inicioSemana(fechaSeleccionada);
  $("tareasPlanSectorNombre").textContent = sectorSeleccionado || "Mi sector";
  const fin = fechaPlanDia(6);
  const rangoCorto = `${fmt(planSemanaBase, { day: "2-digit", month: "short" })} - ${fmt(fin, { day: "2-digit", month: "short" })}`;
  $("tareasPlanSemanaTexto").textContent =
    `Semana del ${fmt(planSemanaBase, { day: "numeric", month: "long" })} al ${fmt(fin, { day: "numeric", month: "long" })}`;
  if ($("btnPlanSemanaActual")) $("btnPlanSemanaActual").textContent = rangoCorto;

  const tareas = leer().filter(
    (t) => (t.sector || "General") === sectorSeleccionado && t.activo !== false,
  );
  const dias = Array.from({ length: 7 }, (_, i) => fechaPlanDia(i));
  let asignadas = 0;
  let asignadasManana = 0;
  let asignadasTarde = 0;
  const personas = new Set();
  const head = `<div class="tareas-plan-row tareas-plan-row-head"><div class="tareas-plan-task-head"><strong>Tarea</strong><span>Duración</span></div>${dias
    .map(
      (d) =>
        `<div class="tareas-plan-day-head ${iso(d) === iso(new Date()) ? "is-today" : ""}"><strong>${DIAS[d.getDay()]}</strong><span>${d.getDate()}</span><small>${fmt(d, { month: "short" }).replace(".", "")}</small></div>`,
    )
    .join("")}</div>`;

  const rows = tareas
    .map((t) => {
      const celdas = dias
        .map((d) => {
          const fecha = iso(d),
            aplica = correspondeDia(t, fecha),
            asigs = asignacionesCeldaPlan(t, fecha);
          asignadas += asigs.length;
          asigs.forEach(({ turno, a }) => {
            if (turno === "manana") asignadasManana += 1;
            if (turno === "tarde") asignadasTarde += 1;
            (a?.responsables || []).forEach((nombre) => {
              const limpio = String(nombre || "").trim();
              if (limpio) personas.add(limpio);
            });
          });
          if (!aplica)
            return `<div class="tareas-plan-cell is-disabled" aria-label="${esc(t.nombre)} no corresponde este día"><span>—</span></div>`;
          const contenido = asigs.length
            ? asigs
                .map(
                  ({ turno, a }) => planResponsablesHTML(a, turno),
                )
                .join("")
            : `<span class="tareas-plan-empty">+ Asignar</span>`;
          return `<button type="button" class="tareas-plan-cell is-editable ${iso(d) === iso(new Date()) ? "is-today" : ""}" data-plan-task="${esc(t.id)}" data-plan-fecha="${fecha}" aria-label="Asignar ${esc(t.nombre)} para ${esc(fmt(d, { weekday: "long", day: "numeric" }))}">${contenido}</button>`;
        })
        .join("");
      return `<div class="tareas-plan-row"><div class="tareas-plan-task"><strong>${esc(t.nombre)}</strong><span><svg class="app-icon"><use href="#icon-clock"></use></svg>${esc(duracionTexto(t.duracionMin))}</span></div>${celdas}</div>`;
    })
    .join("");

  grid.innerHTML =
    head +
    (rows ||
      '<div class="tareas-plan-empty-state"><strong>Sin tareas configuradas</strong><span>Creá tareas desde Configuración para empezar a planificar.</span></div>');

  if (resumen) {
    const totalCeldas = tareas.reduce(
      (acc, t) => acc + dias.filter((d) => correspondeDia(t, iso(d))).length,
      0,
    );
    const pendientes = Math.max(0, totalCeldas - asignadas);
    const cobertura = totalCeldas ? Math.round((asignadas / totalCeldas) * 100) : 0;
    resumen.innerHTML = `
      <article class="tareas-plan-kpi is-total"><span><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><div><small>Tareas activas</small><strong>${tareas.length}</strong><em>en esta semana</em></div></article>
      <article class="tareas-plan-kpi is-morning"><span>M</span><div><small>Asignaciones mañana</small><strong>${asignadasManana}</strong><em>${personas.size} personas</em></div></article>
      <article class="tareas-plan-kpi is-evening"><span>T</span><div><small>Asignaciones tarde</small><strong>${asignadasTarde}</strong><em>${cobertura}% cubierto</em></div></article>
      <article class="tareas-plan-kpi is-pending"><span><svg class="app-icon"><use href="#icon-clock"></use></svg></span><div><small>Casilleros pendientes</small><strong>${pendientes}</strong><em>${asignadas} asignados</em></div></article>`;
  }
  $("btnPlanCambiarSector").disabled = sectoresPermitidos().length < 2;
}

async function guardarCeldaPlan(tarea, fecha, turno, responsables) {
  if (planGuardando) return false;
  const lista = [
    ...new Set(
      (Array.isArray(responsables) ? responsables : [responsables])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!lista.length) return false;
  planGuardando = true;
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/asignacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: tarea.id,
        fecha,
        turno,
        responsables: lista,
        estado: "pendiente",
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo guardar la asignación");
    tarea.asignaciones = tarea.asignaciones || {};
    tarea.asignaciones[fecha] = tarea.asignaciones[fecha] || {};
    tarea.asignaciones[fecha][turno] = data.asignacion || {
      responsables: lista,
      estado: "pendiente",
    };
    guardarLocal(leer());
    renderPlanificacion();
    return true;
  } catch (error) {
    window.AutoservicioDialog?.alert?.({
      title: "No se pudo asignar",
      message: error.message || "Intentá nuevamente.",
    });
    return false;
  } finally {
    planGuardando = false;
  }
}
async function quitarCeldaPlan(tarea, fecha, turno) {
  if (planGuardando) return false;
  planGuardando = true;
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/asignacion`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tarea.id, fecha, turno }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo quitar la asignación");
    if (tarea.asignaciones?.[fecha]?.[turno])
      delete tarea.asignaciones[fecha][turno];
    if (
      tarea.asignaciones?.[fecha] &&
      !Object.keys(tarea.asignaciones[fecha]).length
    )
      delete tarea.asignaciones[fecha];
    guardarLocal(leer());
    renderPlanificacion();
    return true;
  } catch (error) {
    window.AutoservicioDialog?.alert?.({
      title: "No se pudo quitar",
      message: error.message || "Intentá nuevamente.",
    });
    return false;
  } finally {
    planGuardando = false;
  }
}
function asegurarModalPlanificacion() {
  let modal = $("tareasPlanModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "tareasPlanModal";
  modal.className = "tareas-plan-modal oculto";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="tareas-plan-modal-backdrop" data-plan-close></div>
    <section class="tareas-plan-modal-card" role="dialog" aria-modal="true" aria-labelledby="tareasPlanModalTitulo">
      <header class="tareas-plan-modal-head">
        <div class="tareas-plan-modal-titlebox">
          <span id="tareasPlanModalKicker" class="tareas-plan-modal-kicker">PLANIFICACIÓN SEMANAL</span>
          <h3 id="tareasPlanModalTitulo">Asignar usuarios a la tarea</h3>
          <strong id="tareasPlanModalTarea" class="tareas-plan-modal-taskname"></strong>
          <p id="tareasPlanModalFecha"></p>
        </div>
        <button type="button" class="tareas-plan-modal-close" data-plan-close aria-label="Cerrar">×</button>
      </header>

      <section class="tareas-plan-modal-block">
        <div class="tareas-plan-modal-label">
          <strong>Turno</strong>
          <span>Elegí el turno y después una o más personas</span>
        </div>
        <div class="tareas-plan-modal-turnos" role="tablist" aria-label="Turno">
          <button type="button" data-plan-turno="manana">
            <span class="tareas-plan-turno-dot is-manana"></span>
            <span><small>Turno</small><strong>Mañana</strong></span>
          </button>
          <button type="button" data-plan-turno="tarde">
            <span class="tareas-plan-turno-dot is-tarde"></span>
            <span><small>Turno</small><strong>Tarde</strong></span>
          </button>
        </div>
      </section>

      <section class="tareas-plan-modal-block">
        <div class="tareas-plan-modal-label tareas-plan-modal-label-row">
          <div>
            <strong>Responsables</strong>
            <span>Podés seleccionar más de una persona</span>
          </div>
          <b id="tareasPlanSeleccionados" class="tareas-plan-selected-count">0 seleccionados</b>
        </div>
        <div id="tareasPlanModalUsuarios" class="tareas-plan-modal-users"></div>
      </section>

      <footer class="tareas-plan-modal-actions">
        <div class="tareas-plan-modal-actions-main">
          <button type="button" id="btnPlanGuardar" class="tareas-plan-modal-save">Guardar asignación</button>
        </div>
      </footer>
    </section>`;

  document.body.appendChild(modal);
  modal
    .querySelectorAll("[data-plan-close]")
    .forEach((btn) => btn.addEventListener("click", cerrarModalPlanificacion));
  modal
    .querySelectorAll("[data-plan-turno]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        seleccionarTurnoPlanModal(btn.dataset.planTurno),
      ),
    );
  $("btnPlanGuardar").addEventListener("click", guardarDesdeModalPlanificacion);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarModalPlanificacion();
  });
  return modal;
}

function cerrarModalPlanificacion() {
  const modal = $("tareasPlanModal");
  if (!modal) return;
  modal.classList.add("oculto");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tareas-plan-modal-open");
  planModalEstado = null;
}

function actualizarResumenSeleccionPlan() {
  if (!planModalEstado) return;
  const cantidad = planModalEstado.seleccionados?.size || 0;
  const texto = $("tareasPlanSeleccionados");
  if (texto)
    texto.textContent = `${cantidad} ${cantidad === 1 ? "seleccionado" : "seleccionados"}`;
  const guardar = $("btnPlanGuardar");
  if (guardar) guardar.disabled = !planModalEstado.turno || planGuardando;
}

async function datosTurnoPlan(tarea, fecha, turno) {
  const actual = tarea.asignaciones?.[fecha]?.[turno] || null;
  const anteriorFecha = fechaSeleccionada;
  fechaSeleccionada = parseFecha(fecha);
  let disponibles = await usuariosDisponiblesCalendario(turno);
  fechaSeleccionada = anteriorFecha;

  const existentes = (actual?.responsables || []).map((nombre) => ({
    usuario: nombre,
    nombre,
    horario: "Asignado actualmente",
  }));

  const mapa = new Map();
  [...existentes, ...disponibles].forEach((u) => {
    const clave = normalClave(u.nombre || u.usuario);
    if (clave && !mapa.has(clave)) mapa.set(clave, u);
  });

  return { actual, disponibles: [...mapa.values()] };
}

function renderUsuariosPlanModal() {
  if (!planModalEstado) return;
  const box = $("tareasPlanModalUsuarios");
  const lista = planModalEstado.disponibles || [];
  const seleccionados = planModalEstado.seleccionados || new Set();

  if (!lista.length) {
    box.innerHTML = `
      <div class="tareas-plan-modal-empty">
        <span>○</span>
        <strong>Sin personas disponibles</strong>
        <small>No hay usuarios de este sector trabajando ese día en este turno.</small>
      </div>`;
    actualizarResumenSeleccionPlan();
    return;
  }

  box.innerHTML = lista
    .map((u) => {
      const nombre = String(u.nombre || u.usuario || "").trim();
      const seleccionado = [...seleccionados].some(
        (x) => normalClave(x) === normalClave(nombre),
      );
      const inicial = nombre.charAt(0).toUpperCase() || "?";
      return `<button type="button" class="tareas-plan-user-option ${seleccionado ? "is-selected" : ""}" data-plan-user="${esc(nombre)}" aria-pressed="${seleccionado}">
      <span class="tareas-plan-user-avatar">${esc(inicial)}</span>
      <span class="tareas-plan-user-copy">
        <strong>${esc(nombre)}</strong>
        <small>${esc(u.horario || "Disponible")}</small>
      </span>
      <span class="tareas-plan-user-check">${seleccionado ? "✓" : ""}</span>
    </button>`;
    })
    .join("");

  box.querySelectorAll("[data-plan-user]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const nombre = btn.dataset.planUser || "";
      const existente = [...planModalEstado.seleccionados].find(
        (x) => normalClave(x) === normalClave(nombre),
      );
      if (existente) planModalEstado.seleccionados.delete(existente);
      else planModalEstado.seleccionados.add(nombre);

      const activo = !existente;
      btn.classList.toggle("is-selected", activo);
      btn.setAttribute("aria-pressed", String(activo));
      const check = btn.querySelector(".tareas-plan-user-check");
      if (check) check.textContent = activo ? "✓" : "";
      actualizarResumenSeleccionPlan();
    }),
  );

  actualizarResumenSeleccionPlan();
}

async function seleccionarTurnoPlanModal(turno) {
  if (!planModalEstado || planGuardando) return;
  planModalEstado.turno = turno;

  const modal = asegurarModalPlanificacion();
  modal.querySelectorAll("[data-plan-turno]").forEach((btn) => {
    const activo = btn.dataset.planTurno === turno;
    btn.classList.toggle("is-active", activo);
    btn.setAttribute("aria-selected", String(activo));
  });

  const box = $("tareasPlanModalUsuarios");
  box.innerHTML = `<div class="tareas-plan-modal-loading"><span></span><strong>Cargando personas disponibles…</strong></div>`;
  $("btnPlanGuardar").disabled = true;

  const { actual, disponibles } = await datosTurnoPlan(
    planModalEstado.tarea,
    planModalEstado.fecha,
    turno,
  );
  if (!planModalEstado || planModalEstado.turno !== turno) return;

  planModalEstado.actual = actual;
  planModalEstado.disponibles = disponibles;
  planModalEstado.seleccionados = new Set(
    (actual?.responsables || []).map((x) => String(x).trim()).filter(Boolean),
  );

  renderUsuariosPlanModal();
}

async function guardarDesdeModalPlanificacion() {
  if (!planModalEstado || planGuardando || !planModalEstado.turno) return;
  const responsables = [...(planModalEstado.seleccionados || [])];

  const boton = $("btnPlanGuardar");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Guardando…";
  }

  let ok = true;

  if (responsables.length) {
    ok = await guardarCeldaPlan(
      planModalEstado.tarea,
      planModalEstado.fecha,
      planModalEstado.turno,
      responsables,
    );
  } else if (planModalEstado.actual) {
    // Si se destildan todos los usuarios y se guarda,
    // la asignación de ese turno queda eliminada.
    ok = await quitarCeldaPlan(
      planModalEstado.tarea,
      planModalEstado.fecha,
      planModalEstado.turno,
    );
  } else {
    // No había asignación y sigue sin responsables: simplemente queda sin asignar.
    renderPlanificacion();
  }

  if (ok !== false) cerrarModalPlanificacion();
  else if (boton) {
    boton.textContent = "Guardar asignación";
    actualizarResumenSeleccionPlan();
  }
}

async function editarCeldaPlan(taskId, fecha) {
  if (!puedeAsignar()) return;
  const tarea = leer().find((t) => t.id === taskId);
  if (!tarea) return;

  /* La grilla sigue respetando los días configurados para la tarea. */
  if (!correspondeDia(tarea, fecha)) return;

  const existentes = asignacionesCeldaPlan(tarea, fecha);
  const turnoInicial = existentes.length === 1 ? existentes[0].turno : "manana";

  planModalEstado = {
    tarea,
    fecha,
    turno: turnoInicial,
    actual: null,
    disponibles: [],
    seleccionados: new Set(),
  };

  const modal = asegurarModalPlanificacion();
  $("tareasPlanModalTitulo").textContent = "Asignar usuarios a la tarea";
  $("tareasPlanModalTarea").textContent = tarea.nombre;
  $("tareasPlanModalFecha").textContent = fmt(parseFecha(fecha), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $("tareasPlanModalKicker").textContent =
    `${sectorSeleccionado || "Sector"} · ${duracionTexto(tarea.duracionMin)}`;

  modal.classList.remove("oculto");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("tareas-plan-modal-open");

  await seleccionarTurnoPlanModal(turnoInicial);
  requestAnimationFrame(() =>
    modal.querySelector("[data-plan-turno].is-active")?.focus(),
  );
}

function abrirPlanificacion() {
  if (!puedeAsignar()) {
    window.AutoservicioDialog?.alert?.({
      title: "Sin permiso",
      message: "Tu rol no puede modificar la planificación semanal.",
    });
    return;
  }
  planSemanaBase = inicioSemana(fechaSeleccionada);
  cambiarVista("planificacion");
}

async function cambiarEstado(id, turno) {
  const clave = `${id}::${iso(fechaSeleccionada)}::${turno}`;
  if (tareasCompletando.has(clave)) return false;
  const all = leer(),
    t = all.find((x) => x.id === id),
    fecha = iso(fechaSeleccionada),
    a = t?.asignaciones?.[fecha]?.[turno];
  if (!a || a.estado === "completada") return false;
  const ok = await window.AutoservicioDialog?.confirm?.({
    title: "¿Confirmar tarea completada?",
    message: `Se marcará “${t.nombre}” como completada y se notificará al supervisor correspondiente.`,
    confirmText: "Confirmar",
    cancelText: "Cancelar",
  });
  if (ok !== true) return false;
  tareasCompletando.add(clave);
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/completar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fecha, turno }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo completar la tarea");
    Object.assign(a, data.asignacion || {});
    guardarLocal(all);
    renderTareas();
    return true;
  } catch (error) {
    window.AutoservicioDialog?.alert?.({
      title: "No se pudo completar",
      message: error.message || "Intentá nuevamente.",
    });
    return false;
  } finally {
    tareasCompletando.delete(clave);
  }
}

function renderEstadoTareaModal() {
  document
    .querySelectorAll("#tareaEstadoSelector [data-tarea-estado]")
    .forEach((btn) => {
      const activo = btn.dataset.tareaEstado === "activa";
      const seleccionado = activo === tareaEstadoSeleccionado;
      btn.classList.toggle("is-selected", seleccionado);
      btn.setAttribute("aria-pressed", String(seleccionado));
    });
}

function leerEstadoTareaModal() {
  return {
    nombre: $("tareaNombre")?.value.trim() || "",
    duracionMin: duracionDesdeInput($("tareaDuracion")?.value || "00:00"),
    diasSemana: diasSeleccionadosModal().map(Number).sort((a, b) => a - b),
    activo: Boolean(tareaEstadoSeleccionado),
  };
}

function actualizarEstadoGuardarTarea() {
  const guardar = $("btnGuardarTarea");
  if (!guardar) return;
  if (!tareaEditando) {
    guardar.disabled = false;
    guardar.setAttribute("aria-disabled", "false");
    return;
  }
  const cambio = JSON.stringify(leerEstadoTareaModal()) !== JSON.stringify(tareaModalEstadoInicial);
  guardar.disabled = !cambio;
  guardar.setAttribute("aria-disabled", String(!cambio));
}

function prepararAccionesModalTarea() {
  const modal = $("tareaModal");
  const acciones = modal?.querySelector(".modal-actions");
  const eliminar = $("btnEliminarTarea");
  const guardar = $("btnGuardarTarea");
  if (!modal || !acciones || !eliminar || !guardar) return;
  if (eliminar.parentElement !== acciones) acciones.insertBefore(eliminar, guardar);
}

function abrir(t = null) {
  tareaEditando = t;
  tareaEstadoSeleccionado = t?.activo !== false;
  normalizarSector();
  $("tareaModalTitulo").textContent = t ? "Editar tarea" : "Nueva tarea";
  $("tareaNombre").value = t?.nombre || "";
  establecerDuracionSelector(t?.duracionMin || 10);
  establecerDiasModal(t?.diasSemana);
  $("tareaModalAdminActions").classList.toggle("oculto", !t);
  $("tareaModal").classList.toggle("is-editing", Boolean(t));
  $("btnEliminarTarea").classList.toggle("oculto", !t);
  $("btnGuardarTarea").querySelector("span").textContent = t
    ? "Guardar cambios"
    : "Guardar tarea";
  renderEstadoTareaModal();
  tareaModalEstadoInicial = leerEstadoTareaModal();
  actualizarEstadoGuardarTarea();
  $("tareaModal").classList.remove("oculto");
  $("tareaModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("tareas-modal-open");
}
function cerrar() {
  $("tareaModal").classList.add("oculto");
  $("tareaModal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("tareas-modal-open");
  $("tareaModal")?.classList.remove("is-editing");
  tareaEditando = null;
  tareaModalEstadoInicial = null;
}
async function guardarForm() {
  const nombre = $("tareaNombre").value.trim(),
    duracionMin = duracionDesdeInput($("tareaDuracion").value),
    diasSemana = diasSeleccionadosModal();
  if (!nombre) {
    window.AutoservicioDialog?.alert?.({
      title: "Falta el nombre",
      message: "Escribí el nombre de la tarea.",
    });
    return;
  }
  if (!Number.isFinite(duracionMin) || duracionMin < 1) {
    window.AutoservicioDialog?.alert?.({
      title: "Duración inválida",
      message: "Seleccioná una duración mayor a cero.",
    });
    return;
  }
  if (!diasSemana.length) {
    window.AutoservicioDialog?.alert?.({
      title: "Faltan los días",
      message: "Seleccioná al menos un día de realización.",
    });
    return;
  }
  if (tareaEditando && tareaEditando.activo !== false && !tareaEstadoSeleccionado) {
    const ok = await window.AutoservicioDialog?.confirm?.({
      title: "Desactivar tarea",
      message: `¿Desactivar “${tareaEditando.nombre}”? Ya no aparecerá entre las tareas disponibles para asignar.`,
      confirmText: "Desactivar",
      danger: true,
    });
    if (ok === false) return;
  }
  const all = leer();
  if (tareaEditando) {
    const actual = all.find((x) => x.id === tareaEditando.id);
    Object.assign(actual, {
      nombre,
      duracionMin,
      sector: sectorSeleccionado,
      diasSemana,
      activo: tareaEstadoSeleccionado,
    });
  } else
    all.push({
      id: crypto.randomUUID?.() || String(Date.now()),
      nombre,
      descripcion: "",
      sector: sectorSeleccionado,
      duracionMin,
      diasSemana,
      turnoPermitido: "ambos",
      activo: tareaEstadoSeleccionado,
      asignaciones: {},
    });
  guardar(all);
  cerrar();
  renderTareas();
  renderConfig();
}
async function eliminarTareaActual() {
  if (!tareaEditando) return;
  const id = tareaEditando.id;
  const ok = await window.AutoservicioDialog?.confirm?.({
    title: "Eliminar tarea",
    message: `¿Eliminar “${tareaEditando.nombre}”?`,
    confirmText: "Eliminar",
    danger: true,
  });
  if (ok === false) return;
  guardar(
    leer().filter((x) => x.id !== id),
    { deletedIds: [id] },
  );
  cerrar();
  renderTareas();
  renderConfig();
}

async function cargarUsuariosTareas() {
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/usuarios`),
      data = await r.json();
    if (r.ok && data.ok) usuariosTareas = data.usuarios || [];
  } catch {}
  if (!usuariosTareas.length) {
    const u = usuario();
    usuariosTareas = u.nombre
      ? [
          {
            usuario: u.usuario || u.nombre,
            nombre: u.nombre,
            sector: u.sector || "",
          },
        ]
      : [];
  }
}
function normalClave(v) {
  return String(v || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
function mesCalendario(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function minutos(h) {
  const [a, b] = String(h || "")
    .split(":")
    .map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? a * 60 + b : null;
}
function intervalosTurno(def) {
  if (!def) return [];
  const out = [[minutos(def.inicio), minutos(def.fin)]];
  if (def.tipo === "cortado")
    out.push([minutos(def.inicio2), minutos(def.fin2)]);
  return out.filter((x) => x[0] !== null && x[1] !== null);
}
function coincideFranja(def, franja) {
  // Mañana termina y tarde comienza a las 15:00. La intersección debe ser
  // positiva: quien termina exactamente a las 15:00 no trabaja por la tarde.
  const rangos = { manana: [0, 15 * 60], tarde: [15 * 60, 24 * 60] };
  const objetivo = rangos[franja];
  if (!objetivo) return false;
  return intervalosTurno(def).some(
    ([ini, fin]) => ini < objetivo[1] && fin > objetivo[0],
  );
}
function horarioTexto(def) {
  return intervalosTurno(def)
    .map(
      ([a, b]) =>
        `${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}–${String(Math.floor(b / 60)).padStart(2, "0")}:${String(b % 60).padStart(2, "0")}`,
    )
    .join(" / ");
}
async function usuariosDisponiblesCalendario(turno) {
  try {
    const rc = await fetch(`${API_BASE_URL}/horarios/contexto`),
      ctx = await rc.json();
    if (!rc.ok || !ctx.ok) throw new Error();
    const sec = (ctx.sectores || []).find(
      (x) =>
        normalClave(x.id) === normalClave(sectorSeleccionado) ||
        normalClave(x.nombre) === normalClave(sectorSeleccionado),
    );
    if (!sec) return [];
    const rr = await fetch(
        `${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sec.id)}&mes=${mesCalendario(fechaSeleccionada)}`,
      ),
      cal = await rr.json();
    if (!rr.ok || !cal.ok) throw new Error();
    const dia = fechaSeleccionada.getDate(),
      defs = new Map((cal.turnos || []).map((x) => [x.id, x]));
    const celdas = (cal.celdas || []).filter((x) => Number(x.dia) === dia);
    const especiales = new Set(["franco", "vacaciones", "ausente", "licencia"]);
    return celdas
      .map((c) => ({ celda: c, def: defs.get(c.turno) }))
      .filter(
        (x) =>
          x.def &&
          !especiales.has(normalClave(x.celda.turno)) &&
          coincideFranja(x.def, turno),
      )
      .map((x) => {
        const info = (sec.empleadosInfo || []).find(
          (i) => normalClave(i.nombre) === normalClave(x.celda.empleado),
        );
        return {
          usuario: info?.usuario || x.celda.empleado,
          nombre: x.celda.empleado,
          horario: horarioTexto(x.def),
        };
      });
  } catch {
    return [];
  }
}
function sincronizarEstadoSeleccionAsignacion() {
  document.querySelectorAll("#asignarUsuarios input").forEach((input) => {
    input.checked =
      normalClave(input.value) === normalClave(asignarUsuarioSeleccionado);
    input.closest(".assign-user-card")?.classList.toggle("is-selected", input.checked);
  });
  document.querySelectorAll("#asignarTareasLista input").forEach((input) => {
    input.checked = asignarTareasSeleccionadas.has(input.value);
  });
}
function actualizarEstadoGuardarAsignacion() {
  const boton = $("btnGuardarAsignar");
  if (!boton) return;
  const valido = Boolean(
    asignarUsuarioSeleccionado &&
      $("asignarTurno")?.value &&
      (asignarTareasSeleccionadas.size || asignacionEditando?.porUsuario),
  );
  boton.disabled = !valido;
  boton.setAttribute("aria-disabled", String(!valido));
}
function actualizarCantidadResponsables() {
  const nodo = $("asignarResponsablesCantidad");
  if (nodo)
    nodo.textContent = asignarUsuarioSeleccionado
      ? "1 seleccionado"
      : "0 seleccionados";
  actualizarEstadoGuardarAsignacion();
}
function actualizarTituloAsignacionUsuario() {
  const titulo = $("asignarModalTitulo");
  if (!titulo) return;
  titulo.textContent = asignarUsuarioSeleccionado
    ? `Editar tareas de ${asignarUsuarioSeleccionado}`
    : "Editar tareas del equipo";
}
function usuariosAsignadosEnTurno(turno) {
  const fecha = iso(fechaSeleccionada);
  const mapa = new Map();
  leer()
    .filter((t) => (t.sector || "General") === sectorSeleccionado)
    .forEach((t) => {
      (asignacion(t, fecha, turno)?.responsables || []).forEach((nombre) => {
        const limpio = String(nombre || "").trim();
        const clave = normalClave(limpio);
        if (clave && !mapa.has(clave))
          mapa.set(clave, {
            usuario: limpio,
            nombre: limpio,
            horario: "Asignado actualmente",
          });
      });
    });
  return [...mapa.values()];
}
function cargarTareasUsuarioAsignacion() {
  const turno = $("asignarTurno")?.value || "",
    responsable = String(asignarUsuarioSeleccionado || "").trim(),
    fecha = iso(fechaSeleccionada),
    todasSector = leer().filter(
      (t) => (t.sector || "General") === sectorSeleccionado && t.activo !== false,
    );

  if (!turno || !responsable) {
    asignarDisponibles = [];
    asignarTareasSeleccionadas = new Set();
    $("asignarTareasCantidad").textContent = "Seleccioná un usuario";
    $("asignarTareasLista").innerHTML =
      '<div class="tareas-empty assign-empty"><strong>Elegí una persona</strong><span>Seleccioná un usuario de Mañana o Tarde para ver y modificar sus tareas.</span></div>';
    actualizarTituloAsignacionUsuario();
    actualizarEstadoGuardarAsignacion();
    return;
  }

  const yaAsignadas = todasSector.filter((t) =>
    (asignacion(t, fecha, turno)?.responsables || []).some(
      (r) => normalClave(r) === normalClave(responsable),
    ),
  );
  asignarDisponibles = [
    ...new Map(
      [
        ...todasSector.filter((t) => correspondeDia(t, fecha)),
        ...yaAsignadas,
      ].map((t) => [t.id, t]),
    ).values(),
  ];
  asignarTareasSeleccionadas = new Set(yaAsignadas.map((t) => t.id));
  actualizarTituloAsignacionUsuario();
  renderTareasAsignables();
}
async function renderResponsablesAsignacion() {
  const pedido = ++solicitudResponsables,
    box = $("asignarUsuarios"),
    turno = $("asignarTurno").value,
    seleccionadoAntes = String(asignarUsuarioSeleccionado || "").trim();

  box.innerHTML =
    '<div class="assign-loading-inline"><span></span><strong>Consultando personas del turno…</strong></div>';
  $("asignarResponsablesCantidad").textContent = "0 seleccionados";

  let lista = await usuariosDisponiblesCalendario(turno);
  if (pedido !== solicitudResponsables) return;

  const unicos = new Map();
  [...usuariosAsignadosEnTurno(turno), ...lista].forEach((item) => {
    const nombre = String(item.nombre || item.usuario || "").trim();
    const clave = normalClave(nombre);
    if (!clave) return;
    if (!unicos.has(clave)) unicos.set(clave, { ...item, nombre });
    else if (item.horario && item.horario !== "Asignado actualmente")
      unicos.set(clave, { ...unicos.get(clave), ...item, nombre });
  });
  lista = [...unicos.values()].sort((a, b) =>
    String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), "es", {
      sensitivity: "base",
    }),
  );

  const sigueDisponible = lista.some(
    (u) => normalClave(u.nombre || u.usuario) === normalClave(seleccionadoAntes),
  );
  asignarUsuarioSeleccionado = sigueDisponible ? seleccionadoAntes : "";

  if (!lista.length) {
    box.innerHTML =
      '<div class="tareas-empty assign-empty"><strong>Sin usuarios en este turno</strong><span>No hay personas de este sector trabajando en este día y turno.</span></div>';
  } else {
    box.innerHTML = lista
      .map((u) => {
        const nombre = String(u.nombre || u.usuario || "").trim();
        const inicial = nombre.charAt(0).toUpperCase() || "?";
        const elegido =
          normalClave(nombre) === normalClave(asignarUsuarioSeleccionado);
        return `<label class="assign-user-card ${elegido ? "is-selected" : ""}"><input type="radio" name="asignarUsuarioRadio" value="${esc(nombre)}" ${elegido ? "checked" : ""}><span class="assign-user-avatar">${esc(inicial)}</span><span class="assign-user-copy"><strong>${esc(nombre)}</strong><small>${esc(u.horario || "Disponible en el turno")}</small></span><span class="assign-user-check"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span></label>`;
      })
      .join("");
  }

  sincronizarEstadoSeleccionAsignacion();
  actualizarCantidadResponsables();
  cargarTareasUsuarioAsignacion();
}
function renderTareasAsignables() {
  const q = normalClave($("asignarBuscarTarea").value),
    lista = asignarDisponibles.filter(
      (t) => !q || normalClave(t.nombre).includes(q),
    );
  const dia = fmt(fechaSeleccionada, { weekday: "long" });
  $("asignarTareasCantidad").textContent = asignarUsuarioSeleccionado
    ? `${lista.length} para ${dia}`
    : "Seleccioná un usuario";
  $("asignarTareasLista").innerHTML = lista.length
    ? lista
        .map(
          (t) => {
            const a = asignacion(t, iso(fechaSeleccionada), $("asignarTurno").value);
            const responsables = (a?.responsables || []).filter(Boolean);
            const otros = responsables.filter(
              (r) => normalClave(r) !== normalClave(asignarUsuarioSeleccionado),
            );
            const detalle = otros.length
              ? `${duracionTexto(t.duracionMin)} · También: ${otros.join(", ")}`
              : duracionTexto(t.duracionMin);
            return `<label class="assign-task-option"><input type="checkbox" value="${t.id}" ${asignarTareasSeleccionadas.has(t.id) ? "checked" : ""}><span class="assign-task-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><span class="assign-task-copy"><strong>${esc(t.nombre)}</strong><small>${esc(detalle)}</small></span><span class="assign-task-mark"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span></label>`;
          },
        )
        .join("")
    : `<div class="tareas-empty assign-empty"><strong>${q ? "Sin coincidencias" : asignarUsuarioSeleccionado ? "Sin tareas para este día" : "Elegí una persona"}</strong><span>${q ? "Probá con otro nombre." : asignarUsuarioSeleccionado ? `No hay tareas configuradas para ${dia}.` : "Seleccioná un usuario del turno para administrar sus tareas."}</span></div>`;
  sincronizarEstadoSeleccionAsignacion();
  actualizarEstadoGuardarAsignacion();
}
function renderTurnosAsignacion(
  disponibles = ["manana", "tarde"],
  preferido = "",
) {
  const input = $("asignarTurno"),
    botones = [
      ...document.querySelectorAll("#asignarTurnoOpciones [data-turno]"),
    ],
    elegido = disponibles.includes(preferido)
      ? preferido
      : disponibles[0] || "";
  input.value = elegido;
  botones.forEach((btn) => {
    const ok = disponibles.includes(btn.dataset.turno);
    btn.disabled = !ok;
    btn.classList.toggle("is-active", ok && btn.dataset.turno === elegido);
    btn.setAttribute(
      "aria-checked",
      String(ok && btn.dataset.turno === elegido),
    );
  });
  actualizarEstadoGuardarAsignacion();
}
async function elegirTurnoAsignacion(turno) {
  const btn = document.querySelector(
    `#asignarTurnoOpciones [data-turno="${turno}"]`,
  );
  if (!btn || btn.disabled) return;
  $("asignarTurno").value = turno;
  document
    .querySelectorAll("#asignarTurnoOpciones [data-turno]")
    .forEach((x) => {
      x.classList.toggle("is-active", x.dataset.turno === turno);
      x.setAttribute("aria-checked", String(x.dataset.turno === turno));
    });
  await renderResponsablesAsignacion();
}
function cerrarAsignar() {
  asignacionEditando = null;
  asignarUsuarioSeleccionado = "";
  asignarTareasSeleccionadas.clear();
  asignarDisponibles = [];
  solicitudResponsables++;
  $("asignarModal").classList.add("oculto");
  $("asignarModal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("tareas-modal-open");
  $("btnGuardarAsignar").disabled = true;
}
async function guardarAsignacion() {
  const turno = $("asignarTurno").value,
    responsable = asignarUsuarioSeleccionado.trim(),
    ids = [...asignarTareasSeleccionadas],
    fecha = iso(fechaSeleccionada);
  if (
    !turno ||
    !responsable ||
    (!ids.length && !asignacionEditando?.porUsuario)
  ) {
    window.AutoservicioDialog?.alert?.({
      title: "Faltan datos",
      message: "Seleccioná un usuario, el turno y al menos una tarea.",
    });
    return;
  }
  const boton = $("btnGuardarAsignar"),
    etiqueta = boton?.querySelector("span");
  boton.disabled = true;
  if (etiqueta) etiqueta.textContent = "Guardando…";
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/asignaciones-lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          fecha,
          turno,
          responsable,
          reemplazar: true,
        }),
      }),
      data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudieron guardar las tareas");
    if (Array.isArray(data.tareas)) guardarLocal(data.tareas);
    else await cargarTareasRemotas();
    cerrarAsignar();
    renderTareas();
  } catch (error) {
    window.AutoservicioDialog?.alert?.({
      title: "No se pudo asignar",
      message: error.message || "Intentá nuevamente.",
    });
    boton.disabled = false;
    if (etiqueta) etiqueta.textContent = "Guardar cambios";
  }
}
async function abrirEditarUsuario(responsable, turno) {
  const fecha = iso(fechaSeleccionada);
  asignacionEditando = { porUsuario: true, fecha, turno, responsable };
  asignarUsuarioSeleccionado = responsable;
  asignarTareasSeleccionadas = new Set();
  asignarDisponibles = [];
  $("asignarFechaTexto").textContent = fmt(fechaSeleccionada, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  $("asignarBuscarTarea").value = "";
  actualizarTituloAsignacionUsuario();
  const etiquetaGuardar = $("btnGuardarAsignar")?.querySelector("span");
  if (etiquetaGuardar) etiquetaGuardar.textContent = "Guardar cambios";
  $("asignarModal").classList.remove("oculto");
  $("asignarModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("tareas-modal-open");
  renderTurnosAsignacion(["manana", "tarde"], turno);
  await cargarUsuariosTareas();
  await renderResponsablesAsignacion();
  sincronizarEstadoSeleccionAsignacion();
  actualizarCantidadResponsables();
  actualizarEstadoGuardarAsignacion();
}


function configBano() {
  const cfg =
    banoMemoria ||
    leerJSONUsuario(BANO_KEY, {
      participantes: [],
      fechaAncla: iso(new Date()),
      historial: [],
    });
  return {
    participantes: Array.isArray(cfg.participantes) ? cfg.participantes : [],
    fechaAncla: cfg.fechaAncla || cfg.fechaInicio || iso(new Date()),
    historial: Array.isArray(cfg.historial) ? cfg.historial : [],
  };
}
async function cargarBanoRemoto() {
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/bano`),
      data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo cargar la rotación");
    banoMemoria = data.config || {};
    guardarJSONUsuario(BANO_KEY, banoMemoria);
    guardarJSONUsuario(BANO_HISTORY_KEY, banoMemoria.historial || []);
    window.dispatchEvent(new CustomEvent("autoservicio:bano-actualizado"));
  } catch {
    banoMemoria = leerJSONUsuario(BANO_KEY, {
      participantes: [],
      fechaAncla: iso(new Date()),
      historial: leerJSONUsuario(BANO_HISTORY_KEY, []),
    });
  }
}
function claveParticipante(valor) {
  if (valor && typeof valor === "object")
    return String(valor.usuario || valor.nombre || "");
  return String(valor || "");
}
function usuarioParticipante(clave) {
  return (
    usuariosTareas.find((u) => u.usuario === clave) ||
    usuariosTareas.find((u) => (u.nombre || u.usuario) === clave) ||
    null
  );
}
function nombreParticipante(clave) {
  const u = usuarioParticipante(clave);
  return u?.nombre || u?.usuario || clave || "Sin participantes";
}
function esDiaLimpieza(fecha, cfg) {
  const dias = Math.floor(
    (inicioDia(fecha) - parseFecha(cfg.fechaAncla)) / 86400000,
  );
  return ((dias % 2) + 2) % 2 === 0;
}
function indiceBano(fecha, cfg) {
  if (!cfg.participantes.length || !esDiaLimpieza(fecha, cfg)) return -1;
  const dias = Math.floor(
    (inicioDia(fecha) - parseFecha(cfg.fechaAncla)) / 86400000,
  );
  const turno = Math.floor(dias / 2);
  return (
    ((turno % cfg.participantes.length) + cfg.participantes.length) %
    cfg.participantes.length
  );
}
function responsableBano(fecha, cfg) {
  const i = indiceBano(fecha, cfg);
  return i < 0
    ? ""
    : nombreParticipante(claveParticipante(cfg.participantes[i]));
}
function siguienteDiaLimpieza(desde, cfg, incluirHoy = false) {
  const base = inicioDia(new Date(desde));
  for (let offset = incluirHoy ? 0 : 1; offset < 90; offset++) {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    if (esDiaLimpieza(d, cfg)) return d;
  }
  return null;
}
function historialCompletoBano(cfg, hoy = inicioDia(new Date())) {
  const existentes = new Map(
    (cfg.historial || [])
      .filter((x) => x?.fecha)
      .map((x) => [String(x.fecha), { ...x }]),
  );
  if (!cfg.participantes.length)
    return [...existentes.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const inicio = inicioDia(parseFecha(cfg.fechaAncla));
  if (Number.isNaN(inicio.getTime()) || inicio > hoy)
    return [...existentes.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  for (let d = new Date(inicio); d <= hoy; d.setDate(d.getDate() + 1)) {
    if (!esDiaLimpieza(d, cfg)) continue;
    const fecha = iso(d);
    const registro = existentes.get(fecha) || { fecha };
    if (!registro.responsable) {
      const indice = indiceBano(d, cfg);
      registro.responsable = indice >= 0 ? claveParticipante(cfg.participantes[indice]) : "";
    }
    existentes.set(fecha, registro);
  }
  return [...existentes.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

function puedeVerificarBano() {
  return ROLES_GESTION_TAREAS.includes(usuario()?.rol);
}

function renderBano() {
  const cfg = configBano(),
    hoy = inicioDia(new Date()),
    corresponde = esDiaLimpieza(hoy, cfg),
    responsable = responsableBano(hoy, cfg),
    hist = historialCompletoBano(cfg, hoy);
  const confirmado = corresponde ? hist.find((h) => h.fecha === iso(hoy) && h.usuario) : null;
  const sinParticipantes = !cfg.participantes.length;
  const fechaLarga = fmt(hoy, { weekday: "long", day: "numeric", month: "long" });
  const card = $("banoTurnoActual");
  card?.classList.toggle("is-completed", !!confirmado);
  card?.classList.toggle("is-rest", !corresponde);
  card?.classList.toggle("is-pending", corresponde && !confirmado);

  if (!corresponde) {
    card.innerHTML = `
      <div class="bano-modern-hero-copy">
        <span class="bano-modern-kicker">HOY NO CORRESPONDE</span>
        <strong>Día de descanso</strong>
        <small>${esc(fechaLarga)}</small>
      </div>
      <span class="bano-modern-status">Descanso</span>`;
  } else {
    card.innerHTML = `
      <div class="bano-modern-hero-copy">
        <span class="bano-modern-kicker">${confirmado ? "LIMPIEZA COMPLETADA" : "HOY LE TOCA A"}</span>
        <strong>${esc(responsable || "Sin participantes")}</strong>
        <small>${esc(fechaLarga)}</small>
      </div>
      ${confirmado
        ? `<div class="bano-modern-confirmed"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg><span>Completado</span></div>`
        : `<button id="btnConfirmarBano" class="bano-confirm-btn bano-confirm-modern" type="button" ${sinParticipantes ? "disabled" : ""}><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg><span>Marcar como completado</span></button>`}`;
  }

  const proximos = [];
  for (let offset = 1; proximos.length < 5 && offset < 30; offset++) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + offset);
    if (esDiaLimpieza(d, cfg)) {
      proximos.push({ fecha: d, nombre: responsableBano(d, cfg), orden: proximos.length + 1 });
    }
  }
  $("banoProximos").innerHTML = cfg.participantes.length
    ? proximos.map((x) => `
        <article class="bano-turn-card bano-turn-modern">
          <div class="bano-turn-date"><strong>${x.fecha.getDate()}</strong><span>${fmt(x.fecha, { month: "short" }).replace(".", "")}</span></div>
          <span class="bano-turn-order">${x.orden}</span>
          <div class="bano-turn-copy"><strong>${esc(x.nombre)}</strong><span>Limpieza del baño</span></div>
          <span class="bano-turn-day">${esc(fmt(x.fecha, { weekday: "long" }))}</span>
          <svg class="app-icon bano-turn-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </article>`).join("")
    : '<div class="tareas-empty"><strong>Sin participantes</strong><span>Seleccioná usuarios desde Configuración.</span></div>';

  // Mostrar como máximo la limpieza de hoy (si corresponde) + las 10 limpiezas anteriores.
  // En día de descanso se muestran las últimas 10 limpiezas.
  const limiteHistorial = corresponde ? 11 : 10;
  const historial = hist.slice(0, limiteHistorial);
  $("banoPendientesCantidad").textContent = String(historial.length);
  $("banoPendientes").innerHTML = historial.length
    ? `<div class="bano-history-table" role="table" aria-label="Historial de confirmaciones de limpieza del baño">
        <div class="bano-history-head" role="row">
          <span role="columnheader">Fecha</span>
          <span role="columnheader">Responsable de limpieza</span>
          <span role="columnheader">Confirmación responsable</span>
          <span role="columnheader">Supervisado por</span>
          <span role="columnheader">Confirmación de limpieza</span>
        </div>
        ${historial.map((x) => {
          const fecha = parseFecha(x.fecha);
          const responsableClave = x.responsable || (esDiaLimpieza(fecha, cfg) ? claveParticipante(cfg.participantes[indiceBano(fecha, cfg)]) : "");
          const responsableNombre = nombreParticipante(responsableClave);
          const confirmo = Boolean(String(x.usuario || "").trim());
          const verificado = Boolean(String(x.supervisadoPor || "").trim());
          const puedeVerificar = puedeVerificarBano();
          const accion = verificado
            ? '<span class="bano-history-status is-confirmed">Confirmado</span>'
            : puedeVerificar
              ? `<button type="button" class="bano-history-verify" data-bano-verificar="${esc(x.fecha)}" ${confirmo ? "" : 'disabled aria-disabled="true" title="El responsable todavía no confirmó la limpieza"'}>Confirmar</button>`
              : confirmo
                ? '<span class="bano-history-waiting">Pendiente</span>'
                : '<span class="bano-history-empty">—</span>';
          return `<div class="bano-history-row" role="row">
            <span class="bano-history-date" role="cell" data-label="Fecha">${esc(fmt(fecha, { day: "2-digit", month: "2-digit", year: "numeric" }))}</span>
            <strong role="cell" data-label="Responsable de limpieza">${esc(responsableNombre || "Sin participante")}</strong>
            <span role="cell" data-label="Confirmación responsable"><span class="bano-history-status ${confirmo ? "is-confirmed" : "is-unconfirmed"}">${confirmo ? "Confirmado" : "Sin confirmar"}</span></span>
            <span role="cell" data-label="Supervisado por">${verificado ? esc(x.supervisadoPor) : '<span class="bano-history-empty">—</span>'}</span>
            <span role="cell" data-label="Confirmación de limpieza">${accion}</span>
          </div>`;
        }).join("")}
      </div>`
    : `<div class="bano-all-confirmed"><span><svg class="app-icon" viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M4 9h16M5 5h14v16H5z"/></svg></span><div><strong>Sin historial todavía</strong><small>Las limpiezas realizadas aparecerán acá.</small></div></div>`;

  $("banoPendientes").querySelectorAll("[data-bano-verificar]").forEach((boton) => {
    boton.addEventListener("click", () => verificarBano(boton.dataset.banoVerificar, boton));
  });

  $("banoKpiParticipantes").textContent = String(cfg.participantes.length);
  const proxima = siguienteDiaLimpieza(hoy, cfg, !corresponde);
  $("banoKpiProxima").textContent = proxima ? (proxima.getTime() === hoy.getTime() ? "Hoy" : fmt(proxima, { weekday: "long" })) : "—";
  $("banoKpiProximaFecha").textContent = proxima ? fmt(proxima, { day: "numeric", month: "long" }) : "Sin fecha";

  $("btnConfirmarBano")?.addEventListener("click", confirmarBano);
  if ($("btnBanoActualizarHistorial")) {
    $("btnBanoActualizarHistorial").onclick = async () => {
      const boton = $("btnBanoActualizarHistorial");
      boton.disabled = true;
      try {
        await cargarBanoRemoto();
        renderBano();
      } finally {
        boton.disabled = false;
      }
    };
  }
}

async function confirmarBano() {
  const hoyFecha = new Date(),
    hoy = iso(hoyFecha),
    cfg = configBano();
  if (
    !esDiaLimpieza(hoyFecha, cfg) ||
    (cfg.historial || []).some((h) => h.fecha === hoy)
  )
    return;
  const boton = $("btnConfirmarBano");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Confirmando...";
  }
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/bano/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: hoy }),
      }),
      data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo confirmar");
    banoMemoria = data.config;
    guardarJSONUsuario(BANO_KEY, banoMemoria);
    guardarJSONUsuario(BANO_HISTORY_KEY, banoMemoria.historial || []);
    window.dispatchEvent(new CustomEvent("autoservicio:bano-actualizado"));
    renderBano();
  } catch (error) {
    window.AutoservicioDialog?.alert?.({
      title: "No se pudo confirmar",
      message: error.message || "Intentá nuevamente.",
    });
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = '<svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg><span>Marcar como completado</span>';
    }
  }
}
async function verificarBano(fecha, boton) {
  if (!puedeVerificarBano() || !fecha) return;
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Confirmando...";
  }
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/bano/verificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo confirmar la limpieza");
    banoMemoria = data.config;
    guardarJSONUsuario(BANO_KEY, banoMemoria);
    guardarJSONUsuario(BANO_HISTORY_KEY, banoMemoria.historial || []);
    window.dispatchEvent(new CustomEvent("autoservicio:bano-actualizado"));
    renderBano();
  } catch (error) {
    window.AutoservicioDialog?.alert?.({
      title: "No se pudo confirmar la limpieza",
      message: error.message || "Intentá nuevamente.",
    });
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Confirmar";
    }
  }
}

function participantesConfigActuales() {
  const contenedor = selectorParticipantesBanoActivo();
  const base = Array.isArray(banoParticipantesBorrador)
    ? banoParticipantesBorrador.slice()
    : configBano().participantes.map(claveParticipante).filter(Boolean);
  if (!contenedor) return base;
  const inputs = [...contenedor.querySelectorAll("input[type=checkbox]")];
  const representados = new Set(inputs.map((x) => x.value).filter(Boolean));
  const marcados = new Set(inputs.filter((x) => x.checked).map((x) => x.value).filter(Boolean));
  const resultado = base.filter((clave) => !representados.has(clave) || marcados.has(clave));
  const existentes = new Set(resultado);
  inputs.filter((x) => x.checked).forEach((input) => {
    const clave = input.value;
    if (clave && !existentes.has(clave)) {
      resultado.push(clave);
      existentes.add(clave);
    }
  });
  banoParticipantesBorrador = resultado.slice();
  return resultado;
}
function colorSectorBano(nombreSector) {
  const clave = normalClave(nombreSector);
  const sector = (contextoTareas.sectores || []).find((s) =>
    normalClave(s?.nombre || s?.id) === clave || normalClave(s?.id) === clave
  );
  return sector?.color || "#7b61d1";
}
function estiloSectorBano(nombreSector) {
  const color = colorSectorBano(nombreSector);
  return `--bano-sector-color:${esc(color)}`;
}
function esMobileBano() {
  return window.matchMedia?.("(max-width: 620px)")?.matches === true;
}
function selectorParticipantesBanoActivo() {
  if (esMobileBano() && !$('banoMobileParticipantSheet')?.classList.contains('oculto'))
    return $('banoUsuariosDisponiblesMobile');
  return $('banoUsuariosDisponibles');
}
function renderParticipantesConfig(seleccionados) {
  const ordenSeleccionado = (seleccionados || []).map(claveParticipante).filter(Boolean);
  banoParticipantesBorrador = ordenSeleccionado.slice();
  const marcados = new Set(ordenSeleccionado);
  $("banoParticipantesCantidad").textContent = String(marcados.size);
  const seleccionadosInfo = ordenSeleccionado
    .map((clave) => usuarioParticipante(clave))
    .filter(Boolean);
  $("banoParticipantesSeleccionados").innerHTML = seleccionadosInfo.length
    ? seleccionadosInfo.map((u) => {
        const nombre = u.nombre || u.usuario || "Sin nombre";
        const sector = u.sector || "Sin sector";
        const clave = claveParticipante(u);
        return `<article class="bano-participant-row" data-participante="${esc(clave)}">
          <span class="bano-participant-name"><i>${esc(nombre.charAt(0).toUpperCase())}</i><strong>${esc(nombre)}</strong></span>
          <span class="bano-participant-sector" style="${estiloSectorBano(sector)}">${esc(sector)}</span>
          <span class="bano-participant-status"><i></i>Activo</span>
          <span class="bano-participant-row-actions"><button type="button" class="bano-remove-participant" data-remove-participant="${esc(clave)}" aria-label="Quitar a ${esc(nombre)} de la rotación" title="Quitar participante"><svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h4v2H4V6h4l1-2Zm-2 6h10l-.7 10H7.7L7 10Zm3 2v6m4-6v6"/></svg></button></span>
        </article>`;
      }).join("")
    : '<div class="bano-no-selected"><strong>Sin participantes seleccionados</strong><span>Agregá al menos una persona para iniciar la rotación.</span></div>';
  const q = normalClave(
    esMobileBano() && !$('banoMobileParticipantSheet')?.classList.contains('oculto')
      ? $("banoBuscarUsuarioMobile")?.value || ""
      : $("banoBuscarUsuario")?.value || "",
  );
  const lista = usuariosTareas.filter(
    (u) =>
      !q ||
      normalClave(
        `${u.nombre || ""} ${u.usuario || ""} ${u.sector || ""}`,
      ).includes(q),
  );
  const opcionesHtml = lista.length
    ? lista
        .map((u) => {
          const clave = claveParticipante(u),
            marcado = marcados.has(clave),
            sector = u.sector || "Sin sector";
          return `<label class="config-user-option bano-user-option"><input type="checkbox" value="${esc(clave)}" ${marcado ? "checked" : ""}><span class="config-user-check"><svg class="app-icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="bano-user-sector-dot" style="${estiloSectorBano(sector)}"></span><span class="config-user-copy"><strong>${esc(u.nombre || u.usuario)}</strong><small>${esc(sector)}</small></span></label>`;
        })
        .join("")
    : '<div class="config-participants-empty"><strong>Sin coincidencias</strong><span>Probá con otra búsqueda.</span></div>';
  if ($("banoUsuariosDisponibles")) $("banoUsuariosDisponibles").innerHTML = opcionesHtml;
  if ($("banoUsuariosDisponiblesMobile")) $("banoUsuariosDisponiblesMobile").innerHTML = opcionesHtml;
}

function abrirSelectorParticipantesBano() {
  const cfg = configBano();
  banoParticipantesBorrador = cfg.participantes.map(claveParticipante).filter(Boolean);
  if (esMobileBano()) {
    const sheet = $("banoMobileParticipantSheet");
    if (!sheet) return;
    if ($("banoBuscarUsuarioMobile")) $("banoBuscarUsuarioMobile").value = "";
    sheet.classList.remove("oculto");
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("bano-participant-sheet-open");
    renderParticipantesConfig(cfg.participantes);
    requestAnimationFrame(() => $("banoBuscarUsuarioMobile")?.focus());
    return;
  }
  const selector = $("banoSelectorParticipantes");
  selector?.classList.toggle("oculto");
  $("banoConfigFooter")?.classList.toggle("oculto", selector?.classList.contains("oculto") !== false);
}

function cerrarSelectorParticipantesBano({ restaurar = true } = {}) {
  const sheet = $("banoMobileParticipantSheet");
  sheet?.classList.add("oculto");
  sheet?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("bano-participant-sheet-open");
  if (restaurar) renderParticipantesConfig(configBano().participantes);
  banoParticipantesBorrador = restaurar ? null : banoParticipantesBorrador;
}

async function guardarConfigBano(participantesForzados = null, opciones = {}) {
  const anterior = configBano(),
    participantes = Array.isArray(participantesForzados) ? participantesForzados : participantesConfigActuales(),
    boton = $("btnGuardarConfigBano"),
    silencioso = opciones.silencioso === true;
  if (boton) {
    boton.disabled = true;
    boton.dataset.textoOriginal = boton.textContent;
    boton.textContent = "Guardando...";
  }
  try {
    const r = await fetch(`${API_BASE_URL}/tareas/bano`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantes,
          fechaAncla: anterior.fechaAncla || iso(new Date()),
        }),
      }),
      data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo guardar");
    banoMemoria = data.config;
    guardarJSONUsuario(BANO_KEY, banoMemoria);
    guardarJSONUsuario(BANO_HISTORY_KEY, banoMemoria.historial || []);
    window.dispatchEvent(new CustomEvent("autoservicio:bano-actualizado"));
    renderParticipantesConfig(banoMemoria.participantes);
    banoParticipantesBorrador = null;
    $("banoSelectorParticipantes")?.classList.add("oculto");
    $("banoConfigFooter")?.classList.add("oculto");
    cerrarSelectorParticipantesBano({ restaurar: false });
    renderBano();
    if (!silencioso) {
      window.AutoservicioDialog?.alert?.({
        title: "Configuración guardada",
        message:
          "La rotación quedó disponible para todos los usuarios y dispositivos.",
      });
    }
  } catch (error) {
    window.AutoservicioDialog?.alert?.({
      title: "No se pudo guardar",
      message: error.message || "Intentá nuevamente.",
    });
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = '<svg class="app-icon" viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5zM8 4v6h8V4M8 17h8" /></svg><span>Guardar</span>';
    }
  }
}


async function eliminarParticipanteBano(clave) {
  const cfg = configBano();
  const usuario = usuariosTareas.find((u) => claveParticipante(u) === clave);
  const nombre = usuario?.nombre || usuario?.usuario || clave || "este usuario";
  const ok = await window.AutoservicioDialog?.confirm?.({
    title: "Eliminar participante",
    message: `¿Estás seguro de que querés eliminar a “${nombre}” de la rotación del baño?`,
    confirmText: "Eliminar",
    cancelText: "Cancelar",
    danger: true,
  });
  if (ok !== true) return;

  const participantes = (cfg.participantes || []).filter((p) => claveParticipante(p) !== clave);
  await guardarConfigBano(participantes, { silencioso: true });
}

async function cambiarSectorConfig() {
  const sectores = sectoresPermitidos(),
    actual =
      $("configSectorFiltro").value ||
      sectorSeleccionado ||
      sectores[0] ||
      "General";
  let elegido = "";
  if (window.AppChoicePicker?.open)
    elegido = await window.AppChoicePicker.open({
      title: "Seleccionar sector",
      kicker: "Configuración de tareas",
      value: actual,
      options: sectores.map((s) => opcionSectorTareas(s, actual)),
    });
  else elegido = prompt("Sector", actual) || "";
  if (elegido && sectores.includes(elegido)) {
    $("configSectorFiltro").value = elegido;
    sectorSeleccionado = elegido;
    renderConfig();
  }
}
function renderConfig() {
  const permiso = puedeConfigurar();
  $("tareasConfigSinPermiso")?.classList.toggle("oculto", permiso);
  $("tareasConfigContenido")?.classList.toggle("oculto", !permiso);
  if (!permiso) return;

  const sectores = sectoresPermitidos();
  const sel = $("configSectorFiltro");
  const actual = sel.value || sectorSeleccionado || sectores[0] || "General";
  sel.innerHTML = sectores
    .map((sector) => `<option value="${esc(sector)}">${esc(sector)}</option>`)
    .join("");
  sel.value = sectores.includes(actual) ? actual : sectores[0] || "";
  sectorSeleccionado = sel.value || sectorSeleccionado;
  $("configSectorNombre").textContent = sel.value || "General";

  const todasPermitidas = leer().filter((t) =>
    sectores.includes(t.sector || "General"),
  );
  const activasGlobal = todasPermitidas.filter((t) => t.activo !== false).length;
  $("configTareasResumen").innerHTML = `
    <article class="config-kpi is-total"><span><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><div><small>Total</small><strong>${todasPermitidas.length}</strong><em>tareas registradas</em></div></article>
    <article class="config-kpi is-active"><span><svg class="app-icon"><use href="#icon-check"></use></svg></span><div><small>Activas</small><strong>${activasGlobal}</strong><em>en uso actualmente</em></div></article>
    <article class="config-kpi is-disabled"><span><svg class="app-icon"><use href="#icon-clock"></use></svg></span><div><small>Desactivadas</small><strong>${todasPermitidas.length - activasGlobal}</strong><em>no visibles al asignar</em></div></article>
    <article class="config-kpi is-sectors"><span><svg class="app-icon"><use href="#icon-store"></use></svg></span><div><small>Sectores</small><strong>${sectores.length}</strong><em>disponibles</em></div></article>`;

  const todasSector = leer().filter(
    (t) => (t.sector || "General") === sel.value,
  );
  const q = normalClave($("configBuscarTarea")?.value || "");
  const estado = $("configEstadoFiltro")?.value || "todos";
  const dia = $("configDiaFiltro")?.value || "todos";
  const diaNumero = dia === "todos" ? null : Number(dia);
  const lista = todasSector.filter((t) => {
    if (q && !normalClave(t.nombre).includes(q)) return false;
    if (estado === "activas" && t.activo === false) return false;
    if (estado === "desactivadas" && t.activo !== false) return false;
    if (diaNumero !== null && !diasTarea(t).includes(diaNumero)) return false;
    return true;
  });

  $("btnLimpiarBusquedaTarea")?.classList.toggle("oculto", !q);
  $("configTareasLista").innerHTML = lista.length
    ? lista
        .map((t) => {
          const activa = t.activo !== false;
          return `<article class="config-task-row ${activa ? "" : "is-disabled"}" data-id="${esc(t.id)}" tabindex="0">
            <div class="config-task-name"><span class="config-task-icon"><svg class="app-icon"><use href="#icon-tasks"></use></svg></span><strong>${esc(t.nombre)}</strong></div>
            <span class="config-task-duration"><svg class="app-icon"><use href="#icon-clock"></use></svg>${esc(duracionTexto(t.duracionMin))}</span>
            <div class="config-task-days-wrap">${etiquetaDiasTarea(t)}</div>
            <span class="config-task-status ${activa ? "is-active" : "is-disabled"}"><i></i>${activa ? "Activa" : "Desactivada"}</span>
            <button type="button" class="config-task-open" data-config-action="edit" aria-label="Editar ${esc(t.nombre)}"><svg class="app-icon"><use href="#icon-edit"></use></svg></button>
          </article>`;
        })
        .join("")
    : `<div class="tareas-empty config-tasks-empty"><strong>Sin tareas para mostrar</strong><span>${q || estado !== "todos" || dia !== "todos" ? "Modificá la búsqueda o los filtros." : `Agregá la primera tarea de ${esc(sel.value || "este sector")}.`}</span></div>`;
}

async function cambiarSector() {
  const opts = sectoresPermitidos().map((s) => opcionSectorTareas(s, sectorSeleccionado));
  if (window.AppChoicePicker?.open) {
    const v = await window.AppChoicePicker.open({
      title: "Seleccionar sector",
      kicker: "Tareas",
      value: sectorSeleccionado,
      options: opts,
    });
    if (v) {
      sectorSeleccionado = v;
      vistaActual === "planificacion" ? renderPlanificacion() : renderTareas();
    }
  } else {
    const v = prompt("Sector", sectorSeleccionado);
    if (v) {
      sectorSeleccionado = v;
      vistaActual === "planificacion" ? renderPlanificacion() : renderTareas();
    }
  }
}
function actualizarNavegacionTareas() {
  $("btnTareasPlanificacion")?.classList.toggle("oculto", !puedeAsignar());
  $("btnTareasConfiguracion")?.classList.toggle("oculto", !puedeConfigurar());
}

function crearBotonVolverTareas() {
  const topbar = document.querySelector(".pro-topbar");
  if (!topbar) return null;

  let boton = $("btnTareasVolverTopbar");
  if (boton) return boton;

  boton = document.createElement("button");
  boton.id = "btnTareasVolverTopbar";
  boton.type = "button";
  boton.className = "tareas-back-topbar admin-header-back-btn oculto";
  boton.setAttribute("aria-label", "Volver Atrás a Tareas Diarias");
  boton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  boton.addEventListener("click", () => {
    cambiarVista("tareas");
    window.scrollTo({ top: 0, behavior: "auto" });
  });
  topbar.appendChild(boton);
  return boton;
}

function actualizarBotonVolverTareas() {
  const mostrar = activo && (vistaActual === "planificacion" || vistaActual === "config");
  crearBotonVolverTareas()?.classList.toggle("oculto", !mostrar);
}

function cambiarVista(v) {
  if (v === "planificacion" && !puedeAsignar()) {
    window.AutoservicioDialog?.alert?.({
      title: "Sin permiso",
      message: "Tu rol no puede modificar la planificación semanal.",
    });
    v = "tareas";
  }
  if (v === "config" && !puedeConfigurar()) {
    window.AutoservicioDialog?.alert?.({
      title: "Sin permiso",
      message: "Tu rol no puede modificar la configuración de tareas.",
    });
    v = "tareas";
  }
  vistaActual = ["tareas", "planificacion", "config"].includes(v) ? v : "tareas";
  document.body.dataset.tareasVista = vistaActual;
  actualizarNavegacionTareas();
  actualizarBotonVolverTareas();
  document.querySelectorAll("[data-tareas-view]").forEach((x) => {
    const visible = x.dataset.tareasView === vistaActual;
    x.classList.toggle("oculto", !visible);
    x.setAttribute("aria-hidden", visible ? "false" : "true");
  });
  if (vistaActual === "tareas") renderTareas();
  if (vistaActual === "planificacion") renderPlanificacion();
  if (vistaActual === "config") renderConfig();
  requestAnimationFrame(() =>
    window.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    }),
  );
}

function renderConfigBano() {
  const permiso = puedeConfigurar();
  if (!permiso) return;
  const cfg = configBano();
  renderParticipantesConfig(cfg.participantes);
}

function cambiarVistaBano(v = "resumen") {
  if (v === "config" && !puedeConfigurar()) {
    window.AutoservicioDialog?.alert?.({
      title: "Sin permiso",
      message: "La configuración del baño está disponible para administradores y supervisores autorizados.",
    });
    v = "resumen";
  }
  banoVistaActual = v === "config" ? "config" : "resumen";
  document.body.dataset.banoVista = banoVistaActual;
  document.querySelectorAll("[data-bano-view]").forEach((x) => {
    const visible = x.dataset.banoView === banoVistaActual;
    x.classList.toggle("oculto", !visible);
    x.setAttribute("aria-hidden", visible ? "false" : "true");
  });
  if (banoVistaActual === "resumen") renderBano();
  else renderConfigBano();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}

function bind() {
  prepararSelectorDuracion();
  prepararSelectoresVisualesTareas();
  $("btnTareasSemanaAnterior").onclick = () => {
    semanaBase.setDate(semanaBase.getDate() - 7);
    fechaSeleccionada = new Date(semanaBase);
    renderTareas();
  };
  $("btnTareasSemanaSiguiente").onclick = () => {
    semanaBase.setDate(semanaBase.getDate() + 7);
    fechaSeleccionada = new Date(semanaBase);
    renderTareas();
  };
  $("btnTareasSemanaActual").onclick = () => {
    fechaSeleccionada = inicioDia(new Date());
    semanaBase = inicioSemana(fechaSeleccionada);
    renderTareas();
  };
  $("btnTareasCambiarSector").onclick = cambiarSector;
  $("btnTareasPlanificacion").onclick = abrirPlanificacion;
  $("btnTareasConfiguracion").onclick = () => cambiarVista("config");
  $("btnPlanSemanaAnterior").onclick = () => {
    planSemanaBase = new Date(planSemanaBase || inicioSemana(fechaSeleccionada));
    planSemanaBase.setDate(planSemanaBase.getDate() - 7);
    renderPlanificacion();
  };
  $("btnPlanSemanaSiguiente").onclick = () => {
    planSemanaBase = new Date(planSemanaBase || inicioSemana(fechaSeleccionada));
    planSemanaBase.setDate(planSemanaBase.getDate() + 7);
    renderPlanificacion();
  };
  $("btnPlanSemanaActual").onclick = () => {
    planSemanaBase = semanaPlanificacionPorDefecto();
    renderPlanificacion();
  };
  $("btnConfigNuevaTarea").onclick = () => {
    sectorSeleccionado = $("configSectorFiltro").value || sectorSeleccionado;
    abrir();
  };
  $("btnPlanCambiarSector").onclick = async () => {
    await cambiarSector();
    if (vistaActual === "planificacion") renderPlanificacion();
  };
  $("tareasPlanGrid").onclick = (e) => {
    const cell = e.target.closest("[data-plan-task][data-plan-fecha]");
    if (cell) editarCeldaPlan(cell.dataset.planTask, cell.dataset.planFecha);
  };
  prepararAccionesModalTarea();
  $("btnCerrarTareaModal").onclick = cerrar;
  $("btnGuardarTarea").onclick = guardarForm;
  $("btnEliminarTarea").onclick = eliminarTareaActual;
  $("tareaModal").addEventListener("input", actualizarEstadoGuardarTarea);
  $("tareaModal").addEventListener("change", actualizarEstadoGuardarTarea);
  document
    .querySelectorAll("#tareaEstadoSelector [data-tarea-estado]")
    .forEach((btn) => {
      btn.onclick = () => {
        tareaEstadoSeleccionado = btn.dataset.tareaEstado === "activa";
        renderEstadoTareaModal();
        actualizarEstadoGuardarTarea();
      };
    });
  $("tareaModal").onclick = (e) => {
    if (e.target.id === "tareaModal") cerrar();
  };
  $("btnCerrarAsignarModal").onclick = cerrarAsignar;
  $("btnGuardarAsignar").onclick = guardarAsignacion;
  document
    .querySelectorAll("#asignarTurnoOpciones [data-turno]")
    .forEach(
      (btn) => (btn.onclick = () => elegirTurnoAsignacion(btn.dataset.turno)),
    );
  $("asignarBuscarTarea").oninput = renderTareasAsignables;
  $("asignarTareasLista").onchange = (e) => {
    const input = e.target.closest('input[type="checkbox"]');
    if (input) {
      input.checked
        ? asignarTareasSeleccionadas.add(input.value)
        : asignarTareasSeleccionadas.delete(input.value);
    }
    actualizarEstadoGuardarAsignacion();
  };
  $("asignarUsuarios").onchange = (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    asignarUsuarioSeleccionado = input.value || "";
    sincronizarEstadoSeleccionAsignacion();
    actualizarCantidadResponsables();
    cargarTareasUsuarioAsignacion();
  };
  $("asignarModal").onclick = (e) => {
    if (e.target.id === "asignarModal") cerrarAsignar();
  };
  $("tareasLista").onclick = async (e) => {
    const edit = e.target.closest('button[data-accion="editar-usuario"]');
    if (edit) {
      const card = edit.closest(".tarea-user-card");
      if (card)
        abrirEditarUsuario(card.dataset.responsable, card.dataset.turno);
      return;
    }
    const row = e.target.closest(".tarea-check-row");
    if (
      !row ||
      row.classList.contains("is-completed") ||
      row.classList.contains("is-saving")
    )
      return;
    e.preventDefault();
    const check = row.querySelector(".tarea-complete-check");
    if (!check || check.disabled) return;
    check.checked = false;
    check.disabled = true;
    row.classList.add("is-saving");
    const completada = await cambiarEstado(row.dataset.id, row.dataset.turno);
    if (!completada && document.body.contains(check)) {
      check.checked = false;
      check.disabled = false;
      row.classList.remove("is-saving");
    }
  };
  $("configSectorFiltro").onchange = renderConfig;
  $("btnConfigCambiarSector").onclick = cambiarSectorConfig;
  $("btnGuardarConfigBano").onclick = guardarConfigBano;
  $("configBuscarTarea").oninput = renderConfig;
  $("configEstadoFiltro").onchange = renderConfig;
  $("configDiaFiltro").onchange = renderConfig;
  $("btnLimpiarBusquedaTarea").onclick = () => {
    $("configBuscarTarea").value = "";
    renderConfig();
  };
  $("btnElegirParticipantesBano").onclick = abrirSelectorParticipantesBano;
  $("banoBuscarUsuario").oninput = () =>
    renderParticipantesConfig(participantesConfigActuales());
  $("banoUsuariosDisponibles").onchange = () =>
    renderParticipantesConfig(participantesConfigActuales());
  $("banoBuscarUsuarioMobile")?.addEventListener("input", () => {
    const valor = $("banoBuscarUsuarioMobile").value;
    if ($("banoBuscarUsuario")) $("banoBuscarUsuario").value = valor;
    renderParticipantesConfig(participantesConfigActuales());
  });
  $("banoUsuariosDisponiblesMobile")?.addEventListener("change", () =>
    renderParticipantesConfig(participantesConfigActuales()),
  );
  $("btnCerrarBanoParticipantSheet")?.addEventListener("click", () => cerrarSelectorParticipantesBano());
  $("banoMobileParticipantBackdrop")?.addEventListener("click", () => cerrarSelectorParticipantesBano());
  $("btnGuardarBanoParticipantSheet")?.addEventListener("click", () => guardarConfigBano());
  $("configTareasLista").onclick = (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const t = leer().find((x) => x.id === row.dataset.id);
    if (t) abrir(t);
  };
  $("configTareasLista").onkeydown = (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-id]")) {
      e.preventDefault();
      e.target.closest("[data-id]").click();
    }
  };
  $("btnBanoAbrirConfig").onclick = () => cambiarVistaBano("config");
  $("banoParticipantesSeleccionados").onclick = (e) => {
    const quitar = e.target.closest("[data-remove-participant]");
    if (!quitar) return;
    void eliminarParticipanteBano(quitar.dataset.removeParticipant);
  };
  $("adminHeaderBackBtn")?.addEventListener("click", (event) => {
    if (!document.body.classList.contains("en-bano")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (banoVistaActual === "config") cambiarVistaBano("resumen");
    else window.AutoservicioNavigate?.("inicio");
  }, true);
}
async function activar() {
  if (activacionTareasEnCurso) return activacionTareasEnCurso;
  activacionTareasEnCurso = (async () => {
    activo = true;
    seed();
    sectorSeleccionado = sectorSeleccionado || sectorInicialUsuario();
    renderTareas();
    const tareasRemotas = cargarTareasRemotas().then(() => {
      if (activo) {
        normalizarSector();
        if (vistaActual === "config") renderConfig();
        else if (vistaActual === "planificacion") renderPlanificacion();
        else renderTareas();
      }
    });
    await Promise.all([cargarContextoTareas(), cargarUsuariosTareas()]);
    normalizarSector();
    actualizarNavegacionTareas();
    if (activo) cambiarVista(vistaActual);
    await tareasRemotas;
  })().finally(() => {
    activacionTareasEnCurso = null;
  });
  return activacionTareasEnCurso;
}

async function activarBano() {
  banoActivo = true;
  await Promise.all([
    cargarContextoTareas(),
    cargarUsuariosTareas(),
    cargarBanoRemoto(),
  ]);
  if (banoActivo) cambiarVistaBano(banoVistaActual);
}

function reiniciarModuloTareas() {
  cerrar();
  cerrarAsignar?.();
  vistaActual = "tareas";
  planSemanaBase = null;
  const buscador = $("configBuscarTarea");
  if (buscador) buscador.value = "";
  if ($("configEstadoFiltro")) {
    $("configEstadoFiltro").value = "todos";
    sincronizarSelectVisualTareas($("configEstadoFiltro"));
  }
  if ($("configDiaFiltro")) {
    $("configDiaFiltro").value = "todos";
    sincronizarSelectVisualTareas($("configDiaFiltro"));
  }
  cambiarVista("tareas");
  window.scrollTo({ top: 0, behavior: "auto" });
}
function desactivar() {
  activo = false;
  reiniciarModuloTareas();
  actualizarBotonVolverTareas();
}
function reiniciarBano() {
  banoVistaActual = "resumen";
  $("banoSelectorParticipantes")?.classList.add("oculto");
  if ($("banoBuscarUsuario")) $("banoBuscarUsuario").value = "";
  cambiarVistaBano("resumen");
}
function desactivarBano() {
  banoActivo = false;
  reiniciarBano();
}
function limpiarMemoriaPorCambioSesion() {
  tareasMemoria = [];
  banoMemoria = null;
  usuariosTareas = [];
  asignarDisponibles = [];
  sectorSeleccionado = "";
  contextoTareas = {
    sectores: [],
    puedeAsignar: false,
    puedeConfigurar: false,
  };
  guardadoRemotoEnCurso = Promise.resolve();
  tareasCompletando.clear();
}
window.addEventListener("autoservicio:sesion", (event) => {
  limpiarMemoriaPorCambioSesion();
  if (activo && event.detail?.usuario) void activar();
  if (banoActivo && event.detail?.usuario) void activarBano();
});
bind();
window.TareasModule = {
  activar,
  desactivar,
  reiniciar: reiniciarModuloTareas,
  seleccionarFecha: (valor) => {
    fechaSeleccionada = parseFecha(valor);
    semanaBase = inicioSemana(fechaSeleccionada);
    planSemanaBase = inicioSemana(fechaSeleccionada);
    if (activo) cambiarVista("tareas");
  },
  mostrarPlanificacion: abrirPlanificacion,
  mostrarConfiguracion: () => cambiarVista("config"),
};
window.BanoModule = {
  activar: activarBano,
  desactivar: desactivarBano,
  reiniciar: reiniciarBano,
  mostrarConfiguracion: () => cambiarVistaBano("config"),
  mostrarResumen: () => cambiarVistaBano("resumen"),
};
