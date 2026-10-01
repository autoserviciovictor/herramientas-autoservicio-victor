const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "autoservicio_compras_facturas_v1";
let items = [];
let archivoActual = null;
let previewUrl = "";
let previewZoom = 1;
let adjuntos = [];

const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(n) || 0);
const numero = (v) => Math.max(0, Number(String(v ?? 0).replace(",", ".")) || 0);
const facturas = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } };
const guardarFacturas = (lista) => localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));

function itemVacio() { return { codigo: "", descripcion: "", cantidad: 1, precio: 0, iva: 21 }; }
function calcularItem(it) { return numero(it.cantidad) * numero(it.precio); }
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
  body.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", () => {
    const tr = el.closest("tr"), i = Number(tr.dataset.i), k = el.dataset.k;
    items[i][k] = ["cantidad","precio","iva"].includes(k) ? numero(el.value) : el.value;
    tr.querySelector("[data-subtotal]").textContent = money(calcularItem(items[i])); calcularTotales();
  }));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { items.splice(Number(b.dataset.del),1); renderItems(); }));
  calcularTotales();
}
function calcularTotales() {
  const subtotal = items.reduce((s,it)=>s+calcularItem(it),0);
  const neto21 = items.filter(it=>numero(it.iva)===21).reduce((s,it)=>s+calcularItem(it),0);
  const iva21 = neto21 * .21;
  const descuentos = numero($("comprasDescuentos")?.value);
  const otros = numero($("comprasOtrosImpuestos")?.value);
  const total = Math.max(0, subtotal - descuentos + items.reduce((s,it)=>s+calcularItem(it)*(numero(it.iva)/100),0) + otros);
  if ($("comprasSubtotal")) $("comprasSubtotal").textContent=money(subtotal);
  if ($("comprasNeto21")) $("comprasNeto21").textContent=money(neto21);
  if ($("comprasIva21")) $("comprasIva21").textContent=money(iva21);
  if ($("comprasTotal")) $("comprasTotal").textContent=money(total);
  return { subtotal, neto21, iva21, descuentos, otros, total };
}
function setArchivo(file) {
  if (!file) return;
  if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) { alert("Formato no permitido. Usá PDF, JPG o PNG."); return; }
  archivoActual = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file); previewZoom=1;
  const preview=$("comprasPreview"); preview.className="compras-preview-empty";
  preview.innerHTML = file.type === "application/pdf" ? `<embed src="${previewUrl}" type="application/pdf">` : `<img src="${previewUrl}" alt="Vista previa de factura">`;
  $("comprasArchivoEstado").classList.remove("oculto");
  $("comprasArchivoEstado").textContent = `✓ ${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
  // La extracción OCR requiere un servicio específico. No se inventan datos: se conserva el archivo y se habilita la revisión manual.
}
function ajustarZoom(delta=0, reset=false){ previewZoom=reset?1:Math.min(2.5,Math.max(.5,previewZoom+delta)); const el=$("comprasPreview")?.querySelector("img,embed"); if(el) el.style.transform=`scale(${previewZoom})`; }
function limpiarArchivo(){ archivoActual=null; if(previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=""; const p=$("comprasPreview"); if(p) p.innerHTML='<svg class="app-icon"><use href="#icon-clipboard"></use></svg><span>Importá una factura para verla aquí</span>'; $("comprasArchivoEstado")?.classList.add("oculto"); if($("comprasArchivo")) $("comprasArchivo").value=""; }
function valor(id){ return $(id)?.value?.trim?.() ?? $(id)?.value ?? ""; }
function hoy(){ return new Date().toISOString().slice(0,10); }
function resetForm(){ ["comprasProveedor","comprasCuit","comprasRazonSocial","comprasPuntoVenta","comprasNumero","comprasVencimiento","comprasObservaciones"].forEach(id=>{if($(id))$(id).value=""}); if($("comprasFecha"))$("comprasFecha").value=hoy(); if($("comprasDescuentos"))$("comprasDescuentos").value=0; if($("comprasOtrosImpuestos"))$("comprasOtrosImpuestos").value=0; items=[itemVacio()]; adjuntos=[]; limpiarArchivo(); renderItems(); renderAdjuntos(); }
function construirRegistro(){ const t=calcularTotales(); return { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, creadoEn:new Date().toISOString(), proveedor:valor("comprasProveedor"), cuit:valor("comprasCuit"), razonSocial:valor("comprasRazonSocial"), condicionFiscal:valor("comprasCondicionFiscal"), comprobante:valor("comprasComprobante"), puntoVenta:valor("comprasPuntoVenta"), numero:valor("comprasNumero"), fecha:valor("comprasFecha"), condicionPago:valor("comprasCondicionPago"), moneda:valor("comprasMoneda"), rubro:valor("comprasRubro"), vencimiento:valor("comprasVencimiento"), observaciones:valor("comprasObservaciones"), items:items.map(x=>({...x})), ...t, archivo: archivoActual ? {nombre:archivoActual.name,tipo:archivoActual.type,tamano:archivoActual.size} : null, adjuntos:adjuntos.map(f=>({nombre:f.name,tipo:f.type,tamano:f.size})) }; }
function guardar(){ const r=construirRegistro(); if(!r.proveedor){ alert("Completá el proveedor antes de guardar."); $("comprasProveedor")?.focus(); return; } if(!r.fecha){ alert("Completá la fecha del comprobante."); return; } if(!items.some(it=>it.descripcion || numero(it.precio)>0)){ alert("Agregá al menos un ítem al comprobante."); return; } const lista=facturas(); lista.unshift(r); guardarFacturas(lista); actualizarResumen(); renderHistorial(); alert("Factura guardada correctamente."); resetForm(); }
function renderAdjuntos(){ const c=$("comprasAdjuntosLista"); if(c) c.innerHTML=adjuntos.map(f=>`<small style="display:block;margin-top:6px;color:#697386">• ${f.name}</small>`).join(""); }
function actualizarResumen(){ const lista=facturas(), mes=hoy().slice(0,7), delMes=lista.filter(f=>String(f.fecha||f.creadoEn).slice(0,7)===mes); const gasto=delMes.reduce((s,f)=>s+numero(f.total),0); if($("adminComprasFacturasMes"))$("adminComprasFacturasMes").textContent=delMes.length; if($("adminComprasGastoMes"))$("adminComprasGastoMes").textContent=money(gasto); }
function renderHistorial(){ const q=(valor("comprasHistBuscar")||"").toLowerCase(), mes=valor("comprasHistMes"); let lista=facturas().filter(f=>(!mes||String(f.fecha||"").startsWith(mes))&&(!q||`${f.proveedor} ${f.cuit} ${f.numero} ${f.rubro}`.toLowerCase().includes(q))); if($("comprasHistCantidad"))$("comprasHistCantidad").textContent=lista.length; if($("comprasHistTotal"))$("comprasHistTotal").textContent=money(lista.reduce((s,f)=>s+numero(f.total),0)); const body=$("comprasHistBody"); if(!body)return; body.innerHTML=lista.length?lista.map(f=>`<tr><td>${f.fecha||"—"}</td><td><strong>${f.proveedor||"—"}</strong></td><td>${f.comprobante||"—"}</td><td>${[f.puntoVenta,f.numero].filter(Boolean).join("-")||"—"}</td><td>${f.rubro||"—"}</td><td><strong>${money(f.total)}</strong></td><td><button type="button" data-remove="${f.id}" aria-label="Eliminar" style="border:0;background:#fff0f2;color:#f42545;border-radius:7px;padding:6px;cursor:pointer"><svg class="app-icon" style="width:15px;height:15px"><use href="#icon-trash"></use></svg></button></td></tr>`).join(""):'<tr><td colspan="7" class="compras-history-empty">Todavía no hay facturas registradas.</td></tr>'; body.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>{if(!confirm("¿Eliminar esta factura del historial?"))return; guardarFacturas(facturas().filter(f=>f.id!==b.dataset.remove)); renderHistorial(); actualizarResumen();})); }
function mostrarHistorial(ver){ $("comprasEditor")?.classList.toggle("oculto",ver); $("comprasHistorial")?.classList.toggle("oculto",!ver); $("comprasVerHistorial")?.classList.toggle("oculto",ver); if(ver)renderHistorial(); }
function init(){ if(!$("adminTab-compras"))return; $("comprasFecha").value ||= hoy(); items=[itemVacio()]; renderItems(); actualizarResumen();
  $("comprasDropzone")?.addEventListener("click",()=>$("comprasArchivo")?.click()); $("comprasArchivo")?.addEventListener("change",e=>setArchivo(e.target.files?.[0])); const dz=$("comprasDropzone"); ["dragenter","dragover"].forEach(ev=>dz?.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("dragover")})); ["dragleave","drop"].forEach(ev=>dz?.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("dragover")})); dz?.addEventListener("drop",e=>setArchivo(e.dataTransfer.files?.[0]));
  $("comprasAgregarItem")?.addEventListener("click",()=>{items.push(itemVacio());renderItems()}); $("comprasEditarItems")?.addEventListener("click",()=>$("comprasItemsBody")?.querySelector("input")?.focus()); ["comprasDescuentos","comprasOtrosImpuestos"].forEach(id=>$(id)?.addEventListener("input",calcularTotales)); $("comprasZoomOut")?.addEventListener("click",()=>ajustarZoom(-.15)); $("comprasZoomIn")?.addEventListener("click",()=>ajustarZoom(.15)); $("comprasPreviewReset")?.addEventListener("click",()=>ajustarZoom(0,true)); $("comprasQuitarArchivo")?.addEventListener("click",limpiarArchivo); $("comprasAdjuntoBtn")?.addEventListener("click",()=>$("comprasAdjunto")?.click()); $("comprasAdjunto")?.addEventListener("change",e=>{adjuntos.push(...e.target.files);renderAdjuntos();e.target.value=""}); $("comprasGuardar")?.addEventListener("click",guardar); $("comprasCancelar")?.addEventListener("click",()=>{if(confirm("¿Cancelar la carga actual?"))resetForm()}); $("comprasVerHistorial")?.addEventListener("click",()=>mostrarHistorial(true)); $("comprasNuevaFactura")?.addEventListener("click",()=>mostrarHistorial(false)); $("comprasHistBuscar")?.addEventListener("input",renderHistorial); $("comprasHistMes")?.addEventListener("change",renderHistorial); $("comprasNuevoProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus()); $("comprasBuscarProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus());
}
window.ComprasFacturas={render(){actualizarResumen();renderItems();},actualizarResumen};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
