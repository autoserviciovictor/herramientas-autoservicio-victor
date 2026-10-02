const { query } = require('./db');
let esquemaAsegurado = false;
let promesaEsquema = null;

const texto = (v) => String(v ?? '').trim();

async function asegurarEsquemaLiquidacionHoras(){
  if(esquemaAsegurado) return;
  if(promesaEsquema) return promesaEsquema;
  promesaEsquema=(async()=>{
    await query(`CREATE TABLE IF NOT EXISTS payroll_hour_periods(
      period_pk BIGSERIAL PRIMARY KEY,
      period_id TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      saved_by TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`ALTER TABLE payroll_hour_periods ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE payroll_hour_periods ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE payroll_hour_periods ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await query(`UPDATE payroll_hour_periods SET created_by=saved_by WHERE created_by='' AND saved_by<>''`);
    await query(`UPDATE payroll_hour_periods SET updated_by=COALESCE(NULLIF(updated_by,''),NULLIF(saved_by,''),created_by), updated_at=COALESCE(updated_at,created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS payroll_hour_periods_dates_idx ON payroll_hour_periods(start_date DESC,end_date DESC,created_at DESC)`);
    esquemaAsegurado=true;
  })();
  try{await promesaEsquema;}finally{promesaEsquema=null;}
}

function fila(r){return {id:texto(r.period_id),desde:texto(r.start_date),hasta:texto(r.end_date),archivo:texto(r.file_name),guardadoPor:texto(r.saved_by),guardadoEn:r.created_at,creadoPor:texto(r.created_by||r.saved_by),creadoEn:r.created_at,editadoPor:texto(r.updated_by||r.saved_by),editadoEn:r.updated_at||r.created_at,snapshot:r.snapshot||{}};}

async function guardarPeriodoLiquidacionDb({id,desde,hasta,archivo,guardadoPor,snapshot}){
  await asegurarEsquemaLiquidacionHoras();
  const r=await query(`INSERT INTO payroll_hour_periods(period_id,start_date,end_date,file_name,saved_by,created_by,updated_by,snapshot)
    VALUES($1,$2,$3,$4,$5,$5,$5,$6::jsonb) RETURNING *`,[texto(id),texto(desde),texto(hasta),texto(archivo),texto(guardadoPor),JSON.stringify(snapshot||{})]);
  return fila(r.rows[0]);
}

async function actualizarPeriodoLiquidacionDb({id,desde,hasta,archivo,editadoPor,snapshot}){
  await asegurarEsquemaLiquidacionHoras();
  const r=await query(`UPDATE payroll_hour_periods SET start_date=$2,end_date=$3,file_name=$4,snapshot=$5::jsonb,updated_by=$6,updated_at=NOW() WHERE period_id=$1 RETURNING *`,[texto(id),texto(desde),texto(hasta),texto(archivo),JSON.stringify(snapshot||{}),texto(editadoPor)]);
  return r.rows[0]?fila(r.rows[0]):null;
}
async function listarPeriodosLiquidacionDb(){
  await asegurarEsquemaLiquidacionHoras();
  const r=await query(`SELECT period_id,start_date,end_date,file_name,saved_by,created_by,updated_by,created_at,updated_at,'{}'::jsonb AS snapshot FROM payroll_hour_periods ORDER BY start_date DESC,end_date DESC,created_at DESC`);
  return r.rows.map(fila);
}
async function eliminarPeriodoLiquidacionDb(id){
  await asegurarEsquemaLiquidacionHoras();
  const r=await query(`DELETE FROM payroll_hour_periods WHERE period_id=$1 RETURNING period_id`,[texto(id)]);
  return r.rowCount>0;
}
async function obtenerPeriodoLiquidacionDb(id){
  await asegurarEsquemaLiquidacionHoras();
  const r=await query(`SELECT * FROM payroll_hour_periods WHERE period_id=$1 LIMIT 1`,[texto(id)]);
  return r.rows[0]?fila(r.rows[0]):null;
}
module.exports={asegurarEsquemaLiquidacionHoras,guardarPeriodoLiquidacionDb,actualizarPeriodoLiquidacionDb,listarPeriodosLiquidacionDb,obtenerPeriodoLiquidacionDb,eliminarPeriodoLiquidacionDb};
