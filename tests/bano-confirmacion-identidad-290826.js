const fs = require('fs');
const assert = (v, m) => { if (!v) throw new Error(m); };
const server = fs.readFileSync('server.js', 'utf8');
assert(server.includes('function normalizarIdentidadBano'), 'Falta normalización robusta de identidad de Baño');
assert(server.includes('.normalize("NFD")'), 'La identidad de Baño debe ignorar diferencias de acentos');
assert(server.includes('replace(/[\\u0300-\\u036f]/g, "")'), 'La identidad de Baño debe remover diacríticos');
assert(/usuarioCoincideResponsableBano[\s\S]*normalizarIdentidadBano/.test(server), 'La confirmación debe comparar responsable con identidad normalizada');
assert(/usuarioCoincideConfirmacionBano[\s\S]*normalizarIdentidadBano/.test(server), 'La verificación debe comparar confirmador con identidad normalizada');
console.log('Baño confirmación identidad acentos: OK');
