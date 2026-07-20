import { API_BASE_URL } from "./config.js?v=6112-entrega1";

const $ = id => document.getElementById(id);
const ESTADO_KEY = "autoservicio_notificaciones_preferencia_v1";
let sincronizando = false;

function base64UrlToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function actualizarEstado(texto, tipo = "") {
  const estado = $("estadoNotificaciones");
  if (estado) { estado.textContent = texto; estado.className = `notification-settings-status ${tipo}`.trim(); }
  const boton = $("btnActivarNotificaciones");
  if (!boton) return;
  const permiso = "Notification" in window ? Notification.permission : "unsupported";
  if (permiso === "granted") { boton.textContent = "✓ Notificaciones activadas"; boton.disabled = true; }
  else if (permiso === "denied") { boton.textContent = "Notificaciones bloqueadas"; boton.disabled = true; }
  else { boton.textContent = "Activar notificaciones"; boton.disabled = false; }
}

async function registrarSuscripcion() {
  if (sincronizando || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  sincronizando = true;
  try {
    const claveRespuesta = await fetch(`${API_BASE_URL}/notificaciones/public-key`);
    const claveData = await claveRespuesta.json();
    if (!claveRespuesta.ok || !claveData.ok || !claveData.configurado || !claveData.publicKey) throw new Error("Configurá las claves VAPID en Render");
    const registro = await navigator.serviceWorker.ready;
    let subscription = await registro.pushManager.getSubscription();
    if (!subscription) subscription = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(claveData.publicKey) });
    const r = await fetch(`${API_BASE_URL}/notificaciones/suscribir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.mensaje || "No se pudo activar las notificaciones");
    localStorage.setItem(ESTADO_KEY, "activadas");
    actualizarEstado("Recibirás avisos al cargar, a 15, 7, 3 y 1 día, y cuando estén vencidos.", "ok");
    fetch(`${API_BASE_URL}/notificaciones/procesar`, { method: "POST" }).catch(() => {});
    return true;
  } catch (error) { actualizarEstado(error.message || "No se pudieron activar las notificaciones", "error"); return false; }
  finally { sincronizando = false; }
}

async function activarNotificaciones() {
  if (!("Notification" in window)) return actualizarEstado("Este dispositivo no admite notificaciones", "error");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") { actualizarEstado(permiso === "denied" ? "Las notificaciones están bloqueadas en el navegador" : "Permiso de notificaciones pendiente", "error"); return; }
  actualizarEstado("Activando notificaciones…");
  await registrarSuscripcion();
}

function inicializarNotificaciones() {
  const boton = $("btnActivarNotificaciones");
  boton?.addEventListener("click", activarNotificaciones);
  if (!("Notification" in window) || !("PushManager" in window)) return actualizarEstado("Este dispositivo no admite notificaciones", "error");
  if (Notification.permission === "granted") {
    actualizarEstado("Notificaciones activadas", "ok");
    registrarSuscripcion();
  } else if (Notification.permission === "denied") actualizarEstado("Notificaciones bloqueadas. Habilitalas desde los permisos del navegador.", "error");
  else actualizarEstado("Activá las notificaciones para recibir alertas de vencimientos.");
}

document.addEventListener("DOMContentLoaded", inicializarNotificaciones);
window.addEventListener("autoservicio:sesion", () => { if ("Notification" in window && Notification.permission === "granted") registrarSuscripcion(); });
