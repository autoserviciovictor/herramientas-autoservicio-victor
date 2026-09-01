const fs = require('fs');
const assert = require('assert');

const style = fs.readFileSync('style.css', 'utf8');
const admin = fs.readFileSync('admin-official.css', 'utf8');
const unified = fs.readFileSync('ui-unification.css', 'utf8');

function bracesOk(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

assert(bracesOk(style), 'style.css tiene llaves desbalanceadas');
assert(bracesOk(admin), 'admin-official.css tiene llaves desbalanceadas');
assert(bracesOk(unified), 'ui-unification.css tiene llaves desbalanceadas');

// La capa canónica aprobada debe seguir presente.
assert(admin.includes('AUDITORÍA VISUAL · ETAPA 4 · ADMINISTRACIÓN COMPLETA'), 'falta la capa canónica final de Administración');
assert(admin.includes('width:100vw !important;'), 'falta el ancho móvil canónico de los modales de Administración');
assert(admin.includes('border-radius:20px 20px 0 0 !important;'), 'falta el radio móvil canónico de los modales');
assert(admin.includes('min-height:78px !important;'), 'falta la altura canónica del footer de los modales');

// Condiciones anteriores que eran anuladas por la capa móvil final no deben reaparecer.
assert(!admin.includes('#adminSectorModal .admin-sector-modal-official{width:calc(100vw - 16px) !important;max-height:calc(100dvh - 16px) !important;border-radius:16px !important;}'), 'volvió el tamaño móvil viejo de modales');
assert(!admin.includes('#adminUsuarioModal .admin-modal-actions-sticky, #adminSectorModal .admin-sector-modal-actions{padding:12px 16px 15px !important;}'), 'volvió el padding viejo del footer de modales');

console.log('Etapa 5 Administración/CSS general: OK');
