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
    await query(`CREATE TABLE IF NOT EXISTS lot_alerts(
      alert_pk BIGSERIAL PRIMARY KEY,
      alert_id TEXT NOT NULL UNIQUE,
      lot_id TEXT NOT NULL REFERENCES lot_records(lot_id) ON DELETE CASCADE,
      user_key TEXT NOT NULL DEFAULT '',
      notify_date TEXT NOT NULL DEFAULT '',
      sent_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(lot_id,user_key)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS lot_alerts_due_idx ON lot_alerts(active,notify_date,sent_at)`);
    await query(`CREATE INDEX IF NOT EXISTS lot_alerts_user_idx ON lot_alerts(user_key,active)`);
    // Limpieza conservadora de duplicados históricos generados por una doble
    // petición: solo elimina copias idénticas creadas con hasta 5 segundos de diferencia.
    await query(`WITH repetidos AS (
      SELECT lot_pk, LAG(lot_pk) OVER (PARTITION BY code,article,category,expiry_date,quantity,short_date ORDER BY created_at,lot_pk) AS anterior_pk,
             created_at, LAG(created_at) OVER (PARTITION BY code,article,category,expiry_date,quantity,short_date ORDER BY created_at,lot_pk) AS anterior_fecha
      FROM lot_records
    )
    DELETE FROM lot_records l USING repetidos r
    WHERE l.lot_pk=r.lot_pk AND r.anterior_pk IS NOT NULL
      AND r.created_at-r.anterior_fecha <= INTERVAL '5 seconds'`);
    esquemaAsegurado=true;
  })();
  try{await promesaEsquema;}finally{promesaEsquema=null;}
}
async function tx(cb){const c=await obtenerPool().connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[BLOQUEO]);const r=await cb(c);await c.query('COMMIT');return r;}catch(e){try{await c.query('ROLLBACK')}catch(_){}throw e;}finally{c.release();}}
function fila(r){return {id:texto(r.lot_id),codigo:texto(r.code),articulo:texto(r.article),rubro:texto(r.category),vencimiento:texto(r.expiry_date),cantidad:Number(r.quantity)||0,cortaFecha:Boolean(r.short_date),creado:r.created_at,actualizado:r.updated_at};}
async function listarLotesDb(){await asegurarEsquemaLotes();const r=await query(`SELECT * FROM lot_records ORDER BY updated_at DESC, lot_pk DESC`);return r.rows.map(fila);}
async function listarLotesProductoDb(codigo,c=null){await asegurarEsquemaLotes();const exec=c?c.query.bind(c):query;const r=await exec(`SELECT * FROM lot_records WHERE code=$1 ORDER BY expiry_date, lot_pk`,[texto(codigo)]);return r.rows.map(fila);}
async function crearLoteDb(data){
  await asegurarEsquemaLotes();
  return tx(async c=>{
    const codigo=texto(data.codigo), articulo=texto(data.articulo), rubro=texto(data.rubro), vencimiento=texto(data.vencimiento), cantidad=entero(data.cantidad), cortaFecha=Boolean(data.cortaFecha);

    // Protección de idempotencia ante doble tap/doble petición: bajo el mismo
    // advisory lock, una repetición idéntica e inmediata devuelve el lote ya creado.
    // La ventana es deliberadamente corta para no impedir una carga real posterior.
    const repetido=await c.query(`SELECT * FROM lot_records
      WHERE code=$1 AND article=$2 AND category=$3 AND expiry_date=$4
        AND quantity=$5 AND short_date=$6
        AND created_at >= NOW() - INTERVAL '5 seconds'
      ORDER BY lot_pk DESC LIMIT 1`,[codigo,articulo,rubro,vencimiento,cantidad,cortaFecha]);
    if(repetido.rowCount) return fila(repetido.rows[0]);

    const r=await c.query(`INSERT INTO lot_records(lot_id,code,article,category,expiry_date,quantity,short_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[texto(data.id),codigo,articulo,rubro,vencimiento,cantidad,cortaFecha]);
    return fila(r.rows[0]);
  });
}
async function reemplazarLoteDb(id,data){await asegurarEsquemaLotes();return tx(async c=>{const actual=await c.query(`SELECT * FROM lot_records WHERE lot_id=$1 FOR UPDATE`,[texto(id)]);if(!actual.rowCount)return null;const a=fila(actual.rows[0]);const r=await c.query(`UPDATE lot_records SET expiry_date=$1,quantity=$2,short_date=$3,article=$4,category=$5,updated_at=NOW() WHERE lot_id=$6 RETURNING *`,[texto(data.vencimiento),entero(data.cantidad),Boolean(data.cortaFecha),texto(data.articulo)||a.articulo,texto(data.rubro)||a.rubro,texto(id)]);return fila(r.rows[0]);});}
async function eliminarLoteDb(id){await asegurarEsquemaLotes();return tx(async c=>{const r=await c.query(`DELETE FROM lot_records WHERE lot_id=$1 RETURNING *`,[texto(id)]);return r.rows[0]?fila(r.rows[0]):null;});}
async function eliminarLotesProductoDb(codigo){await asegurarEsquemaLotes();return tx(async c=>{const r=await c.query(`DELETE FROM lot_records WHERE code=$1 RETURNING *`,[texto(codigo)]);return r.rows.map(fila);});}

function filaAlerta(r){return {id:texto(r.alert_id),loteId:texto(r.lot_id),usuario:texto(r.user_key),fechaAviso:texto(r.notify_date),enviada:Boolean(r.sent_at),activa:Boolean(r.active),vencimiento:texto(r.expiry_date),cantidad:Number(r.quantity)||0,articulo:texto(r.article),codigo:texto(r.code)};}
async function listarAlertasProductoDb(codigo,usuario){await asegurarEsquemaLotes();const r=await query(`SELECT a.*,l.code,l.article,l.expiry_date,l.quantity FROM lot_alerts a JOIN lot_records l ON l.lot_id=a.lot_id WHERE l.code=$1 AND a.user_key=$2 AND a.active=TRUE ORDER BY l.expiry_date,a.notify_date`,[texto(codigo),texto(usuario).toLowerCase()]);return r.rows.map(filaAlerta);}
async function guardarAlertaLoteDb({id,loteId,usuario,fechaAviso}){await asegurarEsquemaLotes();const r=await query(`INSERT INTO lot_alerts(alert_id,lot_id,user_key,notify_date,sent_at,active,updated_at) VALUES($1,$2,$3,$4,NULL,TRUE,NOW()) ON CONFLICT(lot_id,user_key) DO UPDATE SET notify_date=EXCLUDED.notify_date,sent_at=NULL,active=TRUE,updated_at=NOW() RETURNING *`,[texto(id),texto(loteId),texto(usuario).toLowerCase(),texto(fechaAviso)]);return filaAlerta(r.rows[0]);}
async function cancelarAlertaLoteDb(loteId,usuario){await asegurarEsquemaLotes();const r=await query(`UPDATE lot_alerts SET active=FALSE,updated_at=NOW() WHERE lot_id=$1 AND user_key=$2 AND active=TRUE RETURNING *`,[texto(loteId),texto(usuario).toLowerCase()]);return r.rowCount>0;}
async function listarAlertasVencidasDb(hoy){await asegurarEsquemaLotes();const r=await query(`SELECT a.*,l.code,l.article,l.expiry_date,l.quantity FROM lot_alerts a JOIN lot_records l ON l.lot_id=a.lot_id WHERE a.active=TRUE AND a.sent_at IS NULL AND a.notify_date <= $1 ORDER BY a.notify_date,a.alert_pk`,[texto(hoy)]);return r.rows.map(filaAlerta);}
async function marcarAlertaEnviadaDb(id){await asegurarEsquemaLotes();await query(`UPDATE lot_alerts SET sent_at=NOW(),active=FALSE,updated_at=NOW() WHERE alert_id=$1 AND sent_at IS NULL`,[texto(id)]);}

module.exports={asegurarEsquemaLotes,listarLotesDb,listarLotesProductoDb,crearLoteDb,reemplazarLoteDb,eliminarLoteDb,eliminarLotesProductoDb,listarAlertasProductoDb,guardarAlertaLoteDb,cancelarAlertaLoteDb,listarAlertasVencidasDb,marcarAlertaEnviadaDb};
