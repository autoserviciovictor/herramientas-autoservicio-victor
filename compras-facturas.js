import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "autoservicio_compras_facturas_v1";
const FACTURA_IA_CACHE_KEY = "autoservicio_factura_ia_cache_v2"; // v2 invalida lecturas antiguas incompletas
const FACTURA_IA_CACHE_MAX = 20;
let items = [];
let archivoActual = null;
let previewUrl = "";
let previewZoom = 1;
let adjuntos = [];
let pdfRenderToken = 0;
let pdfDocumentoActual = null;
let pdfPaginaActual = null;
let facturaAnalisisToken = 0;
let importesDetectados = null;
let alicuotasDetectadas = [];
let camposRevision = [];
let facturaEditandoId = null;
let facturaPendienteId = null;
let colaPendientesActual = [];
let cargaLoteEnCurso = false;
const totalesManuales = new Set();
const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(n) || 0);
const numero = (v) => {
  if (typeof v === "number") return Math.max(0, Number.isFinite(v) ? v : 0);
  let s = String(v ?? "").trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!s) return 0;
  // Formato argentino: 378.400,00 -> 378400.00. También conserva valores API 378400.00.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  return Math.max(0, Number(s) || 0);
};
const importeAR = (v) => `$ ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero(v))}`;
function formatearImporteMientrasEscribe(el) {
  if (!el) return;
  let crudo = String(el.value ?? "").replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "");
  crudo = crudo.replace(/[^0-9,]/g, "");
  const primeraComa = crudo.indexOf(",");
  let entero = primeraComa >= 0 ? crudo.slice(0, primeraComa) : crudo;
  let decimales = primeraComa >= 0 ? crudo.slice(primeraComa + 1).replace(/,/g, "").slice(0, 2) : null;
  entero = entero.replace(/^0+(?=\d)/, "") || "0";
  const enteroFormateado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  el.value = `$ ${enteroFormateado}${decimales !== null ? `,${decimales}` : ""}`;
  try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
}
function limpiarDatoPersistente(valorDato) {
  if (Array.isArray(valorDato)) return valorDato.map(limpiarDatoPersistente);
  if (!valorDato || typeof valorDato !== "object") {
    if (typeof valorDato === "string" && (valorDato.startsWith("data:") || valorDato.length > 250000)) return undefined;
    return valorDato;
  }
  const limpio = {};
  for (const [clave, valorCampo] of Object.entries(valorDato)) {
    const k = clave.toLowerCase();
    // Nunca persistir binarios, previews, base64 ni URLs temporales de archivos.
    if (["base64","dataurl","data_url","preview","previewurl","preview_url","contenido","bytes","buffer","blob"].includes(k)) continue;
    const v = limpiarDatoPersistente(valorCampo);
    if (v !== undefined) limpio[clave] = v;
  }
  return limpio;
}
let facturasMemoria = [];
let proveedoresMemoria = [];
const COMPRAS_IDB = "autoservicio_compras_cache_v1";
const COMPRAS_IDB_STORE = "snapshots";
function abrirComprasIdb(){return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(new Error("IndexedDB no disponible"));const r=indexedDB.open(COMPRAS_IDB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(COMPRAS_IDB_STORE))r.result.createObjectStore(COMPRAS_IDB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error("No se pudo abrir IndexedDB"));});}
async function leerSnapshotCompras(){const db=await abrirComprasIdb();return new Promise((resolve,reject)=>{const tx=db.transaction(COMPRAS_IDB_STORE,"readonly"),r=tx.objectStore(COMPRAS_IDB_STORE).get("datos");r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function guardarSnapshotCompras(){const db=await abrirComprasIdb();return new Promise((resolve,reject)=>{const tx=db.transaction(COMPRAS_IDB_STORE,"readwrite");tx.objectStore(COMPRAS_IDB_STORE).put({facturas:facturasMemoria,proveedores:proveedoresMemoria,ts:Date.now()},"datos");tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};});}
const facturas = () => facturasMemoria.map(limpiarDatoPersistente);
async function apiCompras(ruta,opciones={}){
  const respuesta=await fetch(`${API_BASE_URL}${ruta}`,{...opciones,headers:{"Content-Type":"application/json",...(opciones.headers||{})}});
  const data=await respuesta.json().catch(()=>({}));
  if(!respuesta.ok)throw new Error(data?.mensaje||`HTTP ${respuesta.status}`);
  return data;
}
async function guardarFacturaServidor(factura){await apiCompras(`/admin/compras/facturas/${encodeURIComponent(factura.id)}`,{method:"PUT",body:JSON.stringify(limpiarDatoPersistente(factura))});}
async function guardarFacturas(lista) {facturasMemoria=(Array.isArray(lista)?lista:[]).map(limpiarDatoPersistente);await guardarSnapshotCompras().catch(()=>{});}
async function cargarDatosCompras(){
  let legadoFacturas=[],legadoProveedores=[];
  try{const a=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");if(Array.isArray(a))legadoFacturas=a.map(limpiarDatoPersistente);}catch{}
  try{const a=JSON.parse(localStorage.getItem(PROVEEDORES_KEY)||"[]");if(Array.isArray(a))legadoProveedores=a;}catch{}
  try{const snap=await leerSnapshotCompras();if(snap){facturasMemoria=Array.isArray(snap.facturas)?snap.facturas:[];proveedoresMemoria=Array.isArray(snap.proveedores)?snap.proveedores:[];}}catch{}
  if(legadoFacturas.length||legadoProveedores.length){
    try{await apiCompras("/admin/compras/migrar",{method:"POST",body:JSON.stringify({facturas:legadoFacturas,proveedores:legadoProveedores})});localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(PROVEEDORES_KEY);}catch(error){console.warn("Compras: se conserva la copia local hasta completar la migración",error);}
  }
  try{const data=await apiCompras("/admin/compras/datos");facturasMemoria=Array.isArray(data.facturas)?data.facturas.map(limpiarDatoPersistente):[];proveedoresMemoria=Array.isArray(data.proveedores)?data.proveedores:[];await guardarSnapshotCompras().catch(()=>{});}
  catch(error){if(!facturasMemoria.length&&legadoFacturas.length)facturasMemoria=legadoFacturas;if(!proveedoresMemoria.length&&legadoProveedores.length)proveedoresMemoria=legadoProveedores;console.warn("Compras: usando respaldo local/offline",error);}
}
const hoy = () => {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const valor = (id) => $(id)?.value?.trim?.() ?? $(id)?.value ?? "";

function itemVacio() { return { codigo: "", descripcion: "", cantidad: 1, precio: 0, iva: 0, subtotalDetectado: null }; }
function calcularItem(it) {
  if (it && it.subtotalDetectado !== null && it.subtotalDetectado !== undefined) return numero(it.subtotalDetectado);
  return numero(it.cantidad) * numero(it.precio);
}
function invalidarImportesDetectados() { importesDetectados = null; alicuotasDetectadas = []; }
function renderItems() {
  const body = $("comprasItemsBody"); if (!body) return;
  if (!items.length) items = [itemVacio()];
  body.innerHTML = items.map((it, i) => `<tr data-i="${i}">
    <td><input data-k="codigo" value="${String(it.codigo || "").replaceAll('"','&quot;')}" placeholder="Código"></td>
    <td><input data-k="descripcion" value="${String(it.descripcion || "").replaceAll('"','&quot;')}" placeholder="Buscar producto..."></td>
    <td><input data-k="cantidad" type="number" min="0" step="0.01" value="${numero(it.cantidad)}"></td>
    <td><input data-k="precio" type="number" min="0" step="0.01" value="${numero(it.precio)}"></td>
    <td><select data-k="iva"><option ${numero(it.iva)===21?'selected':''}>21</option><option ${numero(it.iva)===10.5?'selected':''}>10.5</option><option ${numero(it.iva)===27?'selected':''}>27</option><option ${numero(it.iva)===0?'selected':''}>0</option></select></td>
    <td data-subtotal>${money(calcularItem(it))}</td>
    <td><div class="compras-item-actions"><button class="del" data-del="${i}" type="button" aria-label="Eliminar"><svg class="app-icon"><use href="#icon-trash"></use></svg></button></div></td></tr>`).join("");
  inicializarSelectores(body);
  body.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", () => {
    const tr = el.closest("tr"), i = Number(tr.dataset.i), k = el.dataset.k;
    items[i][k] = ["cantidad","precio","iva"].includes(k) ? numero(el.value) : el.value;
    if (["cantidad","precio","iva"].includes(k)) items[i].subtotalDetectado = null;
    invalidarImportesDetectados();
    tr.querySelector("[data-subtotal]").textContent = money(calcularItem(items[i])); calcularTotales();
  }));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { items.splice(Number(b.dataset.del),1); invalidarImportesDetectados(); renderItems(); }));
  calcularTotales();
}
function valorImporte(id) { return numero($(id)?.value); }
function ponerImporteAutomatico(id, valor, permitirVacio = false) {
  const el = $(id); if (!el || totalesManuales.has(id)) return;
  if (permitirVacio && !(numero(valor) > 0)) { el.value = importeAR(0); return; }
  el.value = importeAR(valor);
}
function calcularTotales() {
  // Todos los conceptos monetarios deben permanecer visibles, incluso cuando
  // la factura no discrimina ese impuesto o percepción.
  ["comprasDescuentos","comprasIibb","comprasSuss","comprasGanancias","comprasOtrosImpuestos"].forEach(id => {
    const el = $(id);
    if (el && !String(el.value || "").trim()) el.value = importeAR(0);
  });
  const subtotalCalculado = items.reduce((s,it)=>s+calcularItem(it),0);
  const basesPorIva = new Map();
  items.forEach(it => { const tasa=numero(it.iva); basesPorIva.set(tasa,(basesPorIva.get(tasa)||0)+calcularItem(it)); });
  const ivaCalculado = [...basesPorIva].reduce((s,[tasa,base])=>s+base*(tasa/100),0);
  const alicuota = (tasa) => alicuotasDetectadas.find(a => Math.abs(numero(a?.tasa)-tasa)<0.01);

  const subtotalAuto = importesDetectados?.subtotal ?? subtotalCalculado;
  // Las tarjetas 21 % y 10,5 % muestran el MONTO DEL IVA de cada alícuota,
  // no la base/neto gravado. Si no existe esa alícuota, se muestra $ 0,00.
  const iva21Auto = alicuota(21)?.iva ?? ((basesPorIva.get(21) ?? 0) * 0.21);
  const iva105Auto = alicuota(10.5)?.iva ?? ((basesPorIva.get(10.5) ?? 0) * 0.105);
  const totalNetoAuto = importesDetectados?.neto ?? subtotalAuto;
  const ivaPorAlicuotas = iva21Auto + iva105Auto;
  const totalIvaAuto = importesDetectados?.iva ?? (ivaPorAlicuotas || ivaCalculado);

  ponerImporteAutomatico("comprasSubtotal", subtotalAuto);
  ponerImporteAutomatico("comprasNeto21", iva21Auto, true);
  ponerImporteAutomatico("comprasNeto105", iva105Auto, true);
  ponerImporteAutomatico("comprasTotalNeto", totalNetoAuto);

  const subtotal = valorImporte("comprasSubtotal");
  const descuentos = valorImporte("comprasDescuentos");
  const neto21 = valorImporte("comprasNeto21");
  const neto105 = valorImporte("comprasNeto105");
  const iibb = valorImporte("comprasIibb");
  const percepcionIva = valorImporte("comprasSuss");
  const ganancias = valorImporte("comprasGanancias");
  const otros = valorImporte("comprasOtrosImpuestos");
  const totalNeto = valorImporte("comprasTotalNeto");
  // Las tarjetas de IVA son editables. El total debe tomar siempre los valores
  // que están actualmente en pantalla, también cuando se edita una factura.
  const totalIva = neto21 + neto105;
  const baseParaTotal = subtotal;
  const totalAuto = Math.max(0, baseParaTotal - descuentos + totalIva + iibb + percepcionIva + ganancias + otros);
  ponerImporteAutomatico("comprasTotal", importesDetectados?.total ?? totalAuto);
  const total = valorImporte("comprasTotal");

  return { subtotal, neto21, neto105, totalNeto, iva21: totalIva, totalIva, descuentos, iibb, percepcionIva, suss: percepcionIva, ganancias, otros, total };
}

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}
async function huellaArchivo(file) {
  if (!window.crypto?.subtle) return `${file.name}|${file.size}|${file.lastModified}`;
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function leerCacheFactura(clave) {
  try {
    const cache = JSON.parse(localStorage.getItem(FACTURA_IA_CACHE_KEY) || "{}");
    return cache?.[clave]?.factura || null;
  } catch { return null; }
}
function guardarCacheFactura(clave, factura) {
  try {
    const cache = JSON.parse(localStorage.getItem(FACTURA_IA_CACHE_KEY) || "{}");
    cache[clave] = { factura, ts: Date.now() };
    const entradas = Object.entries(cache).sort((a,b) => (b[1]?.ts || 0) - (a[1]?.ts || 0)).slice(0, FACTURA_IA_CACHE_MAX);
    localStorage.setItem(FACTURA_IA_CACHE_KEY, JSON.stringify(Object.fromEntries(entradas)));
  } catch (error) {
    // La caché solo acelera lecturas repetidas: si el navegador no tiene espacio,
    // se descarta sin afectar la carga ni el guardado de la factura.
    if (error?.name === "QuotaExceededError") {
      try { localStorage.removeItem(FACTURA_IA_CACHE_KEY); } catch {}
    }
    console.warn("Cache de lectura de factura:", error);
  }
}
function setEstadoArchivo(texto, tipo = "ok") {
  const estado = $("comprasArchivoEstado");
  if (!estado) return;
  estado.classList.remove("oculto", "analizando", "error", "ok");
  estado.classList.add(tipo);
  estado.textContent = texto;
}
function cerrarSelectores(excepto = null) {
  document.querySelectorAll("#adminTab-compras .compras-custom-select.open").forEach(w => { if (w !== excepto) { w.classList.remove("open"); w.querySelector(".compras-select-trigger")?.setAttribute("aria-expanded", "false"); } });
}
function sincronizarSelector(select) {
  const wrap = select?.closest(".compras-custom-select"); if (!wrap) return;
  const trigger = wrap.querySelector(".compras-select-trigger");
  const option = select.options[select.selectedIndex];
  if (trigger) trigger.textContent = option?.textContent || "Seleccionar";
  wrap.querySelectorAll(".compras-select-option").forEach((b, i) => b.classList.toggle("selected", i === select.selectedIndex));
}
function convertirSelector(select) {
  if (!select || select.closest(".compras-custom-select")) return;
  const wrap = document.createElement("div"); wrap.className = "compras-custom-select";
  select.parentNode.insertBefore(wrap, select); wrap.appendChild(select);
  const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "compras-select-trigger"; trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div"); menu.className = "compras-select-menu"; menu.setAttribute("role", "listbox");
  [...select.options].forEach((o, i) => { const b=document.createElement("button"); b.type="button"; b.className="compras-select-option"; b.textContent=o.textContent; b.setAttribute("role","option"); b.addEventListener("click", e=>{e.stopPropagation(); select.selectedIndex=i; select.dispatchEvent(new Event("input",{bubbles:true})); select.dispatchEvent(new Event("change",{bubbles:true})); sincronizarSelector(select); wrap.classList.remove("open"); trigger.setAttribute("aria-expanded","false");}); menu.appendChild(b); });
  wrap.append(trigger, menu); sincronizarSelector(select);
  trigger.addEventListener("click", e=>{e.stopPropagation(); const abrir=!wrap.classList.contains("open"); cerrarSelectores(wrap); wrap.classList.toggle("open",abrir); trigger.setAttribute("aria-expanded",String(abrir));});
}
function inicializarSelectores(scope = document) { scope.querySelectorAll?.("#adminTab-compras select, select[data-k='iva']").forEach(convertirSelector); }
function setValor(id, valor) {
  const el = $(id); if (!el || valor === undefined || valor === null || valor === "") return;
  el.value = valor;
}
function seleccionarOpcion(id, valor) {
  const el = $(id); if (!el || !valor) return;
  const buscado = String(valor).trim().toLowerCase();
  const opcion = [...el.options].find(o => o.value.toLowerCase() === buscado || o.textContent.trim().toLowerCase() === buscado);
  if (opcion) { el.value = opcion.value; sincronizarSelector(el); }
}
function buscarFichaProveedor(datos={}) {
  const cuit = cuitProveedor(datos.cuit || datos.cuit_dni);
  const nombres = [datos.proveedor, datos.razon_social, datos.razonSocial, datos.nombreComercial]
    .map(nombreProveedor).filter(Boolean);
  const fichas = proveedoresGuardados();
  if (cuit) {
    const porCuit = fichas.find(p => cuitProveedor(p.cuit) === cuit);
    if (porCuit) return porCuit;
  }
  return fichas.find(p => [p.razonSocial, p.nombreComercial].map(nombreProveedor).filter(Boolean)
    .some(n => nombres.includes(n))) || null;
}
function autocompletarDesdeProveedor(datos={}) {
  const ficha = buscarFichaProveedor(datos);
  if (!ficha) return false;
  // Los datos maestros del proveedor prevalecen cuando el reconocimiento no pudo leerlos.
  if (ficha.nombreComercial || ficha.razonSocial) setValor("comprasProveedor", ficha.nombreComercial || ficha.razonSocial);
  if (ficha.razonSocial) setValor("comprasRazonSocial", ficha.razonSocial);
  if (ficha.cuit) setValor("comprasCuit", ficha.cuit);
  if (ficha.condicionFiscal) seleccionarOpcion("comprasCondicionFiscal", ficha.condicionFiscal);
  if (ficha.condicionPago) seleccionarOpcion("comprasCondicionPago", ficha.condicionPago);
  if (ficha.rubro) seleccionarOpcion("comprasRubro", ficha.rubro);
  return true;
}
// Bandeja persistente: la cola y el resultado de la IA viven en PostgreSQL.
const escaparLote = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
async function actualizarBandejaFacturas(){
  const lista=$("comprasLoteLista"), estado=$("comprasLoteEstado"); if(!lista||!estado)return;
  try{
    const data=await apiCompras("/admin/compras/pendientes");
    colaPendientesActual=data.pendientes||[];
    const total=colaPendientesActual.length, listas=colaPendientesActual.filter(x=>x.estado==="listo").length, errores=colaPendientesActual.filter(x=>x.estado==="error").length, procesando=colaPendientesActual.filter(x=>["en_cola","procesando"].includes(x.estado)).length;
    estado.textContent=`${total} pendiente(s) · ${listas} para revisar · ${procesando} procesándose · ${errores} con error`;
    lista.innerHTML = colaPendientesActual.length ? colaPendientesActual.map(x => {
      const id = escaparLote(x.id);
      const descripcion = x.estado === "listo" ? "Lista para revisar" : x.estado === "procesando" ? "Analizando…" : x.estado === "en_cola" ? "En cola" : "Error: " + escaparLote(x.error || "No se pudo leer");
      const revisar = x.estado === "listo" ? `<button type="button" data-lote-revisar="${id}">Revisar</button>` : "";
      const reintentar = x.estado === "error" ? `<button type="button" data-lote-reintentar="${id}">Reintentar</button>` : "";
      return `<div class="compras-lote-fila"><div><strong>${escaparLote(x.nombre)}</strong><small>${escaparLote(x.factura?.proveedor || "")} ${escaparLote(x.factura?.numero || "")} · ${descripcion}</small></div><div class="compras-lote-acciones">${revisar}${reintentar}<button type="button" data-lote-quitar="${id}">Quitar</button></div></div>`;
    }).join("") : '<p class="compras-lote-vacio">Todavía no hay facturas pendientes.</p>';
  }catch(e){estado.textContent=`No se pudo consultar la bandeja: ${e.message}`;}
}
async function subirLoteFacturas(archivos){
  if(cargaLoteEnCurso)return;
  const files=[...archivos]; if(!files.length)return;
  cargaLoteEnCurso=true;
  const estado=$("comprasLoteEstado"); let correctos=0, errores=[];
  try{
    for(let i=0;i<files.length;i++){
      const f=files[i];estado.textContent=`Enviando ${i+1} de ${files.length}: ${f.name}`;
      if(!/^(application\/pdf|image\/(jpeg|png))$/.test(f.type)||f.size>14*1024*1024){errores.push(`${f.name}: formato no admitido o supera 14 MB`);continue;}
      try{
        const optimizado=await prepararArchivoAnalisis(f);
        const [base64,textoPdf]=await Promise.all([archivoABase64(optimizado),extraerTextoPdfFactura(optimizado)]);
        await apiCompras("/admin/compras/pendientes",{method:"POST",body:JSON.stringify({nombre:f.name,tipo:optimizado.type,base64,textoPdf})});
        correctos++;
      }catch(e){errores.push(`${f.name}: ${e.message}`);}
      await actualizarBandejaFacturas();
    }
  }finally{cargaLoteEnCurso=false;await actualizarBandejaFacturas();}
  if(errores.length)await avisarCompras("Importación masiva",`${correctos} archivo(s) enviados. ${errores.length} no se pudieron agregar:\n${errores.slice(0,8).join("\n")}`);
}
async function accionPendiente(e){
  const btn=e.target.closest("button");if(!btn)return;
  const id=btn.dataset.loteRevisar||btn.dataset.loteQuitar||btn.dataset.loteReintentar;if(!id)return;
  if(btn.dataset.loteRevisar){
    const item=colaPendientesActual.find(x=>x.id===id);if(!item?.factura)return;
    if(facturaPendienteId && facturaPendienteId!==id){const ok=window.AppDialog?.confirm?await window.AppDialog.confirm({title:"Cambiar factura",message:"Los cambios no guardados de la factura actual se perderán. ¿Continuar?",confirmText:"Continuar",cancelText:"Cancelar"}):confirm("¿Descartar cambios no guardados?");if(!ok)return;}
    resetForm();facturaPendienteId=id;aplicarFacturaExtraida(item.factura);
    mostrarVistaCompras("editor");$("comprasProveedor")?.focus();
    $("comprasLoteEstado").textContent=`Revisando ${item.nombre}. Guardá la factura para quitarla de pendientes.`;
    return;
  }
  if(btn.dataset.loteQuitar){
    const ok=window.AppDialog?.confirm?await window.AppDialog.confirm({title:"Quitar pendiente",message:"¿Quitar esta factura de la bandeja? No se registrará como compra.",confirmText:"Quitar",cancelText:"Cancelar"}):confirm("¿Quitar esta factura pendiente?");if(!ok)return;
    await apiCompras(`/admin/compras/pendientes/${encodeURIComponent(id)}`,{method:"DELETE"});
    if(facturaPendienteId===id)facturaPendienteId=null;
  }else if(btn.dataset.loteReintentar){await apiCompras(`/admin/compras/pendientes/${encodeURIComponent(id)}/reintentar`,{method:"POST"});}
  await actualizarBandejaFacturas();
}
function aplicarFacturaExtraida(f) {
  if (!f || typeof f !== "object") return;
  totalesManuales.clear();
  camposRevision = Array.isArray(f.campos_revision) ? f.campos_revision.filter(Boolean) : [];
  alicuotasDetectadas = Array.isArray(f.alicuotas_iva) ? f.alicuotas_iva.filter(a => numero(a?.tasa)>0 && (numero(a?.neto)>0 || numero(a?.iva)>0)) : [];
  // Algunos comprobantes imprimen el IVA 21% claramente pero el analizador lo
  // devuelve en iva_21/iva_total sin crear alicuotas_iva. No perder ese monto.
  if (!alicuotasDetectadas.some(a => Math.abs(numero(a?.tasa) - 21) < 0.01) && numero(f.iva_21) > 0) {
    alicuotasDetectadas.push({ tasa: 21, neto: numero(f.neto_gravado_21), iva: numero(f.iva_21) });
  }
  setValor("comprasProveedor", f.proveedor || f.razon_social);
  setValor("comprasRazonSocial", f.razon_social || f.proveedor);
  setValor("comprasCuit", f.cuit);
  seleccionarOpcion("comprasCondicionFiscal", f.condicion_fiscal);
  seleccionarOpcion("comprasComprobante", f.comprobante);
  setValor("comprasPuntoVenta", f.punto_venta);
  setValor("comprasNumero", f.numero);
  setValor("comprasFecha", f.fecha);
  setValor("comprasVencimientoCae", f.vencimiento_cae);
  seleccionarOpcion("comprasCondicionPago", f.condicion_pago);
  seleccionarOpcion("comprasMoneda", f.moneda);
  // Si el proveedor ya existe, completar CUIT, razón social y preferencias guardadas.
  autocompletarDesdeProveedor(f);
  if ($("comprasDescuentos")) $("comprasDescuentos").value = importeAR(f.descuentos);
  if ($("comprasOtrosImpuestos")) $("comprasOtrosImpuestos").value = importeAR(f.otros_impuestos);
  if ($("comprasIibb")) $("comprasIibb").value = importeAR(f.iibb || f.ingresos_brutos);
  if ($("comprasSuss")) $("comprasSuss").value = importeAR(f.percepcion_iva ?? f.percepcionIva ?? f.suss);
  if ($("comprasGanancias")) $("comprasGanancias").value = importeAR(f.ganancias);
  if (f.observaciones) setValor("comprasObservaciones", f.observaciones);
  const detectados = Array.isArray(f.items) ? f.items.filter(it => it && (it.descripcion || it.codigo || numero(it.subtotal) > 0)) : [];
  if (detectados.length) {
    items = detectados.map(it => ({
      codigo: String(it.codigo || ""), descripcion: String(it.descripcion || ""),
      cantidad: numero(it.cantidad) || 1, precio: numero(it.precio_unitario), iva: numero(it.iva),
      subtotalDetectado: Number.isFinite(Number(it.subtotal)) ? numero(it.subtotal) : null
    }));
  }
  const subtotalLineas = detectados.reduce((a,it)=>a+numero(it.subtotal),0);
  importesDetectados = {
    // El subtotal sin impuestos es el neto impreso, no el total con IVA.
    // Si el neto no se leyó pero sí el total y el IVA, se infiere solo la base.
    subtotal: numero(f.neto_gravado || f.neto_gravado_21 || f.subtotal || (numero(f.total) > numero(f.iva_total || f.iva_21) ? numero(f.total) - numero(f.iva_total || f.iva_21) : 0) || subtotalLineas),
    neto: numero(f.neto_gravado || f.neto_gravado_21 || f.subtotal || (numero(f.total) > numero(f.iva_total || f.iva_21) ? numero(f.total) - numero(f.iva_total || f.iva_21) : 0) || subtotalLineas),
    iva: numero(f.iva_total || f.iva_21),
    total: numero(f.total)
  };

  // El módulo ya no muestra el detalle de ítems. Antes la actualización de los
  // importes dependía de renderItems(), pero esa función sale inmediatamente
  // cuando no existe comprasItemsBody. Actualizamos los totales directamente
  // después de guardar los importes detectados para que siempre se reflejen.
  calcularTotales();
  renderItems();
}

function setEstadoDropzoneFactura(estado, file = archivoActual) {
  const dz = $("comprasDropzone");
  if (!dz) return;
  dz.classList.remove("is-uploading", "is-uploaded", "is-upload-error");
  if (estado) dz.classList.add(`is-${estado}`);
  if (!file) return;
  const tipoArchivo = file.type === "application/pdf" ? "PDF" : "Imagen";
  const tamanoArchivo = `${(file.size/1024/1024).toFixed(2)} MB`;
  const nombre = $("comprasArchivoNombre");
  const meta = $("comprasArchivoMeta");
  if (nombre) nombre.textContent = file.name;
  if (meta) {
    if (estado === "uploading") meta.textContent = `Archivo recibido · Extrayendo datos de la factura… · ${tipoArchivo} · ${tamanoArchivo}`;
    else if (estado === "uploaded") meta.textContent = `Datos de la factura cargados · ${tipoArchivo} · ${tamanoArchivo}`;
    else if (estado === "upload-error") meta.textContent = `No se pudo subir la factura · ${tipoArchivo} · ${tamanoArchivo}`;
  }
}

// Reducir fotos grandes antes de enviarlas acelera la transferencia y la lectura
// sin alterar el archivo original ni la vista previa. Las fotos pequeñas y los
// PDF se envían intactos para no perder precisión en textos diminutos.
async function prepararArchivoAnalisis(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) return file;
  const imagen = await createImageBitmap(file);
  try {
    // Las fotos de celular pueden pesar muy poco por compresión y aun así tener
    // 3000/4000 px. Reducimos por dimensiones (no por peso) para que la IA tenga
    // menos imagen que procesar sin perder legibilidad del comprobante.
    const maxLado = 1800;
    const escala = Math.min(1, maxLado / Math.max(imagen.width, imagen.height));
    if (escala === 1 && file.type === "image/jpeg") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagen.width * escala));
    canvas.height = Math.max(1, Math.round(imagen.height * escala));
    canvas.getContext("2d", { alpha: false }).drawImage(imagen, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.(png|jpe?g)$/i, ".jpg"), { type: "image/jpeg" });
  } finally { imagen.close(); }
}

async function extraerFactura(file) {
  if (!$("comprasAutoDetectar")?.checked) return;
  const token = ++facturaAnalisisToken;
  setEstadoDropzoneFactura("uploading", file);
  setEstadoArchivo(`Extrayendo datos de ${file.name}…`, "analizando");
  try {
    // La vista previa y la lectura IA son independientes. Si este mismo archivo ya
    // fue analizado en este navegador, reutilizamos el resultado y evitamos otra
    // subida + otra llamada a IA.
    // Hash y preparación de imagen se hacen en paralelo: no hay motivo para
    // esperar uno antes de empezar el otro.
    const [claveCache, archivoAnalisis] = await Promise.all([
      huellaArchivo(file),
      prepararArchivoAnalisis(file)
    ]);
    if (token !== facturaAnalisisToken || archivoActual !== file) return;
    const facturaCacheada = leerCacheFactura(claveCache);
    if (facturaCacheada) {
      aplicarFacturaExtraida(facturaCacheada);
      $("comprasArchivoEstado")?.classList.add("oculto");
      setEstadoDropzoneFactura("uploaded", file);
      return;
    }

    const [base64, textoPdf] = await Promise.all([
      archivoABase64(archivoAnalisis), extraerTextoPdfFactura(archivoAnalisis)
    ]);
    if (token !== facturaAnalisisToken || archivoActual !== file) return;
    const apiBase = String(API_BASE_URL || window.API_BASE_URL || "").replace(/\/$/, "");
    const inicioPeticion = performance.now();
    const respuesta = await fetch(`${apiBase}/compras/facturas/extraer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: archivoAnalisis.name, tipo: archivoAnalisis.type, base64, textoPdf })
    });
    const tipoRespuesta = respuesta.headers.get("content-type") || "";
    const data = tipoRespuesta.includes("application/json") ? await respuesta.json().catch(() => ({})) : {};
    if (!respuesta.ok) {
      const detalle = data.error || data.mensaje || `El servidor respondió HTTP ${respuesta.status}`;
      throw new Error(detalle);
    }
    if (token !== facturaAnalisisToken || archivoActual !== file) return;
    aplicarFacturaExtraida(data.factura);
    guardarCacheFactura(claveCache, data.factura);
    console.info(`[Facturas] análisis completado en ${Math.round(performance.now() - inicioPeticion)} ms${data.cache ? " (cache servidor)" : ""}`);
    $("comprasArchivoEstado")?.classList.add("oculto");
    setEstadoDropzoneFactura("uploaded", file);
  } catch (error) {
    if (token !== facturaAnalisisToken || archivoActual !== file) return;
    console.error("Lectura automática de factura:", error);
    setEstadoArchivo(`⚠ ${error.message || "No se pudo leer automáticamente"}. Podés completar los datos manualmente.`, "error");
    setEstadoDropzoneFactura("upload-error", file);
  }
}
async function dibujarPaginaPdf() {
  const preview = $("comprasPreview");
  const page = pdfPaginaActual;
  if (!preview || !page || !archivoActual) return;
  const token = ++pdfRenderToken;
  const baseViewport = page.getViewport({ scale: 1 });
  const anchoBase = Math.max(220, preview.clientWidth - 18);
  const escalaAjuste = anchoBase / baseViewport.width;
  const escalaVisual = Math.max(.5, escalaAjuste * previewZoom);
  const viewport = page.getViewport({ scale: escalaVisual });

  // El canvas se renderiza a resolución física real (DPR), no se agranda con CSS.
  // Así, al hacer zoom se vuelve a dibujar el PDF y el texto conserva nitidez.
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.className = "compras-pdf-canvas";
  canvas.width = Math.ceil(viewport.width * dpr);
  canvas.height = Math.ceil(viewport.height * dpr);
  canvas.style.width = `${Math.ceil(viewport.width)}px`;
  canvas.style.height = `${Math.ceil(viewport.height)}px`;
  const ctx = canvas.getContext("2d", { alpha: false });
  await page.render({
    canvasContext: ctx,
    viewport,
    transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0]
  }).promise;
  if (token !== pdfRenderToken || !archivoActual || page !== pdfPaginaActual) return;
  preview.innerHTML = "";
  preview.appendChild(canvas);
  // El documento siempre comienza en su borde superior. Antes el flex centrado
  // podía dejar la cabecera fuera del área alcanzable por el scroll.
  preview.scrollTop = 0;
  preview.scrollLeft = 0;
}

// Extrae texto localmente con PDF.js (ya utilizado para la vista previa).
// Si la extracción falla, el servidor sigue leyendo el PDF original.
async function extraerTextoPdfFactura(file) {
  if (file?.type !== "application/pdf") return "";
  try {
    const pdfjsLib = await import(PDFJS_URL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const pdf = pdfDocumentoActual && archivoActual === file
      ? pdfDocumentoActual
      : await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    if (pdf.numPages > 5) return "";
    const partes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pagina = await pdf.getPage(i);
      const contenido = await pagina.getTextContent();
      // Los saltos de línea conservan mejor las columnas que unir todo con espacios.
      partes.push(contenido.items.map(item => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join(""));
    }
    return partes.join("\n\n").slice(0, 55001);
  } catch (error) {
    console.warn("[Facturas] No se pudo extraer texto del PDF; se usará el archivo original.", error);
    return "";
  }
}
async function renderizarPdf(file) {
  const preview = $("comprasPreview");
  if (!preview) return;
  const token = ++pdfRenderToken;
  pdfDocumentoActual = null;
  pdfPaginaActual = null;
  preview.className = "compras-preview-empty compras-pdf-canvas-wrap";
  preview.innerHTML = '<span class="compras-pdf-loading">Preparando vista previa del PDF…</span>';
  try {
    const pdfjsLib = await import(PDFJS_URL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    if (token !== pdfRenderToken || archivoActual !== file) return;
    const page = await pdf.getPage(1);
    if (token !== pdfRenderToken || archivoActual !== file) return;
    pdfDocumentoActual = pdf;
    pdfPaginaActual = page;
    const baseViewport = page.getViewport({ scale: 1 });
    const anchoDisponible = Math.max(220, preview.clientWidth - 18);
    preview.style.height = `${Math.round(anchoDisponible * (baseViewport.height / baseViewport.width)) + 18}px`;
    preview.closest(".compras-preview-card")?.classList.add("has-document");
    await dibujarPaginaPdf();
  } catch (error) {
    console.error("Vista previa PDF:", error);
    if (archivoActual !== file) return;
    preview.innerHTML = '<svg class="app-icon"><use href="#icon-clipboard"></use></svg><span>No se pudo dibujar la vista previa del PDF. El análisis automático igualmente continuará.</span>';
  }
}
function setArchivo(file) {
  if (!file) return;
  if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) { void avisarCompras("Formato no permitido", "Usá PDF, JPG o PNG."); return; }
  archivoActual = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file); previewZoom=1;
  const preview=$("comprasPreview");
  if (file.type === "application/pdf") {
    renderizarPdf(file);
  } else {
    preview.className="compras-preview-empty";
    preview.style.height = "";
    preview.closest(".compras-preview-card")?.classList.add("has-document");
    preview.innerHTML=`<img src="${previewUrl}" alt="Vista previa de factura">`;
    const img = preview.querySelector("img");
    img?.addEventListener("load", () => {
      if (!img.naturalWidth || archivoActual !== file) return;
      const anchoDisponible = Math.max(220, preview.clientWidth - 18);
      preview.style.height = `${Math.round(anchoDisponible * (img.naturalHeight / img.naturalWidth)) + 18}px`;
    }, { once:true });
  }
  const dz=$("comprasDropzone");
  dz?.classList.add("is-loaded");
  // La vista previa está lista, pero la extracción todavía no terminó.
  if ($("comprasAutoDetectar")?.checked) {
    extraerFactura(file);
  } else {
    setEstadoDropzoneFactura("uploaded", file);
  }
}
function ajustarZoom(delta=0, reset=false){
  previewZoom=reset?1:Math.min(3,Math.max(.5,previewZoom+delta));
  const preview=$("comprasPreview");
  if (pdfPaginaActual && archivoActual?.type === "application/pdf") {
    dibujarPaginaPdf();
    return;
  }
  const img=preview?.querySelector("img");
  if(img){
    img.style.width=`${previewZoom * 100}%`;
    img.style.height="auto";
    img.style.maxWidth="none";
    img.style.transform="none";
  }
}
function limpiarArchivo(soloArchivo=false){
  pdfRenderToken++; facturaAnalisisToken++; pdfDocumentoActual=null; pdfPaginaActual=null; archivoActual=null; if(previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=""; previewZoom=1;
  const p=$("comprasPreview"); if(p){p.className="compras-preview-empty";p.style.height="";p.closest(".compras-preview-card")?.classList.remove("has-document");p.innerHTML='<svg class="app-icon"><use href="#icon-clipboard"></use></svg><span>Importá una factura para verla aquí</span>';}
  $("comprasDropzone")?.classList.remove("is-loaded", "is-uploading", "is-uploaded", "is-upload-error");
  if($("comprasArchivoNombre")) $("comprasArchivoNombre").textContent="";
  if($("comprasArchivoMeta")) $("comprasArchivoMeta").textContent="";
  $("comprasArchivoEstado")?.classList.add("oculto"); if($("comprasArchivo")) $("comprasArchivo").value="";
  if(!soloArchivo) resetForm(false);
}
function actualizarModoEdicion(){
  const editando=Boolean(facturaEditandoId);
  const titulo=document.querySelector("#comprasEditor .compras-hero-title h1");
  const subtitulo=document.querySelector("#comprasEditor .compras-hero-title p");
  if(titulo) titulo.textContent=editando?"Editar Factura":"Nueva Factura";
  if(subtitulo) subtitulo.textContent=editando?"Modificá los datos del comprobante y guardá los cambios.":"Cargá una factura, importá una imagen o PDF y registrá todos los datos del comprobante.";
  const guardarBtn=$("comprasGuardar");
  if(guardarBtn) guardarBtn.innerHTML=`<svg class="app-icon"><use href="#icon-save"></use></svg>${editando?"Guardar cambios":"Guardar factura"}`;
  const cancelarBtn=$("comprasCancelar");
  if(cancelarBtn) cancelarBtn.innerHTML=editando?`Cancelar edición`:`<svg class="app-icon"><use href="#icon-trash"></use></svg>Limpiar`;
}
function resetForm(limpiarArchivoTambien=true, conservarModoEdicion=false){
  if(!conservarModoEdicion){ facturaEditandoId=null; facturaPendienteId=null; }
  actualizarModoEdicion();
  importesDetectados=null; alicuotasDetectadas=[]; camposRevision=[]; totalesManuales.clear();
  ["comprasProveedor","comprasCuit","comprasRazonSocial","comprasPuntoVenta","comprasNumero","comprasVencimientoCae","comprasObservaciones"].forEach(id=>{if($(id))$(id).value=""});
  const defaults={comprasCondicionFiscal:"Responsable Inscripto",comprasComprobante:"",comprasCondicionPago:"",comprasMoneda:"Pesos",comprasRubro:""};
  Object.entries(defaults).forEach(([id,v])=>{if($(id)){ $(id).value=v; sincronizarSelector($(id)); }});
  if($("comprasFecha"))$("comprasFecha").value=hoy(); ["comprasSubtotal","comprasDescuentos","comprasNeto21","comprasNeto105","comprasIibb","comprasSuss","comprasGanancias","comprasOtrosImpuestos","comprasTotalNeto","comprasTotal"].forEach(id=>{if($(id))$(id).value="";});
  items=[itemVacio()]; adjuntos=[]; if(limpiarArchivoTambien) limpiarArchivo(true); renderItems(); renderAdjuntos(); calcularTotales();
}
function construirRegistro(base={}){ const t=calcularTotales(); return { ...base, id: base.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, creadoEn:base.creadoEn || new Date().toISOString(), proveedor:valor("comprasProveedor"), cuit:valor("comprasCuit"), razonSocial:valor("comprasRazonSocial"), condicionFiscal:valor("comprasCondicionFiscal"), comprobante:valor("comprasComprobante"), puntoVenta:valor("comprasPuntoVenta"), numero:valor("comprasNumero"), fecha:valor("comprasFecha"), condicionPago:valor("comprasCondicionPago"), moneda:valor("comprasMoneda"), rubro:valor("comprasRubro"), vencimientoCae:valor("comprasVencimientoCae"), observaciones:valor("comprasObservaciones"), items:items.map(x=>({...x})), ...t, archivo: archivoActual ? {nombre:archivoActual.name,tipo:archivoActual.type,tamano:archivoActual.size} : null, adjuntos:adjuntos.map(f=>({nombre:f.name,tipo:f.type,tamano:f.size})) }; }
// Identidad fiscal del comprobante: los formatos con guiones, espacios o ceros
// iniciales no deben permitir registrar nuevamente la misma factura.
function normalizarIdentificadorFiscal(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}
function normalizarNumeroComprobante(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos ? digitos.replace(/^0+(?=\d)/, "") : "";
}
function normalizarTipoComprobante(valor) {
  return String(valor ?? "").trim().toLocaleLowerCase("es-AR").replace(/\s+/g, " ");
}
function esFacturaDuplicada(nueva, anterior) {
  const cuit = normalizarIdentificadorFiscal(nueva.cuit);
  const punto = normalizarNumeroComprobante(nueva.puntoVenta);
  const numero = normalizarNumeroComprobante(nueva.numero);
  const tipo = normalizarTipoComprobante(nueva.comprobante);
  if (!cuit || !punto || !numero || !tipo) return false;
  return cuit === normalizarIdentificadorFiscal(anterior.cuit)
    && punto === normalizarNumeroComprobante(anterior.puntoVenta)
    && numero === normalizarNumeroComprobante(anterior.numero)
    && tipo === normalizarTipoComprobante(anterior.comprobante);
}
async function avisarFacturaDuplicada() {
  const opciones = {
    title: "Factura ya cargada",
    message: "Este comprobante ya se encuentra registrado en el sistema. No es posible guardar nuevamente la misma factura.",
    confirmText: "Aceptar"
  };
  if (window.AppDialog?.alert) await window.AppDialog.alert(opciones);
  else await avisarCompras(opciones.title, opciones.message);
  // Tras aceptar, descartar los datos del comprobante duplicado y su archivo.
  resetForm();
}
async function guardar(){
  const listaActual=facturas();
  const original=facturaEditandoId?listaActual.find(f=>String(f.id)===String(facturaEditandoId)):null;
  const r=construirRegistro(original||{});
  if(!r.proveedor){
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:"Falta el proveedor",message:"Completá el proveedor antes de guardar.",confirmText:"Aceptar"});
    else await avisarCompras("Falta el proveedor", "Completá el proveedor antes de guardar.");
    $("comprasProveedor")?.focus();
    return;
  }
  if(!r.fecha){
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:"Falta la fecha",message:"Completá la fecha del comprobante.",confirmText:"Aceptar"});
    else await avisarCompras("Falta la fecha", "Completá la fecha del comprobante.");
    return;
  }

  // Verificar antes de pedir confirmación; al aceptar el aviso se limpia el formulario.
  if (listaActual.some(f => String(f.id)!==String(facturaEditandoId||"") && esFacturaDuplicada(r, f))) {
    await avisarFacturaDuplicada();
    return;
  }

  let confirmado=true;
  if(window.AppDialog?.confirm){
    confirmado=await window.AppDialog.confirm({
      title:facturaEditandoId?"Guardar cambios":"Guardar factura",
      message:facturaEditandoId?`¿Querés guardar los cambios de la factura ${r.comprobante || ""} ${r.numero || ""} de ${r.proveedor}?`:`¿Querés guardar la factura ${r.comprobante || ""} ${r.numero || ""} de ${r.proveedor}?`,
      confirmText:facturaEditandoId?"Guardar cambios":"Guardar factura",
      cancelText:"Cancelar",
      tone:"primary"
    });
  }
  if(!confirmado) return;

  try{
    const lista=facturas();
    // Revalidar después del diálogo, por si el historial cambió mientras estaba abierto.
    if (lista.some(f => String(f.id)!==String(facturaEditandoId||"") && esFacturaDuplicada(r, f))) {
      await avisarFacturaDuplicada();
      return;
    }
    const eraEdicion=Boolean(facturaEditandoId);
    if(eraEdicion){
      const indice=lista.findIndex(f=>String(f.id)===String(facturaEditandoId));
      if(indice<0) throw new Error("La factura que se estaba editando ya no existe.");
      lista[indice]=r;
    } else lista.unshift(r);
    await guardarFacturaServidor(r);
    await guardarFacturas(lista);
    if(facturaPendienteId){
      const pendienteConfirmado=facturaPendienteId;facturaPendienteId=null;
      try{await apiCompras(`/admin/compras/pendientes/${encodeURIComponent(pendienteConfirmado)}`,{method:"DELETE"});}
      catch(error){console.warn("Factura guardada; no se pudo quitar el pendiente",error);}
      void actualizarBandejaFacturas();
    }
    // El comprobante ya fue persistido en PostgreSQL: crear/actualizar la ficha únicamente si corresponde.
    // Una falla de almacenamiento de proveedores no debe anunciar que falló la factura.
    try { await registrarProveedorDeFactura(r); }
    catch (error) { console.warn("Factura guardada; no se pudo crear la ficha del proveedor", error); }
    actualizarResumen();
    renderHistorial();
    resetForm();
    if(eraEdicion) mostrarVistaCompras("historial");
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:eraEdicion?"Cambios guardados":"Factura guardada",message:eraEdicion?"Los cambios de la factura se guardaron correctamente.":"La factura se guardó correctamente.",confirmText:"Aceptar"});
    else await avisarCompras(eraEdicion?"Cambios guardados":"Factura guardada",eraEdicion?"Los cambios de la factura se guardaron correctamente.":"La factura se guardó correctamente.");
  }catch(error){
    console.error("No se pudo guardar la factura",error);
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:"No se pudo guardar",message:"Ocurrió un error al guardar la factura. Intentá nuevamente.",confirmText:"Aceptar"});
    else await avisarCompras("No se pudo guardar", "No se pudo guardar la factura. Intentá nuevamente.");
  }
}
function renderAdjuntos(){ const c=$("comprasAdjuntosLista"); if(c) c.innerHTML=adjuntos.map(f=>`<small style="display:block;margin-top:6px;color:#697386">• ${f.name}</small>`).join(""); }
function fechaCargaLocal(f){
  if(!f.creadoEn) return "";
  const fecha=new Date(f.creadoEn);
  if(Number.isNaN(fecha.getTime())) return "";
  return `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,"0")}-${String(fecha.getDate()).padStart(2,"0")}`;
}
function fechaCorta(fecha){return /^\d{4}-\d{2}-\d{2}$/.test(fecha||"")?fecha.split("-").reverse().join("/"):"—";}
function actualizarResumen(){
  const lista=facturas(), mes=hoy().slice(0,7), delMes=lista.filter(f=>String(f.fecha||f.creadoEn).slice(0,7)===mes), gasto=delMes.reduce((s,f)=>s+numero(f.total),0);
  if($("adminComprasFacturasMes"))$("adminComprasFacturasMes").textContent=delMes.length;
  if($("adminComprasGastoMes"))$("adminComprasGastoMes").textContent=money(gasto);
  if($("comprasKpiFacturas"))$("comprasKpiFacturas").textContent=delMes.length;
  if($("comprasKpiCompras"))$("comprasKpiCompras").textContent=money(gasto);
  const proveedores=new Map();
  lista.forEach(f=>{const k=(f.cuit||f.proveedor||"").trim();if(!k)return;const a=proveedores.get(k)||{nombre:f.proveedor||f.razonSocial||"—",cuit:f.cuit||"—",cantidad:0,total:0};a.cantidad++;a.total+=numero(f.total);proveedores.set(k,a);});
  if($("comprasKpiProveedores"))$("comprasKpiProveedores").textContent=proveedores.size;
  const ultima=lista.slice().sort((a,b)=>String(b.fecha||b.creadoEn||"").localeCompare(String(a.fecha||a.creadoEn||"")))[0];
  if($("comprasKpiUltima"))$("comprasKpiUltima").textContent=ultima?.fecha?ultima.fecha.split("-").reverse().join("/"):"—";
  if($("comprasKpiUltimaMeta"))$("comprasKpiUltimaMeta").textContent=ultima?ultima.proveedor||"último comprobante":"sin registros";
  const hoyCargadas=lista.filter(f=>fechaCargaLocal(f)===hoy()).sort((a,b)=>String(b.creadoEn).localeCompare(String(a.creadoEn)));
  const ub=$("comprasUltimasBody"); if(ub) ub.innerHTML=hoyCargadas.map(f=>`<tr><td>${f.fecha?f.fecha.split("-").reverse().join("/"):"—"}</td><td>${f.proveedor||"—"}</td><td>${f.comprobante||"—"}</td><td>${f.numero||"—"}</td><td><strong>${money(f.total)}</strong></td><td><div class="compras-mini-actions"><button class="compras-mini-action" type="button" data-mini-view="${f.id}" aria-label="Ver factura"><svg class="app-icon"><use href="#icon-eye"></use></svg></button><button class="compras-mini-action pink" type="button" data-mini-copy="${f.id}" aria-label="Duplicar factura"><svg class="app-icon"><use href="#icon-copy"></use></svg></button></div></td></tr>`).join("")||'<tr><td colspan="6" class="compras-mini-empty">Todavía no se cargaron facturas hoy.</td></tr>';

}
let paginaHistorial=1,paginaProveedores=1;
const porPaginaCompras=8;
function paginasCompras(id,info,total,pagina,cambiar){
  const paginas=Math.max(1,Math.ceil(total/porPaginaCompras));pagina=Math.min(pagina,paginas);
  const inicio=total?(pagina-1)*porPaginaCompras+1:0,fin=Math.min(pagina*porPaginaCompras,total);
  $(info).textContent=`Mostrando ${inicio} a ${fin} de ${total} registros`;
  const botones=$(id);botones.innerHTML="";
  for(const n of [pagina-1,...Array.from({length:paginas},(_,i)=>i+1).filter(n=>paginas<=7||Math.abs(n-pagina)<=2||n===1||n===paginas),pagina+1]){
    if(n<1||n>paginas)continue;
    const boton=document.createElement("button");boton.type="button";boton.textContent=n===pagina-1?"‹":n===pagina+1?"›":String(n);
    if(n===pagina)boton.classList.add("active");boton.addEventListener("click",()=>cambiar(n));botones.appendChild(boton);
  }
}
function cargarFacturaParaEditar(id){
  const f=facturas().find(x=>String(x.id)===String(id));
  if(!f)return;
  facturaEditandoId=f.id;
  resetForm(true,true);
  facturaEditandoId=f.id;
  const campos={comprasProveedor:f.proveedor,comprasCuit:f.cuit,comprasRazonSocial:f.razonSocial,comprasCondicionFiscal:f.condicionFiscal,comprasComprobante:f.comprobante,comprasPuntoVenta:f.puntoVenta,comprasNumero:f.numero,comprasFecha:f.fecha,comprasCondicionPago:f.condicionPago,comprasMoneda:f.moneda,comprasRubro:f.rubro,comprasVencimientoCae:f.vencimientoCae,comprasObservaciones:f.observaciones,comprasSubtotal:f.subtotal,comprasDescuentos:f.descuentos,comprasNeto21:f.neto21,comprasNeto105:f.neto105,comprasIibb:f.iibb,comprasSuss:f.suss,comprasGanancias:f.ganancias,comprasOtrosImpuestos:f.otrosImpuestos,comprasTotalNeto:f.totalNeto,comprasTotal:f.total};
  for(const [idCampo,dato] of Object.entries(campos)){const el=$(idCampo);if(!el)continue;el.value=dato??"";sincronizarSelector(el);}
  items=Array.isArray(f.items)&&f.items.length?f.items.map(x=>({...x})):[itemVacio()];
  renderItems();
  ["comprasSubtotal","comprasDescuentos","comprasNeto21","comprasNeto105","comprasIibb","comprasSuss","comprasGanancias","comprasOtrosImpuestos","comprasTotalNeto","comprasTotal"].forEach(idCampo=>{if($(idCampo)&&campos[idCampo]!==undefined)$(idCampo).value=importeAR(campos[idCampo]);});
  const contador=document.querySelector("#adminTab-compras .compras-char-count");if(contador)contador.textContent=`${String(f.observaciones||"").length} / 500`;
  actualizarModoEdicion();
  mostrarVistaCompras("editor");
}
function cancelarEdicionOLimpiar(){
  if(facturaEditandoId){resetForm();mostrarVistaCompras("historial");}
  else resetForm();
}
function renderHistorial(){
  const q=(valor("comprasHistBuscar")||"").trim().toLocaleLowerCase("es"),tipo=valor("comprasHistTipo"),desde=valor("comprasHistDesde"),hasta=valor("comprasHistHasta"),proveedor=valor("comprasHistProveedor");
  const todas=facturas(),selector=$("comprasHistProveedor"),seleccion=selector?.value||"";
  if(selector){const nombres=[...new Set(todas.map(f=>f.proveedor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));selector.innerHTML='<option value="">Todos los proveedores</option>'+nombres.map(n=>`<option value="${escaparHtml(n)}">${escaparHtml(n)}</option>`).join("");selector.value=seleccion;}
  const lista=todas.filter(f=>{const fecha=String(f.fecha||"");return (!tipo||f.comprobante===tipo)&&(!desde||fecha>=desde)&&(!hasta||fecha<=hasta)&&(!proveedor||f.proveedor===proveedor)&&(!q||[f.proveedor,f.razonSocial,f.cuit,f.numero,f.puntoVenta,f.rubro,f.comprobante].join(" ").toLocaleLowerCase("es").includes(q));}).sort((a,b)=>String(b.creadoEn||b.fecha||"").localeCompare(String(a.creadoEn||a.fecha||"")));
  const total=lista.reduce((s,f)=>s+numero(f.total),0);$("comprasHistCantidad").textContent=lista.length;$("comprasHistTotal").textContent=money(total);$("comprasHistPromedio").textContent=money(lista.length?total/lista.length:0);
  const mesActual=hoy().slice(0,7);$("comprasHistUltimoMes").textContent=money(todas.filter(f=>String(f.fecha||"").startsWith(mesActual)).reduce((s,f)=>s+numero(f.total),0));
  paginaHistorial=Math.min(paginaHistorial,Math.max(1,Math.ceil(lista.length/porPaginaCompras)));
  const body=$("comprasHistBody");body.innerHTML=lista.slice((paginaHistorial-1)*porPaginaCompras,paginaHistorial*porPaginaCompras).map(f=>`<tr><td>${escaparHtml(f.creadoEn?new Date(f.creadoEn).toLocaleString("es-AR"):"—")}</td><td>${fechaCorta(f.fecha)}</td><td><strong>${escaparHtml(f.proveedor||"—")}</strong></td><td>${escaparHtml(f.comprobante||"—")}</td><td>${escaparHtml(f.numero||"—")}</td><td>${escaparHtml(f.puntoVenta||"—")}</td><td><span class="compras-fiscal-tag">${escaparHtml(f.condicionFiscal||"—")}</span></td><td><strong>${money(f.total)}</strong></td><td class="compras-note-cell" title="${escaparHtml(f.observaciones||"")}">${escaparHtml(f.observaciones||"—")}</td><td><div class="compras-history-actions"><button class="compras-row-action edit" type="button" data-edit="${escaparHtml(f.id)}" title="Editar factura" aria-label="Editar factura"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg></button><button class="compras-row-action danger" type="button" data-remove="${escaparHtml(f.id)}" title="Eliminar factura" aria-label="Eliminar factura"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></button></div></td></tr>`).join("")||'<tr><td colspan="10" class="compras-history-empty">No hay facturas para los filtros seleccionados.</td></tr>';
  paginasCompras("comprasHistPaginas","comprasHistPaginacionInfo",lista.length,paginaHistorial,n=>{paginaHistorial=n;renderHistorial();});
  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>cargarFacturaParaEditar(b.dataset.edit)));
  body.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",async()=>{const ok=window.AppDialog?.confirm?await window.AppDialog.confirm({title:"Eliminar factura",message:"¿Eliminar esta factura del historial?",confirmText:"Eliminar",cancelText:"Cancelar"}):confirm("¿Eliminar esta factura del historial?");if(!ok)return;try{await apiCompras(`/admin/compras/facturas/${encodeURIComponent(b.dataset.remove)}`,{method:"DELETE"});await guardarFacturas(facturas().filter(f=>String(f.id)!==b.dataset.remove));renderHistorial();actualizarResumen();}catch(error){console.error("No se pudo eliminar la factura",error);await avisarCompras("No se pudo eliminar", "No se pudo eliminar la factura.");}}));
}

function escaparHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
const PROVEEDORES_KEY="autoservicio_proveedores_fichas_v1";
const proveedoresGuardados=()=>proveedoresMemoria;
async function guardarProveedores(a, proveedorActualizado=null){
  // El servidor confirma primero. La memoria local nunca se modifica antes de
  // saber que PostgreSQL aceptó el cambio; así un error no deja "proveedores fantasma".
  if(proveedorActualizado)await apiCompras(`/admin/compras/proveedores/${encodeURIComponent(proveedorActualizado.id)}`,{method:"PUT",body:JSON.stringify(proveedorActualizado)});
  proveedoresMemoria=Array.isArray(a)?a.map(p=>({...p})):[];
  await guardarSnapshotCompras().catch(()=>{});
}
// Comparación consistente con los registros históricos y las fichas manuales.
const cuitProveedor = valor => String(valor ?? "").replace(/\D/g, "");
const nombreProveedor = valor => String(valor ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
async function registrarProveedorDeFactura(factura) {
 const cuit = cuitProveedor(factura.cuit);
 const razonSocial = String(factura.razonSocial || factura.proveedor || "").trim();
 const nombreComercial = String(factura.proveedor || "").trim();
 if (!cuit && !razonSocial) return;
 const fichas = proveedoresGuardados();
 // Si el CUIT está disponible es el identificador prioritario. Una ficha sin
 // CUIT puede completarse cuando coinciden los nombres, sin perder datos.
 let ficha = fichas.find(p => cuit && cuitProveedor(p.cuit) === cuit);
 if (!ficha) ficha = fichas.find(p =>
   (!cuitProveedor(p.cuit) || !cuit) &&
   [p.razonSocial, p.nombreComercial].some(n => nombreProveedor(n) &&
     [razonSocial, nombreComercial].some(f => nombreProveedor(f) === nombreProveedor(n)))
 );
 if (ficha) {
   // Completar exclusivamente datos vacíos; nunca sobrescribir la edición manual.
   let cambio = false;
   for (const [campo, dato] of Object.entries({cuit, razonSocial, nombreComercial, condicionFiscal: factura.condicionFiscal || "", condicionPago: factura.condicionPago || "", rubro: factura.rubro || ""})) {
     if (!ficha[campo] && dato) { ficha[campo] = dato; cambio = true; }
   }
   // Rubro y condición de pago son preferencias operativas: la última selección de la factura queda como predeterminada.
   for (const [campo, dato] of Object.entries({condicionPago: factura.condicionPago || "", rubro: factura.rubro || ""})) {
     if (dato && ficha[campo] !== dato) { ficha[campo] = dato; cambio = true; }
   }
   if (cambio) await guardarProveedores(fichas, ficha);
   return;
 }
 const codigo = String(Math.max(0, ...fichas.map(p => Number(p.codigo) || 0)) + 1).padStart(3, "0");
 fichas.push({id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
   codigo, razonSocial, nombreComercial, cuit,
   condicionFiscal: factura.condicionFiscal || "", condicionPago: factura.condicionPago || "", rubro: factura.rubro || "", cuentas: [],
   creadoEn: new Date().toISOString(), origen: "factura"});
 await guardarProveedores(fichas, fichas[fichas.length-1]);
}
async function avisarCompras(titulo, mensaje) {
  if (window.AppDialog?.alert) {
    await window.AppDialog.alert({title: titulo, message: mensaje, confirmText: "Aceptar"});
    return;
  }
  // Respaldo visual sin diálogos nativos si el componente global aún no cargó.
  const capa = document.createElement("div");
  capa.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:20px";
  const panel = document.createElement("div");
  panel.style.cssText = "background:var(--surface,#fff);color:var(--text,#222);border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 16px 48px #0004";
  const h = document.createElement("h3"); h.textContent = titulo;
  const m = document.createElement("p"); m.textContent = mensaje; m.style.whiteSpace = "pre-line";
  const boton = document.createElement("button"); boton.type = "button"; boton.textContent = "Aceptar";
  boton.style.cssText = "display:block;margin:20px 0 0 auto;padding:10px 24px;border:0;border-radius:10px;background:#bc1743;color:white;cursor:pointer";
  panel.append(h,m,boton); capa.append(panel); document.body.append(capa);
  await new Promise(resolve => { boton.addEventListener("click", resolve, {once:true}); boton.focus(); });
  capa.remove();
}
let proveedorEditando=null;
function abrirFichaProveedor(id=null){
 const p=proveedoresGuardados().find(x=>x.id===id);proveedorEditando=p?.id||null;
 const form=$("comprasFichaProveedorForm");form.reset();
 for(const [k,v] of Object.entries(p||{})){const el=form.elements.namedItem(k);if(el&&k!=="cuentas")el.value=v??"";}
 $("comprasFichaProveedorTitulo").textContent=p?"Editar proveedor":"Nuevo proveedor";
 $("comprasCuentasBancarias").innerHTML="";(p?.cuentas?.length?p.cuentas:[{}]).forEach(agregarCuentaBancaria);
 $("comprasFichaProveedorModal").classList.remove("oculto");
}
function agregarCuentaBancaria(cuenta={}){
 const cont=$("comprasCuentasBancarias"),div=document.createElement("div");div.className="compras-cuenta";
 const campos=[["banco","Banco"],["titular","Titular"],["cuitTitular","CUIT / CUIL del titular"],["tipo","Tipo de cuenta"],["numero","Número de cuenta"],["cbu","CBU / CVU"],["alias","Alias"],["moneda","Moneda"]];
 div.innerHTML='<div class="compras-cuenta-grid">'+campos.map(([k,t])=>`<label>${t}<input data-banco="${k}" value="${escaparHtml(cuenta[k]||"")}" ${k==="cbu"?'inputmode="numeric"':''}></label>`).join("")+'</div><label class="compras-cuenta-principal"><input type="radio" name="cuentaPrincipal" '+(cuenta.principal?'checked':'')+'> Cuenta principal</label><button type="button" class="compras-quitar-cuenta">Quitar cuenta</button>';
 div.querySelector(".compras-quitar-cuenta").addEventListener("click",()=>div.remove());cont.append(div);
 if(cont.children.length===1&&!cont.querySelector('input[type="radio"]:checked'))div.querySelector('input[type="radio"]').checked=true;
}
async function guardarFichaProveedor(e){e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form).entries());
 data.razonSocial=(data.razonSocial||"").trim();data.cuit=(data.cuit||"").replace(/\D/g,"");
 if(!data.razonSocial){form.elements.razonSocial.focus();return;}
 const todos=proveedoresGuardados();if(data.cuit&&todos.some(p=>p.id!==proveedorEditando&&cuitProveedor(p.cuit)===data.cuit)){
   const campo=form.elements.namedItem("cuit");
   campo?.setAttribute("aria-invalid","true");
   await avisarCompras("Proveedor duplicado","Ya existe un proveedor registrado con ese CUIT/DNI.");
   campo?.focus();
   return;
 }
 data.cuentas=[...$("comprasCuentasBancarias").children].map(div=>{const cuenta={};div.querySelectorAll("[data-banco]").forEach(el=>cuenta[el.dataset.banco]=el.value.trim());cuenta.principal=div.querySelector('input[type="radio"]').checked;return cuenta}).filter(c=>Object.entries(c).some(([k,v])=>k!=="principal"&&v));
 if(data.cuentas.length&&!data.cuentas.some(c=>c.principal))data.cuentas[0].principal=true;
 data.id=proveedorEditando||crypto.randomUUID();data.codigo=proveedorEditando?(todos.find(p=>p.id===proveedorEditando)?.codigo||""):String(Math.max(0,...todos.map(p=>Number(p.codigo)||0))+1).padStart(3,"0");
 const siguiente=todos.map(p=>({...p}));
 const i=siguiente.findIndex(p=>p.id===data.id);if(i<0)siguiente.push(data);else siguiente[i]=data;
 try{
   await guardarProveedores(siguiente,data);
 }catch(error){
   // Si el PUT falló no incorporamos el registro a memoria. Intentamos además
   // resincronizar para cubrir el caso excepcional de una respuesta perdida
   // después de que el servidor sí haya confirmado la escritura.
   try{
     const remoto=await apiCompras("/admin/compras/datos");
     facturasMemoria=Array.isArray(remoto.facturas)?remoto.facturas.map(limpiarDatoPersistente):facturasMemoria;
     proveedoresMemoria=Array.isArray(remoto.proveedores)?remoto.proveedores:proveedoresMemoria;
     await guardarSnapshotCompras().catch(()=>{});
     const confirmado=proveedoresMemoria.some(p=>String(p.id)===String(data.id));
     if(confirmado){
       $("comprasFichaProveedorModal").classList.add("oculto");renderProveedores();actualizarResumen();return;
     }
   }catch{}
   console.error("No se pudo guardar el proveedor",error);
   await avisarCompras("No se pudo guardar el proveedor",`No se pudieron guardar los datos del proveedor.${error?.message?`\n\n${error.message}`:""}`);
   return;
 }
 $("comprasFichaProveedorModal").classList.add("oculto");renderProveedores();actualizarResumen();
}
function agruparProveedores(){
 const grupos=[];
 const coincideProveedor=(grupo,datos={})=>{
   const cuit=cuitProveedor(datos.cuit);
   if(cuit&&cuitProveedor(grupo.cuit)===cuit)return true;
   const nombresDatos=[datos.proveedor,datos.razonSocial,datos.razon_social,datos.nombreComercial].map(nombreProveedor).filter(Boolean);
   if(!nombresDatos.length)return false;
   return [grupo.nombre,grupo.razonSocial,grupo.nombreComercial].map(nombreProveedor).filter(Boolean).some(n=>nombresDatos.includes(n));
 };
 proveedoresGuardados().forEach(p=>{
   const existente=grupos.find(g=>coincideProveedor(g,p));
   if(existente){
     // Una ficha enriquecida (por ejemplo al agregar CUIT) sigue siendo el mismo proveedor.
     Object.assign(existente,{...p,nombre:p.nombreComercial||p.razonSocial||existente.nombre,fiscal:p.condicionFiscal||existente.fiscal||"—"});
     return;
   }
   grupos.push({...p,nombre:p.nombreComercial||p.razonSocial||"—",fiscal:p.condicionFiscal||"—",facturas:[],total:0,ultima:""});
 });
 facturas().forEach(f=>{
   const cuit=cuitProveedor(f.cuit),nombre=String(f.proveedor||f.razonSocial||"").trim();
   if(!cuit&&!nombre)return;
   let p=grupos.find(g=>coincideProveedor(g,f));
   if(!p){
     p={nombre:nombre||"—",razonSocial:f.razonSocial||nombre,cuit:cuit||"—",fiscal:f.condicionFiscal||"—",facturas:[],total:0,ultima:""};
     grupos.push(p);
   }
   p.facturas.push(f);p.total+=numero(f.total);if(String(f.fecha||"")>p.ultima)p.ultima=String(f.fecha||"");
 });
 return grupos.sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
}
function renderProveedores(){
  const grupos=agruparProveedores(),q=(valor("comprasProvBuscar")||"").trim().toLocaleLowerCase("es"),fiscal=valor("comprasProvFiscal"),orden=valor("comprasProvOrden")||"nombre";
  const selector=$("comprasProvFiscal"),actual=selector.value;
  selector.innerHTML='<option value="">Todas las condiciones fiscales</option>'+[...new Set(grupos.map(p=>p.fiscal).filter(x=>x&&x!=="—"))].sort().map(x=>`<option value="${escaparHtml(x)}">${escaparHtml(x)}</option>`).join("");selector.value=actual;
  const filtrados=grupos.filter(p=>(!fiscal||p.fiscal===fiscal)&&[p.nombre,p.razonSocial,p.cuit].join(" ").toLocaleLowerCase("es").includes(q));
  filtrados.sort((a,b)=>orden==="compras"?b.total-a.total:orden==="facturas"?b.facturas.length-a.facturas.length:orden==="reciente"?b.ultima.localeCompare(a.ultima):a.nombre.localeCompare(b.nombre,"es"));
  $("comprasProvCantidad").textContent=filtrados.length;$("comprasProvFacturas").textContent=filtrados.reduce((n,p)=>n+p.facturas.length,0);$("comprasProvTotal").textContent=money(filtrados.reduce((n,p)=>n+p.total,0));
  const top=filtrados.slice().sort((a,b)=>b.total-a.total)[0];$("comprasProvTop").textContent=top?.nombre||"—";$("comprasProvTopMonto").textContent=top?money(top.total):"Sin registros";
  paginaProveedores=Math.min(paginaProveedores,Math.max(1,Math.ceil(filtrados.length/porPaginaCompras)));
  const body=$("comprasProvBody");body.innerHTML=filtrados.slice((paginaProveedores-1)*porPaginaCompras,paginaProveedores*porPaginaCompras).map(p=>{const i=filtrados.indexOf(p);return `<tr><td>${escaparHtml(p.codigo||String(grupos.indexOf(p)+1).padStart(3,"0"))}</td><td><strong>${escaparHtml(p.nombre)}</strong></td><td>${escaparHtml(p.cuit)}</td><td><span class="compras-fiscal-tag">${escaparHtml(p.fiscal)}</span></td><td>${p.facturas.length}</td><td>${fechaCorta(p.ultima)}</td><td><strong>${money(p.total)}</strong></td><td><div class="compras-provider-row-actions"><button class="compras-row-action compras-provider-view-action" type="button" data-provider-index="${i}" title="Ver detalle" aria-label="Ver detalle de ${escaparHtml(p.nombre)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>${p.id?`<button class="compras-row-action compras-provider-edit-action" type="button" data-provider-edit="${escaparHtml(p.id)}" title="Editar proveedor" aria-label="Editar proveedor ${escaparHtml(p.nombre)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg></button>`:""}</div></td></tr>`;}).join("")||'<tr><td colspan="8" class="compras-history-empty">No se encontraron proveedores.</td></tr>';
  paginasCompras("comprasProvPaginas","comprasProvPaginacionInfo",filtrados.length,paginaProveedores,n=>{paginaProveedores=n;renderProveedores();});
  body.querySelectorAll("[data-provider-edit]").forEach(btn=>btn.addEventListener("click",()=>abrirFichaProveedor(btn.dataset.providerEdit)));
  body.querySelectorAll("[data-provider-index]").forEach(btn=>btn.addEventListener("click",()=>{const p=filtrados[Number(btn.dataset.providerIndex)];if(!p)return;$("comprasProvDetalleNombre").textContent=p.nombre;$("comprasProvDetalleInfo").textContent=`CUIT / DNI: ${p.cuit} · ${p.facturas.length} factura(s) · ${money(p.total)}`;const datos=$("comprasProvDatosFicha");if(datos){datos.innerHTML=p.id?`<div class="compras-datos-ficha">${[["Razón social",p.razonSocial],["Nombre comercial",p.nombreComercial],["Condición fiscal",p.condicionFiscal],["Dirección",p.direccion],["Localidad",p.localidad],["Provincia",p.provincia],["Teléfono",p.telefono],["Email",p.email],["Contacto",p.contacto],["Observaciones",p.observaciones]].filter(x=>x[1]).map(([k,v])=>`<div><small>${k}</small><strong>${escaparHtml(v)}</strong></div>`).join("")}</div><h4>Cuentas bancarias</h4>${(p.cuentas||[]).map(c=>`<div class="compras-banco-detalle">${escaparHtml([c.banco,c.titular,c.tipo,c.numero,c.cbu,c.alias,c.moneda].filter(Boolean).join(" · "))}${c.principal?" · Principal":""}</div>`).join("")||"Sin cuentas registradas"}`:"";}$("comprasProvDetalleBody").innerHTML=p.facturas.slice().sort((a,b)=>String(b.fecha||"").localeCompare(String(a.fecha||""))).map(f=>`<tr><td>${fechaCorta(f.fecha)}</td><td>${escaparHtml(f.comprobante||"—")}</td><td>${escaparHtml([f.puntoVenta,f.numero].filter(Boolean).join("-")||"—")}</td><td>${escaparHtml(f.rubro||"—")}</td><td><strong>${money(f.total)}</strong></td></tr>`).join("");$("comprasProvDetalle").classList.remove("oculto");$("comprasProvDetalle").scrollIntoView({block:"nearest"});}));
}

function mostrarVistaCompras(vista="editor"){
  const pantalla=$("adminTab-compras");if(!pantalla)return;
  pantalla.classList.toggle("compras-mostrando-historial",vista!=="editor");
  for(const [id,activa] of [["comprasEditor",vista==="editor"],["comprasHistorial",vista==="historial"],["comprasProveedoresVista",vista==="proveedores"]])$(id)?.classList.toggle("oculto",!activa);
  if(vista==="historial")renderHistorial();
  if(vista==="proveedores"){ $("comprasProvDetalle")?.classList.add("oculto");renderProveedores(); }
  pantalla.scrollIntoView({block:"start",behavior:"instant"});
}
async function init(){ if(!$("adminTab-compras"))return; await cargarDatosCompras(); $("comprasLoteArchivos")?.addEventListener("change",e=>{const fs=[...e.target.files];e.target.value="";void subirLoteFacturas(fs);});$("comprasLoteLista")?.addEventListener("click",e=>{void accionPendiente(e).catch(error=>avisarCompras("Pendientes",error.message));});void actualizarBandejaFacturas();setInterval(()=>{if(document.visibilityState==="visible"&&!cargaLoteEnCurso)void actualizarBandejaFacturas();},6000); $("comprasFecha").value ||= hoy(); items=[itemVacio()]; renderItems(); inicializarSelectores($("adminTab-compras")); actualizarResumen(); document.addEventListener("click",()=>cerrarSelectores());
  $("comprasProvNuevo")?.addEventListener("click",()=>abrirFichaProveedor());
  $("comprasFichaProveedorCerrar")?.addEventListener("click",()=>$("comprasFichaProveedorModal").classList.add("oculto"));
  $("comprasFichaProveedorCancelar")?.addEventListener("click",()=>$("comprasFichaProveedorModal").classList.add("oculto"));
  $("comprasFichaProveedorForm")?.addEventListener("submit",guardarFichaProveedor);
  $("comprasAgregarCuenta")?.addEventListener("click",()=>agregarCuentaBancaria());
  const archivoInput = $("comprasArchivo");
  const dz = $("comprasDropzone");
  archivoInput?.addEventListener("change", (e) => {
    const file = e.currentTarget.files?.[0];
    if (file) setArchivo(file);
  });
  $("comprasQuitarArchivoImport")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetForm();
  });
  ["dragenter", "dragover"].forEach(ev => dz?.addEventListener(ev, e => {
    e.preventDefault();
    if (!archivoActual) dz.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(ev => dz?.addEventListener(ev, e => {
    e.preventDefault();
    dz.classList.remove("dragover");
  }));
  dz?.addEventListener("drop", e => {
    if (archivoActual) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) setArchivo(file);
  });
  $("comprasAgregarItem")?.addEventListener("click",()=>{items.push(itemVacio());invalidarImportesDetectados();renderItems()}); $("comprasEditarItems")?.addEventListener("click",()=>$("comprasItemsBody")?.querySelector("input")?.focus()); ["comprasSubtotal","comprasDescuentos","comprasNeto21","comprasNeto105","comprasIibb","comprasSuss","comprasGanancias","comprasOtrosImpuestos","comprasTotalNeto","comprasTotal"].forEach(id=>{
    const el=$(id); if(!el) return;
    el.addEventListener("input",()=>{
      formatearImporteMientrasEscribe(el);
      totalesManuales.add(id);
      if (id !== "comprasTotal") { importesDetectados = null; totalesManuales.delete("comprasTotal"); }
      calcularTotales();
    });
    el.addEventListener("focus",()=>{ if (!String(el.value || "").trim()) el.value="$ 0"; });
    el.addEventListener("blur",()=>{ el.value=importeAR(el.value); });
  }); $("comprasComprobante")?.addEventListener("input",calcularTotales); $("comprasZoomOut")?.addEventListener("click",()=>ajustarZoom(-.15)); $("comprasZoomIn")?.addEventListener("click",()=>ajustarZoom(.15)); $("comprasPreviewReset")?.addEventListener("click",()=>ajustarZoom(0,true)); $("comprasQuitarArchivo")?.addEventListener("click",()=>resetForm()); $("comprasAdjuntoBtn")?.addEventListener("click",()=>$("comprasAdjunto")?.click()); $("comprasAdjunto")?.addEventListener("change",e=>{adjuntos.push(...e.target.files);renderAdjuntos();e.target.value=""}); $("comprasGuardar")?.addEventListener("click",(e)=>{e.preventDefault(); guardar();}); $("comprasCancelar")?.addEventListener("click",cancelarEdicionOLimpiar); $("comprasVerHistorial")?.addEventListener("click",()=>mostrarVistaCompras("historial")); $("comprasVerTodasInferior")?.addEventListener("click",()=>mostrarVistaCompras("historial")); $("comprasNuevaFactura")?.addEventListener("click",()=>{resetForm();mostrarVistaCompras("editor");}); $("comprasVerProveedores")?.addEventListener("click",()=>mostrarVistaCompras("proveedores")); $("comprasProveedoresVolver")?.addEventListener("click",()=>mostrarVistaCompras("editor")); $("comprasProvBuscar")?.addEventListener("input",()=>{paginaProveedores=1;$("comprasProvDetalle")?.classList.add("oculto");renderProveedores();}); $("comprasProvLimpiar")?.addEventListener("click",()=>{$("comprasProvBuscar").value="";$("comprasProvFiscal").value="";$("comprasProvOrden").value="nombre";paginaProveedores=1;$("comprasProvDetalle")?.classList.add("oculto");renderProveedores();}); $("comprasProvCerrarDetalle")?.addEventListener("click",()=>$("comprasProvDetalle")?.classList.add("oculto")); $("comprasProvFiscal")?.addEventListener("change",()=>{paginaProveedores=1;renderProveedores();});$("comprasProvOrden")?.addEventListener("change",()=>{paginaProveedores=1;renderProveedores();});$("comprasHistProveedor")?.addEventListener("change",()=>{paginaHistorial=1;renderHistorial();});$("comprasHistBuscar")?.addEventListener("input",()=>{paginaHistorial=1;renderHistorial();}); $("comprasHistMes")?.addEventListener("change",renderHistorial); ["comprasHistTipo","comprasHistDesde","comprasHistHasta"].forEach(id=>$(id)?.addEventListener("change",()=>{paginaHistorial=1;renderHistorial();})); $("comprasHistLimpiar")?.addEventListener("click",()=>{["comprasHistBuscar","comprasHistTipo","comprasHistDesde","comprasHistHasta","comprasHistProveedor"].forEach(id=>{if($(id))$(id).value="";});renderHistorial();}); $("comprasObservaciones")?.addEventListener("input",e=>{const c=document.querySelector("#adminTab-compras .compras-char-count");if(c)c.textContent=`${e.target.value.length} / 500`;}); $("comprasNuevoProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus()); $("comprasBuscarProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus());
}
window.ComprasFacturas={render(){actualizarResumen();renderItems();},actualizarResumen,limpiar:()=>resetForm()};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
