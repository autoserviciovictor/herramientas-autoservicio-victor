const fs = require('fs');
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const html = fs.readFileSync('index.html','utf8');
const app = fs.readFileSync('app.js','utf8');
const excel = fs.readFileSync('excel.js','utf8');
const server = fs.readFileSync('server.js','utf8');
const db = fs.readFileSync('db-vencimientos.js','utf8');

for (const id of ['vencSalonInput','vencDepositoInput','vencTotalTexto','vencEditSalonInput','vencEditDepositoInput','vencEditTotalTexto']) {
  ok(html.includes(`id="${id}"`), `Falta control ${id}`);
}
ok(html.includes('Stock salón') && html.includes('Stock depósito') && html.includes('Stock total'), 'La UI debe separar Salón, Depósito y Total');
ok(app.includes('stockVencimientoDesdeInputs'), 'Falta cálculo único de stock total en frontend');
ok(app.includes('salon + deposito'), 'El total frontend debe ser Salón + Depósito');
ok(app.includes('salon,\n      deposito,\n      cantidad,'), 'El alta debe enviar ambas ubicaciones y el total');
ok(app.includes('item.salon ?? item.cantidad'), 'La edición debe migrar visualmente registros anteriores a Salón');
ok(excel.includes('salon + deposito'), 'La capa API debe mantener total = Salón + Depósito');
ok(excel.includes('registro.salon ?? registro.cantidad ?? 0'), 'Los registros históricos deben migrar su cantidad completa a Salón');
ok(excel.includes('registro.deposito ?? 0'), 'Los registros históricos sin Depósito deben asumir 0');
ok(server.includes('function stockVencimientoDesdeBody'), 'Backend debe normalizar stock por ubicación');
ok(server.includes('Salón: ${registro.salon} · Depósito: ${registro.deposito} · Total: ${registro.cantidad}'), 'Historial debe registrar el desglose de stock');
ok(db.includes('salon_quantity INTEGER NOT NULL DEFAULT 0'), 'Falta columna PostgreSQL de salón');
ok(db.includes('deposit_quantity INTEGER NOT NULL DEFAULT 0'), 'Falta columna PostgreSQL de depósito');
ok(db.includes('SET salon_quantity=quantity, deposit_quantity=0'), 'Registros existentes deben conservar su cantidad al migrar');
ok(db.includes('cantidad: (Number(row.salon_quantity) || 0) + (Number(row.deposit_quantity) || 0)'), 'Respuesta DB debe calcular total por ubicaciones');
console.log('Vencimientos stock Salón/Depósito/Total 03/09: OK');
