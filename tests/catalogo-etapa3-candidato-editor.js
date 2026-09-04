const fs = require('fs');
function ok(c,m){ if(!c) throw new Error(m); }
const db=fs.readFileSync('db-catalogo-publico.js','utf8');
const js=fs.readFileSync('catalogo-admin.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(db.includes('candidatoImagen: String(f.image_candidate_url || "")'), 'detalle debe devolver candidatoImagen');
ok(db.includes('candidatoFuente: String(f.image_candidate_source || "")'), 'detalle debe devolver fuente candidata');
ok(db.includes('errorImagen: String(f.image_error || "")'), 'detalle debe devolver error de imagen');
ok(js.includes('catalogProductoImagenEstadoBusqueda'), 'editor debe mostrar estado de busqueda local');
ok(html.includes('id="catalogProductoImagenEstadoBusqueda"'), 'falta estado de busqueda en modal');
console.log('OK catalogo-etapa3-candidato-editor: candidato y errores visibles dentro del editor');
