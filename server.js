const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const crypto = require("crypto");
const fs = require("fs");
const webpush = require("web-push");
const path = require("path");
require("dotenv").config();
const { verificarConexionPostgres, cerrarPostgres } = require("./db");
const {
  asegurarEsquemaUsuariosSectores,
  migracionDatosCompletada,
  listarUsuariosDb,
  listarSectoresDb,
  guardarUsuarioDb,
  guardarSectorDb,
  eliminarUsuarioConSupervisionDb,
  eliminarSectorConHorariosDb,
  importarUsuariosSectoresAtomico,
} = require("./db-usuarios-sectores");
const {
  asegurarEsquemaHorarios,
  conTransaccionHorarios,
  importarHorariosAtomico,
  listarTurnosFilas,
  reemplazarTurnosSector,
  listarCalendarioFilas,
  listarDetallesFilas,
  reemplazarCalendarioDetallesPorAlcances,
  listarOrdenFilas,
  reemplazarOrdenSector,
  guardarVisibilidadOrden,
  registrarAuditoriaFilas,
} = require("./db-horarios");
const {
  asegurarEsquemaTareasBano,
  conTransaccionTareasBano,
  importarTareasBanoAtomico,
  listarTareasDb,
  reemplazarTareasDb,
  leerBanoDb,
  guardarBanoDb,
} = require("./db-tareas-bano");
const {
  asegurarEsquemaInventarioProductos,
  conTransaccionInventarioProductos,
  importarInventarioProductosAtomico,
  listarInventarioDb,
  buscarInventarioPorCodigoDb,
  crearInventarioDb,
  actualizarInventarioDb,
  sumarInventarioDb,
  corregirInventarioDb,
  listarCatalogoDb,
  buscarCatalogoPorCodigoDb,
  reemplazarCatalogoDb,
} = require("./db-inventario-productos");
const {
  asegurarEsquemaVencimientos,
  importarVencimientosAtomico,
  listarVencimientosDb,
  crearVencimientoDb,
  actualizarVencimientoDb,
  eliminarVencimientoDb,
} = require("./db-vencimientos");
const {
  asegurarEsquemaListasReposicion,
  conTransaccionListasReposicion,
  importarListasReposicionAtomico,
  listarListasReposicionDb,
  reemplazarListasReposicionDb,
} = require("./db-listas-reposicion");
const {
  asegurarEsquemaAuxiliares,
  importarAuxiliaresAtomico,
  registrarActividadAdminDb,
  listarActividadAdminDb,
  buscarOperacionOfflineDb,
  reservarOperacionOfflineDb,
  finalizarOperacionOfflineDb,
  listarSuscripcionesPushDb,
  guardarSuscripcionPushDb,
  desactivarSuscripcionPushDb,
  clavesNotificacionesDb,
  registrarNotificacionEnviadaDb,
  existeCentroNotificacionDb,
  registrarCentroNotificacionDb,
  listarCentroNotificacionesDb,
  marcarCentroNotificacionDb,
  registrarHistorialVencimientoDb,
  listarHistorialVencimientosDb,
} = require("./db-auxiliares");

const app = express();
app.set("trust proxy", 1);
const APP_VERSION = "19.6.0";
const APP_BUILD = "D21";
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Stock";
const PRODUCTOS_SHEET_NAME = "Productos";
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_LOGIN_CLIENT_ID = normalizarTexto(process.env.GOOGLE_LOGIN_CLIENT_ID);
const GOOGLE_LOGIN_DOMAIN = normalizarTexto(process.env.GOOGLE_LOGIN_DOMAIN).toLowerCase();
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n",
);
const ADMIN_KEY = normalizarTexto(process.env.ADMIN_KEY);
const ADMIN_TOKEN_SECRET = normalizarTexto(process.env.ADMIN_TOKEN_SECRET);
const USER_SESSION_DAYS = Math.max(1, Math.min(30, Number(process.env.USER_SESSION_DAYS) || 7));
const AUTO_MIGRATE_SHEETS =
  String(process.env.AUTO_MIGRATE_SHEETS || "").trim().toLowerCase() === "true";
const USUARIOS_SHEET_NAME = "Usuarios";
const SECTORES_SHEET_NAME = "Sectores";
const AUDITORIA_HORARIOS_SHEET_NAME = "Auditoría Horarios";
const CALENDARIO_HORARIOS_SHEET_NAME = "Calendario Horarios";
const TURNOS_HORARIOS_SHEET_NAME = "Horarios Turnos";
const ORDEN_HORARIOS_SHEET_NAME = "Orden Personal Horarios";
const DETALLES_HORARIOS_SHEET_NAME = "Detalles Horarios";
const REEMPLAZOS_HORARIOS_SHEET_NAME = "Reemplazos Horarios";
const HISTORIAL_VENCIMIENTOS_SHEET_NAME = "Historial Vencimientos";
const HISTORIAL_ADMIN_SHEET_NAME = "Historial Administración";
const PUSH_SUBSCRIPTIONS_SHEET_NAME = "Notificaciones Suscripciones";
const NOTIFICATION_LOG_SHEET_NAME = "Notificaciones Vencimientos";
const NOTIFICATION_CENTER_SHEET_NAME = "Centro Notificaciones";
const OFFLINE_OPERATIONS_SHEET_NAME = "Operaciones Offline";
const TAREAS_SHEET_NAME = "Tareas";
const TAREAS_BANO_SHEET_NAME = "Tareas_Bano";
const VAPID_PUBLIC_KEY = normalizarTexto(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = normalizarTexto(process.env.VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = normalizarTexto(
  process.env.VAPID_SUBJECT || "mailto:administracion@autoserviciovictor.com",
);
const NOTIFICATION_CRON_SECRET = normalizarTexto(
  process.env.NOTIFICATION_CRON_SECRET,
);
const PUSH_CONFIGURED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (PUSH_CONFIGURED)
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const ADMIN_USERNAME = normalizarTexto(
  process.env.ADMIN_USERNAME || "admin",
).toLowerCase();
const ALLOWED_ORIGINS = normalizarTexto(process.env.ALLOWED_ORIGINS)
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origen, callback) {
      if (
        !origen ||
        ALLOWED_ORIGINS.length === 0 ||
        ALLOWED_ORIGINS.includes(origen)
      ) {
        return callback(null, true);
      }
      return callback(new Error("Origen no permitido por CORS"));
    },
  }),
);
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"],
);

const sheets = google.sheets({ version: "v4", auth });
const googleLoginAuth = new google.auth.OAuth2();

// V5.1.1 - Caché breve y deduplicación de lecturas para no exceder la cuota de Google Sheets.
const cacheLecturas = new Map();
const promesasLectura = new Map();
const CACHE_TTL = {
  productos: 15000,
  productosMaestros: 60000,
  vencimientos: 20000,
  reposicion: 15000,
  metadata: 300000,
  usuarios: 15000,
  sectores: 20000,
  turnosHorarios: 20000,
  calendarioHorarios: 15000,
  suscripcionesPush: 60000,
  clavesNotificaciones: 60000,
  centroNotificaciones: 30000,
};

async function leerConCache(clave, ttl, lector) {
  const ahora = Date.now();
  const guardado = cacheLecturas.get(clave);
  if (guardado && ahora - guardado.fecha < ttl) return guardado.valor;
  if (promesasLectura.has(clave)) return promesasLectura.get(clave);

  const promesa = (async () => {
    try {
      const valor = await lector();
      cacheLecturas.set(clave, { fecha: Date.now(), valor });
      return valor;
    } catch (error) {
      // Si Google limita temporalmente las lecturas, conservar el último dato conocido.
      if (guardado) return guardado.valor;
      throw error;
    } finally {
      promesasLectura.delete(clave);
    }
  })();

  promesasLectura.set(clave, promesa);
  return promesa;
}

function invalidarCache(...claves) {
  claves.forEach((clave) => cacheLecturas.delete(clave));
}

// Cola simple por recurso para soportar varios celulares sin pisar escrituras.
// Si dos dispositivos guardan el mismo producto al mismo tiempo, el segundo espera
// a que el primero termine y luego vuelve a leer el valor actualizado.
const colasPorCodigo = new Map();

async function ejecutarEnCola(codigo, tarea) {
  const clave = normalizarCodigo(codigo);
  const colaAnterior = colasPorCodigo.get(clave) || Promise.resolve();

  let liberar;
  const colaActual = new Promise((resolve) => {
    liberar = resolve;
  });
  const colaEncadenada = colaAnterior.catch(() => {}).then(() => colaActual);
  colasPorCodigo.set(clave, colaEncadenada);

  try {
    await colaAnterior.catch(() => {});
    return await tarea();
  } finally {
    liberar();
    setTimeout(() => {
      if (colasPorCodigo.get(clave) === colaEncadenada) {
        colasPorCodigo.delete(clave);
      }
    }, 100);
  }
}

function normalizarTexto(valor) {
  return String(valor ?? "").trim();
}

function expandirNotacionCientificaCodigo(texto) {
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

function normalizarCodigo(codigo) {
  if (codigo === null || codigo === undefined) return "";
  let texto = String(codigo)
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^'+/, "")
    .replace(/\s+/g, "");
  if (!texto) return "";
  texto = expandirNotacionCientificaCodigo(texto);
  texto = texto.replace(/^(\d+)[.,]0+$/, "$1");
  return texto;
}


function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function numeroPrecio(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number")
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  let texto = String(valor).trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!texto) return null;
  if (texto.includes(",") && texto.includes(".")) {
    texto =
      texto.lastIndexOf(",") > texto.lastIndexOf(".")
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto.replace(/,/g, "");
  } else if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function enteroNoNegativo(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function enteroPositivo(valor) {
  const n = enteroNoNegativo(valor);
  return n !== null && n > 0 ? n : null;
}

function fechaArgentina(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const obtener = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

function diasDesdeHoyArgentina(fechaIso) {
  const valor = normalizarTexto(fechaIso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const hoy = fechaArgentina();
  const [hy, hm, hd] = hoy.split("-").map(Number);
  const [vy, vm, vd] = valor.split("-").map(Number);
  return Math.round(
    (Date.UTC(vy, vm - 1, vd) - Date.UTC(hy, hm - 1, hd)) / 86400000,
  );
}

function fechaNoAnteriorAHoy(fechaIso) {
  const dias = diasDesdeHoyArgentina(fechaIso);
  return dias !== null && dias >= 0;
}

function fechaHoraArgentinaIso(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(fecha)
    .replace(" ", "T");
  return `${partes}-03:00`;
}

function base64Url(valor) {
  return Buffer.from(valor).toString("base64url");
}

function firmarTokenAdmin(payload) {
  if (!ADMIN_TOKEN_SECRET) return "";
  const cuerpo = base64Url(JSON.stringify(payload));
  const firma = crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(cuerpo)
    .digest("base64url");
  return `${cuerpo}.${firma}`;
}

function verificarTokenAdmin(token) {
  try {
    if (!ADMIN_TOKEN_SECRET || !token || !token.includes(".")) return null;
    const [cuerpo, firma] = token.split(".");
    const esperada = crypto
      .createHmac("sha256", ADMIN_TOKEN_SECRET)
      .update(cuerpo)
      .digest("base64url");
    if (
      firma.length !== esperada.length ||
      !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))
    )
      return null;
    const payload = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8"),
    );
    if (!payload.exp || Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function obtenerTokenAdmin(req) {
  const authorization = normalizarTexto(req.get("authorization"));
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}


function normalizarUsuario(valor) {
  return normalizarTexto(valor).toLowerCase().replace(/\s+/g, "");
}

function normalizarEmail(valor) {
  return normalizarTexto(valor).trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verificarPassword(password, guardado) {
  try {
    const [metodo, salt, hashHex] = normalizarTexto(guardado).split("$");
    if (metodo !== "scrypt" || !salt || !hashHex) return false;
    const calculado = crypto.scryptSync(String(password), salt, 64);
    const esperado = Buffer.from(hashHex, "hex");
    return (
      calculado.length === esperado.length &&
      crypto.timingSafeEqual(calculado, esperado)
    );
  } catch {
    return false;
  }
}

let hojaUsuariosAsegurada = false;
let promesaHojaUsuarios = null;
const MODULOS_PERMITIDOS = [
  "inventario",
  "vencimientos",
  "anotar",
  "precios",
  "horarios",
  "tareas",
];
function normalizarRol(valor) {
  const rol = normalizarTexto(valor).toLowerCase();
  return rol === "repositor"
    ? "personal"
    : ["administrador", "administracion", "supervisor", "personal"].includes(
          rol,
        )
      ? rol
      : "personal";
}
function permisosPorDefecto() {
  return Object.fromEntries(MODULOS_PERMITIDOS.map((m) => [m, true]));
}
function permisosDenegados() {
  return Object.fromEntries(MODULOS_PERMITIDOS.map((m) => [m, false]));
}
function normalizarPermisos(valor, rol = "personal") {
  if (rol === "administrador") return permisosPorDefecto();

  // Compatibilidad con usuarios históricos que tenían la celda vacía:
  // se conservan sus módulos actuales. En cambio, JSON inválido u objetos
  // incompletos quedan cerrados por defecto para evitar permisos "fail-open".
  const esVacio =
    valor === undefined ||
    valor === null ||
    (typeof valor === "string" && !valor.trim());
  if (esVacio) return permisosPorDefecto();

  let entrada = valor;
  if (typeof valor === "string") {
    try {
      entrada = JSON.parse(valor);
    } catch {
      return permisosDenegados();
    }
  }
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada))
    return permisosDenegados();

  return Object.fromEntries(
    MODULOS_PERMITIDOS.map((m) => [m, entrada[m] === true]),
  );
}
function serializarPermisos(permisos, rol) {
  return JSON.stringify(normalizarPermisos(permisos, rol));
}

async function asegurarHojaUsuarios() {
  if (hojaUsuariosAsegurada) return;
  if (promesaHojaUsuarios) return promesaHojaUsuarios;
  promesaHojaUsuarios = (async () => {
    validarConfiguracion();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const existe = (meta.data.sheets || []).some(
      (hoja) => hoja.properties?.title === USUARIOS_SHEET_NAME,
    );
    if (!existe) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: USUARIOS_SHEET_NAME } } },
          ],
        },
      });
    }
    const encabezados = [
      "Usuario",
      "Nombre",
      "Password hash",
      "Rol",
      "Activo",
      "Creado",
      "Permisos módulos",
      "Sector",
      "Sectores a cargo",
      "Versión sesión",
      "Email Google",
    ];
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USUARIOS_SHEET_NAME}!A1:K`,
    });
    const filas = respuesta.data.values || [];
    if (!filas[0] || encabezados.some((titulo, i) => filas[0][i] !== titulo)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USUARIOS_SHEET_NAME}!A1:K1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [encabezados] },
      });
    }
    const filasUsuarios = filas
      .slice(1)
      .map((fila, i) => ({ fila, filaGoogle: i + 2 }))
      .filter(({ fila }) => normalizarUsuario(fila[0]));
    for (const { fila, filaGoogle } of filasUsuarios) {
      const versionSesion = Number.parseInt(fila[9], 10);
      if (!Number.isInteger(versionSesion) || versionSesion < 1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${USUARIOS_SHEET_NAME}!J${filaGoogle}`,
          valueInputOption: "RAW",
          requestBody: { values: [["1"]] },
        });
      }
    }
    const tieneUsuarios = filasUsuarios.length > 0;
    if (!tieneUsuarios) {
      if (!ADMIN_KEY)
        throw new Error(
          "Configurá ADMIN_KEY en Render para crear el primer usuario administrador",
        );
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USUARIOS_SHEET_NAME}!A:K`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            [
              ADMIN_USERNAME,
              "Administrador",
              hashPassword(ADMIN_KEY),
              "administrador",
              "Sí",
              fechaHoraArgentinaIso(),
              serializarPermisos(null, "administrador"),
              "",
              "",
              "1",
              "",
            ],
          ],
        },
      });
    }
    hojaUsuariosAsegurada = true;
    invalidarCache("usuarios");
  })();
  try {
    await promesaHojaUsuarios;
  } finally {
    promesaHojaUsuarios = null;
  }
}

function filaAUsuario(fila, index) {
  const activoTexto = normalizarTexto(fila[4]).toLowerCase();
  return {
    filaGoogle: index + 2,
    usuario: normalizarUsuario(fila[0]),
    nombre: normalizarTexto(fila[1]) || normalizarTexto(fila[0]),
    passwordHash: normalizarTexto(fila[2]),
    rol: normalizarRol(fila[3]),
    activo: ["si", "sí", "true", "1", "activo"].includes(activoTexto),
    creado: normalizarTexto(fila[5]),
    permisos: normalizarPermisos(fila[6], normalizarRol(fila[3])),
    sector: normalizarTexto(fila[7]),
    sectores: [
      ...new Set(
        normalizarTexto(fila[8])
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ],
    sessionVersion: Math.max(1, Number.parseInt(fila[9], 10) || 1),
    googleEmail: normalizarEmail(fila[10]),
  };
}

const MIGRACION_USUARIOS_SECTORES = "2026-08-27-usuarios-sectores-v1";
let promesaUsuariosSectoresPostgres = null;

async function asegurarUsuariosSectoresPostgres() {
  await asegurarEsquemaUsuariosSectores();
  if (await migracionDatosCompletada(MIGRACION_USUARIOS_SECTORES)) return;
  if (promesaUsuariosSectoresPostgres) return promesaUsuariosSectoresPostgres;
  promesaUsuariosSectoresPostgres = (async () => {
    if (await migracionDatosCompletada(MIGRACION_USUARIOS_SECTORES)) return;

    // Importación inicial: solo lectura desde Sheets. Las hojas quedan como respaldo sin cambios.
    validarConfiguracion();
    const [respuestaUsuarios, respuestaSectores] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${USUARIOS_SHEET_NAME}!A:K` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SECTORES_SHEET_NAME}!A:E` }),
    ]);
    const usuarios = (respuestaUsuarios.data.values || []).slice(1).map(filaAUsuario).filter((u) => u.usuario);
    const sectores = (respuestaSectores.data.values || []).slice(1).map((f) => ({
      id: normalizarTexto(f[0]), nombre: normalizarTexto(f[1]),
      color: /^#[0-9a-f]{6}$/i.test(f[2] || "") ? f[2] : "#b72e35",
      supervisor: normalizarUsuario(f[3]),
      activo: ["si", "sí", "true", "1", "activo"].includes(normalizarTexto(f[4]).toLowerCase()),
    })).filter((sector) => sector.id);
    const importado = await importarUsuariosSectoresAtomico(
      sectores,
      usuarios,
      MIGRACION_USUARIOS_SECTORES,
    );
    if (importado) {
      console.log(
        `PostgreSQL Etapa 2: importados ${usuarios.length} usuarios y ${sectores.length} sectores desde Sheets.`,
      );
    }
  })();
  try { await promesaUsuariosSectoresPostgres; }
  finally { promesaUsuariosSectoresPostgres = null; }
}

async function obtenerUsuarios() {
  await asegurarUsuariosSectoresPostgres();
  return leerConCache("usuarios", CACHE_TTL.usuarios, async () => {
    const filas = await listarUsuariosDb();
    return filas.map((fila) => ({
      usuario: normalizarUsuario(fila.username),
      nombre: normalizarTexto(fila.name) || normalizarUsuario(fila.username),
      passwordHash: normalizarTexto(fila.password_hash),
      rol: normalizarRol(fila.role), activo: Boolean(fila.active),
      creado: normalizarTexto(fila.created_text),
      permisos: normalizarPermisos(fila.permissions, normalizarRol(fila.role)),
      sector: normalizarTexto(fila.sector_id),
      sectores: Array.isArray(fila.managed_sectors) ? fila.managed_sectors.map(normalizarTexto).filter(Boolean) : [],
      sessionVersion: Math.max(1, Number.parseInt(fila.session_version, 10) || 1),
      googleEmail: normalizarEmail(fila.google_email),
    })).filter((u) => u.usuario);
  });
}

async function requerirSesion(req, res, next) {
  try {
    const sesion = verificarTokenAdmin(obtenerTokenAdmin(req));
    if (!sesion?.usuario)
      return res
        .status(401)
        .json({ ok: false, mensaje: "Iniciá sesión para continuar" });
    const usuarios = await obtenerUsuarios();
    const usuario = usuarios.find((u) => u.usuario === sesion.usuario);
    if (!usuario || !usuario.activo)
      return res
        .status(401)
        .json({ ok: false, mensaje: "Usuario inexistente o desactivado" });
    const versionToken = Math.max(1, Number.parseInt(sesion.sv, 10) || 1);
    if (versionToken !== usuario.sessionVersion)
      return res.status(401).json({
        ok: false,
        mensaje: "La sesión fue invalidada. Volvé a iniciar sesión.",
      });
    req.usuario = {
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      rol: usuario.rol,
      permisos: usuario.permisos,
      sector: usuario.sector || "",
      sectores: usuario.sectores || [],
    };
    next();
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo validar la sesión",
    });
  }
}

function requerirAdministrador(req, res, next) {
  const autorizar = () => {
    if (req.usuario?.rol !== "administrador")
      return res
        .status(403)
        .json({ ok: false, mensaje: "Acceso exclusivo para administradores" });
    req.admin = req.usuario;
    return next();
  };
  if (req.usuario) return autorizar();
  return requerirSesion(req, res, autorizar);
}

function requerirAlgunModulo(...modulos) {
  const permitidos = modulos.filter((m) => MODULOS_PERMITIDOS.includes(m));
  return (req, res, next) => {
    if (req.usuario?.rol === "administrador") return next();
    if (permitidos.some((m) => req.usuario?.permisos?.[m] === true)) return next();
    return res.status(403).json({
      ok: false,
      mensaje: `No tenés permiso para acceder a ${permitidos.join(" / ")}`,
    });
  };
}


function validarConfiguracion() {
  if (!SPREADSHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error(
      "Faltan variables de entorno: SPREADSHEET_ID, GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY",
    );
  }
}

function filaAProducto(fila, index) {
  const stockHoja = numero(fila[2]);
  const salon = numero(fila[3]);
  const deposito = numero(fila[4]);
  const stockUbicaciones = salon + deposito;

  return {
    filaGoogle: index + 2,
    codigo: normalizarCodigo(fila[0]),
    articulo: normalizarTexto(fila[1]),
    // C es el stock total persistido. D y E son el detalle por ubicación.
    // Los productos históricos pueden tener C > 0 y D/E todavía vacíos.
    stock: Math.max(stockHoja, stockUbicaciones),
    salon,
    deposito,
  };
}

async function obtenerProductosLegacy() {
  validarConfiguracion();
  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:E`,
  });
  const filas = respuesta.data.values || [];
  if (filas.length <= 1) return [];
  return filas
    .slice(1)
    .map(filaAProducto)
    .filter((producto) => producto.codigo || producto.articulo);
}

async function obtenerProductos() {
  await asegurarInventarioProductosPostgres();
  return leerConCache("productos", CACHE_TTL.productos, () => listarInventarioDb());
}

async function buscarProductoPorCodigo(codigoBuscado) {
  await asegurarInventarioProductosPostgres();
  return buscarInventarioPorCodigoDb(normalizarCodigo(codigoBuscado));
}

async function crearProductoInventario(codigoBuscado, articuloSugerido = "") {
  await asegurarInventarioProductosPostgres();
  const codigo = normalizarCodigo(codigoBuscado);
  if (!codigo) return null;
  let articulo = normalizarTexto(articuloSugerido);
  if (!articulo) {
    const maestro = await buscarProductoMaestroPorCodigo(codigo);
    articulo = normalizarTexto(maestro?.articulo);
  }
  if (!articulo) return null;
  const creado = await crearInventarioDb(codigo, articulo);
  invalidarCache("productos");
  return creado;
}

async function actualizarProducto(producto, { recalcularTotal = false } = {}) {
  await asegurarInventarioProductosPostgres();
  const actualizado = await actualizarInventarioDb(producto, { recalcularTotal });
  invalidarCache("productos");
  return actualizado;
}

function filaAProductoMaestro(fila, index) {
  return {
    filaGoogle: index + 2,
    codigo: normalizarCodigo(fila[0]),
    articulo: normalizarTexto(fila[1]),
    precio: numeroPrecio(fila[2]),
  };
}

async function obtenerProductosMaestrosLegacy() {
  validarConfiguracion();
  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PRODUCTOS_SHEET_NAME}!A:C`,
  });
  const filas = respuesta.data.values || [];
  if (filas.length <= 1) return [];
  return filas
    .slice(1)
    .map(filaAProductoMaestro)
    .filter((producto) => producto.codigo || producto.articulo);
}

const MIGRACION_INVENTARIO_PRODUCTOS = "2026-08-28-inventario-productos-v1";
let promesaInventarioProductosPostgres = null;
async function asegurarInventarioProductosPostgres() {
  await asegurarEsquemaUsuariosSectores();
  await asegurarEsquemaInventarioProductos();
  if (await migracionDatosCompletada(MIGRACION_INVENTARIO_PRODUCTOS)) return;
  if (promesaInventarioProductosPostgres) return promesaInventarioProductosPostgres;
  promesaInventarioProductosPostgres = (async () => {
    if (await migracionDatosCompletada(MIGRACION_INVENTARIO_PRODUCTOS)) return;
    // Importación inicial de solo lectura: Stock y Productos quedan como respaldo histórico.
    const [inventario, catalogo] = await Promise.all([
      obtenerProductosLegacy(),
      obtenerProductosMaestrosLegacy(),
    ]);
    const importado = await importarInventarioProductosAtomico(
      { inventario, catalogo },
      MIGRACION_INVENTARIO_PRODUCTOS,
    );
    if (importado) {
      console.log(
        `PostgreSQL Etapa 5: Inventario y Productos importados desde Sheets (${inventario.length} filas de inventario, ${catalogo.length} productos de catálogo).`,
      );
    }
  })();
  try { await promesaInventarioProductosPostgres; }
  finally { promesaInventarioProductosPostgres = null; }
}

async function obtenerProductosMaestros() {
  await asegurarInventarioProductosPostgres();
  return leerConCache(
    "productosMaestros",
    CACHE_TTL.productosMaestros,
    () => listarCatalogoDb(),
  );
}

async function buscarProductoMaestroPorCodigo(codigoBuscado) {
  await asegurarInventarioProductosPostgres();
  return buscarCatalogoPorCodigoDb(normalizarCodigo(codigoBuscado));
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const intentosLogin = new Map();
const limpiezaIntentosLogin = setInterval(() => {
  const ahora = Date.now();
  for (const [clave, estado] of intentosLogin) {
    if (!estado?.inicio || ahora - estado.inicio >= LOGIN_WINDOW_MS)
      intentosLogin.delete(clave);
  }
}, LOGIN_WINDOW_MS);
limpiezaIntentosLogin.unref?.();

function claveLimiteLogin(req) {
  const identidad = normalizarUsuario(req.body?.usuario) || (req.body?.credential ? "google" : "anon");
  return `${req.ip || req.socket?.remoteAddress || "ip"}:${identidad}`;
}

function limitarLogin(req, res, next) {
  const ahora = Date.now();
  const clave = claveLimiteLogin(req);
  const actual = intentosLogin.get(clave);
  const estado = !actual || ahora - actual.inicio >= LOGIN_WINDOW_MS
    ? { inicio: ahora, intentos: 0 }
    : actual;
  if (estado.intentos >= LOGIN_MAX_ATTEMPTS) {
    const espera = Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (ahora - estado.inicio)) / 1000));
    res.set("Retry-After", String(espera));
    return res.status(429).json({
      ok: false,
      mensaje: "Demasiados intentos de ingreso. Esperá unos minutos y volvé a probar.",
    });
  }
  estado.intentos += 1;
  intentosLogin.set(clave, estado);
  next();
}

function limpiarLimiteLogin(req) {
  intentosLogin.delete(claveLimiteLogin(req));
}

function datosSesionUsuario(usuario) {
  return {
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
    permisos: usuario.permisos,
    sector: usuario.sector || "",
    sectores: usuario.sectores || [],
  };
}

function responderSesion(res, usuario, extra = {}) {
  if (!ADMIN_TOKEN_SECRET)
    return res
      .status(503)
      .json({ ok: false, mensaje: "Configurá ADMIN_TOKEN_SECRET en Render" });

  const ahora = Date.now();
  const exp = ahora + USER_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = firmarTokenAdmin({
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
    sv: usuario.sessionVersion,
    iat: ahora,
    exp,
  });

  return res.json({
    ok: true,
    token,
    usuario: datosSesionUsuario(usuario),
    expira: new Date(exp).toISOString(),
    ...extra,
  });
}

async function verificarCredencialGoogle(credential) {
  if (!GOOGLE_LOGIN_CLIENT_ID) {
    const error = new Error("El acceso con Google todavía no está configurado");
    error.status = 503;
    throw error;
  }
  const token = normalizarTexto(credential);
  if (!token) {
    const error = new Error("Falta la credencial de Google");
    error.status = 400;
    throw error;
  }

  try {
    const ticket = await googleLoginAuth.verifyIdToken({
      idToken: token,
      audience: GOOGLE_LOGIN_CLIENT_ID,
    });
    const payload = ticket.getPayload() || {};
    const email = normalizarEmail(payload.email);
    if (!email || payload.email_verified !== true) {
      const error = new Error("Google no pudo verificar el correo de la cuenta");
      error.status = 401;
      throw error;
    }
    if (
      GOOGLE_LOGIN_DOMAIN &&
      !email.endsWith(`@${GOOGLE_LOGIN_DOMAIN}`)
    ) {
      const error = new Error(
        `Usá una cuenta de Google del dominio ${GOOGLE_LOGIN_DOMAIN}`,
      );
      error.status = 403;
      throw error;
    }
    return {
      email,
      nombre: normalizarTexto(payload.name),
      subject: normalizarTexto(payload.sub),
    };
  } catch (error) {
    if (error?.status) throw error;
    const authError = new Error("La sesión de Google no es válida o venció");
    authError.status = 401;
    throw authError;
  }
}

app.get("/auth/google/config", (req, res) => {
  res.json({
    ok: true,
    enabled: Boolean(GOOGLE_LOGIN_CLIENT_ID),
    clientId: GOOGLE_LOGIN_CLIENT_ID || "",
  });
});

app.use("/auth", (req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  next();
});

app.post("/auth/google", limitarLogin, async (req, res) => {
  try {
    const cuentaGoogle = await verificarCredencialGoogle(req.body?.credential);
    const usuarios = await obtenerUsuarios();
    const usuario = usuarios.find(
      (item) => normalizarEmail(item.googleEmail) === cuentaGoogle.email,
    );

    if (!usuario) {
      return res.status(409).json({
        ok: false,
        vinculacionRequerida: true,
        email: cuentaGoogle.email,
        mensaje:
          "Esta cuenta de Google todavía no está vinculada. Ingresá una vez con tu usuario y contraseña para vincularla.",
      });
    }
    if (!usuario.activo)
      return res
        .status(403)
        .json({ ok: false, mensaje: "Este usuario está desactivado" });

    limpiarLimiteLogin(req);
    return responderSesion(res, usuario, { metodo: "google" });
  } catch (error) {
    console.error("Error en /auth/google:", error);
    return res.status(error?.status || 500).json({
      ok: false,
      mensaje: error.message || "No se pudo iniciar sesión con Google",
    });
  }
});

app.post("/auth/login", limitarLogin, async (req, res) => {
  try {
    const usuarioBuscado = normalizarUsuario(req.body?.usuario);
    const password = String(req.body?.password ?? "");
    const googleCredential = normalizarTexto(req.body?.googleCredential);

    if (!usuarioBuscado || !password)
      return res
        .status(400)
        .json({ ok: false, mensaje: "Ingresá usuario y contraseña" });

    const usuarios = await obtenerUsuarios();
    const usuario = usuarios.find((item) => item.usuario === usuarioBuscado);
    if (
      !usuario ||
      !usuario.activo ||
      !verificarPassword(password, usuario.passwordHash)
    ) {
      return res
        .status(401)
        .json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    let googleVinculado = false;
    if (googleCredential) {
      const cuentaGoogle = await verificarCredencialGoogle(googleCredential);
      const otroUsuario = usuarios.find(
        (item) =>
          item.usuario !== usuario.usuario &&
          normalizarEmail(item.googleEmail) === cuentaGoogle.email,
      );
      if (otroUsuario)
        return res.status(409).json({
          ok: false,
          mensaje: "Esa cuenta de Google ya está vinculada a otro usuario",
        });

      const emailActual = normalizarEmail(usuario.googleEmail);
      if (emailActual && emailActual !== cuentaGoogle.email)
        return res.status(409).json({
          ok: false,
          mensaje:
            "Este usuario ya está vinculado a otra cuenta de Google. Contactá a un administrador para cambiarla.",
        });

      if (!emailActual) {
        await guardarUsuarioDb({ ...usuario, googleEmail: cuentaGoogle.email });
        invalidarCache("usuarios");
        usuario.googleEmail = cuentaGoogle.email;
        googleVinculado = true;
      }
    }

    limpiarLimiteLogin(req);
    return responderSesion(res, usuario, {
      metodo: "usuario",
      googleVinculado,
    });
  } catch (error) {
    console.error("Error en /auth/login:", error);
    return res.status(error?.status || 500).json({
      ok: false,
      mensaje: error.message || "No se pudo iniciar sesión",
    });
  }
});

app.get("/auth/session", requerirSesion, (req, res) => {
  res.json({ ok: true, usuario: req.usuario, version: APP_VERSION, build: APP_BUILD });
});

// Desde aquí, toda la API de trabajo requiere una sesión válida.
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/notificaciones/cron") return next();
  return requerirSesion(req, res, next);
});

let hojaOperacionesOfflineAsegurada = false;
const ENCABEZADOS_OPERACIONES_OFFLINE = [
  "ID", "Usuario", "Fecha", "Método", "Ruta", "Estado", "Respuesta"
];

async function asegurarHojaOperacionesOffline() {
  if (hojaOperacionesOfflineAsegurada) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets || []).some(
    (h) => h.properties?.title === OFFLINE_OPERATIONS_SHEET_NAME,
  );
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: OFFLINE_OPERATIONS_SHEET_NAME } } }] },
    });
  }
  const datos = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${OFFLINE_OPERATIONS_SHEET_NAME}!A1:G2`,
  });
  const encabezado = datos.data.values?.[0] || [];
  if (!encabezado.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${OFFLINE_OPERATIONS_SHEET_NAME}!A1:G1`,
      valueInputOption: "RAW",
      requestBody: { values: [ENCABEZADOS_OPERACIONES_OFFLINE] },
    });
  } else if (!ENCABEZADOS_OPERACIONES_OFFLINE.every((v, i) => encabezado[i] === v)) {
    throw new Error("La hoja Operaciones Offline tiene un esquema desconocido; no se modificó automáticamente");
  }
  hojaOperacionesOfflineAsegurada = true;
}

async function buscarOperacionOffline(id, usuario) {
  await asegurarAuxiliaresPostgres();
  return buscarOperacionOfflineDb(id, usuario);
}

async function reservarOperacionOffline(id, req) {
  await asegurarAuxiliaresPostgres();
  return reservarOperacionOfflineDb({
    id,
    usuario: req.usuario?.usuario || "",
    fecha: fechaHoraArgentinaIso(),
    metodo: req.method,
    ruta: req.originalUrl,
  });
}

async function finalizarOperacionOffline(id, usuario, statusCode, payload) {
  await asegurarAuxiliaresPostgres();
  try {
    const respuesta = JSON.stringify(payload ?? {}).slice(0, 45000);
    await finalizarOperacionOfflineDb(
      id,
      usuario,
      statusCode >= 200 && statusCode < 300 ? "Completada" : "Error",
      respuesta,
    );
  } catch (error) {
    console.error("No se pudo finalizar la operación offline idempotente:", error);
  }
}

async function protegerOperacionOffline(req, res, next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const id = normalizarTexto(req.get("X-Offline-Operation-Id"));
  if (!id) return next();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(id))
    return res.status(400).json({ ok: false, mensaje: "Identificador offline inválido" });
  try {
    const existente = await reservarOperacionOffline(id, req);
    if (existente) {
      if (existente.estado === "Completada" && existente.respuesta) {
        try {
          const payload = JSON.parse(existente.respuesta);
          return res.status(200).json({ ...payload, offlineReplay: true });
        } catch {}
      }
      return res.status(202).json({
        ok: true, offlineReplay: true, pendiente: existente.estado === "En proceso",
        mensaje: "Esta operación offline ya fue recibida y no se ejecutará nuevamente.",
      });
    }
    const usuario = req.usuario?.usuario || "";
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      finalizarOperacionOffline(id, usuario, res.statusCode, payload);
      return originalJson(payload);
    };
    next();
  } catch (error) {
    console.error("Error al proteger operación offline:", error);
    res.status(503).json({ ok: false, mensaje: "No se pudo reservar la operación offline; reintentá luego" });
  }
}

app.use(protegerOperacionOffline);


function minutosDeHoraHorario(valor) {
  const normalizada = normalizarHoraHorario(valor);
  if (!normalizada) return null;
  const [hora, minuto] = normalizada.split(":").map(Number);
  return hora * 60 + minuto;
}

function minutoDentroDeRango(minutoActual, inicio, fin) {
  const desde = minutosDeHoraHorario(inicio);
  const hasta = minutosDeHoraHorario(fin);
  if (desde === null || hasta === null || desde === hasta) return false;
  // También soporta turnos que cruzan medianoche (por ejemplo 22:00-06:00).
  return hasta > desde
    ? minutoActual >= desde && minutoActual < hasta
    : minutoActual >= desde || minutoActual < hasta;
}

function turnoActivoEnMinuto(valorTurno, turnosSector, minutoActual) {
  const valor = normalizarTexto(valorTurno);
  const clave = valor.toLowerCase();
  if (!clave || ["franco", "vacaciones", "ausente", "licencia"].includes(clave))
    return false;

  const configurado = (turnosSector || []).find(
    (turno) => normalizarTexto(turno.id).toLowerCase() === clave,
  );
  if (configurado) {
    if (minutoDentroDeRango(minutoActual, configurado.inicio, configurado.fin))
      return true;
    return configurado.tipo === "cortado" &&
      minutoDentroDeRango(minutoActual, configurado.inicio2, configurado.fin2);
  }

  const directo = valor.match(
    /^\s*(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s*$/,
  );
  return directo
    ? minutoDentroDeRango(minutoActual, directo[1], directo[2])
    : false;
}

async function contarPersonalEnTurnoActual() {
  const fecha = fechaArgentina();
  const mes = fecha.slice(0, 7);
  const dia = Number(fecha.slice(8, 10));
  const ahora = horaMinutoArgentina();
  const minutoActual = ahora.hora * 60 + ahora.minuto;
  const bloqueCincoMinutos = Math.floor(minutoActual / 5);

  return leerConCache(
    `dashboardPersonal:${fecha}:${bloqueCincoMinutos}`,
    30_000,
    async () => {
      await asegurarHorariosPostgres();
      const [filasCalendario, usuarios] = await Promise.all([
        listarCalendarioFilas(), obtenerUsuarios(),
      ]);
      const usuariosActivos = new Set();
      usuarios
        .filter((usuario) => usuario.activo !== false)
        .forEach((usuario) => {
          [usuario.nombre, usuario.usuario]
            .map(normalizarUsuario)
            .filter(Boolean)
            .forEach((clave) => usuariosActivos.add(clave));
        });

      const filasHoy = filasCalendario.filter(
          (fila) =>
            normalizarTexto(fila[1]) === mes &&
            Number(fila[3]) === dia &&
            normalizarTexto(fila[0]) &&
            normalizarTexto(fila[2]) &&
            normalizarTexto(fila[4]),
        );
      const sectores = [...new Set(filasHoy.map((fila) => normalizarTexto(fila[0])))];
      const turnosPorSector = new Map(
        await Promise.all(
          sectores.map(async (sector) => [sector, await obtenerTurnosSector(sector)]),
        ),
      );
      const presentes = new Set();
      for (const fila of filasHoy) {
        const sector = normalizarTexto(fila[0]);
        const empleado = normalizarUsuario(fila[2]);
        if (!usuariosActivos.has(empleado)) continue;
        if (turnoActivoEnMinuto(fila[4], turnosPorSector.get(sector), minutoActual))
          presentes.add(empleado);
      }
      return presentes.size;
    },
  );
}

function sumarDiasIso(fechaIso, dias) {
  const [y, m, d] = String(fechaIso).split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function fechasSemanaActualArgentina() {
  const hoy = fechaArgentina();
  const [y, m, d] = hoy.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const diaSemana = fecha.getUTCDay();
  const desplazamientoLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = sumarDiasIso(hoy, desplazamientoLunes);
  return new Set(Array.from({ length: 7 }, (_, i) => sumarDiasIso(lunes, i)));
}

function resumirTareasDia(tareas, fecha = fechaArgentina()) {
  let total = 0;
  let completadas = 0;
  for (const tarea of tareas || []) {
    const asignacionesDia = tarea?.asignaciones?.[fecha];
    if (!asignacionesDia || typeof asignacionesDia !== "object") continue;
    for (const asignacion of Object.values(asignacionesDia)) {
      if (!asignacion || typeof asignacion !== "object") continue;
      total += 1;
      if (normalizarTexto(asignacion.estado).toLowerCase() === "completada") completadas += 1;
    }
  }
  return {
    total,
    completadas,
    porcentaje: total ? Math.round((completadas / total) * 100) : 0,
  };
}

function resumirTareasSemana(tareas) {
  const fechasSemana = fechasSemanaActualArgentina();
  let total = 0;
  let completadas = 0;
  for (const tarea of tareas || []) {
    for (const [fecha, asignacionesDia] of Object.entries(tarea.asignaciones || {})) {
      if (!fechasSemana.has(fecha) || !asignacionesDia || typeof asignacionesDia !== "object")
        continue;
      for (const asignacion of Object.values(asignacionesDia)) {
        if (!asignacion || typeof asignacion !== "object") continue;
        const responsables = Array.isArray(asignacion.responsables)
          ? asignacion.responsables.map(normalizarTexto).filter(Boolean)
          : [];
        const cantidad = responsables.length;
        total += cantidad;
        if (normalizarTexto(asignacion.estado).toLowerCase() === "completada")
          completadas += cantidad;
      }
    }
  }
  return {
    total,
    completadas,
    porcentaje: total ? Math.round((completadas / total) * 100) : 0,
  };
}

async function obtenerResumenDashboard(usuario) {
  const esAdmin = usuario?.rol === "administrador";
  const puede = (modulo) => esAdmin || usuario?.permisos?.[modulo] === true;
  const rolesSelectorGlobal = new Set(["administrador", "administracion", "supervisor"]);
  const puedeVerTareasInicio = rolesSelectorGlobal.has(usuario?.rol) || puede("tareas");
  const [productos, vencimientos, tareas, personalEnTurno, sectoresActivos] = await Promise.all([
    puede("inventario") ? obtenerProductos() : Promise.resolve(null),
    puede("vencimientos") ? obtenerVencimientos() : Promise.resolve(null),
    puedeVerTareasInicio ? obtenerTareasServidor() : Promise.resolve(null),
    puede("horarios") ? contarPersonalEnTurnoActual() : Promise.resolve(null),
    puedeVerTareasInicio ? obtenerSectores().then((lista) => lista.filter((sector) => sector.activo)) : Promise.resolve([]),
  ]);
  const hoy = fechaArgentina();
  const tareasSemana = tareas ? resumirTareasSemana(tareas) : null;
  const tareasHoy = tareas ? resumirTareasDia(tareas, hoy) : null;
  const stockContado = productos
    ? productos.filter((producto) => Number(producto.stock) > 0).length
    : null;
  const vencimientosCriticos = vencimientos
    ? vencimientos.filter((item) => {
        const dias = diasDesdeHoyArgentina(item.vencimiento);
        return dias !== null && dias >= 0 && dias <= 7;
      }).length
    : null;
  const vencimientosHoyDetalle = vencimientos
    ? vencimientos
        .filter((item) => normalizarTexto(item.vencimiento) === hoy)
        .map((item) => ({
          id: item.id,
          articulo: item.articulo,
          codigo: item.codigo,
          cantidad: Math.max(0, Number(item.cantidad) || 0),
          rubro: item.rubro || "Sin clasificar",
        }))
    : [];

  const puedeElegirSectorTareasInicio = rolesSelectorGlobal.has(usuario?.rol);
  const sectoresTareasInicio = puedeElegirSectorTareasInicio
    ? sectoresActivos
    : sectoresActivos.filter((sector) => normalizarTexto(sector.id) === normalizarTexto(usuario?.sector));
  const sectoresNormalizados = sectoresTareasInicio.map((sector) => ({
    id: sector.id,
    nombre: sector.nombre || sector.id,
    color: sector.color || "#718096",
  }));
  const permitidos = new Set(
    sectoresNormalizados.flatMap((sector) => [normalizarTexto(sector.id), normalizarTexto(sector.nombre)]),
  );
  const tareasHoyDetalle = [];
  for (const tarea of tareas || []) {
    if (!permitidos.has(normalizarTexto(tarea.sector))) continue;
    const asignacionesDia = tarea?.asignaciones?.[hoy];
    if (!asignacionesDia || typeof asignacionesDia !== "object") continue;
    for (const [turno, asignacion] of Object.entries(asignacionesDia)) {
      if (!asignacion || typeof asignacion !== "object") continue;
      tareasHoyDetalle.push({
        id: tarea.id,
        nombre: tarea.nombre || "Tarea",
        sector: tarea.sector || "General",
        turno,
        estado: normalizarTexto(asignacion.estado).toLowerCase() === "completada" ? "completada" : "pendiente",
        responsables: Array.isArray(asignacion.responsables)
          ? asignacion.responsables.map(normalizarTexto).filter(Boolean)
          : [],
      });
    }
  }

  return {
    stockContado,
    vencimientosCriticos,
    vencimientosHoy: vencimientosHoyDetalle.length,
    vencimientosHoyDetalle,
    personalEnTurno,
    tareasCompletadasHoy: tareasHoy?.completadas ?? null,
    tareasAsignadasHoy: tareasHoy?.total ?? null,
    tareasPorcentajeHoy: tareasHoy?.porcentaje ?? null,
    // Compatibilidad: otros consumidores todavía pueden usar el resumen semanal.
    tareasCompletadasSemana: tareasSemana?.completadas ?? null,
    tareasAsignadasSemana: tareasSemana?.total ?? null,
    tareasPorcentajeSemana: tareasSemana?.porcentaje ?? null,
    puedeElegirSectorTareasInicio,
    sectoresTareasInicio: sectoresNormalizados,
    tareasHoyDetalle,
  };
}

app.get("/dashboard/resumen", requerirSesion, async (req, res) => {
  try {
    const resumen = await obtenerResumenDashboard(req.usuario);
    res.set("Cache-Control", "private, max-age=20, must-revalidate");
    res.json({ ok: true, ...resumen, actualizado: fechaHoraArgentinaIso() });
  } catch (error) {
    console.error("Error en /dashboard/resumen:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo cargar el resumen del inicio",
    });
  }
});

app.get("/admin/resumen", requerirAdministrador, async (req, res) => {
  try {
    // El panel general cuenta el catálogo maestro de la hoja Productos.
    // La hoja Stock queda reservada exclusivamente para el módulo Inventario.
    const [productosCatalogo, productosInventario, vencimientos] =
      await Promise.all([
        obtenerProductosMaestros(),
        obtenerProductos(),
        obtenerVencimientos(),
      ]);
    const hoyIso = fechaArgentina();
    const vencimientosHoy = vencimientos.filter((item) => normalizarTexto(item.vencimiento) === hoyIso).length;
    const vencimientosProximos30 = vencimientos.filter((item) => {
      const dias = diasDesdeHoyArgentina(item.vencimiento);
      return dias !== null && dias >= 0 && dias <= 30;
    }).length;
    res.json({
      ok: true,
      version: APP_VERSION,
      build: APP_BUILD,
      productos: productosCatalogo.length,
      productosCatalogo: productosCatalogo.length,
      productosInventario: productosInventario.length,
      vencimientos: vencimientos.length,
      vencimientosHoy,
      vencimientosProximos30,
      servidor: "conectado",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo cargar el panel",
    });
  }
});

let hojaHistorialAdministracionAsegurada = false;
async function asegurarHojaHistorialAdministracion() {
  if (hojaHistorialAdministracionAsegurada) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets || []).some((h) => h.properties?.title === HISTORIAL_ADMIN_SHEET_NAME);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: HISTORIAL_ADMIN_SHEET_NAME } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${HISTORIAL_ADMIN_SHEET_NAME}!A1:H1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Fecha", "Hora", "Usuario", "Nombre", "Acción", "Entidad", "Identificador", "Detalle"]] },
  });
  hojaHistorialAdministracionAsegurada = true;
}

async function registrarHistorialAdministracion(req, accion, entidad, identificador = "", detalle = "") {
  await asegurarAuxiliaresPostgres();
  try {
    const ahora = new Date();
    const partes = new Intl.DateTimeFormat("es-AR", {
      timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(ahora);
    const get = (tipo) => partes.find((p) => p.type === tipo)?.value || "";
    await registrarActividadAdminDb({
      fecha: `${get("day")}/${get("month")}/${get("year")}`,
      hora: `${get("hour")}:${get("minute")}:${get("second")}`,
      usuario: req.usuario?.usuario || "desconocido",
      nombre: req.usuario?.nombre || "",
      accion: normalizarTexto(accion),
      entidad: normalizarTexto(entidad),
      identificador: normalizarTexto(identificador),
      detalle: String(detalle || "").slice(0, 500),
    });
  } catch (error) {
    console.error("No se pudo registrar el historial de Administración:", error);
  }
}

app.get("/admin/historial-administracion", requerirAdministrador, async (req, res) => {
  try {
    await asegurarAuxiliaresPostgres();
    res.json({ ok: true, historial: await listarActividadAdminDb(100) });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message || "No se pudo obtener la actividad administrativa" });
  }
});

let hojaSectoresAsegurada = false;
async function asegurarHojaSectores() {
  if (hojaSectoresAsegurada) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (
    !(meta.data.sheets || []).some(
      (h) => h.properties?.title === SECTORES_SHEET_NAME,
    )
  )
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: SECTORES_SHEET_NAME } } },
        ],
      },
    });
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SECTORES_SHEET_NAME}!A1:E2`,
  });
  const f = r.data.values || [];
  const h = ["ID", "Nombre", "Color", "Supervisor", "Activo"];
  if (!f[0] || h.some((x, i) => f[0][i] !== x))
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SECTORES_SHEET_NAME}!A1:E1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [h] },
    });
  if (!f.slice(1).some((x) => x[0])) {
    const base = [
      ["caja", "Caja", "#2563eb", "", "Sí"],
      ["deposito", "Depósito", "#f59e0b", "", "Sí"],
      ["verduleria", "Verdulería", "#16a34a", "", "Sí"],
      ["fiambreria", "Fiambrería", "#db2777", "", "Sí"],
      ["carniceria", "Carnicería", "#dc2626", "", "Sí"],
      ["panaderia", "Panadería", "#a16207", "", "Sí"],
      ["administracion", "Administración", "#6b7280", "", "Sí"],
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SECTORES_SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: base },
    });
  }
  hojaSectoresAsegurada = true;
}
function idSector(nombre) {
  return normalizarTexto(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
async function obtenerSectores() {
  await asegurarUsuariosSectoresPostgres();
  return leerConCache("sectores", CACHE_TTL.sectores, async () => {
    const [filas, usuarios] = await Promise.all([listarSectoresDb(), obtenerUsuarios()]);
    return filas.map((f) => ({
      id: normalizarTexto(f.id), nombre: normalizarTexto(f.name),
      color: /^#[0-9a-f]{6}$/i.test(f.color || "") ? f.color : "#b72e35",
      supervisor: normalizarUsuario(f.supervisor_username),
      supervisorNombre: usuarios.find((u) => u.usuario === normalizarUsuario(f.supervisor_username))?.nombre || "",
      activo: Boolean(f.active),
    })).filter((sector) => sector.id);
  });
}
function usuarioPuedeVerHorarios(usuario) {
  return (
    usuario?.rol === "administrador" || usuario?.permisos?.horarios === true
  );
}
function sectoresACargo(usuario) {
  return Array.isArray(usuario?.sectores) ? usuario.sectores : [];
}
function rolGestionGlobal(usuario) {
  return ["administrador", "administracion"].includes(usuario?.rol);
}
function rolGestionSector(usuario) {
  return ["administrador", "administracion", "supervisor"].includes(
    usuario?.rol,
  );
}
async function sectoresSupervisorPermitidos(usuario) {
  const ids = new Set(
    [usuario?.sector, ...sectoresACargo(usuario)]
      .map(normalizarTexto)
      .filter(Boolean),
  );
  if (usuario?.rol === "supervisor") {
    const sectores = await obtenerSectores();
    sectores
      .filter(
        (s) =>
          s.activo &&
          normalizarUsuario(s.supervisor) ===
            normalizarUsuario(usuario?.usuario),
      )
      .forEach((s) => ids.add(s.id));
  }
  return ids;
}
async function puedeAccederSectorHorarios(usuario, sectorId) {
  const sector = normalizarTexto(sectorId);
  if (!sector) return false;
  if (rolGestionGlobal(usuario)) return true;
  // El supervisor puede consultar todos los sectores, pero la edición sigue
  // limitada a los sectores que tiene formalmente a cargo.
  if (usuario?.rol === "supervisor") return true;
  // Personal puede consultar su sector y Administración en modo solo lectura.
  return (
    sector === "administracion" ||
    (Boolean(usuario?.sector) && normalizarTexto(usuario.sector) === sector)
  );
}

function empleadosHorarioDelSector(sectorId, usuarios, sectores) {
  const sector = normalizarTexto(sectorId);
  const sec = sectores.find((s) => s.id === sector && s.activo);
  if (!sec) return [];
  const lista = usuarios.filter(
    (u) =>
      u.activo &&
      (u.sector === sector ||
        normalizarUsuario(u.usuario) === normalizarUsuario(sec.supervisor) ||
        (sector === "administracion" && u.rol === "supervisor")),
  );
  return lista.filter(
    (u, i, arr) =>
      arr.findIndex(
        (x) => normalizarUsuario(x.usuario) === normalizarUsuario(u.usuario),
      ) === i,
  );
}

function habilitadoCalendarioHorarios(valor) {
  const estado = normalizarTexto(valor).toLowerCase();
  // Compatibilidad hacia atrás: filas anteriores no tienen la columna E.
  if (!estado) return true;
  return !["no", "false", "0", "inactivo", "deshabilitado", "oculto"].includes(estado);
}

function sectoresHorarioSupervisor(usuarioSupervisor, sectores) {
  const ids = new Set(
    ["administracion", normalizarTexto(usuarioSupervisor?.sector)].filter(
      Boolean,
    ),
  );
  for (const id of Array.isArray(usuarioSupervisor?.sectores)
    ? usuarioSupervisor.sectores
    : []) {
    const normalizado = normalizarTexto(id);
    if (normalizado) ids.add(normalizado);
  }
  sectores
    .filter(
      (s) =>
        s.activo &&
        normalizarUsuario(s.supervisor) ===
          normalizarUsuario(usuarioSupervisor?.usuario),
    )
    .forEach((s) => ids.add(s.id));
  return [...ids].filter((id) => sectores.some((s) => s.activo && s.id === id));
}
async function puedeModificarSectorHorarios(usuario, sectorId) {
  const sector = normalizarTexto(sectorId);
  if (rolGestionGlobal(usuario)) return true;
  if (usuario?.rol !== "supervisor") return false;
  return (await sectoresSupervisorPermitidos(usuario)).has(sector);
}
function requerirAccesoHorarios(req, res, next) {
  const autorizar = () => {
    if (!usuarioPuedeVerHorarios(req.usuario))
      return res.status(403).json({
        ok: false,
        mensaje: "No tenés permiso para acceder a Horarios",
      });
    return next();
  };
  if (req.usuario) return autorizar();
  return requerirSesion(req, res, autorizar);
}

let hojasHorariosAseguradas = false;
async function asegurarHojasHorariosLegacy() {
  if (hojasHorariosAseguradas) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titulos = new Set(
    (meta.data.sheets || []).map((h) => h.properties?.title),
  );
  const requests = [];
  if (!titulos.has(CALENDARIO_HORARIOS_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: CALENDARIO_HORARIOS_SHEET_NAME } },
    });
  if (!titulos.has(TURNOS_HORARIOS_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: TURNOS_HORARIOS_SHEET_NAME } },
    });
  if (!titulos.has(DETALLES_HORARIOS_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: DETALLES_HORARIOS_SHEET_NAME } },
    });
  if (!titulos.has(REEMPLAZOS_HORARIOS_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: REEMPLAZOS_HORARIOS_SHEET_NAME } },
    });
  if (!titulos.has(ORDEN_HORARIOS_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: ORDEN_HORARIOS_SHEET_NAME } },
    });
  if (requests.length)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CALENDARIO_HORARIOS_SHEET_NAME}!A1:H1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "Sector",
          "Mes",
          "Empleado",
          "Día",
          "Turno",
          "Actualizado",
          "Usuario",
          "Nombre",
        ],
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TURNOS_HORARIOS_SHEET_NAME}!A1:J1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "Sector",
          "ID",
          "Inicio",
          "Fin",
          "Color",
          "Activo",
          "Actualizado",
          "Tipo",
          "Inicio 2",
          "Fin 2",
        ],
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${DETALLES_HORARIOS_SHEET_NAME}!A1:I1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "Sector",
          "Mes",
          "Empleado",
          "Día",
          "Tipo",
          "Motivo",
          "Observación",
          "Actualizado",
          "Usuario",
        ],
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${REEMPLAZOS_HORARIOS_SHEET_NAME}!A1:I1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "Sector",
          "Mes",
          "Empleado original",
          "Reemplazante",
          "Desde",
          "Hasta",
          "Observación",
          "Actualizado",
          "Usuario",
        ],
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ORDEN_HORARIOS_SHEET_NAME}!A1:E1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["Sector", "Empleado", "Orden", "Actualizado", "Habilitado calendario"]],
    },
  });
  hojasHorariosAseguradas = true;
}

const MIGRACION_HORARIOS = "2026-08-27-horarios-v1";
let promesaHorariosPostgres = null;
async function asegurarHorariosPostgres() {
  await asegurarEsquemaUsuariosSectores();
  await asegurarEsquemaHorarios();
  if (await migracionDatosCompletada(MIGRACION_HORARIOS)) return;
  if (promesaHorariosPostgres) return promesaHorariosPostgres;
  promesaHorariosPostgres = (async () => {
    if (await migracionDatosCompletada(MIGRACION_HORARIOS)) return;
    await asegurarHojasHorariosLegacy();
    await asegurarHojaAuditoriaHorariosLegacy();
    const [turnos, calendario, detalles, reemplazos, orden, auditoria] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${TURNOS_HORARIOS_SHEET_NAME}!A:J` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${CALENDARIO_HORARIOS_SHEET_NAME}!A:H` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${DETALLES_HORARIOS_SHEET_NAME}!A:I` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${REEMPLAZOS_HORARIOS_SHEET_NAME}!A:I` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${ORDEN_HORARIOS_SHEET_NAME}!A:E` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${AUDITORIA_HORARIOS_SHEET_NAME}!A:G` }),
    ]);
    const si = (v) => !["no","false","0","inactivo","deshabilitado","oculto"].includes(normalizarTexto(v).toLowerCase());
    const datos = {
      turnos: (turnos.data.values || []).slice(1).filter(f=>normalizarTexto(f[0])&&normalizarTexto(f[1])).map(f=>[normalizarTexto(f[0]),normalizarTexto(f[1]),normalizarTexto(f[2]),normalizarTexto(f[3]),normalizarTexto(f[4])||"#64748b",si(f[5]),normalizarTexto(f[6]),normalizarTexto(f[7])||"continuo",normalizarTexto(f[8]),normalizarTexto(f[9])]),
      calendario: (calendario.data.values || []).slice(1).filter(f=>normalizarTexto(f[0])&&mesHorariosValido(f[1])&&normalizarTexto(f[2])&&Number(f[3])>=1&&Number(f[3])<=31&&normalizarTexto(f[4])).map(f=>[normalizarTexto(f[0]),normalizarTexto(f[1]),normalizarTexto(f[2]),Number(f[3]),normalizarTexto(f[4]),normalizarTexto(f[5]),normalizarUsuario(f[6]),normalizarTexto(f[7])]),
      detalles: (detalles.data.values || []).slice(1).filter(f=>normalizarTexto(f[0])&&mesHorariosValido(f[1])&&normalizarTexto(f[2])&&Number(f[3])>=1&&Number(f[3])<=31).map(f=>[normalizarTexto(f[0]),normalizarTexto(f[1]),normalizarTexto(f[2]),Number(f[3]),normalizarTexto(f[4]),normalizarTexto(f[5]),normalizarTexto(f[6]),normalizarTexto(f[7]),normalizarUsuario(f[8])]),
      reemplazos: (reemplazos.data.values || []).slice(1).filter(f=>normalizarTexto(f[0])&&mesHorariosValido(f[1])&&normalizarTexto(f[2])&&normalizarTexto(f[3])).map(f=>[normalizarTexto(f[0]),normalizarTexto(f[1]),normalizarTexto(f[2]),normalizarTexto(f[3]),normalizarTexto(f[4]),normalizarTexto(f[5]),normalizarTexto(f[6]),normalizarTexto(f[7]),normalizarUsuario(f[8])]),
      orden: (orden.data.values || []).slice(1).filter(f=>normalizarTexto(f[0])&&normalizarTexto(f[1])).map(f=>[normalizarTexto(f[0]),normalizarTexto(f[1]),Number(f[2])||0,normalizarTexto(f[3]),si(f[4])]),
      auditoria: (auditoria.data.values || []).slice(1).filter(f=>f.some(Boolean)).map(f=>f.slice(0,7).map(normalizarTexto)),
    };
    const importado = await importarHorariosAtomico(datos, MIGRACION_HORARIOS);
    if (importado) console.log(`PostgreSQL Etapa 3: Horarios importados desde Sheets (${datos.calendario.length} celdas, ${datos.turnos.length} turnos).`);
  })();
  try { await promesaHorariosPostgres; } finally { promesaHorariosPostgres = null; }
}

function mesHorariosValido(valor) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(normalizarTexto(valor));
}
function diasEnMesHorarios(mes) {
  if (!mesHorariosValido(mes)) return 0;
  const [anio, numeroMes] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
}
function horaHorarioFlexibleValida(valor) {
  const texto = normalizarTexto(valor);
  const match = texto.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return false;
  const hora = Number(match[1]);
  const minuto = Number(match[2] || 0);
  return hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59;
}
function turnoHorarioValido(valor) {
  const texto = normalizarTexto(valor);
  const clave = texto.toLowerCase();
  if (["franco", "vacaciones", "ausente", "licencia"].includes(clave))
    return true;
  const rango = texto.match(/^(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)$/);
  if (rango)
    return horaHorarioFlexibleValida(rango[1]) && horaHorarioFlexibleValida(rango[2]);
  return /^[a-z0-9_-]{1,80}$/i.test(texto);
}
function normalizarHoraHorario(valor) {
  const texto = normalizarTexto(valor).toUpperCase();
  const m = texto.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AP]M))?$/);
  if (!m) return "";
  let hora = Number(m[1]);
  const minutos = Number(m[2]);
  if (m[3] === "PM" && hora < 12) hora += 12;
  if (m[3] === "AM" && hora === 12) hora = 0;
  if (hora < 0 || hora > 23 || minutos < 0 || minutos > 59) return "";
  return `${String(hora).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}
async function obtenerTurnosSector(sector) {
  await asegurarHorariosPostgres();
  return leerConCache(
    `turnosHorarios:${sector}`,
    CACHE_TTL.turnosHorarios,
    async () => {
      const filasTurnos = await listarTurnosFilas();
      return filasTurnos
        .filter(
          (f) =>
            normalizarTexto(f[0]) === sector &&
            !["no", "false", "0", "inactivo"].includes(
              normalizarTexto(f[5]).toLowerCase(),
            ),
        )
        .map((f) => ({
          id: normalizarTexto(f[1]),
          inicio: normalizarHoraHorario(f[2]),
          fin: normalizarHoraHorario(f[3]),
          color: /^#[0-9a-f]{6}$/i.test(f[4] || "") ? f[4] : "#64748b",
          tipo:
            normalizarTexto(f[7]).toLowerCase() === "cortado"
              ? "cortado"
              : "continuo",
          inicio2: normalizarHoraHorario(f[8]),
          fin2: normalizarHoraHorario(f[9]),
        }))
        .filter(
          (t) =>
            t.id &&
            t.inicio &&
            t.fin &&
            (t.tipo !== "cortado" || (t.inicio2 && t.fin2)),
        );
    },
  );
}
async function registrarAuditoriaHorario(usuario, sectorNombre, mes, accion) {
  await asegurarHorariosPostgres();
  await registrarAuditoriaFilas([[fechaHoraArgentinaIso(), usuario.usuario, usuario.nombre, usuario.rol, sectorNombre, mes, accion]]);
}

app.get("/horarios/turnos", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.query.sector);
    if (!(await puedeAccederSectorHorarios(req.usuario, sector)))
      return res
        .status(403)
        .json({ ok: false, mensaje: "No tenés acceso a ese sector" });
    res.json({ ok: true, sector, turnos: await obtenerTurnosSector(sector) });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudieron cargar los horarios del sector",
    });
  }
});
app.put("/horarios/turnos", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    if (!(await puedeModificarSectorHorarios(req.usuario, sector)))
      return res.status(403).json({
        ok: false,
        mensaje: "No tenés permiso para configurar los horarios de este sector",
      });
    const sectores = await obtenerSectores();
    if (!sectores.some((s) => s.id === sector))
      return res.status(404).json({ ok: false, mensaje: "Sector inexistente" });
    const turnos = Array.isArray(req.body?.turnos)
      ? req.body.turnos.map((t) => ({
          id: normalizarTexto(t.id),
          tipo:
            normalizarTexto(t.tipo).toLowerCase() === "cortado"
              ? "cortado"
              : "continuo",
          inicio: normalizarTexto(t.inicio).slice(0, 5),
          fin: normalizarTexto(t.fin).slice(0, 5),
          inicio2: normalizarTexto(t.inicio2).slice(0, 5),
          fin2: normalizarTexto(t.fin2).slice(0, 5),
          color: /^#[0-9a-f]{6}$/i.test(t.color || "") ? t.color : "#64748b",
        }))
      : [];
    const idsTurnos = turnos.map((t) => t.id.toLowerCase());
    if (
      !turnos.length ||
      new Set(idsTurnos).size !== idsTurnos.length ||
      turnos.some(
        (t) =>
          !/^[a-z0-9_-]{1,80}$/i.test(t.id) ||
          !normalizarHoraHorario(t.inicio) ||
          !normalizarHoraHorario(t.fin) ||
          (t.tipo === "cortado" &&
            (!normalizarHoraHorario(t.inicio2) ||
              !normalizarHoraHorario(t.fin2))),
      )
    )
      return res.status(400).json({
        ok: false,
        mensaje: "Configuración de horarios inválida o con identificadores repetidos",
      });
    await asegurarHorariosPostgres();
    await ejecutarEnCola("horarios-global", async () => {
      const ahora = fechaHoraArgentinaIso();
      const nuevas = turnos.map((t) => [sector,t.id,t.inicio,t.fin,t.color,"Sí",ahora,t.tipo,t.inicio2 || "",t.fin2 || ""]);
      await reemplazarTurnosSector(sector, nuevas);
    });
    invalidarCache(`turnosHorarios:${sector}`);
    res.json({ ok: true, turnos });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudieron guardar los horarios",
    });
  }
});
app.get("/horarios/calendario", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.query.sector),
      mes = normalizarTexto(req.query.mes);
    if (!(await puedeAccederSectorHorarios(req.usuario, sector)))
      return res
        .status(403)
        .json({ ok: false, mensaje: "No tenés acceso a ese sector" });
    if (!mesHorariosValido(mes))
      return res.status(400).json({ ok: false, mensaje: "Mes inválido" });
    await asegurarHorariosPostgres();
    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    const [filasCalendario, filasDetalles, usuarios, sectores] = await Promise.all([
      listarCalendarioFilas(), listarDetallesFilas(), obtenerUsuarios(), obtenerSectores(),
    ]);
    const propias = filasCalendario.filter(
      (f) => normalizarTexto(f[0]) === sector && normalizarTexto(f[1]) === mes,
    );
    const propiosDetalles = filasDetalles.filter(
      (f) => normalizarTexto(f[0]) === sector && normalizarTexto(f[1]) === mes,
    );
    const celdasMapa = new Map();
    propias
      .map((f) => ({
        empleado: normalizarTexto(f[2]),
        dia: Number(f[3]),
        turno: normalizarTexto(f[4]),
      }))
      .filter(
        (x) =>
          x.empleado &&
          Number.isInteger(x.dia) &&
          x.dia >= 1 &&
          x.dia <= 31 &&
          x.turno,
      )
      .forEach((x) => celdasMapa.set(`${x.empleado}::${x.dia}`, x));
    const detallesMapa = new Map();
    propiosDetalles
      .map((f) => ({
        empleado: normalizarTexto(f[2]),
        dia: Number(f[3]),
        tipo: normalizarTexto(f[4]),
        motivo: normalizarTexto(f[5]),
        observacion: normalizarTexto(f[6]),
      }))
      .filter((x) => x.empleado && x.dia >= 1 && x.dia <= 31)
      .forEach((x) => detallesMapa.set(`${x.empleado}::${x.dia}`, x));

    // Compatibilidad con calendarios anteriores: al consultar Administración,
    // si todavía no existe la copia sincronizada de un supervisor, se completa
    // visualmente desde su sector propio. Las futuras ediciones quedan guardadas
    // en ambos sectores por el PUT de calendario.
    if (sector === "administracion") {
      const supervisores = usuarios.filter(
        (u) => u.activo && u.rol === "supervisor",
      );
      for (const supervisor of supervisores) {
        const nombre = supervisor.nombre || supervisor.usuario;
        const sectoresFuente = sectoresHorarioSupervisor(
          supervisor,
          sectores,
        ).filter((id) => id !== "administracion");
        for (const sectorFuente of sectoresFuente) {
          filasCalendario
            .filter(
              (f) =>
                normalizarTexto(f[0]) === sectorFuente &&
                normalizarTexto(f[1]) === mes &&
                normalizarTexto(f[2]) === nombre,
            )
            .forEach((f) => {
              const dia = Number(f[3]),
                turno = normalizarTexto(f[4]);
              const key = `${nombre}::${dia}`;
              if (
                !celdasMapa.has(key) &&
                Number.isInteger(dia) &&
                dia >= 1 &&
                dia <= 31 &&
                turno
              )
                celdasMapa.set(key, { empleado: nombre, dia, turno });
            });
          filasDetalles
            .filter(
              (f) =>
                normalizarTexto(f[0]) === sectorFuente &&
                normalizarTexto(f[1]) === mes &&
                normalizarTexto(f[2]) === nombre,
            )
            .forEach((f) => {
              const dia = Number(f[3]),
                key = `${nombre}::${dia}`;
              if (!detallesMapa.has(key) && dia >= 1 && dia <= 31)
                detallesMapa.set(key, {
                  empleado: nombre,
                  dia,
                  tipo: normalizarTexto(f[4]),
                  motivo: normalizarTexto(f[5]),
                  observacion: normalizarTexto(f[6]),
                });
            });
        }
      }
    }

    let turnos = await obtenerTurnosSector(sector);
    if (sector === "administracion") {
      const supervisores = usuarios.filter(
        (u) => u.activo && u.rol === "supervisor",
      );
      const sectoresTurnos = new Set(
        supervisores
          .flatMap((u) => sectoresHorarioSupervisor(u, sectores))
          .filter((id) => id !== "administracion"),
      );
      for (const id of sectoresTurnos) {
        const extra = await obtenerTurnosSector(id);
        const ids = new Set(turnos.map((t) => t.id));
        for (const turno of extra)
          if (!ids.has(turno.id)) {
            turnos.push(turno);
            ids.add(turno.id);
          }
      }
    }
    res.json({
      ok: true,
      sector,
      mes,
      celdas: [...celdasMapa.values()],
      detalles: [...detallesMapa.values()],
      reemplazos: [],
      turnos,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudo cargar el calendario",
    });
  }
});
app.put("/horarios/calendario", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.body?.sector),
      mes = normalizarTexto(req.body?.mes);
    if (!(await puedeModificarSectorHorarios(req.usuario, sector)))
      return res.status(403).json({
        ok: false,
        mensaje: "No tenés permiso para modificar este calendario",
      });
    if (!mesHorariosValido(mes))
      return res.status(400).json({ ok: false, mensaje: "Mes inválido" });
    const [sectores, usuarios] = await Promise.all([
      obtenerSectores(),
      obtenerUsuarios(),
    ]);
    const sec = sectores.find((s) => s.id === sector && s.activo);
    if (!sec)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Sector inexistente o inactivo" });

    const empleadosBase = empleadosHorarioDelSector(sector, usuarios, sectores);
    const empleadosPermitidos = new Set(
      empleadosBase.map((u) => u.nombre || u.usuario),
    );
    const supervisorPorNombre = new Map(
      usuarios
        .filter((u) => u.activo && u.rol === "supervisor")
        .map((u) => [u.nombre || u.usuario, u]),
    );

    let celdas = (Array.isArray(req.body?.celdas) ? req.body.celdas : [])
      .map((x) => ({
        empleado: normalizarTexto(x.empleado),
        dia: Number(x.dia),
        turno: normalizarTexto(x.turno),
      }))
      .filter(
        (x) =>
          x.empleado &&
          Number.isInteger(x.dia) &&
          x.dia >= 1 &&
          x.dia <= 31 &&
          x.turno,
      );
    let baseCeldas = (
      Array.isArray(req.body?.baseCeldas) ? req.body.baseCeldas : []
    )
      .map((x) => ({
        empleado: normalizarTexto(x.empleado),
        dia: Number(x.dia),
        turno: normalizarTexto(x.turno),
      }))
      .filter(
        (x) =>
          x.empleado &&
          Number.isInteger(x.dia) &&
          x.dia >= 1 &&
          x.dia <= 31 &&
          x.turno,
      );
    const clienteConBase = Array.isArray(req.body?.baseCeldas);
    let detalles = (Array.isArray(req.body?.detalles) ? req.body.detalles : [])
      .map((x) => ({
        empleado: normalizarTexto(x.empleado),
        dia: Number(x.dia),
        tipo: normalizarTexto(x.tipo).slice(0, 30),
        motivo: normalizarTexto(x.motivo).slice(0, 80),
        observacion: normalizarTexto(x.observacion).slice(0, 300),
      }))
      .filter(
        (x) =>
          x.empleado &&
          Number.isInteger(x.dia) &&
          x.dia >= 1 &&
          x.dia <= 31 &&
          (x.tipo || x.motivo || x.observacion),
      );

    const ultimoDiaMes = diasEnMesHorarios(mes);
    const claveCelda = (x) => `${x.empleado}::${x.dia}`;
    if (
      celdas.some((x) => x.dia > ultimoDiaMes) ||
      baseCeldas.some((x) => x.dia > ultimoDiaMes) ||
      detalles.some((x) => x.dia > ultimoDiaMes)
    )
      return res.status(400).json({
        ok: false,
        mensaje: "El calendario contiene un día que no existe en el mes seleccionado",
      });
    if (
      new Set(celdas.map(claveCelda)).size !== celdas.length ||
      new Set(baseCeldas.map(claveCelda)).size !== baseCeldas.length ||
      new Set(detalles.map(claveCelda)).size !== detalles.length
    )
      return res.status(400).json({
        ok: false,
        mensaje: "El calendario contiene registros duplicados para un mismo empleado y día",
      });

    if (
      celdas.some((x) => !empleadosPermitidos.has(x.empleado)) ||
      detalles.some((x) => !empleadosPermitidos.has(x.empleado))
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "El calendario contiene empleados que no pertenecen al sector",
      });
    }
    if (celdas.some((x) => !turnoHorarioValido(x.turno)))
      return res.status(400).json({
        ok: false,
        mensaje: "El calendario contiene un turno inválido",
      });

    await asegurarHorariosPostgres();
    await ejecutarEnCola("horarios-global", async () => {
      await conTransaccionHorarios(async (clienteHorarios) => {
      const [todasCalendarioPrevias, todosDetallesPrevios] = await Promise.all([
        listarCalendarioFilas(clienteHorarios),
        listarDetallesFilas(clienteHorarios),
      ]);
      const alcancesEscritura = new Map([
        [`${sector}||${mes}`, { sector, mes }],
      ]);
      const filasAnteriores = todasCalendarioPrevias.filter(
        (f) =>
          normalizarTexto(f[0]) === sector && normalizarTexto(f[1]) === mes,
      );
      const anterior = new Map(
        filasAnteriores.map((f) => [
          `${normalizarTexto(f[2])}::${Number(f[3])}`,
          normalizarTexto(f[4]),
        ]),
      );
      const enviado = new Map(
        celdas.map((x) => [`${x.empleado}::${x.dia}`, x.turno]),
      );
      const base = new Map(
        baseCeldas.map((x) => [`${x.empleado}::${x.dia}`, x.turno]),
      );
      const nuevoCompleto = new Map(anterior);
      const clavesModificadas = clienteConBase
        ? [...new Set([...base.keys(), ...enviado.keys()])].filter(
            (k) => (base.get(k) || "") !== (enviado.get(k) || ""),
          )
        : [...enviado.keys()];

      if (clienteConBase) {
        const conflictos = clavesModificadas.filter((k) => {
          const valorServidor = anterior.get(k) || "",
            valorBase = base.get(k) || "",
            valorCliente = enviado.get(k) || "";
          return valorServidor !== valorBase && valorServidor !== valorCliente;
        });
        if (conflictos.length) {
          const error = new Error(
            "El calendario fue modificado desde otro dispositivo. Volvé a cargarlo antes de guardar para no perder horarios.",
          );
          error.statusCode = 409;
          throw error;
        }
      }

      for (const k of clavesModificadas) {
        const valor = enviado.get(k) || "";
        if (valor) nuevoCompleto.set(k, valor);
        else nuevoCompleto.delete(k);
      }

      const ahora = fechaHoraArgentinaIso();
      const mapaFilas = new Map();
      for (const f of todasCalendarioPrevias) {
        const secId = normalizarTexto(f[0]),
          mesId = normalizarTexto(f[1]),
          emp = normalizarTexto(f[2]),
          dia = Number(f[3]);
        if (secId && mesId && emp && Number.isInteger(dia))
          mapaFilas.set(`${secId}||${mesId}||${emp}||${dia}`, f);
      }
      // Reemplaza el sector/mes editado por la versión fusionada.
      for (const key of [...mapaFilas.keys()])
        if (key.startsWith(`${sector}||${mes}||`)) mapaFilas.delete(key);
      for (const [k, turno] of nuevoCompleto.entries()) {
        const pos = k.lastIndexOf("::"),
          empleado = k.slice(0, pos),
          dia = Number(k.slice(pos + 2));
        mapaFilas.set(`${sector}||${mes}||${empleado}||${dia}`, [
          sector,
          mes,
          empleado,
          dia,
          turno,
          ahora,
          req.usuario.usuario,
          req.usuario.nombre,
        ]);
      }

      // Un supervisor tiene un único horario funcional. Todo cambio sobre su fila
      // se replica en Administración y en sus sectores propios, sin requerir una
      // segunda petición desde el navegador.
      for (const k of clavesModificadas) {
        const pos = k.lastIndexOf("::"),
          empleado = k.slice(0, pos),
          dia = Number(k.slice(pos + 2));
        const supervisor = supervisorPorNombre.get(empleado);
        if (!supervisor) continue;
        const valor = nuevoCompleto.get(k) || "";
        for (const destino of sectoresHorarioSupervisor(supervisor, sectores)) {
          alcancesEscritura.set(`${destino}||${mes}`, { sector: destino, mes });
          const claveDestino = `${destino}||${mes}||${empleado}||${dia}`;
          if (valor)
            mapaFilas.set(claveDestino, [
              destino,
              mes,
              empleado,
              dia,
              valor,
              ahora,
              req.usuario.usuario,
              req.usuario.nombre,
            ]);
          else mapaFilas.delete(claveDestino);
        }
      }

      const mapaDetalles = new Map();
      for (const f of todosDetallesPrevios) {
        const secId = normalizarTexto(f[0]),
          mesId = normalizarTexto(f[1]),
          emp = normalizarTexto(f[2]),
          dia = Number(f[3]);
        if (secId && mesId && emp && Number.isInteger(dia))
          mapaDetalles.set(`${secId}||${mesId}||${emp}||${dia}`, f);
      }
      for (const key of [...mapaDetalles.keys()])
        if (key.startsWith(`${sector}||${mes}||`)) mapaDetalles.delete(key);
      for (const x of detalles)
        mapaDetalles.set(`${sector}||${mes}||${x.empleado}||${x.dia}`, [
          sector,
          mes,
          x.empleado,
          x.dia,
          x.tipo,
          x.motivo,
          x.observacion,
          ahora,
          req.usuario.usuario,
        ]);

      // Para supervisores sincroniza también licencias/motivos/observaciones.
      const supervisoresEnSector = empleadosBase.filter(
        (u) => u.rol === "supervisor",
      );
      for (const supervisor of supervisoresEnSector) {
        const empleado = supervisor.nombre || supervisor.usuario;
        const detalleEmpleado = detalles.filter((x) => x.empleado === empleado);
        for (const destino of sectoresHorarioSupervisor(supervisor, sectores)) {
          alcancesEscritura.set(`${destino}||${mes}`, { sector: destino, mes });
          for (const key of [...mapaDetalles.keys()]) {
            if (key.startsWith(`${destino}||${mes}||${empleado}||`))
              mapaDetalles.delete(key);
          }
          for (const x of detalleEmpleado)
            mapaDetalles.set(`${destino}||${mes}||${empleado}||${x.dia}`, [
              destino,
              mes,
              empleado,
              x.dia,
              x.tipo,
              x.motivo,
              x.observacion,
              ahora,
              req.usuario.usuario,
            ]);
        }
      }

      const todas = [...mapaFilas.values()];
      const todosDetalles = [...mapaDetalles.values()];
      await reemplazarCalendarioDetallesPorAlcances(
        todas,
        todosDetalles,
        [...alcancesEscritura.values()],
        clienteHorarios,
      );

      const claves = new Set([...anterior.keys(), ...nuevoCompleto.keys()]);
      const cambios = [...claves].filter(
        (k) => (anterior.get(k) || "") !== (nuevoCompleto.get(k) || ""),
      );
      if (cambios.length) {
        const filas = cambios.map((k) => {
          const [empleado, dia] = k.split("::");
          return [
            ahora,
            req.usuario.usuario,
            req.usuario.nombre,
            req.usuario.rol,
            sec.nombre,
            mes,
            `Cambió ${empleado} día ${dia}: ${anterior.get(k) || "Sin asignar"} → ${nuevoCompleto.get(k) || "Sin asignar"}`,
          ];
        });
        await registrarAuditoriaFilas(filas, clienteHorarios);
      }
      });
    });

    await registrarAuditoriaHorario(
      req.usuario,
      sec.nombre,
      mes,
      "Guardó calendario del sector",
    );
    invalidarCache(`calendarioHorarios:${sector}:${mes}`);
    res.json({ ok: true, guardadas: celdas.length });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      ok: false,
      mensaje: e.message || "No se pudo guardar el calendario",
    });
  }
});

let hojaAuditoriaHorariosAsegurada = false;
async function asegurarHojaAuditoriaHorariosLegacy() {
  if (hojaAuditoriaHorariosAsegurada) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (
    !(meta.data.sheets || []).some(
      (h) => h.properties?.title === AUDITORIA_HORARIOS_SHEET_NAME,
    )
  ) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: { properties: { title: AUDITORIA_HORARIOS_SHEET_NAME } },
          },
        ],
      },
    });
  }
  const encabezados = [
    "Fecha y hora",
    "Usuario",
    "Nombre",
    "Rol",
    "Sector",
    "Mes",
    "Acción",
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${AUDITORIA_HORARIOS_SHEET_NAME}!A1:G1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [encabezados] },
  });
  hojaAuditoriaHorariosAsegurada = true;
}
app.get("/horarios/contexto", requerirAccesoHorarios, async (req, res) => {
  try {
    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    const [sectores, usuarios] = await Promise.all([
      obtenerSectores(),
      obtenerUsuarios(),
    ]);
    const activos = sectores.filter((s) => s.activo);
    if (!rolGestionSector(req.usuario) && !req.usuario.sector)
      return res
        .status(403)
        .json({ ok: false, mensaje: "Tu usuario no tiene un sector asignado" });

    const sectoresSupervisor =
      req.usuario.rol === "supervisor"
        ? await sectoresSupervisorPermitidos(req.usuario)
        : new Set();

    const visibles =
      rolGestionGlobal(req.usuario) || req.usuario.rol === "supervisor"
        ? activos
        : activos.filter(
            (s) => s.id === req.usuario.sector || s.id === "administracion",
          );

    if (!visibles.length)
      return res
        .status(403)
        .json({ ok: false, mensaje: "No tenés acceso a un sector activo" });

    await asegurarHorariosPostgres();
    const filasOrden = await listarOrdenFilas();
    const ordenPorSector = new Map();
    const habilitadosPorSector = new Map();
    filasOrden.forEach((f) => {
      const sec = normalizarTexto(f[0]),
        emp = normalizarTexto(f[1]),
        ord = Number(f[2]);
      if (!sec || !emp) return;
      if (Number.isFinite(ord)) {
        if (!ordenPorSector.has(sec)) ordenPorSector.set(sec, new Map());
        ordenPorSector.get(sec).set(emp, ord);
      }
      if (!habilitadosPorSector.has(sec)) habilitadosPorSector.set(sec, new Map());
      habilitadosPorSector.get(sec).set(emp, habilitadoCalendarioHorarios(f[4]));
    });

    const respuesta = visibles.map((s) => {
      const empleadosSector = empleadosHorarioDelSector(
        s.id,
        usuarios,
        activos,
      ).sort((a, b) => {
        const mapa = ordenPorSector.get(s.id);
        const an = a.nombre || a.usuario,
          bn = b.nombre || b.usuario;
        const ao = mapa?.get(an),
          bo = mapa?.get(bn);
        if (Number.isFinite(ao) || Number.isFinite(bo))
          return (
            (Number.isFinite(ao) ? ao : 9999) -
            (Number.isFinite(bo) ? bo : 9999)
          );
        return String(an).localeCompare(String(bn), "es", {
          sensitivity: "base",
        });
      });
      const habilitados = habilitadosPorSector.get(s.id);
      const personalConfig = empleadosSector.map((u) => {
        const nombre = u.nombre || u.usuario;
        return {
          nombre,
          rol: u.rol,
          usuario: u.usuario,
          habilitadoCalendario: habilitados?.get(nombre) !== false,
        };
      });
      return {
        id: s.id,
        nombre: s.nombre,
        color: s.color,
        activo: s.activo,
        puedeEditar:
          rolGestionGlobal(req.usuario) ||
          (req.usuario.rol === "supervisor" && sectoresSupervisor.has(s.id)),
        empleados: personalConfig
          .filter((u) => u.habilitadoCalendario)
          .map((u) => u.nombre),
        empleadosConfiguracion: personalConfig.map((u) => u.nombre),
        empleadosInfo: personalConfig,
      };
    });

    res.json({
      ok: true,
      sectores: respuesta,
      sectorUsuario: req.usuario.sector || "",
      puedeEditar: rolGestionSector(req.usuario),
      rol: req.usuario.rol,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo cargar el contexto de horarios",
    });
  }
});

app.get("/horarios/orden", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.query.sector);
    if (!(await puedeAccederSectorHorarios(req.usuario, sector)))
      return res
        .status(403)
        .json({ ok: false, mensaje: "No tenés acceso a ese sector" });
    await asegurarHorariosPostgres();
    const filasOrden = await listarOrdenFilas();
    const orden = filasOrden
      .filter((f) => normalizarTexto(f[0]) === sector)
      .sort((a, b) => Number(a[2]) - Number(b[2]))
      .map((f) => normalizarTexto(f[1]))
      .filter(Boolean);
    res.json({ ok: true, sector, orden });
  } catch (e) {
    res
      .status(500)
      .json({ ok: false, mensaje: e.message || "No se pudo cargar el orden" });
  }
});
app.put("/horarios/orden", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    if (!(await puedeModificarSectorHorarios(req.usuario, sector)))
      return res.status(403).json({
        ok: false,
        mensaje: "No tenés permiso para ordenar el personal de este sector",
      });
    const orden = (Array.isArray(req.body?.orden) ? req.body.orden : [])
      .map(normalizarTexto)
      .filter(Boolean);
    if (!orden.length || new Set(orden).size !== orden.length)
      return res
        .status(400)
        .json({ ok: false, mensaje: "Orden de personal inválido" });
    const sectores = await obtenerSectores(),
      usuarios = await obtenerUsuarios(),
      sec = sectores.find((s) => s.id === sector && s.activo);
    if (!sec)
      return res.status(404).json({ ok: false, mensaje: "Sector inexistente" });
    const permitidos = new Set(
      empleadosHorarioDelSector(sector, usuarios, sectores).map(
        (u) => u.nombre || u.usuario,
      ),
    );
    if (
      orden.some((x) => !permitidos.has(x)) ||
      orden.length !== permitidos.size
    )
      return res.status(400).json({
        ok: false,
        mensaje: "El orden debe incluir una vez a todo el personal del sector",
      });
    await asegurarHorariosPostgres();
    await ejecutarEnCola("horarios-global", async () => {
      await conTransaccionHorarios(async (clienteHorarios) => {
        const filasPrevias = await listarOrdenFilas(clienteHorarios);
        const habilitadoPrevio = new Map(
          filasPrevias
            .filter((f) => normalizarTexto(f[0]) === sector)
            .map((f) => [normalizarTexto(f[1]), f[4] || "Sí"]),
        );
        const ahora = fechaHoraArgentinaIso();
        const nuevas = orden.map((e, i) => [
          sector,
          e,
          i + 1,
          ahora,
          habilitadoPrevio.get(e) || "Sí",
        ]);
        await reemplazarOrdenSector(sector, nuevas, clienteHorarios);
      });
    });
    res.json({ ok: true, sector, orden });
  } catch (e) {
    res
      .status(500)
      .json({ ok: false, mensaje: e.message || "No se pudo guardar el orden" });
  }
});

app.put("/horarios/personal-visibilidad", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    const empleado = normalizarTexto(req.body?.empleado);
    const habilitado = req.body?.habilitado !== false;
    if (!(await puedeModificarSectorHorarios(req.usuario, sector)))
      return res.status(403).json({
        ok: false,
        mensaje: "No tenés permiso para modificar el personal de este sector",
      });
    if (!empleado)
      return res.status(400).json({ ok: false, mensaje: "Empleado inválido" });

    const [sectores, usuarios] = await Promise.all([obtenerSectores(), obtenerUsuarios()]);
    const permitidos = empleadosHorarioDelSector(sector, usuarios, sectores).map(
      (u) => u.nombre || u.usuario,
    );
    if (!permitidos.includes(empleado))
      return res.status(400).json({
        ok: false,
        mensaje: "El usuario no pertenece al sector seleccionado",
      });

    await asegurarHorariosPostgres();
    await ejecutarEnCola("horarios-global", async () => {
      await guardarVisibilidadOrden(sector, empleado, habilitado, fechaHoraArgentinaIso());
    });

    res.json({ ok: true, sector, empleado, habilitado });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudo actualizar la visibilidad del usuario",
    });
  }
});

app.post("/horarios/auditoria", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    if (!(await puedeModificarSectorHorarios(req.usuario, sector)))
      return res.status(403).json({
        ok: false,
        mensaje:
          "Solo Administración, Administrador o el Supervisor asignado pueden modificar este sector",
      });
    if (!rolGestionSector(req.usuario))
      return res.status(403).json({
        ok: false,
        mensaje: "Tu usuario tiene acceso de solo lectura",
      });
    const sectores = await obtenerSectores();
    const sectorEncontrado = sectores.find((s) => s.id === sector && s.activo);
    if (!sectorEncontrado)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Sector inexistente o inactivo" });
    await asegurarHorariosPostgres();
    const mes = normalizarTexto(req.body?.mes).slice(0, 80);
    const accion = normalizarTexto(req.body?.accion || "Guardó cambios").slice(
      0,
      120,
    );
    await registrarAuditoriaFilas([[fechaHoraArgentinaIso(), req.usuario.usuario, req.usuario.nombre, req.usuario.rol, sectorEncontrado.nombre, mes, accion]]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo registrar la auditoría",
    });
  }
});
async function actualizarFilaUsuario(usuario, cambios = {}) {
  const rol = cambios.rol ?? usuario.rol;
  await guardarUsuarioDb({
    ...usuario,
    nombre: cambios.nombre ?? usuario.nombre,
    passwordHash: cambios.passwordHash ?? usuario.passwordHash,
    rol,
    activo: cambios.activo ?? usuario.activo,
    permisos: cambios.permisos ?? usuario.permisos,
    sector: cambios.sector ?? (usuario.sector || ""),
    sectores: cambios.sectores ?? (usuario.sectores || []),
    googleEmail: normalizarEmail(cambios.googleEmail ?? usuario.googleEmail),
  });
  invalidarCache("usuarios");
}

async function actualizarFilaSector(sector, cambios = {}) {
  await guardarSectorDb({
    ...sector,
    nombre: cambios.nombre ?? sector.nombre,
    color: cambios.color ?? sector.color,
    supervisor: cambios.supervisor ?? sector.supervisor ?? "",
    activo: cambios.activo ?? sector.activo,
  });
  invalidarCache("sectores");
}

async function reconciliarSupervisorAnterior(
  usuarioClave,
  sectorPreferido = "",
) {
  const clave = normalizarUsuario(usuarioClave);
  if (!clave) return;
  invalidarCache("usuarios", "sectores");
  const [usuarios, sectores] = await Promise.all([
    obtenerUsuarios(),
    obtenerSectores(),
  ]);
  const usuario = usuarios.find((u) => u.usuario === clave);
  if (!usuario || usuario.rol === "administrador") return;
  const asignados = sectores
    .filter((s) => s.supervisor === clave && s.activo)
    .map((s) => s.id)
    .slice(0, 2);
  if (!asignados.length && usuario.rol === "supervisor")
    await actualizarFilaUsuario(usuario, {
      rol: "personal",
      sector: sectorPreferido || usuario.sector || "",
      sectores: [],
    });
  else if (usuario.rol === "supervisor")
    await actualizarFilaUsuario(usuario, {
      sector: asignados[0] || "",
      sectores: asignados,
    });
  invalidarCache("usuarios");
}

async function asignarSupervisorASector(usuarioClave, sectorId) {
  const clave = normalizarUsuario(usuarioClave);
  if (!clave) return;
  const [usuarios, sectores] = await Promise.all([
    obtenerUsuarios(),
    obtenerSectores(),
  ]);
  const usuario = usuarios.find((u) => u.usuario === clave),
    sector = sectores.find((s) => s.id === sectorId);
  if (!usuario) throw new Error("El supervisor seleccionado no existe");
  if (!usuario.activo || usuario.rol !== "supervisor")
    throw new Error("Solo podés asignar usuarios activos con rol Supervisor");
  if (!sector || !sector.activo)
    throw new Error("El sector seleccionado no existe o está inactivo");
  const actuales = sectores.filter(
    (s) => s.supervisor === clave && s.id !== sectorId,
  );
  if (actuales.length >= 2)
    throw new Error("Este supervisor ya tiene dos sectores asignados");
  const anterior = normalizarUsuario(sector.supervisor);
  if (anterior && anterior !== clave)
    await reconciliarSupervisorAnterior(anterior, sector.id);
  const ids = [
    ...new Set(
      [
        usuario.sector,
        ...(usuario.sectores || []),
        ...actuales.map((s) => s.id),
        sectorId,
      ].filter(Boolean),
    ),
  ].slice(0, 2);
  await actualizarFilaUsuario(usuario, {
    rol: "supervisor",
    sector: ids[0] || sectorId,
    sectores: ids,
  });
  invalidarCache("usuarios");
}

async function sincronizarUsuarioSupervisor(
  usuarioClave,
  rol,
  sectorId,
  activo = true,
  sectoresSolicitados = [],
) {
  const clave = normalizarUsuario(usuarioClave);
  const sectores = await obtenerSectores();
  const actuales = sectores.filter((s) => s.supervisor === clave);
  if (rol !== "supervisor") {
    for (const s of actuales) await actualizarFilaSector(s, { supervisor: "" });
    return;
  }
  if (!activo) throw new Error("Un usuario inactivo no puede ser supervisor");
  const ids = [
    ...new Set(
      [sectorId, ...sectoresSolicitados].map(normalizarTexto).filter(Boolean),
    ),
  ];
  if (!ids.length) throw new Error("Asigná al menos un sector al supervisor");
  if (ids.length > 2)
    throw new Error("Un supervisor puede tener como máximo dos sectores");
  for (const id of ids) {
    const destino = sectores.find((s) => s.id === id && s.activo);
    if (!destino)
      throw new Error(
        "Uno de los sectores seleccionados no existe o está inactivo",
      );
  }
  for (const s of actuales.filter((s) => !ids.includes(s.id)))
    await actualizarFilaSector(s, { supervisor: "" });
  for (const id of ids) {
    const destino = sectores.find((s) => s.id === id);
    const previo = normalizarUsuario(destino.supervisor);
    await actualizarFilaSector(destino, { supervisor: clave });
    if (previo && previo !== clave)
      await reconciliarSupervisorAnterior(previo, destino.id);
  }
}

async function sincronizarSectorSupervisor(sector, nuevoSupervisor) {
  const anterior = normalizarUsuario(sector.supervisor),
    nuevo = normalizarUsuario(nuevoSupervisor);
  if (nuevo) await asignarSupervisorASector(nuevo, sector.id);
  await actualizarFilaSector(sector, { supervisor: nuevo });
  if (anterior && anterior !== nuevo)
    await reconciliarSupervisorAnterior(anterior, sector.id);
  invalidarCache("usuarios", "sectores");
}

app.get("/admin/sectores", requerirAdministrador, async (req, res) => {
  try {
    res.json({ ok: true, sectores: await obtenerSectores() });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudieron cargar los sectores",
    });
  }
});

app.post("/admin/sectores", requerirAdministrador, async (req, res) => {
  try {
    const nombre = normalizarTexto(req.body?.nombre),
      id = idSector(nombre);
    if (!nombre || !id)
      return res
        .status(400)
        .json({ ok: false, mensaje: "Ingresá un nombre válido" });
    const ss = await obtenerSectores();
    if (
      ss.some(
        (s) => s.id === id || s.nombre.toLowerCase() === nombre.toLowerCase(),
      )
    )
      return res
        .status(409)
        .json({ ok: false, mensaje: "Ese sector ya existe" });
    const color = /^#[0-9a-f]{6}$/i.test(req.body?.color || "")
      ? req.body.color
      : "#b72e35";
    const supervisor = normalizarUsuario(req.body?.supervisor);
    await guardarSectorDb({ id, nombre, color, supervisor: "", activo: true });
    invalidarCache("sectores");
    const creado = (await obtenerSectores()).find((s) => s.id === id);
    if (supervisor && creado)
      await sincronizarSectorSupervisor(creado, supervisor);
    invalidarCache("usuarios", "sectores");
    await registrarHistorialAdministracion(req, "Creó sector", "Sector", nombre, `Supervisor: ${supervisor || "Sin asignar"}`);
    res.json({
      ok: true,
      sector: { id, nombre, color, supervisor, activo: true },
    });
  } catch (e) {
    res
      .status(500)
      .json({ ok: false, mensaje: e.message || "No se pudo crear el sector" });
  }
});

app.put("/admin/sectores/:id", requerirAdministrador, async (req, res) => {
  try {
    const ss = await obtenerSectores(),
      s = ss.find((x) => x.id === normalizarTexto(req.params.id));
    if (!s)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Sector no encontrado" });
    const nombre = normalizarTexto(req.body?.nombre) || s.nombre;
    const color = /^#[0-9a-f]{6}$/i.test(req.body?.color || "")
      ? req.body.color
      : s.color;
    const supervisor = normalizarUsuario(req.body?.supervisor);
    const activo =
      req.body?.activo === undefined ? s.activo : Boolean(req.body.activo);
    if (!activo && supervisor)
      return res.status(400).json({
        ok: false,
        mensaje: "Un sector inactivo no puede conservar supervisor",
      });
    await actualizarFilaSector(s, {
      nombre,
      color,
      activo,
      supervisor: s.supervisor,
    });
    await sincronizarSectorSupervisor(
      { ...s, nombre, color, activo },
      supervisor,
    );
    invalidarCache("sectores", "usuarios");
    await registrarHistorialAdministracion(req, "Editó sector", "Sector", nombre, `Supervisor: ${supervisor || "Sin asignar"} · Estado: ${activo ? "Activo" : "Inactivo"}`);
    res.json({
      ok: true,
      sector: { id: s.id, nombre, color, supervisor, activo },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudo actualizar el sector",
    });
  }
});

let hojaTareasAsegurada = false;
async function asegurarHojaTareas() {
  if (hojaTareasAsegurada) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (
    !(meta.data.sheets || []).some(
      (h) => h.properties?.title === TAREAS_SHEET_NAME,
    )
  ) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAREAS_SHEET_NAME } } }],
      },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAREAS_SHEET_NAME}!A1:I1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          "ID",
          "Sector",
          "Nombre",
          "Duración",
          "Activo",
          "Asignaciones",
          "Actualizado",
          "Actualizado por",
          "Días semana",
        ],
      ],
    },
  });
  hojaTareasAsegurada = true;
}
function normalizarTareaServidor(t) {
  const asignaciones =
    t?.asignaciones && typeof t.asignaciones === "object" ? t.asignaciones : {};
  return {
    id: normalizarTexto(t?.id) || crypto.randomUUID(),
    sector: normalizarTexto(t?.sector) || "General",
    nombre: normalizarTexto(t?.nombre) || "Tarea",
    duracionMin: Math.max(
      1,
      Math.min(480, Number(t?.duracionMin || t?.duracion || 10)),
    ),
    diasSemana: (() => {
      const dias = Array.isArray(t?.diasSemana)
        ? t.diasSemana
            .map(Number)
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : [];
      return dias.length ? [...new Set(dias)] : [0, 1, 2, 3, 4, 5, 6];
    })(),
    activo: t?.activo !== false,
    asignaciones,
  };
}
function fusionarAsignacionesServidor(base = {}, entrada = {}) {
  const salida = JSON.parse(JSON.stringify(base || {}));
  for (const [fecha, turnos] of Object.entries(entrada || {})) {
    salida[fecha] = salida[fecha] || {};
    for (const [turno, asignacion] of Object.entries(turnos || {})) {
      if (asignacion == null) delete salida[fecha][turno];
      else
        salida[fecha][turno] = {
          ...(salida[fecha][turno] || {}),
          ...asignacion,
        };
    }
    if (!Object.keys(salida[fecha]).length) delete salida[fecha];
  }
  return salida;
}
function fusionarTareaServidor(actual, entrante) {
  const a = normalizarTareaServidor(actual || {}),
    e = normalizarTareaServidor(entrante || {});
  return {
    ...a,
    ...e,
    asignaciones: fusionarAsignacionesServidor(a.asignaciones, e.asignaciones),
  };
}
async function asegurarHojaBano() {
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (
    !(meta.data.sheets || []).some(
      (h) => h.properties?.title === TAREAS_BANO_SHEET_NAME,
    )
  ) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: TAREAS_BANO_SHEET_NAME } } },
        ],
      },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAREAS_BANO_SHEET_NAME}!A1:D1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["Clave", "Datos", "Actualizado", "Actualizado por"]],
    },
  });
}
async function leerBanoLegacy() {
  await asegurarHojaBano();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAREAS_BANO_SHEET_NAME}!A:D`,
  });
  const filas = (r.data.values || []).slice(1);
  const mapa = new Map(filas.map((f) => [f[0], f]));
  let config = {
    participantes: [],
    fechaAncla: new Date().toISOString().slice(0, 10),
    historial: [],
  };
  try {
    if (mapa.get("config")?.[1])
      config = { ...config, ...JSON.parse(mapa.get("config")[1]) };
  } catch {}
  try {
    if (mapa.get("historial")?.[1])
      config.historial = JSON.parse(mapa.get("historial")[1]) || [];
  } catch {}
  config.participantes = Array.isArray(config.participantes)
    ? config.participantes
    : [];
  config.historial = Array.isArray(config.historial) ? config.historial : [];
  config.actualizadoTexto = normalizarTexto(mapa.get("config")?.[2]);
  config.actualizadoPor = normalizarUsuario(mapa.get("config")?.[3]);
  return config;
}

async function obtenerTareasLegacy() {
  await asegurarHojaTareas();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAREAS_SHEET_NAME}!A:I`,
  });
  return (r.data.values || []).slice(1).filter((f) => f[0]).map((f) => {
    let asignaciones = {};
    try { asignaciones = JSON.parse(f[5] || "{}"); } catch {}
    let diasSemana = [];
    try { diasSemana = JSON.parse(f[8] || "[]"); } catch {}
    return {
      ...normalizarTareaServidor({
        id: f[0],
        sector: f[1],
        nombre: f[2],
        duracionMin: Number(f[3]),
        activo: !["no", "false", "0", "inactivo"].includes(normalizarTexto(f[4]).toLowerCase()),
        asignaciones,
        diasSemana,
      }),
      actualizadoTexto: normalizarTexto(f[6]),
      actualizadoPor: normalizarUsuario(f[7]),
    };
  });
}

const MIGRACION_TAREAS_BANO = "2026-08-28-tareas-bano-v1";
let promesaTareasBanoPostgres = null;
async function asegurarTareasBanoPostgres() {
  await asegurarEsquemaUsuariosSectores();
  await asegurarEsquemaTareasBano();
  if (await migracionDatosCompletada(MIGRACION_TAREAS_BANO)) return;
  if (promesaTareasBanoPostgres) return promesaTareasBanoPostgres;
  promesaTareasBanoPostgres = (async () => {
    if (await migracionDatosCompletada(MIGRACION_TAREAS_BANO)) return;
    // Importación inicial de solo lectura: Sheets queda como respaldo histórico.
    const [tareas, bano] = await Promise.all([obtenerTareasLegacy(), leerBanoLegacy()]);
    const importado = await importarTareasBanoAtomico({ tareas, bano }, MIGRACION_TAREAS_BANO);
    if (importado) {
      console.log(`PostgreSQL Etapa 4: Tareas y Baño importados desde Sheets (${tareas.length} tareas, ${(bano.historial || []).length} confirmaciones).`);
    }
  })();
  try { await promesaTareasBanoPostgres; }
  finally { promesaTareasBanoPostgres = null; }
}

async function obtenerTareasServidor(cliente = null) {
  await asegurarTareasBanoPostgres();
  return listarTareasDb(cliente);
}

async function guardarTareasServidor(tareas, usuario, cliente = null) {
  await asegurarTareasBanoPostgres();
  const actualizadoTexto = fechaHoraArgentinaIso();
  const actualizadoPor = usuario?.usuario || "";
  await reemplazarTareasDb((tareas || []).map(normalizarTareaServidor), actualizadoTexto, actualizadoPor, cliente);
  invalidarCache("tareas");
}

async function leerBanoServidor(cliente = null) {
  await asegurarTareasBanoPostgres();
  return leerBanoDb(cliente);
}

function fechaIsoUtcMasDias(fechaIso, dias) {
  const m = normalizarTexto(fechaIso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

function diasEntreIso(fechaA, fechaB) {
  const a = Date.parse(`${normalizarTexto(fechaA)}T00:00:00Z`);
  const b = Date.parse(`${normalizarTexto(fechaB)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86400000);
}

function completarHistorialBano(config, hastaFecha = fechaArgentina()) {
  const participantes = Array.isArray(config?.participantes)
    ? config.participantes.map(normalizarTexto).filter(Boolean)
    : [];
  const fechaAncla = normalizarTexto(config?.fechaAncla);
  const historialExistente = Array.isArray(config?.historial) ? config.historial : [];
  const mapa = new Map(historialExistente.map((x) => [normalizarTexto(x?.fecha), { ...x }]));
  const distancia = diasEntreIso(fechaAncla, hastaFecha);
  if (!participantes.length || distancia === null || distancia < 0)
    return historialExistente.slice().sort((a, b) => normalizarTexto(b?.fecha).localeCompare(normalizarTexto(a?.fecha)));

  for (let offset = 0; offset <= distancia; offset += 2) {
    const fecha = fechaIsoUtcMasDias(fechaAncla, offset);
    if (!fecha) continue;
    const turno = Math.floor(offset / 2);
    const responsable = participantes[turno % participantes.length] || "";
    const existente = mapa.get(fecha) || { fecha };
    if (!normalizarTexto(existente.responsable)) existente.responsable = responsable;
    mapa.set(fecha, existente);
  }
  return [...mapa.values()]
    .filter((x) => normalizarTexto(x?.fecha))
    .sort((a, b) => normalizarTexto(b?.fecha).localeCompare(normalizarTexto(a?.fecha)));
}

function participantesOrdenFijo(actuales, solicitados) {
  const actualesLimpios = [...new Set((actuales || []).map(normalizarTexto).filter(Boolean))];
  const solicitadosLimpios = [...new Set((solicitados || []).map(normalizarTexto).filter(Boolean))];
  const deseados = new Set(solicitadosLimpios);
  const resultado = actualesLimpios.filter((x) => deseados.has(x));
  const ya = new Set(resultado);
  for (const participante of solicitadosLimpios) {
    if (!ya.has(participante)) {
      resultado.push(participante);
      ya.add(participante);
    }
  }
  return resultado;
}

function fechaAnclaParaConservarTurno(actual, participantesNuevos, hoy = fechaArgentina()) {
  const anteriores = Array.isArray(actual?.participantes)
    ? actual.participantes.map(normalizarTexto).filter(Boolean)
    : [];
  const nuevos = Array.isArray(participantesNuevos)
    ? participantesNuevos.map(normalizarTexto).filter(Boolean)
    : [];
  const anclaActual = normalizarTexto(actual?.fechaAncla);
  if (!anteriores.length || !nuevos.length || !anclaActual) return anclaActual || hoy;
  if (anteriores.length === nuevos.length && anteriores.every((x, i) => x === nuevos[i]))
    return anclaActual;

  const dias = diasEntreIso(anclaActual, hoy);
  if (dias === null) return anclaActual;
  let fechaTurno = hoy;
  let offsetTurno;
  if (dias < 0) {
    fechaTurno = anclaActual;
    offsetTurno = 0;
  } else {
    const resto = ((dias % 2) + 2) % 2;
    fechaTurno = resto === 0 ? hoy : fechaIsoUtcMasDias(hoy, 1);
    offsetTurno = Math.floor((dias + (resto === 0 ? 0 : 1)) / 2);
  }
  const indiceViejo = ((offsetTurno % anteriores.length) + anteriores.length) % anteriores.length;
  const permitidos = new Set(nuevos);
  let objetivo = "";
  for (let salto = 0; salto < anteriores.length; salto++) {
    const candidato = anteriores[(indiceViejo + salto) % anteriores.length];
    if (permitidos.has(candidato)) {
      objetivo = candidato;
      break;
    }
  }
  if (!objetivo) objetivo = nuevos[0];
  const indiceNuevo = Math.max(0, nuevos.indexOf(objetivo));
  return fechaIsoUtcMasDias(fechaTurno, -(indiceNuevo * 2)) || anclaActual;
}

async function guardarBanoServidor(config, usuario, cliente = null) {
  await asegurarTareasBanoPostgres();
  const limpio = {
    participantes: [...new Set((config?.participantes || []).map(normalizarTexto).filter(Boolean))],
    fechaAncla: normalizarTexto(config?.fechaAncla) || new Date().toISOString().slice(0, 10),
    historial: completarHistorialBano(config),
  };
  return guardarBanoDb(limpio, fechaHoraArgentinaIso(), usuario?.usuario || "", cliente);
}

function normalizarIdentidadBano(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function usuarioCoincideResponsableBano(registro, usuario) {
  const responsable = normalizarIdentidadBano(registro?.responsable);
  if (!responsable) return false;
  return [usuario?.usuario, usuario?.nombre]
    .map(normalizarIdentidadBano)
    .filter(Boolean)
    .includes(responsable);
}

function usuarioCoincideConfirmacionBano(registro, usuario) {
  const confirmador = normalizarIdentidadBano(registro?.usuario);
  if (!confirmador) return false;
  return [usuario?.usuario, usuario?.nombre]
    .map(normalizarIdentidadBano)
    .filter(Boolean)
    .includes(confirmador);
}

async function sectoresTareasPermitidos(usuario) {
  const sectores = (await obtenerSectores()).filter((s) => s.activo);
  if (rolGestionGlobal(usuario)) return sectores;
  if (usuario.rol === "supervisor") {
    const ids = new Set(
      [usuario.sector, ...(usuario.sectores || [])].filter(Boolean),
    );
    sectores
      .filter(
        (s) =>
          normalizarUsuario(s.supervisor) ===
          normalizarUsuario(usuario.usuario),
      )
      .forEach((s) => ids.add(s.id));
    return sectores.filter((s) => ids.has(s.id));
  }
  return sectores.filter((s) => s.id === usuario.sector);
}
app.get("/tareas/contexto", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    const sectores = await sectoresTareasPermitidos(req.usuario);
    res.json({
      ok: true,
      rol: req.usuario.rol,
      sectores: sectores.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        color: s.color,
      })),
      puedeAsignar: rolGestionSector(req.usuario),
      puedeConfigurar: rolGestionSector(req.usuario),
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudo cargar el contexto de tareas",
    });
  }
});

app.get("/tareas", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    const [tareas, sectores] = await Promise.all([
      obtenerTareasServidor(),
      sectoresTareasPermitidos(req.usuario),
    ]);
    const permitidos = new Set(
      sectores.flatMap((s) => [
        normalizarTexto(s.id),
        normalizarTexto(s.nombre),
      ]),
    );
    // Las tareas pertenecen al sector: todo usuario activo del sector puede verlas,
    // aunque la asignación indique otro responsable. Los permisos de edición se
    // siguen resolviendo por rol en /tareas/contexto y en los endpoints de escritura.
    const visibles = tareas.filter((t) =>
      permitidos.has(normalizarTexto(t.sector)),
    );
    res.json({ ok: true, tareas: visibles });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudieron cargar las tareas",
    });
  }
});

app.put("/tareas", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    if (!rolGestionSector(req.usuario))
      return res
        .status(403)
        .json({ ok: false, mensaje: "No tenés permiso para modificar tareas" });
    const entrantes = Array.isArray(req.body?.tareas)
      ? req.body.tareas.map(normalizarTareaServidor)
      : [];
    const eliminadas = new Set(
      (Array.isArray(req.body?.deletedIds) ? req.body.deletedIds : [])
        .map(normalizarTexto)
        .filter(Boolean),
    );
    const sectores = await sectoresTareasPermitidos(req.usuario);
    const permitidos = new Set(
      sectores.flatMap((s) => [
        normalizarTexto(s.id),
        normalizarTexto(s.nombre),
      ]),
    );
    const puedeSector = (t) =>
      rolGestionGlobal(req.usuario) ||
      permitidos.has(normalizarTexto(t.sector));
    const visibles = await conTransaccionTareasBano(async (cliente) => {
      const actuales = await obtenerTareasServidor(cliente);
      const mapa = new Map(
        actuales
          .filter((t) => !(eliminadas.has(t.id) && puedeSector(t)))
          .map((t) => [t.id, t]),
      );
      for (const tarea of entrantes) {
        if (!puedeSector(tarea)) continue;
        mapa.set(
          tarea.id,
          mapa.has(tarea.id)
            ? fusionarTareaServidor(mapa.get(tarea.id), tarea)
            : tarea,
        );
      }
      const fusion = [...mapa.values()];
      await guardarTareasServidor(fusion, req.usuario, cliente);
      return rolGestionGlobal(req.usuario)
        ? fusion
        : fusion.filter((t) => permitidos.has(normalizarTexto(t.sector)));
    });
    res.json({ ok: true, tareas: visibles });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudieron guardar las tareas",
    });
  }
});

app.post("/tareas/asignacion", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    if (!rolGestionSector(req.usuario))
      return res
        .status(403)
        .json({ ok: false, mensaje: "No tenés permiso para asignar tareas" });
    const id = normalizarTexto(req.body?.id),
      fecha = normalizarTexto(req.body?.fecha),
      turno = normalizarTexto(req.body?.turno);
    if (!fecha || !["manana", "tarde"].includes(turno))
      return res
        .status(400)
        .json({ ok: false, mensaje: "Asignación inválida" });
    const sectores = await sectoresTareasPermitidos(req.usuario),
      permitidos = new Set(
        sectores.flatMap((s) => [
          normalizarTexto(s.id),
          normalizarTexto(s.nombre),
        ]),
      );
    const asignacion = await conTransaccionTareasBano(async (cliente) => {
      const tareas = await obtenerTareasServidor(cliente),
        tarea = tareas.find((t) => t.id === id);
      if (!tarea) {
        const error = new Error("Asignación inválida");
        error.statusCode = 400;
        throw error;
      }
      if (
        !rolGestionGlobal(req.usuario) &&
        !permitidos.has(normalizarTexto(tarea.sector))
      ) {
        const error = new Error("No tenés permiso para este sector");
        error.statusCode = 403;
        throw error;
      }
      tarea.asignaciones = tarea.asignaciones || {};
      tarea.asignaciones[fecha] = tarea.asignaciones[fecha] || {};
      const asignacionAnterior = tarea.asignaciones[fecha][turno] || {};
      const responsables = [
        ...new Set(
          (req.body?.responsables || []).map(normalizarTexto).filter(Boolean),
        ),
      ];
      tarea.asignaciones[fecha][turno] = {
        ...asignacionAnterior,
        responsables,
        estado: normalizarTexto(req.body?.estado) || "pendiente",
        completadaPor: "",
        completadaHora: "",
      };
      await guardarTareasServidor(tareas, req.usuario, cliente);
      return tarea.asignaciones[fecha][turno];
    });
    res.json({ ok: true, asignacion });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      ok: false,
      mensaje: e.message || "No se pudo guardar la asignación",
    });
  }
});

app.post("/tareas/asignaciones-lote", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    if (!rolGestionSector(req.usuario))
      return res
        .status(403)
        .json({ ok: false, mensaje: "No tenés permiso para asignar tareas" });
    const ids = [
        ...new Set(
          (Array.isArray(req.body?.ids) ? req.body.ids : [])
            .map(normalizarTexto)
            .filter(Boolean),
        ),
      ],
      fecha = normalizarTexto(req.body?.fecha),
      turno = normalizarTexto(req.body?.turno),
      responsable = normalizarTexto(req.body?.responsable),
      reemplazar = Boolean(req.body?.reemplazar);
    if (
      (!ids.length && !reemplazar) ||
      !fecha ||
      !["manana", "tarde"].includes(turno) ||
      !responsable
    )
      return res
        .status(400)
        .json({ ok: false, mensaje: "Asignación incompleta" });
    const sectores = await sectoresTareasPermitidos(req.usuario),
      permitidos = new Set(
        sectores.flatMap((s) => [
          normalizarTexto(s.id),
          normalizarTexto(s.nombre),
        ]),
      );
    const resultado = await conTransaccionTareasBano(async (cliente) => {
      const tareas = await obtenerTareasServidor(cliente);
      const seleccionadas = tareas.filter((t) => ids.includes(t.id));
      if (seleccionadas.length !== ids.length) {
        const error = new Error("Una o más tareas no existen");
        error.statusCode = 404;
        throw error;
      }
      if (
        seleccionadas.some(
          (t) =>
            !rolGestionGlobal(req.usuario) &&
            !permitidos.has(normalizarTexto(t.sector)),
        )
      ) {
        const error = new Error("No tenés permiso para una de las tareas");
        error.statusCode = 403;
        throw error;
      }
      if (reemplazar) {
        for (const tarea of tareas) {
          const asig = tarea.asignaciones?.[fecha]?.[turno];
          if (!asig) continue;
          const restantes = (asig.responsables || [])
            .map(normalizarTexto)
            .filter(
              (r) => r && normalizarUsuario(r) !== normalizarUsuario(responsable),
            );
          if (restantes.length) asig.responsables = [...new Set(restantes)];
          else {
            delete tarea.asignaciones[fecha][turno];
            if (!Object.keys(tarea.asignaciones[fecha]).length)
              delete tarea.asignaciones[fecha];
          }
        }
      }
      for (const tarea of seleccionadas) {
        tarea.asignaciones = tarea.asignaciones || {};
        tarea.asignaciones[fecha] = tarea.asignaciones[fecha] || {};
        const anterior = tarea.asignaciones[fecha][turno] || {};
        const responsables = [
          ...new Set([
            ...(anterior.responsables || []).map(normalizarTexto).filter(Boolean),
            responsable,
          ]),
        ];
        tarea.asignaciones[fecha][turno] = {
          ...anterior,
          responsables,
          estado: anterior.estado || "pendiente",
          completadaPor: anterior.completadaPor || "",
          completadaHora: anterior.completadaHora || "",
        };
      }
      await guardarTareasServidor(tareas, req.usuario, cliente);
      const visibles = rolGestionGlobal(req.usuario)
        ? tareas
        : tareas.filter((t) => permitidos.has(normalizarTexto(t.sector)));
      return { asignadas: seleccionadas.length, tareas: visibles };
    });
    res.json({
      ok: true,
      asignadas: resultado.asignadas,
      responsable,
      tareas: resultado.tareas,
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      ok: false,
      mensaje: e.message || "No se pudieron asignar las tareas",
    });
  }
});
app.delete("/tareas/asignacion", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    if (!rolGestionSector(req.usuario))
      return res.status(403).json({
        ok: false,
        mensaje: "No tenés permiso para eliminar asignaciones",
      });
    const id = normalizarTexto(req.body?.id),
      fecha = normalizarTexto(req.body?.fecha),
      turno = normalizarTexto(req.body?.turno);
    const sectores = await sectoresTareasPermitidos(req.usuario),
      permitidos = new Set(
        sectores.flatMap((s) => [
          normalizarTexto(s.id),
          normalizarTexto(s.nombre),
        ]),
      );
    await conTransaccionTareasBano(async (cliente) => {
      const tareas = await obtenerTareasServidor(cliente),
        tarea = tareas.find((t) => t.id === id);
      if (!tarea?.asignaciones?.[fecha]?.[turno]) {
        const error = new Error("Asignación no encontrada");
        error.statusCode = 404;
        throw error;
      }
      if (
        !rolGestionGlobal(req.usuario) &&
        !permitidos.has(normalizarTexto(tarea.sector))
      ) {
        const error = new Error("No tenés permiso para este sector");
        error.statusCode = 403;
        throw error;
      }
      delete tarea.asignaciones[fecha][turno];
      if (!Object.keys(tarea.asignaciones[fecha]).length)
        delete tarea.asignaciones[fecha];
      await guardarTareasServidor(tareas, req.usuario, cliente);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      ok: false,
      mensaje: e.message || "No se pudo eliminar la asignación",
    });
  }
});
app.get("/tareas/bano", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    const config = await leerBanoServidor();
    config.historial = completarHistorialBano(config);
    res.json({ ok: true, config });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudo cargar la rotación",
    });
  }
});
app.put("/tareas/bano", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    if (!rolGestionSector(req.usuario))
      return res.status(403).json({
        ok: false,
        mensaje: "No tenés permiso para configurar la rotación",
      });
    const config = await conTransaccionTareasBano(async (cliente) => {
      const actual = await leerBanoServidor(cliente);
      actual.historial = completarHistorialBano(actual);
      const participantes = participantesOrdenFijo(
        actual.participantes,
        req.body?.participantes || [],
      );
      const fechaAncla = fechaAnclaParaConservarTurno(actual, participantes);
      return guardarBanoServidor(
        {
          ...actual,
          participantes,
          fechaAncla,
        },
        req.usuario,
        cliente,
      );
    });
    res.json({ ok: true, config });
  } catch (e) {
    res.status(500).json({
      ok: false,
      mensaje: e.message || "No se pudo guardar la rotación",
    });
  }
});
app.post("/tareas/bano/confirmar", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    const fecha = normalizarTexto(req.body?.fecha) || fechaArgentina();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fechaArgentina())
      return res.status(400).json({ ok: false, mensaje: "Fecha inválida" });
    const config = await conTransaccionTareasBano(async (cliente) => {
      const actual = await leerBanoServidor(cliente);
      actual.historial = completarHistorialBano(actual, fecha);
      const registro = actual.historial.find((x) => x.fecha === fecha);
      if (!registro) {
        const error = new Error("Registro de limpieza no encontrado");
        error.statusCode = 404;
        throw error;
      }
      if (!usuarioCoincideResponsableBano(registro, req.usuario)) {
        const error = new Error("Solo el responsable asignado puede confirmar esta limpieza");
        error.statusCode = 403;
        throw error;
      }
      if (!normalizarTexto(registro.usuario)) {
        registro.usuario = req.usuario.nombre || req.usuario.usuario;
        registro.hora = new Date().toLocaleTimeString("es-AR", {
          timeZone: TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return guardarBanoServidor(actual, req.usuario, cliente);
    });
    res.json({ ok: true, config });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      ok: false,
      mensaje: e.message || "No se pudo confirmar la limpieza",
    });
  }
});

app.post("/tareas/bano/verificar", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    if (!rolGestionSector(req.usuario))
      return res.status(403).json({
        ok: false,
        mensaje: "Solo supervisores o administración pueden confirmar la limpieza",
      });
    const fecha = normalizarTexto(req.body?.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
      return res.status(400).json({ ok: false, mensaje: "Fecha inválida" });
    const config = await conTransaccionTareasBano(async (cliente) => {
      const actual = await leerBanoServidor(cliente);
      actual.historial = completarHistorialBano(actual, fechaArgentina());
      const registro = actual.historial.find((x) => x.fecha === fecha);
      if (!registro) {
        const error = new Error("Registro de limpieza no encontrado");
        error.statusCode = 404;
        throw error;
      }
      if (!normalizarTexto(registro.usuario)) {
        const error = new Error("El responsable todavía no confirmó la limpieza");
        error.statusCode = 409;
        throw error;
      }
      if (
        usuarioCoincideResponsableBano(registro, req.usuario) ||
        usuarioCoincideConfirmacionBano(registro, req.usuario)
      ) {
        const error = new Error("La limpieza debe ser verificada por otra persona autorizada");
        error.statusCode = 403;
        throw error;
      }
      if (!normalizarTexto(registro.supervisadoPor)) {
        registro.supervisadoPor = req.usuario.nombre || req.usuario.usuario;
        registro.horaVerificacion = new Date().toLocaleTimeString("es-AR", {
          timeZone: TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return guardarBanoServidor(actual, req.usuario, cliente);
    });
    res.json({ ok: true, config });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      ok: false,
      mensaje: e.message || "No se pudo confirmar la limpieza",
    });
  }
});

app.post("/tareas/completar", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    const id = normalizarTexto(req.body?.id),
      fecha = normalizarTexto(req.body?.fecha),
      turno = normalizarTexto(req.body?.turno);
    const sectores = !rolGestionGlobal(req.usuario)
      ? await sectoresTareasPermitidos(req.usuario)
      : [];
    const permitidos = new Set(
      sectores.flatMap((s) => [normalizarTexto(s.id), normalizarTexto(s.nombre)]),
    );
    const resultado = await conTransaccionTareasBano(async (cliente) => {
      const tareas = await obtenerTareasServidor(cliente),
        t = tareas.find((x) => x.id === id);
      if (!t || !t.asignaciones?.[fecha]?.[turno]) {
        const error = new Error("Asignación no encontrada");
        error.statusCode = 404;
        throw error;
      }
      if (
        !rolGestionGlobal(req.usuario) &&
        !permitidos.has(normalizarTexto(t.sector))
      ) {
        const error = new Error("No tenés permiso para completar tareas de este sector");
        error.statusCode = 403;
        throw error;
      }
      const asig = t.asignaciones[fecha][turno];
      const yaEstabaCompletada =
        normalizarTexto(asig.estado).toLowerCase() === "completada";
      asig.estado = "completada";
      asig.completadaPor = req.usuario.nombre || req.usuario.usuario;
      asig.completadaHora = new Date().toLocaleTimeString("es-AR", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
      });
      await guardarTareasServidor(tareas, req.usuario, cliente);
      return { tarea: t, asignacion: { ...asig }, yaEstabaCompletada };
    });
    if (!resultado.yaEstabaCompletada) {
      setImmediate(() =>
        notificarSupervisorTareaCompletada({
          tarea: resultado.tarea,
          fecha,
          turno,
          asignacion: resultado.asignacion,
          completadaPor: req.usuario,
        }).catch((error) =>
          console.error(
            "Error notificando tarea completada al supervisor:",
            error,
          ),
        ),
      );
    }
    res.json({ ok: true, asignacion: resultado.asignacion });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      ok: false,
      mensaje: e.message || "No se pudo completar la tarea",
    });
  }
});

app.get("/tareas/usuarios", requerirAlgunModulo("tareas"), async (req, res) => {
  try {
    const [usuarios, sectores] = await Promise.all([
      obtenerUsuarios(),
      sectoresTareasPermitidos(req.usuario),
    ]);
    const permitidos = new Set(sectores.map((s) => s.id));
    const visibles = rolGestionGlobal(req.usuario)
      ? usuarios.filter((u) => u.activo)
      : usuarios.filter(
          (u) =>
            u.activo &&
            (permitidos.has(u.sector) ||
              (u.sectores || []).some((s) => permitidos.has(s))),
        );
    res.json({
      ok: true,
      usuarios: visibles.map((u) => ({
        usuario: u.usuario,
        nombre: u.nombre,
        sector: u.sector,
        sectores: u.sectores || [],
      })),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudieron cargar los usuarios",
    });
  }
});

app.get("/admin/usuarios", requerirAdministrador, async (req, res) => {
  try {
    const usuarios = await obtenerUsuarios();
    res.json({
      ok: true,
      usuarios: usuarios.map(
        ({ passwordHash, filaGoogle, ...usuario }) => usuario,
      ),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudieron cargar los usuarios",
    });
  }
});

app.post("/admin/usuarios", requerirAdministrador, async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.body?.usuario);
    const nombre = normalizarTexto(req.body?.nombre) || usuario;
    const password = String(req.body?.password || "");
    const rolEntrada = normalizarTexto(req.body?.rol).toLowerCase();
    const rol = normalizarRol(rolEntrada);
    const sector = normalizarTexto(req.body?.sector);
    const sectoresCargo = [
      ...new Set(
        (Array.isArray(req.body?.sectores) ? req.body.sectores : [])
          .map(normalizarTexto)
          .filter(Boolean),
      ),
    ];
    const permisos =
      req.body?.permisos === undefined && rol !== "administrador"
        ? permisosDenegados()
        : normalizarPermisos(req.body?.permisos, rol);
    if (sector) {
      const sectores = await obtenerSectores();
      if (!sectores.some((s) => s.id === sector && s.activo))
        return res.status(400).json({
          ok: false,
          mensaje: "El sector seleccionado no existe o está inactivo",
        });
    }
    if (
      rol === "supervisor" &&
      ![sector, ...sectoresCargo].filter(Boolean).length
    )
      return res.status(400).json({
        ok: false,
        mensaje: "Asigná al menos un sector al supervisor",
      });
    if ([...new Set([sector, ...sectoresCargo].filter(Boolean))].length > 2)
      return res.status(400).json({
        ok: false,
        mensaje: "Un supervisor puede tener como máximo dos sectores",
      });
    if (sectoresCargo.length) {
      const sectores = await obtenerSectores();
      if (
        sectoresCargo.some(
          (id) => !sectores.some((s) => s.id === id && s.activo),
        )
      )
        return res.status(400).json({
          ok: false,
          mensaje: "Uno de los sectores a cargo no existe o está inactivo",
        });
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario))
      return res.status(400).json({
        ok: false,
        mensaje:
          "El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo",
      });
    if (password.length < 8)
      return res.status(400).json({
        ok: false,
        mensaje: "La contraseña debe tener al menos 8 caracteres",
      });
    const usuarios = await obtenerUsuarios();
    if (usuarios.some((item) => item.usuario === usuario))
      return res
        .status(409)
        .json({ ok: false, mensaje: "Ese usuario ya existe" });
    await guardarUsuarioDb({
      usuario, nombre, passwordHash: hashPassword(password), rol, activo: true,
      creado: fechaHoraArgentinaIso(), permisos, sector, sectores: sectoresCargo,
      sessionVersion: 1, googleEmail: "",
    });
    invalidarCache("usuarios");
    await sincronizarUsuarioSupervisor(
      usuario,
      rol,
      sector,
      true,
      sectoresCargo,
    );
    await registrarHistorialAdministracion(req, "Creó usuario", "Usuario", nombre || usuario, `Rol: ${rol} · Sector: ${sector || "Sin sector"}`);
    res.json({
      ok: true,
      mensaje: "Usuario creado",
      usuario: {
        usuario,
        nombre,
        rol,
        activo: true,
        permisos,
        sector,
        sectores: sectoresCargo,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo crear el usuario",
    });
  }
});

app.put("/admin/usuarios/:usuario", requerirAdministrador, async (req, res) => {
  try {
    const clave = normalizarUsuario(req.params.usuario);
    const usuarios = await obtenerUsuarios();
    const actual = usuarios.find((item) => item.usuario === clave);
    if (!actual)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Usuario no encontrado" });
    const nombre = normalizarTexto(req.body?.nombre) || actual.nombre;
    const rolEntrada =
      req.body?.rol === undefined
        ? actual.rol
        : normalizarTexto(req.body.rol).toLowerCase();
    const rol = normalizarRol(rolEntrada);
    const sector =
      req.body?.sector === undefined
        ? actual.sector || ""
        : normalizarTexto(req.body.sector);
    const sectoresCargo =
      req.body?.sectores === undefined
        ? actual.sectores || []
        : [
            ...new Set(
              (Array.isArray(req.body.sectores) ? req.body.sectores : [])
                .map(normalizarTexto)
                .filter(Boolean),
            ),
          ];
    const activo =
      req.body?.activo === undefined ? actual.activo : Boolean(req.body.activo);
    const permisos =
      req.body?.permisos === undefined
        ? normalizarPermisos(actual.permisos, rol)
        : normalizarPermisos(req.body.permisos, rol);
    const password = String(req.body?.password || "");
    if (sector) {
      const sectores = await obtenerSectores();
      if (!sectores.some((s) => s.id === sector && s.activo))
        return res.status(400).json({
          ok: false,
          mensaje: "El sector seleccionado no existe o está inactivo",
        });
    }
    if (
      rol === "supervisor" &&
      ![sector, ...sectoresCargo].filter(Boolean).length
    )
      return res.status(400).json({
        ok: false,
        mensaje: "Asigná al menos un sector al supervisor",
      });
    if ([...new Set([sector, ...sectoresCargo].filter(Boolean))].length > 2)
      return res.status(400).json({
        ok: false,
        mensaje: "Un supervisor puede tener como máximo dos sectores",
      });
    if (sectoresCargo.length) {
      const sectores = await obtenerSectores();
      if (
        sectoresCargo.some(
          (id) => !sectores.some((s) => s.id === id && s.activo),
        )
      )
        return res.status(400).json({
          ok: false,
          mensaje: "Uno de los sectores a cargo no existe o está inactivo",
        });
    }
    if (clave === req.usuario.usuario && (!activo || rol !== "administrador")) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "No podés desactivar tu propia cuenta ni quitarte el rol de administrador",
      });
    }
    if (password && password.length < 8)
      return res.status(400).json({
        ok: false,
        mensaje: "La contraseña debe tener al menos 8 caracteres",
      });
    const hash = password ? hashPassword(password) : actual.passwordHash;
    const sessionVersion = password
      ? Math.max(1, Number(actual.sessionVersion) || 1) + 1
      : Math.max(1, Number(actual.sessionVersion) || 1);
    await guardarUsuarioDb({
      ...actual, usuario: clave, nombre, passwordHash: hash, rol, activo,
      permisos, sector, sectores: sectoresCargo, sessionVersion,
      googleEmail: actual.googleEmail || "",
    });
    invalidarCache("usuarios");
    await sincronizarUsuarioSupervisor(
      clave,
      rol,
      sector,
      activo,
      sectoresCargo,
    );
    const cambiosUsuario = [];
    if (nombre !== actual.nombre) cambiosUsuario.push(`Nombre: ${actual.nombre} → ${nombre}`);
    if (rol !== actual.rol) cambiosUsuario.push(`Rol: ${actual.rol} → ${rol}`);
    if ((actual.sector || "") !== sector) cambiosUsuario.push(`Sector: ${actual.sector || "Sin sector"} → ${sector || "Sin sector"}`);
    if (activo !== actual.activo) cambiosUsuario.push(`Estado: ${actual.activo ? "Activo" : "Inactivo"} → ${activo ? "Activo" : "Inactivo"}`);
    if (password) cambiosUsuario.push("Contraseña actualizada");
    await registrarHistorialAdministracion(req, "Editó usuario", "Usuario", nombre || clave, cambiosUsuario.join(" · ") || "Permisos o configuración actualizados");
    res.json({
      ok: true,
      mensaje: "Usuario actualizado",
      usuario: {
        usuario: clave,
        nombre,
        rol,
        activo,
        permisos,
        sector,
        sectores: sectoresCargo,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo actualizar el usuario",
    });
  }
});

async function eliminarFilaDeHoja(nombreHoja, filaGoogle) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets(properties(sheetId,title))",
  });
  const hoja = (meta.data.sheets || []).find(
    (h) => h.properties?.title === nombreHoja,
  );
  if (!hoja) throw new Error(`No existe la hoja ${nombreHoja}`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: hoja.properties.sheetId,
              dimension: "ROWS",
              startIndex: filaGoogle - 1,
              endIndex: filaGoogle,
            },
          },
        },
      ],
    },
  });
}
async function eliminarRegistrosSector(nombreHoja, sectorId, columnas) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${nombreHoja}!A:${columnas}`,
  });
  const filas = r.data.values || [];
  if (!filas.length) return;
  const restantes = [
    filas[0],
    ...filas.slice(1).filter((f) => normalizarTexto(f[0]) !== sectorId),
  ];
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${nombreHoja}!A:${columnas}`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${nombreHoja}!A1:${columnas}${restantes.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: restantes },
  });
}
app.delete(
  "/admin/usuarios/:usuario",
  requerirAdministrador,
  async (req, res) => {
    try {
      const clave = normalizarUsuario(req.params.usuario),
        usuarios = await obtenerUsuarios();
      const actual = usuarios.find((u) => u.usuario === clave);
      if (!actual)
        return res
          .status(404)
          .json({ ok: false, mensaje: "Usuario no encontrado" });
      if (clave === req.usuario.usuario)
        return res
          .status(400)
          .json({ ok: false, mensaje: "No podés eliminar tu propia cuenta" });
      if (
        actual.rol === "administrador" &&
        usuarios.filter((u) => u.activo && u.rol === "administrador").length <=
          1
      )
        return res.status(400).json({
          ok: false,
          mensaje: "No se puede eliminar el último administrador",
        });
      await eliminarUsuarioConSupervisionDb(clave);
      invalidarCache("usuarios", "sectores");
      await registrarHistorialAdministracion(req, "Eliminó usuario", "Usuario", actual.nombre || clave, `Cuenta @${clave} eliminada`);
      res.json({ ok: true, mensaje: "Usuario eliminado" });
    } catch (e) {
      res.status(500).json({
        ok: false,
        mensaje: e.message || "No se pudo eliminar el usuario",
      });
    }
  },
);
app.delete("/admin/sectores/:id", requerirAdministrador, async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id),
      [sectores, usuarios] = await Promise.all([
        obtenerSectores(),
        obtenerUsuarios(),
      ]);
    const sector = sectores.find((s) => s.id === id);
    if (!sector)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Sector no encontrado" });
    const asignados = usuarios.filter(
      (u) => u.sector === id || (u.sectores || []).includes(id),
    );
    if (asignados.length)
      return res.status(409).json({
        ok: false,
        mensaje: `No se puede eliminar: hay ${asignados.length} usuario(s) asignado(s) o con el sector a cargo. Reasignalos primero.`,
      });
    await asegurarHorariosPostgres();
    await eliminarSectorConHorariosDb(id);
    invalidarCache("usuarios", "sectores");
    await registrarHistorialAdministracion(req, "Eliminó sector", "Sector", sector.nombre || id, `Sector ${sector.nombre || id} eliminado`);
    res.json({ ok: true, mensaje: "Sector eliminado" });
  } catch (e) {
    const status = e?.code === "SECTOR_EN_USO" ? 409 : 500;
    res.status(status).json({
      ok: false,
      mensaje: e.message || "No se pudo eliminar el sector",
    });
  }
});

app.get("/", (req, res) => {
  res.send(
    `Servidor Herramientas Autoservicio Victor V${APP_VERSION} funcionando`,
  );
});

const IMPORTACION_MAX_FILAS = 30000;
let importacionProductosEnCurso = Promise.resolve();

function normalizarProductoImportado(item) {
  const codigo = normalizarCodigo(item?.codigo);
  const articulo = normalizarTexto(item?.articulo);
  const precio = numeroPrecio(item?.precio);
  if (!codigo || !articulo) return null;
  return { codigo, articulo, precio };
}

async function ejecutarImportacionProductos(items, aplicarCambios = true) {
  // El archivo importado pasa a ser la fuente completa del catálogo.
  // No se comparan altas ni modificaciones: Productos se reemplaza entero.
  const catalogo = [];
  const codigosVistos = new Set();
  let duplicadosArchivo = 0;

  for (const item of items) {
    const producto = normalizarProductoImportado(item);
    if (!producto) continue;

    // Se conserva exactamente el código normalizado del archivo. Solo se
    // eliminan duplicados exactos dentro del mismo archivo, conservando la
    // última aparición.
    const clave = producto.codigo;
    if (codigosVistos.has(clave)) {
      duplicadosArchivo++;
      const indice = catalogo.findIndex((actual) => actual.codigo === clave);
      if (indice >= 0) catalogo[indice] = producto;
      continue;
    }
    codigosVistos.add(clave);
    catalogo.push(producto);
  }

  if (!catalogo.length)
    throw new Error(
      "No se encontraron productos válidos para reemplazar el catálogo",
    );

  if (aplicarCambios) {
    await asegurarInventarioProductosPostgres();
    await reemplazarCatalogoDb(catalogo);
    invalidarCache("productosMaestros");
  }

  return {
    procesados: catalogo.length,
    totalCatalogo: catalogo.length,
    duplicadosArchivo,
    reemplazoCompleto: true,
  };
}

app.post(
  "/admin/importar-productos",
  requerirAdministrador,
  async (req, res) => {
    try {
      const entrada = Array.isArray(req.body?.productos)
        ? req.body.productos
        : [];
      if (!entrada.length)
        return res.status(400).json({
          ok: false,
          mensaje: "El archivo no contiene productos válidos",
        });
      if (entrada.length > IMPORTACION_MAX_FILAS)
        return res.status(400).json({
          ok: false,
          mensaje: `El archivo supera el máximo de ${IMPORTACION_MAX_FILAS} productos`,
        });
      const items = entrada.map(normalizarProductoImportado).filter(Boolean);
      if (!items.length)
        return res.status(400).json({
          ok: false,
          mensaje: "No se encontraron códigos y artículos válidos",
        });
      const confirmar = req.body?.confirmar === true;
      if (!confirmar) {
        const resumen = await ejecutarImportacionProductos(items, false);
        return res.json({
          ok: true,
          mensaje: "Vista previa del reemplazo calculada",
          vistaPrevia: true,
          resumen,
        });
      }
      const tarea = importacionProductosEnCurso
        .catch(() => {})
        .then(() => ejecutarImportacionProductos(items, true));
      importacionProductosEnCurso = tarea.catch(() => {});
      const resumen = await tarea;
      await registrarHistorialAdministracion(req, "Importó catálogo", "Catálogo", "Productos", `${resumen.procesados || 0} productos procesados`);
      res.json({
        ok: true,
        mensaje: "Catálogo reemplazado correctamente",
        resumen,
      });
    } catch (error) {
      console.error("Error importando productos:", error);
      res.status(500).json({
        ok: false,
        mensaje: error.message || "No se pudo importar el archivo",
      });
    }
  },
);

app.get("/productos", requerirAlgunModulo("inventario"), async (req, res) => {
  try {
    const productos = await obtenerProductos();
    res.json({ ok: true, total: productos.length, productos });
  } catch (error) {
    console.error("Error en /productos:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al obtener productos",
    });
  }
});

app.get("/producto/:codigo", requerirAlgunModulo("inventario"), async (req, res) => {
  try {
    const producto = await buscarProductoPorCodigo(req.params.codigo);

    if (!producto) {
      return res
        .status(404)
        .json({ ok: false, mensaje: "Producto no encontrado" });
    }

    res.json({ ok: true, producto });
  } catch (error) {
    console.error("Error en /producto/:codigo:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al obtener producto",
    });
  }
});

app.get("/productos-maestro", requerirAlgunModulo("inventario", "vencimientos", "precios", "anotar"), async (req, res) => {
  try {
    const productos = await obtenerProductosMaestros();
    const etag = `"${crypto.createHash("sha1").update(JSON.stringify(productos)).digest("hex")}"`;
    res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.json({ ok: true, total: productos.length, productos });
  } catch (error) {
    console.error("Error en /productos-maestro:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al obtener productos maestros",
    });
  }
});

app.get("/producto-maestro/:codigo", requerirAlgunModulo("inventario", "vencimientos", "precios", "anotar"), async (req, res) => {
  try {
    const producto = await buscarProductoMaestroPorCodigo(req.params.codigo);
    if (!producto) {
      return res
        .status(404)
        .json({ ok: false, mensaje: "Producto no encontrado en Productos" });
    }
    res.json({ ok: true, producto });
  } catch (error) {
    console.error("Error en /producto-maestro/:codigo:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al obtener producto maestro",
    });
  }
});


app.post("/guardar", requerirAlgunModulo("inventario"), async (req, res) => {
  try {
    const { codigo, articulo, ubicacion, cantidad } = req.body;
    const codigoBuscado = normalizarCodigo(codigo);
    const cantidadNumerica = enteroPositivo(cantidad);

    if (!codigoBuscado) {
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    }

    if (!["salon", "deposito"].includes(ubicacion)) {
      return res.status(400).json({ ok: false, mensaje: "Ubicación inválida" });
    }

    if (cantidadNumerica === null) {
      return res.status(400).json({
        ok: false,
        mensaje: "La cantidad debe ser un número entero mayor a 0",
      });
    }

    let articuloNuevo = normalizarTexto(articulo);
    if (!articuloNuevo) {
      const maestro = await buscarProductoMaestroPorCodigo(codigoBuscado);
      articuloNuevo = normalizarTexto(maestro?.articulo);
    }

    const productoActualizado = await ejecutarEnCola(
      codigoBuscado,
      () => sumarInventarioDb(
        codigoBuscado,
        ubicacion,
        cantidadNumerica,
        articuloNuevo,
      ),
    );

    if (!productoActualizado) {
      return res.status(404).json({
        ok: false,
        mensaje: "Producto no encontrado en el catálogo",
      });
    }

    invalidarCache("productos");
    res.json({
      ok: true,
      mensaje: "Producto guardado",
      producto: productoActualizado,
    });
  } catch (error) {
    console.error("Error en /guardar:", error);
    res.status(error.statusCode || 500).json({
      ok: false,
      mensaje: error.message || "Error al guardar producto",
    });
  }
});

app.post("/corregir", requerirAlgunModulo("inventario"), async (req, res) => {
  try {
    const { codigo, salon, deposito } = req.body;
    const codigoBuscado = normalizarCodigo(codigo);

    if (!codigoBuscado) {
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    }

    const salonValidado = enteroNoNegativo(salon);
    const depositoValidado = enteroNoNegativo(deposito);
    if (salonValidado === null || depositoValidado === null) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Salón y depósito deben ser números enteros iguales o mayores a 0",
      });
    }

    const productoActualizado = await ejecutarEnCola(
      codigoBuscado,
      () => corregirInventarioDb(codigoBuscado, salonValidado, depositoValidado),
    );

    if (!productoActualizado) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    invalidarCache("productos");
    res.json({
      ok: true,
      mensaje: "Producto corregido",
      producto: productoActualizado,
    });
  } catch (error) {
    console.error("Error en /corregir:", error);
    res.status(error.statusCode || 500).json({
      ok: false,
      mensaje: error.message || "Error al corregir producto",
    });
  }
});

const VENCIMIENTOS_SHEET_NAME = "Vencimientos";

function fechaIsoHoy() {
  return fechaArgentina();
}

function generarIdVencimiento() {
  const marca = fechaHoraArgentinaIso()
    .replace(/[-:T+]/g, "")
    .slice(0, 14);
  return `V${marca}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function calcularEstadoVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return "Sin fecha";
  const hoy = new Date(fechaIsoHoy() + "T00:00:00");
  const vence = new Date(String(fechaVencimiento) + "T00:00:00");
  if (Number.isNaN(vence.getTime())) return "Sin fecha";
  const dias = Math.ceil((vence - hoy) / 86400000);
  if (dias < 0) return "Vencido";
  if (dias <= 7) return "En 7 días";
  if (dias <= 15) return "En 15 días";
  if (dias <= 30) return "En 30 días";
  return "Vigente";
}

function normalizarOfertaVencimiento(valor) {
  const texto = normalizarTexto(valor).toLowerCase();
  return ["si", "sí", "true", "1", "oferta", "activo", "activa"].includes(texto)
    ? "Sí"
    : "No";
}

function normalizarRubroVencimiento(valor) {
  const texto = normalizarTexto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (texto === "almacen") return "Almacén";
  if (texto === "bebida" || texto === "bebidas") return "Bebida";
  if (texto === "fiambreria") return "Fiambrería";
  if (texto === "lacteo" || texto === "lacteos") return "Lácteos";
  return "Sin clasificar";
}

function cantidadVencimientoDesdeBody(body = {}) {
  const cantidadDirecta = enteroNoNegativo(body.cantidad);
  if (cantidadDirecta !== null) return cantidadDirecta;

  // Compatibilidad temporal con clientes V19 cacheados. El esquema persistido
  // y las respuestas públicas usan únicamente `cantidad`.
  const salonAnterior = enteroNoNegativo(body.salon);
  const depositoAnterior = enteroNoNegativo(body.deposito);
  if (salonAnterior === null && depositoAnterior === null) return null;
  return Math.max(0, salonAnterior || 0) + Math.max(0, depositoAnterior || 0);
}

let hojaVencimientosAsegurada = false;
let promesaHojaVencimientos = null;
const ENCABEZADOS_VENCIMIENTOS = [
  "ID",
  "Fecha carga",
  "Código",
  "Artículo",
  "Vencimiento",
  "Cantidad",
  "Estado",
  "Oferta",
  "Rubro",
];

async function asegurarHojaVencimientos() {
  if (hojaVencimientosAsegurada) return;
  if (promesaHojaVencimientos) return promesaHojaVencimientos;
  promesaHojaVencimientos = (async () => {
    validarConfiguracion();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const existe = (meta.data.sheets || []).some(
      (hoja) => hoja.properties?.title === VENCIMIENTOS_SHEET_NAME,
    );

    if (!existe) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: VENCIMIENTOS_SHEET_NAME } } },
          ],
        },
      });
    }

    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A1:K`,
    });
    const valores = respuesta.data.values || [];
    const encabezado = valores[0] || [];
    const esEsquemaAnterior =
      encabezado[5] === "Salón" ||
      encabezado[6] === "Depósito" ||
      encabezado[7] === "Total";

    const hojaVacia = !encabezado.some((valor) => normalizarTexto(valor));

    if (hojaVacia) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${VENCIMIENTOS_SHEET_NAME}!A1:I1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [ENCABEZADOS_VENCIMIENTOS] },
      });
    } else if (esEsquemaAnterior) {
      const filasMigradas = valores.slice(1).map((fila) => {
        const cantidadTotal = numero(fila[7]);
        const cantidad =
          cantidadTotal > 0 ? cantidadTotal : numero(fila[5]) + numero(fila[6]);
        return [
          fila[0] || "",
          fila[1] || "",
          fila[2] || "",
          fila[3] || "",
          fila[4] || "",
          cantidad,
          calcularEstadoVencimiento(fila[4]),
          normalizarOfertaVencimiento(fila[9]),
          normalizarRubroVencimiento(fila[10]),
        ];
      });
      await reescribirHoja(
        VENCIMIENTOS_SHEET_NAME,
        ENCABEZADOS_VENCIMIENTOS,
        filasMigradas,
      );
      console.log(
        `Migración de Vencimientos completada: ${filasMigradas.length} registro(s) al esquema Cantidad.`,
      );
    } else {
      const correcto = ENCABEZADOS_VENCIMIENTOS.every(
        (valor, index) => encabezado[index] === valor,
      );
      if (!correcto) {
        throw new Error(
          "La hoja Vencimientos tiene un esquema desconocido. Se detuvo la migración para proteger los datos existentes.",
        );
      }
    }
    hojaVencimientosAsegurada = true;
  })();
  try {
    await promesaHojaVencimientos;
  } finally {
    promesaHojaVencimientos = null;
  }
}

function filaAVencimiento(fila, index) {
  return {
    filaGoogle: index + 2,
    id: normalizarTexto(fila[0]) || String(index + 1),
    fecha_carga: normalizarTexto(fila[1]),
    codigo: normalizarTexto(fila[2]),
    articulo: normalizarTexto(fila[3]),
    vencimiento: normalizarTexto(fila[4]),
    cantidad: numero(fila[5]),
    estado: calcularEstadoVencimiento(fila[4]),
    oferta: normalizarOfertaVencimiento(fila[7]),
    rubro: normalizarRubroVencimiento(fila[8]),
  };
}

async function obtenerVencimientosLegacy() {
  await asegurarHojaVencimientos();
  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${VENCIMIENTOS_SHEET_NAME}!A:I`,
  });
  const filas = respuesta.data.values || [];
  return filas
    .slice(1)
    .map(filaAVencimiento)
    .filter((item) => item.codigo || item.articulo || item.id);
}

const MIGRACION_VENCIMIENTOS = "2026-08-28-vencimientos-v1";
let promesaVencimientosPostgres = null;
async function asegurarVencimientosPostgres() {
  await asegurarEsquemaUsuariosSectores();
  await asegurarEsquemaVencimientos();
  if (await migracionDatosCompletada(MIGRACION_VENCIMIENTOS)) return;
  if (promesaVencimientosPostgres) return promesaVencimientosPostgres;
  promesaVencimientosPostgres = (async () => {
    if (await migracionDatosCompletada(MIGRACION_VENCIMIENTOS)) return;
    // Importación inicial de solo lectura: la hoja Vencimientos queda como respaldo histórico.
    const vencimientos = await obtenerVencimientosLegacy();
    const importado = await importarVencimientosAtomico(
      vencimientos,
      MIGRACION_VENCIMIENTOS,
    );
    if (importado) {
      console.log(
        `PostgreSQL Etapa 6: Vencimientos importados desde Sheets (${vencimientos.length} registros).`,
      );
    }
  })();
  try {
    await promesaVencimientosPostgres;
  } finally {
    promesaVencimientosPostgres = null;
  }
}

async function obtenerVencimientos() {
  await asegurarVencimientosPostgres();
  return leerConCache("vencimientos", CACHE_TTL.vencimientos, async () => {
    const filas = await listarVencimientosDb();
    return filas.map((item) => ({
      ...item,
      estado: calcularEstadoVencimiento(item.vencimiento),
    }));
  });
}

let hojasNotificacionesAseguradas = false;
let procesandoNotificaciones = false;
const clavesNotificacionEnProceso = new Set();

async function asegurarHojasNotificaciones() {
  if (hojasNotificacionesAseguradas) return;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titulos = new Set(
    (meta.data.sheets || []).map((h) => h.properties?.title),
  );
  const requests = [];
  if (!titulos.has(PUSH_SUBSCRIPTIONS_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: PUSH_SUBSCRIPTIONS_SHEET_NAME } },
    });
  if (!titulos.has(NOTIFICATION_LOG_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: NOTIFICATION_LOG_SHEET_NAME } },
    });
  if (!titulos.has(NOTIFICATION_CENTER_SHEET_NAME))
    requests.push({
      addSheet: { properties: { title: NOTIFICATION_CENTER_SHEET_NAME } },
    });
  if (requests.length)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!A1:G1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          "Endpoint",
          "P256DH",
          "Auth",
          "Usuario",
          "Nombre",
          "Activo",
          "Actualizado",
        ],
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${NOTIFICATION_LOG_SHEET_NAME}!A1:G1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          "Clave",
          "Fecha envío",
          "Tipo",
          "ID",
          "Código",
          "Vencimiento",
          "Detalle",
        ],
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${NOTIFICATION_CENTER_SHEET_NAME}!A1:I1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          "ID",
          "Usuario",
          "Tipo",
          "Título",
          "Mensaje",
          "URL",
          "Fecha",
          "Leída",
          "Clave",
        ],
      ],
    },
  });
  hojasNotificacionesAseguradas = true;
}

async function obtenerSuscripcionesPush() {
  await asegurarAuxiliaresPostgres();
  return leerConCache("suscripcionesPush", CACHE_TTL.suscripcionesPush, async () => listarSuscripcionesPushDb());
}

async function guardarSuscripcionPush(req) {
  await asegurarAuxiliaresPostgres();
  const endpoint = normalizarTexto(req.body?.subscription?.endpoint);
  const p256dh = normalizarTexto(req.body?.subscription?.keys?.p256dh);
  const authKey = normalizarTexto(req.body?.subscription?.keys?.auth);
  if (!endpoint || !p256dh || !authKey) throw new Error("Suscripción push incompleta");
  await guardarSuscripcionPushDb({
    endpoint, p256dh, auth: authKey, usuario: req.usuario.usuario,
    nombre: req.usuario.nombre, actualizado: fechaHoraArgentinaIso(),
  });
  invalidarCache("suscripcionesPush");
}

// v12.3.1.5// v12.3.1.5 — Cola global para escrituras de notificaciones en Google Sheets.
let colaEscriturasNotificaciones = Promise.resolve();
let ultimaEscrituraNotificaciones = 0;
const idsCentroNotificacionPendientes = new Set();

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esErrorCuotaSheets(error) {
  return (
    Number(error?.code || error?.status || error?.response?.status) === 429 ||
    String(error?.message || "")
      .toLowerCase()
      .includes("quota exceeded") ||
    String(error?.message || "")
      .toLowerCase()
      .includes("rate limit")
  );
}

function encolarEscrituraNotificaciones(operacion) {
  const ejecutar = async () => {
    const esperaMinima = Math.max(
      0,
      1150 - (Date.now() - ultimaEscrituraNotificaciones),
    );
    if (esperaMinima) await esperar(esperaMinima);
    let intento = 0;
    while (true) {
      try {
        const resultado = await operacion();
        ultimaEscrituraNotificaciones = Date.now();
        return resultado;
      } catch (error) {
        if (!esErrorCuotaSheets(error) || intento >= 5) throw error;
        const demora =
          Math.min(30000, 1800 * 2 ** intento) +
          Math.floor(Math.random() * 700);
        intento += 1;
        console.warn(`Google Sheets 429: reintento ${intento} en ${demora} ms`);
        await esperar(demora);
      }
    }
  };
  const promesa = colaEscriturasNotificaciones.then(ejecutar, ejecutar);
  colaEscriturasNotificaciones = promesa.catch(() => {});
  return promesa;
}

async function clavesNotificacionesEnviadas() {
  await asegurarAuxiliaresPostgres();
  const claves = await leerConCache(
    "clavesNotificaciones",
    CACHE_TTL.clavesNotificaciones,
    async () => clavesNotificacionesDb(),
  );
  return new Set(claves);
}

async function registrarNotificacionEnviada(clave, tipo, registro, detalle) {
  await asegurarAuxiliaresPostgres();
  await registrarNotificacionEnviadaDb({
    clave, fecha: fechaHoraArgentinaIso(), tipo,
    id: registro.id, codigo: registro.codigo, vencimiento: registro.vencimiento, detalle,
  });
  const guardado = cacheLecturas.get("clavesNotificaciones");
  if (guardado?.valor instanceof Set) {
    const actualizado = new Set(guardado.valor); actualizado.add(clave);
    cacheLecturas.set("clavesNotificaciones", { fecha: Date.now(), valor: actualizado });
  } else invalidarCache("clavesNotificaciones");
}

async function registrarCentroNotificacion({
  usuario, tipo, titulo, mensaje, url = "./", clave = "",
}) {
  await asegurarAuxiliaresPostgres();
  const usuarioNorm = normalizarUsuario(usuario);
  if (!usuarioNorm) return;
  const claveNorm = normalizarTexto(clave || `${tipo}|${titulo}|${mensaje}`);
  const id = crypto.createHash("sha1").update(`${usuarioNorm}|${claveNorm}`).digest("hex").slice(0, 20);
  if (idsCentroNotificacionPendientes.has(id) || await existeCentroNotificacionDb(id)) return;
  idsCentroNotificacionPendientes.add(id);
  try {
    await registrarCentroNotificacionDb({
      id, usuario: usuarioNorm, tipo: normalizarTexto(tipo), titulo: normalizarTexto(titulo),
      mensaje: normalizarTexto(mensaje), url: normalizarTexto(url || "./"),
      fecha: fechaHoraArgentinaIso(), clave: claveNorm,
    });
  } finally { idsCentroNotificacionPendientes.delete(id); }
  invalidarCache("centroNotificaciones");
}

async function obtenerCentroNotificaciones(usuario) {
  await asegurarAuxiliaresPostgres();
  return listarCentroNotificacionesDb(normalizarUsuario(usuario), 10);
}

async function marcarCentroNotificacion(usuario, id = "", todas = false) {
  await asegurarAuxiliaresPostgres();
  const cantidad = await marcarCentroNotificacionDb(normalizarUsuario(usuario), id, todas);
  invalidarCache("centroNotificaciones");
  return cantidad;
}

async function desactivarSuscripcionPush(endpoint) {
  await asegurarAuxiliaresPostgres();
  if (!endpoint) return;
  await desactivarSuscripcionPushDb(endpoint).catch(() => {});
  invalidarCache("suscripcionesPush");
}

async function obtenerSuscripcionesVencimientosPermitidas() {
  const [suscripciones, usuarios] = await Promise.all([
    obtenerSuscripcionesPush(),
    obtenerUsuarios(),
  ]);
  const porUsuario = new Map(usuarios.map((u) => [u.usuario, u]));
  return suscripciones.filter((s) => {
    const usuario = porUsuario.get(normalizarUsuario(s.usuario));
    return Boolean(
      usuario && usuario.activo && usuario.permisos?.vencimientos === true,
    );
  });
}

async function obtenerSuscripcionesUsuarioModulo(usuarioClave, modulo) {
  const clave = normalizarUsuario(usuarioClave);
  if (!clave) return [];
  const [suscripciones, usuarios] = await Promise.all([
    obtenerSuscripcionesPush(),
    obtenerUsuarios(),
  ]);
  const usuario = usuarios.find((u) => u.usuario === clave);
  if (!usuario || !usuario.activo || usuario.permisos?.[modulo] !== true)
    return [];
  return suscripciones.filter(
    (s) => normalizarUsuario(s.usuario) === clave && s.activo,
  );
}

async function enviarPushASuscripciones(suscripciones, payload) {
  if (!PUSH_CONFIGURED)
    return { enviados: 0, configurado: false, destinatarios: 0 };
  let enviados = 0;
  await Promise.all(
    (suscripciones || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 86400 },
        );
        enviados += 1;
      } catch (error) {
        if ([404, 410].includes(error?.statusCode))
          await desactivarSuscripcionPush(s.endpoint);
        else
          console.error(
            "Error enviando notificación push:",
            error?.statusCode || error?.message || error,
          );
      }
    }),
  );
  return {
    enviados,
    configurado: true,
    destinatarios: (suscripciones || []).length,
  };
}

let ultimoMinutoProcesadoTareas = "";

function resolverUsuarioPorResponsable(usuarios, responsable) {
  const clave = normalizarUsuario(responsable);
  if (!clave) return null;
  return (
    usuarios.find((u) => normalizarUsuario(u.usuario) === clave) ||
    usuarios.find((u) => normalizarUsuario(u.nombre) === clave) ||
    null
  );
}

function horaInicioDesdeTurnoValor(valorTurno, turnosSector) {
  const valor = normalizarTexto(valorTurno).toLowerCase();
  if (!valor || ["franco", "vacaciones", "ausente", "licencia"].includes(valor))
    return "";
  const configurado = (turnosSector || []).find(
    (t) => normalizarTexto(t.id).toLowerCase() === valor,
  );
  if (configurado?.inicio) return configurado.inicio;
  const match = normalizarTexto(valorTurno).match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "";
  const hora = Number(match[1]),
    minuto = Number(match[2] || 0);
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return "";
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

async function datosHorarioEntradaHoy() {
  const fecha = fechaArgentina();
  const mes = fecha.slice(0, 7);
  const dia = Number(fecha.slice(8, 10));
  return leerConCache(
    `notificacionesTareasHorario:${fecha}`,
    45000,
    async () => {
      await asegurarHorariosPostgres();
      const [calendario, sectores, usuarios] = await Promise.all([
        listarCalendarioFilas(), obtenerSectores(), obtenerUsuarios(),
      ]);
      const filas = calendario.filter((f) => normalizarTexto(f[1]) === mes && Number(f[3]) === dia);
      const porEmpleadoSector = new Map();
      for (const f of filas) {
        porEmpleadoSector.set(
          `${normalizarTexto(f[0])}|${normalizarUsuario(f[2])}`,
          normalizarTexto(f[4]),
        );
      }
      return { fecha, mes, dia, sectores, usuarios, porEmpleadoSector };
    },
  );
}

async function procesarNotificacionesInicioTareas() {
  const ahora = horaMinutoArgentina();
  const minutoActual = `${fechaArgentina()}|${String(ahora.hora).padStart(2, "0")}:${String(ahora.minuto).padStart(2, "0")}`;
  if (ultimoMinutoProcesadoTareas === minutoActual) return;
  ultimoMinutoProcesadoTareas = minutoActual;

  const horaActual = minutoActual.slice(-5);
  const [{ fecha, sectores, usuarios, porEmpleadoSector }, tareas] =
    await Promise.all([datosHorarioEntradaHoy(), obtenerTareasServidor()]);
  const sectoresPorIdONombre = new Map();
  sectores.forEach((s) => {
    sectoresPorIdONombre.set(normalizarTexto(s.id), s);
    sectoresPorIdONombre.set(normalizarTexto(s.nombre), s);
  });
  const grupos = new Map();

  for (const tarea of tareas) {
    const asignacionesDia = tarea.asignaciones?.[fecha] || {};
    for (const [turnoTarea, asignacion] of Object.entries(asignacionesDia)) {
      if (
        !asignacion ||
        normalizarTexto(asignacion.estado).toLowerCase() === "completada"
      )
        continue;
      const sectorInfo = sectoresPorIdONombre.get(
        normalizarTexto(tarea.sector),
      );
      if (!sectorInfo) continue;
      const turnosSector = await obtenerTurnosSector(sectorInfo.id);
      for (const responsable of asignacion.responsables || []) {
        const usuario = resolverUsuarioPorResponsable(usuarios, responsable);
        if (!usuario || !usuario.activo || usuario.permisos?.tareas !== true)
          continue;
        const clavesEmpleado = [usuario.nombre, usuario.usuario]
          .map(normalizarUsuario)
          .filter(Boolean);
        let valorTurno = "";
        for (const claveEmpleado of clavesEmpleado) {
          valorTurno =
            porEmpleadoSector.get(`${sectorInfo.id}|${claveEmpleado}`) ||
            valorTurno;
        }
        const horaEntrada = horaInicioDesdeTurnoValor(valorTurno, turnosSector);
        if (!horaEntrada || horaEntrada !== horaActual) continue;
        const claveGrupo = `${usuario.usuario}|${sectorInfo.id}|${fecha}|${horaEntrada}`;
        const grupo = grupos.get(claveGrupo) || {
          usuario,
          sector: sectorInfo,
          fecha,
          horaEntrada,
          tareas: [],
        };
        grupo.tareas.push({
          id: tarea.id,
          nombre: tarea.nombre,
          turno: turnoTarea,
        });
        grupos.set(claveGrupo, grupo);
      }
    }
  }

  if (!grupos.size) return;
  const enviadas = await clavesNotificacionesEnviadas();
  for (const grupo of grupos.values()) {
    const clave = `tareas-inicio|${grupo.fecha}|${grupo.usuario.usuario}|${grupo.sector.id}|${grupo.horaEntrada}`;
    if (enviadas.has(clave)) continue;
    const cantidad = grupo.tareas.length;
    const payload = {
      title: cantidad === 1 ? "Tarea para hoy" : "Tareas para tu turno",
      body:
        cantidad === 1
          ? `${grupo.tareas[0].nombre} · ${grupo.sector.nombre}`
          : `Tenés ${cantidad} tareas asignadas hoy en ${grupo.sector.nombre}`,
      tag: clave,
      data: {
        url: `./?modulo=tareas&fecha=${encodeURIComponent(grupo.fecha)}&sector=${encodeURIComponent(grupo.sector.id)}`,
      },
    };
    await registrarCentroNotificacion({
      usuario: grupo.usuario.usuario,
      tipo: "tarea",
      titulo: payload.title,
      mensaje: payload.body,
      url: payload.data.url,
      clave,
    });
    const suscripciones = await obtenerSuscripcionesUsuarioModulo(
      grupo.usuario.usuario,
      "tareas",
    );
    await enviarPushASuscripciones(suscripciones, payload);
    await registrarNotificacionEnviada(
      clave,
      "tareas-inicio",
      {
        id: grupo.usuario.usuario,
        codigo: grupo.sector.id,
        vencimiento: grupo.fecha,
      },
      payload.body,
    );
    enviadas.add(clave);
  }
}

async function notificarSupervisorTareaCompletada({
  tarea,
  fecha,
  turno,
  asignacion,
  completadaPor,
}) {
  const [sectores, usuarios, enviadas] = await Promise.all([
    obtenerSectores(),
    obtenerUsuarios(),
    clavesNotificacionesEnviadas(),
  ]);
  const sector = sectores.find((s) =>
    [normalizarTexto(s.id), normalizarTexto(s.nombre)].includes(
      normalizarTexto(tarea.sector),
    ),
  );
  if (!sector?.supervisor) return;
  const supervisor = usuarios.find(
    (u) =>
      normalizarUsuario(u.usuario) === normalizarUsuario(sector.supervisor),
  );
  if (!supervisor || !supervisor.activo || supervisor.permisos?.tareas !== true)
    return;
  const clave = `tarea-completada|${tarea.id}|${fecha}|${turno}`;
  if (enviadas.has(clave)) return;
  const quien = normalizarTexto(
    asignacion?.completadaPor ||
      completadaPor?.nombre ||
      completadaPor?.usuario ||
      "Un usuario",
  );
  const payload = {
    title: "Tarea completada",
    body: `${quien} completó “${tarea.nombre}” en ${sector.nombre}`,
    tag: clave,
    data: {
      url: `./?modulo=tareas&fecha=${encodeURIComponent(fecha)}&sector=${encodeURIComponent(sector.id)}`,
    },
  };
  await registrarCentroNotificacion({
    usuario: supervisor.usuario,
    tipo: "tarea",
    titulo: payload.title,
    mensaje: payload.body,
    url: payload.data.url,
    clave,
  });
  const suscripciones = await obtenerSuscripcionesUsuarioModulo(
    supervisor.usuario,
    "tareas",
  );
  await enviarPushASuscripciones(suscripciones, payload);
  await registrarNotificacionEnviada(
    clave,
    "tarea-completada",
    { id: tarea.id, codigo: supervisor.usuario, vencimiento: fecha },
    payload.body,
  );
}

function diasEntreFechasIso(fechaA, fechaB) {
  const parsear = (valor) => {
    const m = normalizarTexto(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const a = parsear(fechaA),
    b = parsear(fechaB);
  return Number.isFinite(a) && Number.isFinite(b)
    ? Math.floor((b - a) / 86400000)
    : null;
}

function responsableBanoParaFecha(config, fechaIso) {
  const participantes = Array.isArray(config?.participantes)
    ? config.participantes.map(normalizarTexto).filter(Boolean)
    : [];
  const fechaAncla = normalizarTexto(config?.fechaAncla);
  if (!participantes.length || !fechaAncla) return "";
  const dias = diasEntreFechasIso(fechaAncla, fechaIso);
  if (dias === null || ((dias % 2) + 2) % 2 !== 0) return "";
  const turno = Math.floor(dias / 2);
  const indice =
    ((turno % participantes.length) + participantes.length) %
    participantes.length;
  return participantes[indice] || "";
}

async function resolverUsuarioResponsableBano(valor) {
  const clave = normalizarUsuario(valor);
  if (!clave) return null;
  const usuarios = await obtenerUsuarios();
  return (
    usuarios.find((u) => u.usuario === clave) ||
    usuarios.find((u) => normalizarUsuario(u.nombre) === clave) ||
    null
  );
}

function limpiezaBanoConfirmada(config, fechaIso) {
  return (Array.isArray(config?.historial) ? config.historial : []).some(
    (item) => normalizarTexto(item?.fecha) === fechaIso,
  );
}

function claveNotificacionBano(fechaIso, tipo, usuario) {
  return ["bano", fechaIso, tipo, normalizarUsuario(usuario)].join("|");
}

async function procesarNotificacionBano(tipo) {
  if (!PUSH_CONFIGURED || !["08", "16"].includes(tipo)) return { enviados: 0 };
  const fecha = fechaArgentina();
  const config = await leerBanoServidor();
  const participante = responsableBanoParaFecha(config, fecha);
  if (!participante) return { enviados: 0, descanso: true };
  if (tipo === "16" && limpiezaBanoConfirmada(config, fecha))
    return { enviados: 0, confirmada: true };

  const usuario = await resolverUsuarioResponsableBano(participante);
  if (!usuario || !usuario.activo || usuario.permisos?.tareas !== true)
    return { enviados: 0, sinDestinatario: true };

  const clave = claveNotificacionBano(fecha, tipo, usuario.usuario);
  const enviadas = await clavesNotificacionesEnviadas();
  if (enviadas.has(clave)) return { enviados: 0, duplicada: true };

  const payload =
    tipo === "08"
      ? {
          title: "Hoy te corresponde limpiar el baño",
          body: "Tu turno es hoy. Confirmá la limpieza cuando termines.",
          tag: `bano-${fecha}-08-${usuario.usuario}`,
          data: {
            url: `./?modulo=tareas&vista=bano&fecha=${encodeURIComponent(fecha)}`,
          },
        }
      : {
          title: "Limpieza del baño pendiente",
          body: "Todavía no registraste la limpieza de hoy.",
          tag: `bano-${fecha}-16-${usuario.usuario}`,
          data: {
            url: `./?modulo=tareas&vista=bano&fecha=${encodeURIComponent(fecha)}`,
          },
        };

  await registrarCentroNotificacion({
    usuario: usuario.usuario,
    tipo: "bano",
    titulo: payload.title,
    mensaje: payload.body,
    url: payload.data.url,
    clave: payload.tag,
  });
  const suscripciones = await obtenerSuscripcionesUsuarioModulo(
    usuario.usuario,
    "tareas",
  );
  const resultado = suscripciones.length
    ? await enviarPushASuscripciones(suscripciones, payload)
    : { enviados: 0, sinSuscripciones: true };
  if (resultado.enviados > 0) {
    await registrarNotificacionEnviada(
      clave,
      `bano-${tipo}`,
      {
        id: `bano-${fecha}`,
        codigo: usuario.usuario,
        vencimiento: fecha,
      },
      payload.body,
    );
  }
  return resultado;
}

async function enviarPushVencimientos(payload) {
  if (!PUSH_CONFIGURED)
    return { enviados: 0, configurado: false, destinatarios: 0 };
  const suscripciones = await obtenerSuscripcionesVencimientosPermitidas();
  let enviados = 0;
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 86400 },
        );
        enviados += 1;
      } catch (error) {
        if ([404, 410].includes(error?.statusCode))
          await desactivarSuscripcionPush(s.endpoint);
        else
          console.error(
            "Error enviando notificación push:",
            error?.statusCode || error?.message || error,
          );
      }
    }),
  );
  return { enviados, configurado: true, destinatarios: suscripciones.length };
}

function claveUnicaAlertaVencimiento(registro, tipo) {
  if (tipo === "nuevo")
    return ["vencimiento-nuevo", normalizarTexto(registro.id)].join("|");
  return [
    normalizarCodigo(registro.codigo),
    normalizarTexto(registro.vencimiento),
    normalizarTexto(tipo),
    fechaIsoHoy(),
  ].join("|");
}

function payloadNuevoVencimiento(registro) {
  const cantidad = numero(registro.cantidad);
  const unidades = `${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}`;
  return {
    title: "Nuevo vencimiento cargado",
    body: `${registro.articulo} · ${unidades} · vence ${registro.vencimiento}`,
    tag: `venc-${registro.id}-nuevo`,
    data: { url: "./?modulo=vencimientos&vista=proximos" },
  };
}

async function enviarAlertaRegistro(
  registro,
  dias,
  tipo,
  clave = claveUnicaAlertaVencimiento(registro, tipo),
  clavesConocidas = null,
) {
  if (tipo !== "nuevo") return { enviados: 0, omitida: true };
  if (clavesNotificacionEnProceso.has(clave))
    return { enviados: 0, duplicada: true };
  clavesNotificacionEnProceso.add(clave);
  try {
    const enviadas = clavesConocidas || (await clavesNotificacionesEnviadas());
    if (enviadas.has(clave)) return { enviados: 0, duplicada: true };
    const payload = payloadNuevoVencimiento(registro);
    const usuarios = (await obtenerUsuarios()).filter(
      (u) => u.activo && u.permisos?.vencimientos === true,
    );
    await Promise.all(
      usuarios.map((u) =>
        registrarCentroNotificacion({
          usuario: u.usuario,
          tipo: "vencimientos",
          titulo: payload.title,
          mensaje: payload.body,
          url: payload.data.url,
          clave: `${clave}|${u.usuario}`,
        }),
      ),
    );
    const resultado = await enviarPushVencimientos(payload);
    if (resultado.enviados > 0) {
      await registrarNotificacionEnviada(clave, tipo, registro, payload.body);
      enviadas.add(clave);
    }
    return resultado;
  } finally {
    clavesNotificacionEnProceso.delete(clave);
  }
}

function claveResumenVencimientos(fecha, tipo) {
  return ["resumen-vencimientos", fecha, tipo].join("|");
}

function payloadResumenVencimientos(tipo, cantidad) {
  if (tipo === "vencidos") {
    return {
      title: "Productos vencidos",
      body:
        cantidad === 1
          ? "Hay 1 producto vencido."
          : `Hay ${cantidad} productos vencidos.`,
      tag: `resumen-vencidos-${fechaIsoHoy()}`,
      data: { url: "./?modulo=vencimientos&vista=vencidos" },
    };
  }
  const dias = Number(tipo);
  const titulo = dias === 1 ? "Vencen en 1 día" : `Vencen en ${dias} días`;
  return {
    title: titulo,
    body:
      cantidad === 1
        ? `Hay 1 producto que vence en ${dias === 1 ? "1 día" : `${dias} días`}.`
        : `Hay ${cantidad} productos que vencen en ${dias === 1 ? "1 día" : `${dias} días`}.`,
    tag: `resumen-vencimientos-${fechaIsoHoy()}-${dias}`,
    data: { url: `./?modulo=vencimientos&vista=proximos&dias=${dias}` },
  };
}

async function enviarResumenVencimientos(tipo, registros, enviadas) {
  if (!Array.isArray(registros) || !registros.length)
    return { enviados: 0, vacio: true };
  const fecha = fechaIsoHoy();
  const clave = claveResumenVencimientos(fecha, tipo);
  if (enviadas.has(clave) || clavesNotificacionEnProceso.has(clave))
    return { enviados: 0, duplicada: true };
  clavesNotificacionEnProceso.add(clave);
  try {
    const payload = payloadResumenVencimientos(tipo, registros.length);
    const usuarios = (await obtenerUsuarios()).filter(
      (u) => u.activo && u.permisos?.vencimientos === true,
    );
    await Promise.all(
      usuarios.map((u) =>
        registrarCentroNotificacion({
          usuario: u.usuario,
          tipo: "vencimientos",
          titulo: payload.title,
          mensaje: payload.body,
          url: payload.data.url,
          clave: `${clave}|${u.usuario}`,
        }),
      ),
    );
    const resultado = await enviarPushVencimientos(payload);
    if (resultado.enviados > 0) {
      const registroResumen = {
        id: `resumen-${tipo}-${fecha}`,
        codigo: tipo,
        vencimiento: fecha,
      };
      await registrarNotificacionEnviada(
        clave,
        `resumen-${tipo}`,
        registroResumen,
        payload.body,
      );
      enviadas.add(clave);
    }
    return resultado;
  } finally {
    clavesNotificacionEnProceso.delete(clave);
  }
}

async function procesarAlertasVencimientos() {
  if (procesandoNotificaciones || !PUSH_CONFIGURED) return;
  procesandoNotificaciones = true;
  try {
    const [vencimientos, enviadas] = await Promise.all([
      obtenerVencimientos(),
      clavesNotificacionesEnviadas(),
    ]);
    const grupos = { 1: [], 3: [], 7: [], 15: [], vencidos: [] };

    for (const registro of vencimientos) {
      const dias = diasDesdeHoyArgentina(registro.vencimiento);
      if (dias === null) continue;
      if ([1, 3, 7, 15].includes(dias)) grupos[String(dias)].push(registro);
      else if (dias < 0) grupos.vencidos.push(registro);
    }

    for (const tipo of ["1", "3", "7", "15", "vencidos"]) {
      await enviarResumenVencimientos(tipo, grupos[tipo], enviadas);
    }
  } catch (error) {
    console.error("Error procesando alertas agrupadas de vencimientos:", error);
  } finally {
    procesandoNotificaciones = false;
  }
}

app.get("/notificaciones/centro", requerirSesion, async (req, res) => {
  try {
    const notificaciones = await obtenerCentroNotificaciones(
      req.usuario.usuario,
    );
    res.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
    res.json({
      ok: true,
      notificaciones,
      noLeidas: notificaciones.filter((n) => !n.leida).length,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudieron cargar las notificaciones",
    });
  }
});

app.patch(
  "/notificaciones/centro/:id/leida",
  requerirSesion,
  async (req, res) => {
    try {
      await marcarCentroNotificacion(req.usuario.usuario, req.params.id, false);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        ok: false,
        mensaje: error.message || "No se pudo actualizar la notificación",
      });
    }
  },
);

app.patch("/notificaciones/centro-leidas", requerirSesion, async (req, res) => {
  try {
    const actualizadas = await marcarCentroNotificacion(
      req.usuario.usuario,
      "",
      true,
    );
    res.json({ ok: true, actualizadas });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudieron actualizar las notificaciones",
    });
  }
});

app.get("/notificaciones/public-key", (req, res) => {
  res.json({
    ok: true,
    configurado: PUSH_CONFIGURED,
    publicKey: VAPID_PUBLIC_KEY || "",
  });
});

app.post("/notificaciones/suscribir", requerirSesion, async (req, res) => {
  try {
    if (!PUSH_CONFIGURED)
      return res.status(503).json({
        ok: false,
        mensaje: "Las notificaciones todavía no están configuradas en Render",
      });
    await guardarSuscripcionPush(req);
    res.json({
      ok: true,
      mensaje:
        "Notificaciones activadas. Los avisos diarios se envían a las 08:00.",
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      mensaje: error.message || "No se pudo guardar la suscripción",
    });
  }
});

app.post("/notificaciones/procesar", requerirAlgunModulo("vencimientos"), async (req, res) => {
  await procesarAlertasVencimientos();
  res.json({ ok: true });
});

app.all("/notificaciones/cron", async (req, res) => {
  const secreto = normalizarTexto(req.get("x-cron-secret") || req.query.secret);
  if (!NOTIFICATION_CRON_SECRET || secreto !== NOTIFICATION_CRON_SECRET)
    return res
      .status(403)
      .json({ ok: false, mensaje: "Secreto de cron inválido" });
  await procesarAlertasVencimientos();
  res.json({ ok: true });
});

app.get("/vencimientos", requerirAlgunModulo("vencimientos"), async (req, res) => {
  try {
    const vencimientos = (await obtenerVencimientos()).reverse();
    res.json({ ok: true, total: vencimientos.length, vencimientos });
  } catch (error) {
    console.error("Error en /vencimientos:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al obtener vencimientos",
    });
  }
});

app.post("/vencimientos", requerirAlgunModulo("vencimientos"), async (req, res) => {
  try {
    const codigo = normalizarCodigo(req.body.codigo);
    const vencimiento = normalizarTexto(req.body.vencimiento);
    const cantidad = cantidadVencimientoDesdeBody(req.body);
    const rubro = normalizarRubroVencimiento(req.body.rubro);

    if (!codigo)
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    if (!vencimiento)
      return res
        .status(400)
        .json({ ok: false, mensaje: "Falta la fecha de vencimiento" });
    if (rubro === "Sin clasificar")
      return res.status(400).json({
        ok: false,
        mensaje: "Seleccioná un rubro: Almacén, Bebidas, Fiambrería o Lácteos",
      });
    if (!fechaNoAnteriorAHoy(vencimiento))
      return res.status(400).json({
        ok: false,
        mensaje: "La fecha de vencimiento no puede ser anterior a hoy",
      });
    if (cantidad === null || cantidad <= 0)
      return res.status(400).json({
        ok: false,
        mensaje: "La cantidad debe ser un número entero mayor a 0",
      });

    const producto = await buscarProductoMaestroPorCodigo(codigo);
    const articulo = normalizarTexto(req.body.articulo) || producto?.articulo;
    if (!articulo)
      return res.status(404).json({
        ok: false,
        mensaje: "Producto no encontrado en la hoja Productos",
      });

    await asegurarVencimientosPostgres();
    const registroBase = {
      id: generarIdVencimiento(),
      fecha_carga: fechaIsoHoy(),
      codigo,
      articulo,
      vencimiento,
      cantidad,
      oferta: normalizarOfertaVencimiento(req.body.oferta),
      rubro,
    };
    const guardado = await crearVencimientoDb(registroBase);
    const registro = {
      ...guardado,
      estado: calcularEstadoVencimiento(guardado.vencimiento),
    };
    invalidarCache("vencimientos");
    await registrarHistorialVencimiento(
      req,
      "Creó",
      registro,
      `Cantidad: ${registro.cantidad}`,
    );
    const diasRestantes = diasDesdeHoyArgentina(registro.vencimiento);
    if (PUSH_CONFIGURED) {
      const tipo = "nuevo";
      const clave = claveUnicaAlertaVencimiento(registro, tipo);
      setImmediate(async () => {
        try {
          const enviadas = await clavesNotificacionesEnviadas();
          if (!enviadas.has(clave))
            await enviarAlertaRegistro(registro, diasRestantes, tipo, clave);
        } catch (error) {
          console.error(
            "No se pudo enviar la notificación de nuevo vencimiento:",
            error,
          );
        }
      });
    }
    res.json({
      ok: true,
      mensaje: "Vencimiento guardado",
      vencimiento: registro,
    });
  } catch (error) {
    console.error("Error en POST /vencimientos:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al guardar vencimiento",
    });
  }
});

app.put("/vencimientos/:id", requerirAlgunModulo("vencimientos"), async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find((item) => item.id === id);
    if (!registro)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });

    const cantidad = cantidadVencimientoDesdeBody(req.body);
    const vencimiento = normalizarTexto(req.body.vencimiento);
    const rubro =
      req.body.rubro === undefined
        ? registro.rubro
        : normalizarRubroVencimiento(req.body.rubro);
    if (!vencimiento)
      return res
        .status(400)
        .json({ ok: false, mensaje: "Falta la fecha de vencimiento" });
    if (rubro === "Sin clasificar")
      return res.status(400).json({
        ok: false,
        mensaje: "Seleccioná un rubro: Almacén, Bebidas, Fiambrería o Lácteos",
      });
    if (
      vencimiento !== registro.vencimiento &&
      !fechaNoAnteriorAHoy(vencimiento)
    )
      return res.status(400).json({
        ok: false,
        mensaje: "La nueva fecha de vencimiento no puede ser anterior a hoy",
      });
    const cantidadOriginal = Math.max(0, Number(registro.cantidad) || 0);
    // Los registros migrados sin cantidad positiva pueden conservar 0.
    // Un registro que ya tenía cantidad positiva no puede bajarse a 0.
    if (
      cantidad === null ||
      cantidad < 0 ||
      (cantidad === 0 && cantidadOriginal > 0)
    )
      return res.status(400).json({
        ok: false,
        mensaje:
          cantidadOriginal === 0
            ? "La cantidad debe ser un número entero válido"
            : "La cantidad debe ser un número entero mayor a 0",
      });

    const actualizadoDb = await actualizarVencimientoDb(id, {
      vencimiento,
      cantidad,
      rubro,
      oferta:
        req.body.oferta === undefined
          ? registro.oferta
          : normalizarOfertaVencimiento(req.body.oferta),
    });
    if (!actualizadoDb)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });
    const actualizado = {
      ...actualizadoDb,
      estado: calcularEstadoVencimiento(actualizadoDb.vencimiento),
    };
    invalidarCache("vencimientos");
    await registrarHistorialVencimiento(
      req,
      "Editó",
      actualizado,
      `Antes: ${registro.vencimiento} / ${registro.cantidad} · Después: ${actualizado.vencimiento} / ${actualizado.cantidad}`,
    );
    res.json({
      ok: true,
      mensaje: "Vencimiento actualizado",
      vencimiento: actualizado,
    });
  } catch (error) {
    console.error("Error en PUT /vencimientos/:id:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al actualizar vencimiento",
    });
  }
});

app.patch("/vencimientos/:id/oferta", requerirAlgunModulo("vencimientos"), async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find((item) => item.id === id);
    if (!registro)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });

    const oferta = normalizarOfertaVencimiento(req.body.oferta);
    const actualizadoDb = await actualizarVencimientoDb(id, { oferta });
    if (!actualizadoDb)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });
    const actualizado = {
      ...actualizadoDb,
      estado: calcularEstadoVencimiento(actualizadoDb.vencimiento),
    };
    invalidarCache("vencimientos");
    res.json({
      ok: true,
      mensaje: oferta === "Sí" ? "Oferta marcada" : "Oferta quitada",
      vencimiento: actualizado,
    });
  } catch (error) {
    console.error("Error en PATCH /vencimientos/:id/oferta:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al actualizar oferta",
    });
  }
});

app.delete("/vencimientos/:id", requerirAlgunModulo("vencimientos"), async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find((item) => item.id === id);
    if (!registro)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });
    const eliminado = await eliminarVencimientoDb(id);
    if (!eliminado)
      return res
        .status(404)
        .json({ ok: false, mensaje: "Registro no encontrado" });
    invalidarCache("vencimientos");
    await registrarHistorialVencimiento(
      req,
      "Eliminó",
      registro,
      `Cantidad: ${registro.cantidad}`,
    );
    res.json({ ok: true, mensaje: "Vencimiento eliminado" });
  } catch (error) {
    console.error("Error en DELETE /vencimientos/:id:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al eliminar vencimiento",
    });
  }
});

async function asegurarHojaHistorialVencimientos() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets || []).some(
    (h) => h.properties?.title === HISTORIAL_VENCIMIENTOS_SHEET_NAME,
  );
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: HISTORIAL_VENCIMIENTOS_SHEET_NAME },
            },
          },
        ],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HISTORIAL_VENCIMIENTOS_SHEET_NAME}!A1:J1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            "Fecha",
            "Hora",
            "Usuario",
            "Nombre",
            "Acción",
            "ID",
            "Código",
            "Artículo",
            "Vencimiento",
            "Detalle",
          ],
        ],
      },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${HISTORIAL_VENCIMIENTOS_SHEET_NAME}!K1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Cantidad"]] },
  });
}

async function registrarHistorialVencimiento(
  req,
  accion,
  registro,
  detalle = "",
) {
  await asegurarAuxiliaresPostgres();
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(ahora);
  const get = (t) => partes.find((x) => x.type === t)?.value || "";
  await registrarHistorialVencimientoDb({
    fecha: `${get("day")}/${get("month")}/${get("year")}`,
    hora: `${get("hour")}:${get("minute")}:${get("second")}`,
    usuario: req.usuario?.usuario || "desconocido",
    nombre: req.usuario?.nombre || "",
    accion,
    id: registro?.id || "",
    codigo: registro?.codigo || "",
    articulo: registro?.articulo || "",
    vencimiento: registro?.vencimiento || "",
    detalle,
    cantidad: registro?.cantidad ?? "",
  });
}

app.get(
  "/admin/historial-vencimientos",
  requerirAdministrador,
  async (req, res) => {
    try {
      await asegurarAuxiliaresPostgres();
      res.json({ ok: true, historial: await listarHistorialVencimientosDb() });
    } catch (error) {
      res.status(500).json({
        ok: false,
        mensaje: error.message || "No se pudo obtener el historial",
      });
    }
  },
);

function normalizarNumeroLista(valor) {
  return String(valor) === "2" ? "2" : "1";
}
function crearIdReposicion() {
  return `REP-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

async function asegurarHojaListas() {
  if (promesaHojaListasLista) return promesaHojaListasLista;
  promesaHojaListasLista = (async () => {
    const meta = await leerConCache(
      "metadata-hoja-listas",
      CACHE_TTL.metadata,
      async () => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }),
    );
    const existe = (meta.data.sheets || []).some(
      (s) => s.properties?.title === LISTAS_SHEET_NAME,
    );
    if (!existe) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: LISTAS_SHEET_NAME } } },
          ],
        },
      });
      invalidarCache("metadata-hoja-listas");
    }
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTAS_SHEET_NAME}!A1:I1`,
    });
    if (!(respuesta.data.values || []).length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LISTAS_SHEET_NAME}!A1:I1`,
        valueInputOption: "RAW",
        requestBody: { values: [LISTAS_HEADERS] },
      });
    }
    return true;
  })().catch((error) => {
    promesaHojaListasLista = null;
    throw error;
  });
  return promesaHojaListasLista;
}

function filaARegistroReposicion(fila = [], indice = 0) {
  return {
    id: normalizarTexto(fila[0]),
    usuario: normalizarUsuario(fila[1]),
    lista: normalizarNumeroLista(fila[2]),
    codigo: normalizarCodigo(fila[3]),
    articulo: normalizarTexto(fila[4]),
    cantidad: enteroPositivo(fila[5]) || 1,
    estado:
      normalizarTexto(fila[6]).toLowerCase() === "completado"
        ? "completado"
        : "pendiente",
    orden:
      Number.isFinite(Number(fila[7])) && Number(fila[7]) > 0
        ? Number(fila[7])
        : indice + 1,
    actualizado: normalizarTexto(fila[8]),
  };
}
function registroAFilaReposicion(r) {
  return [
    r.id,
    r.usuario,
    r.lista,
    r.codigo,
    r.articulo,
    r.cantidad,
    r.estado,
    r.orden || 0,
    r.actualizado || fechaHoraArgentinaIso(),
  ];
}
async function obtenerListasReposicionLegacy() {
  await asegurarHojaListas();
  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${LISTAS_SHEET_NAME}!A2:I`,
  });
  return (respuesta.data.values || [])
    .map((fila, indice) => ({ ...filaARegistroReposicion(fila, indice), filaGoogle: indice + 2 }))
    .filter((r) => r.id && r.usuario && r.codigo);
}

const MIGRACION_LISTAS_REPOSICION = "2026-08-28-listas-reposicion-v1";
let promesaListasReposicionPostgres = null;
async function asegurarListasReposicionPostgres() {
  await asegurarEsquemaUsuariosSectores();
  await asegurarEsquemaListasReposicion();
  if (await migracionDatosCompletada(MIGRACION_LISTAS_REPOSICION)) return;
  if (promesaListasReposicionPostgres) return promesaListasReposicionPostgres;
  promesaListasReposicionPostgres = (async () => {
    if (await migracionDatosCompletada(MIGRACION_LISTAS_REPOSICION)) return;
    // Importación inicial de solo lectura: la hoja Listas queda como respaldo histórico.
    const registros = await obtenerListasReposicionLegacy();
    const importado = await importarListasReposicionAtomico(
      registros,
      MIGRACION_LISTAS_REPOSICION,
    );
    if (importado) {
      console.log(
        `PostgreSQL Etapa 7: Listas/Mi Lista importadas desde Sheets (${registros.length} registros).`,
      );
    }
  })();
  try {
    await promesaListasReposicionPostgres;
  } finally {
    promesaListasReposicionPostgres = null;
  }
}


const MIGRACION_AUXILIARES = "2026-08-28-auxiliares-v1";
let promesaAuxiliaresPostgres = null;

async function leerRangoAuxiliarLegacy(nombreHoja, rango) {
  try {
    validarConfiguracion();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${nombreHoja}!${rango}`,
    });
    return r.data.values || [];
  } catch (error) {
    const mensaje = String(error?.message || "").toLowerCase();
    if (mensaje.includes("unable to parse range") || mensaje.includes("not found")) return [];
    throw error;
  }
}

async function obtenerAuxiliaresLegacy() {
  const [adminF, offlineF, pushF, logF, centroF, vencHistF] = await Promise.all([
    leerRangoAuxiliarLegacy(HISTORIAL_ADMIN_SHEET_NAME, "A2:H"),
    leerRangoAuxiliarLegacy(OFFLINE_OPERATIONS_SHEET_NAME, "A2:G"),
    leerRangoAuxiliarLegacy(PUSH_SUBSCRIPTIONS_SHEET_NAME, "A2:G"),
    leerRangoAuxiliarLegacy(NOTIFICATION_LOG_SHEET_NAME, "A2:G"),
    leerRangoAuxiliarLegacy(NOTIFICATION_CENTER_SHEET_NAME, "A2:I"),
    leerRangoAuxiliarLegacy(HISTORIAL_VENCIMIENTOS_SHEET_NAME, "A2:K"),
  ]);
  return {
    admin: adminF.map((f) => ({
      fecha:f[0]||"", hora:f[1]||"", usuario:f[2]||"", nombre:f[3]||"",
      accion:f[4]||"", entidad:f[5]||"", identificador:f[6]||"", detalle:f[7]||"",
    })),
    offline: offlineF.map((f) => ({
      id:f[0]||"", usuario:f[1]||"", fecha:f[2]||"", metodo:f[3]||"",
      ruta:f[4]||"", estado:f[5]||"", respuesta:f[6]||"",
    })).filter((x)=>x.id && x.usuario),
    push: pushF.map((f) => ({
      endpoint:f[0]||"", p256dh:f[1]||"", auth:f[2]||"", usuario:f[3]||"",
      nombre:f[4]||"", activo:normalizarTexto(f[5]).toLowerCase()!=="no", actualizado:f[6]||"",
    })).filter((x)=>x.endpoint && x.p256dh && x.auth),
    notificationLog: logF.map((f)=>({
      clave:f[0]||"", fecha:f[1]||"", tipo:f[2]||"", id:f[3]||"",
      codigo:f[4]||"", vencimiento:f[5]||"", detalle:f[6]||"",
    })),
    notificationCenter: centroF.map((f)=>({
      id:f[0]||"", usuario:f[1]||"", tipo:f[2]||"", titulo:f[3]||"",
      mensaje:f[4]||"", url:f[5]||"./", fecha:f[6]||"",
      leida:["si","sí"].includes(normalizarTexto(f[7]).toLowerCase()), clave:f[8]||"",
    })).filter((x)=>x.id && x.usuario),
    expirationHistory: vencHistF.map((f)=>({
      fecha:f[0]||"", hora:f[1]||"", usuario:f[2]||"", nombre:f[3]||"",
      accion:f[4]||"", id:f[5]||"", codigo:f[6]||"", articulo:f[7]||"",
      vencimiento:f[8]||"", detalle:f[9]||"", cantidad:f[10]??"",
    })),
  };
}

async function asegurarAuxiliaresPostgres() {
  await asegurarEsquemaUsuariosSectores();
  await asegurarEsquemaAuxiliares();
  if (await migracionDatosCompletada(MIGRACION_AUXILIARES)) return;
  if (promesaAuxiliaresPostgres) return promesaAuxiliaresPostgres;
  promesaAuxiliaresPostgres = (async () => {
    if (await migracionDatosCompletada(MIGRACION_AUXILIARES)) return;
    const datos = await obtenerAuxiliaresLegacy();
    const importado = await importarAuxiliaresAtomico(datos, MIGRACION_AUXILIARES);
    if (importado) {
      console.log(
        `PostgreSQL Etapa 8: datos auxiliares importados desde Sheets (` +
        `${datos.admin.length} historial admin, ${datos.offline.length} offline, ` +
        `${datos.push.length} suscripciones, ${datos.notificationLog.length} registros de notificación, ` +
        `${datos.notificationCenter.length} centro de notificaciones, ${datos.expirationHistory.length} historial vencimientos).`,
      );
    }
  })();
  try { await promesaAuxiliaresPostgres; }
  finally { promesaAuxiliaresPostgres = null; }
}

async function leerTodasLasListas(cliente = null) {
  await asegurarListasReposicionPostgres();
  const registros = await listarListasReposicionDb(cliente);
  return registros.map((r) => ({ ...r }));
}
async function escribirTodasLasListas(registros, cliente = null) {
  await asegurarListasReposicionPostgres();
  await reemplazarListasReposicionDb(registros, cliente);
}
async function obtenerListaReposicionPersistente(usuario, numeroLista) {
  const claveUsuario = normalizarUsuario(usuario);
  const lista = normalizarNumeroLista(numeroLista);
  const todos = await leerTodasLasListas();
  return todos
    .filter((r) => r.usuario === claveUsuario && r.lista === lista)
    .sort((a, b) =>
      a.estado === b.estado
        ? a.orden - b.orden
        : a.estado === "pendiente"
          ? -1
          : 1,
    );
}
function limpiarRegistroReposicion(registro, numeroLista = "1") {
  return {
    id: registro.id,
    fecha: registro.actualizado,
    codigo: registro.codigo,
    articulo: registro.articulo,
    cantidad: enteroPositivo(registro.cantidad) || 1,
    estado: registro.estado === "completado" ? "completado" : "pendiente",
    actualizado: registro.actualizado,
    usuario: registro.usuario,
    lista: normalizarNumeroLista(numeroLista),
    orden: Number(registro.orden) || 0,
  };
}

app.get("/reposicion", requerirAlgunModulo("anotar"), async (req, res) => {
  try {
    const numeroLista = normalizarNumeroLista(req.query.lista);
    const registros = (
      await obtenerListaReposicionPersistente(req.usuario.usuario, numeroLista)
    ).map((r) => limpiarRegistroReposicion(r, numeroLista));
    res.json({
      ok: true,
      total: registros.length,
      lista: numeroLista,
      usuario: req.usuario,
      registros,
    });
  } catch (error) {
    console.error("Error en GET /reposicion:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al obtener reposición",
    });
  }
});

app.post("/reposicion/lote", requerirAlgunModulo("anotar"), async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.usuario.usuario);
    const numeroLista = normalizarNumeroLista(req.body.lista);
    const entradas = Array.isArray(req.body.items) ? req.body.items : [];
    const items = entradas
      .map((item, indice) => ({
        codigo: normalizarCodigo(
          item?.codigo || `ESCRITO-${Date.now()}-${indice + 1}`,
        ),
        articulo: normalizarTexto(item?.articulo),
        cantidad: enteroPositivo(item?.cantidad),
      }))
      .filter((item) => item.codigo && item.articulo && item.cantidad !== null);
    if (!items.length)
      return res
        .status(400)
        .json({ ok: false, mensaje: "Escribí al menos un producto válido" });

    const resultados = await ejecutarEnCola(
      "listas-global",
      async () => conTransaccionListasReposicion(async (cliente) => {
        const todos = await leerTodasLasListas(cliente);
        const ahora = fechaHoraArgentinaIso();
        let orden = Math.max(
          0,
          ...todos
            .filter((x) => x.usuario === usuario && x.lista === numeroLista)
            .map((x) => Number(x.orden) || 0),
        );
        const guardados = [];
        for (const item of items) {
          let r = todos.find(
            (x) =>
              x.usuario === usuario &&
              x.lista === numeroLista &&
              x.codigo === item.codigo,
          );
          if (r) {
            r.cantidad += item.cantidad;
            r.estado = "pendiente";
            r.actualizado = ahora;
            // En listas escritas se conserva el texto más reciente exactamente como fue ingresado.
            r.articulo = item.articulo;
          } else {
            orden += 1;
            r = {
              id: crearIdReposicion(),
              usuario,
              lista: numeroLista,
              codigo: item.codigo,
              articulo: item.articulo,
              cantidad: item.cantidad,
              estado: "pendiente",
              orden,
              actualizado: ahora,
            };
            todos.push(r);
          }
          guardados.push(r);
        }
        await escribirTodasLasListas(todos, cliente);
        return guardados;
      }),
    );

    res.json({
      ok: true,
      lista: numeroLista,
      total: resultados.length,
      mensaje: `${resultados.length} producto${resultados.length === 1 ? "" : "s"} agregado${resultados.length === 1 ? "" : "s"}`,
      registros: resultados.map((r) =>
        limpiarRegistroReposicion(r, numeroLista),
      ),
    });
  } catch (error) {
    console.error("Error en POST /reposicion/lote:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo guardar la lista escrita",
    });
  }
});

app.post("/reposicion", requerirAlgunModulo("anotar"), async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.usuario.usuario),
      numeroLista = normalizarNumeroLista(req.body.lista);
    const codigo = normalizarCodigo(req.body.codigo),
      articulo = normalizarTexto(req.body.articulo),
      cantidad = enteroPositivo(req.body.cantidad);
    if (!codigo || !articulo)
      return res.status(400).json({ ok: false, mensaje: "Falta el producto" });
    if (cantidad === null)
      return res
        .status(400)
        .json({ ok: false, mensaje: "Ingresá una cantidad entera mayor a 0" });
    const resultado = await ejecutarEnCola(
      "listas-global",
      async () => conTransaccionListasReposicion(async (cliente) => {
        const todos = await leerTodasLasListas(cliente);
        let r = todos.find(
          (x) =>
            x.usuario === usuario &&
            x.lista === numeroLista &&
            x.codigo === codigo,
        );
        const ahora = fechaHoraArgentinaIso();
        if (r) {
          r.cantidad += cantidad;
          r.estado = "pendiente";
          r.actualizado = ahora;
        } else {
          const orden =
            Math.max(
              0,
              ...todos
                .filter((x) => x.usuario === usuario && x.lista === numeroLista)
                .map((x) => Number(x.orden) || 0),
            ) + 1;
          r = {
            id: crearIdReposicion(),
            usuario,
            lista: numeroLista,
            codigo,
            articulo,
            cantidad,
            estado: "pendiente",
            orden,
            actualizado: ahora,
          };
          todos.push(r);
        }
        await escribirTodasLasListas(todos, cliente);
        return r;
      }),
    );
    res.json({
      ok: true,
      lista: numeroLista,
      mensaje: `Producto agregado a Lista ${numeroLista}`,
      registro: limpiarRegistroReposicion(resultado, numeroLista),
    });
  } catch (error) {
    console.error("Error en POST /reposicion:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "Error al guardar reposición",
    });
  }
});

app.put("/reposicion/:id", requerirAlgunModulo("anotar"), async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.usuario.usuario),
      numeroLista = normalizarNumeroLista(req.body.lista || req.query.lista),
      id = normalizarTexto(req.params.id);
    const cantidad = enteroPositivo(req.body.cantidad),
      estado = normalizarTexto(req.body.estado).toLowerCase();
    if (cantidad === null || !["pendiente", "completado"].includes(estado))
      return res
        .status(400)
        .json({ ok: false, mensaje: "Datos de reposición inválidos" });
    const r = await ejecutarEnCola(
      "listas-global",
      async () => conTransaccionListasReposicion(async (cliente) => {
        const todos = await leerTodasLasListas(cliente);
        const i = todos.findIndex(
          (x) =>
            x.usuario === usuario &&
            x.lista === numeroLista &&
            (x.id === id || x.codigo === normalizarCodigo(req.body.codigo)),
        );
        if (i < 0) {
          const e = new Error(`Registro no encontrado en Lista ${numeroLista}`);
          e.statusCode = 404;
          throw e;
        }
        todos[i].cantidad = cantidad;
        todos[i].estado = estado;
        todos[i].actualizado = fechaHoraArgentinaIso();
        await escribirTodasLasListas(todos, cliente);
        return todos[i];
      }),
    );
    res.json({
      ok: true,
      lista: numeroLista,
      mensaje: "Producto actualizado",
      registro: limpiarRegistroReposicion(r, numeroLista),
    });
  } catch (error) {
    console.error("Error en PUT /reposicion/:id:", error);
    res.status(error.statusCode || 500).json({
      ok: false,
      mensaje: error.message || "Error al actualizar reposición",
    });
  }
});

app.patch("/reposicion", requerirAlgunModulo("anotar"), async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.usuario.usuario),
      numeroLista = normalizarNumeroLista(req.body.lista || req.query.lista),
      cambios = Array.isArray(req.body.cambios) ? req.body.cambios : [];
    if (!cambios.length)
      return res
        .status(400)
        .json({ ok: false, mensaje: "No hay cambios para guardar" });
    const resultado = await ejecutarEnCola(
      "listas-global",
      async () => conTransaccionListasReposicion(async (cliente) => {
        let todos = await leerTodasLasListas(cliente);
        for (const c of cambios) {
          const i = todos.findIndex(
            (x) =>
              x.usuario === usuario &&
              x.lista === numeroLista &&
              (x.id === normalizarTexto(c.id) ||
                x.codigo === normalizarCodigo(c.codigo)),
          );
          if (i < 0) {
            const e = new Error(
              `Registro no encontrado en Lista ${numeroLista}`,
            );
            e.statusCode = 404;
            throw e;
          }
          if (c.eliminar === true) {
            todos.splice(i, 1);
            continue;
          }
          const q = enteroPositivo(c.cantidad);
          if (q === null) {
            const e = new Error("Cantidad inválida");
            e.statusCode = 400;
            throw e;
          }
          todos[i].cantidad = q;
          todos[i].actualizado = fechaHoraArgentinaIso();
        }
        await escribirTodasLasListas(todos, cliente);
        return todos
          .filter((x) => x.usuario === usuario && x.lista === numeroLista)
          .map((x) => limpiarRegistroReposicion(x, numeroLista));
      }),
    );
    res.json({
      ok: true,
      lista: numeroLista,
      registros: resultado,
      mensaje: "Cambios guardados",
    });
  } catch (error) {
    console.error("Error en PATCH /reposicion:", error);
    res.status(error.statusCode || 500).json({
      ok: false,
      mensaje: error.message || "No se pudieron guardar los cambios",
    });
  }
});

app.delete("/reposicion/:id", requerirAlgunModulo("anotar"), async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.usuario.usuario),
      numeroLista = normalizarNumeroLista(req.query.lista),
      id = normalizarTexto(req.params.id);
    await ejecutarEnCola("listas-global", async () => conTransaccionListasReposicion(async (cliente) => {
      const todos = await leerTodasLasListas(cliente);
      const i = todos.findIndex(
        (x) =>
          x.usuario === usuario &&
          x.lista === numeroLista &&
          (x.id === id || x.codigo === normalizarCodigo(req.query.codigo)),
      );
      if (i < 0) {
        const e = new Error(`Registro no encontrado en Lista ${numeroLista}`);
        e.statusCode = 404;
        throw e;
      }
      todos.splice(i, 1);
      await escribirTodasLasListas(todos, cliente);
    }));
    res.json({
      ok: true,
      lista: numeroLista,
      mensaje: `Producto eliminado de Lista ${numeroLista}`,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      mensaje: error.message || "Error al eliminar reposición",
    });
  }
});

app.delete("/reposicion", requerirAlgunModulo("anotar"), async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.usuario.usuario),
      numeroLista = normalizarNumeroLista(req.query.lista || req.body?.lista);
    await ejecutarEnCola("listas-global", async () => conTransaccionListasReposicion(async (cliente) => {
      const todos = (await leerTodasLasListas(cliente)).filter(
        (x) => !(x.usuario === usuario && x.lista === numeroLista),
      );
      await escribirTodasLasListas(todos, cliente);
    }));
    res.json({
      ok: true,
      lista: numeroLista,
      mensaje: `Lista ${numeroLista} lista para comenzar`,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo vaciar la lista",
    });
  }
});

const ejecucionesDiariasNotificaciones = new Set();
function horaMinutoArgentina(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const valor = (tipo) =>
    Number(partes.find((parte) => parte.type === tipo)?.value || 0);
  return { hora: valor("hour"), minuto: valor("minute") };
}
async function ejecutarNotificacionesDiariasSiCorresponde() {
  const hoy = fechaArgentina();
  const { hora } = horaMinutoArgentina();
  const ejecutarUnaVez = async (clave, tarea) => {
    const id = `${hoy}|${clave}`;
    if (ejecucionesDiariasNotificaciones.has(id)) return;
    ejecucionesDiariasNotificaciones.add(id);
    try {
      await tarea();
    } catch (error) {
      ejecucionesDiariasNotificaciones.delete(id);
      throw error;
    }
  };

  if (hora === 8) {
    await ejecutarUnaVez("vencimientos-08", procesarAlertasVencimientos);
    await ejecutarUnaVez("bano-08", () => procesarNotificacionBano("08"));
  }
  if (hora === 16) {
    await ejecutarUnaVez("bano-16", () => procesarNotificacionBano("16"));
  }

  await procesarNotificacionesInicioTareas();

  for (const clave of [...ejecucionesDiariasNotificaciones]) {
    if (!clave.startsWith(`${hoy}|`))
      ejecucionesDiariasNotificaciones.delete(clave);
  }
}
// Revisión frecuente; los avisos se envían a las 08:00 y 16:00 de Argentina.
setInterval(
  () =>
    ejecutarNotificacionesDiariasSiCorresponde().catch((error) =>
      console.error("Error en horario diario de notificaciones:", error),
    ),
  60 * 1000,
);
setTimeout(
  () =>
    ejecutarNotificacionesDiariasSiCorresponde().catch((error) =>
      console.error(
        "Error inicializando horario diario de notificaciones:",
        error,
      ),
    ),
  5000,
);

async function migrarEstructuraHorariosV812() {
  validarConfiguracion();
  // Usuarios y Sectores ya pertenecen a PostgreSQL (Etapa 2).
  // Esta migración legacy no vuelve a escribir esas hojas de respaldo.
  await asegurarHorariosPostgres();
  invalidarCache("usuarios");
  return {
    hojas: [
      USUARIOS_SHEET_NAME,
      SECTORES_SHEET_NAME,
      CALENDARIO_HORARIOS_SHEET_NAME,
      TURNOS_HORARIOS_SHEET_NAME,
      DETALLES_HORARIOS_SHEET_NAME,
      REEMPLAZOS_HORARIOS_SHEET_NAME,
      AUDITORIA_HORARIOS_SHEET_NAME,
    ],
    columnasUsuarios: [
      "Usuario",
      "Nombre",
      "Password hash",
      "Rol",
      "Activo",
      "Creado",
      "Permisos módulos",
      "Sector",
      "Sectores a cargo",
      "Versión sesión",
    ],
  };
}

app.post("/admin/migrar-horarios", requerirAdministrador, async (req, res) => {
  try {
    const resultado = await migrarEstructuraHorariosV812();
    res.json({
      ok: true,
      mensaje: "Migración de Horarios a PostgreSQL completada",
      ...resultado,
    });
  } catch (error) {
    console.error("Error en migración de horarios:", error);
    res.status(500).json({
      ok: false,
      mensaje: error.message || "No se pudo migrar Google Sheets",
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Servidor Herramientas Autoservicio Victor V${APP_VERSION} funcionando en puerto ${PORT}`,
  );
  if (AUTO_MIGRATE_SHEETS) {
    migrarEstructuraHorariosV812()
      .then((r) =>
        console.log("Estructura de Horarios verificada:", r.hojas.join(", ")),
      )
      .catch((error) =>
        console.error(
          "No se pudo verificar automáticamente la estructura de Horarios:",
          error,
        ),
      );
  } else {
    console.log(
      "Migración automática desactivada (AUTO_MIGRATE_SHEETS=false). Las hojas se aseguran al utilizar cada módulo.",
    );
  }

  verificarConexionPostgres()
    .then(async (resultado) => {
      if (resultado.configurada) {
        console.log("PostgreSQL conectado correctamente.");
        await asegurarEsquemaUsuariosSectores();
        await asegurarUsuariosSectoresPostgres();
        await asegurarHorariosPostgres();
        await asegurarTareasBanoPostgres();
        console.log("PostgreSQL Etapa 4: Usuarios, Sectores, Horarios, Tareas y Baño listos.");
        await asegurarInventarioProductosPostgres();
        console.log("PostgreSQL Etapa 5: Usuarios, Sectores, Horarios, Tareas, Baño, Inventario y Productos listos.");
        await asegurarVencimientosPostgres();
        console.log("PostgreSQL Etapa 6: Usuarios, Sectores, Horarios, Tareas, Baño, Inventario, Productos y Vencimientos listos.");
        await asegurarListasReposicionPostgres();
        console.log("PostgreSQL Etapa 7: Usuarios, Sectores, Horarios, Tareas, Baño, Inventario, Productos, Vencimientos y Listas/Mi Lista listos.");
        await asegurarAuxiliaresPostgres();
        console.log("PostgreSQL Etapa 8: Usuarios, Sectores, Horarios, Tareas, Baño, Inventario, Productos, Vencimientos, Listas/Mi Lista y datos auxiliares listos.");
      } else {
        console.log(
          "PostgreSQL no configurado (DATABASE_URL ausente). Los módulos migrados y los datos auxiliares requieren PostgreSQL desde la Etapa 8.",
        );
      }
    })
    .catch((error) =>
      console.error(
        "PostgreSQL configurado pero no disponible. Los módulos migrados y los datos auxiliares no estarán disponibles hasta recuperar la conexión:",
        error.message,
      ),
    );
});

async function cerrarServidor(signal) {
  try {
    await cerrarPostgres();
  } catch (error) {
    console.error(`Error cerrando PostgreSQL durante ${signal}:`, error.message);
  } finally {
    process.exit(0);
  }
}

process.once("SIGTERM", () => cerrarServidor("SIGTERM"));
process.once("SIGINT", () => cerrarServidor("SIGINT"));
