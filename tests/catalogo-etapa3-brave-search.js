const fs = require("fs");
const assert = require("assert");

const imagenes = fs.readFileSync("catalogo-imagenes.js", "utf8");
const admin = fs.readFileSync("catalogo-admin.js", "utf8");
const css = fs.readFileSync("catalogo-admin.css", "utf8");

assert(imagenes.includes("BRAVE_SEARCH_API_KEY"), "falta BRAVE_SEARCH_API_KEY");
assert(imagenes.includes("https://api.search.brave.com/res/v1/images/search"), "falta endpoint oficial de Brave Image Search");
assert(imagenes.includes('"X-Subscription-Token": apiKey'), "falta autenticación de Brave Search");
assert(imagenes.includes('country: "AR"'), "falta priorización de resultados de Argentina");
assert(imagenes.includes('search_lang: "es"'), "falta idioma español");
assert(imagenes.includes('safesearch: "strict"'), "falta SafeSearch estricto");
assert(imagenes.includes('count: "30"'), "falta lote razonable de candidatos");
const flujo = imagenes.slice(imagenes.indexOf("async function buscarImagenProducto"));
assert(flujo.indexOf("buscarPorEAN(producto.codigo)") < flujo.indexOf("buscarBrave(producto)"), "el EAN debe tener prioridad sobre la búsqueda comercial");
assert(!imagenes.includes("GOOGLE_CSE_API_KEY"), "quedó una dependencia vieja de Google CSE");
assert(!imagenes.includes("GOOGLE_CSE_CX"), "quedó una dependencia vieja de Google CSE");
assert(admin.includes('data.requiereConfiguracion ? "aviso" : "error"'), "falta estado informativo cuando Brave todavía no está configurado");
assert(css.includes(".catalog-image-search-status.aviso"), "falta estilo de aviso no destructivo");

console.log("OK catalogo-etapa3-brave-search: EAN primero, Brave Search y aviso de configuración verificados");
