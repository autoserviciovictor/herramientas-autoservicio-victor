const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('catalogo/index.html','utf8');
const css = fs.readFileSync('catalogo/catalogo-diseno.css','utf8');

const cssRefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m=>m[1]);
assert.strictEqual(cssRefs.filter(x=>x.includes('catalogo')).length, 1, 'El catálogo público debe cargar una sola hoja de estilos propia');
assert(cssRefs.some(x=>x.startsWith('./catalogo-diseno.css?v=')), 'Debe cargar catalogo-diseno.css como hoja canónica');
assert(html.includes('./assets/hero-diseno-final.webp'), 'Debe usar el hero final aprobado');
assert(!html.includes('catalogo-base.css'), 'No debe referenciar la hoja pública histórica');
for (const name of ['catalogo-etapa4-2.css','catalogo-etapa4-3.css','catalogo-etapa4-4.css','catalogo-etapa5.css','catalogo-etapa6.css']) {
  assert(!html.includes(name), `No debe cargar CSS histórico: ${name}`);
}
assert(html.includes('id="catalogoHeaderSearch"'), 'Debe conservar el buscador principal');
assert(html.includes('class="catalogo-account-button"'), 'Debe conservar Mi cuenta');
assert(html.includes('id="catalogoCart"'), 'Debe conservar el carrito');
assert(html.includes('id="catalogoCategoryNav"'), 'Debe conservar rubros');
assert(css.includes('.catalogo-products-layout'), 'Debe conservar layout de productos');
assert(css.includes('.catalogo-hero__final-image'), 'Debe conservar reglas del hero final');
assert(!css.includes('hero-market.webp') && !css.includes('hero-final-victor.webp'), 'No debe contener fondos de hero reemplazados');
console.log('Catálogo final UI: OK');
