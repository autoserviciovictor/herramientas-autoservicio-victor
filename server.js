const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const crypto = require("crypto");
const fs = require("fs");
const webpush = require("web-push");
const path = require("path");
require("dotenv").config();

const app = express();
const APP_VERSION = "12.4";
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Stock";
const PRODUCTOS_SHEET_NAME = "Productos";
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const ADMIN_KEY = normalizarTexto(process.env.ADMIN_KEY);
const ADMIN_TOKEN_SECRET = normalizarTexto(process.env.ADMIN_TOKEN_SECRET);
const USER_SESSION_DAYS = 30;
const USUARIOS_SHEET_NAME = "Usuarios";
const SECTORES_SHEET_NAME = "Sectores";
const AUDITORIA_HORARIOS_SHEET_NAME = "Auditoría Horarios";
const CALENDARIO_HORARIOS_SHEET_NAME = "Calendario Horarios";
const TURNOS_HORARIOS_SHEET_NAME = "Horarios Turnos";
const ORDEN_HORARIOS_SHEET_NAME = "Orden Personal Horarios";
const DETALLES_HORARIOS_SHEET_NAME = "Detalles Horarios";
const REEMPLAZOS_HORARIOS_SHEET_NAME = "Reemplazos Horarios";
const HISTORIAL_VENCIMIENTOS_SHEET_NAME = "Historial Vencimientos";
const PUSH_SUBSCRIPTIONS_SHEET_NAME = "Notificaciones Suscripciones";
const NOTIFICATION_LOG_SHEET_NAME = "Notificaciones Vencimientos";
const NOTIFICATION_CENTER_SHEET_NAME = "Centro Notificaciones";
const TAREAS_SHEET_NAME = "Tareas";
const TAREAS_BANO_SHEET_NAME = "Tareas_Bano";
const VAPID_PUBLIC_KEY = normalizarTexto(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = normalizarTexto(process.env.VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = normalizarTexto(process.env.VAPID_SUBJECT || "mailto:administracion@autoserviciovictor.com");
const NOTIFICATION_CRON_SECRET = normalizarTexto(process.env.NOTIFICATION_CRON_SECRET);
const PUSH_CONFIGURED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (PUSH_CONFIGURED) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const ADMIN_USERNAME = normalizarTexto(process.env.ADMIN_USERNAME || "admin").toLowerCase();
const ALLOWED_ORIGINS = normalizarTexto(process.env.ALLOWED_ORIGINS)
  .split(",")
  .map(origen => origen.trim())
  .filter(Boolean);

app.use(cors({
  origin(origen, callback) {
    if (!origen || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origen)) {
      return callback(null, true);
    }
    return callback(new Error("Origen no permitido por CORS"));
  }
}));
app.use(express.json({ limit: "10mb" }));

const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

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
  centroNotificaciones: 30000
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
  claves.forEach(clave => cacheLecturas.delete(clave));
}

// Cola simple por recurso para soportar varios celulares sin pisar escrituras.
// Si dos dispositivos guardan el mismo producto al mismo tiempo, el segundo espera
// a que el primero termine y luego vuelve a leer el valor actualizado.
const colasPorCodigo = new Map();

async function ejecutarEnCola(codigo, tarea) {
  const clave = normalizarCodigo(codigo);
  const colaAnterior = colasPorCodigo.get(clave) || Promise.resolve();

  let liberar;
  const colaActual = new Promise(resolve => { liberar = resolve; });
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
  const coincidencia = String(texto).match(/^([+-]?)(\d+)(?:[.,](\d+))?[eE]([+-]?\d+)$/);
  if (!coincidencia) return String(texto);
  const signo = coincidencia[1] === "-" ? "-" : "";
  const enteros = coincidencia[2];
  const decimales = coincidencia[3] || "";
  const exponente = Number(coincidencia[4]);
  if (!Number.isInteger(exponente) || Math.abs(exponente) > 100) return String(texto);
  const digitos = enteros + decimales;
  const posicion = enteros.length + exponente;
  if (posicion <= 0) return signo + "0".repeat(-posicion) + digitos;
  if (posicion >= digitos.length) return signo + digitos + "0".repeat(posicion - digitos.length);
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

function claveCodigo(codigo) {
  const texto = normalizarCodigo(codigo);
  if (!texto) return "";
  // Para comparar códigos exclusivamente numéricos, ignorar ceros iniciales.
  // El código original se conserva para mostrarlo y escribirlo en Productos.
  if (/^\d+$/.test(texto)) return texto.replace(/^0+(?=\d)/, "");
  return texto;
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function numeroPrecio(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) && valor >= 0 ? valor : null;
  let texto = String(valor).trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!texto) return null;
  if (texto.includes(",") && texto.includes(".")) {
    texto = texto.lastIndexOf(",") > texto.lastIndexOf(".") ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
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
    day: "2-digit"
  }).formatToParts(fecha);
  const obtener = tipo => partes.find(parte => parte.type === tipo)?.value;
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

function diasDesdeHoyArgentina(fechaIso) {
  const valor = normalizarTexto(fechaIso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const hoy = fechaArgentina();
  const [hy, hm, hd] = hoy.split("-").map(Number);
  const [vy, vm, vd] = valor.split("-").map(Number);
  return Math.round((Date.UTC(vy, vm - 1, vd) - Date.UTC(hy, hm - 1, hd)) / 86400000);
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
    hour12: false
  }).format(fecha).replace(" ", "T");
  return `${partes}-03:00`;
}


function base64Url(valor) {
  return Buffer.from(valor).toString("base64url");
}

function firmarTokenAdmin(payload) {
  if (!ADMIN_TOKEN_SECRET) return "";
  const cuerpo = base64Url(JSON.stringify(payload));
  const firma = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

function verificarTokenAdmin(token) {
  try {
    if (!ADMIN_TOKEN_SECRET || !token || !token.includes(".")) return null;
    const [cuerpo, firma] = token.split(".");
    const esperada = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(cuerpo).digest("base64url");
    if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
    const payload = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function obtenerTokenAdmin(req) {
  const authorization = normalizarTexto(req.get("authorization"));
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

function requerirAdmin(req, res, next) {
  const sesion = verificarTokenAdmin(obtenerTokenAdmin(req));
  if (!sesion) return res.status(401).json({ ok: false, mensaje: "Sesión de administrador inválida o vencida" });
  req.admin = sesion;
  next();
}


function normalizarUsuario(valor) {
  return normalizarTexto(valor).toLowerCase().replace(/\s+/g, "");
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
    return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

let hojaUsuariosAsegurada = false;
let promesaHojaUsuarios = null;
const MODULOS_PERMITIDOS = ["inventario", "vencimientos", "anotar", "precios", "horarios", "tareas"];
function normalizarRol(valor) { const rol = normalizarTexto(valor).toLowerCase(); return rol === "repositor" ? "personal" : (["administrador","administracion","supervisor","personal"].includes(rol) ? rol : "personal"); }
function permisosPorDefecto() { return Object.fromEntries(MODULOS_PERMITIDOS.map(m => [m, true])); }
function normalizarPermisos(valor, rol = "personal") {
  if (rol === "administrador") return permisosPorDefecto();
  let entrada = valor;
  if (typeof valor === "string" && valor.trim()) { try { entrada = JSON.parse(valor); } catch { entrada = {}; } }
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) entrada = {};
  return Object.fromEntries(MODULOS_PERMITIDOS.map(m => [m, entrada[m] !== false]));
}
function serializarPermisos(permisos, rol) { return JSON.stringify(normalizarPermisos(permisos, rol)); }

async function asegurarHojaUsuarios() {
  if (hojaUsuariosAsegurada) return;
  if (promesaHojaUsuarios) return promesaHojaUsuarios;
  promesaHojaUsuarios = (async () => {
    validarConfiguracion();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existe = (meta.data.sheets || []).some(hoja => hoja.properties?.title === USUARIOS_SHEET_NAME);
    if (!existe) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: USUARIOS_SHEET_NAME } } }] }
      });
    }
    const encabezados = ["Usuario", "Nombre", "Password hash", "Rol", "Activo", "Creado", "Permisos módulos", "Sector", "Sectores a cargo"];
    const respuesta = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${USUARIOS_SHEET_NAME}!A1:I2` });
    const filas = respuesta.data.values || [];
    if (!filas[0] || encabezados.some((titulo, i) => filas[0][i] !== titulo)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USUARIOS_SHEET_NAME}!A1:I1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [encabezados] }
      });
    }
    const tieneUsuarios = filas.slice(1).some(f => normalizarUsuario(f[0]));
    if (!tieneUsuarios) {
      if (!ADMIN_KEY) throw new Error("Configurá ADMIN_KEY en Render para crear el primer usuario administrador");
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USUARIOS_SHEET_NAME}!A:I`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [[ADMIN_USERNAME, "Administrador", hashPassword(ADMIN_KEY), "administrador", "Sí", fechaHoraArgentinaIso(), serializarPermisos(null, "administrador"), "", ""]] }
      });
    }
    hojaUsuariosAsegurada = true;
    invalidarCache("usuarios");
  })();
  try { await promesaHojaUsuarios; }
  finally { promesaHojaUsuarios = null; }
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
    permisos: normalizarPermisos(fila[6], normalizarRol(fila[3])),
    sector: normalizarTexto(fila[7]),
    sectores: [...new Set(normalizarTexto(fila[8]).split(",").map(x=>x.trim()).filter(Boolean))]
  };
}

async function obtenerUsuarios() {
  await asegurarHojaUsuarios();
  return leerConCache("usuarios", CACHE_TTL.usuarios, async () => {
    const respuesta = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${USUARIOS_SHEET_NAME}!A:I` });
    const filas = respuesta.data.values || [];
    return filas.slice(1).map(filaAUsuario).filter(u => u.usuario);
  });
}

async function requerirSesion(req, res, next) {
  try {
    const sesion = verificarTokenAdmin(obtenerTokenAdmin(req));
    if (!sesion?.usuario) return res.status(401).json({ ok: false, mensaje: "Iniciá sesión para continuar" });
    const usuarios = await obtenerUsuarios();
    const usuario = usuarios.find(u => u.usuario === sesion.usuario);
    if (!usuario || !usuario.activo) return res.status(401).json({ ok: false, mensaje: "Usuario inexistente o desactivado" });
    req.usuario = { usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol, permisos: usuario.permisos, sector: usuario.sector || "", sectores: usuario.sectores || [] };
    next();
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message || "No se pudo validar la sesión" });
  }
}

async function requerirAdministrador(req, res, next) {
  await requerirSesion(req, res, () => {
    if (req.usuario?.rol !== "administrador") return res.status(403).json({ ok: false, mensaje: "Acceso exclusivo para administradores" });
    req.admin = req.usuario;
    next();
  });
}

function validarConfiguracion() {
  if (!SPREADSHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error("Faltan variables de entorno: SPREADSHEET_ID, GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY");
  }
}

function filaAProducto(fila, index) {
  const salon = numero(fila[3]);
  const deposito = numero(fila[4]);

  return {
    filaGoogle: index + 2,
    codigo: normalizarTexto(fila[0]),
    articulo: normalizarTexto(fila[1]),
    stock: salon + deposito,
    salon,
    deposito
  };
}

async function obtenerProductos() {
  validarConfiguracion();
  return leerConCache("productos", CACHE_TTL.productos, async () => {
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`
    });
    const filas = respuesta.data.values || [];
    if (filas.length <= 1) return [];
    return filas.slice(1).map(filaAProducto).filter(producto => producto.codigo || producto.articulo);
  });
}

async function buscarProductoPorCodigo(codigoBuscado) {
  const productos = await obtenerProductos();
  const codigo = normalizarCodigo(codigoBuscado);
  return productos.find(producto => producto.codigo === codigo) || null;
}

async function actualizarProducto(producto) {
  const salon = numero(producto.salon);
  const deposito = numero(producto.deposito);
  const stock = salon + deposito;

  const productoActualizado = {
    ...producto,
    stock,
    salon,
    deposito
  };

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${producto.filaGoogle}:E${producto.filaGoogle}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        productoActualizado.codigo,
        productoActualizado.articulo,
        productoActualizado.stock,
        productoActualizado.salon,
        productoActualizado.deposito
      ]]
    }
  });

  return productoActualizado;
}


function filaAProductoMaestro(fila, index) {
  return {
    filaGoogle: index + 2,
    codigo: normalizarTexto(fila[0]),
    articulo: normalizarTexto(fila[1]),
    precio: numeroPrecio(fila[2])
  };
}

async function obtenerProductosMaestros() {
  validarConfiguracion();
  return leerConCache("productosMaestros", CACHE_TTL.productosMaestros, async () => {
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PRODUCTOS_SHEET_NAME}!A:C`
    });
    const filas = respuesta.data.values || [];
    if (filas.length <= 1) return [];
    return filas.slice(1).map(filaAProductoMaestro).filter(producto => producto.codigo || producto.articulo);
  });
}

async function buscarProductoMaestroPorCodigo(codigoBuscado) {
  const productos = await obtenerProductosMaestros();
  const codigo = normalizarCodigo(codigoBuscado);
  return productos.find(producto => producto.codigo === codigo) || null;
}



app.post("/auth/login", async (req, res) => {
  try {
    const usuarioBuscado = normalizarUsuario(req.body?.usuario);
    const password = String(req.body?.password ?? "");
    if (!usuarioBuscado || !password) return res.status(400).json({ ok: false, mensaje: "Ingresá usuario y contraseña" });
    const usuarios = await obtenerUsuarios();
    const usuario = usuarios.find(item => item.usuario === usuarioBuscado);
    if (!usuario || !usuario.activo || !verificarPassword(password, usuario.passwordHash)) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }
    if (!ADMIN_TOKEN_SECRET) return res.status(503).json({ ok: false, mensaje: "Configurá ADMIN_TOKEN_SECRET en Render" });
    const ahora = Date.now();
    const exp = ahora + USER_SESSION_DAYS * 24 * 60 * 60 * 1000;
    const token = firmarTokenAdmin({ usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol, iat: ahora, exp });
    res.json({ ok: true, token, usuario: { usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol, permisos: usuario.permisos, sector: usuario.sector || "", sectores: usuario.sectores || [] }, expira: new Date(exp).toISOString() });
  } catch (error) {
    console.error("Error en /auth/login:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "No se pudo iniciar sesión" });
  }
});

app.get("/auth/session", requerirSesion, (req, res) => {
  res.json({ ok: true, usuario: req.usuario, version: APP_VERSION });
});

// Desde aquí, toda la API de trabajo requiere una sesión válida.
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/notificaciones/cron") return next();
  return requerirSesion(req, res, next);
});

app.get("/admin/resumen", requerirAdministrador, async (req, res) => {
  try {
    // El panel general cuenta el catálogo maestro de la hoja Productos.
    // La hoja Stock queda reservada exclusivamente para el módulo Inventario.
    const [productosCatalogo, productosInventario, vencimientos] = await Promise.all([
      obtenerProductosMaestros(),
      obtenerProductos(),
      obtenerVencimientos()
    ]);
    res.json({
      ok: true,
      version: APP_VERSION,
      productos: productosCatalogo.length,
      productosCatalogo: productosCatalogo.length,
      productosInventario: productosInventario.length,
      vencimientos: vencimientos.length,
      servidor: "conectado"
    });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message || "No se pudo cargar el panel" });
  }
});


let hojaSectoresAsegurada=false;
async function asegurarHojaSectores(){
 if(hojaSectoresAsegurada)return; validarConfiguracion(); const meta=await sheets.spreadsheets.get({spreadsheetId:SPREADSHEET_ID});
 if(!(meta.data.sheets||[]).some(h=>h.properties?.title===SECTORES_SHEET_NAME)) await sheets.spreadsheets.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{requests:[{addSheet:{properties:{title:SECTORES_SHEET_NAME}}}]}});
 const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${SECTORES_SHEET_NAME}!A1:E2`}); const f=r.data.values||[]; const h=["ID","Nombre","Color","Supervisor","Activo"];
 if(!f[0]||h.some((x,i)=>f[0][i]!==x)) await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${SECTORES_SHEET_NAME}!A1:E1`,valueInputOption:"USER_ENTERED",requestBody:{values:[h]}});
 if(!f.slice(1).some(x=>x[0])){const base=[["caja","Caja","#2563eb","","Sí"],["deposito","Depósito","#f59e0b","","Sí"],["verduleria","Verdulería","#16a34a","","Sí"],["fiambreria","Fiambrería","#db2777","","Sí"],["carniceria","Carnicería","#dc2626","","Sí"],["panaderia","Panadería","#a16207","","Sí"],["administracion","Administración","#6b7280","","Sí"]];await sheets.spreadsheets.values.append({spreadsheetId:SPREADSHEET_ID,range:`${SECTORES_SHEET_NAME}!A:E`,valueInputOption:"USER_ENTERED",insertDataOption:"INSERT_ROWS",requestBody:{values:base}})} hojaSectoresAsegurada=true;
}
function idSector(nombre){return normalizarTexto(nombre).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)}
async function obtenerSectores(){return leerConCache("sectores",CACHE_TTL.sectores,async()=>{await asegurarHojaSectores();const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${SECTORES_SHEET_NAME}!A:E`});const usuarios=await obtenerUsuarios();return (r.data.values||[]).slice(1).map((f,i)=>({filaGoogle:i+2,id:normalizarTexto(f[0]),nombre:normalizarTexto(f[1]),color:/^#[0-9a-f]{6}$/i.test(f[2]||"")?f[2]:"#b72e35",supervisor:normalizarUsuario(f[3]),supervisorNombre:usuarios.find(u=>u.usuario===normalizarUsuario(f[3]))?.nombre||"",activo:["si","sí","true","1","activo"].includes(normalizarTexto(f[4]).toLowerCase())})).filter(s=>s.id)});}
function usuarioPuedeVerHorarios(usuario) {
  return usuario?.rol === "administrador" || usuario?.permisos?.horarios !== false;
}
function sectoresACargo(usuario){ return Array.isArray(usuario?.sectores) ? usuario.sectores : []; }
function puedeAccederSectorHorarios(usuario, sectorId) {
  const sector=normalizarTexto(sectorId);
  if (["administrador","supervisor"].includes(usuario?.rol)) return true;
  return Boolean(usuario?.sector) && usuario.sector === sector;
}
async function puedeModificarSectorHorarios(usuario, sectorId) {
  const sector = normalizarTexto(sectorId);
  if (usuario?.rol === "administrador") return true;
  if (usuario?.rol !== "supervisor") return false;

  const sectoresUsuario = sectoresACargo(usuario).map(normalizarTexto);
  if (sectoresUsuario.includes(sector) || normalizarTexto(usuario?.sector) === sector) return true;

  // La asignación oficial del supervisor se guarda en la hoja Sectores.
  // La sesión puede no contener todavía esa asignación, por eso se valida
  // también contra la configuración actual antes de rechazar el guardado.
  const sectorConfigurado = (await obtenerSectores()).find(s => s.id === sector && s.activo);
  return Boolean(
    sectorConfigurado &&
    normalizarUsuario(sectorConfigurado.supervisor) === normalizarUsuario(usuario?.usuario)
  );
}
async function requerirAccesoHorarios(req, res, next) {
  await requerirSesion(req, res, () => {
    if (!usuarioPuedeVerHorarios(req.usuario)) return res.status(403).json({ ok:false, mensaje:"No tenés permiso para acceder a Horarios" });
    next();
  });
}

let hojasHorariosAseguradas = false;
async function asegurarHojasHorarios() {
  if (hojasHorariosAseguradas) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titulos = new Set((meta.data.sheets || []).map(h => h.properties?.title));
  const requests = [];
  if (!titulos.has(CALENDARIO_HORARIOS_SHEET_NAME)) requests.push({ addSheet:{ properties:{ title:CALENDARIO_HORARIOS_SHEET_NAME } } });
  if (!titulos.has(TURNOS_HORARIOS_SHEET_NAME)) requests.push({ addSheet:{ properties:{ title:TURNOS_HORARIOS_SHEET_NAME } } });
  if (!titulos.has(DETALLES_HORARIOS_SHEET_NAME)) requests.push({ addSheet:{ properties:{ title:DETALLES_HORARIOS_SHEET_NAME } } });
  if (!titulos.has(REEMPLAZOS_HORARIOS_SHEET_NAME)) requests.push({ addSheet:{ properties:{ title:REEMPLAZOS_HORARIOS_SHEET_NAME } } });
  if (!titulos.has(ORDEN_HORARIOS_SHEET_NAME)) requests.push({ addSheet:{ properties:{ title:ORDEN_HORARIOS_SHEET_NAME } } });
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId:SPREADSHEET_ID, requestBody:{ requests } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A1:H1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","Mes","Empleado","Día","Turno","Actualizado","Usuario","Nombre"]] } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${TURNOS_HORARIOS_SHEET_NAME}!A1:J1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","ID","Inicio","Fin","Color","Activo","Actualizado","Tipo","Inicio 2","Fin 2"]] } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${DETALLES_HORARIOS_SHEET_NAME}!A1:I1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","Mes","Empleado","Día","Tipo","Motivo","Observación","Actualizado","Usuario"]] } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${REEMPLAZOS_HORARIOS_SHEET_NAME}!A1:I1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","Mes","Empleado original","Reemplazante","Desde","Hasta","Observación","Actualizado","Usuario"]] } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${ORDEN_HORARIOS_SHEET_NAME}!A1:D1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","Empleado","Orden","Actualizado"]] } });
  hojasHorariosAseguradas = true;
}
function mesHorariosValido(valor) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(normalizarTexto(valor)); }
function turnoHorarioValido(valor) { return ["franco","vacaciones","ausente","licencia"].includes(valor) || /^\d{1,2}(?::\d{2})?\s*-\s*\d{1,2}(?::\d{2})?$/.test(valor) || /^[a-z0-9_-]{3,80}$/i.test(valor); }
function normalizarHoraHorario(valor) {
  const texto = normalizarTexto(valor).toUpperCase();
  const m = texto.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AP]M))?$/);
  if (!m) return "";
  let hora = Number(m[1]);
  const minutos = Number(m[2]);
  if (m[3] === "PM" && hora < 12) hora += 12;
  if (m[3] === "AM" && hora === 12) hora = 0;
  if (hora < 0 || hora > 23 || minutos < 0 || minutos > 59) return "";
  return `${String(hora).padStart(2,"0")}:${String(minutos).padStart(2,"0")}`;
}
async function obtenerTurnosSector(sector) {
  await asegurarHojasHorarios();
  return leerConCache(`turnosHorarios:${sector}`, CACHE_TTL.turnosHorarios, async () => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:`${TURNOS_HORARIOS_SHEET_NAME}!A:J` });
    return (r.data.values || []).slice(1)
      .filter(f => normalizarTexto(f[0]) === sector && !["no","false","0","inactivo"].includes(normalizarTexto(f[5]).toLowerCase()))
      .map(f => ({
        id:normalizarTexto(f[1]),
        inicio:normalizarHoraHorario(f[2]),
        fin:normalizarHoraHorario(f[3]),
        color:/^#[0-9a-f]{6}$/i.test(f[4]||"") ? f[4] : "#64748b",
        tipo:normalizarTexto(f[7]).toLowerCase()==='cortado'?'cortado':'continuo',
        inicio2:normalizarHoraHorario(f[8]), fin2:normalizarHoraHorario(f[9])
      }))
      .filter(t => t.id && t.inicio && t.fin && (t.tipo!=='cortado' || (t.inicio2 && t.fin2)));
  });
}
async function registrarAuditoriaHorario(usuario, sectorNombre, mes, accion) {
  await asegurarHojaAuditoriaHorarios();
  await sheets.spreadsheets.values.append({ spreadsheetId:SPREADSHEET_ID, range:`${AUDITORIA_HORARIOS_SHEET_NAME}!A:G`, valueInputOption:"USER_ENTERED", insertDataOption:"INSERT_ROWS", requestBody:{ values:[[fechaHoraArgentinaIso(), usuario.usuario, usuario.nombre, usuario.rol, sectorNombre, mes, accion]] } });
}

app.get("/horarios/turnos", requerirAccesoHorarios, async (req,res) => {
  try {
    const sector = normalizarTexto(req.query.sector);
    if (!puedeAccederSectorHorarios(req.usuario, sector)) return res.status(403).json({ok:false,mensaje:"No tenés acceso a ese sector"});
    res.json({ok:true, sector, turnos:await obtenerTurnosSector(sector)});
  } catch(e) { res.status(500).json({ok:false,mensaje:e.message || "No se pudieron cargar los horarios del sector"}); }
});
app.put("/horarios/turnos", requerirAccesoHorarios, async (req,res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    if (!(await puedeModificarSectorHorarios(req.usuario, sector))) return res.status(403).json({ok:false,mensaje:"No tenés permiso para configurar los horarios de este sector"});
    const sectores = await obtenerSectores();
    if (!sectores.some(s => s.id === sector)) return res.status(404).json({ok:false,mensaje:"Sector inexistente"});
    const turnos = Array.isArray(req.body?.turnos) ? req.body.turnos.map(t => ({ id:normalizarTexto(t.id), tipo:normalizarTexto(t.tipo).toLowerCase()==='cortado'?'cortado':'continuo', inicio:normalizarTexto(t.inicio).slice(0,5), fin:normalizarTexto(t.fin).slice(0,5), inicio2:normalizarTexto(t.inicio2).slice(0,5), fin2:normalizarTexto(t.fin2).slice(0,5), color:/^#[0-9a-f]{6}$/i.test(t.color||"")?t.color:"#64748b" })) : [];
    if (!turnos.length || turnos.some(t => !t.id || !/^\d{2}:\d{2}$/.test(t.inicio) || !/^\d{2}:\d{2}$/.test(t.fin) || (t.tipo==='cortado' && (!/^\d{2}:\d{2}$/.test(t.inicio2) || !/^\d{2}:\d{2}$/.test(t.fin2))))) return res.status(400).json({ok:false,mensaje:"Configuración de horarios inválida"});
    await asegurarHojasHorarios();
    await ejecutarEnCola("turnos-horarios", async () => {
      const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${TURNOS_HORARIOS_SHEET_NAME}!A:J`});
      const otras=(r.data.values||[]).slice(1).filter(f=>normalizarTexto(f[0])!==sector);
      const ahora=fechaHoraArgentinaIso();
      const nuevas=turnos.map(t=>[sector,t.id,t.inicio,t.fin,t.color,"Sí",ahora,t.tipo,t.inicio2||"",t.fin2||""]);
      const todas=[...otras,...nuevas], filasPrevias=Math.max(0,(r.data.values||[]).length-1);
      if(todas.length) await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${TURNOS_HORARIOS_SHEET_NAME}!A2:J${todas.length+1}`,valueInputOption:"USER_ENTERED",requestBody:{values:todas}});
      if(filasPrevias>todas.length) await sheets.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range:`${TURNOS_HORARIOS_SHEET_NAME}!A${todas.length+2}:J${filasPrevias+1}`});
    });
    invalidarCache(`turnosHorarios:${sector}`);
    res.json({ok:true,turnos});
  } catch(e) { res.status(500).json({ok:false,mensaje:e.message || "No se pudieron guardar los horarios"}); }
});
app.get("/horarios/calendario", requerirAccesoHorarios, async (req,res) => {
  try {
    const sector=normalizarTexto(req.query.sector), mes=normalizarTexto(req.query.mes);
    if(!puedeAccederSectorHorarios(req.usuario,sector)) return res.status(403).json({ok:false,mensaje:"No tenés acceso a ese sector"});
    if(!mesHorariosValido(mes)) return res.status(400).json({ok:false,mensaje:"Mes inválido"});
    await asegurarHojasHorarios();
    // El calendario debe leerse siempre desde Sheets. Un calendario cacheado puede
    // entregar una base vieja a otra computadora y provocar un conflicto falso.
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const contenido = await (async () => {
      const [r, dr] = await Promise.all([
        sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A:H`}),
        sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${DETALLES_HORARIOS_SHEET_NAME}!A:I`})
      ]);
      const filasCalendario=(r.data.values||[]).slice(1);
      const filasDetalles=(dr.data.values||[]).slice(1);
      const propias=filasCalendario.filter(f=>normalizarTexto(f[0])===sector&&normalizarTexto(f[1])===mes);
      const propiosDetalles=filasDetalles.filter(f=>normalizarTexto(f[0])===sector&&normalizarTexto(f[1])===mes);
      const celdasMapa=new Map();
      propias
        .map(f=>({empleado:normalizarTexto(f[2]),dia:Number(f[3]),turno:normalizarTexto(f[4])}))
        .filter(x=>x.empleado&&Number.isInteger(x.dia)&&x.dia>=1&&x.dia<=31&&x.turno)
        .forEach(x=>celdasMapa.set(`${x.empleado}::${x.dia}`,x));
      const detallesMapa=new Map();
      propiosDetalles
        .map(f=>({empleado:normalizarTexto(f[2]),dia:Number(f[3]),tipo:normalizarTexto(f[4]),motivo:normalizarTexto(f[5]),observacion:normalizarTexto(f[6])}))
        .filter(x=>x.empleado&&x.dia>=1&&x.dia<=31)
        .forEach(x=>detallesMapa.set(`${x.empleado}::${x.dia}`,x));
      return {celdas:[...celdasMapa.values()],detalles:[...detallesMapa.values()],reemplazos:[]};
    })();
    const turnos=await obtenerTurnosSector(sector);
    res.json({ok:true,sector,mes,...contenido,turnos});
  } catch(e) { res.status(500).json({ok:false,mensaje:e.message || "No se pudo cargar el calendario"}); }
});
app.put("/horarios/calendario", requerirAccesoHorarios, async (req,res) => {
  try {
    const sector=normalizarTexto(req.body?.sector), mes=normalizarTexto(req.body?.mes);
    if(!(await puedeModificarSectorHorarios(req.usuario,sector))) return res.status(403).json({ok:false,mensaje:"Solo el administrador o el supervisor asignado pueden modificar este calendario"});
    if(!mesHorariosValido(mes)) return res.status(400).json({ok:false,mensaje:"Mes inválido"});
    const sectores=await obtenerSectores(); const sec=sectores.find(s=>s.id===sector&&s.activo);
    if(!sec) return res.status(404).json({ok:false,mensaje:"Sector inexistente o inactivo"});
    const usuarios=await obtenerUsuarios();
    const empleadosBase=usuarios.filter(u=>u.activo&&(u.sector===sector||normalizarUsuario(u.usuario)===normalizarUsuario(sec.supervisor)));
    const empleadosPermitidos=new Set(empleadosBase.map(u=>u.nombre||u.usuario));
    let celdas=(Array.isArray(req.body?.celdas)?req.body.celdas:[]).map(x=>({empleado:normalizarTexto(x.empleado),dia:Number(x.dia),turno:normalizarTexto(x.turno)})).filter(x=>x.empleado&&Number.isInteger(x.dia)&&x.dia>=1&&x.dia<=31&&x.turno);
    let baseCeldas=(Array.isArray(req.body?.baseCeldas)?req.body.baseCeldas:[]).map(x=>({empleado:normalizarTexto(x.empleado),dia:Number(x.dia),turno:normalizarTexto(x.turno)})).filter(x=>x.empleado&&Number.isInteger(x.dia)&&x.dia>=1&&x.dia<=31&&x.turno);
    const clienteConBase=Array.isArray(req.body?.baseCeldas);
    let detalles=(Array.isArray(req.body?.detalles)?req.body.detalles:[]).map(x=>({empleado:normalizarTexto(x.empleado),dia:Number(x.dia),tipo:normalizarTexto(x.tipo).slice(0,30),motivo:normalizarTexto(x.motivo).slice(0,80),observacion:normalizarTexto(x.observacion).slice(0,300)})).filter(x=>x.empleado&&x.dia>=1&&x.dia<=31&&(x.tipo||x.motivo||x.observacion));
    if(celdas.some(x=>!empleadosPermitidos.has(x.empleado)) || detalles.some(x=>!empleadosPermitidos.has(x.empleado))) return res.status(400).json({ok:false,mensaje:"El calendario contiene empleados que no pertenecen al sector"});
    if(celdas.some(x=>!turnoHorarioValido(x.turno))) return res.status(400).json({ok:false,mensaje:"El calendario contiene un turno inválido"});
    await asegurarHojasHorarios();
    await ejecutarEnCola("calendario-horarios", async()=>{
      const [r,dr]=await Promise.all([
        sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A:H`}),
        sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${DETALLES_HORARIOS_SHEET_NAME}!A:I`})
      ]);
      const filasAnteriores=(r.data.values||[]).slice(1).filter(f=>normalizarTexto(f[0])===sector&&normalizarTexto(f[1])===mes);
      const anterior=new Map(filasAnteriores.map(f=>[`${normalizarTexto(f[2])}::${Number(f[3])}`,normalizarTexto(f[4])]));
      const enviado=new Map(celdas.map(x=>[`${x.empleado}::${x.dia}`,x.turno]));
      const base=new Map(baseCeldas.map(x=>[`${x.empleado}::${x.dia}`,x.turno]));
      const nuevoCompleto=new Map(anterior);
      const clavesModificadas=clienteConBase
        ? [...new Set([...base.keys(),...enviado.keys()])].filter(k=>(base.get(k)||"")!==(enviado.get(k)||""))
        : [...enviado.keys()];
      if(clienteConBase) {
        const conflictos=clavesModificadas.filter(k=>{
          const valorServidor=anterior.get(k)||"", valorBase=base.get(k)||"", valorCliente=enviado.get(k)||"";
          return valorServidor!==valorBase && valorServidor!==valorCliente;
        });
        if(conflictos.length) {
          const error=new Error("El calendario fue modificado desde otro dispositivo. Volvé a cargarlo antes de guardar para no perder horarios.");
          error.statusCode=409; throw error;
        }
      }
      for(const k of clavesModificadas) {
        const valor=enviado.get(k)||"";
        if(valor) nuevoCompleto.set(k,valor); else nuevoCompleto.delete(k);
      }
      const celdasFusionadas=[...nuevoCompleto.entries()].map(([k,turno])=>{const pos=k.lastIndexOf("::");return {empleado:k.slice(0,pos),dia:Number(k.slice(pos+2)),turno};});
      const otras=(r.data.values||[]).slice(1).filter(f=>!(normalizarTexto(f[0])===sector&&normalizarTexto(f[1])===mes));
      const otrasDetalles=(dr.data.values||[]).slice(1).filter(f=>!(normalizarTexto(f[0])===sector&&normalizarTexto(f[1])===mes));
      const ahora=fechaHoraArgentinaIso();
      const nuevas=celdasFusionadas.map(x=>[sector,mes,x.empleado,x.dia,x.turno,ahora,req.usuario.usuario,req.usuario.nombre]);
      const nuevasDetalles=detalles.map(x=>[sector,mes,x.empleado,x.dia,x.tipo,x.motivo,x.observacion,ahora,req.usuario.usuario]);
      const todas=[...otras,...nuevas], todosDetalles=[...otrasDetalles,...nuevasDetalles];
      const filasCalendarioPrevias=Math.max(0,(r.data.values||[]).length-1), filasDetallesPrevias=Math.max(0,(dr.data.values||[]).length-1);
      if(todas.length) await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A2:H${todas.length+1}`,valueInputOption:"USER_ENTERED",requestBody:{values:todas}});
      if(todosDetalles.length) await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${DETALLES_HORARIOS_SHEET_NAME}!A2:I${todosDetalles.length+1}`,valueInputOption:"USER_ENTERED",requestBody:{values:todosDetalles}});
      if(filasCalendarioPrevias>todas.length) await sheets.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A${todas.length+2}:H${filasCalendarioPrevias+1}`});
      if(filasDetallesPrevias>todosDetalles.length) await sheets.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range:`${DETALLES_HORARIOS_SHEET_NAME}!A${todosDetalles.length+2}:I${filasDetallesPrevias+1}`});
      const nuevoMapa=nuevoCompleto;
      const claves=new Set([...anterior.keys(),...nuevoMapa.keys()]);
      const cambios=[...claves].filter(k=>(anterior.get(k)||"")!==(nuevoMapa.get(k)||""));
      if(cambios.length){
        await asegurarHojaAuditoriaHorarios();
        const filas=cambios.map(k=>{const [empleado,dia]=k.split("::");return [ahora,req.usuario.usuario,req.usuario.nombre,req.usuario.rol,sec.nombre,mes,`Cambió ${empleado} día ${dia}: ${anterior.get(k)||"Sin asignar"} → ${nuevoMapa.get(k)||"Sin asignar"}`]});
        await sheets.spreadsheets.values.append({spreadsheetId:SPREADSHEET_ID,range:`${AUDITORIA_HORARIOS_SHEET_NAME}!A:G`,valueInputOption:"USER_ENTERED",insertDataOption:"INSERT_ROWS",requestBody:{values:filas}});
      }
    });
    await registrarAuditoriaHorario(req.usuario,sec.nombre,mes,"Guardó calendario del sector");
    invalidarCache(`calendarioHorarios:${sector}:${mes}`);

    res.json({ok:true,guardadas:celdas.length});
  } catch(e) { res.status(e.statusCode || 500).json({ok:false,mensaje:e.message || "No se pudo guardar el calendario"}); }
});

let hojaAuditoriaHorariosAsegurada = false;
async function asegurarHojaAuditoriaHorarios() {
  if (hojaAuditoriaHorariosAsegurada) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (!(meta.data.sheets || []).some(h => h.properties?.title === AUDITORIA_HORARIOS_SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody:{ requests:[{ addSheet:{ properties:{ title:AUDITORIA_HORARIOS_SHEET_NAME } } }] } });
  }
  const encabezados = ["Fecha y hora", "Usuario", "Nombre", "Rol", "Sector", "Mes", "Acción"];
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${AUDITORIA_HORARIOS_SHEET_NAME}!A1:G1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[encabezados] } });
  hojaAuditoriaHorariosAsegurada = true;
}
app.get("/horarios/contexto", requerirAccesoHorarios, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const [sectores, usuarios] = await Promise.all([obtenerSectores(), obtenerUsuarios()]);
    const activos = sectores.filter(s => s.activo);
    if (!["administrador","supervisor"].includes(req.usuario.rol) && !req.usuario.sector) return res.status(403).json({ ok:false, mensaje:"Tu usuario no tiene un sector asignado" });
    const sectoresSupervisor = new Set(sectoresACargo(req.usuario));
    // Compatibilidad: también reconoce sectores donde el usuario figura como
    // supervisor en la hoja Sectores. Así puede navegar todos sus calendarios
    // aunque la sesión local sea anterior a la asignación múltiple.
    if (req.usuario.rol === "supervisor") {
      activos.filter(s => normalizarUsuario(s.supervisor) === normalizarUsuario(req.usuario.usuario)).forEach(s => sectoresSupervisor.add(s.id));
      if (req.usuario.sector) sectoresSupervisor.add(req.usuario.sector);
    }
    const visibles = ["administrador","supervisor"].includes(req.usuario.rol)
      ? activos
      : activos.filter(s => s.id === req.usuario.sector);
    if (!["administrador","supervisor"].includes(req.usuario.rol) && !visibles.length) return res.status(403).json({ ok:false, mensaje:"No tenés acceso a un sector activo" });
    await asegurarHojasHorarios();
    const ordenResp = await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${ORDEN_HORARIOS_SHEET_NAME}!A:D`});
    const ordenPorSector = new Map();
    (ordenResp.data.values || []).slice(1).forEach(f => { const sec=normalizarTexto(f[0]), emp=normalizarTexto(f[1]), ord=Number(f[2]); if(sec&&emp&&Number.isFinite(ord)){ if(!ordenPorSector.has(sec)) ordenPorSector.set(sec,new Map()); ordenPorSector.get(sec).set(emp,ord); } });
    const respuesta = visibles.map(s => ({
      id: s.id,
      nombre: s.nombre,
      color: s.color,
      activo: s.activo,
      puedeEditar: req.usuario.rol === "administrador" || (req.usuario.rol === "supervisor" && sectoresSupervisor.has(s.id)),
      empleados: usuarios.filter(u => u.activo && (u.sector === s.id || normalizarUsuario(u.usuario) === normalizarUsuario(s.supervisor)))
        .filter((u, i, arr) => arr.findIndex(x => normalizarUsuario(x.usuario) === normalizarUsuario(u.usuario)) === i)
        .sort((a, b) => { const mapa=ordenPorSector.get(s.id); const an=a.nombre||a.usuario,bn=b.nombre||b.usuario; const ao=mapa?.get(an),bo=mapa?.get(bn); if(Number.isFinite(ao)||Number.isFinite(bo)) return (Number.isFinite(ao)?ao:9999)-(Number.isFinite(bo)?bo:9999); return String(an).localeCompare(String(bn), "es", { sensitivity:"base" }); })
        .map(u => u.nombre || u.usuario),
      empleadosInfo: usuarios.filter(u=>u.activo&&(u.sector===s.id||normalizarUsuario(u.usuario)===normalizarUsuario(s.supervisor)))
        .filter((u, i, arr) => arr.findIndex(x => normalizarUsuario(x.usuario) === normalizarUsuario(u.usuario)) === i)
        .map(u=>({nombre:u.nombre||u.usuario,rol:u.rol,usuario:u.usuario}))
    }));
    res.json({ ok: true, sectores: respuesta, sectorUsuario: req.usuario.sector || "", puedeEditar: ["administrador","supervisor"].includes(req.usuario.rol), rol:req.usuario.rol });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message || "No se pudo cargar el contexto de horarios" });
  }
});

app.get("/horarios/orden", requerirAccesoHorarios, async (req,res) => {
  try {
    const sector=normalizarTexto(req.query.sector);
    if (!puedeAccederSectorHorarios(req.usuario,sector)) return res.status(403).json({ok:false,mensaje:"No tenés acceso a ese sector"});
    await asegurarHojasHorarios();
    const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${ORDEN_HORARIOS_SHEET_NAME}!A:D`});
    const orden=(r.data.values||[]).slice(1).filter(f=>normalizarTexto(f[0])===sector).sort((a,b)=>Number(a[2])-Number(b[2])).map(f=>normalizarTexto(f[1])).filter(Boolean);
    res.json({ok:true,sector,orden});
  }catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo cargar el orden"});}
});
app.put("/horarios/orden", requerirAccesoHorarios, async (req,res) => {
  try {
    const sector=normalizarTexto(req.body?.sector);
    if(!(await puedeModificarSectorHorarios(req.usuario,sector))) return res.status(403).json({ok:false,mensaje:"No tenés permiso para ordenar el personal de este sector"});
    const orden=(Array.isArray(req.body?.orden)?req.body.orden:[]).map(normalizarTexto).filter(Boolean);
    if(!orden.length || new Set(orden).size!==orden.length) return res.status(400).json({ok:false,mensaje:"Orden de personal inválido"});
    const sectores=await obtenerSectores(), usuarios=await obtenerUsuarios(), sec=sectores.find(s=>s.id===sector&&s.activo);
    if(!sec) return res.status(404).json({ok:false,mensaje:"Sector inexistente"});
    const permitidos=new Set(usuarios.filter(u=>u.activo&&(u.sector===sector||normalizarUsuario(u.usuario)===normalizarUsuario(sec.supervisor))).map(u=>u.nombre||u.usuario));
    if(orden.some(x=>!permitidos.has(x)) || orden.length!==permitidos.size) return res.status(400).json({ok:false,mensaje:"El orden debe incluir una vez a todo el personal del sector"});
    await asegurarHojasHorarios();
    await ejecutarEnCola("orden-horarios",async()=>{ const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${ORDEN_HORARIOS_SHEET_NAME}!A:D`}); const otras=(r.data.values||[]).slice(1).filter(f=>normalizarTexto(f[0])!==sector); const ahora=fechaHoraArgentinaIso(); const nuevas=orden.map((e,i)=>[sector,e,i+1,ahora]); const todas=[...otras,...nuevas], prev=Math.max(0,(r.data.values||[]).length-1); if(todas.length) await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${ORDEN_HORARIOS_SHEET_NAME}!A2:D${todas.length+1}`,valueInputOption:"USER_ENTERED",requestBody:{values:todas}}); if(prev>todas.length) await sheets.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range:`${ORDEN_HORARIOS_SHEET_NAME}!A${todas.length+2}:D${prev+1}`}); });
    res.json({ok:true,sector,orden});
  }catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo guardar el orden"});}
});

app.post("/horarios/auditoria", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    if (!(await puedeModificarSectorHorarios(req.usuario, sector))) return res.status(403).json({ ok:false, mensaje:"Solo el administrador o el supervisor asignado pueden modificar este sector" });
    if (!["administrador","supervisor"].includes(req.usuario.rol)) return res.status(403).json({ ok:false, mensaje:"Tu usuario tiene acceso de solo lectura" });
    const sectores = await obtenerSectores();
    const sectorEncontrado = sectores.find(s => s.id === sector && s.activo);
    if (!sectorEncontrado) return res.status(404).json({ ok:false, mensaje:"Sector inexistente o inactivo" });
    await asegurarHojaAuditoriaHorarios();
    const mes = normalizarTexto(req.body?.mes).slice(0, 80);
    const accion = normalizarTexto(req.body?.accion || "Guardó cambios").slice(0, 120);
    await sheets.spreadsheets.values.append({ spreadsheetId:SPREADSHEET_ID, range:`${AUDITORIA_HORARIOS_SHEET_NAME}!A:G`, valueInputOption:"USER_ENTERED", insertDataOption:"INSERT_ROWS", requestBody:{ values:[[fechaHoraArgentinaIso(), req.usuario.usuario, req.usuario.nombre, req.usuario.rol, sectorEncontrado.nombre, mes, accion]] } });
    res.json({ ok:true });
  } catch (error) {
    res.status(500).json({ ok:false, mensaje:error.message || "No se pudo registrar la auditoría" });
  }
});
async function actualizarFilaUsuario(usuario, cambios = {}) {
  const rol = cambios.rol ?? usuario.rol;
  const sector = cambios.sector ?? (usuario.sector || "");
  const sectoresCargo = cambios.sectores ?? (usuario.sectores || []);
  const activo = cambios.activo ?? usuario.activo;
  const permisos = cambios.permisos ?? usuario.permisos;
  const nombre = cambios.nombre ?? usuario.nombre;
  const passwordHash = cambios.passwordHash ?? usuario.passwordHash;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${USUARIOS_SHEET_NAME}!A${usuario.filaGoogle}:I${usuario.filaGoogle}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[usuario.usuario, nombre, passwordHash, rol, activo ? "Sí" : "No", fechaHoraArgentinaIso(), serializarPermisos(permisos, rol), sector, sectoresCargo.join(",")]] }
  });
}

async function actualizarFilaSector(sector, cambios = {}) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SECTORES_SHEET_NAME}!A${sector.filaGoogle}:E${sector.filaGoogle}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[
      sector.id,
      cambios.nombre ?? sector.nombre,
      cambios.color ?? sector.color,
      cambios.supervisor ?? sector.supervisor ?? "",
      (cambios.activo ?? sector.activo) ? "Sí" : "No"
    ]] }
  });
}

async function quitarSupervisionDeUsuario(usuarioClave, exceptoSectorId = "") {
  const clave = normalizarUsuario(usuarioClave);
  if (!clave) return;
  const sectores = await obtenerSectores();
  for (const sector of sectores.filter(s => s.supervisor === clave && s.id !== exceptoSectorId)) await actualizarFilaSector(sector, { supervisor: "" });
}

async function reconciliarSupervisorAnterior(usuarioClave, sectorPreferido = "") {
  const clave = normalizarUsuario(usuarioClave); if (!clave) return;
  invalidarCache("usuarios","sectores");
  const [usuarios, sectores] = await Promise.all([obtenerUsuarios(), obtenerSectores()]);
  const usuario = usuarios.find(u => u.usuario === clave); if (!usuario || usuario.rol === "administrador") return;
  const asignados = sectores.filter(s => s.supervisor === clave && s.activo).map(s => s.id).slice(0,2);
  if (!asignados.length && usuario.rol === "supervisor") await actualizarFilaUsuario(usuario, { rol:"personal", sector:sectorPreferido || usuario.sector || "", sectores:[] });
  else if (usuario.rol === "supervisor") await actualizarFilaUsuario(usuario, { sector:asignados[0] || "", sectores:asignados });
  invalidarCache("usuarios");
}

async function asignarSupervisorASector(usuarioClave, sectorId) {
  const clave=normalizarUsuario(usuarioClave); if(!clave)return;
  const [usuarios, sectores]=await Promise.all([obtenerUsuarios(),obtenerSectores()]);
  const usuario=usuarios.find(u=>u.usuario===clave), sector=sectores.find(s=>s.id===sectorId);
  if(!usuario) throw new Error("El supervisor seleccionado no existe");
  if(!usuario.activo || usuario.rol!=="supervisor") throw new Error("Solo podés asignar usuarios activos con rol Supervisor");
  if(!sector || !sector.activo) throw new Error("El sector seleccionado no existe o está inactivo");
  const actuales=sectores.filter(s=>s.supervisor===clave && s.id!==sectorId);
  if(actuales.length>=2) throw new Error("Este supervisor ya tiene dos sectores asignados");
  const anterior=normalizarUsuario(sector.supervisor);
  if(anterior && anterior!==clave) await reconciliarSupervisorAnterior(anterior, sector.id);
  const ids=[...new Set([usuario.sector,...(usuario.sectores||[]),...actuales.map(s=>s.id),sectorId].filter(Boolean))].slice(0,2);
  await actualizarFilaUsuario(usuario,{rol:"supervisor",sector:ids[0]||sectorId,sectores:ids});
  invalidarCache("usuarios");
}

async function sincronizarUsuarioSupervisor(usuarioClave, rol, sectorId, activo = true, sectoresSolicitados = []) {
  const clave=normalizarUsuario(usuarioClave); const sectores=await obtenerSectores();
  const actuales=sectores.filter(s=>s.supervisor===clave);
  if(rol!=="supervisor"){for(const s of actuales)await actualizarFilaSector(s,{supervisor:""});return;}
  if(!activo) throw new Error("Un usuario inactivo no puede ser supervisor");
  const ids=[...new Set([sectorId,...sectoresSolicitados].map(normalizarTexto).filter(Boolean))];
  if(!ids.length) throw new Error("Asigná al menos un sector al supervisor");
  if(ids.length>2) throw new Error("Un supervisor puede tener como máximo dos sectores");
  for(const id of ids){const destino=sectores.find(s=>s.id===id&&s.activo);if(!destino)throw new Error("Uno de los sectores seleccionados no existe o está inactivo");}
  for(const s of actuales.filter(s=>!ids.includes(s.id))) await actualizarFilaSector(s,{supervisor:""});
  for(const id of ids){const destino=sectores.find(s=>s.id===id);const previo=normalizarUsuario(destino.supervisor);await actualizarFilaSector(destino,{supervisor:clave});if(previo&&previo!==clave)await reconciliarSupervisorAnterior(previo,destino.id);}
}

async function sincronizarSectorSupervisor(sector, nuevoSupervisor) {
  const anterior=normalizarUsuario(sector.supervisor), nuevo=normalizarUsuario(nuevoSupervisor);
  if(nuevo) await asignarSupervisorASector(nuevo,sector.id);
  await actualizarFilaSector(sector,{supervisor:nuevo});
  if(anterior&&anterior!==nuevo) await reconciliarSupervisorAnterior(anterior,sector.id);
  invalidarCache("usuarios","sectores");
}

app.get("/admin/sectores", requerirAdministrador, async (req,res) => {
  try { res.json({ok:true, sectores:await obtenerSectores()}); }
  catch(e) { res.status(500).json({ok:false,mensaje:e.message || "No se pudieron cargar los sectores"}); }
});

app.post("/admin/sectores", requerirAdministrador, async (req,res) => {
  try {
    const nombre=normalizarTexto(req.body?.nombre), id=idSector(nombre);
    if(!nombre||!id) return res.status(400).json({ok:false,mensaje:"Ingresá un nombre válido"});
    const ss=await obtenerSectores();
    if(ss.some(s=>s.id===id||s.nombre.toLowerCase()===nombre.toLowerCase())) return res.status(409).json({ok:false,mensaje:"Ese sector ya existe"});
    const color=/^#[0-9a-f]{6}$/i.test(req.body?.color||"")?req.body.color:"#b72e35";
    const supervisor=normalizarUsuario(req.body?.supervisor);
    await sheets.spreadsheets.values.append({spreadsheetId:SPREADSHEET_ID,range:`${SECTORES_SHEET_NAME}!A:E`,valueInputOption:"USER_ENTERED",insertDataOption:"INSERT_ROWS",requestBody:{values:[[id,nombre,color,"","Sí"]]}});
    const creado=(await obtenerSectores()).find(s=>s.id===id);
    if (supervisor && creado) await sincronizarSectorSupervisor(creado, supervisor);
    invalidarCache("usuarios","sectores");
    res.json({ok:true, sector:{id,nombre,color,supervisor,activo:true}});
  } catch(e) { res.status(500).json({ok:false,mensaje:e.message || "No se pudo crear el sector"}); }
});

app.put("/admin/sectores/:id", requerirAdministrador, async (req,res) => {
  try {
    const ss=await obtenerSectores(), s=ss.find(x=>x.id===normalizarTexto(req.params.id));
    if(!s) return res.status(404).json({ok:false,mensaje:"Sector no encontrado"});
    const nombre=normalizarTexto(req.body?.nombre)||s.nombre;
    const color=/^#[0-9a-f]{6}$/i.test(req.body?.color||"")?req.body.color:s.color;
    const supervisor=normalizarUsuario(req.body?.supervisor);
    const activo=req.body?.activo===undefined?s.activo:Boolean(req.body.activo);
    if (!activo && supervisor) return res.status(400).json({ok:false,mensaje:"Un sector inactivo no puede conservar supervisor"});
    await actualizarFilaSector(s,{nombre,color,activo,supervisor:s.supervisor});
    await sincronizarSectorSupervisor({...s,nombre,color,activo}, supervisor); invalidarCache("sectores","usuarios");
    res.json({ok:true, sector:{id:s.id,nombre,color,supervisor,activo}});
  } catch(e) { res.status(500).json({ok:false,mensaje:e.message || "No se pudo actualizar el sector"}); }
});



let hojaTareasAsegurada = false;
async function asegurarHojaTareas() {
  if (hojaTareasAsegurada) return;
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (!(meta.data.sheets || []).some(h => h.properties?.title === TAREAS_SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody:{ requests:[{ addSheet:{ properties:{ title:TAREAS_SHEET_NAME } } }] } });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId:SPREADSHEET_ID, range:`${TAREAS_SHEET_NAME}!A1:I1`, valueInputOption:"USER_ENTERED",
    requestBody:{ values:[["ID","Sector","Nombre","Duración","Activo","Asignaciones","Actualizado","Actualizado por","Días semana"]] }
  });
  hojaTareasAsegurada = true;
}
function normalizarTareaServidor(t) {
  const asignaciones = t?.asignaciones && typeof t.asignaciones === "object" ? t.asignaciones : {};
  return {
    id: normalizarTexto(t?.id) || crypto.randomUUID(),
    sector: normalizarTexto(t?.sector) || "General",
    nombre: normalizarTexto(t?.nombre) || "Tarea",
    duracionMin: Math.max(1, Math.min(480, Number(t?.duracionMin || t?.duracion || 10))),
    diasSemana: (()=>{
      const dias=Array.isArray(t?.diasSemana)?t.diasSemana.map(Number).filter(d=>Number.isInteger(d)&&d>=0&&d<=6):[];
      return dias.length?[...new Set(dias)]:[0,1,2,3,4,5,6];
    })(),
    activo: t?.activo !== false,
    asignaciones
  };
}
function fusionarAsignacionesServidor(base = {}, entrada = {}) {
  const salida = JSON.parse(JSON.stringify(base || {}));
  for (const [fecha, turnos] of Object.entries(entrada || {})) {
    salida[fecha] = salida[fecha] || {};
    for (const [turno, asignacion] of Object.entries(turnos || {})) {
      if (asignacion == null) delete salida[fecha][turno];
      else salida[fecha][turno] = { ...(salida[fecha][turno] || {}), ...asignacion };
    }
    if (!Object.keys(salida[fecha]).length) delete salida[fecha];
  }
  return salida;
}
function fusionarTareaServidor(actual, entrante) {
  const a = normalizarTareaServidor(actual || {}), e = normalizarTareaServidor(entrante || {});
  return { ...a, ...e, asignaciones: fusionarAsignacionesServidor(a.asignaciones, e.asignaciones) };
}
async function asegurarHojaBano() {
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (!(meta.data.sheets || []).some(h => h.properties?.title === TAREAS_BANO_SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody:{ requests:[{ addSheet:{ properties:{ title:TAREAS_BANO_SHEET_NAME } } }] } });
  }
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${TAREAS_BANO_SHEET_NAME}!A1:D1`, valueInputOption:"USER_ENTERED", requestBody:{values:[["Clave","Datos","Actualizado","Actualizado por"]]} });
}
async function leerBanoServidor() {
  await asegurarHojaBano();
  const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${TAREAS_BANO_SHEET_NAME}!A:D`});
  const filas=(r.data.values||[]).slice(1);
  const mapa=new Map(filas.map(f=>[f[0],f]));
  let config={participantes:[],fechaAncla:new Date().toISOString().slice(0,10),historial:[]};
  try{ if(mapa.get("config")?.[1]) config={...config,...JSON.parse(mapa.get("config")[1])}; }catch{}
  try{ if(mapa.get("historial")?.[1]) config.historial=JSON.parse(mapa.get("historial")[1])||[]; }catch{}
  config.participantes=Array.isArray(config.participantes)?config.participantes:[];
  config.historial=Array.isArray(config.historial)?config.historial:[];
  return config;
}
async function guardarBanoServidor(config, usuario) {
  return ejecutarEnCola("tareas-bano",async()=>{
    await asegurarHojaBano();
    const limpio={participantes:[...new Set((config.participantes||[]).map(normalizarTexto).filter(Boolean))],fechaAncla:normalizarTexto(config.fechaAncla)||new Date().toISOString().slice(0,10)};
    const historial=Array.isArray(config.historial)?config.historial:[];
    await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${TAREAS_BANO_SHEET_NAME}!A2:D3`,valueInputOption:"USER_ENTERED",requestBody:{values:[
      ["config",JSON.stringify(limpio),fechaHoraArgentinaIso(),usuario?.usuario||""],
      ["historial",JSON.stringify(historial),fechaHoraArgentinaIso(),usuario?.usuario||""]
    ]}});
    return {...limpio,historial};
  });
}
async function obtenerTareasServidor() {
  await asegurarHojaTareas();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:`${TAREAS_SHEET_NAME}!A:I` });
  const filasTareas=(r.data.values || []).slice(1).filter(f=>f[0]);
  cantidadFilasTareasConocida=filasTareas.length;
  return filasTareas.map(f=>{
    let asignaciones={}; try{asignaciones=JSON.parse(f[5]||"{}");}catch{}
    let diasSemana=[]; try{diasSemana=JSON.parse(f[8]||"[]");}catch{}
    return normalizarTareaServidor({id:f[0],sector:f[1],nombre:f[2],duracionMin:Number(f[3]),activo:!["no","false","0","inactivo"].includes(normalizarTexto(f[4]).toLowerCase()),asignaciones,diasSemana});
  });
}
let cantidadFilasTareasConocida = null;
function esErrorCuotaGoogle(error) {
  const status=Number(error?.response?.status||error?.code||error?.status||0);
  const reason=error?.response?.data?.error?.errors?.[0]?.reason||"";
  return status===429 || reason==="rateLimitExceeded" || reason==="userRateLimitExceeded";
}
async function ejecutarGoogleConReintento(operacion, intentos=4) {
  let ultimoError;
  for(let intento=0;intento<intentos;intento++){
    try{return await operacion();}
    catch(error){
      ultimoError=error;
      if(!esErrorCuotaGoogle(error)||intento===intentos-1)throw error;
      const espera=700*Math.pow(2,intento)+Math.floor(Math.random()*250);
      await new Promise(resolve=>setTimeout(resolve,espera));
    }
  }
  throw ultimoError;
}
async function guardarTareasServidor(tareas, usuario) {
  return ejecutarEnCola("tareas", async()=>{
    await asegurarHojaTareas();
    const filas=(tareas||[]).map(normalizarTareaServidor).map(t=>[t.id,t.sector,t.nombre,t.duracionMin,t.activo?"Sí":"No",JSON.stringify(t.asignaciones||{}),fechaHoraArgentinaIso(),usuario?.usuario||"",JSON.stringify(t.diasSemana||[0,1,2,3,4,5,6])]);
    const prevCount=Number.isInteger(cantidadFilasTareasConocida)?cantidadFilasTareasConocida:filas.length;
    if(filas.length) await ejecutarGoogleConReintento(()=>sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${TAREAS_SHEET_NAME}!A2:I${filas.length+1}`,valueInputOption:"USER_ENTERED",requestBody:{values:filas}}));
    if(prevCount>filas.length) await ejecutarGoogleConReintento(()=>sheets.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range:`${TAREAS_SHEET_NAME}!A${filas.length+2}:I${prevCount+1}`}));
    cantidadFilasTareasConocida=filas.length;
    invalidarCache("tareas");
  });
}
async function sectoresTareasPermitidos(usuario) {
  const sectores=(await obtenerSectores()).filter(s=>s.activo);
  if(usuario.rol==="administrador") return sectores;
  if(usuario.rol==="supervisor") {
    const ids=new Set([usuario.sector,...(usuario.sectores||[])].filter(Boolean));
    sectores.filter(s=>normalizarUsuario(s.supervisor)===normalizarUsuario(usuario.usuario)).forEach(s=>ids.add(s.id));
    return sectores.filter(s=>ids.has(s.id));
  }
  return sectores.filter(s=>s.id===usuario.sector);
}
app.get("/tareas/contexto", requerirSesion, async (req,res)=>{
  try {
    const sectores=await sectoresTareasPermitidos(req.usuario);
    res.json({ok:true,rol:req.usuario.rol,sectores:sectores.map(s=>({id:s.id,nombre:s.nombre,color:s.color})),puedeAsignar:["administrador","supervisor"].includes(req.usuario.rol),puedeConfigurar:["administrador","supervisor"].includes(req.usuario.rol)});
  } catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo cargar el contexto de tareas"});}
});

app.get("/tareas", requerirSesion, async (req,res)=>{
  try {
    const [tareas,sectores]=await Promise.all([obtenerTareasServidor(),sectoresTareasPermitidos(req.usuario)]);
    const permitidos=new Set(sectores.flatMap(s=>[normalizarTexto(s.id),normalizarTexto(s.nombre)]));
    // Las tareas pertenecen al sector: todo usuario activo del sector puede verlas,
    // aunque la asignación indique otro responsable. Los permisos de edición se
    // siguen resolviendo por rol en /tareas/contexto y en los endpoints de escritura.
    const visibles=tareas.filter(t=>permitidos.has(normalizarTexto(t.sector)));
    res.json({ok:true,tareas:visibles});
  } catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudieron cargar las tareas"});}
});

app.put("/tareas", requerirSesion, async (req,res)=>{
  try {
    if(!["administrador","supervisor"].includes(req.usuario.rol)) return res.status(403).json({ok:false,mensaje:"No tenés permiso para modificar tareas"});
    const entrantes=Array.isArray(req.body?.tareas)?req.body.tareas.map(normalizarTareaServidor):[];
    const eliminadas=new Set((Array.isArray(req.body?.deletedIds)?req.body.deletedIds:[]).map(normalizarTexto).filter(Boolean));
    const actuales=await obtenerTareasServidor();
    const sectores=await sectoresTareasPermitidos(req.usuario);
    const permitidos=new Set(sectores.flatMap(s=>[normalizarTexto(s.id),normalizarTexto(s.nombre)]));
    const puedeSector=t=>req.usuario.rol==="administrador"||permitidos.has(normalizarTexto(t.sector));
    const mapa=new Map(actuales.filter(t=>!(eliminadas.has(t.id)&&puedeSector(t))).map(t=>[t.id,t]));
    for(const tarea of entrantes){
      if(!puedeSector(tarea)) continue;
      mapa.set(tarea.id, mapa.has(tarea.id) ? fusionarTareaServidor(mapa.get(tarea.id), tarea) : tarea);
    }
    const fusion=[...mapa.values()];
    await guardarTareasServidor(fusion,req.usuario);
    const visibles=req.usuario.rol==="administrador"?fusion:fusion.filter(t=>permitidos.has(normalizarTexto(t.sector)));
    res.json({ok:true,tareas:visibles});
  } catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudieron guardar las tareas"});}
});

app.post("/tareas/asignacion", requerirSesion, async (req,res)=>{
  try {
    if(!["administrador","supervisor"].includes(req.usuario.rol)) return res.status(403).json({ok:false,mensaje:"No tenés permiso para asignar tareas"});
    const id=normalizarTexto(req.body?.id),fecha=normalizarTexto(req.body?.fecha),turno=normalizarTexto(req.body?.turno);
    const tareas=await obtenerTareasServidor(), tarea=tareas.find(t=>t.id===id);
    if(!tarea||!fecha||!["manana","tarde"].includes(turno)) return res.status(400).json({ok:false,mensaje:"Asignación inválida"});
    const sectores=await sectoresTareasPermitidos(req.usuario),permitidos=new Set(sectores.flatMap(s=>[normalizarTexto(s.id),normalizarTexto(s.nombre)]));
    if(req.usuario.rol!=="administrador"&&!permitidos.has(normalizarTexto(tarea.sector))) return res.status(403).json({ok:false,mensaje:"No tenés permiso para este sector"});
    tarea.asignaciones=tarea.asignaciones||{}; tarea.asignaciones[fecha]=tarea.asignaciones[fecha]||{};
    const asignacionAnterior=tarea.asignaciones[fecha][turno]||{};
    const responsables=[...new Set((req.body?.responsables||[]).map(normalizarTexto).filter(Boolean))];
    tarea.asignaciones[fecha][turno]={...asignacionAnterior,responsables,estado:normalizarTexto(req.body?.estado)||"pendiente",completadaPor:"",completadaHora:""};
    await guardarTareasServidor(tareas,req.usuario);
    res.json({ok:true,asignacion:tarea.asignaciones[fecha][turno]});
  } catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo guardar la asignación"});}
});

app.post("/tareas/asignaciones-lote", requerirSesion, async (req,res)=>{
  try {
    if(!["administrador","supervisor"].includes(req.usuario.rol)) return res.status(403).json({ok:false,mensaje:"No tenés permiso para asignar tareas"});
    const ids=[...new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(normalizarTexto).filter(Boolean))],fecha=normalizarTexto(req.body?.fecha),turno=normalizarTexto(req.body?.turno),responsable=normalizarTexto(req.body?.responsable),reemplazar=Boolean(req.body?.reemplazar);
    if((!ids.length&&!reemplazar)||!fecha||!["manana","tarde"].includes(turno)||!responsable) return res.status(400).json({ok:false,mensaje:"Asignación incompleta"});
    const tareas=await obtenerTareasServidor(), sectores=await sectoresTareasPermitidos(req.usuario),permitidos=new Set(sectores.flatMap(s=>[normalizarTexto(s.id),normalizarTexto(s.nombre)]));
    const seleccionadas=tareas.filter(t=>ids.includes(t.id));
    if(seleccionadas.length!==ids.length) return res.status(404).json({ok:false,mensaje:"Una o más tareas no existen"});
    if(seleccionadas.some(t=>req.usuario.rol!=="administrador"&&!permitidos.has(normalizarTexto(t.sector)))) return res.status(403).json({ok:false,mensaje:"No tenés permiso para una de las tareas"});
    if(reemplazar){
      for(const tarea of tareas){
        const asig=tarea.asignaciones?.[fecha]?.[turno];
        if(!asig) continue;
        const restantes=(asig.responsables||[]).map(normalizarTexto).filter(r=>r&&normalizarUsuario(r)!==normalizarUsuario(responsable));
        if(restantes.length) asig.responsables=[...new Set(restantes)];
        else { delete tarea.asignaciones[fecha][turno]; if(!Object.keys(tarea.asignaciones[fecha]).length) delete tarea.asignaciones[fecha]; }
      }
    }
    for(const tarea of seleccionadas){
      tarea.asignaciones=tarea.asignaciones||{}; tarea.asignaciones[fecha]=tarea.asignaciones[fecha]||{};
      const anterior=tarea.asignaciones[fecha][turno]||{};
      const responsables=[...new Set([...(anterior.responsables||[]).map(normalizarTexto).filter(Boolean),responsable])];
      tarea.asignaciones[fecha][turno]={...anterior,responsables,estado:anterior.estado||"pendiente",completadaPor:anterior.completadaPor||"",completadaHora:anterior.completadaHora||""};
    }
    await guardarTareasServidor(tareas,req.usuario);
    const visibles=req.usuario.rol==="administrador"?tareas:tareas.filter(t=>permitidos.has(normalizarTexto(t.sector)));
    res.json({ok:true,asignadas:seleccionadas.length,responsable,tareas:visibles});
  } catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudieron asignar las tareas"});}
});
app.delete("/tareas/asignacion", requerirSesion, async (req,res)=>{
  try {
    if(!["administrador","supervisor"].includes(req.usuario.rol)) return res.status(403).json({ok:false,mensaje:"No tenés permiso para eliminar asignaciones"});
    const id=normalizarTexto(req.body?.id),fecha=normalizarTexto(req.body?.fecha),turno=normalizarTexto(req.body?.turno);
    const tareas=await obtenerTareasServidor(),tarea=tareas.find(t=>t.id===id);
    if(!tarea?.asignaciones?.[fecha]?.[turno]) return res.status(404).json({ok:false,mensaje:"Asignación no encontrada"});
    const sectores=await sectoresTareasPermitidos(req.usuario),permitidos=new Set(sectores.flatMap(s=>[normalizarTexto(s.id),normalizarTexto(s.nombre)]));
    if(req.usuario.rol!=="administrador"&&!permitidos.has(normalizarTexto(tarea.sector))) return res.status(403).json({ok:false,mensaje:"No tenés permiso para este sector"});
    delete tarea.asignaciones[fecha][turno]; if(!Object.keys(tarea.asignaciones[fecha]).length) delete tarea.asignaciones[fecha];
    await guardarTareasServidor(tareas,req.usuario); res.json({ok:true});
  } catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo eliminar la asignación"});}
});
app.get("/tareas/bano", requerirSesion, async(req,res)=>{try{res.json({ok:true,config:await leerBanoServidor()});}catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo cargar la rotación"});}});
app.put("/tareas/bano", requerirSesion, async(req,res)=>{
  try{
    if(!["administrador","supervisor"].includes(req.usuario.rol)) return res.status(403).json({ok:false,mensaje:"No tenés permiso para configurar la rotación"});
    const actual=await leerBanoServidor();
    const config=await guardarBanoServidor({...actual,participantes:req.body?.participantes||[],fechaAncla:req.body?.fechaAncla||actual.fechaAncla},req.usuario);
    res.json({ok:true,config});
  }catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo guardar la rotación"});}
});
app.post("/tareas/bano/confirmar", requerirSesion, async(req,res)=>{
  try{
    const fecha=normalizarTexto(req.body?.fecha)||new Date().toISOString().slice(0,10),actual=await leerBanoServidor();
    if(!actual.historial.some(x=>x.fecha===fecha)) actual.historial.unshift({fecha,usuario:req.usuario.nombre||req.usuario.usuario,hora:new Date().toLocaleTimeString("es-AR",{timeZone:TIME_ZONE,hour:"2-digit",minute:"2-digit"})});
    const config=await guardarBanoServidor(actual,req.usuario);res.json({ok:true,config});
  }catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo confirmar la limpieza"});}
});

app.post("/tareas/completar", requerirSesion, async (req,res)=>{
  try {
    const id=normalizarTexto(req.body?.id),fecha=normalizarTexto(req.body?.fecha),turno=normalizarTexto(req.body?.turno);
    const tareas=await obtenerTareasServidor(),t=tareas.find(x=>x.id===id);
    if(!t||!t.asignaciones?.[fecha]?.[turno]) return res.status(404).json({ok:false,mensaje:"Asignación no encontrada"});
    const asig=t.asignaciones[fecha][turno];
    if(req.usuario.rol!=="administrador") {
      const sectores=await sectoresTareasPermitidos(req.usuario);
      const permitidos=new Set(sectores.flatMap(s=>[normalizarTexto(s.id),normalizarTexto(s.nombre)]));
      if(!permitidos.has(normalizarTexto(t.sector))) return res.status(403).json({ok:false,mensaje:"No tenés permiso para completar tareas de este sector"});
    }
    const yaEstabaCompletada = normalizarTexto(asig.estado).toLowerCase() === "completada";
    asig.estado="completada"; asig.completadaPor=req.usuario.nombre||req.usuario.usuario; asig.completadaHora=new Date().toLocaleTimeString("es-AR",{timeZone:TIME_ZONE,hour:"2-digit",minute:"2-digit"});
    await guardarTareasServidor(tareas,req.usuario);
    if (!yaEstabaCompletada) {
      setImmediate(() => notificarSupervisorTareaCompletada({ tarea:t, fecha, turno, asignacion:asig, completadaPor:req.usuario })
        .catch(error => console.error("Error notificando tarea completada al supervisor:", error)));
    }
    res.json({ok:true,asignacion:asig});
  } catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo completar la tarea"});}
});

app.get("/tareas/usuarios", requerirSesion, async (req, res) => {
  try {
    const [usuarios, sectores] = await Promise.all([obtenerUsuarios(), sectoresTareasPermitidos(req.usuario)]);
    const permitidos = new Set(sectores.map(s=>s.id));
    const visibles = req.usuario.rol === "administrador" ? usuarios.filter(u=>u.activo) : usuarios.filter(u => u.activo && (permitidos.has(u.sector) || (u.sectores || []).some(s => permitidos.has(s))));
    res.json({ok:true, usuarios:visibles.map(u=>({usuario:u.usuario,nombre:u.nombre,sector:u.sector,sectores:u.sectores||[]}))});
  } catch(error) { res.status(500).json({ok:false,mensaje:error.message || "No se pudieron cargar los usuarios"}); }
});

app.get("/admin/usuarios", requerirAdministrador, async (req, res) => {
  try {
    const usuarios = await obtenerUsuarios();
    res.json({ ok: true, usuarios: usuarios.map(({ passwordHash, filaGoogle, ...usuario }) => usuario) });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message || "No se pudieron cargar los usuarios" });
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
    const sectoresCargo = [...new Set((Array.isArray(req.body?.sectores)?req.body.sectores:[]).map(normalizarTexto).filter(Boolean))];
    const permisos = normalizarPermisos(req.body?.permisos, rol);
    if (sector) {
      const sectores = await obtenerSectores();
      if (!sectores.some(s => s.id === sector && s.activo)) return res.status(400).json({ ok:false, mensaje:"El sector seleccionado no existe o está inactivo" });
    }
    if (rol === "supervisor" && ![sector,...sectoresCargo].filter(Boolean).length) return res.status(400).json({ ok:false, mensaje:"Asigná al menos un sector al supervisor" });
    if ([...new Set([sector,...sectoresCargo].filter(Boolean))].length > 2) return res.status(400).json({ok:false,mensaje:"Un supervisor puede tener como máximo dos sectores"});
    if (sectoresCargo.length) { const sectores=await obtenerSectores(); if (sectoresCargo.some(id=>!sectores.some(s=>s.id===id&&s.activo))) return res.status(400).json({ok:false,mensaje:"Uno de los sectores a cargo no existe o está inactivo"}); }
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return res.status(400).json({ ok:false, mensaje:"El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo" });
    if (password.length < 4) return res.status(400).json({ ok:false, mensaje:"La contraseña debe tener al menos 4 caracteres" });
    const usuarios = await obtenerUsuarios();
    if (usuarios.some(item => item.usuario === usuario)) return res.status(409).json({ ok:false, mensaje:"Ese usuario ya existe" });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USUARIOS_SHEET_NAME}!A:I`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[usuario, nombre, hashPassword(password), rol, "Sí", fechaHoraArgentinaIso(), serializarPermisos(permisos, rol), sector, sectoresCargo.join(",")]] }
    });
    invalidarCache("usuarios");
    await sincronizarUsuarioSupervisor(usuario, rol, sector, true, sectoresCargo);
    res.json({ ok:true, mensaje:"Usuario creado", usuario:{ usuario, nombre, rol, activo:true, permisos, sector, sectores:sectoresCargo } });
  } catch (error) {
    res.status(500).json({ ok:false, mensaje:error.message || "No se pudo crear el usuario" });
  }
});

app.put("/admin/usuarios/:usuario", requerirAdministrador, async (req, res) => {
  try {
    const clave = normalizarUsuario(req.params.usuario);
    const usuarios = await obtenerUsuarios();
    const actual = usuarios.find(item => item.usuario === clave);
    if (!actual) return res.status(404).json({ ok:false, mensaje:"Usuario no encontrado" });
    const nombre = normalizarTexto(req.body?.nombre) || actual.nombre;
    const rolEntrada = req.body?.rol === undefined ? actual.rol : normalizarTexto(req.body.rol).toLowerCase();
    const rol = normalizarRol(rolEntrada);
    const sector = req.body?.sector === undefined ? (actual.sector || "") : normalizarTexto(req.body.sector);
    const sectoresCargo = req.body?.sectores === undefined ? (actual.sectores || []) : [...new Set((Array.isArray(req.body.sectores)?req.body.sectores:[]).map(normalizarTexto).filter(Boolean))];
    const activo = req.body?.activo === undefined ? actual.activo : Boolean(req.body.activo);
    const permisos = req.body?.permisos === undefined ? normalizarPermisos(actual.permisos, rol) : normalizarPermisos(req.body.permisos, rol);
    const password = String(req.body?.password || "");
    if (sector) {
      const sectores = await obtenerSectores();
      if (!sectores.some(s => s.id === sector && s.activo)) return res.status(400).json({ ok:false, mensaje:"El sector seleccionado no existe o está inactivo" });
    }
    if (rol === "supervisor" && ![sector,...sectoresCargo].filter(Boolean).length) return res.status(400).json({ ok:false, mensaje:"Asigná al menos un sector al supervisor" });
    if ([...new Set([sector,...sectoresCargo].filter(Boolean))].length > 2) return res.status(400).json({ok:false,mensaje:"Un supervisor puede tener como máximo dos sectores"});
    if (sectoresCargo.length) { const sectores=await obtenerSectores(); if (sectoresCargo.some(id=>!sectores.some(s=>s.id===id&&s.activo))) return res.status(400).json({ok:false,mensaje:"Uno de los sectores a cargo no existe o está inactivo"}); }
    if (clave === req.usuario.usuario && (!activo || rol !== "administrador")) {
      return res.status(400).json({ ok:false, mensaje:"No podés desactivar tu propia cuenta ni quitarte el rol de administrador" });
    }
    if (password && password.length < 4) return res.status(400).json({ ok:false, mensaje:"La contraseña debe tener al menos 4 caracteres" });
    const hash = password ? hashPassword(password) : actual.passwordHash;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USUARIOS_SHEET_NAME}!A${actual.filaGoogle}:I${actual.filaGoogle}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[clave, nombre, hash, rol, activo ? "Sí" : "No", fechaHoraArgentinaIso(), serializarPermisos(permisos, rol), sector, sectoresCargo.join(",")]] }
    });
    invalidarCache("usuarios");
    await sincronizarUsuarioSupervisor(clave, rol, sector, activo, sectoresCargo);
    res.json({ ok:true, mensaje:"Usuario actualizado", usuario:{ usuario:clave, nombre, rol, activo, permisos, sector, sectores:sectoresCargo } });
  } catch (error) {
    res.status(500).json({ ok:false, mensaje:error.message || "No se pudo actualizar el usuario" });
  }
});


async function eliminarFilaDeHoja(nombreHoja, filaGoogle) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields:"sheets(properties(sheetId,title))" });
  const hoja = (meta.data.sheets || []).find(h => h.properties?.title === nombreHoja);
  if (!hoja) throw new Error(`No existe la hoja ${nombreHoja}`);
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:SPREADSHEET_ID, requestBody:{ requests:[{ deleteDimension:{ range:{ sheetId:hoja.properties.sheetId, dimension:"ROWS", startIndex:filaGoogle-1, endIndex:filaGoogle } } }] } });
}
async function eliminarRegistrosSector(nombreHoja, sectorId, columnas) {
  const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${nombreHoja}!A:${columnas}`});
  const filas=r.data.values||[]; if(!filas.length)return;
  const restantes=[filas[0],...filas.slice(1).filter(f=>normalizarTexto(f[0])!==sectorId)];
  await sheets.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range:`${nombreHoja}!A:${columnas}`});
  await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${nombreHoja}!A1:${columnas}${restantes.length}`,valueInputOption:"USER_ENTERED",requestBody:{values:restantes}});
}
app.delete("/admin/usuarios/:usuario", requerirAdministrador, async (req,res)=>{
  try{
    const clave=normalizarUsuario(req.params.usuario), usuarios=await obtenerUsuarios();
    const actual=usuarios.find(u=>u.usuario===clave); if(!actual)return res.status(404).json({ok:false,mensaje:"Usuario no encontrado"});
    if(clave===req.usuario.usuario)return res.status(400).json({ok:false,mensaje:"No podés eliminar tu propia cuenta"});
    if(actual.rol==="administrador" && usuarios.filter(u=>u.activo&&u.rol==="administrador").length<=1)return res.status(400).json({ok:false,mensaje:"No se puede eliminar el último administrador"});
    const sectores=await obtenerSectores();
    for(const sector of sectores.filter(s=>s.supervisor===clave)) await actualizarFilaSector(sector,{supervisor:""});
    await eliminarFilaDeHoja(USUARIOS_SHEET_NAME,actual.filaGoogle); invalidarCache("usuarios");
    res.json({ok:true,mensaje:"Usuario eliminado"});
  }catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo eliminar el usuario"});}
});
app.delete("/admin/sectores/:id", requerirAdministrador, async (req,res)=>{
  try{
    const id=normalizarTexto(req.params.id), [sectores,usuarios]=await Promise.all([obtenerSectores(),obtenerUsuarios()]);
    const sector=sectores.find(s=>s.id===id); if(!sector)return res.status(404).json({ok:false,mensaje:"Sector no encontrado"});
    const asignados=usuarios.filter(u=>u.sector===id); if(asignados.length)return res.status(409).json({ok:false,mensaje:`No se puede eliminar: hay ${asignados.length} usuario(s) asignado(s). Reasignalos primero.`});
    await asegurarHojasHorarios();
    await Promise.all([
      eliminarRegistrosSector(CALENDARIO_HORARIOS_SHEET_NAME,id,"H"), eliminarRegistrosSector(TURNOS_HORARIOS_SHEET_NAME,id,"J"),
      eliminarRegistrosSector(DETALLES_HORARIOS_SHEET_NAME,id,"I"), eliminarRegistrosSector(REEMPLAZOS_HORARIOS_SHEET_NAME,id,"I"), eliminarRegistrosSector(ORDEN_HORARIOS_SHEET_NAME,id,"D")
    ]);
    await eliminarFilaDeHoja(SECTORES_SHEET_NAME,sector.filaGoogle); hojaSectoresAsegurada=false; invalidarCache("usuarios","sectores");
    res.json({ok:true,mensaje:"Sector eliminado"});
  }catch(e){res.status(500).json({ok:false,mensaje:e.message||"No se pudo eliminar el sector"});}
});

app.get("/", (req, res) => {
  res.send(`Servidor Herramientas Autoservicio Victor V${APP_VERSION} funcionando`);
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

async function asegurarColumnasCatalogo() {
  // La importación del catálogo nunca modifica la hoja Stock.
  // La columna A de Productos se fuerza a TEXTO para preservar códigos y ceros iniciales.
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PRODUCTOS_SHEET_NAME}!A1:C1`,
    valueInputOption: "RAW",
    requestBody: { values: [["codigo", "articulo", "precio"]] }
  });

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets(properties(sheetId,title))"
  });
  const hoja = (metadata.data.sheets || []).find(item => item.properties?.title === PRODUCTOS_SHEET_NAME);
  if (!hoja) throw new Error(`No existe la hoja ${PRODUCTOS_SHEET_NAME}`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: hoja.properties.sheetId, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
          fields: "userEnteredFormat.numberFormat"
        }
      }]
    }
  });
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
      const indice = catalogo.findIndex(actual => actual.codigo === clave);
      if (indice >= 0) catalogo[indice] = producto;
      continue;
    }
    codigosVistos.add(clave);
    catalogo.push(producto);
  }

  if (!catalogo.length) throw new Error("No se encontraron productos válidos para reemplazar el catálogo");

  if (aplicarCambios) {
    await asegurarColumnasCatalogo();

    const actualResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PRODUCTOS_SHEET_NAME}!A:C`,
      valueRenderOption: "FORMATTED_VALUE"
    });
    const filasActuales = (actualResp.data.values || []).length;

    const filasFinales = [
      ["codigo", "articulo", "precio"],
      ...catalogo.map(producto => [
        String(producto.codigo),
        producto.articulo || "",
        producto.precio ?? ""
      ])
    ];

    // Primero se escribe el catálogo completo en una única operación lógica.
    // Solo después se limpian posibles filas sobrantes del catálogo anterior.
    const data = [];
    for (let i = 0; i < filasFinales.length; i += 5000) {
      const bloque = filasFinales.slice(i, i + 5000);
      const filaInicio = i + 1;
      data.push({
        range: `${PRODUCTOS_SHEET_NAME}!A${filaInicio}:C${filaInicio + bloque.length - 1}`,
        values: bloque
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",
        data
      }
    });

    if (filasActuales > filasFinales.length) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${PRODUCTOS_SHEET_NAME}!A${filasFinales.length + 1}:C${filasActuales}`,
        requestBody: {}
      });
    }

    invalidarCache("productosMaestros");
  }

  return {
    procesados: catalogo.length,
    totalCatalogo: catalogo.length,
    duplicadosArchivo,
    reemplazoCompleto: true
  };
}

app.post("/admin/importar-productos", requerirAdministrador, async (req,res)=>{
  try {
    const entrada=Array.isArray(req.body?.productos)?req.body.productos:[];
    if (!entrada.length) return res.status(400).json({ok:false,mensaje:"El archivo no contiene productos válidos"});
    if (entrada.length>IMPORTACION_MAX_FILAS) return res.status(400).json({ok:false,mensaje:`El archivo supera el máximo de ${IMPORTACION_MAX_FILAS} productos`});
    const items=entrada.map(normalizarProductoImportado).filter(Boolean);
    if(!items.length) return res.status(400).json({ok:false,mensaje:"No se encontraron códigos y artículos válidos"});
    const confirmar = req.body?.confirmar === true;
    if (!confirmar) {
      const resumen = await ejecutarImportacionProductos(items, false);
      return res.json({ok:true,mensaje:"Vista previa del reemplazo calculada",vistaPrevia:true,resumen});
    }
    const tarea=importacionProductosEnCurso.catch(()=>{}).then(()=>ejecutarImportacionProductos(items, true));
    importacionProductosEnCurso=tarea.catch(()=>{});
    const resumen=await tarea;
    res.json({ok:true,mensaje:"Catálogo reemplazado correctamente",resumen});
  } catch(error) {
    console.error("Error importando productos:",error);
    res.status(500).json({ok:false,mensaje:error.message||"No se pudo importar el archivo"});
  }
});


app.get("/productos", async (req, res) => {
  try {
    const productos = await obtenerProductos();
    res.json({ ok: true, total: productos.length, productos });
  } catch (error) {
    console.error("Error en /productos:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener productos" });
  }
});

app.get("/producto/:codigo", async (req, res) => {
  try {
    const producto = await buscarProductoPorCodigo(req.params.codigo);

    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    res.json({ ok: true, producto });
  } catch (error) {
    console.error("Error en /producto/:codigo:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener producto" });
  }
});


app.get("/productos-maestro", async (req, res) => {
  try {
    const productos = await obtenerProductosMaestros();
    const etag = `"${crypto.createHash("sha1").update(JSON.stringify(productos)).digest("hex")}"`;
    res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.json({ ok: true, total: productos.length, productos });
  } catch (error) {
    console.error("Error en /productos-maestro:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener productos maestros" });
  }
});

app.get("/producto-maestro/:codigo", async (req, res) => {
  try {
    const producto = await buscarProductoMaestroPorCodigo(req.params.codigo);
    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado en Productos" });
    }
    res.json({ ok: true, producto });
  } catch (error) {
    console.error("Error en /producto-maestro/:codigo:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener producto maestro" });
  }
});

app.post("/guardar", async (req, res) => {
  try {
    const { codigo, ubicacion, cantidad } = req.body;
    const codigoBuscado = normalizarCodigo(codigo);
    const cantidadNumerica = enteroPositivo(cantidad);

    if (!codigoBuscado) {
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    }

    if (!["salon", "deposito"].includes(ubicacion)) {
      return res.status(400).json({ ok: false, mensaje: "Ubicación inválida" });
    }

    if (cantidadNumerica === null) {
      return res.status(400).json({ ok: false, mensaje: "La cantidad debe ser un número entero mayor a 0" });
    }

    const productoActualizado = await ejecutarEnCola(codigoBuscado, async () => {
      const producto = await buscarProductoPorCodigo(codigoBuscado);

      if (!producto) {
        const error = new Error("Producto no encontrado");
        error.statusCode = 404;
        throw error;
      }

      if (ubicacion === "deposito") {
        producto.deposito = numero(producto.deposito) + cantidadNumerica;
      } else {
        producto.salon = numero(producto.salon) + cantidadNumerica;
      }

      return await actualizarProducto(producto);
    });

    invalidarCache("productos");
    res.json({ ok: true, mensaje: "Producto guardado", producto: productoActualizado });
  } catch (error) {
    console.error("Error en /guardar:", error);
    res.status(error.statusCode || 500).json({ ok: false, mensaje: error.message || "Error al guardar producto" });
  }
});

app.post("/corregir", async (req, res) => {
  try {
    const { codigo, salon, deposito } = req.body;
    const codigoBuscado = normalizarCodigo(codigo);

    if (!codigoBuscado) {
      return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    }

    const salonValidado = enteroNoNegativo(salon);
    const depositoValidado = enteroNoNegativo(deposito);
    if (salonValidado === null || depositoValidado === null) {
      return res.status(400).json({ ok: false, mensaje: "Salón y depósito deben ser números enteros iguales o mayores a 0" });
    }

    const productoActualizado = await ejecutarEnCola(codigoBuscado, async () => {
      const producto = await buscarProductoPorCodigo(codigoBuscado);

      if (!producto) {
        const error = new Error("Producto no encontrado");
        error.statusCode = 404;
        throw error;
      }

      producto.salon = salonValidado;
      producto.deposito = depositoValidado;

      return await actualizarProducto(producto);
    });

    invalidarCache("productos");
    res.json({ ok: true, mensaje: "Producto corregido", producto: productoActualizado });
  } catch (error) {
    console.error("Error en /corregir:", error);
    res.status(error.statusCode || 500).json({ ok: false, mensaje: error.message || "Error al corregir producto" });
  }
});

const VENCIMIENTOS_SHEET_NAME = "Vencimientos";

function fechaIsoHoy() {
  return fechaArgentina();
}

function generarIdVencimiento() {
  const marca = fechaHoraArgentinaIso().replace(/[-:T+]/g, "").slice(0, 14);
  return `V${marca}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
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
  return ["si", "sí", "true", "1", "oferta", "activo", "activa"].includes(texto) ? "Sí" : "No";
}

let hojaVencimientosAsegurada = false;
let promesaHojaVencimientos = null;
async function asegurarHojaVencimientos() {
  if (hojaVencimientosAsegurada) return;
  if (promesaHojaVencimientos) return promesaHojaVencimientos;
  promesaHojaVencimientos = (async () => {
  validarConfiguracion();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets || []).some(hoja => hoja.properties?.title === VENCIMIENTOS_SHEET_NAME);

  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: VENCIMIENTOS_SHEET_NAME } } }] }
    });
  }

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${VENCIMIENTOS_SHEET_NAME}!A1:J1`
  });

  const encabezado = respuesta.data.values?.[0] || [];
  const correcto = ["ID", "Fecha carga", "Código", "Artículo", "Vencimiento", "Salón", "Depósito", "Total", "Estado", "Oferta"];
  const necesitaEncabezado = encabezado.length === 0 || encabezado[0] !== "ID" || encabezado.length < 10;
  if (necesitaEncabezado) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A1:J1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [correcto] }
    });
  }
  hojaVencimientosAsegurada = true;
  })();
  try { await promesaHojaVencimientos; }
  finally { promesaHojaVencimientos = null; }
}

function filaAVencimiento(fila, index) {
  return {
    filaGoogle: index + 2,
    id: normalizarTexto(fila[0]) || String(index + 1),
    fecha_carga: normalizarTexto(fila[1]),
    codigo: normalizarTexto(fila[2]),
    articulo: normalizarTexto(fila[3]),
    vencimiento: normalizarTexto(fila[4]),
    salon: numero(fila[5]),
    deposito: numero(fila[6]),
    total: numero(fila[7]),
    estado: calcularEstadoVencimiento(fila[4]),
    oferta: normalizarOfertaVencimiento(fila[9])
  };
}

async function obtenerVencimientos() {
  await asegurarHojaVencimientos();
  return leerConCache("vencimientos", CACHE_TTL.vencimientos, async () => {
    const respuesta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A:J`
    });
    const filas = respuesta.data.values || [];
    return filas.slice(1).map(filaAVencimiento).filter(item => item.codigo || item.articulo || item.id);
  });
}


let hojasNotificacionesAseguradas = false;
let procesandoNotificaciones = false;
const clavesNotificacionEnProceso = new Set();

async function asegurarHojasNotificaciones() {
  if (hojasNotificacionesAseguradas) return;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titulos = new Set((meta.data.sheets || []).map(h => h.properties?.title));
  const requests = [];
  if (!titulos.has(PUSH_SUBSCRIPTIONS_SHEET_NAME)) requests.push({ addSheet: { properties: { title: PUSH_SUBSCRIPTIONS_SHEET_NAME } } });
  if (!titulos.has(NOTIFICATION_LOG_SHEET_NAME)) requests.push({ addSheet: { properties: { title: NOTIFICATION_LOG_SHEET_NAME } } });
  if (!titulos.has(NOTIFICATION_CENTER_SHEET_NAME)) requests.push({ addSheet: { properties: { title: NOTIFICATION_CENTER_SHEET_NAME } } });
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!A1:G1`, valueInputOption: "RAW",
    requestBody: { values: [["Endpoint", "P256DH", "Auth", "Usuario", "Nombre", "Activo", "Actualizado"]] }
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${NOTIFICATION_LOG_SHEET_NAME}!A1:G1`, valueInputOption: "RAW",
    requestBody: { values: [["Clave", "Fecha envío", "Tipo", "ID", "Código", "Vencimiento", "Detalle"]] }
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${NOTIFICATION_CENTER_SHEET_NAME}!A1:I1`, valueInputOption: "RAW",
    requestBody: { values: [["ID", "Usuario", "Tipo", "Título", "Mensaje", "URL", "Fecha", "Leída", "Clave"]] }
  });
  hojasNotificacionesAseguradas = true;
}

async function obtenerSuscripcionesPush() {
  await asegurarHojasNotificaciones();
  return leerConCache("suscripcionesPush", CACHE_TTL.suscripcionesPush, async () => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!A:G` });
    return (r.data.values || []).slice(1).map((f, i) => ({
      filaGoogle: i + 2, endpoint: normalizarTexto(f[0]), p256dh: normalizarTexto(f[1]), auth: normalizarTexto(f[2]),
      usuario: normalizarTexto(f[3]), nombre: normalizarTexto(f[4]), activo: normalizarTexto(f[5]).toLowerCase() !== "no"
    })).filter(s => s.endpoint && s.p256dh && s.auth && s.activo);
  });
}

async function guardarSuscripcionPush(req) {
  await asegurarHojasNotificaciones();
  const endpoint = normalizarTexto(req.body?.subscription?.endpoint);
  const p256dh = normalizarTexto(req.body?.subscription?.keys?.p256dh);
  const authKey = normalizarTexto(req.body?.subscription?.keys?.auth);
  if (!endpoint || !p256dh || !authKey) throw new Error("Suscripción push incompleta");
  const existentes = await obtenerSuscripcionesPush();
  const actual = existentes.find(s => s.endpoint === endpoint);
  const fila = [endpoint, p256dh, authKey, req.usuario.usuario, req.usuario.nombre, "Sí", fechaHoraArgentinaIso()];
  if (actual) {
    await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!A${actual.filaGoogle}:G${actual.filaGoogle}`, valueInputOption: "RAW", requestBody: { values: [fila] } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!A:G`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [fila] } });
  }
  invalidarCache("suscripcionesPush");
}


// v12.3.1.5 — Cola global para escrituras de notificaciones en Google Sheets.
let colaEscriturasNotificaciones = Promise.resolve();
let ultimaEscrituraNotificaciones = 0;
const idsCentroNotificacionPendientes = new Set();

function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function esErrorCuotaSheets(error) {
  return Number(error?.code || error?.status || error?.response?.status) === 429 ||
    String(error?.message || '').toLowerCase().includes('quota exceeded') ||
    String(error?.message || '').toLowerCase().includes('rate limit');
}

function encolarEscrituraNotificaciones(operacion) {
  const ejecutar = async () => {
    const esperaMinima = Math.max(0, 1150 - (Date.now() - ultimaEscrituraNotificaciones));
    if (esperaMinima) await esperar(esperaMinima);
    let intento = 0;
    while (true) {
      try {
        const resultado = await operacion();
        ultimaEscrituraNotificaciones = Date.now();
        return resultado;
      } catch (error) {
        if (!esErrorCuotaSheets(error) || intento >= 5) throw error;
        const demora = Math.min(30000, 1800 * (2 ** intento)) + Math.floor(Math.random() * 700);
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
  await asegurarHojasNotificaciones();
  const claves = await leerConCache("clavesNotificaciones", CACHE_TTL.clavesNotificaciones, async () => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${NOTIFICATION_LOG_SHEET_NAME}!A:G` });
    const resultado = new Set();
    for (const fila of (r.data.values || []).slice(1)) {
      const guardada = normalizarTexto(fila[0]);
      if (guardada) resultado.add(guardada);
      const fechaEnvio = normalizarTexto(fila[1]).slice(0, 10);
      const tipo = normalizarTexto(fila[2]);
      const codigo = normalizarCodigo(fila[4]);
      const vencimiento = normalizarTexto(fila[5]);
      if (codigo && vencimiento && tipo && fechaEnvio) resultado.add([codigo, vencimiento, tipo, fechaEnvio].join("|"));
    }
    return resultado;
  });
  return new Set(claves);
}

async function registrarNotificacionEnviada(clave, tipo, registro, detalle) {
  await encolarEscrituraNotificaciones(() => sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${NOTIFICATION_LOG_SHEET_NAME}!A:G`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[clave, fechaHoraArgentinaIso(), tipo, registro.id, registro.codigo, registro.vencimiento, detalle]] } }));
  const guardado = cacheLecturas.get("clavesNotificaciones");
  if (guardado?.valor instanceof Set) {
    const actualizado = new Set(guardado.valor);
    actualizado.add(clave);
    cacheLecturas.set("clavesNotificaciones", { fecha: Date.now(), valor: actualizado });
  } else invalidarCache("clavesNotificaciones");
}


async function leerFilasCentroNotificaciones() {
  await asegurarHojasNotificaciones();
  return leerConCache("centroNotificaciones", CACHE_TTL.centroNotificaciones, async () => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${NOTIFICATION_CENTER_SHEET_NAME}!A:I` });
    return r.data.values || [];
  });
}

async function registrarCentroNotificacion({ usuario, tipo, titulo, mensaje, url = "./", clave = "" }) {
  await asegurarHojasNotificaciones();
  const usuarioNorm = normalizarUsuario(usuario);
  if (!usuarioNorm) return;
  const claveNorm = normalizarTexto(clave || `${tipo}|${titulo}|${mensaje}`);
  const id = crypto.createHash("sha1").update(`${usuarioNorm}|${claveNorm}`).digest("hex").slice(0, 20);
  const filas = await leerFilasCentroNotificaciones();
  if (filas.slice(1).some(f => normalizarTexto(f[0]) === id) || idsCentroNotificacionPendientes.has(id)) return;
  const nuevaFila = [id, usuarioNorm, normalizarTexto(tipo), normalizarTexto(titulo), normalizarTexto(mensaje), normalizarTexto(url || "./"), fechaHoraArgentinaIso(), "No", claveNorm];
  idsCentroNotificacionPendientes.add(id);
  try {
    await encolarEscrituraNotificaciones(() => sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: `${NOTIFICATION_CENTER_SHEET_NAME}!A:I`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: [nuevaFila] }
    }));
  } finally {
    idsCentroNotificacionPendientes.delete(id);
  }
  const cache = cacheLecturas.get("centroNotificaciones");
  if (cache?.valor) cacheLecturas.set("centroNotificaciones", { fecha: Date.now(), valor: [...cache.valor, nuevaFila] });
  else invalidarCache("centroNotificaciones");
}

async function obtenerCentroNotificaciones(usuario) {
  const clave = normalizarUsuario(usuario);
  const filas = await leerFilasCentroNotificaciones();
  return filas.slice(1).map((f, i) => ({
    filaGoogle: i + 2, id: normalizarTexto(f[0]), usuario: normalizarUsuario(f[1]), tipo: normalizarTexto(f[2]),
    titulo: normalizarTexto(f[3]), mensaje: normalizarTexto(f[4]), url: normalizarTexto(f[5]) || "./", fecha: normalizarTexto(f[6]),
    leida: normalizarTexto(f[7]).toLowerCase() === "sí" || normalizarTexto(f[7]).toLowerCase() === "si"
  })).filter(n => n.usuario === clave).sort((a,b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0,10);
}

async function marcarCentroNotificacion(usuario, id = "", todas = false) {
  const clave = normalizarUsuario(usuario);
  const filas = await leerFilasCentroNotificaciones();
  const updates = [];
  filas.slice(1).forEach((f, i) => {
    if (normalizarUsuario(f[1]) !== clave) return;
    if (!todas && normalizarTexto(f[0]) !== normalizarTexto(id)) return;
    if ((normalizarTexto(f[7]).toLowerCase() === "sí" || normalizarTexto(f[7]).toLowerCase() === "si")) return;
    updates.push({ range: `${NOTIFICATION_CENTER_SHEET_NAME}!H${i+2}`, values: [["Sí"]] });
  });
  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "RAW", data: updates } });
    const actualizado = filas.map(f => [...f]);
    updates.forEach(u => {
      const match = /!H(\d+)$/.exec(u.range);
      if (match) actualizado[Number(match[1]) - 1][7] = "Sí";
    });
    cacheLecturas.set("centroNotificaciones", { fecha: Date.now(), valor: actualizado });
  }
  return updates.length;
}

async function desactivarSuscripcionPush(filaGoogle) {
  if (!filaGoogle) return;
  await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!F${filaGoogle}:F${filaGoogle}`, valueInputOption: "RAW", requestBody: { values: [["No"]] } }).catch(() => {});
  invalidarCache("suscripcionesPush");
}

async function obtenerSuscripcionesVencimientosPermitidas() {
  const [suscripciones, usuarios] = await Promise.all([obtenerSuscripcionesPush(), obtenerUsuarios()]);
  const porUsuario = new Map(usuarios.map(u => [u.usuario, u]));
  return suscripciones.filter(s => {
    const usuario = porUsuario.get(normalizarUsuario(s.usuario));
    return Boolean(usuario && usuario.activo && usuario.permisos?.vencimientos === true);
  });
}

async function obtenerSuscripcionesUsuarioModulo(usuarioClave, modulo) {
  const clave = normalizarUsuario(usuarioClave);
  if (!clave) return [];
  const [suscripciones, usuarios] = await Promise.all([obtenerSuscripcionesPush(), obtenerUsuarios()]);
  const usuario = usuarios.find(u => u.usuario === clave);
  if (!usuario || !usuario.activo || usuario.permisos?.[modulo] !== true) return [];
  return suscripciones.filter(s => normalizarUsuario(s.usuario) === clave && s.activo);
}

async function enviarPushASuscripciones(suscripciones, payload) {
  if (!PUSH_CONFIGURED) return { enviados: 0, configurado: false, destinatarios: 0 };
  let enviados = 0;
  await Promise.all((suscripciones || []).map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 86400 }
      );
      enviados += 1;
    } catch (error) {
      if ([404, 410].includes(error?.statusCode)) await desactivarSuscripcionPush(s.filaGoogle);
      else console.error("Error enviando notificación push:", error?.statusCode || error?.message || error);
    }
  }));
  return { enviados, configurado: true, destinatarios: (suscripciones || []).length };
}

let ultimoMinutoProcesadoTareas = "";

function resolverUsuarioPorResponsable(usuarios, responsable) {
  const clave = normalizarUsuario(responsable);
  if (!clave) return null;
  return usuarios.find(u => normalizarUsuario(u.usuario) === clave)
    || usuarios.find(u => normalizarUsuario(u.nombre) === clave)
    || null;
}

function horaInicioDesdeTurnoValor(valorTurno, turnosSector) {
  const valor = normalizarTexto(valorTurno).toLowerCase();
  if (!valor || ["franco","vacaciones","ausente","licencia"].includes(valor)) return "";
  const configurado = (turnosSector || []).find(t => normalizarTexto(t.id).toLowerCase() === valor);
  if (configurado?.inicio) return configurado.inicio;
  const match = normalizarTexto(valorTurno).match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "";
  const hora = Number(match[1]), minuto = Number(match[2] || 0);
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return "";
  return `${String(hora).padStart(2,"0")}:${String(minuto).padStart(2,"0")}`;
}

async function datosHorarioEntradaHoy() {
  const fecha = fechaArgentina();
  const mes = fecha.slice(0,7);
  const dia = Number(fecha.slice(8,10));
  return leerConCache(`notificacionesTareasHorario:${fecha}`, 45000, async () => {
    await asegurarHojasHorarios();
    const [calendarioResp, sectores, usuarios] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A:H` }),
      obtenerSectores(),
      obtenerUsuarios()
    ]);
    const filas = (calendarioResp.data.values || []).slice(1)
      .filter(f => normalizarTexto(f[1]) === mes && Number(f[3]) === dia);
    const porEmpleadoSector = new Map();
    for (const f of filas) {
      porEmpleadoSector.set(`${normalizarTexto(f[0])}|${normalizarUsuario(f[2])}`, normalizarTexto(f[4]));
    }
    return { fecha, mes, dia, sectores, usuarios, porEmpleadoSector };
  });
}

async function procesarNotificacionesInicioTareas() {
  const ahora = horaMinutoArgentina();
  const minutoActual = `${fechaArgentina()}|${String(ahora.hora).padStart(2,"0")}:${String(ahora.minuto).padStart(2,"0")}`;
  if (ultimoMinutoProcesadoTareas === minutoActual) return;
  ultimoMinutoProcesadoTareas = minutoActual;

  const horaActual = minutoActual.slice(-5);
  const [{ fecha, sectores, usuarios, porEmpleadoSector }, tareas] = await Promise.all([
    datosHorarioEntradaHoy(),
    obtenerTareasServidor()
  ]);
  const sectoresPorIdONombre = new Map();
  sectores.forEach(s => { sectoresPorIdONombre.set(normalizarTexto(s.id),s); sectoresPorIdONombre.set(normalizarTexto(s.nombre),s); });
  const grupos = new Map();

  for (const tarea of tareas) {
    const asignacionesDia = tarea.asignaciones?.[fecha] || {};
    for (const [turnoTarea, asignacion] of Object.entries(asignacionesDia)) {
      if (!asignacion || normalizarTexto(asignacion.estado).toLowerCase() === "completada") continue;
      const sectorInfo = sectoresPorIdONombre.get(normalizarTexto(tarea.sector));
      if (!sectorInfo) continue;
      const turnosSector = await obtenerTurnosSector(sectorInfo.id);
      for (const responsable of asignacion.responsables || []) {
        const usuario = resolverUsuarioPorResponsable(usuarios, responsable);
        if (!usuario || !usuario.activo || usuario.permisos?.tareas !== true) continue;
        const clavesEmpleado = [usuario.nombre, usuario.usuario].map(normalizarUsuario).filter(Boolean);
        let valorTurno = "";
        for (const claveEmpleado of clavesEmpleado) {
          valorTurno = porEmpleadoSector.get(`${sectorInfo.id}|${claveEmpleado}`) || valorTurno;
        }
        const horaEntrada = horaInicioDesdeTurnoValor(valorTurno, turnosSector);
        if (!horaEntrada || horaEntrada !== horaActual) continue;
        const claveGrupo = `${usuario.usuario}|${sectorInfo.id}|${fecha}|${horaEntrada}`;
        const grupo = grupos.get(claveGrupo) || { usuario, sector:sectorInfo, fecha, horaEntrada, tareas:[] };
        grupo.tareas.push({ id:tarea.id, nombre:tarea.nombre, turno:turnoTarea });
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
      body: cantidad === 1
        ? `${grupo.tareas[0].nombre} · ${grupo.sector.nombre}`
        : `Tenés ${cantidad} tareas asignadas hoy en ${grupo.sector.nombre}`,
      tag: clave,
      data: { url:`./?modulo=tareas&fecha=${encodeURIComponent(grupo.fecha)}&sector=${encodeURIComponent(grupo.sector.id)}` }
    };
    await registrarCentroNotificacion({ usuario:grupo.usuario.usuario, tipo:"tarea", titulo:payload.title, mensaje:payload.body, url:payload.data.url, clave });
    const suscripciones = await obtenerSuscripcionesUsuarioModulo(grupo.usuario.usuario, "tareas");
    await enviarPushASuscripciones(suscripciones, payload);
    await registrarNotificacionEnviada(clave, "tareas-inicio", { id:grupo.usuario.usuario, codigo:grupo.sector.id, vencimiento:grupo.fecha }, payload.body);
    enviadas.add(clave);
  }
}

async function notificarSupervisorTareaCompletada({ tarea, fecha, turno, asignacion, completadaPor }) {
  const [sectores, usuarios, enviadas] = await Promise.all([obtenerSectores(), obtenerUsuarios(), clavesNotificacionesEnviadas()]);
  const sector = sectores.find(s => [normalizarTexto(s.id), normalizarTexto(s.nombre)].includes(normalizarTexto(tarea.sector)));
  if (!sector?.supervisor) return;
  const supervisor = usuarios.find(u => normalizarUsuario(u.usuario) === normalizarUsuario(sector.supervisor));
  if (!supervisor || !supervisor.activo || supervisor.permisos?.tareas !== true) return;
  const clave = `tarea-completada|${tarea.id}|${fecha}|${turno}`;
  if (enviadas.has(clave)) return;
  const quien = normalizarTexto(asignacion?.completadaPor || completadaPor?.nombre || completadaPor?.usuario || "Un usuario");
  const payload = {
    title:"Tarea completada",
    body:`${quien} completó “${tarea.nombre}” en ${sector.nombre}`,
    tag:clave,
    data:{ url:`./?modulo=tareas&fecha=${encodeURIComponent(fecha)}&sector=${encodeURIComponent(sector.id)}` }
  };
  await registrarCentroNotificacion({ usuario:supervisor.usuario, tipo:"tarea", titulo:payload.title, mensaje:payload.body, url:payload.data.url, clave });
  const suscripciones = await obtenerSuscripcionesUsuarioModulo(supervisor.usuario, "tareas");
  await enviarPushASuscripciones(suscripciones, payload);
  await registrarNotificacionEnviada(clave, "tarea-completada", { id:tarea.id, codigo:supervisor.usuario, vencimiento:fecha }, payload.body);
}


function diasEntreFechasIso(fechaA, fechaB) {
  const parsear = valor => {
    const m = normalizarTexto(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const a = parsear(fechaA), b = parsear(fechaB);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / 86400000) : null;
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
  const indice = ((turno % participantes.length) + participantes.length) % participantes.length;
  return participantes[indice] || "";
}

async function resolverUsuarioResponsableBano(valor) {
  const clave = normalizarUsuario(valor);
  if (!clave) return null;
  const usuarios = await obtenerUsuarios();
  return usuarios.find(u => u.usuario === clave)
    || usuarios.find(u => normalizarUsuario(u.nombre) === clave)
    || null;
}

function limpiezaBanoConfirmada(config, fechaIso) {
  return (Array.isArray(config?.historial) ? config.historial : [])
    .some(item => normalizarTexto(item?.fecha) === fechaIso);
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
  if (tipo === "16" && limpiezaBanoConfirmada(config, fecha)) return { enviados: 0, confirmada: true };

  const usuario = await resolverUsuarioResponsableBano(participante);
  if (!usuario || !usuario.activo || usuario.permisos?.tareas !== true) return { enviados: 0, sinDestinatario: true };

  const clave = claveNotificacionBano(fecha, tipo, usuario.usuario);
  const enviadas = await clavesNotificacionesEnviadas();
  if (enviadas.has(clave)) return { enviados: 0, duplicada: true };

  const payload = tipo === "08"
    ? {
        title: "Hoy te corresponde limpiar el baño",
        body: "Tu turno es hoy. Confirmá la limpieza cuando termines.",
        tag: `bano-${fecha}-08-${usuario.usuario}`,
        data: { url: `./?modulo=tareas&vista=bano&fecha=${encodeURIComponent(fecha)}` }
      }
    : {
        title: "Limpieza del baño pendiente",
        body: "Todavía no registraste la limpieza de hoy.",
        tag: `bano-${fecha}-16-${usuario.usuario}`,
        data: { url: `./?modulo=tareas&vista=bano&fecha=${encodeURIComponent(fecha)}` }
      };

  await registrarCentroNotificacion({ usuario: usuario.usuario, tipo: "bano", titulo: payload.title, mensaje: payload.body, url: payload.data.url, clave: payload.tag });
  const suscripciones = await obtenerSuscripcionesUsuarioModulo(usuario.usuario, "tareas");
  const resultado = suscripciones.length ? await enviarPushASuscripciones(suscripciones, payload) : { enviados: 0, sinSuscripciones: true };
  if (resultado.enviados > 0) {
    await registrarNotificacionEnviada(clave, `bano-${tipo}`, {
      id: `bano-${fecha}`,
      codigo: usuario.usuario,
      vencimiento: fecha
    }, payload.body);
  }
  return resultado;
}

async function enviarPushVencimientos(payload) {
  if (!PUSH_CONFIGURED) return { enviados: 0, configurado: false, destinatarios: 0 };
  const suscripciones = await obtenerSuscripcionesVencimientosPermitidas();
  let enviados = 0;
  await Promise.all(suscripciones.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
      enviados += 1;
    } catch (error) {
      if ([404, 410].includes(error?.statusCode)) await desactivarSuscripcionPush(s.filaGoogle);
      else console.error("Error enviando notificación push:", error?.statusCode || error?.message || error);
    }
  }));
  return { enviados, configurado: true, destinatarios: suscripciones.length };
}

function claveUnicaAlertaVencimiento(registro, tipo) {
  if (tipo === "nuevo") return ["vencimiento-nuevo", normalizarTexto(registro.id)].join("|");
  return [normalizarCodigo(registro.codigo), normalizarTexto(registro.vencimiento), normalizarTexto(tipo), fechaIsoHoy()].join("|");
}

function payloadNuevoVencimiento(registro) {
  const total = numero(registro.total);
  const unidades = `${total} ${total === 1 ? "unidad" : "unidades"}`;
  return {
    title: "Nuevo vencimiento cargado",
    body: `${registro.articulo} · ${unidades} · vence ${registro.vencimiento}`,
    tag: `venc-${registro.id}-nuevo`,
    data: { url: "./?modulo=vencimientos&vista=proximos" }
  };
}

async function enviarAlertaRegistro(registro, dias, tipo, clave = claveUnicaAlertaVencimiento(registro, tipo), clavesConocidas = null) {
  if (tipo !== "nuevo") return { enviados: 0, omitida: true };
  if (clavesNotificacionEnProceso.has(clave)) return { enviados: 0, duplicada: true };
  clavesNotificacionEnProceso.add(clave);
  try {
    const enviadas = clavesConocidas || await clavesNotificacionesEnviadas();
    if (enviadas.has(clave)) return { enviados: 0, duplicada: true };
    const payload = payloadNuevoVencimiento(registro);
    const usuarios = (await obtenerUsuarios()).filter(u => u.activo && u.permisos?.vencimientos === true);
    await Promise.all(usuarios.map(u => registrarCentroNotificacion({
      usuario: u.usuario,
      tipo: "vencimientos",
      titulo: payload.title,
      mensaje: payload.body,
      url: payload.data.url,
      clave: `${clave}|${u.usuario}`
    })));
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
      body: cantidad === 1 ? "Hay 1 producto vencido." : `Hay ${cantidad} productos vencidos.`,
      tag: `resumen-vencidos-${fechaIsoHoy()}`,
      data: { url: "./?modulo=vencimientos&vista=vencidos" }
    };
  }
  const dias = Number(tipo);
  const titulo = dias === 1 ? "Vencen en 1 día" : `Vencen en ${dias} días`;
  return {
    title: titulo,
    body: cantidad === 1
      ? `Hay 1 producto que vence en ${dias === 1 ? "1 día" : `${dias} días`}.`
      : `Hay ${cantidad} productos que vencen en ${dias === 1 ? "1 día" : `${dias} días`}.`,
    tag: `resumen-vencimientos-${fechaIsoHoy()}-${dias}`,
    data: { url: `./?modulo=vencimientos&vista=proximos&dias=${dias}` }
  };
}

async function enviarResumenVencimientos(tipo, registros, enviadas) {
  if (!Array.isArray(registros) || !registros.length) return { enviados: 0, vacio: true };
  const fecha = fechaIsoHoy();
  const clave = claveResumenVencimientos(fecha, tipo);
  if (enviadas.has(clave) || clavesNotificacionEnProceso.has(clave)) return { enviados: 0, duplicada: true };
  clavesNotificacionEnProceso.add(clave);
  try {
    const payload = payloadResumenVencimientos(tipo, registros.length);
    const usuarios = (await obtenerUsuarios()).filter(u => u.activo && u.permisos?.vencimientos === true);
    await Promise.all(usuarios.map(u => registrarCentroNotificacion({
      usuario: u.usuario,
      tipo: "vencimientos",
      titulo: payload.title,
      mensaje: payload.body,
      url: payload.data.url,
      clave: `${clave}|${u.usuario}`
    })));
    const resultado = await enviarPushVencimientos(payload);
    if (resultado.enviados > 0) {
      const registroResumen = {
        id: `resumen-${tipo}-${fecha}`,
        codigo: tipo,
        vencimiento: fecha
      };
      await registrarNotificacionEnviada(clave, `resumen-${tipo}`, registroResumen, payload.body);
      enviadas.add(clave);
    }
    return resultado;
  } finally {
    clavesNotificacionEnProceso.delete(clave);
  }
}

let limpiezaVencimientosEnCurso = false;
let ultimaLimpiezaVencimientos = 0;

async function reescribirHoja(nombreHoja, encabezados, filas) {
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${nombreHoja}!A:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${nombreHoja}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [encabezados, ...filas] }
  });
}

async function limpiarVencimientosAntiguos({ forzar = false } = {}) {
  const ahora = Date.now();
  if (limpiezaVencimientosEnCurso || (!forzar && ahora - ultimaLimpiezaVencimientos < 60 * 60 * 1000)) return { eliminados: 0 };
  limpiezaVencimientosEnCurso = true;
  try {
    const vencimientos = await obtenerVencimientos();
    const antiguos = vencimientos.filter(item => {
      const dias = diasDesdeHoyArgentina(item.vencimiento);
      return dias !== null && dias <= -7;
    });
    if (!antiguos.length) {
      ultimaLimpiezaVencimientos = ahora;
      return { eliminados: 0 };
    }

    const ids = new Set(antiguos.map(item => item.id));
    const vigentes = vencimientos.filter(item => !ids.has(item.id));
    await reescribirHoja(VENCIMIENTOS_SHEET_NAME,
      ["ID", "Fecha carga", "Código", "Artículo", "Vencimiento", "Salón", "Depósito", "Total", "Estado", "Oferta"],
      vigentes.map(item => [item.id, item.fecha_carga, item.codigo, item.articulo, item.vencimiento, item.salon, item.deposito, item.total, item.estado, item.oferta])
    );

    await asegurarHojaHistorialVencimientos();
    const historialResp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${HISTORIAL_VENCIMIENTOS_SHEET_NAME}!A:J` });
    const historialFilas = (historialResp.data.values || []).slice(1).filter(fila => !ids.has(normalizarTexto(fila[5])));
    await reescribirHoja(HISTORIAL_VENCIMIENTOS_SHEET_NAME,
      ["Fecha", "Hora", "Usuario", "Nombre", "Acción", "ID", "Código", "Artículo", "Vencimiento", "Detalle"],
      historialFilas
    );

    await asegurarHojasNotificaciones();
    const notifResp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${NOTIFICATION_LOG_SHEET_NAME}!A:G` });
    const notifFilas = (notifResp.data.values || []).slice(1).filter(fila => !ids.has(normalizarTexto(fila[3])));
    await reescribirHoja(NOTIFICATION_LOG_SHEET_NAME,
      ["Clave", "Fecha envío", "Tipo", "ID", "Código", "Vencimiento", "Detalle"],
      notifFilas
    );

    invalidarCache("vencimientos");
    ultimaLimpiezaVencimientos = ahora;
    console.log(`Limpieza automática: ${antiguos.length} vencimiento(s) eliminado(s) después de 7 días.`);
    return { eliminados: antiguos.length };
  } finally {
    limpiezaVencimientosEnCurso = false;
  }
}

async function procesarAlertasVencimientos() {
  if (procesandoNotificaciones || !PUSH_CONFIGURED) return;
  procesandoNotificaciones = true;
  try {
    await limpiarVencimientosAntiguos();
    const [vencimientos, enviadas] = await Promise.all([obtenerVencimientos(), clavesNotificacionesEnviadas()]);
    const grupos = { "1": [], "3": [], "7": [], "15": [], vencidos: [] };

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
  } finally { procesandoNotificaciones = false; }
}

app.get("/notificaciones/centro", requerirSesion, async (req, res) => {
  try {
    const notificaciones = await obtenerCentroNotificaciones(req.usuario.usuario);
    res.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
    res.json({ ok: true, notificaciones, noLeidas: notificaciones.filter(n => !n.leida).length });
  } catch (error) { res.status(500).json({ ok:false, mensaje:error.message || "No se pudieron cargar las notificaciones" }); }
});

app.patch("/notificaciones/centro/:id/leida", requerirSesion, async (req, res) => {
  try { await marcarCentroNotificacion(req.usuario.usuario, req.params.id, false); res.json({ ok:true }); }
  catch (error) { res.status(500).json({ ok:false, mensaje:error.message || "No se pudo actualizar la notificación" }); }
});

app.patch("/notificaciones/centro-leidas", requerirSesion, async (req, res) => {
  try { const actualizadas = await marcarCentroNotificacion(req.usuario.usuario, "", true); res.json({ ok:true, actualizadas }); }
  catch (error) { res.status(500).json({ ok:false, mensaje:error.message || "No se pudieron actualizar las notificaciones" }); }
});

app.get("/notificaciones/public-key", (req, res) => {
  res.json({ ok: true, configurado: PUSH_CONFIGURED, publicKey: VAPID_PUBLIC_KEY || "" });
});

app.post("/notificaciones/suscribir", requerirSesion, async (req, res) => {
  try {
    if (!PUSH_CONFIGURED) return res.status(503).json({ ok: false, mensaje: "Las notificaciones todavía no están configuradas en Render" });
    await guardarSuscripcionPush(req);
    res.json({ ok: true, mensaje: "Notificaciones activadas. Los avisos diarios se envían a las 08:00." });
  } catch (error) { res.status(400).json({ ok: false, mensaje: error.message || "No se pudo guardar la suscripción" }); }
});

app.post("/notificaciones/procesar", requerirSesion, async (req, res) => {
  await procesarAlertasVencimientos();
  res.json({ ok: true });
});

app.all("/notificaciones/cron", async (req, res) => {
  const secreto = normalizarTexto(req.get("x-cron-secret") || req.query.secret);
  if (!NOTIFICATION_CRON_SECRET || secreto !== NOTIFICATION_CRON_SECRET) return res.status(403).json({ ok: false, mensaje: "Secreto de cron inválido" });
  await procesarAlertasVencimientos();
  res.json({ ok: true });
});

app.get("/vencimientos", async (req, res) => {
  try {
    await limpiarVencimientosAntiguos();
    const vencimientos = (await obtenerVencimientos()).reverse();
    res.json({ ok: true, total: vencimientos.length, vencimientos });
  } catch (error) {
    console.error("Error en /vencimientos:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al obtener vencimientos" });
  }
});

app.post("/vencimientos", async (req, res) => {
  try {
    const codigo = normalizarCodigo(req.body.codigo);
    const vencimiento = normalizarTexto(req.body.vencimiento);
    const salon = enteroNoNegativo(req.body.salon);
    const deposito = enteroNoNegativo(req.body.deposito);
    const total = salon === null || deposito === null ? null : salon + deposito;

    if (!codigo) return res.status(400).json({ ok: false, mensaje: "Falta el código" });
    if (!vencimiento) return res.status(400).json({ ok: false, mensaje: "Falta la fecha de vencimiento" });
    if (!fechaNoAnteriorAHoy(vencimiento)) return res.status(400).json({ ok: false, mensaje: "La fecha de vencimiento no puede ser anterior a hoy" });
    if (total === null || total <= 0) return res.status(400).json({ ok: false, mensaje: "Salón y depósito deben ser cantidades enteras; cargá al menos una unidad" });

    const producto = await buscarProductoMaestroPorCodigo(codigo);
    const articulo = normalizarTexto(req.body.articulo) || producto?.articulo;
    if (!articulo) return res.status(404).json({ ok: false, mensaje: "Producto no encontrado en la hoja Productos" });

    await asegurarHojaVencimientos();
    const registro = {
      id: generarIdVencimiento(),
      fecha_carga: fechaIsoHoy(),
      codigo,
      articulo,
      vencimiento,
      salon,
      deposito,
      total,
      estado: calcularEstadoVencimiento(vencimiento),
      oferta: normalizarOfertaVencimiento(req.body.oferta)
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[registro.id, registro.fecha_carga, registro.codigo, registro.articulo, registro.vencimiento, registro.salon, registro.deposito, registro.total, registro.estado, registro.oferta]] }
    });

    invalidarCache("vencimientos");
    await registrarHistorialVencimiento(req, "Creó", registro, `Salón: ${registro.salon} · Depósito: ${registro.deposito}`);
    const diasRestantes = diasDesdeHoyArgentina(registro.vencimiento);
    if (PUSH_CONFIGURED) {
      const tipo = "nuevo";
      const clave = claveUnicaAlertaVencimiento(registro, tipo);
      setImmediate(async () => {
        try {
          const enviadas = await clavesNotificacionesEnviadas();
          if (!enviadas.has(clave)) await enviarAlertaRegistro(registro, diasRestantes, tipo, clave);
        } catch (error) { console.error("No se pudo enviar la notificación de nuevo vencimiento:", error); }
      });
    }
    res.json({ ok: true, mensaje: "Vencimiento guardado", vencimiento: registro });
  } catch (error) {
    console.error("Error en POST /vencimientos:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al guardar vencimiento" });
  }
});

app.put("/vencimientos/:id", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find(item => item.id === id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });

    const salon = enteroNoNegativo(req.body.salon);
    const deposito = enteroNoNegativo(req.body.deposito);
    const vencimiento = normalizarTexto(req.body.vencimiento);
    const total = salon === null || deposito === null ? null : salon + deposito;
    if (!vencimiento) return res.status(400).json({ ok: false, mensaje: "Falta la fecha de vencimiento" });
    if (vencimiento !== registro.vencimiento && !fechaNoAnteriorAHoy(vencimiento)) return res.status(400).json({ ok: false, mensaje: "La nueva fecha de vencimiento no puede ser anterior a hoy" });
    if (total === null || total <= 0) return res.status(400).json({ ok: false, mensaje: "Salón y depósito deben ser cantidades enteras; cargá al menos una unidad" });

    const actualizado = { ...registro, vencimiento, salon, deposito, total, estado: calcularEstadoVencimiento(vencimiento), oferta: req.body.oferta === undefined ? registro.oferta : normalizarOfertaVencimiento(req.body.oferta) };
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A${registro.filaGoogle}:J${registro.filaGoogle}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[actualizado.id, actualizado.fecha_carga, actualizado.codigo, actualizado.articulo, actualizado.vencimiento, actualizado.salon, actualizado.deposito, actualizado.total, actualizado.estado, actualizado.oferta]] }
    });
    invalidarCache("vencimientos");
    await registrarHistorialVencimiento(req, "Editó", actualizado, `Antes: ${registro.vencimiento} / ${registro.total} · Después: ${actualizado.vencimiento} / ${actualizado.total}`);
    res.json({ ok: true, mensaje: "Vencimiento actualizado", vencimiento: actualizado });
  } catch (error) {
    console.error("Error en PUT /vencimientos/:id:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al actualizar vencimiento" });
  }
});

app.patch("/vencimientos/:id/oferta", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find(item => item.id === id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });

    const oferta = normalizarOfertaVencimiento(req.body.oferta);
    const actualizado = { ...registro, oferta };
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${VENCIMIENTOS_SHEET_NAME}!A${registro.filaGoogle}:J${registro.filaGoogle}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[actualizado.id, actualizado.fecha_carga, actualizado.codigo, actualizado.articulo, actualizado.vencimiento, actualizado.salon, actualizado.deposito, actualizado.total, actualizado.estado, actualizado.oferta]] }
    });
    invalidarCache("vencimientos");
    res.json({ ok: true, mensaje: oferta === "Sí" ? "Oferta marcada" : "Oferta quitada", vencimiento: actualizado });
  } catch (error) {
    console.error("Error en PATCH /vencimientos/:id/oferta:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al actualizar oferta" });
  }
});

app.delete("/vencimientos/:id", async (req, res) => {
  try {
    const id = normalizarTexto(req.params.id);
    const vencimientos = await obtenerVencimientos();
    const registro = vencimientos.find(item => item.id === id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: "Registro no encontrado" });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId: await obtenerSheetId(VENCIMIENTOS_SHEET_NAME), dimension: "ROWS", startIndex: registro.filaGoogle - 1, endIndex: registro.filaGoogle } } }] }
    });
    invalidarCache("vencimientos");
    await registrarHistorialVencimiento(req, "Eliminó", registro, `Cantidad total: ${registro.total}`);
    res.json({ ok: true, mensaje: "Vencimiento eliminado" });
  } catch (error) {
    console.error("Error en DELETE /vencimientos/:id:", error);
    res.status(500).json({ ok: false, mensaje: error.message || "Error al eliminar vencimiento" });
  }
});


async function asegurarHojaHistorialVencimientos() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets || []).some(h => h.properties?.title === HISTORIAL_VENCIMIENTOS_SHEET_NAME);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: HISTORIAL_VENCIMIENTOS_SHEET_NAME } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HISTORIAL_VENCIMIENTOS_SHEET_NAME}!A1:J1`,
      valueInputOption: "RAW",
      requestBody: { values: [["Fecha", "Hora", "Usuario", "Nombre", "Acción", "ID", "Código", "Artículo", "Vencimiento", "Detalle"]] }
    });
  }
}

async function registrarHistorialVencimiento(req, accion, registro, detalle = "") {
  await asegurarHojaHistorialVencimientos();
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).formatToParts(ahora);
  const get = t => partes.find(x => x.type === t)?.value || "";
  const fecha = `${get("day")}/${get("month")}/${get("year")}`;
  const hora = `${get("hour")}:${get("minute")}:${get("second")}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${HISTORIAL_VENCIMIENTOS_SHEET_NAME}!A:J`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[fecha, hora, req.usuario?.usuario || "desconocido", req.usuario?.nombre || "", accion, registro?.id || "", registro?.codigo || "", registro?.articulo || "", registro?.vencimiento || "", detalle]] }
  });
}

app.get("/admin/historial-vencimientos", requerirAdministrador, async (req, res) => {
  try {
    await asegurarHojaHistorialVencimientos();
    const respuesta = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${HISTORIAL_VENCIMIENTOS_SHEET_NAME}!A:J` });
    const filas = respuesta.data.values || [];
    const historial = filas.slice(1).reverse().map(f => ({ fecha:f[0]||"", hora:f[1]||"", usuario:f[2]||"", nombre:f[3]||"", accion:f[4]||"", id:f[5]||"", codigo:f[6]||"", articulo:f[7]||"", vencimiento:f[8]||"", detalle:f[9]||"" }));
    res.json({ ok:true, historial });
  } catch (error) {
    res.status(500).json({ ok:false, mensaje:error.message || "No se pudo obtener el historial" });
  }
});

async function obtenerSheetId(nombreHoja) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const hoja = (meta.data.sheets || []).find(item => item.properties?.title === nombreHoja);
  if (!hoja) throw new Error(`No existe la hoja ${nombreHoja}`);
  return hoja.properties.sheetId;
}


// V6.1.7 - Reposición persistente en Google Sheets, individual y con dos listas por usuario.
const LISTAS_SHEET_NAME = "Listas";
const LISTAS_HEADERS = ["ID", "Usuario", "Lista", "Código", "Artículo", "Cantidad", "Estado", "Orden", "Actualizado"];
let promesaHojaListasLista = null;

function normalizarNumeroLista(valor) { return String(valor) === "2" ? "2" : "1"; }
function crearIdReposicion() { return `REP-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`; }

async function asegurarHojaListas() {
  if (promesaHojaListasLista) return promesaHojaListasLista;
  promesaHojaListasLista = (async () => {
    const meta = await leerConCache("metadata-hoja-listas", CACHE_TTL.metadata, async () =>
      sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    );
    const existe = (meta.data.sheets || []).some(s => s.properties?.title === LISTAS_SHEET_NAME);
    if (!existe) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: LISTAS_SHEET_NAME } } }] }
      });
      invalidarCache("metadata-hoja-listas");
    }
    const respuesta = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${LISTAS_SHEET_NAME}!A1:I1` });
    if (!(respuesta.data.values || []).length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LISTAS_SHEET_NAME}!A1:I1`,
        valueInputOption: "RAW",
        requestBody: { values: [LISTAS_HEADERS] }
      });
    }
    return true;
  })().catch(error => { promesaHojaListasLista = null; throw error; });
  return promesaHojaListasLista;
}

function filaARegistroReposicion(fila = [], indice = 0) {
  return {
    id: normalizarTexto(fila[0]), usuario: normalizarUsuario(fila[1]), lista: normalizarNumeroLista(fila[2]),
    codigo: normalizarCodigo(fila[3]), articulo: normalizarTexto(fila[4]), cantidad: enteroPositivo(fila[5]) || 1,
    estado: normalizarTexto(fila[6]).toLowerCase() === "completado" ? "completado" : "pendiente",
    orden: Number.isFinite(Number(fila[7])) && Number(fila[7]) > 0 ? Number(fila[7]) : indice + 1, actualizado: normalizarTexto(fila[8])
  };
}
function registroAFilaReposicion(r) {
  return [r.id, r.usuario, r.lista, r.codigo, r.articulo, r.cantidad, r.estado, r.orden || 0, r.actualizado || fechaHoraArgentinaIso()];
}
async function leerTodasLasListas() {
  await asegurarHojaListas();
  const registros = await leerConCache("listas-reposicion", 120000, async () => {
    const respuesta = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${LISTAS_SHEET_NAME}!A2:I` });
    return (respuesta.data.values || []).map((fila, indice) => filaARegistroReposicion(fila, indice)).filter(r => r.id && r.usuario && r.codigo);
  });
  return registros.map(r => ({ ...r }));
}
async function escribirTodasLasListas(registros) {
  await asegurarHojaListas();
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${LISTAS_SHEET_NAME}!A2:I` });
  if (registros.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${LISTAS_SHEET_NAME}!A2:I${registros.length + 1}`,
      valueInputOption: "RAW", requestBody: { values: registros.map(registroAFilaReposicion) }
    });
  }
  cacheLecturas.set("listas-reposicion", { fecha: Date.now(), valor: registros.map(r => ({ ...r })) });
}
async function obtenerListaReposicionPersistente(usuario, numeroLista) {
  const claveUsuario = normalizarUsuario(usuario); const lista = normalizarNumeroLista(numeroLista);
  const todos = await leerTodasLasListas();
  return todos.filter(r => r.usuario === claveUsuario && r.lista === lista)
    .sort((a,b) => (a.estado === b.estado ? (a.orden - b.orden) : (a.estado === "pendiente" ? -1 : 1)));
}
function limpiarRegistroReposicion(registro, numeroLista = "1") {
  return { id:registro.id, fecha:registro.actualizado, codigo:registro.codigo, articulo:registro.articulo,
    cantidad:enteroPositivo(registro.cantidad)||1, estado:registro.estado === "completado" ? "completado":"pendiente",
    actualizado:registro.actualizado, usuario:registro.usuario, lista:normalizarNumeroLista(numeroLista), orden:Number(registro.orden)||0 };
}
function buscarIndiceRegistroReposicion(lista, id, codigo = "") {
  let i = lista.findIndex(x => normalizarTexto(x.id) === normalizarTexto(id));
  if (i < 0 && normalizarCodigo(codigo)) i = lista.findIndex(x => x.codigo === normalizarCodigo(codigo));
  return i;
}

app.get("/reposicion", async (req, res) => {
  try {
    const numeroLista = normalizarNumeroLista(req.query.lista);
    const registros = (await obtenerListaReposicionPersistente(req.usuario.usuario, numeroLista)).map(r => limpiarRegistroReposicion(r, numeroLista));
    res.json({ ok:true, total:registros.length, lista:numeroLista, usuario:req.usuario, registros });
  } catch(error) { console.error("Error en GET /reposicion:", error); res.status(500).json({ok:false,mensaje:error.message||"Error al obtener reposición"}); }
});

app.post("/reposicion/lote", async (req, res) => {
  try {
    const usuario = normalizarUsuario(req.usuario.usuario);
    const numeroLista = normalizarNumeroLista(req.body.lista);
    const entradas = Array.isArray(req.body.items) ? req.body.items : [];
    const items = entradas.map((item, indice) => ({
      codigo: normalizarCodigo(item?.codigo || `ESCRITO-${Date.now()}-${indice + 1}`),
      articulo: normalizarTexto(item?.articulo),
      cantidad: enteroPositivo(item?.cantidad)
    })).filter(item => item.codigo && item.articulo && item.cantidad !== null);
    if (!items.length) return res.status(400).json({ok:false,mensaje:"Escribí al menos un producto válido"});

    const resultados = await ejecutarEnCola(`listas:${usuario}:${numeroLista}`, async () => {
      const todos = await leerTodasLasListas();
      const ahora = fechaHoraArgentinaIso();
      let orden = Math.max(0, ...todos.filter(x => x.usuario === usuario && x.lista === numeroLista).map(x => Number(x.orden) || 0));
      const guardados = [];
      for (const item of items) {
        let r = todos.find(x => x.usuario === usuario && x.lista === numeroLista && x.codigo === item.codigo);
        if (r) {
          r.cantidad += item.cantidad;
          r.estado = "pendiente";
          r.actualizado = ahora;
          // En listas escritas se conserva el texto más reciente exactamente como fue ingresado.
          r.articulo = item.articulo;
        } else {
          orden += 1;
          r = {id:crearIdReposicion(),usuario,lista:numeroLista,codigo:item.codigo,articulo:item.articulo,cantidad:item.cantidad,estado:"pendiente",orden,actualizado:ahora};
          todos.push(r);
        }
        guardados.push(r);
      }
      await escribirTodasLasListas(todos);
      return guardados;
    });

    res.json({
      ok:true,
      lista:numeroLista,
      total:resultados.length,
      mensaje:`${resultados.length} producto${resultados.length === 1 ? "" : "s"} agregado${resultados.length === 1 ? "" : "s"}`,
      registros:resultados.map(r => limpiarRegistroReposicion(r, numeroLista))
    });
  } catch(error) {
    console.error("Error en POST /reposicion/lote:", error);
    res.status(500).json({ok:false,mensaje:error.message||"No se pudo guardar la lista escrita"});
  }
});

app.post("/reposicion", async (req, res) => {
  try {
    const usuario=normalizarUsuario(req.usuario.usuario), numeroLista=normalizarNumeroLista(req.body.lista);
    const codigo=normalizarCodigo(req.body.codigo), articulo=normalizarTexto(req.body.articulo), cantidad=enteroPositivo(req.body.cantidad);
    if(!codigo||!articulo) return res.status(400).json({ok:false,mensaje:"Falta el producto"});
    if(cantidad===null) return res.status(400).json({ok:false,mensaje:"Ingresá una cantidad entera mayor a 0"});
    const resultado=await ejecutarEnCola(`listas:${usuario}:${numeroLista}`, async()=>{
      const todos=await leerTodasLasListas();
      let r=todos.find(x=>x.usuario===usuario&&x.lista===numeroLista&&x.codigo===codigo);
      const ahora=fechaHoraArgentinaIso();
      if(r){ r.cantidad+=cantidad; r.estado="pendiente"; r.actualizado=ahora; }
      else { const orden=Math.max(0,...todos.filter(x=>x.usuario===usuario&&x.lista===numeroLista).map(x=>Number(x.orden)||0))+1;
        r={id:crearIdReposicion(),usuario,lista:numeroLista,codigo,articulo,cantidad,estado:"pendiente",orden,actualizado:ahora}; todos.push(r); }
      await escribirTodasLasListas(todos); return r;
    });
    res.json({ok:true,lista:numeroLista,mensaje:`Producto agregado a Lista ${numeroLista}`,registro:limpiarRegistroReposicion(resultado,numeroLista)});
  } catch(error){console.error("Error en POST /reposicion:",error);res.status(500).json({ok:false,mensaje:error.message||"Error al guardar reposición"});}
});

app.put("/reposicion/:id", async (req,res)=>{
  try{
    const usuario=normalizarUsuario(req.usuario.usuario), numeroLista=normalizarNumeroLista(req.body.lista||req.query.lista), id=normalizarTexto(req.params.id);
    const cantidad=enteroPositivo(req.body.cantidad), estado=normalizarTexto(req.body.estado).toLowerCase();
    if(cantidad===null||!["pendiente","completado"].includes(estado)) return res.status(400).json({ok:false,mensaje:"Datos de reposición inválidos"});
    const r=await ejecutarEnCola(`listas:${usuario}:${numeroLista}`,async()=>{const todos=await leerTodasLasListas();
      const i=todos.findIndex(x=>x.usuario===usuario&&x.lista===numeroLista&&(x.id===id||x.codigo===normalizarCodigo(req.body.codigo)));
      if(i<0){const e=new Error(`Registro no encontrado en Lista ${numeroLista}`);e.statusCode=404;throw e;}
      todos[i].cantidad=cantidad; todos[i].estado=estado; todos[i].actualizado=fechaHoraArgentinaIso(); await escribirTodasLasListas(todos); return todos[i];});
    res.json({ok:true,lista:numeroLista,mensaje:"Producto actualizado",registro:limpiarRegistroReposicion(r,numeroLista)});
  }catch(error){console.error("Error en PUT /reposicion/:id:",error);res.status(error.statusCode||500).json({ok:false,mensaje:error.message||"Error al actualizar reposición"});}
});

app.patch("/reposicion", async(req,res)=>{
  try{
    const usuario=normalizarUsuario(req.usuario.usuario), numeroLista=normalizarNumeroLista(req.body.lista||req.query.lista), cambios=Array.isArray(req.body.cambios)?req.body.cambios:[];
    if(!cambios.length) return res.status(400).json({ok:false,mensaje:"No hay cambios para guardar"});
    const resultado=await ejecutarEnCola(`listas:${usuario}:${numeroLista}`,async()=>{let todos=await leerTodasLasListas();
      for(const c of cambios){const i=todos.findIndex(x=>x.usuario===usuario&&x.lista===numeroLista&&(x.id===normalizarTexto(c.id)||x.codigo===normalizarCodigo(c.codigo)));
        if(i<0){const e=new Error(`Registro no encontrado en Lista ${numeroLista}`);e.statusCode=404;throw e;}
        if(c.eliminar===true){todos.splice(i,1);continue;} const q=enteroPositivo(c.cantidad); if(q===null){const e=new Error("Cantidad inválida");e.statusCode=400;throw e;}
        todos[i].cantidad=q; todos[i].actualizado=fechaHoraArgentinaIso();}
      await escribirTodasLasListas(todos); return todos.filter(x=>x.usuario===usuario&&x.lista===numeroLista).map(x=>limpiarRegistroReposicion(x,numeroLista));});
    res.json({ok:true,lista:numeroLista,registros:resultado,mensaje:"Cambios guardados"});
  }catch(error){console.error("Error en PATCH /reposicion:",error);res.status(error.statusCode||500).json({ok:false,mensaje:error.message||"No se pudieron guardar los cambios"});}
});

app.delete("/reposicion/:id", async(req,res)=>{
  try{const usuario=normalizarUsuario(req.usuario.usuario),numeroLista=normalizarNumeroLista(req.query.lista),id=normalizarTexto(req.params.id);
    await ejecutarEnCola(`listas:${usuario}:${numeroLista}`,async()=>{const todos=await leerTodasLasListas();const i=todos.findIndex(x=>x.usuario===usuario&&x.lista===numeroLista&&(x.id===id||x.codigo===normalizarCodigo(req.query.codigo)));
      if(i<0){const e=new Error(`Registro no encontrado en Lista ${numeroLista}`);e.statusCode=404;throw e;}todos.splice(i,1);await escribirTodasLasListas(todos);});
    res.json({ok:true,lista:numeroLista,mensaje:`Producto eliminado de Lista ${numeroLista}`});
  }catch(error){res.status(error.statusCode||500).json({ok:false,mensaje:error.message||"Error al eliminar reposición"});}
});

app.delete("/reposicion", async(req,res)=>{
  try{const usuario=normalizarUsuario(req.usuario.usuario),numeroLista=normalizarNumeroLista(req.query.lista||req.body?.lista);
    await ejecutarEnCola(`listas:${usuario}:${numeroLista}`,async()=>{const todos=(await leerTodasLasListas()).filter(x=>!(x.usuario===usuario&&x.lista===numeroLista));await escribirTodasLasListas(todos);});
    res.json({ok:true,lista:numeroLista,mensaje:`Lista ${numeroLista} lista para comenzar`});
  }catch(error){res.status(500).json({ok:false,mensaje:error.message||"No se pudo vaciar la lista"});}
});


const ejecucionesDiariasNotificaciones = new Set();
function horaMinutoArgentina(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(fecha);
  const valor = tipo => Number(partes.find(parte => parte.type === tipo)?.value || 0);
  return { hora: valor("hour"), minuto: valor("minute") };
}
async function ejecutarNotificacionesDiariasSiCorresponde() {
  const hoy = fechaArgentina();
  const { hora } = horaMinutoArgentina();
  const ejecutarUnaVez = async (clave, tarea) => {
    const id = `${hoy}|${clave}`;
    if (ejecucionesDiariasNotificaciones.has(id)) return;
    ejecucionesDiariasNotificaciones.add(id);
    try { await tarea(); }
    catch (error) { ejecucionesDiariasNotificaciones.delete(id); throw error; }
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
    if (!clave.startsWith(`${hoy}|`)) ejecucionesDiariasNotificaciones.delete(clave);
  }
}
// Revisión frecuente; los avisos se envían a las 08:00 y 16:00 de Argentina.
setInterval(() => ejecutarNotificacionesDiariasSiCorresponde().catch(error => console.error("Error en horario diario de notificaciones:", error)), 60 * 1000);
setTimeout(() => ejecutarNotificacionesDiariasSiCorresponde().catch(error => console.error("Error inicializando horario diario de notificaciones:", error)), 5000);

async function migrarEstructuraHorariosV812() {
  validarConfiguracion();
  await asegurarHojaUsuarios();
  await asegurarHojaSectores();
  await asegurarHojasHorarios();
  await asegurarHojaAuditoriaHorarios();
  invalidarCache("usuarios");
  return {
    hojas: [
      USUARIOS_SHEET_NAME,
      SECTORES_SHEET_NAME,
      CALENDARIO_HORARIOS_SHEET_NAME,
      TURNOS_HORARIOS_SHEET_NAME,
      DETALLES_HORARIOS_SHEET_NAME,
      REEMPLAZOS_HORARIOS_SHEET_NAME,
      AUDITORIA_HORARIOS_SHEET_NAME
    ],
    columnasUsuarios: ["Usuario", "Nombre", "Password hash", "Rol", "Activo", "Creado", "Permisos módulos", "Sector"]
  };
}

app.post("/admin/migrar-horarios", requerirAdministrador, async (req, res) => {
  try {
    const resultado = await migrarEstructuraHorariosV812();
    res.json({ ok:true, mensaje:"Migración de Google Sheets completada", ...resultado });
  } catch (error) {
    console.error("Error en migración de horarios:", error);
    res.status(500).json({ ok:false, mensaje:error.message || "No se pudo migrar Google Sheets" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Herramientas Autoservicio Victor V${APP_VERSION} funcionando en puerto ${PORT}`);
  migrarEstructuraHorariosV812()
    .then(r => console.log("Migración 8.1.4 lista:", r.hojas.join(", ")))
    .catch(error => console.error("No se pudo ejecutar la migración automática 8.1.4:", error));
});
