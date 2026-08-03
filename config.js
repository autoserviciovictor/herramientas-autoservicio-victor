// Configuración central del frontend — Herramientas Autoservicio Victor V11.5.
// URL del servidor Render conectado a Google Sheets.
export const APP_VERSION = "11.8.1";
export const API_BASE_URL = "https://inventario-victor-api.onrender.com";

if (typeof window !== "undefined") window.API_BASE_URL = API_BASE_URL;
