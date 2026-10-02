import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
const $=id=>document.getElementById(id);const STORAGE_KEY='autoservicio_liquidacion_horas_v2';const state={rows:[],holidays:new Set(),values:{normal:0,extra:0,cien:0,feriado:0},period:null,cal:new Map(),file:null,fileMeta:null,savedPeriodId:null,expandedEmployees:new Set(),employeeMeta:new Map()};
let holidayDraft=new Set();
let pendingHolidayDate='';
const norm=s=>String(s??'').trim();const mins=s=>{const m=norm(s).match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60 + +m[2]:null};const hm=n=>n==null?'—':`${Math.floor(Math.max(0,n)/60)}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
function dedupePunches(punches,tolerance=2){const out=[];for(const p of punches){const m=mins(p);if(m==null)continue;const last=out.length?mins(out[out.length-1]):null;if(last==null||Math.abs(m-last)>tolerance)out.push(p)}return out}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({rows:state.rows,holidays:[...state.holidays],values:state.values,period:state.period,fileMeta:state.fileMeta,savedPeriodId:state.savedPeriodId}))}catch{}}
function restore(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(!x)return false;state.rows=Array.isArray(x.rows)?x.rows:[];state.holidays=new Set(Array.isArray(x.holidays)?x.holidays:[]);state.values={normal:+x.values?.normal||0,extra:+x.values?.extra||0,cien:+x.values?.cien||0,feriado:+x.values?.feriado||0};state.period=Array.isArray(x.period)?x.period:null;state.fileMeta=x.fileMeta||null;state.savedPeriodId=x.savedPeriodId||null;return !!state.rows.length}catch{return false}}
function loadXLSX(){if(window.XLSX)return Promise.resolve();return new Promise((ok,no)=>{const s=document.createElement('script');s.src='./xlsx.full.min.js';s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
function excelDate(v){if(v instanceof Date)return v;if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return d?new Date(d.y,d.m-1,d.d):null}const x=norm(v).match(/(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(!x)return null;return x[1]?new Date(+x[1],+x[2]-1,+x[3]):new Date(+x[6],+x[5]-1,+x[4])}
function keyDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseReport(ws){
  const a=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  if(!a.length)return[];

  // El reloj genera el .xls con los días en una fila (1, 2, 3...) y las
  // fichadas en esas mismas columnas. Conservamos el índice real de columna:
  // algunos reportes empiezan el día 1 en A y otros pueden traer columnas extra.
  let dayCols=[];
  for(const r of a.slice(0,10)){
    const cols=[];
    r.forEach((v,c)=>{const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)cols.push({col:c,day:n})});
    if(cols.length>dayCols.length)dayCols=cols;
  }
  if(!dayCols.length)return[];

  let year=new Date().getFullYear(),month=0;
  outer:for(const r of a.slice(0,8))for(const c of r){
    const d=excelDate(c);
    if(d){year=d.getFullYear();month=d.getMonth();break outer}
  }

  const nextValue=(r,from)=>{for(let c=from+1;c<r.length;c++){const v=norm(r[c]);if(v)return v}return''};
  const isEmployeeHeader=r=>r.some(v=>/^ID:?$/i.test(norm(v)))&&r.some(v=>/^Nombre:?$/i.test(norm(v)));
  const out=[];

  for(let i=0;i<a.length;i++){
    const raw=a[i],r=raw.map(norm);
    if(!isEmployeeHeader(r))continue;
    const ni=r.findIndex(x=>/^Nombre:?$/i.test(x));
    const idIdx=r.findIndex(x=>/^ID:?$/i.test(x));
    const name=nextValue(raw,ni);
    const id=idIdx>=0?nextValue(raw,idIdx):'';
    if(!name)continue;

    // Junta las líneas de fichadas hasta el encabezado del empleado siguiente.
    // Normalmente es una sola fila, pero esto tolera reportes partidos en dos.
    const punchesByDay=new Map();
    for(let rr=i+1;rr<a.length&&!isEmployeeHeader(a[rr].map(norm));rr++){
      for(const {col,day} of dayCols){
        const txt=norm(a[rr][col]);
        if(!txt)continue;
        const times=txt.match(/(?:[01]?\d|2[0-3]):[0-5]\d/g)||[];
        if(times.length){
          if(!punchesByDay.has(day))punchesByDay.set(day,[]);
          punchesByDay.get(day).push(...times);
        }
      }
    }
    for(const {day} of dayCols){
      const punches=dedupePunches(punchesByDay.get(day)||[]);
      if(!punches.length)continue;
      const d=new Date(year,month,day);
      out.push({id,name,date:keyDate(d),punches,manual:false});
    }
  }
  return out;
}
async function calendars(){
  state.cal.clear();
  if(!state.period)return;

  // Usamos el mismo contexto que la pantalla Horarios & Turnos. /admin/sectores
  // sólo funciona para el rol administrador y hacía que usuarios de
  // Administración (por ejemplo Lucía) vieran "Sin horario" en Liquidación.
  let sectores=[];
  try{
    const r=await fetch(`${API_BASE_URL}/horarios/contexto`,{cache:'no-store'});
    const d=await r.json();
    if(r.ok&&d.ok)sectores=d.sectores||[];
  }catch{}

  const ids=[...new Set(sectores.map(s=>s.id).filter(Boolean))];
  const relojPorNombre=new Map();
  state.employeeMeta.clear();
  for(const sec of sectores) for(const emp of (sec.empleadosInfo||[])){
    const nombre=norm(emp?.nombre).toLowerCase();
    const idReloj=String(emp?.idReloj||'').trim();
    const meta={sector:sec.nombre||sec.id||'',sectorId:sec.id||'',idReloj};
    if(nombre){ state.employeeMeta.set(`name:${nombre}`,meta); if(idReloj) relojPorNombre.set(nombre,idReloj); }
    if(idReloj) state.employeeMeta.set(`id:${idReloj}`,meta);
  }
  for(const row of state.rows){
    const meta=state.employeeMeta.get(`id:${String(row.id||'').trim()}`)||state.employeeMeta.get(`name:${norm(row.name).toLowerCase()}`);
    row.sector=meta?.sector||row.sector||'';
    row.sectorId=meta?.sectorId||row.sectorId||'';
  }
  refreshSectorFilter();
  const months=new Set(state.rows.map(r=>r.date.slice(0,7)));

  for(const sector of ids)for(const mes of months){
    try{
      const r=await fetch(`${API_BASE_URL}/horarios/calendario?sector=${encodeURIComponent(sector)}&mes=${mes}`,{cache:'no-store'});
      const d=await r.json();
      if(!r.ok||!d.ok)continue;
      const turns=new Map((d.turnos||[]).map(t=>[String(t.id),t]));
      for(const c of d.celdas||[]){
        const t=turns.get(String(c.turno));
        const horario=scheduleText(t);
        if(!horario)continue;
        const fecha=`${mes}-${String(c.dia).padStart(2,'0')}`;
        const idReloj=relojPorNombre.get(norm(c.empleado).toLowerCase());
        if(idReloj) state.cal.set(`id:${idReloj}|${fecha}`,horario);
        state.cal.set(`name:${norm(c.empleado).toLowerCase()}|${fecha}`,horario);
      }
    }catch{}
  }
}
function scheduleText(t){if(!t)return'';if(t.inicio&&t.fin){const primero=`${t.inicio} - ${t.fin}`;return t.tipo==='cortado'&&t.inicio2&&t.fin2?`${primero} / ${t.inicio2} - ${t.fin2}`:primero}for(const k of ['horario','texto','nombre','label'])if(t[k]&&/\d{1,2}:\d{2}/.test(t[k]))return t[k];const vals=Object.values(t).filter(v=>typeof v==='string'&&/\d{1,2}:\d{2}/.test(v));return vals.join(' / ')}
function alignPunchesToSchedule(punches,st){
  const raw=dedupePunches(punches).map(v=>({text:v,min:mins(v)})).filter(x=>x.min!=null);
  if(!st.length)return raw.map(x=>x.text);
  const n=st.length,m=raw.length,missPenalty=180;
  const dp=Array.from({length:n+1},()=>Array(m+1).fill(Infinity));
  const prev=Array.from({length:n+1},()=>Array(m+1).fill(null));dp[0][0]=0;
  for(let i=0;i<n;i++)for(let j=0;j<=m;j++)if(Number.isFinite(dp[i][j])){
    if(dp[i][j]+missPenalty<dp[i+1][j]){dp[i+1][j]=dp[i][j]+missPenalty;prev[i+1][j]=[i,j,'miss']}
    if(j<m){const cost=dp[i][j]+Math.abs(raw[j].min-st[i]);if(cost<dp[i+1][j+1]){dp[i+1][j+1]=cost;prev[i+1][j+1]=[i,j,'use']}}
  }
  let j=Math.min(m,n),best=dp[n][j];for(let k=0;k<=Math.min(m,n);k++)if(dp[n][k]+(m-k)*missPenalty<best){j=k;best=dp[n][k]+(m-k)*missPenalty}
  const slots=Array(n).fill('');let i=n;while(i>0){const q=prev[i][j];if(!q)break;const [pi,pj,act]=q;if(act==='use')slots[i-1]=raw[pj].text;i=pi;j=pj}
  return slots
}
function calc(r){const sch=state.cal.get(`id:${String(r.id||'')}|${r.date}`)||state.cal.get(`name:${norm(r.name).toLowerCase()}|${r.date}`)||'';const st=(sch.match(/\d{1,2}:\d{2}/g)||[]).map(mins);const slotText=r.manualSlots?.length?r.manualSlots:alignPunchesToSchedule(r.punches,st);const pt=slotText.map(mins);let worked=0;for(let i=0;i+1<pt.length;i+=2)if(pt[i]!=null&&pt[i+1]!=null)worked+=Math.max(0,pt[i+1]-pt[i]);const required=st.length>=2?st.length:Math.min(2,pt.length);const complete=required>0&&pt.slice(0,required).every(x=>x!=null);let late=0,early=0,extra=0;if(st.length>=2){for(let i=0;i<st.length;i+=2){if(pt[i]!=null){const lateDiff=pt[i]-st[i];if(lateDiff>5)late+=lateDiff}if(pt[i+1]!=null){early+=Math.max(0,st[i+1]-pt[i+1]);const extraDiff=pt[i+1]-st[i+1];if(extraDiff>=30)extra+=extraDiff}}}const d=new Date(r.date+'T12:00:00');let cien=0,fer=0;if(state.holidays.has(r.date))fer=worked;else if(d.getDay()===0)cien=worked;else if(d.getDay()===6){for(let i=0;i+1<pt.length;i+=2)if(pt[i]!=null&&pt[i+1]!=null)cien+=Math.max(0,pt[i+1]-Math.max(pt[i],14*60))}if(cien)extra=Math.max(0,extra-cien);return{sch,worked,complete,late,early,extra,cien,fer,slots:slotText}}
function employeeKey(name){return norm(name).toLowerCase()}
function refreshSectorFilter(){
  const sel=$('liqSectorFilter');if(!sel)return;
  const current=sel.value;
  const sectors=[...new Set(state.rows.map(r=>r.sector).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  sel.innerHTML='<option value="">Todos los sectores</option>'+sectors.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(sectors.includes(current))sel.value=current;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fechaHist(v){if(!v)return '—';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return d.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',', '')}
function employeeState(rs,cs=rs.map(calc)){const incomplete=cs.some(c=>!c.complete),manual=rs.some(r=>r.manual);return incomplete?'incomplete':manual?'modified':'complete'}
function render(){
  const q=norm($('liqSearch')?.value).toLowerCase(),sectorFilter=$('liqSectorFilter')?.value||'',statusFilter=$('liqStatusFilter')?.value||'';
  const allBy=new Map();state.rows.forEach(r=>{if(!allBy.has(r.name))allBy.set(r.name,[]);allBy.get(r.name).push(r)});
  const all=[...allBy.values()];
  const complete=all.filter(rs=>rs.map(calc).every(c=>c.complete)).length;
  const incomplete=all.filter(rs=>rs.map(calc).some(c=>!c.complete)).length;
  const late=all.filter(rs=>rs.map(calc).some(c=>c.late>0)).length;
  const modified=all.filter(rs=>rs.some(r=>r.manual)).length;
  const clean=all.filter(rs=>{const cs=rs.map(calc);return cs.every(c=>c.complete&&!c.late&&!c.early)&&!rs.some(r=>r.manual)}).length;
  if($('liqKpiEmployees'))$('liqKpiEmployees').textContent=all.length;if($('liqKpiComplete'))$('liqKpiComplete').textContent=complete;if($('liqKpiIncomplete'))$('liqKpiIncomplete').textContent=incomplete;if($('liqKpiLate'))$('liqKpiLate').textContent=late;if($('liqKpiModified'))$('liqKpiModified').textContent=modified;if($('liqKpiClean'))$('liqKpiClean').textContent=clean;
  if($('liqValueNormal'))$('liqValueNormal').textContent=money(state.values.normal);if($('liqValueExtra'))$('liqValueExtra').textContent=money(state.values.extra);if($('liqValueCien'))$('liqValueCien').textContent=money(state.values.cien);if($('liqValueFeriado'))$('liqValueFeriado').textContent=money(state.values.feriado);
  if($('liqHolidayPreview'))$('liqHolidayPreview').textContent=state.holidays.size?[...state.holidays].sort().map(d=>d.split('-').reverse().join('/')).join(' · '):'Sin fechas seleccionadas';
  const visible=[...allBy].filter(([name,rs])=>{
    const cs=rs.map(calc),sector=rs[0]?.sector||'';
    return (!q||norm(name).toLowerCase().includes(q))&&(!sectorFilter||sector===sectorFilter)&&(!statusFilter||employeeState(rs,cs)===statusFilter);
  });
  $('liqEmployees').innerHTML=visible.length?visible.map(([name,rs])=>{
    const cs=rs.map(calc),inc=cs.filter(c=>!c.complete).length,lates=cs.filter(c=>c.late).length,manual=rs.some(r=>r.manual);
    const key=employeeKey(name),open=state.expandedEmployees.has(key),sector=rs[0]?.sector||'Sin sector';
    const badges=[inc?`<span class="liq-issue bad">● ${inc} ${inc===1?'incompleto':'incompletos'}</span>`:'',lates?`<span class="liq-issue warn">● ${lates} ${lates===1?'llegada tarde':'llegadas tarde'}</span>`:'',manual?'<span class="liq-issue mod">● Modificado</span>':''].filter(Boolean).join('')||'<span class="liq-issue ok">● Sin incidencias</span>';
    const status=inc?'<span class="liq-state bad">● Incompleto</span>':manual?'<span class="liq-state mod">● Modificado</span>':'<span class="liq-state ok">● Completo</span>';
    return `<section class="liq-employee ${open?'is-open':''}" data-liq-employee="${esc(key)}"><div class="liq-employee-head"><div class="liq-person"><span class="liq-avatar">${esc(name[0])}</span><b>${esc(name)}${rs[0]?.id?` <small>(ID: ${esc(rs[0].id)})</small>`:''}</b></div><span class="liq-sector">${esc(sector)}</span><span>${rs.length} días</span><span class="liq-incidents">${badges}</span><span>${status}</span><button class="liq-detail-btn" type="button" data-liq-toggle="${esc(key)}" aria-expanded="${open}">Ver detalle <b>›</b></button></div><div class="liq-employee-body" ${open?'':'hidden'}><div class="liq-detail-caption"><b>Detalle de fichadas</b><span>${esc(name)} · ${esc(sector)}</span></div><div class="liq-table-wrap"><table class="liq-table"><thead><tr><th>Fecha</th><th>Día</th><th>Horario programado</th><th>Fichadas (reloj)</th><th>Horario corregido</th><th>Horas</th><th>Estado</th><th>Incidencias</th><th>Acción</th></tr></thead><tbody>${rs.map((r,i)=>rowHtml(r,cs[i])).join('')}</tbody></table></div></div></section>`
  }).join(''):'<div class="liq-empty">No hay empleados que coincidan con los filtros seleccionados.</div>';
  renderSummary();renderDetail();if($('liqSavePeriodBtn'))$('liqSavePeriodBtn').disabled=!state.rows.length||!state.period
}
function rowHtml(r,c){let inc=[];if(!c.complete)inc.push('Fichada incompleta');if(c.late)inc.push(`Llegó ${c.late} min tarde`);if(c.early)inc.push(`Salió ${c.early} min antes`);if(c.extra)inc.push(`${hm(c.extra)} extra`);if(c.cien)inc.push(`${hm(c.cien)} al 100%`);if(c.fer)inc.push(`${hm(c.fer)} feriado`);const d=new Date(r.date+'T12:00:00');const dia=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];const corregido=r.manual?r.punches.join(' · '):'—';return `<tr><td>${r.date.split('-').reverse().join('/')}</td><td>${dia}</td><td>${c.sch||'Sin horario'}</td><td>${r.punches.join(' · ')}</td><td>${corregido}</td><td>${hm(c.worked)}</td><td class="liq-status ${c.complete?'ok':'bad'}">${c.complete?'Completo':'Incompleto'}</td><td>${inc.join(' · ')||'—'}</td><td><button class="liq-btn" data-liq-edit="${state.rows.indexOf(r)}">${c.complete?'Editar':'Completar'}</button></td></tr>`}
function employeeTotals(rs){const x={worked:0,extra:0,cien:0,fer:0,late:0,early:0};rs.map(calc).forEach(c=>Object.keys(x).forEach(k=>x[k]+=c[k]||0));x.normal=Math.max(0,x.worked-x.extra-x.cien-x.fer);x.normalMoney=x.normal/60*state.values.normal;x.extraMoney=x.extra/60*state.values.extra;x.cienMoney=x.cien/60*state.values.cien;x.ferMoney=x.fer/60*state.values.fer;x.money=x.normalMoney+x.extraMoney+x.cienMoney+x.ferMoney;return x}
function money(n){return `$ ${Math.round(n||0).toLocaleString('es-AR')}`}
function renderSummary(){if(!state.rows.length){$('liqSummary').innerHTML='<div class="liq-empty">Importá el reporte para ver el resumen por empleado.</div>';return}const by=new Map();state.rows.forEach(r=>{if(!by.has(r.name))by.set(r.name,[]);by.get(r.name).push(r)});$('liqSummary').innerHTML=`<div class="liq-result-list">${[...by].map(([name,rs])=>{const s=employeeTotals(rs);return `<article class="liq-result-card"><div class="liq-result-head"><strong>${name}${rs[0].id?` (ID: ${rs[0].id})`:''}</strong><b class="liq-result-money">${money(s.money)}</b></div><div class="liq-result-grid"><div class="liq-result-metric"><small>Trabajadas</small><b>${hm(s.worked)}</b></div><div class="liq-result-metric"><small>Extras</small><b>${hm(s.extra)}</b></div><div class="liq-result-metric"><small>Al 100%</small><b>${hm(s.cien)}</b></div><div class="liq-result-metric"><small>Feriadas</small><b>${hm(s.fer)}</b></div><div class="liq-result-metric"><small>Llegadas tarde</small><b>${s.late} min</b></div><div class="liq-result-metric"><small>Total liquidación</small><b class="liq-result-money">${money(s.money)}</b></div></div></article>`}).join('')}</div>`}
function renderDetail(){if(!state.rows.length){$('liqDetail').innerHTML='<div class="liq-empty">Importá el reporte para ver el detalle del cálculo.</div>';return}const by=new Map();state.rows.forEach(r=>{if(!by.has(r.name))by.set(r.name,[]);by.get(r.name).push(r)});let grand=0;const cards=[...by].map(([name,rs])=>{const s=employeeTotals(rs);grand+=s.money;return `<article class="liq-result-card"><div class="liq-result-head"><div><strong>${name}${rs[0].id?` (ID: ${rs[0].id})`:''}</strong><small> · ${rs.length} días con fichadas</small></div><b class="liq-result-money">${money(s.money)}</b></div><div class="liq-table-wrap"><table class="liq-detail-table"><thead><tr><th>Concepto</th><th>Horas</th><th>Valor / hora</th><th>Importe</th></tr></thead><tbody><tr><td>Horas normales</td><td>${hm(s.normal)}</td><td>${money(state.values.normal)}</td><td>${money(s.normalMoney)}</td></tr><tr><td>Horas extras</td><td>${hm(s.extra)}</td><td>${money(state.values.extra)}</td><td>${money(s.extraMoney)}</td></tr><tr><td>Horas al 100%</td><td>${hm(s.cien)}</td><td>${money(state.values.cien)}</td><td>${money(s.cienMoney)}</td></tr><tr><td>Horas feriadas</td><td>${hm(s.fer)}</td><td>${money(state.values.feriado)}</td><td>${money(s.ferMoney)}</td></tr></tbody></table></div></article>`}).join('');const noCalendar=state.rows.every(r=>!calc(r).sch);$('liqDetail').innerHTML=`${noCalendar?'<div class="liq-note">No se encontraron horarios programados del calendario para estos empleados. Las horas al 100% y feriadas se calculan igual; las horas extra requieren comparar contra el horario programado.</div>':''}<div class="liq-result-list">${cards}</div><div class="liq-detail-total"><span>Total liquidación general</span><strong>${money(grand)}</strong></div>`}
function modal(id,on=true){$(id)?.classList.toggle('oculto',!on)}
async function importFile(f){await loadXLSX();const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});const sn=wb.SheetNames.find(n=>/reporte de asistencia/i.test(n))||wb.SheetNames.find(n=>/asistencia/i.test(n));if(!sn)throw new Error('No se encontró la hoja “Reporte de Asistencia”.');state.rows=parseReport(wb.Sheets[sn]);state.expandedEmployees.clear();if(!state.rows.length)throw new Error('No se pudieron interpretar fichadas en la hoja Reporte de Asistencia.');state.file=f;state.fileMeta={name:f.name,size:f.size};state.savedPeriodId=null;const dates=state.rows.map(r=>r.date).sort();state.period=[dates[0],dates.at(-1)];$('liqFileName').textContent=f.name;$('liqFileSize').textContent=`${Math.ceil(f.size/1024)} KB`;$('liqSelectedFile')?.classList.remove('oculto');$('liqPeriod').textContent=`${state.period[0].split('-').reverse().join('/')} → ${state.period[1].split('-').reverse().join('/')}`;$('liqFound').classList.remove('oculto');await calendars();persist();render()}
function currentEditSlots(){return ['liqEditEntrada1','liqEditSalida1','liqEditEntrada2','liqEditSalida2'].map(id=>$(id).value.trim())}
function openHolidayModal(){holidayDraft=new Set(state.holidays);pendingHolidayDate='';$('liqHolidayDate').value='';renderChips();modal('liqHolidayModal')}
function openEdit(idx){const r=state.rows[idx];const c=calc(r);const p=[...(r.manualSlots?.length?r.manualSlots:c.slots||r.punches),'','','',''].slice(0,4);$('liqEditIndex').value=idx;$('liqEditTitle').textContent=`${r.name} · ${r.date.split('-').reverse().join('/')}`;$('liqEditEntrada1').value=p[0]||'';$('liqEditSalida1').value=p[1]||'';$('liqEditEntrada2').value=p[2]||'';$('liqEditSalida2').value=p[3]||'';modal('liqEditModal')}
function snapshotPeriodo(){return {version:1,rows:JSON.parse(JSON.stringify(state.rows)),holidays:[...state.holidays],values:{...state.values},period:state.period?[...state.period]:null,fileMeta:state.fileMeta?{...state.fileMeta}:null,calendar:[...state.cal.entries()]}}
async function apiJson(path,options={}){const r=await fetch(`${API_BASE_URL}${path}`,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.mensaje||'No se pudo completar la operación');return d}
let periodoPendienteEliminar=null;
function periodoTexto(periodo){return Array.isArray(periodo)&&periodo.length===2?`${periodo[0].split('-').reverse().join('/')} → ${periodo[1].split('-').reverse().join('/')}`:'este período'}
function pedirGuardarPeriodo(){
  if(!state.rows.length||!state.period)return;
  $('liqSaveConfirmText').textContent=`¿Estás seguro de guardar el período ${periodoTexto(state.period)}? Quedará disponible para todos los usuarios de Administración.`;
  modal('liqSaveConfirmModal');
}
async function guardarPeriodo(){
  if(!state.rows.length||!state.period)return;
  const b=$('liqSaveConfirmBtn'),hero=$('liqSavePeriodBtn');
  if(b){b.disabled=true;b.textContent='Guardando…'} if(hero)hero.disabled=true;
  try{
    const path=state.savedPeriodId?`/admin/liquidacion-horas/periodos/${encodeURIComponent(state.savedPeriodId)}`:'/admin/liquidacion-horas/periodos';
    const d=await apiJson(path,{method:state.savedPeriodId?'PUT':'POST',body:JSON.stringify({snapshot:snapshotPeriodo()})});
    state.savedPeriodId=d.periodo?.id||state.savedPeriodId;persist();
    modal('liqSaveConfirmModal',false);
    await abrirHistorial();
  }catch(e){$('liqSaveConfirmText').textContent=e.message||'No se pudo guardar el período.'}
  finally{if(b){b.disabled=false;b.textContent='Guardar período'}if(hero)hero.disabled=!state.rows.length}
}
async function abrirHistorial(){
  modal('liqHistoryModal');const box=$('liqHistoryList');box.innerHTML='<div class="liq-empty">Cargando historial…</div>';
  try{const d=await apiJson('/admin/liquidacion-horas/periodos');box.innerHTML=d.periodos?.length?d.periodos.map(p=>`<article class="liq-history-row"><div class="liq-history-period"><strong>${esc(p.desde.split('-').reverse().join('/'))} → ${esc(p.hasta.split('-').reverse().join('/'))}</strong><small>${esc(p.archivo||'Sin nombre de archivo')}</small></div><div class="liq-history-user"><span>Creado por</span><strong>${esc(p.creadoPor||p.guardadoPor||'Administración')}</strong><small>${esc(fechaHist(p.creadoEn||p.guardadoEn))}</small></div><div class="liq-history-user"><span>Última edición</span><strong>${esc(p.editadoPor||p.creadoPor||p.guardadoPor||'Administración')}</strong><small>${esc(fechaHist(p.editadoEn||p.creadoEn||p.guardadoEn))}</small></div><div class="liq-history-actions"><button class="liq-history-open" type="button" data-liq-history-open="${esc(p.id)}">Editar</button><button class="liq-history-delete" type="button" data-liq-history-delete="${esc(p.id)}" data-liq-period-label="${esc(p.desde.split('-').reverse().join('/'))} → ${esc(p.hasta.split('-').reverse().join('/'))}" aria-label="Eliminar período" title="Eliminar período"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg></button></div></article>`).join(''):'<div class="liq-empty">Todavía no hay períodos guardados.</div>'}
  catch(e){box.innerHTML=`<div class="liq-empty">${esc(e.message)}</div>`}
}
function pedirEliminarPeriodo(id,label){periodoPendienteEliminar=id;$('liqDeleteConfirmText').textContent=`¿Estás seguro de eliminar el período ${label}? Esta acción no se puede deshacer.`;modal('liqDeleteConfirmModal')}
async function eliminarPeriodo(){
  if(!periodoPendienteEliminar)return;const b=$('liqDeleteConfirmBtn');b.disabled=true;b.textContent='Eliminando…';
  try{await apiJson(`/admin/liquidacion-horas/periodos/${encodeURIComponent(periodoPendienteEliminar)}`,{method:'DELETE'});periodoPendienteEliminar=null;modal('liqDeleteConfirmModal',false);await abrirHistorial()}
  catch(e){$('liqDeleteConfirmText').textContent=e.message||'No se pudo eliminar el período.'}
  finally{b.disabled=false;b.textContent='Eliminar período'}
}
async function cargarPeriodoGuardado(id){try{const d=await apiJson(`/admin/liquidacion-horas/periodos/${encodeURIComponent(id)}`),x=d.periodo?.snapshot||{};state.rows=Array.isArray(x.rows)?JSON.parse(JSON.stringify(x.rows)):[];state.holidays=new Set(Array.isArray(x.holidays)?x.holidays:[]);state.values={normal:+x.values?.normal||0,extra:+x.values?.extra||0,cien:+x.values?.cien||0,feriado:+x.values?.feriado||0};state.period=Array.isArray(x.period)?x.period:null;state.file=null;state.fileMeta=x.fileMeta||null;state.savedPeriodId=d.periodo?.id||id;state.cal=new Map(Array.isArray(x.calendar)?x.calendar:[]);state.expandedEmployees.clear();if(state.fileMeta){$('liqFileName').textContent=state.fileMeta.name||'Reporte guardado';$('liqFileSize').textContent=state.fileMeta.size?`${Math.ceil(state.fileMeta.size/1024)} KB`:'';$('liqSelectedFile')?.classList.remove('oculto');$('liqFound')?.classList.remove('oculto')}if(state.period)$('liqPeriod').textContent=`${state.period[0].split('-').reverse().join('/')} → ${state.period[1].split('-').reverse().join('/')}`;refreshSectorFilter();renderChips();render();modal('liqHistoryModal',false)}catch(e){const box=$('liqHistoryList');if(box)box.innerHTML=`<div class="liq-empty">${esc(e.message)}</div>`}}

function init(){if(!$('adminTab-liquidacion'))return;$('liqSavePeriodBtn').onclick=pedirGuardarPeriodo;$('liqSaveConfirmBtn').onclick=guardarPeriodo;$('liqDeleteConfirmBtn').onclick=eliminarPeriodo;$('liqHistoryBtn').onclick=abrirHistorial;$('liqHistoryList').onclick=e=>{const open=e.target.closest('[data-liq-history-open]');if(open){cargarPeriodoGuardado(open.dataset.liqHistoryOpen);return}const del=e.target.closest('[data-liq-history-delete]');if(del)pedirEliminarPeriodo(del.dataset.liqHistoryDelete,del.dataset.liqPeriodLabel)};$('liqFileBtn').onclick=()=>$('liqFile').click();$('liqFile').onchange=e=>{const f=e.target.files[0];if(f)importFile(f).catch(x=>alert(x.message))};const dz=$('liqFileBtn');['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('is-dragging')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('is-dragging')}));dz.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];if(f&&/\.xlsx?$/i.test(f.name))importFile(f).catch(x=>alert(x.message))});$('liqFileRemove').onclick=()=>{state.rows=[];state.expandedEmployees.clear();state.file=null;state.fileMeta=null;state.period=null;state.savedPeriodId=null;localStorage.removeItem(STORAGE_KEY);$('liqFile').value='';$('liqSelectedFile').classList.add('oculto');$('liqPeriod').textContent='—';$('liqFound').classList.add('oculto');render()};$('liqHolidayBtn').onclick=openHolidayModal;$('liqValuesBtn').onclick=()=>{$('liqNormal').value=state.values.normal||'';$('liqExtra').value=state.values.extra||'';$('liqCien').value=state.values.cien||'';$('liqFeriado').value=state.values.feriado||'';modal('liqValuesModal')};document.querySelectorAll('[data-liq-close]').forEach(b=>b.onclick=()=>modal(b.dataset.liqClose,false));$('liqHolidayDate').onchange=()=>{pendingHolidayDate=$('liqHolidayDate').value||''};$('liqHolidaySave').onclick=()=>{if(pendingHolidayDate)holidayDraft.add(pendingHolidayDate);state.holidays=new Set(holidayDraft);pendingHolidayDate='';persist();modal('liqHolidayModal',false);render()};$('liqValuesSave').onclick=()=>{state.values={normal:+$('liqNormal').value||0,extra:+$('liqExtra').value||0,cien:+$('liqCien').value||0,feriado:+$('liqFeriado').value||0};persist();modal('liqValuesModal',false);render()};$('liqSearch').oninput=render;$('liqSectorFilter').onchange=render;$('liqStatusFilter').onchange=render;$('liqEmployees').onclick=e=>{const b=e.target.closest('[data-liq-edit]');if(b){e.stopPropagation();openEdit(+b.dataset.liqEdit);return}const h=e.target.closest('[data-liq-toggle]');if(h){const key=h.dataset.liqToggle;if(state.expandedEmployees.has(key))state.expandedEmployees.delete(key);else state.expandedEmployees.add(key);render()}};$('liqEmployees').onkeydown=e=>{const h=e.target.closest('[data-liq-toggle]');if(h&&(e.key==='Enter'||e.key===' ')){e.preventDefault();h.click()}};$('liqEditSave').onclick=()=>{const i=+$('liqEditIndex').value;const values=currentEditSlots();state.rows[i].manualSlots=values;state.rows[i].punches=dedupePunches(values.filter(Boolean));state.rows[i].manual=true;persist();modal('liqEditModal',false);render()};document.querySelectorAll('[data-liq-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-liq-tab]').forEach(x=>x.classList.toggle('active',x===b));$('liqReviewPane').classList.toggle('oculto',b.dataset.liqTab!=='review');$('liqSummary').classList.toggle('oculto',b.dataset.liqTab!=='summary');$('liqDetail').classList.toggle('oculto',b.dataset.liqTab!=='detail')});if(restore()){if(state.fileMeta){$('liqFileName').textContent=state.fileMeta.name||'Reporte guardado';$('liqFileSize').textContent=state.fileMeta.size?`${Math.ceil(state.fileMeta.size/1024)} KB`:'';$('liqSelectedFile')?.classList.remove('oculto')}if(state.period){$('liqPeriod').textContent=`${state.period[0].split('-').reverse().join('/')} → ${state.period[1].split('-').reverse().join('/')}`;$('liqFound').classList.remove('oculto')}renderChips();calendars().then(()=>{refreshSectorFilter();render()})}else{renderChips();refreshSectorFilter()}}
function renderChips(){const source=$('liqHolidayModal')?.classList.contains('oculto')?state.holidays:holidayDraft;$('liqHolidayChips').innerHTML=[...source].sort().map(d=>`<button class="liq-chip" data-date="${d}" type="button">${d.split('-').reverse().join('/')} ×</button>`).join('');$('liqHolidayChips').onclick=e=>{const b=e.target.closest('[data-date]');if(b){holidayDraft.delete(b.dataset.date);renderChips()}}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-liq-close]');if(!b)return;e.preventDefault();e.stopPropagation();modal(b.dataset.liqClose,false)});
window.LiquidacionHoras={init,render};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
