"use strict";
const { query } = require("./db");

const INICIALES = [
  "Recordá mantener el orden en los sectores.",
  "Revisá las tareas asignadas para hoy.",
];

async function asegurarNovedadesInicio() {
  await query(`CREATE TABLE IF NOT EXISTS novedades_inicio (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    mensajes JSONB NOT NULL DEFAULT '[]'::jsonb,
    actualizado_por TEXT NOT NULL DEFAULT '',
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`INSERT INTO novedades_inicio (id, mensajes) VALUES (1, $1::jsonb)
    ON CONFLICT (id) DO NOTHING`, [JSON.stringify(INICIALES)]);
}

async function leerNovedadesInicio() {
  await asegurarNovedadesInicio();
  const resultado = await query("SELECT mensajes FROM novedades_inicio WHERE id = 1");
  return Array.isArray(resultado.rows[0]?.mensajes) ? resultado.rows[0].mensajes : [];
}

async function guardarNovedadesInicio(mensajes, usuario) {
  await asegurarNovedadesInicio();
  await query(`UPDATE novedades_inicio SET mensajes = $1::jsonb, actualizado_por = $2,
    actualizado_en = NOW() WHERE id = 1`, [JSON.stringify(mensajes), usuario]);
}

module.exports = { leerNovedadesInicio, guardarNovedadesInicio };
