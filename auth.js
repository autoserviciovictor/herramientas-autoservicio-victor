import { API_BASE_URL } from "./config.js?v=1960-d21-limpieza-controlada-270826-a";

const TOKEN_KEY = "autoservicio_session_token";
const USER_KEY = "autoservicio_session_user";
const REMEMBER_USER_KEY = "autoservicio_login_usuario_recordado";
const originalFetch = window.fetch.bind(window);
const storageSesion = sessionStorage.getItem(TOKEN_KEY)
  ? sessionStorage
  : localStorage;
let token = storageSesion.getItem(TOKEN_KEY) || "";
let usuarioActual = null;
try {
  usuarioActual = JSON.parse(storageSesion.getItem(USER_KEY) || "null");
} catch {}

let googleLoginClientId = "";
let googleCredentialPendiente = "";
let googleLoginInicializado = false;
let googleScriptPromise = null;

const $ = (id) => document.getElementById(id);
const MODULOS_DISPONIBLES = [
  "inventario",
  "vencimientos",
  "anotar",
  "precios",
  "horarios",
  "tareas",
];

function permisosUsuario(usuario = usuarioActual) {
  if (usuario?.rol === "administrador")
    return Object.fromEntries(MODULOS_DISPONIBLES.map((m) => [m, true]));
  const recibidos =
    usuario?.permisos && typeof usuario.permisos === "object"
      ? usuario.permisos
      : {};
  return Object.fromEntries(
    MODULOS_DISPONIBLES.map((m) => [m, recibidos[m] === true]),
  );
}

function puedeVerModulo(modulo, usuario = usuarioActual) {
  if (["inicio", "ajustes"].includes(modulo)) return true;
  if (modulo === "admin") return usuario?.rol === "administrador";
  return permisosUsuario(usuario)[modulo] === true;
}

function esApi(url) {
  try {
    return (
      new URL(typeof url === "string" ? url : url.url, location.href).origin ===
      new URL(API_BASE_URL).origin
    );
  } catch {
    return false;
  }
}

const OFFLINE_QUEUE_KEY = "autoservicio_offline_queue_v1";
const OFFLINE_CACHE_PREFIX = "autoservicio_api_cache_v1:";
let sincronizandoOffline = false;

function leerColaOfflineCompleta() {
  try {
    const cola = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    if (!Array.isArray(cola)) return [];
    // Migración segura de V19.5: las operaciones antiguas no tenían usuario.
    // Si hay una sesión conocida, se asocian a ese mismo usuario una sola vez.
    let cambio = false;
    const migrada = cola.map((op) => {
      if (!op?.usuario && usuarioActual?.usuario) {
        cambio = true;
        return { ...op, usuario: usuarioActual.usuario };
      }
      return op;
    });
    if (cambio)
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(migrada));
    return migrada;
  } catch {
    return [];
  }
}
function leerColaOffline(usuario = usuarioActual?.usuario) {
  const clave = String(usuario || "")
    .trim()
    .toLowerCase();
  if (!clave) return [];
  return leerColaOfflineCompleta().filter(
    (op) =>
      String(op.usuario || "")
        .trim()
        .toLowerCase() === clave,
  );
}
function guardarColaOfflineCompleta(cola) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(cola));
  const pendientes = leerColaOffline().length;
  window.dispatchEvent(
    new CustomEvent("autoservicio:offline", {
      detail: { online: navigator.onLine, pendientes },
    }),
  );
}
function reemplazarColaUsuario(usuario, operaciones) {
  const clave = String(usuario || "")
    .trim()
    .toLowerCase();
  const otras = leerColaOfflineCompleta().filter(
    (op) =>
      String(op.usuario || "")
        .trim()
        .toLowerCase() !== clave,
  );
  guardarColaOfflineCompleta([...otras, ...operaciones]);
}
function cacheOfflineKey(ruta, usuario = usuarioActual?.usuario) {
  return `${OFFLINE_CACHE_PREFIX}${String(usuario || "anon")
    .trim()
    .toLowerCase()}:${ruta}`;
}
function limpiarCacheOfflineUsuario(usuario) {
  const prefijo = `${OFFLINE_CACHE_PREFIX}${String(usuario || "")
    .trim()
    .toLowerCase()}:`;
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(prefijo)) localStorage.removeItem(key);
  });
}
function limpiarCacheOfflineLegada() {
  Object.keys(localStorage).forEach((key) => {
    if (
      key.startsWith(OFFLINE_CACHE_PREFIX) &&
      key.slice(OFFLINE_CACHE_PREFIX.length).startsWith("/")
    )
      localStorage.removeItem(key);
  });
}
limpiarCacheOfflineLegada();
function rutaApi(input) {
  try {
    const u = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    return u.pathname + u.search;
  } catch {
    return "";
  }
}
function respuestaJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function esOperacionOfflinePermitida(method, ruta) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  return (
    ruta.startsWith("/guardar") ||
    ruta.startsWith("/corregir") ||
    ruta.startsWith("/vencimientos") ||
    ruta.startsWith("/reposicion") ||
    ruta.startsWith("/producto-maestro/")
  );
}
async function serializarBody(input, init) {
  if (typeof init.body === "string") return init.body;
  if (input instanceof Request)
    return await input
      .clone()
      .text()
      .catch(() => "");
  return "";
}
async function sincronizarColaOffline() {
  if (sincronizandoOffline || !navigator.onLine || !token) return;
  const usuarioClave = usuarioActual?.usuario;
  const cola = leerColaOffline(usuarioClave);
  if (!cola.length) return;

  sincronizandoOffline = true;
  const restantes = [];
  let sesionInvalida = false;

  try {
    for (let i = 0; i < cola.length; i += 1) {
      const op = cola[i];
      if (op?.requiereRevision) {
        restantes.push(op);
        continue;
      }
      if (Number(op?.reintentarDespues) > Date.now()) {
        restantes.push(op);
        continue;
      }

      try {
        const headers = new Headers(op.headers || {});
        headers.set("Authorization", `Bearer ${token}`);
        headers.set("X-Offline-Operation-Id", op.id);
        const r = await originalFetch(`${API_BASE_URL}${op.ruta}`, {
          method: op.method,
          headers,
          body: op.body || undefined,
        });
        if (r.ok) continue;

        let mensaje = "";
        try {
          const data = await r.clone().json();
          mensaje = String(data?.mensaje || "");
        } catch {}

        if (r.status === 401) {
          restantes.push({
            ...op,
            ultimoError: mensaje || "La sesión venció antes de sincronizar.",
            ultimoStatus: r.status,
          });
          restantes.push(...cola.slice(i + 1));
          sesionInvalida = true;
          break;
        }

        if (r.status === 429 || r.status >= 500) {
          const retryAfter = Number(r.headers.get("Retry-After"));
          const esperaMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 60 * 1000;
          restantes.push({
            ...op,
            ultimoError: mensaje || `Error temporal ${r.status}`,
            ultimoStatus: r.status,
            reintentarDespues: Date.now() + esperaMs,
          });
          continue;
        }

        // Un 4xx distinto de 401 no se descarta: puede ser un conflicto,
        // un permiso cambiado o un dato que requiere corrección manual.
        restantes.push({
          ...op,
          requiereRevision: true,
          ultimoError: mensaje || `La operación requiere revisión (${r.status}).`,
          ultimoStatus: r.status,
        });
      } catch (error) {
        restantes.push({
          ...op,
          ultimoError: error?.message || "Sin conexión",
          reintentarDespues: Date.now() + 30 * 1000,
        });
      }
    }

    reemplazarColaUsuario(usuarioClave, restantes);
    if (!restantes.length)
      window.dispatchEvent(new CustomEvent("autoservicio:sincronizado"));
    else
      window.dispatchEvent(
        new CustomEvent("autoservicio:offline", {
          detail: {
            online: navigator.onLine,
            pendientes: restantes.length,
            revision: restantes.filter((op) => op?.requiereRevision).length,
          },
        }),
      );
  } finally {
    sincronizandoOffline = false;
  }

  if (sesionInvalida) cerrarSesion(false);
}

window.fetch = async (input, init = {}) => {
  const opciones = {
    ...init,
    headers: new Headers(
      init.headers || (input instanceof Request ? input.headers : undefined),
    ),
  };
  const method = String(
    opciones.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  const ruta = rutaApi(input);
  if (token && esApi(input))
    opciones.headers.set("Authorization", `Bearer ${token}`);
  try {
    const respuesta = await originalFetch(input, opciones);
    if (
      respuesta.status === 401 &&
      token &&
      esApi(input) &&
      !ruta.includes("/auth/login")
    )
      cerrarSesion(false);
    if (esApi(input) && method === "GET" && respuesta.ok) {
      respuesta
        .clone()
        .text()
        .then((text) => localStorage.setItem(cacheOfflineKey(ruta), text))
        .catch(() => {});
    }
    return respuesta;
  } catch (error) {
    if (!esApi(input)) throw error;
    if (method === "GET") {
      const cache = localStorage.getItem(cacheOfflineKey(ruta));
      if (cache)
        return new Response(cache, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Offline-Cache": "1",
          },
        });
      throw error;
    }
    if (esOperacionOfflinePermitida(method, ruta)) {
      const body = await serializarBody(input, opciones);
      if (!usuarioActual?.usuario) throw error;
      const cola = leerColaOfflineCompleta();
      cola.push({
        usuario: usuarioActual.usuario,
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
        ruta,
        method,
        body,
        headers: {
          "Content-Type":
            opciones.headers.get("Content-Type") || "application/json",
        },
        creado: Date.now(),
      });
      guardarColaOfflineCompleta(cola);
      return respuestaJson({
        ok: true,
        offline: true,
        pendiente: true,
        mensaje:
          "Cambio guardado en el teléfono. Se sincronizará al recuperar Internet.",
      });
    }
    throw error;
  }
};

window.addEventListener("online", () => sincronizarColaOffline());
setInterval(() => sincronizarColaOffline(), 15000);

function mostrarLogin(mensaje = "") {
  $("loginOverlay")?.classList.remove("oculto");
  $("loginOverlay")?.setAttribute("aria-hidden", "false");
  document.body.classList.add("login-bloqueado");
  const estado = $("loginEstado");
  if (estado) {
    estado.textContent = mensaje;
    estado.className = `login-status${mensaje ? " error" : ""}`;
  }
  setTimeout(() => $("loginUsuario")?.focus(), 100);
  inicializarGoogleLogin().catch(() => {});
}

function ocultarLogin() {
  $("loginOverlay")?.classList.add("oculto");
  $("loginOverlay")?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("login-bloqueado");
}

function actualizarInterfazUsuario() {
  const nombre = usuarioActual?.nombre || usuarioActual?.usuario || "";
  const textoRol =
    usuarioActual?.rol === "administrador"
      ? "Administrador"
      : usuarioActual?.rol === "administracion"
        ? "Administración"
        : usuarioActual?.rol === "supervisor"
          ? "Supervisor"
          : "Personal";
  if ($("menuSesionNombre"))
    $("menuSesionNombre").textContent = nombre || "Usuario";
  if ($("menuSesionRol")) $("menuSesionRol").textContent = textoRol;
  if ($("desktopSesionNombre"))
    $("desktopSesionNombre").textContent = nombre || "Usuario";
  if ($("desktopSesionRol")) $("desktopSesionRol").textContent = textoRol;
  const esAdministrador = usuarioActual?.rol === "administrador";
  document.querySelectorAll(".module-card[data-modulo]").forEach((card) => {
    card.classList.toggle("oculto", !puedeVerModulo(card.dataset.modulo));
  });
  const adminModule = document.querySelector(".admin-module-card");
  if (adminModule) adminModule.classList.toggle("oculto", !esAdministrador);
  const adminPanel = $("pantallaAdmin");
  if (adminPanel && !esAdministrador) {
    const estabaActivo = adminPanel.classList.contains("activa");
    adminPanel.classList.remove("activa");
    adminPanel.hidden = true;
    adminPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("en-admin");
    if (estabaActivo) window.AutoservicioNavigate?.("inicio");
  }
  window.dispatchEvent(
    new CustomEvent("autoservicio:sesion", { detail: usuarioActual }),
  );
}

function guardarSesion(nuevoToken, usuario, recordar = false) {
  token = nuevoToken;
  usuarioActual = usuario;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  const destino = recordar ? localStorage : sessionStorage;
  destino.setItem(TOKEN_KEY, token);
  destino.setItem(USER_KEY, JSON.stringify(usuario));
  googleCredentialPendiente = "";
  document.querySelector(".login-v2-auth")?.classList.remove("google-link-pending");
  actualizarInterfazUsuario();
  ocultarLogin();
  sincronizarColaOffline();
}

function cerrarSesion(mostrar = true) {
  const usuarioSaliente = usuarioActual?.usuario || "";
  token = "";
  usuarioActual = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  limpiarCacheOfflineUsuario(usuarioSaliente);
  googleCredentialPendiente = "";
  document.querySelector(".login-v2-auth")?.classList.remove("google-link-pending");
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {}
  actualizarInterfazUsuario();
  if (mostrar) mostrarLogin();
  else mostrarLogin("La sesión venció. Volvé a ingresar.");
}


function actualizarEstadoLogin(mensaje = "", tipo = "") {
  const estado = $("loginEstado");
  if (!estado) return;
  estado.textContent = mensaje;
  estado.className = `login-status${tipo ? ` ${tipo}` : ""}`;
}

function cargarGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existente = document.getElementById("googleIdentityServicesScript");
    if (existente) {
      existente.addEventListener("load", () => resolve(window.google), { once: true });
      existente.addEventListener("error", () => reject(new Error("No se pudo cargar Google")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "googleIdentityServicesScript";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("No se pudo cargar Google"));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

async function procesarGoogleCredential(respuesta) {
  const credential = String(respuesta?.credential || "").trim();
  if (!credential) return;
  const recordar = Boolean($("loginRecordarme")?.checked);
  const contenedor = $("googleSignInButton");

  if (contenedor) {
    contenedor.classList.add("cargando");
    contenedor.setAttribute("aria-busy", "true");
  }
  actualizarEstadoLogin("Validando cuenta de Google…");

  try {
    const r = await originalFetch(`${API_BASE_URL}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const data = await r.json().catch(() => ({}));

    if (r.status === 409 && data?.vinculacionRequerida) {
      googleCredentialPendiente = credential;
      document.querySelector(".login-v2-auth")?.classList.add("google-link-pending");
      actualizarEstadoLogin(
        `Cuenta Google verificada${data.email ? ` (${data.email})` : ""}. Ingresá una vez con tu usuario y contraseña para vincularla.`,
        "success",
      );
      setTimeout(() => $("loginUsuario")?.focus(), 80);
      return;
    }

    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo ingresar con Google");

    guardarSesion(data.token, data.usuario, recordar);
  } catch (error) {
    actualizarEstadoLogin(error.message || "No se pudo ingresar con Google", "error");
  } finally {
    if (contenedor) {
      contenedor.classList.remove("cargando");
      contenedor.removeAttribute("aria-busy");
    }
  }
}

function renderizarBotonGoogle() {
  const contenedor = $("googleSignInButton");
  if (!contenedor || !window.google?.accounts?.id || !googleLoginClientId) return;

  const ancho = Math.max(
    220,
    Math.min(400, Math.floor(contenedor.getBoundingClientRect().width || 400)),
  );
  contenedor.innerHTML = "";
  window.google.accounts.id.renderButton(contenedor, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: ancho,
  });
}

async function inicializarGoogleLogin() {
  if (googleLoginInicializado) {
    if (window.google?.accounts?.id) renderizarBotonGoogle();
    return;
  }

  const fallback = $("btnGoogleFallback");
  try {
    const r = await originalFetch(`${API_BASE_URL}/auth/google/config`, {
      headers: { Accept: "application/json" },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.enabled || !data?.clientId) {
      fallback?.setAttribute("data-google-disabled", "true");
      return;
    }

    googleLoginClientId = String(data.clientId);
    await cargarGoogleIdentityScript();
    if (!window.google?.accounts?.id) throw new Error("Google no está disponible");

    window.google.accounts.id.initialize({
      client_id: googleLoginClientId,
      callback: procesarGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    googleLoginInicializado = true;
    renderizarBotonGoogle();
  } catch {
    fallback?.setAttribute("data-google-disabled", "true");
  }
}

async function iniciarSesion() {
  const usuario = $("loginUsuario")?.value.trim();
  const password = $("loginPassword")?.value || "";
  const recordar = Boolean($("loginRecordarme")?.checked);
  const boton = $("btnLoginIngresar");
  const estado = $("loginEstado");
  if (!usuario || !password) {
    if (estado) estado.textContent = "Ingresá usuario y contraseña";
    return;
  }
  if (boton) {
    boton.disabled = true;
    boton.classList.add("cargando");
  }
  if (estado) {
    estado.textContent = "Ingresando…";
    estado.className = "login-status";
  }
  try {
    const r = await originalFetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario,
        password,
        googleCredential: googleCredentialPendiente || undefined,
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudo ingresar");
    guardarSesion(data.token, data.usuario, recordar);
    if (recordar) localStorage.setItem(REMEMBER_USER_KEY, usuario);
    else localStorage.removeItem(REMEMBER_USER_KEY);
    if ($("loginPassword")) $("loginPassword").value = "";
  } catch (error) {
    if (estado) {
      estado.textContent = error.message;
      estado.className = "login-status error";
    }
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove("cargando");
    }
  }
}

async function validarSesion() {
  actualizarInterfazUsuario();
  if (!token) return mostrarLogin();
  try {
    const r = await fetch(`${API_BASE_URL}/auth/session`);
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error();
    usuarioActual = data.usuario;
    (sessionStorage.getItem(TOKEN_KEY) ? sessionStorage : localStorage).setItem(
      USER_KEY,
      JSON.stringify(usuarioActual),
    );
    actualizarInterfazUsuario();
    ocultarLogin();
  } catch {
    cerrarSesion(false);
  }
}

function cerrarMenuUsuario() {
  const menu = $("userDropdown");
  const boton = $("brandMenuBtn");
  menu?.classList.add("oculto");
  menu?.setAttribute("aria-hidden", "true");
  boton?.setAttribute("aria-expanded", "false");
}

function alternarMenuUsuario() {
  const menu = $("userDropdown");
  const boton = $("brandMenuBtn");
  if (!menu || !boton) return;
  const abrir = menu.classList.contains("oculto");
  menu.classList.toggle("oculto", !abrir);
  menu.setAttribute("aria-hidden", String(!abrir));
  boton.setAttribute("aria-expanded", String(abrir));
}

window.AutoservicioAuth = {
  getToken: () => token,
  getUsuario: () => usuarioActual,
  esAdmin: () => usuarioActual?.rol === "administrador",
  puedeVerModulo,
  getPermisos: () => permisosUsuario(),
  cerrarSesion,
  sincronizarOffline: sincronizarColaOffline,
  pendientesOffline: () => leerColaOffline().length,
  pendientesOfflineRevision: () =>
    leerColaOffline().filter((op) => op?.requiereRevision).length,
};

document.addEventListener("DOMContentLoaded", () => {
  const usuarioRecordado = localStorage.getItem(REMEMBER_USER_KEY) || "";
  if ($("loginUsuario") && usuarioRecordado)
    $("loginUsuario").value = usuarioRecordado;
  if ($("loginRecordarme"))
    $("loginRecordarme").checked = Boolean(usuarioRecordado);
  $("btnLoginIngresar")?.addEventListener("click", iniciarSesion);
  $("btnGoogleFallback")?.addEventListener("click", async () => {
    await inicializarGoogleLogin().catch(() => {});
    if (!googleLoginInicializado) {
      actualizarEstadoLogin(
        "El acceso con Google todavía no está configurado. Podés ingresar con tu usuario y contraseña.",
        "error",
      );
    }
  });
  $("btnLoginOlvidePassword")?.addEventListener("click", () => {
    actualizarEstadoLogin(
      "Pedile a un administrador que restablezca tu contraseña.",
    );
  });
  $("btnTogglePassword")?.addEventListener("click", () => {
    const input = $("loginPassword");
    const boton = $("btnTogglePassword");
    if (!input || !boton) return;
    const mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";
    boton.setAttribute("aria-pressed", String(mostrar));
    boton.setAttribute(
      "aria-label",
      mostrar ? "Ocultar contraseña" : "Mostrar contraseña",
    );
    boton.innerHTML = mostrar
      ? `<svg class="app-icon" aria-hidden="true"><use href="#icon-eye-off"></use></svg>`
      : `<svg class="app-icon" aria-hidden="true"><use href="#icon-eye"></use></svg>`;
    input.focus();
  });

  $("loginUsuario")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("loginPassword")?.focus();
  });
  $("loginPassword")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") iniciarSesion();
  });
  $("brandMenuBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    alternarMenuUsuario();
  });
  $("userDropdown")?.addEventListener("click", (event) =>
    event.stopPropagation(),
  );
  $("btnMenuAjustes")?.addEventListener("click", () => {
    cerrarMenuUsuario();
    window.AutoservicioNavigate?.("ajustes");
  });
  const cerrarSesionDesdeInterfaz = () => {
    cerrarMenuUsuario();
    cerrarSesion(true);
  };
  window.AutoservicioCerrarSesion = cerrarSesionDesdeInterfaz;
  document.addEventListener("click", cerrarMenuUsuario);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cerrarMenuUsuario();
  });
  validarSesion();
});

function actualizarEstadoOffline(evento) {
  const el = document.getElementById("offlineStatus");
  if (!el) return;
  const colaActual = leerColaOffline();
  const pendientes = evento?.detail?.pendientes ?? colaActual.length;
  const revision =
    evento?.detail?.revision ??
    colaActual.filter((op) => op?.requiereRevision).length;
  const online = evento?.detail?.online ?? navigator.onLine;
  if (!online) {
    el.textContent = pendientes
      ? `Sin Internet · ${pendientes} cambios pendientes`
      : "Sin conexión";
    el.className = "offline-status error";
  } else if (revision) {
    el.textContent = `${revision} cambio${revision === 1 ? "" : "s"} pendiente${revision === 1 ? "" : "s"} de revisión`;
    el.className = "offline-status error";
  } else if (pendientes) {
    el.textContent = `Sincronizando ${pendientes} cambios pendientes…`;
    el.className = "offline-status";
  } else {
    el.className = "offline-status oculto";
  }
}
window.addEventListener("autoservicio:offline", actualizarEstadoOffline);
window.addEventListener("offline", () => actualizarEstadoOffline());
window.addEventListener("online", () => actualizarEstadoOffline());
document.addEventListener("DOMContentLoaded", () => {
  actualizarEstadoOffline();
  sincronizarColaOffline();
});
