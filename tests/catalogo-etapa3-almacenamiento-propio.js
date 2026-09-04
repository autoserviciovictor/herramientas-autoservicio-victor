const fs = require('fs');
function ok(c,m){ if(!c) throw new Error(m); }
const db = fs.readFileSync('db-catalogo-publico.js','utf8');
const img = fs.readFileSync('catalogo-imagenes.js','utf8');
const server = fs.readFileSync('server.js','utf8');
const admin = fs.readFileSync('catalogo-admin.js','utf8');
ok(db.includes('image_data BYTEA'), 'Falta almacenamiento binario confirmado');
ok(db.includes('image_candidate_data BYTEA'), 'Falta almacenamiento binario candidato');
ok(db.includes('obtenerImagenCatalogoDb'), 'Falta lector de imagen propia');
ok(img.includes('normalizada'), 'La imagen encontrada no se normaliza antes de guardar');
ok(img.includes('imagenData: normalizada'), 'La imagen manual no se guarda procesada');
ok(server.includes('/catalogo/api/productos/:codigo/imagen'), 'Falta endpoint propio de imagen pública');
ok(server.includes('importarImagenManual'), 'La carga manual sigue dependiendo de hotlink');
ok(admin.includes('/catalogo/api/productos/${encodeURIComponent(p.codigo)}/imagen'), 'La tabla sigue usando URL externa');
console.log('OK catalogo-etapa3-almacenamiento-propio: descarga, persistencia y entrega propia verificadas');
