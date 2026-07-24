const STORAGE_KEY = 'autoservicio_horarios_turnos_v1';
const DEFAULTS = [
  { id:'8-16', inicio:'08:00', fin:'16:00', color:'#f59e0b' },
  { id:'8-13', inicio:'08:00', fin:'13:00', color:'#facc15' },
  { id:'9-14', inicio:'09:00', fin:'14:00', color:'#3b82f6' },
  { id:'10-16', inicio:'10:00', fin:'16:00', color:'#38bdf8' },
  { id:'14-22', inicio:'14:00', fin:'22:00', color:'#ef4444' },
  { id:'16-22', inicio:'16:00', fin:'22:00', color:'#8b5cf6' }
];
function normalizar(items){
  return (Array.isArray(items)?items:[]).filter(x=>x&&x.id&&x.inicio&&x.fin).map(x=>({
    id:String(x.id), inicio:String(x.inicio).slice(0,5), fin:String(x.fin).slice(0,5), color:/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#64748b'
  }));
}
function cargar(){
  try { const guardados=normalizar(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')); return guardados.length?guardados:DEFAULTS.map(x=>({...x})); }
  catch { return DEFAULTS.map(x=>({...x})); }
}
function guardar(items){
  const limpios=normalizar(items);
  if(!limpios.length) throw new Error('Debe existir al menos un horario.');
  localStorage.setItem(STORAGE_KEY,JSON.stringify(limpios));
  window.dispatchEvent(new CustomEvent('autoservicio:horarios-config',{detail:{turnos:limpios}}));
  return limpios;
}
function idDesdeHoras(inicio,fin){ return `${inicio.replace(':','')}-${fin.replace(':','')}-${Date.now().toString(36)}`; }
window.AutoservicioHorariosConfig={ STORAGE_KEY, defaults:DEFAULTS.map(x=>({...x})), cargar, guardar, idDesdeHoras };
