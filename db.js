const { Pool } = require("pg");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
let pool = null;

function postgresConfigurado() {
  return Boolean(DATABASE_URL);
}

function obtenerPool() {
  if (!postgresConfigurado()) {
    throw new Error("DATABASE_URL no está configurada");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: Math.max(1, Number(process.env.PG_POOL_MAX) || 5),
      connectionTimeoutMillis: Math.max(
        1000,
        Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 5000,
      ),
      idleTimeoutMillis: Math.max(
        1000,
        Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
      ),
    });

    pool.on("error", (error) => {
      console.error("Error inesperado en el pool de PostgreSQL:", error.message);
    });
  }

  return pool;
}

async function verificarConexionPostgres() {
  if (!postgresConfigurado()) return { configurada: false };

  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("SELECT 1");
    return { configurada: true };
  } finally {
    cliente.release();
  }
}

async function query(texto, parametros = []) {
  return obtenerPool().query(texto, parametros);
}

async function cerrarPostgres() {
  if (!pool) return;
  const actual = pool;
  pool = null;
  await actual.end();
}

module.exports = {
  postgresConfigurado,
  obtenerPool,
  verificarConexionPostgres,
  query,
  cerrarPostgres,
};
