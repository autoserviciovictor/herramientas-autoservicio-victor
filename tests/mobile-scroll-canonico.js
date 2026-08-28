const fs = require("fs");
const css = fs.readFileSync("ui-unification.css", "utf8");

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

ok(css.includes("MOBILE · SCROLL DE PANTALLA CANÓNICO"), "Falta hardening de scroll móvil");
ok(css.includes("@media (max-width: 900px)"), "Falta alcance móvil");
ok(/html\s*\{[\s\S]*?height:\s*auto\s*!important;[\s\S]*?overflow-y:\s*auto\s*!important;/m.test(css),
  "HTML móvil debe permitir desplazamiento vertical");
ok(/body:not\(\.login-bloqueado\)[\s\S]*?\{[\s\S]*?height:\s*auto\s*!important;[\s\S]*?overflow-y:\s*visible\s*!important;/m.test(css),
  "BODY móvil debe crecer con el contenido");
ok(css.includes(":not(.pro-drawer-open)") && css.includes(":not(.modal-abierto)") &&
   css.includes(":not(.tareas-modal-open)") && css.includes(":not(.inventory-scan-open)"),
  "El scroll normal no debe anular los bloqueos de overlays");
ok(css.includes("touch-action: pan-x pan-y !important;"), "Debe permitirse el gesto táctil de desplazamiento");

console.log("OK mobile-scroll-canonico");
