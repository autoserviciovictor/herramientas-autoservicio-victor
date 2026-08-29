const fs = require('fs');
const assert = (v, m) => { if (!v) throw new Error(m); };
const tareas = fs.readFileSync('tareas.js', 'utf8');
assert(/async function confirmarBano\(\)[\s\S]*h\.fecha === hoy && String\(h\.usuario \|\| ""\)\.trim\(\)/.test(tareas), 'La confirmación de Baño no debe bloquearse por un registro histórico placeholder sin confirmar');
console.log('Baño confirmación con historial placeholder: OK');
