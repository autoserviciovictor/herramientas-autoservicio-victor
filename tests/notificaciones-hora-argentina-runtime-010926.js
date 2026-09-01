const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const helperMatch = server.match(/function horaMinutoArgentina\(fecha = new Date\(\)\) \{[\s\S]*?\n\}/);
assert(helperMatch, "Falta el helper canónico horaMinutoArgentina");
assert(server.indexOf("function horaMinutoArgentina(") < server.indexOf("async function contarPersonalEnTurnoActual()"), "horaMinutoArgentina debe estar definida antes de sus usos runtime");
assert(server.includes("const ahora = horaMinutoArgentina();"), "Dashboard debe usar el helper canónico de hora Argentina");
assert(server.includes("const { hora, minuto } = horaMinutoArgentina();"), "Scheduler debe usar el helper canónico de hora Argentina");

const context = { Intl, Date, resultado: null };
vm.createContext(context);
vm.runInContext(`const TIME_ZONE = "America/Argentina/Buenos_Aires";\n${helperMatch[0]}\nresultado = horaMinutoArgentina(new Date("2026-09-01T14:00:00Z"));`, context);
assert(context.resultado?.hora === 11 && context.resultado?.minuto === 0, `Conversión horaria Argentina incorrecta: ${JSON.stringify(context.resultado)}`);

console.log("Hora Argentina runtime notificaciones/dashboard 01/09: OK");
