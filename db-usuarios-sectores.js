const { query, obtenerPool } = require("./db");

let esquemaAsegurado = false;
let promesaEsquema = null;

async function asegurarEsquemaUsuariosSectores() {
  if (esquemaAsegurado) return;
  if (promesaEsquema) return promesaEsquema;
  promesaEsquema = (async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS sectors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#b72e35',
      supervisor_username TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_text TEXT NOT NULL DEFAULT '',
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      sector_id TEXT NOT NULL DEFAULT '',
      managed_sectors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version >= 1),
      google_email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_email_unique ON users (LOWER(google_email)) WHERE google_email <> ''`);
  await query(`CREATE INDEX IF NOT EXISTS users_sector_idx ON users (sector_id)`);
  await query(`CREATE INDEX IF NOT EXISTS sectors_supervisor_idx ON sectors (supervisor_username)`);
  await query(`
    CREATE TABLE IF NOT EXISTS app_data_migrations (
      migration_key TEXT PRIMARY KEY,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      details JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  esquemaAsegurado = true;
  })();
  try { await promesaEsquema; }
  finally { promesaEsquema = null; }
}

async function migracionDatosCompletada(clave) {
  const r = await query("SELECT 1 FROM app_data_migrations WHERE migration_key = $1", [clave]);
  return r.rowCount > 0;
}


async function listarUsuariosDb() {
  const r = await query(`SELECT username, name, password_hash, role, active, created_text, permissions, sector_id, managed_sectors, session_version, google_email FROM users ORDER BY name, username`);
  return r.rows;
}

async function listarSectoresDb() {
  const r = await query(`SELECT id, name, color, supervisor_username, active FROM sectors ORDER BY name, id`);
  return r.rows;
}

async function guardarUsuarioDb(usuario) {
  await query(`
    INSERT INTO users (username, name, password_hash, role, active, created_text, permissions, sector_id, managed_sectors, session_version, google_email, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::text[],$10,$11,NOW())
    ON CONFLICT (username) DO UPDATE SET
      name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role,
      active=EXCLUDED.active, created_text=EXCLUDED.created_text, permissions=EXCLUDED.permissions,
      sector_id=EXCLUDED.sector_id, managed_sectors=EXCLUDED.managed_sectors,
      session_version=EXCLUDED.session_version, google_email=EXCLUDED.google_email, updated_at=NOW()
  `, [usuario.usuario, usuario.nombre, usuario.passwordHash, usuario.rol, Boolean(usuario.activo), usuario.creado || "", JSON.stringify(usuario.permisos || {}), usuario.sector || "", usuario.sectores || [], Math.max(1, Number(usuario.sessionVersion) || 1), usuario.googleEmail || ""]);
}

async function guardarSectorDb(sector) {
  await query(`
    INSERT INTO sectors (id, name, color, supervisor_username, active, updated_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, color=EXCLUDED.color,
      supervisor_username=EXCLUDED.supervisor_username, active=EXCLUDED.active, updated_at=NOW()
  `, [sector.id, sector.nombre, sector.color, sector.supervisor || "", Boolean(sector.activo)]);
}

async function eliminarUsuarioDb(usuario) { await query("DELETE FROM users WHERE username = $1", [usuario]); }
async function eliminarSectorDb(id) { await query("DELETE FROM sectors WHERE id = $1", [id]); }

async function importarUsuariosSectoresAtomico(sectores, usuarios, claveMigracion) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    for (const s of sectores) {
      await cliente.query(`INSERT INTO sectors (id,name,color,supervisor_username,active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, [s.id,s.nombre,s.color,s.supervisor||"",Boolean(s.activo)]);
    }
    for (const u of usuarios) {
      await cliente.query(`INSERT INTO users (username,name,password_hash,role,active,created_text,permissions,sector_id,managed_sectors,session_version,google_email) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::text[],$10,$11) ON CONFLICT (username) DO NOTHING`, [u.usuario,u.nombre,u.passwordHash,u.rol,Boolean(u.activo),u.creado||"",JSON.stringify(u.permisos||{}),u.sector||"",u.sectores||[],Math.max(1,Number(u.sessionVersion)||1),u.googleEmail||""]);
    }
    await cliente.query(`INSERT INTO app_data_migrations (migration_key, details) VALUES ($1,$2::jsonb) ON CONFLICT (migration_key) DO NOTHING`, [claveMigracion, JSON.stringify({ usuarios: usuarios.length, sectores: sectores.length })]);
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally { cliente.release(); }
}

module.exports = { asegurarEsquemaUsuariosSectores, migracionDatosCompletada, listarUsuariosDb, listarSectoresDb, guardarUsuarioDb, guardarSectorDb, eliminarUsuarioDb, eliminarSectorDb, importarUsuariosSectoresAtomico };
