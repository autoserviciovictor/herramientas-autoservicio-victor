import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
const $=id=>document.getElementById(id);const STORAGE_KEY='autoservicio_liquidacion_horas_v2';const state={rows:[],holidays:new Set(),values:{normal:0,extra:0,cien:0,feriado:0},period:null,cal:new Map(),file:null,fileMeta:null,expandedEmployees:new Set()};
const norm=s=>String(s??'').trim();const mins=s=>{const m=norm(s).match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60 + +m[2]:null};const hm=n=>n==null?'—':`${Math.floor(Math.max(0,n)/60)}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
function dedupePunches(punches,tolerance=2){const out=[];for(const p of punches){const m=mins(p);if(m==null)continue;const last=out.length?mins(out[out.length-1]):null;if(last==null||Math.abs(m-last)>tolerance)out.push(p)}return out}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({rows:state.rows,holidays:[...state.holidays],values:state.values,period:state.period,fileMeta:state.fileMeta}))}catch{}}
function restore(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(!x)return false;state.rows=Array.isArray(x.rows)?x.rows:[];state.holidays=new Set(Array.isArray(x.holidays)?x.holidays:[]);state.values={normal:+x.values?.normal||0,extra:+x.values?.extra||0,cien:+x.values?.cien||0,feriado:+x.values?.feriado||0};state.period=Array.isArray(x.period)?x.period:null;state.fileMeta=x.fileMeta||null;return !!state.rows.length}catch{return false}}
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
  for(const sec of sectores) for(const emp of (sec.empleadosInfo||[])){
    if(emp?.nombre && emp?.idReloj) relojPorNombre.set(norm(emp.nombre).toLowerCase(), String(emp.idReloj));
  }
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
function calc(r){const sch=state.cal.get(`id:${String(r.id||'')}|${r.date}`)||state.cal.get(`name:${norm(r.name).toLowerCase()}|${r.date}`)||'';const st=(sch.match(/\d{1,2}:\d{2}/g)||[]).map(mins);const slotText=r.manualSlots?.length?r.manualSlots:alignPunchesToSchedule(r.punches,st);const pt=slotText.map(mins);let worked=0;for(let i=0;i+1<pt.length;i+=2)if(pt[i]!=null&&pt[i+1]!=null)worked+=Math.max(0,pt[i+1]-pt[i]);const required=st.length>=2?st.length:Math.min(2,pt.length);const complete=required>0&&pt.slice(0,required).every(x=>x!=null);let late=0,early=0,extra=0;if(st.length>=2){for(let i=0;i<st.length;i+=2){if(pt[i]!=null)late+=Math.max(0,pt[i]-st[i]);if(pt[i+1]!=null){early+=Math.max(0,st[i+1]-pt[i+1]);extra+=Math.max(0,(pt[i]!=null?st[i]-pt[i]:0))+Math.max(0,pt[i+1]-st[i+1])}}}const d=new Date(r.date+'T12:00:00');let cien=0,fer=0;if(state.holidays.has(r.date))fer=worked;else if(d.getDay()===0)cien=worked;else if(d.getDay()===6){for(let i=0;i+1<pt.length;i+=2)if(pt[i]!=null&&pt[i+1]!=null)cien+=Math.max(0,pt[i+1]-Math.max(pt[i],14*60))}if(cien)extra=Math.max(0,extra-cien);return{sch,worked,complete,late,early,extra,cien,fer,slots:slotText}}
function employeeKey(name){return norm(name).toLowerCase()}
function render(){
  const q=norm($('liqSearch')?.value).toLowerCase();
  const rows=state.rows.filter(r=>!q||r.name.toLowerCase().includes(q));
  const by=new Map();
  rows.forEach(r=>{if(!by.has(r.name))by.set(r.name,[]);by.get(r.name).push(r)});
  $('liqEmployees').innerHTML=by.size?[...by].map(([name,rs])=>{
    const cs=rs.map(calc),inc=cs.filter(c=>!c.complete).length,lates=cs.filter(c=>c.late).length;
    const key=employeeKey(name),open=state.expandedEmployees.has(key);
    const summary=[inc?`<span class="liq-summary-item bad">● ${inc} ${inc===1?'incompleto':'incompletos'}</span>`:'',lates?`<span class="liq-summary-item mod">● ${lates} ${lates===1?'llegada tarde':'llegadas tarde'}</span>`:''].filter(Boolean).join('<span class="liq-summary-sep">•</span>')||'<span class="liq-summary-item ok">● Sin incidencias</span>';
    return `<section class="liq-employee ${open?'is-open':'is-collapsed'}" data-liq-employee="${key}"><div class="liq-employee-head" data-liq-toggle="${key}" role="button" tabindex="0" aria-expanded="${open}"><span class="liq-chevron" aria-hidden="true">›</span><span class="liq-avatar">${name[0]}</span><div class="meta"><b>${name}${rs[0]?.id?` <span class="liq-employee-id">(ID: ${rs[0].id})</span>`:''}</b><small>${rs.length} días importados</small></div><span class="liq-summary-inline">${summary}</span></div><div class="liq-employee-body" ${open?'':'hidden'}><div class="liq-table-wrap"><table class="liq-table"><thead><tr><th>Fecha</th><th>Día</th><th>Horario programado</th><th>Fichadas (reloj)</th><th>Horario corregido</th><th>Horas</th><th>Estado</th><th>Incidencias</th><th>Acción</th></tr></thead><tbody>${rs.map((r,i)=>rowHtml(r,cs[i])).join('')}</tbody></table></div></div></section>`
  }).join(''):'<div class="liq-empty">Importá el reporte de asistencia para comenzar.</div>';
  renderSummary();renderDetail()
}
function rowHtml(r,c){let inc=[];if(!c.complete)inc.push('Fichada incompleta');if(c.late)inc.push(`Llegó ${c.late} min tarde`);if(c.early)inc.push(`Salió ${c.early} min antes`);if(c.extra)inc.push(`${hm(c.extra)} extra`);if(c.cien)inc.push(`${hm(c.cien)} al 100%`);if(c.fer)inc.push(`${hm(c.fer)} feriado`);const d=new Date(r.date+'T12:00:00');const dia=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];const corregido=r.manual?r.punches.join(' · '):'—';return `<tr><td>${r.date.split('-').reverse().join('/')}</td><td>${dia}</td><td>${c.sch||'Sin horario'}</td><td>${r.punches.join(' · ')}</td><td>${corregido}</td><td>${hm(c.worked)}</td><td class="liq-status ${c.complete?'ok':'bad'}">${c.complete?'Completo':'Incompleto'}</td><td>${inc.join(' · ')||'—'}</td><td><button class="liq-btn" data-liq-edit="${state.rows.indexOf(r)}">${c.complete?'Editar':'Completar'}</button></td></tr>`}
function employeeTotals(rs){const x={worked:0,extra:0,cien:0,fer:0,late:0,early:0};rs.map(calc).forEach(c=>Object.keys(x).forEach(k=>x[k]+=c[k]||0));x.normal=Math.max(0,x.worked-x.extra-x.cien-x.fer);x.normalMoney=x.normal/60*state.values.normal;x.extraMoney=x.extra/60*state.values.extra;x.cienMoney=x.cien/60*state.values.cien;x.ferMoney=x.fer/60*state.values.fer;x.money=x.normalMoney+x.extraMoney+x.cienMoney+x.ferMoney;return x}
function money(n){return `$ ${Math.round(n||0).toLocaleString('es-AR')}`}
function renderSummary(){if(!state.rows.length){$('liqSummary').innerHTML='<div class="liq-empty">Importá el reporte para ver el resumen por empleado.</div>';return}const by=new Map();state.rows.forEach(r=>{if(!by.has(r.name))by.set(r.name,[]);by.get(r.name).push(r)});$('liqSummary').innerHTML=`<div class="liq-result-list">${[...by].map(([name,rs])=>{const s=employeeTotals(rs);return `<article class="liq-result-card"><div class="liq-result-head"><strong>${name}${rs[0].id?` (ID: ${rs[0].id})`:''}</strong><b class="liq-result-money">${money(s.money)}</b></div><div class="liq-result-grid"><div class="liq-result-metric"><small>Trabajadas</small><b>${hm(s.worked)}</b></div><div class="liq-result-metric"><small>Extras</small><b>${hm(s.extra)}</b></div><div class="liq-result-metric"><small>Al 100%</small><b>${hm(s.cien)}</b></div><div class="liq-result-metric"><small>Feriadas</small><b>${hm(s.fer)}</b></div><div class="liq-result-metric"><small>Llegadas tarde</small><b>${s.late} min</b></div><div class="liq-result-metric"><small>Total liquidación</small><b class="liq-result-money">${money(s.money)}</b></div></div></article>`}).join('')}</div>`}
function renderDetail(){if(!state.rows.length){$('liqDetail').innerHTML='<div class="liq-empty">Importá el reporte para ver el detalle del cálculo.</div>';return}const by=new Map();state.rows.forEach(r=>{if(!by.has(r.name))by.set(r.name,[]);by.get(r.name).push(r)});let grand=0;const cards=[...by].map(([name,rs])=>{const s=employeeTotals(rs);grand+=s.money;return `<article class="liq-result-card"><div class="liq-result-head"><div><strong>${name}${rs[0].id?` (ID: ${rs[0].id})`:''}</strong><small> · ${rs.length} días con fichadas</small></div><b class="liq-result-money">${money(s.money)}</b></div><div class="liq-table-wrap"><table class="liq-detail-table"><thead><tr><th>Concepto</th><th>Horas</th><th>Valor / hora</th><th>Importe</th></tr></thead><tbody><tr><td>Horas normales</td><td>${hm(s.normal)}</td><td>${money(state.values.normal)}</td><td>${money(s.normalMoney)}</td></tr><tr><td>Horas extras</td><td>${hm(s.extra)}</td><td>${money(state.values.extra)}</td><td>${money(s.extraMoney)}</td></tr><tr><td>Horas al 100%</td><td>${hm(s.cien)}</td><td>${money(state.values.cien)}</td><td>${money(s.cienMoney)}</td></tr><tr><td>Horas feriadas</td><td>${hm(s.fer)}</td><td>${money(state.values.feriado)}</td><td>${money(s.ferMoney)}</td></tr></tbody></table></div></article>`}).join('');const noCalendar=state.rows.every(r=>!calc(r).sch);$('liqDetail').innerHTML=`${noCalendar?'<div class="liq-note">No se encontraron horarios programados del calendario para estos empleados. Las horas al 100% y feriadas se calculan igual; las horas extra requieren comparar contra el horario programado.</div>':''}<div class="liq-result-list">${cards}</div><div class="liq-detail-total"><span>Total liquidación general</span><strong>${money(grand)}</strong></div>`}
function modal(id,on=true){$(id)?.classList.toggle('oculto',!on)}
async function importFile(f){await loadXLSX();const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});const sn=wb.SheetNames.find(n=>/reporte de asistencia/i.test(n))||wb.SheetNames.find(n=>/asistencia/i.test(n));if(!sn)throw new Error('No se encontró la hoja “Reporte de Asistencia”.');state.rows=parseReport(wb.Sheets[sn]);state.expandedEmployees.clear();if(!state.rows.length)throw new Error('No se pudieron interpretar fichadas en la hoja Reporte de Asistencia.');state.file=f;state.fileMeta={name:f.name,size:f.size};const dates=state.rows.map(r=>r.date).sort();state.period=[dates[0],dates.at(-1)];$('liqFileName').textContent=f.name;$('liqFileSize').textContent=`${Math.ceil(f.size/1024)} KB`;$('liqSelectedFile')?.classList.remove('oculto');$('liqPeriod').textContent=`${state.period[0].split('-').reverse().join('/')} → ${state.period[1].split('-').reverse().join('/')}`;$('liqFound').classList.remove('oculto');await calendars();persist();render()}
function openEdit(idx){const r=state.rows[idx];const c=calc(r);const p=[...(r.manualSlots?.length?r.manualSlots:c.slots||r.punches),'','','',''].slice(0,4);$('liqEditIndex').value=idx;$('liqEditTitle').textContent=`${r.name} · ${r.date.split('-').reverse().join('/')}`;$('liqEditEntrada1').value=p[0]||'';$('liqEditSalida1').value=p[1]||'';$('liqEditEntrada2').value=p[2]||'';$('liqEditSalida2').value=p[3]||'';modal('liqEditModal')}
function init(){if(!$('adminTab-liquidacion'))return;$('liqFileBtn').onclick=()=>$('liqFile').click();$('liqFile').onchange=e=>{const f=e.target.files[0];if(f)importFile(f).catch(x=>alert(x.message))};$('liqFileRemove').onclick=()=>{state.rows=[];state.expandedEmployees.clear();state.file=null;state.fileMeta=null;state.period=null;localStorage.removeItem(STORAGE_KEY);$('liqFile').value='';$('liqSelectedFile').classList.add('oculto');$('liqPeriod').textContent='—';$('liqFound').classList.add('oculto');render()};$('liqHolidayBtn').onclick=()=>modal('liqHolidayModal');$('liqValuesBtn').onclick=()=>{$('liqNormal').value=state.values.normal||'';$('liqExtra').value=state.values.extra||'';$('liqCien').value=state.values.cien||'';$('liqFeriado').value=state.values.feriado||'';modal('liqValuesModal')};document.querySelectorAll('[data-liq-close]').forEach(b=>b.onclick=()=>modal(b.dataset.liqClose,false));$('liqHolidayAdd').onclick=()=>{const v=$('liqHolidayDate').value;if(v){state.holidays.add(v);renderChips()}};$('liqHolidaySave').onclick=()=>{modal('liqHolidayModal',false);persist();render()};$('liqValuesSave').onclick=()=>{state.values={normal:+$('liqNormal').value||0,extra:+$('liqExtra').value||0,cien:+$('liqCien').value||0,feriado:+$('liqFeriado').value||0};persist();modal('liqValuesModal',false);render()};$('liqSearch').oninput=render;$('liqEmployees').onclick=e=>{const b=e.target.closest('[data-liq-edit]');if(b){e.stopPropagation();openEdit(+b.dataset.liqEdit);return}const h=e.target.closest('[data-liq-toggle]');if(h){const key=h.dataset.liqToggle;if(state.expandedEmployees.has(key))state.expandedEmployees.delete(key);else state.expandedEmployees.add(key);render()}};$('liqEmployees').onkeydown=e=>{const h=e.target.closest('[data-liq-toggle]');if(h&&(e.key==='Enter'||e.key===' ')){e.preventDefault();h.click()}};$('liqEditSave').onclick=()=>{const i=+$('liqEditIndex').value;const fields=['liqEditEntrada1','liqEditSalida1','liqEditEntrada2','liqEditSalida2'];const values=fields.map(id=>$(id).value.trim());state.rows[i].manualSlots=values;state.rows[i].punches=dedupePunches(values.filter(Boolean));state.rows[i].manual=true;persist();modal('liqEditModal',false);render()};document.querySelectorAll('[data-liq-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-liq-tab]').forEach(x=>x.classList.toggle('active',x===b));$('liqReviewPane').classList.toggle('oculto',b.dataset.liqTab!=='review');$('liqSummary').classList.toggle('oculto',b.dataset.liqTab!=='summary');$('liqDetail').classList.toggle('oculto',b.dataset.liqTab!=='detail')});if(restore()){if(state.fileMeta){$('liqFileName').textContent=state.fileMeta.name||'Reporte guardado';$('liqFileSize').textContent=state.fileMeta.size?`${Math.ceil(state.fileMeta.size/1024)} KB`:'';$('liqSelectedFile')?.classList.remove('oculto')}if(state.period){$('liqPeriod').textContent=`${state.period[0].split('-').reverse().join('/')} → ${state.period[1].split('-').reverse().join('/')}`;$('liqFound').classList.remove('oculto')}renderChips();calendars().then(render)}else renderChips()}
function renderChips(){$('liqHolidayChips').innerHTML=[...state.holidays].sort().map(d=>`<button class="liq-chip" data-date="${d}">${d.split('-').reverse().join('/')} ×</button>`).join('');$('liqHolidayChips').onclick=e=>{const b=e.target.closest('[data-date]');if(b){state.holidays.delete(b.dataset.date);renderChips()}}}
window.LiquidacionHoras={init,render};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
