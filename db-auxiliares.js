const { query, obtenerPool } = require('./db');

const BLOQUEO_AUXILIARES = 'autoservicio-victor:auxiliares';
let esquemaAsegurado = false;
let promesaEsquema = null;
const texto = (v) => String(v ?? '').trim();

async function asegurarEsquemaAuxiliares() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;
  promesaEsquema = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS admin_activity_log (
      activity_pk BIGSERIAL PRIMARY KEY, event_date TEXT NOT NULL DEFAULT '', event_time TEXT NOT NULL DEFAULT '',
      user_key TEXT NOT NULL DEFAULT '', user_name TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '',
      entity TEXT NOT NULL DEFAULT '', identifier TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS admin_activity_created_idx ON admin_activity_log(activity_pk DESC)`);

    await query(`CREATE TABLE IF NOT EXISTS offline_operations (
      operation_id TEXT NOT NULL, user_key TEXT NOT NULL, event_time TEXT NOT NULL DEFAULT '', method TEXT NOT NULL DEFAULT '',
      route TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'En proceso', response_text TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(operation_id,user_key))`);

    await query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth_key TEXT NOT NULL, user_key TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE, updated_text TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_key,active)`);

    await query(`CREATE TABLE IF NOT EXISTS notification_log (
      notification_pk BIGSERIAL PRIMARY KEY, notification_key TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '',
      record_id TEXT NOT NULL DEFAULT '', code TEXT NOT NULL DEFAULT '', expiry_date TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '')`);
    await query(`CREATE INDEX IF NOT EXISTS notification_log_key_idx ON notification_log(notification_key)`);

    await query(`CREATE TABLE IF NOT EXISTS notification_center (
      notification_id TEXT PRIMARY KEY, user_key TEXT NOT NULL, type TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT './', event_time TEXT NOT NULL DEFAULT '', read_flag BOOLEAN NOT NULL DEFAULT FALSE,
      dedupe_key TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS notification_center_user_idx ON notification_center(user_key,event_time DESC)`);

    await query(`CREATE TABLE IF NOT EXISTS expiration_history (
      history_pk BIGSERIAL PRIMARY KEY, event_date TEXT NOT NULL DEFAULT '', event_time TEXT NOT NULL DEFAULT '',
      user_key TEXT NOT NULL DEFAULT '', user_name TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', record_id TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '', article TEXT NOT NULL DEFAULT '', expiry_date TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '',
      quantity TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS expiration_history_record_idx ON expiration_history(record_id,history_pk)`);
    esquemaAsegurado = true;
  })();
  try { await promesaEsquema; } finally { promesaEsquema = null; }
}

async function conTransaccionAuxiliares(callback) {
  const c = await obtenerPool().connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [BLOQUEO_AUXILIARES]);
    const r = await callback(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { c.release(); }
}

async function importarAuxiliaresAtomico(datos, claveMigracion) {
  await asegurarEsquemaAuxiliares();
  return conTransaccionAuxiliares(async (c) => {
    const ya = await c.query('SELECT 1 FROM app_data_migrations WHERE migration_key=$1', [claveMigracion]);
    if (ya.rowCount) return false;
    const admin = Array.isArray(datos?.admin) ? datos.admin : [];
    const offline = Array.isArray(datos?.offline) ? datos.offline : [];
    const push = Array.isArray(datos?.push) ? datos.push : [];
    const log = Array.isArray(datos?.notificationLog) ? datos.notificationLog : [];
    const centro = Array.isArray(datos?.notificationCenter) ? datos.notificationCenter : [];
    const vencHist = Array.isArray(datos?.expirationHistory) ? datos.expirationHistory : [];
    for (const x of admin) await c.query(`INSERT INTO admin_activity_log(event_date,event_time,user_key,user_name,action,entity,identifier,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [x.fecha||'',x.hora||'',x.usuario||'',x.nombre||'',x.accion||'',x.entidad||'',x.identificador||'',x.detalle||'']);
    for (const x of offline) await c.query(`INSERT INTO offline_operations(operation_id,user_key,event_time,method,route,state,response_text) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [x.id||'',texto(x.usuario).toLowerCase(),x.fecha||'',x.metodo||'',x.ruta||'',x.estado||'En proceso',x.respuesta||'']);
    for (const x of push) if (x.endpoint) await c.query(`INSERT INTO push_subscriptions(endpoint,p256dh,auth_key,user_key,user_name,active,updated_text) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(endpoint) DO NOTHING`, [x.endpoint,x.p256dh||'',x.auth||'',x.usuario||'',x.nombre||'',x.activo!==false,x.actualizado||'']);
    for (const x of log) await c.query(`INSERT INTO notification_log(notification_key,sent_at,type,record_id,code,expiry_date,detail) VALUES($1,$2,$3,$4,$5,$6,$7)`, [x.clave||'',x.fecha||'',x.tipo||'',x.id||'',x.codigo||'',x.vencimiento||'',x.detalle||'']);
    for (const x of centro) if (x.id) await c.query(`INSERT INTO notification_center(notification_id,user_key,type,title,message,url,event_time,read_flag,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(notification_id) DO NOTHING`, [x.id,texto(x.usuario).toLowerCase(),x.tipo||'',x.titulo||'',x.mensaje||'',x.url||'./',x.fecha||'',Boolean(x.leida),x.clave||'']);
    for (const x of vencHist) await c.query(`INSERT INTO expiration_history(event_date,event_time,user_key,user_name,action,record_id,code,article,expiry_date,detail,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [x.fecha||'',x.hora||'',x.usuario||'',x.nombre||'',x.accion||'',x.id||'',x.codigo||'',x.articulo||'',x.vencimiento||'',x.detalle||'',String(x.cantidad??'')]);
    await c.query(`INSERT INTO app_data_migrations(migration_key,details) VALUES($1,$2::jsonb) ON CONFLICT(migration_key) DO NOTHING`, [claveMigracion, JSON.stringify({admin:admin.length,offline:offline.length,push:push.length,notificationLog:log.length,notificationCenter:centro.length,expirationHistory:vencHist.length})]);
    return true;
  });
}

async function registrarActividadAdminDb(x) { await query(`INSERT INTO admin_activity_log(event_date,event_time,user_key,user_name,action,entity,identifier,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [x.fecha||'',x.hora||'',x.usuario||'',x.nombre||'',x.accion||'',x.entidad||'',x.identificador||'',x.detalle||'']); }
async function listarActividadAdminDb(limite=100) { const r=await query(`SELECT event_date,event_time,user_key,user_name,action,entity,identifier,detail FROM admin_activity_log ORDER BY activity_pk DESC LIMIT $1`,[limite]); return r.rows.map(x=>({fecha:x.event_date,hora:x.event_time,usuario:x.user_key,nombre:x.user_name,accion:x.action,entidad:x.entity,identificador:x.identifier,detalle:x.detail})); }

async function buscarOperacionOfflineDb(id, usuario){ const r=await query(`SELECT state,response_text FROM offline_operations WHERE operation_id=$1 AND user_key=$2`,[texto(id),texto(usuario).toLowerCase()]); return r.rows[0]?{estado:r.rows[0].state,respuesta:r.rows[0].response_text}:null; }
async function reservarOperacionOfflineDb(x){ return conTransaccionAuxiliares(async c=>{const r=await c.query(`SELECT state,response_text FROM offline_operations WHERE operation_id=$1 AND user_key=$2 FOR UPDATE`,[texto(x.id),texto(x.usuario).toLowerCase()]); if(r.rows[0]) return {estado:r.rows[0].state,respuesta:r.rows[0].response_text}; await c.query(`INSERT INTO offline_operations(operation_id,user_key,event_time,method,route,state,response_text) VALUES($1,$2,$3,$4,$5,'En proceso','')`,[texto(x.id),texto(x.usuario).toLowerCase(),x.fecha||'',x.metodo||'',x.ruta||'']); return null;}); }
async function finalizarOperacionOfflineDb(id,usuario,estado,respuesta){ await query(`UPDATE offline_operations SET state=$3,response_text=$4,updated_at=NOW() WHERE operation_id=$1 AND user_key=$2`,[texto(id),texto(usuario).toLowerCase(),estado||'',respuesta||'']); }

async function listarSuscripcionesPushDb(){ const r=await query(`SELECT endpoint,p256dh,auth_key,user_key,user_name,active,updated_text FROM push_subscriptions WHERE active=TRUE`); return r.rows.map(x=>({endpoint:x.endpoint,p256dh:x.p256dh,auth:x.auth_key,usuario:x.user_key,nombre:x.user_name,activo:x.active,actualizado:x.updated_text})); }
async function guardarSuscripcionPushDb(x){ await query(`INSERT INTO push_subscriptions(endpoint,p256dh,auth_key,user_key,user_name,active,updated_text) VALUES($1,$2,$3,$4,$5,TRUE,$6) ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth_key=EXCLUDED.auth_key,user_key=EXCLUDED.user_key,user_name=EXCLUDED.user_name,active=TRUE,updated_text=EXCLUDED.updated_text,updated_at=NOW()`,[x.endpoint,x.p256dh,x.auth,x.usuario||'',x.nombre||'',x.actualizado||'']); }
async function desactivarSuscripcionPushDb(endpoint){ await query(`UPDATE push_subscriptions SET active=FALSE,updated_at=NOW() WHERE endpoint=$1`,[endpoint]); }

async function clavesNotificacionesDb(){ const r=await query(`SELECT notification_key,sent_at,type,code,expiry_date FROM notification_log`); const s=new Set(); for(const x of r.rows){if(x.notification_key)s.add(x.notification_key); const f=texto(x.sent_at).slice(0,10); if(x.code&&x.expiry_date&&x.type&&f)s.add([x.code,x.expiry_date,x.type,f].join('|'));} return s; }
async function registrarNotificacionEnviadaDb(x){ await query(`INSERT INTO notification_log(notification_key,sent_at,type,record_id,code,expiry_date,detail) VALUES($1,$2,$3,$4,$5,$6,$7)`,[x.clave||'',x.fecha||'',x.tipo||'',x.id||'',x.codigo||'',x.vencimiento||'',x.detalle||'']); }
async function existeCentroNotificacionDb(id){ const r=await query(`SELECT 1 FROM notification_center WHERE notification_id=$1`,[id]); return Boolean(r.rowCount); }
async function registrarCentroNotificacionDb(x){ await query(`INSERT INTO notification_center(notification_id,user_key,type,title,message,url,event_time,read_flag,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7,FALSE,$8) ON CONFLICT(notification_id) DO NOTHING`,[x.id,texto(x.usuario).toLowerCase(),x.tipo||'',x.titulo||'',x.mensaje||'',x.url||'./',x.fecha||'',x.clave||'']); }
async function listarCentroNotificacionesDb(usuario,limite=10){ const r=await query(`SELECT notification_id,user_key,type,title,message,url,event_time,read_flag FROM notification_center WHERE user_key=$1 ORDER BY event_time DESC,created_at DESC LIMIT $2`,[texto(usuario).toLowerCase(),limite]); return r.rows.map(x=>({id:x.notification_id,usuario:x.user_key,tipo:x.type,titulo:x.title,mensaje:x.message,url:x.url||'./',fecha:x.event_time,leida:x.read_flag})); }
async function marcarCentroNotificacionDb(usuario,id='',todas=false){ const r=await query(todas?`UPDATE notification_center SET read_flag=TRUE WHERE user_key=$1 AND read_flag=FALSE`:`UPDATE notification_center SET read_flag=TRUE WHERE user_key=$1 AND notification_id=$2 AND read_flag=FALSE`, todas?[texto(usuario).toLowerCase()]:[texto(usuario).toLowerCase(),texto(id)]); return r.rowCount; }

async function registrarHistorialVencimientoDb(x){ await query(`INSERT INTO expiration_history(event_date,event_time,user_key,user_name,action,record_id,code,article,expiry_date,detail,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[x.fecha||'',x.hora||'',x.usuario||'',x.nombre||'',x.accion||'',x.id||'',x.codigo||'',x.articulo||'',x.vencimiento||'',x.detalle||'',String(x.cantidad??'')]); }
async function listarHistorialVencimientosDb(){ const r=await query(`SELECT event_date,event_time,user_key,user_name,action,record_id,code,article,expiry_date,detail,quantity FROM expiration_history ORDER BY history_pk DESC`); return r.rows.map(x=>({fecha:x.event_date,hora:x.event_time,usuario:x.user_key,nombre:x.user_name,accion:x.action,id:x.record_id,codigo:x.code,articulo:x.article,vencimiento:x.expiry_date,detalle:x.detail,cantidad:x.quantity})); }

module.exports={BLOQUEO_AUXILIARES,asegurarEsquemaAuxiliares,conTransaccionAuxiliares,importarAuxiliaresAtomico,registrarActividadAdminDb,listarActividadAdminDb,buscarOperacionOfflineDb,reservarOperacionOfflineDb,finalizarOperacionOfflineDb,listarSuscripcionesPushDb,guardarSuscripcionPushDb,desactivarSuscripcionPushDb,clavesNotificacionesDb,registrarNotificacionEnviadaDb,existeCentroNotificacionDb,registrarCentroNotificacionDb,listarCentroNotificacionesDb,marcarCentroNotificacionDb,registrarHistorialVencimientoDb,listarHistorialVencimientosDb};
