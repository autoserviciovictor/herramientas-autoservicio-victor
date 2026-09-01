// Configuración central del frontend — Herramientas Autoservicio Victor V19.6.
// URL del servidor Render conectado a Google Sheets.
export const APP_VERSION = "19.6.0";
export const APP_BUILD = "D21";
export const APP_ASSET_BUILD = "1960-d21-cierre-etapa6-010926";
export const APP_VERSION_LABEL = `${APP_VERSION} ${APP_BUILD}`;
export const API_BASE_URL = "https://inventario-victor-api.onrender.com";

if (typeof window !== "undefined") window.API_BASE_URL = API_BASE_URL;
