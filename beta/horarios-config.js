const STORAGE_PREFIX = 'autoservicio_horarios_turnos_sector_v2:';
const DEFAULTS = [
  { id:'8-16', inicio:'08:00', fin:'16:00', color:'#f59e0b' },
  { id:'8-13', inicio:'08:00', fin:'13:00', color:'#facc15' },
  { id:'9-14', inicio:'09:00', fin:'14:00', color:'#3b82f6' },
  { id:'10-16', inicio:'10:00', fin:'16:00', color:'#38bdf8' },
  { id:'14-22', inicio:'14:00', fin:'22:00', color:'#ef4444' },
  { id:'16-22', inicio:'16:00', fin:'22:00', color:'#8b5cf6' }
];
let sectorActual = '';
function normalizar(items){
  return (Array.isArray(items)?items:[]).filter(x=>x&&x.id&&x.inicio&&x.fin).map(x=>({
    id:String(x.id), inicio:String(x.inicio).slice(0,5), fin:String(x.fin).slice(0,5), color:/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#64748b'
  }));
}
function clave(sector=sectorActual){ return STORAGE_PREFIX + (sector || 'general'); }
function seleccionarSector(sector){ sectorActual=String(sector||''); return cargar(); }
function cargar(sector=sectorActual){
  try { const guardados=normalizar(JSON.parse(localStorage.getItem(clave(sector))||'null')); return guardados.length?guardados:DEFAULTS.map(x=>({...x})); }
  catch { return DEFAULTS.map(x=>({...x})); }
}
function guardarLocal(items,sector=sectorActual){
  const limpios=normalizar(items);
  if(!limpios.length) throw new Error('Debe existir al menos un horario.');
  localStorage.setItem(clave(sector),JSON.stringify(limpios));
  window.dispatchEvent(new CustomEvent('autoservicio:horarios-config',{detail:{sector,turnos:limpios}}));
  return limpios;
}
async function cargarRemoto(sector=sectorActual){
  seleccionarSector(sector);
  if(!sector) return cargar(sector);
  const base=window.API_BASE_URL||window.AutoservicioConfig?.API_BASE_URL;
  try{
    const r=await fetch(`${base}/horarios/turnos?sector=${encodeURIComponent(sector)}`);
    const data=await r.json();
    if(!r.ok||!data.ok) throw new Error(data.mensaje||'No se pudieron cargar los horarios');
    return guardarLocal(data.turnos,sector);
  }catch(error){
    console.warn('Horarios: usando configuración local',error);
    return cargar(sector);
  }
}
async function guardar(items,sector=sectorActual){
  const limpios=guardarLocal(items,sector);
  if(!sector) return limpios;
  const base=window.API_BASE_URL||window.AutoservicioConfig?.API_BASE_URL;
  const r=await fetch(`${base}/horarios/turnos`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sector,turnos:limpios})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.ok) throw new Error(data.mensaje||'No se pudieron guardar los horarios del sector');
  return limpios;
}
function idDesdeHoras(inicio,fin){ return `${inicio.replace(':','')}-${fin.replace(':','')}-${Date.now().toString(36)}`; }
window.AutoservicioHorariosConfig={ STORAGE_PREFIX, defaults:DEFAULTS.map(x=>({...x})), cargar, cargarRemoto, guardar, guardarLocal, seleccionarSector, sectorActual:()=>sectorActual, idDesdeHoras };
