'use strict';
const { query } = require('./db');
const COLECCIONES = new Set(['proveedores', 'pedidos', 'cronograma', 'colores']);
async function asegurar() {
  await query(`CREATE TABLE IF NOT EXISTS proveedores_estado_compartido (
    coleccion TEXT PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0,
    registros JSONB NOT NULL DEFAULT '[]'::jsonb,
    actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado_por TEXT NOT NULL DEFAULT ''
  )`);
}
async function obtener(coleccion) {
  if (!COLECCIONES.has(coleccion)) throw new Error('Colección inválida');
  await asegurar();
  const { rows } = await query('SELECT revision, registros FROM proveedores_estado_compartido WHERE coleccion=$1', [coleccion]);
  return rows[0] ? { revision: Number(rows[0].revision), registros: rows[0].registros } : { revision: 0, registros: [] };
}
async function reemplazar(coleccion, revision, registros, usuario) {
  if (!COLECCIONES.has(coleccion) || !Array.isArray(registros) || registros.length > 12000 ||
      !Number.isSafeInteger(revision) || revision < 0) throw new Error('Datos inválidos');
  const payload = JSON.stringify(registros);
  if (payload.length > 4_000_000) throw new Error('Colección demasiado grande');
  await asegurar();
  // Compare-and-swap: evita que dos dispositivos se sobrescriban sin advertencia.
  // Primero actualizar con revisión coincidente. INSERT ... SELECT WHERE revision=0
  // no ejecutaba ON CONFLICT para revisiones >0 y provocaba falsos conflictos.
  const { rows } = await query(`WITH actualizado AS (
    UPDATE proveedores_estado_compartido
    SET revision=revision+1, registros=$3::jsonb,
        actualizado=NOW(), actualizado_por=$4
    WHERE coleccion=$1 AND revision=$2
    RETURNING revision
  ), insertado AS (
    INSERT INTO proveedores_estado_compartido (coleccion,revision,registros,actualizado_por)
    SELECT $1,1,$3::jsonb,$4 WHERE $2=0 AND NOT EXISTS (SELECT 1 FROM actualizado)
    ON CONFLICT (coleccion) DO NOTHING
    RETURNING revision
  ) SELECT revision FROM actualizado UNION ALL SELECT revision FROM insertado`,
    [coleccion, revision, payload, usuario]);
  return rows.length ? { ok: true, revision: Number(rows[0].revision) } : { ok: false, conflicto: true };
}
module.exports = { asegurar, obtener, reemplazar };
