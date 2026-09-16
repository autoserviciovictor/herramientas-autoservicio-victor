const { query, obtenerPool } = require('./db');
let esquemaAsegurado = false;
let promesaEsquema = null;
const BLOQUEO = 'autoservicio-victor:lotes';
const texto = (v) => String(v ?? '').trim();
const entero = (v) => { const n=Number(v); return Number.isInteger(n)&&n>=0?n:0; };

async function asegurarEsquemaLotes(){
  if(esquemaAsegurado) return;
  if(promesaEsquema) return promesaEsquema;
  promesaEsquema=(async()=>{
    await query(`CREATE TABLE IF NOT EXISTS lot_records(
      lot_pk BIGSERIAL PRIMARY KEY,
      lot_id TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL DEFAULT '',
      article TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      expiry_date TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      short_date BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS lot_records_code_idx ON lot_records(code)`);
    await query(`CREATE INDEX IF NOT EXISTS lot_records_expiry_idx ON lot_records(expiry_date)`);
    await query(`CREATE INDEX IF NOT EXISTS lot_records_category_idx ON lot_records(category)`);
    esquemaAsegurado=true;
  })();
  try{await promesaEsquema;}finally{promesaEsquema=null;}
}
async function tx(cb){const c=await obtenerPool().connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[BLOQUEO]);const r=await cb(c);await c.query('COMMIT');return r;}catch(e){try{await c.query('ROLLBACK')}catch(_){}throw e;}finally{c.release();}}
function fila(r){return {id:texto(r.lot_id),codigo:texto(r.code),articulo:texto(r.article),rubro:texto(r.category),vencimiento:texto(r.expiry_date),cantidad:Number(r.quantity)||0,cortaFecha:Boolean(r.short_date),creado:r.created_at,actualizado:r.updated_at};}
async function listarLotesDb(){await asegurarEsquemaLotes();const r=await query(`SELECT * FROM lot_records ORDER BY updated_at DESC, lot_pk DESC`);return r.rows.map(fila);}
async function listarLotesProductoDb(codigo,c=null){await asegurarEsquemaLotes();const exec=c?c.query.bind(c):query;const r=await exec(`SELECT * FROM lot_records WHERE code=$1 ORDER BY expiry_date, lot_pk`,[texto(codigo)]);return r.rows.map(fila);}
async function crearLoteDb(data){await asegurarEsquemaLotes();return tx(async c=>{const r=await c.query(`INSERT INTO lot_records(lot_id,code,article,category,expiry_date,quantity,short_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[texto(data.id),texto(data.codigo),texto(data.articulo),texto(data.rubro),texto(data.vencimiento),entero(data.cantidad),Boolean(data.cortaFecha)]);return fila(r.rows[0]);});}
async function reemplazarLoteDb(id,data){await asegurarEsquemaLotes();return tx(async c=>{const actual=await c.query(`SELECT * FROM lot_records WHERE lot_id=$1 FOR UPDATE`,[texto(id)]);if(!actual.rowCount)return null;const a=fila(actual.rows[0]);const r=await c.query(`UPDATE lot_records SET expiry_date=$1,quantity=$2,short_date=$3,article=$4,category=$5,updated_at=NOW() WHERE lot_id=$6 RETURNING *`,[texto(data.vencimiento),entero(data.cantidad),Boolean(data.cortaFecha),texto(data.articulo)||a.articulo,texto(data.rubro)||a.rubro,texto(id)]);return fila(r.rows[0]);});}
module.exports={asegurarEsquemaLotes,listarLotesDb,listarLotesProductoDb,crearLoteDb,reemplazarLoteDb};
