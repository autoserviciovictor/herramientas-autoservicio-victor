import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";

const $ = (id) => document.getElementById(id);
const ESTADO_KEY = "autoservicio_notificaciones_preferencia_v2";
const VAPID_KEY_KEY = "autoservicio_notificaciones_vapid_public_key_v1";
let sincronizando = false;
let pushConfirmado = false;
let avisoPermisoUsuario = "";
let avisoPermisoEnCurso = false;

function esDesarrolloLocal() {
  return ["127.0.0.1", "localhost"].includes(location.hostname);
}

function base64UrlToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function claveAplicacionSuscripcion(subscription) {
  try {
    const key = subscription?.options?.applicationServerKey;
    if (!key) return "";
    const bytes = new Uint8Array(key);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

function actualizarEstado(texto, tipo = "", estadoPush = "") {
  const estado = $("estadoNotificaciones");
  if (estado) {
    estado.textContent = texto;
    estado.className = `notification-settings-status ${tipo}`.trim();
  }

  const boton = $("btnActivarNotificaciones");
  if (!boton) return;
  const permiso = "Notification" in window ? Notification.permission : "unsupported";
  const estadoReal = estadoPush || (pushConfirmado ? "active" : "inactive");
  boton.dataset.pushState = estadoReal;

  if (permiso === "denied") {
    boton.textContent = "Notificaciones bloqueadas";
    boton.disabled = true;
  } else if (permiso === "granted" && estadoReal === "active") {
    boton.textContent = "✓ Notificaciones activadas";
    boton.disabled = true;
  } else if (permiso === "granted") {
    boton.textContent = estadoReal === "syncing" ? "Verificando…" : "Reparar notificaciones";
    boton.disabled = estadoReal === "syncing";
  } else {
    boton.textContent = "Activar notificaciones";
    boton.disabled = false;
  }
}

async function obtenerClaveVapid() {
  const respuesta = await fetch(`${API_BASE_URL}/notificaciones/public-key`, { cache: "no-store" });
  const data = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !data.ok || !data.configurado || !data.publicKey)
    throw new Error(data.mensaje || "Configurá las claves VAPID en Render");
  return String(data.publicKey).trim();
}

async function obtenerSuscripcionVigente(registro, publicKey) {
  let subscription = await registro.pushManager.getSubscription();
  const claveGuardada = localStorage.getItem(VAPID_KEY_KEY) || "";
  const claveSuscripcion = claveAplicacionSuscripcion(subscription);

  // Una suscripción Push está ligada a la clave pública VAPID usada al crearla.
  // Si cambió la clave (o esta versión aún no registró cuál usó), se recrea una vez.
  const requiereRenovar = Boolean(
    subscription &&
    ((claveGuardada && claveGuardada !== publicKey) ||
      (claveSuscripcion && claveSuscripcion !== publicKey) ||
      (!claveGuardada && !claveSuscripcion))
  );

  if (requiereRenovar) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }

  if (!subscription) {
    subscription = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });
  }
  return subscription;
}

async function enviarPruebaPush() {
  const r = await fetch(`${API_BASE_URL}/notificaciones/prueba`, { method: "POST" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok || Number(data.enviados || 0) < 1)
    throw new Error(data.mensaje || "La suscripción se guardó, pero no se pudo entregar la notificación de prueba");
  return data;
}

async function registrarSuscripcion({ probar = false } = {}) {
  if (esDesarrolloLocal()) {
    actualizarEstado("Las notificaciones push están desactivadas en desarrollo local.");
    return false;
  }
  if (sincronizando || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  sincronizando = true;
  pushConfirmado = false;
  actualizarEstado("Verificando suscripción…", "", "syncing");
  try {
    const publicKey = await obtenerClaveVapid();
    const registro = await navigator.serviceWorker.ready;
    const subscription = await obtenerSuscripcionVigente(registro, publicKey);

    const r = await fetch(`${API_BASE_URL}/notificaciones/suscribir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo registrar este dispositivo para notificaciones");

    localStorage.setItem(VAPID_KEY_KEY, publicKey);
    localStorage.setItem(ESTADO_KEY, "activadas");

    if (probar) {
      actualizarEstado("Enviando notificación de prueba…", "", "syncing");
      await enviarPruebaPush();
    }

    pushConfirmado = true;
    actualizarEstado(
      probar
        ? "Notificaciones verificadas. Te enviamos una notificación de prueba."
        : "Notificaciones activadas y sincronizadas con este dispositivo.",
      "ok",
      "active",
    );
    return true;
  } catch (error) {
    localStorage.removeItem(ESTADO_KEY);
    pushConfirmado = false;
    actualizarEstado(
      error.message || "No se pudieron activar las notificaciones",
      "error",
      "error",
    );
    return false;
  } finally {
    sincronizando = false;
  }
}

async function activarNotificaciones() {
  if (!("Notification" in window))
    return actualizarEstado("Este dispositivo no admite notificaciones", "error", "error");

  let permiso = Notification.permission;
  if (permiso !== "granted") permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    actualizarEstado(
      permiso === "denied"
        ? "Las notificaciones están bloqueadas en el navegador"
        : "Permiso de notificaciones pendiente",
      "error",
      "error",
    );
    return false;
  }

  actualizarEstado("Activando y verificando notificaciones…", "", "syncing");
  return registrarSuscripcion({ probar: true });
}

function claveUsuarioSesion() {
  const usuario = window.AutoservicioAuth?.getUsuario?.();
  return String(usuario?.usuario || usuario?.nombre || "").trim().toLowerCase();
}

async function mostrarAvisoPermisoNotificaciones() {
  if (esDesarrolloLocal() || avisoPermisoEnCurso) return;
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const usuarioClave = claveUsuarioSesion();
  if (!usuarioClave || avisoPermisoUsuario === usuarioClave) return;
  avisoPermisoUsuario = usuarioClave;

  // Si el navegador ya concedió permiso, no molestamos al usuario otra vez:
  // simplemente revalidamos y asociamos la suscripción actual a su cuenta.
  if (Notification.permission === "granted") {
    await registrarSuscripcion({ probar: localStorage.getItem(ESTADO_KEY) !== "activadas" });
    return;
  }

  // Si el permiso fue bloqueado desde el navegador no se puede volver a abrir
  // el prompt nativo automáticamente. Dejamos el estado visible en Configuración.
  if (Notification.permission === "denied") {
    actualizarEstado(
      "Notificaciones bloqueadas. Habilitalas desde los permisos del navegador.",
      "error",
      "error",
    );
    return;
  }

  const dialogo = window.AppDialog || window.AutoservicioDialog;
  if (!dialogo?.confirm) return;

  avisoPermisoEnCurso = true;
  try {
    const aceptar = await dialogo.confirm({
      titulo: "Activar notificaciones",
      mensaje:
        "Este dispositivo todavía no está preparado para recibir avisos de Autoservicio Victor. Activá las notificaciones una sola vez; después recibirás únicamente las categorías que tengas habilitadas en Configuración.",
      confirmarTexto: "Activar notificaciones",
      cancelarTexto: "Ahora no",
    });
    if (!aceptar) return;
    await activarNotificaciones();
  } finally {
    avisoPermisoEnCurso = false;
  }
}

function inicializarNotificaciones() {
  const boton = $("btnActivarNotificaciones");
  boton?.addEventListener("click", activarNotificaciones);

  if (esDesarrolloLocal()) {
    actualizarEstado("Las notificaciones push se habilitan únicamente fuera de localhost.");
    if (boton) {
      boton.textContent = "Notificaciones no disponibles en local";
      boton.disabled = true;
    }
    return;
  }

  if (!("Notification" in window) || !("PushManager" in window))
    return actualizarEstado("Este dispositivo no admite notificaciones", "error", "error");

  if (Notification.permission === "granted") {
    actualizarEstado("Verificando notificaciones…", "", "syncing");
    registrarSuscripcion({ probar: localStorage.getItem(ESTADO_KEY) !== "activadas" });
  } else if (Notification.permission === "denied") {
    actualizarEstado(
      "Notificaciones bloqueadas. Habilitalas desde los permisos del navegador.",
      "error",
      "error",
    );
  } else {
    actualizarEstado("Activá las notificaciones para recibir alertas.", "", "inactive");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  inicializarNotificaciones();
  if (window.AutoservicioAuth?.getUsuario?.()) void mostrarAvisoPermisoNotificaciones();
});
window.addEventListener("autoservicio:sesion", (event) => {
  if (!event.detail?.usuario) {
    avisoPermisoUsuario = "";
    return;
  }
  void mostrarAvisoPermisoNotificaciones();
});

// Preferencias por categoría. Se guardan localmente para la UI y también en
// PostgreSQL para que el servidor respete los interruptores al enviar push.
const CATEGORIAS_KEY_BASE = "autoservicio_notificaciones_categorias_v2";
function claveCategoriasUsuario() {
  const usuario = window.AutoservicioAuth?.getUsuario?.();
  const clave = String(usuario?.usuario || usuario?.nombre || "anonimo").trim().toLowerCase();
  return `${CATEGORIAS_KEY_BASE}:${clave || "anonimo"}`;
}
const CATEGORIAS_DEFECTO = Object.freeze({ vencimientos: true, tareas: true, bano: true });

function preferenciasCategorias() {
  try {
    return {
      ...CATEGORIAS_DEFECTO,
      ...JSON.parse(localStorage.getItem(claveCategoriasUsuario()) || "{}"),
    };
  } catch {
    return { ...CATEGORIAS_DEFECTO };
  }
}

function guardarPreferenciasLocales(prefs) {
  const normalizadas = {
    vencimientos: prefs?.vencimientos !== false,
    tareas: prefs?.tareas !== false,
    bano: prefs?.bano !== false,
  };
  localStorage.setItem(claveCategoriasUsuario(), JSON.stringify(normalizadas));
  return normalizadas;
}

async function guardarPreferenciasRemotas(prefs) {
  const r = await fetch(`${API_BASE_URL}/notificaciones/preferencias`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok)
    throw new Error(data.mensaje || "No se pudieron guardar las preferencias");
  return data.preferencias || prefs;
}

function aplicarPreferenciasEnControles(prefs = preferenciasCategorias()) {
  const mapa = {
    settingsNotifVencimientos: "vencimientos",
    settingsNotifTareas: "tareas",
    settingsNotifBano: "bano",
  };
  Object.entries(mapa).forEach(([id, clave]) => {
    const input = $(id);
    if (input) input.checked = prefs[clave] !== false;
  });
}

async function cargarPreferenciasRemotas() {
  const r = await fetch(`${API_BASE_URL}/notificaciones/preferencias`, { cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.mensaje || "No se pudieron cargar las preferencias");
  return data.preferencias || CATEGORIAS_DEFECTO;
}

async function sincronizarPreferenciasCategorias() {
  try {
    const remotas = await cargarPreferenciasRemotas();
    const guardadas = guardarPreferenciasLocales(remotas);
    aplicarPreferenciasEnControles(guardadas);
    window.dispatchEvent(new CustomEvent("autoservicio:notificaciones-preferencias"));
  } catch (error) {
    console.warn("No se pudieron cargar las preferencias de notificaciones:", error?.message || error);
  }
}

function iniciarPreferenciasCategorias() {
  const mapa = {
    settingsNotifVencimientos: "vencimientos",
    settingsNotifTareas: "tareas",
    settingsNotifBano: "bano",
  };
  const prefs = preferenciasCategorias();
  aplicarPreferenciasEnControles(prefs);

  Object.entries(mapa).forEach(([id, clave]) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener("change", async () => {
      const anteriores = preferenciasCategorias();
      const actuales = guardarPreferenciasLocales({ ...anteriores, [clave]: input.checked });
      window.dispatchEvent(new CustomEvent("autoservicio:notificaciones-preferencias"));
      try {
        const guardadas = await guardarPreferenciasRemotas(actuales);
        guardarPreferenciasLocales(guardadas);
        aplicarPreferenciasEnControles(guardadas);
      } catch (error) {
        guardarPreferenciasLocales(anteriores);
        aplicarPreferenciasEnControles(anteriores);
        window.dispatchEvent(new CustomEvent("autoservicio:notificaciones-preferencias"));
        actualizarEstado(
          error.message || "No se pudo guardar la configuración de notificaciones",
          "error",
          pushConfirmado ? "active" : "error",
        );
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  iniciarPreferenciasCategorias();
  if (window.AutoservicioAuth?.getUsuario?.()) void sincronizarPreferenciasCategorias();
});
window.addEventListener("autoservicio:sesion", (event) => {
  if (event.detail?.usuario) void sincronizarPreferenciasCategorias();
});
