const fs = require("fs");

const server = fs.readFileSync("server.js", "utf8");
const env = fs.readFileSync(".env.example", "utf8");
const ok = (valor, mensaje) => { if (!valor) throw new Error(mensaje); };

ok(server.includes("async function prepararPostgresEtapa9()"), "Falta preparación final de PostgreSQL Etapa 9");
ok(server.includes("Etapa 9 requiere DATABASE_URL"), "Etapa 9 debe fallar si DATABASE_URL no está configurada");
ok(server.includes("PostgreSQL Etapa 9: fuente única validada"), "Falta confirmación explícita de PostgreSQL como fuente única");
ok(server.includes("async function exigirMigracionPostgres"), "Falta validación de marcas de migración");

for (const clave of [
  "2026-08-27-usuarios-sectores-v1",
  "2026-08-27-horarios-v1",
  "2026-08-28-tareas-bano-v1",
  "2026-08-28-inventario-productos-v1",
  "2026-08-28-vencimientos-v1",
  "2026-08-28-listas-reposicion-v1",
  "2026-08-28-auxiliares-v1",
]) {
  ok(server.includes(clave), `Falta validar la migración ${clave}`);
}

ok(!server.includes("process.env.SPREADSHEET_ID"), "El runtime todavía lee SPREADSHEET_ID");
ok(!server.includes("process.env.GOOGLE_CLIENT_EMAIL"), "El runtime todavía lee GOOGLE_CLIENT_EMAIL");
ok(!server.includes("process.env.GOOGLE_PRIVATE_KEY"), "El runtime todavía lee GOOGLE_PRIVATE_KEY");
ok(!server.includes("google.sheets("), "El runtime todavía instancia Google Sheets");
ok(!server.includes("google.auth.JWT("), "El runtime todavía crea credenciales de servicio para Sheets");
ok(!server.includes('app.post("/admin/migrar-horarios"'), "La ruta legacy de migración manual todavía está expuesta");

ok(!env.includes("SPREADSHEET_ID="), ".env.example todavía exige SPREADSHEET_ID");
ok(!env.includes("GOOGLE_CLIENT_EMAIL="), ".env.example todavía exige GOOGLE_CLIENT_EMAIL");
ok(!env.includes("GOOGLE_PRIVATE_KEY="), ".env.example todavía exige GOOGLE_PRIVATE_KEY");
ok(!env.includes("AUTO_MIGRATE_SHEETS="), ".env.example todavía expone AUTO_MIGRATE_SHEETS");
ok(env.includes("DATABASE_URL="), ".env.example debe documentar DATABASE_URL");

const inicio = server.slice(server.indexOf("async function prepararPostgresEtapa9()"));
for (const funcion of [
  "asegurarUsuariosSectoresPostgres()",
  "asegurarHorariosPostgres()",
  "asegurarTareasBanoPostgres()",
  "asegurarInventarioProductosPostgres()",
  "asegurarVencimientosPostgres()",
  "asegurarListasReposicionPostgres()",
  "asegurarAuxiliaresPostgres()",
]) {
  ok(inicio.includes(funcion), `El arranque Etapa 9 no valida ${funcion}`);
}

ok(server.includes("iniciarProgramadorNotificaciones();"), "El programador de notificaciones debe iniciarse tras PostgreSQL");
ok(server.indexOf("await prepararPostgresEtapa9();") < server.indexOf("servidorHttp = app.listen"), "El servidor HTTP no debe escuchar antes de validar PostgreSQL");

console.log("PostgreSQL Etapa 9 fuente única / cierre Sheets: OK");
