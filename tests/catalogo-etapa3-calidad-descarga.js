const fs = require("fs");
const assert = require("assert");

const imagenes = fs.readFileSync("catalogo-imagenes.js", "utf8");
const admin = fs.readFileSync("catalogo-admin.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert(imagenes.includes('FONDO_BLANCO_MINIMO = 0.88'), "Falta control de fondo blanco");
assert(imagenes.includes('normalizarImagenCatalogo'), "Falta normalización de imagen");
assert(imagenes.includes('resize(LADO_CATALOGO, LADO_CATALOGO'), "Falta salida uniforme cuadrada");
assert(imagenes.includes('validarCandidato'), "Falta validar candidatos antes de guardarlos");
assert(server.includes('/admin/catalogo/productos/:codigo/imagen/contenido'), "Falta endpoint de descarga/proxy");
assert(admin.includes('apiBlob('), "El editor no descarga la imagen por backend");
assert(admin.includes('URL.createObjectURL'), "El editor no usa una vista previa descargada");
assert(pkg.dependencies.sharp, "Sharp debe estar declarado para procesar imágenes");
console.log("OK catalogo-etapa3-calidad-descarga: validación, descarga y normalización verificadas");
