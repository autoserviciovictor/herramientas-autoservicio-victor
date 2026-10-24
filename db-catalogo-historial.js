const { query } = require('./db');
let listo = false;
let iniciando = null;
async function asegurarHistorialCatalogo() {
  if (listo) return;
  if (iniciando) return iniciando;
  iniciando = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS catalog_audit_log (
      id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL DEFAULT '', nombre TEXT NOT NULL DEFAULT '',
      accion TEXT NOT NULL, origen TEXT NOT NULL DEFAULT 'Sistema', usuario TEXT NOT NULL DEFAULT 'Sistema',
      anterior JSONB, nuevo JSONB, detalle TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_audit_log_recent_idx ON catalog_audit_log(created_at DESC, id DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS catalog_audit_log_code_idx ON catalog_audit_log(code, created_at DESC)`);
    await query(`CREATE OR REPLACE FUNCTION registrar_cambio_catalogo() RETURNS trigger AS $$
      DECLARE previo JSONB; actual JSONB; clave TEXT; titulo TEXT; campo TEXT; clase TEXT;
      BEGIN
        clave := CASE WHEN TG_TABLE_NAME='product_catalog' THEN NEW.code ELSE NEW.code END;
        SELECT article INTO titulo FROM product_catalog WHERE code=clave ORDER BY catalog_id LIMIT 1;
        IF TG_TABLE_NAME='product_catalog' THEN
          IF TG_OP='INSERT' THEN RETURN NEW; END IF;
          previo := jsonb_build_object('nombre', OLD.article, 'precio', OLD.price, 'stock', OLD.stock);
          actual := jsonb_build_object('nombre', NEW.article, 'precio', NEW.price, 'stock', NEW.stock);
        ELSE
          previo := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE jsonb_build_object(
            'visible', OLD.visible, 'rubro', OLD.category_id, 'subrubro', OLD.subcategory_id,
            'marca', OLD.brand, 'presentacion', OLD.presentation, 'unidad', OLD.sale_unit,
            'destacado', OLD.featured, 'precioOferta', OLD.offer_price, 'imagen', OLD.image_status) END;
          actual := jsonb_build_object(
            'visible', NEW.visible, 'rubro', NEW.category_id, 'subrubro', NEW.subcategory_id,
            'marca', NEW.brand, 'presentacion', NEW.presentation, 'unidad', NEW.sale_unit,
            'destacado', NEW.featured, 'precioOferta', NEW.offer_price, 'imagen', NEW.image_status);
        END IF;
        IF previo = actual THEN RETURN NEW; END IF;
        FOR campo IN SELECT jsonb_object_keys(actual) LOOP
          IF (previo->campo) IS DISTINCT FROM (actual->campo) THEN
            clase := CASE WHEN campo='visible' THEN CASE WHEN actual->>'visible'='true' THEN 'Publicado' ELSE 'Ocultado' END
              WHEN campo='precio' THEN 'Precio actualizado' WHEN campo='stock' THEN 'Stock actualizado'
              WHEN campo='imagen' THEN 'Imagen modificada' WHEN campo='subrubro' THEN 'Subrubro modificado'
              ELSE 'Producto modificado' END;
            INSERT INTO catalog_audit_log(code,nombre,accion,origen,usuario,anterior,nuevo,detalle)
            VALUES (clave, COALESCE(titulo,clave), clase, 'Cambio en base de datos', 'Sistema',
              jsonb_build_object(campo,previo->campo),jsonb_build_object(campo,actual->campo),campo);
          END IF;
        END LOOP;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await query(`DROP TRIGGER IF EXISTS catalog_settings_audit_trg ON catalog_product_settings`);
    await query(`CREATE TRIGGER catalog_settings_audit_trg AFTER INSERT OR UPDATE ON catalog_product_settings
      FOR EACH ROW EXECUTE FUNCTION registrar_cambio_catalogo()`);
    await query(`DROP TRIGGER IF EXISTS catalog_product_audit_trg ON product_catalog`);
    await query(`CREATE TRIGGER catalog_product_audit_trg AFTER INSERT OR UPDATE ON product_catalog
      FOR EACH ROW EXECUTE FUNCTION registrar_cambio_catalogo()`);
    listo = true;
  })();
  try { await iniciando; } finally { iniciando = null; }
}
async function listarHistorialCatalogo({ pagina=1, q='', accion='', desde='', hasta='' }={}) {
  await asegurarHistorialCatalogo();
  const pag = Math.max(1, Number.parseInt(pagina,10)||1);
  const busqueda = String(q||'').slice(0,120);
  const tipo = String(accion||'').slice(0,60);
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : null;
  const fin = /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? hasta : null;
  const args = [busqueda,tipo,`%${busqueda}%`,inicio,fin];
  const condicion = `WHERE NOT (LOWER(TRIM(accion))='edición manual' AND LOWER(TRIM(detalle)) LIKE 'datos del producto guardados%') AND ($1='' OR code ILIKE $3 OR nombre ILIKE $3 OR usuario ILIKE $3) AND ($2='' OR accion=$2) AND ($4::date IS NULL OR created_at >= $4::date) AND ($5::date IS NULL OR created_at < $5::date + interval '1 day')`;
  const [resumen, filas] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE accion='Publicado')::int AS publicados,
      COUNT(*) FILTER (WHERE accion='Ocultado')::int AS ocultados,
      COUNT(*) FILTER (WHERE accion IN ('Edición manual','Producto modificado','Stock actualizado','Subrubro modificado'))::int AS modificaciones,
      COUNT(*) FILTER (WHERE accion IN ('Precio actualizado','Precio modificado'))::int AS precios,
      COUNT(*) FILTER (WHERE accion='Imagen modificada')::int AS imagenes,
      COUNT(*) FILTER (WHERE accion ILIKE '%importaci%')::int AS importaciones
      FROM catalog_audit_log ${condicion}`,args),
    query(`SELECT id,code,nombre,accion,origen,usuario,anterior,nuevo,detalle,created_at FROM catalog_audit_log ${condicion} ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET $6`,[...args,(pag-1)*10]),
  ]);
  return {total:resumen.rows[0].total,pagina:pag,resumen:resumen.rows[0],movimientos:filas.rows};
}
async function registrarAccionCatalogo({codigo,accion,usuario,origen='Manual',detalle=''}) {
  if (String(accion||'').trim().toLowerCase()==='edición manual' && String(detalle||'').trim().toLowerCase().startsWith('datos del producto guardados')) return;
  await asegurarHistorialCatalogo();
  await query(`INSERT INTO catalog_audit_log(code,nombre,accion,origen,usuario,detalle)
    VALUES($1,COALESCE((SELECT article FROM product_catalog WHERE code=$1 LIMIT 1),$1),$2,$3,$4,$5)`,
    [String(codigo||''),String(accion),String(origen),String(usuario||'Administrador'),String(detalle||'')]);
}
module.exports = { asegurarHistorialCatalogo, listarHistorialCatalogo, registrarAccionCatalogo };
