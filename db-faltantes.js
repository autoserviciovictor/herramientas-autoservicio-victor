const { query } = require('./db');
let listo = null;
function asegurar() {
  if (!listo) listo = query(`CREATE TABLE IF NOT EXISTS replenishment_missing_shared (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    clave TEXT NOT NULL UNIQUE,
    cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    conseguido BOOLEAN NOT NULL DEFAULT FALSE,
    creado_por TEXT NOT NULL DEFAULT '',
    actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(error => { listo = null; throw error; });
  return listo;
}
async function listar() {
  await asegurar();
  const r = await query('SELECT id,nombre,cantidad,conseguido,creado_por,actualizado FROM replenishment_missing_shared ORDER BY conseguido ASC, actualizado DESC, id DESC');
  return r.rows;
}
async function agregar(nombre, cantidad, usuario) {
  await asegurar();
  const clave = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const r = await query(`INSERT INTO replenishment_missing_shared (nombre,clave,cantidad,creado_por)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (clave) DO UPDATE SET conseguido=FALSE, cantidad=EXCLUDED.cantidad, actualizado=NOW()
    RETURNING *`, [nombre,clave,cantidad,usuario]);
  return r.rows[0];
}
async function estado(id, conseguido) {
  await asegurar();
  const r = await query('UPDATE replenishment_missing_shared SET conseguido=$2, actualizado=NOW() WHERE id=$1 RETURNING *',[id,conseguido]);
  return r.rows[0];
}
async function cantidad(id, nuevaCantidad) {
  await asegurar();
  const r = await query('UPDATE replenishment_missing_shared SET cantidad=$2, actualizado=NOW() WHERE id=$1 RETURNING *',[id,nuevaCantidad]);
  return r.rows[0];
}
async function eliminar(id) {
  await asegurar();
  const r = await query('DELETE FROM replenishment_missing_shared WHERE id=$1 RETURNING id',[id]);
  return r.rows[0];
}
async function empezarNuevaLista(ids) {
  await asegurar();
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const r = await query('DELETE FROM replenishment_missing_shared WHERE id = ANY($1::bigint[]) RETURNING id', [ids]);
  return r.rowCount;
}
module.exports = {listar,agregar,estado,cantidad,eliminar,empezarNuevaLista};
