const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const html = read("index.html");
const repo = read("reposicion.js");
const css = read("desktop-layout.css");
const desktop = read("desktop-layout.css");
const sw = read("service-worker.js");
const pwa = read("pwa.js");
const server = read("server.js");
const config = read("config.js");
const version = JSON.parse(read("version.json"));

// Editor individual: cantidad visible en fila, tres puntos y modal propio.
assert(repo.includes('class="repo-row-qty"'), "La cantidad individual debe seguir visible en la fila");
assert(repo.includes('data-repo-accion="menu-producto"'), "Los tres puntos deben abrir el editor individual");
assert(html.includes('id="repoEditarProductoModal"'), "Debe existir el modal Editar producto");
assert(html.includes('id="repoEditarCantidadInput"'), "El editor debe incluir control de cantidad");
assert(html.includes('id="btnRepoEliminarProductoEdicion"'), "El editor debe permitir eliminar");
assert(!html.includes('id="repoListaCount"'), "El contador general junto al título no debe volver");

// El modo viejo de editar toda la lista debe haber desaparecido.
for (const legacy of ["modoEdicion", "borradorEdicion", "snapshotEdicion", "repoGuardarEdicionModal", "repoDescartarEdicionModal"]) {
  assert(!repo.includes(legacy) && !html.includes(legacy), `Código viejo todavía presente: ${legacy}`);
}
assert(!repo.includes('prompt('), "Mi lista no debe usar prompt nativo para cantidades");

// Accesibilidad y responsive.
assert(repo.includes("manejarTecladoModal"), "El modal debe atrapar foco y Escape");
assert(html.includes('role="status" aria-live="polite"'), "El toast debe anunciar mensajes accesiblemente");
assert(css.includes('@media (max-width: 360px)'), "Debe existir ajuste para teléfonos 320/360");
assert(css.includes('.repo-confirm-check::after') && css.includes('.repo-row-more::after'), "Checks y tres puntos deben tener área táctil ampliada");
assert(desktop.includes('310px !important'), "Panel lateral de Mi lista debe evitar cortes de texto");

// Una sola escala D21, sin las tres generaciones anteriores.
assert(!css.includes('ESCALA TIPOGRÁFICA 3') && !css.includes('MICROETIQUETAS LATERALES'), "D21 CSS debe estar consolidado");

// Build y caché unificados.
assert(sw.includes(`autoservicio-v${version.assetBuild}`), "Cache D21 incorrecta");
assert(pwa.includes(`SW_RUNTIME_REVISION = "${version.assetBuild}"`), "PWA build incorrecto");
assert(config.includes('APP_BUILD = "D21"'), "Config debe declarar D21");
assert(version.build === "D21" && version.label === "19.6.0 D21", "version.json debe estar unificado en D21");
const versions = [...html.matchAll(/\?v=([^"']+)/g)].map((m) => m[1]);
assert(versions.length > 0 && versions.every((v) => v === versions[0]) && versions[0].startsWith("1960-d21"), "Todos los assets de index deben usar un único build D21");

// Hardening de cabeceras API.
assert(server.includes('"X-Frame-Options": "DENY"'), "Falta protección contra framing");
assert(server.includes('Strict-Transport-Security'), "Falta HSTS de producción");
assert(server.includes("frame-ancestors 'none'"), "Falta frame-ancestors en CSP del servidor");

console.log("D21 reposición/auditoría regression tests: OK");
