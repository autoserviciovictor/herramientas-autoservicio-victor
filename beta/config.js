// Configuración central del frontend — Herramientas Autoservicio Victor V7.1.
// URL del servidor Render conectado a Google Sheets.
export const APP_VERSION = "10.6";
export const API_BASE_URL = "https://inventario-victor-api.onrender.com";

if (typeof window !== "undefined") window.API_BASE_URL = API_BASE_URL;
