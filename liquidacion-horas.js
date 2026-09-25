const $=id=>document.getElementById(id);const state={rows:[],holidays:new Set(),values:{extra:0,cien:0,feriado:0},period:null,cal:new Map(),file:null};
const norm=s=>String(s??'').trim();const mins=s=>{const m=norm(s).match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60 + +m[2]:null};const hm=n=>n==null?'—':`${Math.floor(Math.max(0,n)/60)}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
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
      const punches=punchesByDay.get(day)||[];
      if(!punches.length)continue;
      const d=new Date(year,month,day);
      out.push({id,name,date:keyDate(d),punches,manual:false});
    }
  }
  return out;
}
async function calendars(){state.cal.clear();if(!state.period)return;let sectores=[];try{const d=await fetch('/admin/sectores').then(r=>r.json());sectores=d.sectores||d.items||d.data||[]}catch{};const ids=[...new Set(sectores.map(s=>s.id||s.sector||s.nombre).filter(Boolean))];const months=new Set(state.rows.map(r=>r.date.slice(0,7)));for(const sector of ids)for(const mes of months){try{const d=await fetch(`/horarios/calendario?sector=${encodeURIComponent(sector)}&mes=${mes}`).then(r=>r.json());if(!d.ok)continue;const turns=new Map((d.turnos||[]).map(t=>[String(t.id),t]));for(const c of d.celdas||[]){const t=turns.get(String(c.turno));state.cal.set(`${norm(c.empleado).toLowerCase()}|${mes}-${String(c.dia).padStart(2,'0')}`,scheduleText(t))}}catch{}}}
function scheduleText(t){if(!t)return'';for(const k of ['horario','texto','nombre'])if(t[k]&&/\d{1,2}:\d{2}/.test(t[k]))return t[k];const vals=Object.values(t).filter(v=>typeof v==='string'&&/\d{1,2}:\d{2}/.test(v));return vals.join(' / ')}
function calc(r){const sch=state.cal.get(`${r.name.toLowerCase()}|${r.date}`)||'';const st=(sch.match(/\d{1,2}:\d{2}/g)||[]).map(mins);const pt=r.punches.map(mins).filter(x=>x!=null);let worked=0;for(let i=0;i+1<pt.length;i+=2)worked+=Math.max(0,pt[i+1]-pt[i]);const complete=pt.length>0&&pt.length%2===0;let late=0,early=0,extra=0;if(st.length>=2&&pt.length){for(let i=0;i<Math.min(st.length,pt.length);i+=2){late+=Math.max(0,pt[i]-st[i]);if(pt[i+1]!=null&&st[i+1]!=null){early+=Math.max(0,st[i+1]-pt[i+1]);extra+=Math.max(0,st[i]-pt[i])+Math.max(0,pt[i+1]-st[i+1])}}}const d=new Date(r.date+'T12:00:00');let cien=0,fer=0;if(state.holidays.has(r.date))fer=worked;else if(d.getDay()===0)cien=worked;else if(d.getDay()===6){for(let i=0;i+1<pt.length;i+=2)cien+=Math.max(0,pt[i+1]-Math.max(pt[i],14*60))}if(cien)extra=Math.max(0,extra-cien);return{sch,worked,complete,late,early,extra,cien,fer}}
function render(){const q=norm($('liqSearch')?.value).toLowerCase();const rows=state.rows.filter(r=>!q||r.name.toLowerCase().includes(q));const by=new Map();rows.forEach(r=>{if(!by.has(r.name))by.set(r.name,[]);by.get(r.name).push(r)});$('liqEmployees').innerHTML=by.size?[...by].map(([name,rs])=>{const cs=rs.map(calc),inc=cs.filter(c=>!c.complete).length,lates=cs.filter(c=>c.late).length;return `<section class="liq-employee"><div class="liq-employee-head"><span class="liq-avatar">${name[0]}</span><div class="meta"><b>${name}</b><small>${rs.length} días importados</small></div><span class="liq-summary-inline">${inc?`🔴 ${inc} incompleto · `:''}${lates?`🟠 ${lates} llegadas tarde`:''}</span></div><div class="liq-table-wrap"><table class="liq-table"><thead><tr><th>Fecha</th><th>Día</th><th>Horario programado</th><th>Fichadas (reloj)</th><th>Horario corregido</th><th>Horas</th><th>Estado</th><th>Incidencias</th><th>Acción</th></tr></thead><tbody>${rs.map((r,i)=>rowHtml(r,cs[i])).join('')}</tbody></table></div></section>`}).join(''):'<div class="liq-empty">Importá el reporte de asistencia para comenzar.</div>';renderSummary()}
function rowHtml(r,c){let inc=[];if(!c.complete)inc.push('Fichada incompleta');if(c.late)inc.push(`Llegó ${c.late} min tarde`);if(c.early)inc.push(`Salió ${c.early} min antes`);if(c.extra)inc.push(`${hm(c.extra)} extra`);if(c.cien)inc.push(`${hm(c.cien)} al 100%`);if(c.fer)inc.push(`${hm(c.fer)} feriado`);const d=new Date(r.date+'T12:00:00');const dia=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];const corregido=r.manual?r.punches.join(' · '):'—';return `<tr><td>${r.date.split('-').reverse().join('/')}</td><td>${dia}</td><td>${c.sch||'Sin horario'}</td><td>${r.punches.join(' · ')}</td><td>${corregido}</td><td>${hm(c.worked)}</td><td class="liq-status ${c.complete?'ok':'bad'}">${c.complete?'Completo':'Incompleto'}</td><td>${inc.join(' · ')||'—'}</td><td><button class="liq-btn" data-liq-edit="${state.rows.indexOf(r)}">${c.complete?'Editar':'Completar'}</button></td></tr>`}
function renderSummary(){const sums={worked:0,extra:0,cien:0,fer:0,late:0};state.rows.map(calc).forEach(c=>Object.keys(sums).forEach(k=>sums[k]+=c[k]||0));const money=sums.extra/60*state.values.extra+sums.cien/60*state.values.cien+sums.fer/60*state.values.fer;$('liqSummary').innerHTML=`<div class="liq-summary-grid"><div class="liq-summary-card"><small>Horas trabajadas</small><strong>${hm(sums.worked)}</strong></div><div class="liq-summary-card"><small>Horas extras</small><strong>${hm(sums.extra)}</strong></div><div class="liq-summary-card"><small>Horas al 100%</small><strong>${hm(sums.cien)}</strong></div><div class="liq-summary-card"><small>Horas feriadas</small><strong>${hm(sums.fer)}</strong></div><div class="liq-summary-card"><small>Minutos tarde</small><strong>${sums.late}</strong></div><div class="liq-summary-card"><small>Total adicional</small><strong class="liq-money">$ ${Math.round(money).toLocaleString('es-AR')}</strong></div></div>`}
function modal(id,on=true){$(id)?.classList.toggle('oculto',!on)}
async function importFile(f){await loadXLSX();const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});const sn=wb.SheetNames.find(n=>/reporte de asistencia/i.test(n))||wb.SheetNames.find(n=>/asistencia/i.test(n));if(!sn)throw new Error('No se encontró la hoja “Reporte de Asistencia”.');state.rows=parseReport(wb.Sheets[sn]);if(!state.rows.length)throw new Error('No se pudieron interpretar fichadas en la hoja Reporte de Asistencia.');state.file=f;const dates=state.rows.map(r=>r.date).sort();state.period=[dates[0],dates.at(-1)];$('liqFileName').textContent=f.name;$('liqFileSize').textContent=`${Math.ceil(f.size/1024)} KB`;$('liqSelectedFile')?.classList.remove('oculto');$('liqPeriod').textContent=`${state.period[0].split('-').reverse().join('/')} → ${state.period[1].split('-').reverse().join('/')}`;$('liqFound').classList.remove('oculto');await calendars();render()}
function openEdit(idx){const r=state.rows[idx];$('liqEditIndex').value=idx;$('liqEditTitle').textContent=`${r.name} · ${r.date.split('-').reverse().join('/')}`;$('liqEditPunches').value=r.punches.join(' / ');modal('liqEditModal')}
function init(){if(!$('adminTab-liquidacion'))return;$('liqFileBtn').onclick=()=>$('liqFile').click();$('liqFile').onchange=e=>{const f=e.target.files[0];if(f)importFile(f).catch(x=>alert(x.message))};$('liqFileRemove').onclick=()=>{state.rows=[];state.file=null;state.period=null;$('liqFile').value='';$('liqSelectedFile').classList.add('oculto');$('liqPeriod').textContent='—';$('liqFound').classList.add('oculto');render()};$('liqHolidayBtn').onclick=()=>modal('liqHolidayModal');$('liqValuesBtn').onclick=()=>modal('liqValuesModal');document.querySelectorAll('[data-liq-close]').forEach(b=>b.onclick=()=>modal(b.dataset.liqClose,false));$('liqHolidayAdd').onclick=()=>{const v=$('liqHolidayDate').value;if(v){state.holidays.add(v);renderChips()}};$('liqHolidaySave').onclick=()=>{modal('liqHolidayModal',false);render()};$('liqValuesSave').onclick=()=>{state.values={extra:+$('liqExtra').value||0,cien:+$('liqCien').value||0,feriado:+$('liqFeriado').value||0};modal('liqValuesModal',false);render()};$('liqSearch').oninput=render;$('liqEmployees').onclick=e=>{const b=e.target.closest('[data-liq-edit]');if(b)openEdit(+b.dataset.liqEdit)};$('liqEditSave').onclick=()=>{const i=+$('liqEditIndex').value;state.rows[i].punches=($('liqEditPunches').value.match(/\d{1,2}:\d{2}/g)||[]);state.rows[i].manual=true;modal('liqEditModal',false);render()};document.querySelectorAll('[data-liq-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-liq-tab]').forEach(x=>x.classList.toggle('active',x===b));$('liqReviewPane').classList.toggle('oculto',b.dataset.liqTab!=='review');$('liqSummary').classList.toggle('oculto',b.dataset.liqTab!=='summary');$('liqDetail').classList.toggle('oculto',b.dataset.liqTab!=='detail')})}
function renderChips(){$('liqHolidayChips').innerHTML=[...state.holidays].sort().map(d=>`<button class="liq-chip" data-date="${d}">${d.split('-').reverse().join('/')} ×</button>`).join('');$('liqHolidayChips').onclick=e=>{const b=e.target.closest('[data-date]');if(b){state.holidays.delete(b.dataset.date);renderChips()}}}
window.LiquidacionHoras={init,render};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
