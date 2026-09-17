const { query } = require('./db');
let esquemaAsegurado = false;
let promesaEsquema = null;
const texto = (v) => String(v ?? '').trim();

async function asegurarEsquemaProductosProvisionales(){
  if(esquemaAsegurado) return;
  if(promesaEsquema) return promesaEsquema;
  promesaEsquema=(async()=>{
    await query(`CREATE TABLE IF NOT EXISTS provisional_products(
      provisional_pk BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      provisional_article TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      master_article TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reconciled_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS provisional_products_status_idx ON provisional_products(status)`);
    esquemaAsegurado=true;
  })();
  try{await promesaEsquema;}finally{promesaEsquema=null;}
}
function fila(r){return {codigo:texto(r.code),articulo:texto(r.provisional_article),rubro:texto(r.category),estado:texto(r.status),articuloMaestro:texto(r.master_article),creado:r.created_at,conciliado:r.reconciled_at};}
async function buscarProductoProvisionalDb(codigo){await asegurarEsquemaProductosProvisionales();const r=await query(`SELECT * FROM provisional_products WHERE code=$1 AND status='pending' LIMIT 1`,[texto(codigo)]);return r.rows[0]?fila(r.rows[0]):null;}
async function listarProductosProvisionalesPendientesDb(){await asegurarEsquemaProductosProvisionales();const r=await query(`SELECT * FROM provisional_products WHERE status='pending' ORDER BY created_at DESC`);return r.rows.map(fila);}
async function crearProductoProvisionalDb(data){
  await asegurarEsquemaProductosProvisionales();
  const codigo=texto(data.codigo), articulo=texto(data.articulo), rubro=texto(data.rubro), usuario=texto(data.usuario);
  const r=await query(`INSERT INTO provisional_products(code,provisional_article,category,status,created_by)
    VALUES($1,$2,$3,'pending',$4)
    ON CONFLICT(code) DO UPDATE SET
      provisional_article=CASE WHEN provisional_products.status='pending' THEN EXCLUDED.provisional_article ELSE provisional_products.provisional_article END,
      category=CASE WHEN provisional_products.status='pending' THEN EXCLUDED.category ELSE provisional_products.category END,
      updated_at=NOW()
    RETURNING *`,[codigo,articulo,rubro,usuario]);
  return fila(r.rows[0]);
}
async function conciliarProductosProvisionalesDb(catalogo,cliente){
  await asegurarEsquemaProductosProvisionales();
  const filas=(catalogo||[]).map(p=>({code:texto(p.codigo),article:texto(p.articulo)})).filter(p=>p.code&&p.article);
  if(!filas.length) return 0;
  const r=await cliente.query(`WITH maestros AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(code TEXT, article TEXT))
    UPDATE provisional_products p SET status='reconciled',master_article=m.article,reconciled_at=NOW(),updated_at=NOW()
    FROM maestros m WHERE p.code=m.code AND p.status='pending' RETURNING p.provisional_pk`,[JSON.stringify(filas)]);
  return r.rowCount||0;
}
module.exports={asegurarEsquemaProductosProvisionales,buscarProductoProvisionalDb,listarProductosProvisionalesPendientesDb,crearProductoProvisionalDb,conciliarProductosProvisionalesDb};
