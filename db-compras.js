const { query } = require('./db');
let esquemaAsegurado = false;
let promesaEsquema = null;
const texto = v => String(v ?? '').trim();

async function asegurarEsquemaCompras(){
  if(esquemaAsegurado) return;
  if(promesaEsquema) return promesaEsquema;
  promesaEsquema=(async()=>{
    await query(`CREATE TABLE IF NOT EXISTS purchase_invoices(
      invoice_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS purchase_suppliers(
      supplier_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS purchase_invoices_updated_idx ON purchase_invoices(updated_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS purchase_suppliers_updated_idx ON purchase_suppliers(updated_at DESC)`);
    esquemaAsegurado=true;
  })();
  try{await promesaEsquema;}finally{promesaEsquema=null;}
}

async function listarFacturasComprasDb(){
  await asegurarEsquemaCompras();
  const r=await query(`SELECT payload FROM purchase_invoices ORDER BY COALESCE(payload->>'creadoEn',payload->>'fecha','') DESC, updated_at DESC`);
  return r.rows.map(x=>x.payload||{});
}
async function guardarFacturaCompraDb(factura){
  await asegurarEsquemaCompras();
  const id=texto(factura?.id); if(!id) throw new Error('La factura no tiene identificador');
  await query(`INSERT INTO purchase_invoices(invoice_id,payload) VALUES($1,$2::jsonb)
    ON CONFLICT(invoice_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[id,JSON.stringify(factura)]);
}
async function eliminarFacturaCompraDb(id){
  await asegurarEsquemaCompras();
  const r=await query(`DELETE FROM purchase_invoices WHERE invoice_id=$1`,[texto(id)]); return r.rowCount>0;
}
async function listarProveedoresComprasDb(){
  await asegurarEsquemaCompras();
  const r=await query(`SELECT payload FROM purchase_suppliers ORDER BY COALESCE(payload->>'codigo',''), updated_at`);
  return r.rows.map(x=>x.payload||{});
}
async function guardarProveedorCompraDb(proveedor){
  await asegurarEsquemaCompras();
  const id=texto(proveedor?.id); if(!id) throw new Error('El proveedor no tiene identificador');
  await query(`INSERT INTO purchase_suppliers(supplier_id,payload) VALUES($1,$2::jsonb)
    ON CONFLICT(supplier_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[id,JSON.stringify(proveedor)]);
}
async function migrarComprasDb({facturas=[],proveedores=[]}={}){
  await asegurarEsquemaCompras();
  await query('BEGIN');
  try{
    for(const f of facturas){const id=texto(f?.id);if(id)await query(`INSERT INTO purchase_invoices(invoice_id,payload) VALUES($1,$2::jsonb) ON CONFLICT(invoice_id) DO NOTHING`,[id,JSON.stringify(f)]);}
    for(const p of proveedores){const id=texto(p?.id);if(id)await query(`INSERT INTO purchase_suppliers(supplier_id,payload) VALUES($1,$2::jsonb) ON CONFLICT(supplier_id) DO NOTHING`,[id,JSON.stringify(p)]);}
    await query('COMMIT');
  }catch(error){await query('ROLLBACK');throw error;}
}
module.exports={asegurarEsquemaCompras,listarFacturasComprasDb,guardarFacturaCompraDb,eliminarFacturaCompraDb,listarProveedoresComprasDb,guardarProveedorCompraDb,migrarComprasDb};
