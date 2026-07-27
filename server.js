const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const crypto = require("crypto");
const fs = require("fs");
const webpush = require("web-push");
const path = require("path");
require("dotenv").config();

const app = express();
const APP_VERSION = "8.6";
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
const DETALLES_HORARIOS_SHEET_NAME = "Detalles Horarios";
const REEMPLAZOS_HORARIOS_SHEET_NAME = "Reemplazos Horarios";
const HISTORIAL_VENCIMIENTOS_SHEET_NAME = "Historial Vencimientos";
const PUSH_SUBSCRIPTIONS_SHEET_NAME = "Notificaciones Suscripciones";
const NOTIFICATION_LOG_SHEET_NAME = "Notificaciones Vencimientos";
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
  calendarioHorarios: 15000
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
const MODULOS_PERMITIDOS = ["inventario", "vencimientos", "anotar", "precios", "horarios"];
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
  if (["administrador","administracion"].includes(usuario?.rol)) return true;
  if (usuario?.rol === "supervisor") return sectoresACargo(usuario).includes(sector) || usuario?.sector === sector;
  return Boolean(usuario?.sector) && usuario.sector === sector;
}
function puedeModificarSectorHorarios(usuario, sectorId) {
  const sector=normalizarTexto(sectorId);
  if (["administrador","administracion"].includes(usuario?.rol)) return true;
  return usuario?.rol === "supervisor" && sectoresACargo(usuario).includes(sector);
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
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId:SPREADSHEET_ID, requestBody:{ requests } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A1:H1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","Mes","Empleado","Día","Turno","Actualizado","Usuario","Nombre"]] } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${TURNOS_HORARIOS_SHEET_NAME}!A1:G1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","ID","Inicio","Fin","Color","Activo","Actualizado"]] } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${DETALLES_HORARIOS_SHEET_NAME}!A1:I1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","Mes","Empleado","Día","Tipo","Motivo","Observación","Actualizado","Usuario"]] } });
  await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${REEMPLAZOS_HORARIOS_SHEET_NAME}!A1:I1`, valueInputOption:"USER_ENTERED", requestBody:{ values:[["Sector","Mes","Empleado original","Reemplazante","Desde","Hasta","Observación","Actualizado","Usuario"]] } });
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
    const r = await sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:`${TURNOS_HORARIOS_SHEET_NAME}!A:G` });
    return (r.data.values || []).slice(1)
      .filter(f => normalizarTexto(f[0]) === sector && !["no","false","0","inactivo"].includes(normalizarTexto(f[5]).toLowerCase()))
      .map(f => ({
        id:normalizarTexto(f[1]),
        inicio:normalizarHoraHorario(f[2]),
        fin:normalizarHoraHorario(f[3]),
        color:/^#[0-9a-f]{6}$/i.test(f[4]||"") ? f[4] : "#64748b"
      }))
      .filter(t => t.id && t.inicio && t.fin);
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
app.put("/horarios/turnos", requerirAdministrador, async (req,res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    const sectores = await obtenerSectores();
    if (!sectores.some(s => s.id === sector)) return res.status(404).json({ok:false,mensaje:"Sector inexistente"});
    const turnos = Array.isArray(req.body?.turnos) ? req.body.turnos.map(t => ({ id:normalizarTexto(t.id), inicio:normalizarTexto(t.inicio).slice(0,5), fin:normalizarTexto(t.fin).slice(0,5), color:/^#[0-9a-f]{6}$/i.test(t.color||"")?t.color:"#64748b" })) : [];
    if (!turnos.length || turnos.some(t => !t.id || !/^\d{2}:\d{2}$/.test(t.inicio) || !/^\d{2}:\d{2}$/.test(t.fin))) return res.status(400).json({ok:false,mensaje:"Configuración de horarios inválida"});
    await asegurarHojasHorarios();
    await ejecutarEnCola("turnos-horarios", async () => {
      const r=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${TURNOS_HORARIOS_SHEET_NAME}!A:G`});
      const otras=(r.data.values||[]).slice(1).filter(f=>normalizarTexto(f[0])!==sector);
      const ahora=fechaHoraArgentinaIso();
      const nuevas=turnos.map(t=>[sector,t.id,t.inicio,t.fin,t.color,"Sí",ahora]);
      const todas=[...otras,...nuevas], filasPrevias=Math.max(0,(r.data.values||[]).length-1);
      if(todas.length) await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:`${TURNOS_HORARIOS_SHEET_NAME}!A2:G${todas.length+1}`,valueInputOption:"USER_ENTERED",requestBody:{values:todas}});
      if(filasPrevias>todas.length) await sheets.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range:`${TURNOS_HORARIOS_SHEET_NAME}!A${todas.length+2}:G${filasPrevias+1}`});
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
    const contenido = await leerConCache(`calendarioHorarios:${sector}:${mes}`, CACHE_TTL.calendarioHorarios, async () => {
      const [r, dr] = await Promise.all([
        sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${CALENDARIO_HORARIOS_SHEET_NAME}!A:H`}),
        sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:`${DETALLES_HORARIOS_SHEET_NAME}!A:I`})
      ]);
      const celdasMapa=new Map(); (r.data.values||[]).slice(1).filter(f=>normalizarTexto(f[0])===sector&&normalizarTexto(f[1])===mes).map(f=>({empleado:normalizarTexto(f[2]),dia:Number(f[3]),turno:normalizarTexto(f[4])})).filter(x=>x.empleado&&Number.isInteger(x.dia)&&x.dia>=1&&x.dia<=31&&x.turno).forEach(x=>celdasMapa.set(`${x.empleado}::${x.dia}`,x)); const celdas=[...celdasMapa.values()];
      const detalles=(dr.data.values||[]).slice(1).filter(f=>normalizarTexto(f[0])===sector&&normalizarTexto(f[1])===mes).map(f=>({empleado:normalizarTexto(f[2]),dia:Number(f[3]),tipo:normalizarTexto(f[4]),motivo:normalizarTexto(f[5]),observacion:normalizarTexto(f[6])})).filter(x=>x.empleado&&x.dia>=1&&x.dia<=31);
      return {celdas,detalles,reemplazos:[]};
    });
    res.json({ok:true,sector,mes,...contenido,turnos:await obtenerTurnosSector(sector)});
  } catch(e) { res.status(500).json({ok:false,mensaje:e.message || "No se pudo cargar el calendario"}); }
});
app.put("/horarios/calendario", requerirAccesoHorarios, async (req,res) => {
  try {
    const sector=normalizarTexto(req.body?.sector), mes=normalizarTexto(req.body?.mes);
    if(!puedeModificarSectorHorarios(req.usuario,sector)) return res.status(403).json({ok:false,mensaje:"Solo el administrador o el supervisor asignado pueden modificar este calendario"});
    if(!mesHorariosValido(mes)) return res.status(400).json({ok:false,mensaje:"Mes inválido"});
    const sectores=await obtenerSectores(); const sec=sectores.find(s=>s.id===sector&&s.activo);
    if(!sec) return res.status(404).json({ok:false,mensaje:"Sector inexistente o inactivo"});
    const usuarios=await obtenerUsuarios();
    const empleadosPermitidos=new Set(usuarios.filter(u=>u.activo&&u.sector===sector).map(u=>u.nombre||u.usuario));
    const celdas=(Array.isArray(req.body?.celdas)?req.body.celdas:[]).map(x=>({empleado:normalizarTexto(x.empleado),dia:Number(x.dia),turno:normalizarTexto(x.turno)})).filter(x=>x.empleado&&Number.isInteger(x.dia)&&x.dia>=1&&x.dia<=31&&x.turno);
    const baseCeldas=(Array.isArray(req.body?.baseCeldas)?req.body.baseCeldas:[]).map(x=>({empleado:normalizarTexto(x.empleado),dia:Number(x.dia),turno:normalizarTexto(x.turno)})).filter(x=>x.empleado&&Number.isInteger(x.dia)&&x.dia>=1&&x.dia<=31&&x.turno);
    const clienteConBase=Array.isArray(req.body?.baseCeldas);
    const detalles=(Array.isArray(req.body?.detalles)?req.body.detalles:[]).map(x=>({empleado:normalizarTexto(x.empleado),dia:Number(x.dia),tipo:normalizarTexto(x.tipo).slice(0,30),motivo:normalizarTexto(x.motivo).slice(0,80),observacion:normalizarTexto(x.observacion).slice(0,300)})).filter(x=>x.empleado&&x.dia>=1&&x.dia<=31&&(x.tipo||x.motivo||x.observacion));
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
      if(req.usuario.rol !== "administrador") {
        const rolesPorNombre=new Map(usuarios.filter(u=>u.activo&&u.sector===sector).map(u=>[normalizarTexto(u.nombre||u.usuario),u.rol]));
        const protegidos=clavesModificadas.filter(k=>{const nombre=k.split("::")[0];const rolEmpleado=rolesPorNombre.get(nombre)||"personal";return req.usuario.rol==="administracion"?rolEmpleado!=="supervisor":rolEmpleado==="supervisor";});
        if(protegidos.some(k=>(anterior.get(k)||"")!==(nuevoCompleto.get(k)||""))) {
          const error=new Error(req.usuario.rol==="administracion"?"Administración solo puede modificar horarios de supervisores":"Los supervisores no pueden modificar su propio horario ni el de otros supervisores");
          error.statusCode=403; throw error;
        }
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
    const [sectores, usuarios] = await Promise.all([obtenerSectores(), obtenerUsuarios()]);
    const activos = sectores.filter(s => s.activo);
    if (!["administrador","administracion","supervisor"].includes(req.usuario.rol) && !req.usuario.sector) return res.status(403).json({ ok:false, mensaje:"Tu usuario no tiene un sector asignado" });
    const sectoresSupervisor = new Set(sectoresACargo(req.usuario));
    // Compatibilidad: también reconoce sectores donde el usuario figura como
    // supervisor en la hoja Sectores. Así puede navegar todos sus calendarios
    // aunque la sesión local sea anterior a la asignación múltiple.
    if (req.usuario.rol === "supervisor") {
      activos.filter(s => normalizarUsuario(s.supervisor) === normalizarUsuario(req.usuario.usuario)).forEach(s => sectoresSupervisor.add(s.id));
      if (req.usuario.sector) sectoresSupervisor.add(req.usuario.sector);
    }
    const visibles = ["administrador","administracion"].includes(req.usuario.rol)
      ? activos
      : (req.usuario.rol === "supervisor"
        ? activos.filter(s => sectoresSupervisor.has(s.id))
        : activos.filter(s => s.id === req.usuario.sector));
    if (!["administrador","administracion","supervisor"].includes(req.usuario.rol) && !visibles.length) return res.status(403).json({ ok:false, mensaje:"No tenés acceso a un sector activo" });
    const respuesta = visibles.map(s => ({
      id: s.id,
      nombre: s.nombre,
      color: s.color,
      activo: s.activo,
      puedeEditar: ["administrador","administracion"].includes(req.usuario.rol) || (req.usuario.rol === "supervisor" && sectoresSupervisor.has(s.id)),
      empleados: usuarios
        .filter(u => u.activo && u.sector === s.id)
        .sort((a, b) => {
          const aSupervisor = normalizarUsuario(a.usuario) === normalizarUsuario(s.supervisor) || a.rol === "supervisor";
          const bSupervisor = normalizarUsuario(b.usuario) === normalizarUsuario(s.supervisor) || b.rol === "supervisor";
          if (aSupervisor !== bSupervisor) return aSupervisor ? 1 : -1;
          return String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), "es", { sensitivity:"base" });
        })
        .map(u => u.nombre || u.usuario),
      empleadosInfo: usuarios.filter(u=>u.activo&&u.sector===s.id).map(u=>({nombre:u.nombre||u.usuario,rol:u.rol,usuario:u.usuario}))
    }));
    res.json({ ok: true, sectores: respuesta, sectorUsuario: req.usuario.sector || "", puedeEditar: ["administrador","administracion","supervisor"].includes(req.usuario.rol), rol:req.usuario.rol });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: error.message || "No se pudo cargar el contexto de horarios" });
  }
});
app.post("/horarios/auditoria", requerirAccesoHorarios, async (req, res) => {
  try {
    const sector = normalizarTexto(req.body?.sector);
    if (!puedeModificarSectorHorarios(req.usuario, sector)) return res.status(403).json({ ok:false, mensaje:"Solo el administrador o el supervisor asignado pueden modificar este sector" });
    if (!["administrador","administracion","supervisor"].includes(req.usuario.rol)) return res.status(403).json({ ok:false, mensaje:"Tu usuario tiene acceso de solo lectura" });
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
  for (const sector of sectores.filter(s => s.supervisor === clave && s.id !== exceptoSectorId)) {
    await actualizarFilaSector(sector, { supervisor: "" });
  }
}

async function reconciliarSupervisorAnterior(usuarioClave, sectorPreferido = "") {
  const clave = normalizarUsuario(usuarioClave);
  if (!clave) return;
  invalidarCache("usuarios");
  const [usuarios, sectores] = await Promise.all([obtenerUsuarios(), obtenerSectores()]);
  const usuario = usuarios.find(u => u.usuario === clave);
  if (!usuario || usuario.rol === "administrador") return;
  const sigueSupervisando = sectores.some(s => s.supervisor === clave && s.activo);
  if (!sigueSupervisando && usuario.rol === "supervisor") {
    await actualizarFilaUsuario(usuario, { rol: "personal", sector: sectorPreferido || usuario.sector || "" });
    invalidarCache("usuarios");
  }
}

async function asignarSupervisorASector(usuarioClave, sectorId) {
  const clave = normalizarUsuario(usuarioClave);
  if (!clave) return;
  const [usuarios, sectores] = await Promise.all([obtenerUsuarios(), obtenerSectores()]);
  const usuario = usuarios.find(u => u.usuario === clave);
  const sector = sectores.find(s => s.id === sectorId);
  if (!usuario) throw new Error("El supervisor seleccionado no existe");
  if (!usuario.activo) throw new Error("El supervisor seleccionado está inactivo");
  if (!sector || !sector.activo) throw new Error("El sector seleccionado no existe o está inactivo");

  // Un supervisor solo puede administrar un sector. Si estaba en otro, se libera.
  await quitarSupervisionDeUsuario(clave, sectorId);

  const rol = usuario.rol === "administrador" ? "administrador" : "supervisor";
  await actualizarFilaUsuario(usuario, { rol, sector: sectorId });
  invalidarCache("usuarios");
}

async function sincronizarUsuarioSupervisor(usuarioClave, rol, sectorId, activo = true) {
  const clave = normalizarUsuario(usuarioClave);
  const sectores = await obtenerSectores();
  const supervisadosAntes = sectores.filter(s => s.supervisor === clave);

  if (rol === "supervisor") {
    if (!activo) throw new Error("Un usuario inactivo no puede ser supervisor");
    if (!sectorId) throw new Error("Asigná un sector al supervisor");
    const destino = sectores.find(s => s.id === sectorId && s.activo);
    if (!destino) throw new Error("El sector seleccionado no existe o está inactivo");
    for (const sector of supervisadosAntes.filter(s => s.id !== sectorId)) {
      await actualizarFilaSector(sector, { supervisor: "" });
    }
    const supervisorAnteriorDestino = normalizarUsuario(destino.supervisor);
    await actualizarFilaSector(destino, { supervisor: clave });
    if (supervisorAnteriorDestino && supervisorAnteriorDestino !== clave) {
      await reconciliarSupervisorAnterior(supervisorAnteriorDestino, destino.id);
    }
  } else {
    for (const sector of supervisadosAntes) {
      await actualizarFilaSector(sector, { supervisor: "" });
    }
  }
}

async function sincronizarSectorSupervisor(sector, nuevoSupervisor) {
  const anterior = normalizarUsuario(sector.supervisor);
  const nuevo = normalizarUsuario(nuevoSupervisor);
  if (nuevo) await asignarSupervisorASector(nuevo, sector.id);
  await actualizarFilaSector(sector, { supervisor: nuevo });
  if (anterior && anterior !== nuevo) await reconciliarSupervisorAnterior(anterior, sector.id);
  invalidarCache("usuarios");
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
    if (rol === "supervisor" && !sectoresCargo.length) return res.status(400).json({ ok:false, mensaje:"Asigná al menos un sector a cargo del supervisor" });
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
    await sincronizarUsuarioSupervisor(usuario, rol, sector, true);
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
    if (rol === "supervisor" && !sectoresCargo.length) return res.status(400).json({ ok:false, mensaje:"Asigná al menos un sector a cargo del supervisor" });
    if (sectoresCargo.length) { const sectores=await obtenerSectores(); if (sectoresCargo.some(id=>!sectores.some(s=>s.id===id&&s.activo))) return res.status(400).json({ok:false,mensaje:"Uno de los sectores a cargo no existe o está inactivo"}); }
    if (clave === req.usuario.usuario && (!activo || rol !== "administrador")) {
      return res.status(400).json({ ok:false, mensaje:"No podés desactivar tu propia cuenta ni quitarte el rol de administrador" });
    }
    if (password && password.length < 4) return res.status(400).json({ ok:false, mensaje:"La contraseña debe tener al menos 4 caracteres" });
    const hash = password ? hashPassword(password) : actual.passwordHash;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USUARIOS_SHEET_NAME}!A${actual.filaGoogle}:H${actual.filaGoogle}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[clave, nombre, hash, rol, activo ? "Sí" : "No", fechaHoraArgentinaIso(), serializarPermisos(permisos, rol), sector, sectoresCargo.join(",")]] }
    });
    invalidarCache("usuarios");
    await sincronizarUsuarioSupervisor(clave, rol, sector, activo);
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
      eliminarRegistrosSector(CALENDARIO_HORARIOS_SHEET_NAME,id,"H"), eliminarRegistrosSector(TURNOS_HORARIOS_SHEET_NAME,id,"G"),
      eliminarRegistrosSector(DETALLES_HORARIOS_SHEET_NAME,id,"I"), eliminarRegistrosSector(REEMPLAZOS_HORARIOS_SHEET_NAME,id,"I")
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

async function asegurarHojasNotificaciones() {
  if (hojasNotificacionesAseguradas) return;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const titulos = new Set((meta.data.sheets || []).map(h => h.properties?.title));
  const requests = [];
  if (!titulos.has(PUSH_SUBSCRIPTIONS_SHEET_NAME)) requests.push({ addSheet: { properties: { title: PUSH_SUBSCRIPTIONS_SHEET_NAME } } });
  if (!titulos.has(NOTIFICATION_LOG_SHEET_NAME)) requests.push({ addSheet: { properties: { title: NOTIFICATION_LOG_SHEET_NAME } } });
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
  hojasNotificacionesAseguradas = true;
}

async function obtenerSuscripcionesPush() {
  await asegurarHojasNotificaciones();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!A:G` });
  return (r.data.values || []).slice(1).map((f, i) => ({
    filaGoogle: i + 2, endpoint: normalizarTexto(f[0]), p256dh: normalizarTexto(f[1]), auth: normalizarTexto(f[2]),
    usuario: normalizarTexto(f[3]), nombre: normalizarTexto(f[4]), activo: normalizarTexto(f[5]).toLowerCase() !== "no"
  })).filter(s => s.endpoint && s.p256dh && s.auth && s.activo);
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
}

async function clavesNotificacionesEnviadas() {
  await asegurarHojasNotificaciones();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${NOTIFICATION_LOG_SHEET_NAME}!A:A` });
  return new Set((r.data.values || []).slice(1).map(f => normalizarTexto(f[0])).filter(Boolean));
}

async function registrarNotificacionEnviada(clave, tipo, registro, detalle) {
  await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${NOTIFICATION_LOG_SHEET_NAME}!A:G`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[clave, fechaHoraArgentinaIso(), tipo, registro.id, registro.codigo, registro.vencimiento, detalle]] } });
}

async function desactivarSuscripcionPush(filaGoogle) {
  if (!filaGoogle) return;
  await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${PUSH_SUBSCRIPTIONS_SHEET_NAME}!F${filaGoogle}:F${filaGoogle}`, valueInputOption: "RAW", requestBody: { values: [["No"]] } }).catch(() => {});
}

async function enviarPushATodos(payload) {
  if (!PUSH_CONFIGURED) return { enviados: 0, configurado: false };
  const suscripciones = await obtenerSuscripcionesPush();
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
  return { enviados, configurado: true };
}

function payloadAlertaVencimiento(registro, dias, tipo) {
  const total = numero(registro.total);
  const unidades = `${total} ${total === 1 ? "unidad" : "unidades"}`;
  if (tipo === "nuevo") {
    return {
      title: "Nuevo vencimiento cargado",
      body: `${registro.articulo} · ${unidades} · vence ${registro.vencimiento}`,
      tag: `venc-${registro.id}-nuevo`,
      data: { url: "./" }
    };
  }
  if (tipo === "vencido") return { title: "Producto vencido", body: `${registro.articulo} · ${total} ${total === 1 ? "unidad vencida" : "unidades vencidas"}`, tag: `venc-${registro.id}-vencido`, data: { url: "./" } };
  if (tipo === "hoy") return { title: "Vence hoy", body: `${registro.articulo} · ${unidades}`, tag: `venc-${registro.id}-hoy`, data: { url: "./" } };
  if (tipo === "oferta-3") return { title: "Oferta próxima a vencer", body: `${registro.articulo} · ${unidades} · vence en 3 días`, tag: `venc-${registro.id}-oferta-3`, data: { url: "./" } };
  const textoDias = dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;
  return { title: textoDias, body: `${registro.articulo} · ${unidades}`, tag: `venc-${registro.id}-${tipo}`, data: { url: "./" } };
}

async function enviarAlertaRegistro(registro, dias, tipo, clave) {
  const payload = payloadAlertaVencimiento(registro, dias, tipo);
  const resultado = await enviarPushATodos(payload);
  if (resultado.enviados > 0) await registrarNotificacionEnviada(clave, tipo, registro, payload.body);
  return resultado;
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
    for (const registro of vencimientos) {
      const dias = diasDesdeHoyArgentina(registro.vencimiento);
      if (dias === null) continue;
      const tipos = [];
      if ([15, 7, 3, 1].includes(dias)) tipos.push(String(dias));
      else if (dias === 0) tipos.push("hoy");
      else if (dias < 0) tipos.push("vencido");
      if (dias === 3 && normalizarOfertaVencimiento(registro.oferta) === "Sí") tipos.push("oferta-3");
      for (const tipo of tipos) {
        const clave = `${registro.id}|${registro.vencimiento}|${tipo}`;
        if (enviadas.has(clave)) continue;
        await enviarAlertaRegistro(registro, dias, tipo, clave);
        enviadas.add(clave);
      }
    }
  } catch (error) {
    console.error("Error procesando alertas de vencimientos:", error);
  } finally { procesandoNotificaciones = false; }
}

app.get("/notificaciones/public-key", (req, res) => {
  res.json({ ok: true, configurado: PUSH_CONFIGURED, publicKey: VAPID_PUBLIC_KEY || "" });
});

app.post("/notificaciones/suscribir", async (req, res) => {
  try {
    if (!PUSH_CONFIGURED) return res.status(503).json({ ok: false, mensaje: "Las notificaciones todavía no están configuradas en Render" });
    await guardarSuscripcionPush(req);
    res.json({ ok: true, mensaje: "Notificaciones activadas. Los avisos diarios se envían a las 08:00." });
  } catch (error) { res.status(400).json({ ok: false, mensaje: error.message || "No se pudo guardar la suscripción" }); }
});

app.post("/notificaciones/procesar", async (req, res) => {
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
      const clave = `${registro.id}|${registro.vencimiento}|${tipo}`;
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


let ultimaEjecucionDiariaNotificaciones = "";
function horaMinutoArgentina(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(fecha);
  const valor = tipo => Number(partes.find(parte => parte.type === tipo)?.value || 0);
  return { hora: valor("hour"), minuto: valor("minute") };
}
async function ejecutarNotificacionesDiariasSiCorresponde() {
  const hoy = fechaArgentina();
  const { hora } = horaMinutoArgentina();
  if (hora !== 8 || ultimaEjecucionDiariaNotificaciones === hoy) return;
  ultimaEjecucionDiariaNotificaciones = hoy;
  await procesarAlertasVencimientos();
}
// Revisión frecuente, pero los avisos diarios solo se procesan a las 08:00 de Argentina.
setInterval(() => ejecutarNotificacionesDiariasSiCorresponde().catch(error => console.error("Error en horario diario de notificaciones:", error)), 60 * 1000);
setTimeout(() => ejecutarNotificacionesDiariasSiCorresponde().catch(error => console.error("Error inicializando horario diario de notificaciones:", error)), 5000);

async function migrarEstructuraHorariosV812() {
  validarConfiguracion();
  await asegurarHojaUsuarios();
  await asegurarHojaSectores();
  await asegurarHojasHorarios();
  await asegurarHojaAuditoriaHorarios();
  limpiarCache("usuarios");
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
