const fs = require('fs');
const assert = (v, m) => { if (!v) throw new Error(m); };
const loader = fs.readFileSync('product-loader.js', 'utf8');
assert(loader.includes('input.value = "0"'), 'La cantidad inicial de vencimientos debe ser 0');
assert(loader.includes('input.value === "" || input.value === "0"'), 'El campo debe permitir quedar vacío o en 0 mientras se edita');
assert(loader.includes('event.stopImmediatePropagation()'), 'Debe impedir que la normalización legacy vuelva a forzar 1 durante la edición');
assert(loader.includes('Ingresá una cantidad mayor a 0.'), 'Debe validar una cantidad positiva recién al guardar');
console.log('Vencimientos cantidad inicial 0 y editable: OK');
