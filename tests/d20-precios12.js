const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('style.css','utf8');
const components = fs.readFileSync('design-components.css','utf8');
const sw = fs.readFileSync('service-worker.js','utf8');
const version = JSON.parse(fs.readFileSync('version.json','utf8'));
const build = version.assetBuild;

assert(html.includes(`style.css?v=${build}`));
assert(html.includes(`design-components.css?v=${build}`));
assert(sw.includes(`autoservicio-v${build}`));
assert(sw.includes(`./style.css?v=${build}`));
assert(sw.includes(`./design-components.css?v=${build}`));

// Precios recientes más legibles, especialmente en móvil.
assert(css.includes('font-size: 13.5px;'));
assert(css.includes('font-size: 12px !important;\n    line-height: 1.05 !important;'));

// Contraste dark reforzado para etiquetas y metadatos sin tocar los títulos principales.
assert(css.includes('D20 PRECIOS 12 · legibilidad de precios recientes + contraste dark'));
assert(css.includes('color: #c4cfdd !important;'));
assert(css.includes('color: #d8b4c0 !important;'));
assert(css.includes('color: #d5deea !important;'));

// El loader compartido también mejora el contraste dark en todos los módulos.
assert(components.includes('color: var(--pro-muted) !important;')); // loader usa el tema global

console.log('D20 Precios 12 regression tests: OK');
