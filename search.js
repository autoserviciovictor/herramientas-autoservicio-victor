export function normalizarBusqueda(valor) {
  return String(valor ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function distancia(a,b){
  if(a===b)return 0; if(!a.length)return b.length; if(!b.length)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i), cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){cur[0]=i;for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)prev[j]=cur[j];}
  return prev[b.length];
}
export function puntuarBusqueda(consulta, ...campos) {
  const q=normalizarBusqueda(consulta); if(!q)return 1;
  const texto=normalizarBusqueda(campos.join(" ")); if(!texto)return 0;
  if(texto===q)return 1000; if(texto.startsWith(q))return 700; if(texto.includes(q))return 500;
  const tokensQ=q.split(/\s+/).filter(Boolean), tokensT=texto.split(/\s+/).filter(Boolean);
  let puntos=0;
  for(const tq of tokensQ){
    let mejor=0;
    for(const tt of tokensT){
      if(tt===tq)mejor=Math.max(mejor,120);
      else if(tt.startsWith(tq)||tq.startsWith(tt))mejor=Math.max(mejor,85);
      else if(tt.includes(tq)||tq.includes(tt))mejor=Math.max(mejor,65);
      else if(tq.length>=4&&tt.length>=4){const d=distancia(tq,tt); if(d<=1)mejor=Math.max(mejor,55); else if(d==2)mejor=Math.max(mejor,30);}
    }
    if(!mejor)return 0; puntos+=mejor;
  }
  return puntos;
}
export function coincideBusqueda(consulta,...campos){return puntuarBusqueda(consulta,...campos)>0;}
