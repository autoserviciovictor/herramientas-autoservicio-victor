const STORAGE_PREFIX = "autoservicio_horarios_turnos_sector_v2:";
const DEFAULTS = [];
let sectorActual = "";
function hora24(valor) {
  const texto = String(valor || "")
    .trim()
    .toUpperCase();
  const m = texto.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/);
  if (!m) return "";
  let h = Number(m[1]),
    min = Number(m[2]);
  if (m[3] === "PM" && h < 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function normalizar(items) {
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && x.id)
    .map((x) => {
      const tipo =
        String(x.tipo || "continuo").toLowerCase() === "cortado"
          ? "cortado"
          : "continuo";
      return {
        id: String(x.id),
        tipo,
        inicio: hora24(x.inicio),
        fin: hora24(x.fin),
        inicio2: tipo === "cortado" ? hora24(x.inicio2) : "",
        fin2: tipo === "cortado" ? hora24(x.fin2) : "",
        color: /^#[0-9a-f]{6}$/i.test(x.color || "") ? x.color : "#64748b",
      };
    })
    .filter(
      (x) =>
        x.inicio && x.fin && (x.tipo !== "cortado" || (x.inicio2 && x.fin2)),
    );
}
function claveUsuario() {
  return String(window.AutoservicioAuth?.getUsuario?.()?.usuario || "anon")
    .trim()
    .toLowerCase();
}
function clave(sector = sectorActual) {
  return `${STORAGE_PREFIX}${claveUsuario()}:${sector || "general"}`;
}
function seleccionarSector(sector) {
  sectorActual = String(sector || "");
  return cargar();
}
function cargar(sector = sectorActual) {
  try {
    return normalizar(JSON.parse(localStorage.getItem(clave(sector)) || "[]"));
  } catch {
    return [];
  }
}
function guardarLocal(items, sector = sectorActual) {
  const limpios = normalizar(items);
  localStorage.setItem(clave(sector), JSON.stringify(limpios));
  window.dispatchEvent(
    new CustomEvent("autoservicio:horarios-config", {
      detail: { sector, turnos: limpios },
    }),
  );
  return limpios;
}
async function cargarRemoto(sector = sectorActual) {
  seleccionarSector(sector);
  if (!sector) return cargar(sector);
  const base = window.API_BASE_URL || window.AutoservicioConfig?.API_BASE_URL;
  try {
    const r = await fetch(
      `${base}/horarios/turnos?sector=${encodeURIComponent(sector)}`,
    );
    const data = await r.json();
    if (!r.ok || !data.ok)
      throw new Error(data.mensaje || "No se pudieron cargar los horarios");
    return guardarLocal(data.turnos, sector);
  } catch (error) {
    console.warn("Horarios: usando configuración local", error);
    return cargar(sector);
  }
}
async function guardar(items, sector = sectorActual) {
  const limpios = normalizar(items);
  if (!limpios.length) throw new Error("Debe existir al menos un horario.");
  if (!sector) return guardarLocal(limpios, sector);
  const base = window.API_BASE_URL || window.AutoservicioConfig?.API_BASE_URL;
  const r = await fetch(`${base}/horarios/turnos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sector, turnos: limpios }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok)
    throw new Error(
      data.mensaje || "No se pudieron guardar los horarios del sector",
    );
  return guardarLocal(
    Array.isArray(data.turnos) ? data.turnos : limpios,
    sector,
  );
}
function idDesdeHoras(inicio, fin) {
  return `${inicio.replace(":", "")}-${fin.replace(":", "")}-${Date.now().toString(36)}`;
}
window.AutoservicioHorariosConfig = {
  STORAGE_PREFIX,
  defaults: DEFAULTS.map((x) => ({ ...x })),
  cargar,
  cargarRemoto,
  guardar,
  guardarLocal,
  seleccionarSector,
  sectorActual: () => sectorActual,
  idDesdeHoras,
};

window.addEventListener("autoservicio:sesion", () => {
  sectorActual = "";
});
