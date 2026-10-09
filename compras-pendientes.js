// Cola persistente de comprobantes por revisar. No registra compras automáticamente.
const crypto = require('crypto');
const { query } = require('./db');

function instalarColaFacturas({app, requerirAdministrador, analizarFacturaRequest}) {
  let esquema = null;
  const asegurar = () => esquema ||= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS purchase_invoice_queue (
      id TEXT PRIMARY KEY, file_hash TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
      tipo TEXT NOT NULL, base64 TEXT, texto_pdf TEXT, factura JSONB,
      estado TEXT NOT NULL DEFAULT 'en_cola', error TEXT,
      creado TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS purchase_invoice_queue_estado_idx ON purchase_invoice_queue(estado,creado)`);
    // Un trabajo interrumpido por reinicio vuelve a la cola.
    await query(`UPDATE purchase_invoice_queue SET estado='en_cola', actualizado=NOW() WHERE estado='procesando'`);
  })().catch(e => {esquema=null;throw e;});
  const json = require('express').json({limit:'24mb'});
  const errores = (res,e) => res.status(500).json({ok:false,mensaje:e.message||'Error en la bandeja'});
  app.get('/admin/compras/pendientes',requerirAdministrador,async(req,res)=>{
    try{await asegurar();const r=await query(`SELECT id,nombre,estado,error,factura,creado,actualizado FROM purchase_invoice_queue ORDER BY creado ASC LIMIT 300`);res.json({ok:true,pendientes:r.rows});}
    catch(e){errores(res,e);}
  });
  app.post('/admin/compras/pendientes',requerirAdministrador,json,async(req,res)=>{
    try{
      await asegurar();const {nombre,tipo,base64,textoPdf}=req.body||{};
      if(!['application/pdf','image/jpeg','image/png'].includes(tipo)||typeof base64!=='string'||!base64||base64.length>20_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return res.status(400).json({mensaje:'Archivo no admitido o demasiado grande'});
      const cantidad=await query(`SELECT COUNT(*)::int AS total FROM purchase_invoice_queue WHERE estado IN ('en_cola','procesando')`);
      if(cantidad.rows[0].total>=100)return res.status(429).json({mensaje:'La cola tiene 100 archivos en espera. Esperá a que termine el análisis.'});
      const hash=crypto.createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex');
      const id=crypto.randomUUID();
      const r=await query(`INSERT INTO purchase_invoice_queue(id,file_hash,nombre,tipo,base64,texto_pdf) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(file_hash) DO NOTHING RETURNING id`,[id,hash,String(nombre||'factura').slice(0,200),tipo,base64,typeof textoPdf==='string'?textoPdf.slice(0,55000):'']);
      if(!r.rowCount)return res.status(409).json({mensaje:'Este archivo ya está en la bandeja de pendientes.'});
      res.status(201).json({ok:true,id});
      void procesar();
    }catch(e){errores(res,e);}
  });
  // La imagen original solo se entrega a administradores al abrir un pendiente.
  // No se incluye en el listado, para evitar transferir archivos grandes en cada actualización.
  app.get('/admin/compras/pendientes/:id/archivo',requerirAdministrador,async(req,res)=>{
    try{
      await asegurar();
      const r=await query(`SELECT tipo,base64,nombre FROM purchase_invoice_queue WHERE id=$1 AND estado='listo'`,[req.params.id]);
      if(!r.rowCount)return res.status(404).json({mensaje:'Factura pendiente no encontrada'});
      const archivo=r.rows[0];
      if(!archivo.base64)return res.status(410).json({mensaje:'El archivo original no está disponible para este pendiente. Volvé a importarlo si necesitás verlo.'});
      res.set('Cache-Control','no-store');
      res.set('Content-Disposition','inline; filename="comprobante"');
      res.type(archivo.tipo);
      return res.send(Buffer.from(archivo.base64,'base64'));
    }catch(e){errores(res,e);}
  });
  app.delete('/admin/compras/pendientes/:id',requerirAdministrador,async(req,res)=>{
    try{await asegurar();const r=await query(`DELETE FROM purchase_invoice_queue WHERE id=$1 AND estado<>'procesando'`,[req.params.id]);if(!r.rowCount)return res.status(409).json({mensaje:'No se puede quitar una factura mientras se está analizando.'});res.json({ok:true});}
    catch(e){errores(res,e);}
  });
  app.post('/admin/compras/pendientes/:id/reintentar',requerirAdministrador,async(req,res)=>{
    try{await asegurar();const r=await query(`UPDATE purchase_invoice_queue SET estado='en_cola',error=NULL,actualizado=NOW() WHERE id=$1 AND estado='error' AND base64 IS NOT NULL RETURNING id`,[req.params.id]);if(!r.rowCount)return res.status(409).json({mensaje:'No se puede reintentar este archivo.'});res.json({ok:true});void procesar();}
    catch(e){errores(res,e);}
  });
  let ocupados=0;
  async function procesar(){
    if(ocupados>=2)return;
    ocupados++;
    try{
      await asegurar();
      while(true){
        // Claim atómico: evita procesar dos veces un comprobante.
        const r=await query(`UPDATE purchase_invoice_queue SET estado='procesando',actualizado=NOW() WHERE id=(SELECT id FROM purchase_invoice_queue WHERE estado='en_cola' ORDER BY creado FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,nombre,tipo,base64,texto_pdf`);
        if(!r.rowCount)break;
        const item=r.rows[0];
        try{
          const resultado=await new Promise((resolve,reject)=>{
            let status=200;
            const res={status(n){status=n;return this;},json(data){if(status>=400||!data?.ok)reject(new Error(data?.error||data?.mensaje||'Error de lectura'));else resolve(data);return this;}};
            Promise.resolve(analizarFacturaRequest({body:{nombre:item.nombre,tipo:item.tipo,base64:item.base64,textoPdf:item.texto_pdf}},res)).catch(reject);
          });
          await query(`UPDATE purchase_invoice_queue SET estado='listo',factura=$2::jsonb,texto_pdf=NULL,error=NULL,actualizado=NOW() WHERE id=$1`,[item.id,JSON.stringify(resultado.factura)]);
        }catch(e){
          await query(`UPDATE purchase_invoice_queue SET estado='error',error=$2,actualizado=NOW() WHERE id=$1`,[item.id,String(e.message||'Error de lectura').slice(0,500)]).catch(console.error);
        }
      }
    }catch(e){console.error('[Facturas pendientes]',e);}
    finally{ocupados--;}
  }
  // El proceso de fondo continúa después de cerrar el navegador y retoma tras reinicios.
  setInterval(()=>{void procesar();},15000).unref?.();
  void procesar();void procesar();
}
module.exports={instalarColaFacturas};
