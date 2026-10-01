import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "autoservicio_compras_facturas_v1";
let items = [];
let archivoActual = null;
let previewUrl = "";
let previewZoom = 1;
let adjuntos = [];
let pdfRenderToken = 0;
let importesDetectados = null;
let alicuotasDetectadas = [];
let camposRevision = [];
const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(n) || 0);
const numero = (v) => Math.max(0, Number(String(v ?? 0).replace(",", ".")) || 0);
const facturas = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } };
const guardarFacturas = (lista) => localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));

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
function calcularTotales() {
  const subtotalCalculado = items.reduce((s,it)=>s+calcularItem(it),0);
  const basesPorIva = new Map();
  items.forEach(it => { const tasa=numero(it.iva); basesPorIva.set(tasa,(basesPorIva.get(tasa)||0)+calcularItem(it)); });
  const descuentos = numero($("comprasDescuentos")?.value);
  const otros = numero($("comprasOtrosImpuestos")?.value);
  const ivaCalculado = [...basesPorIva].reduce((s,[tasa,base])=>s+base*(tasa/100),0);
  const totalCalculado = Math.max(0, subtotalCalculado - descuentos + ivaCalculado + otros);
  const subtotal = importesDetectados?.subtotal ?? subtotalCalculado;
  const neto = importesDetectados?.neto ?? [...basesPorIva].filter(([t])=>t>0).reduce((s,[,b])=>s+b,0);
  const iva = importesDetectados?.iva ?? ivaCalculado;
  const total = importesDetectados?.total ?? totalCalculado;
  const tasas = [...basesPorIva.keys()].filter(t=>t>0).sort((a,b)=>a-b);
  const tasaUnica = tasas.length===1 ? tasas[0] : null;
  if ($("comprasSubtotal")) $("comprasSubtotal").textContent=money(subtotal);
  if ($("comprasNeto21")) $("comprasNeto21").textContent=money(neto);
  if ($("comprasIva21")) $("comprasIva21").textContent=money(iva);
  if ($("comprasNetoLabel")) $("comprasNetoLabel").textContent=tasaUnica ? `Neto gravado ${tasaUnica}%` : "Neto gravado";
  if ($("comprasIvaLabel")) $("comprasIvaLabel").textContent=tasaUnica ? `IVA ${tasaUnica}%` : "IVA total";
  const alicuotasWrap = $("comprasAlicuotas");
  if (alicuotasWrap) {
    alicuotasWrap.innerHTML = alicuotasDetectadas.length > 1 ? alicuotasDetectadas.map(a => `<div><dt>Neto gravado ${numero(a.tasa)}%</dt><dd>${money(a.neto)}</dd></div><div><dt>IVA ${numero(a.tasa)}%</dt><dd>${money(a.iva)}</dd></div>`).join("") : "";
  }
  const comprobante = valor("comprasComprobante");
  const noDiscrimina = /(?:Factura|crédito|débito) C/i.test(comprobante) || (!tasas.length && iva===0);
  const variasAlicuotas = alicuotasDetectadas.length > 1;
  $("comprasNetoFila")?.classList.toggle("oculto", noDiscrimina || variasAlicuotas);
  $("comprasIvaFila")?.classList.toggle("oculto", noDiscrimina || variasAlicuotas);
  alicuotasWrap?.classList.toggle("oculto", noDiscrimina || !variasAlicuotas);
  if ($("comprasTotal")) $("comprasTotal").textContent=money(total);
  return { subtotal, neto21: neto, iva21: iva, descuentos, otros, total };
}

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}
function setEstadoArchivo(texto, tipo = "ok") {
  const estado = $("comprasArchivoEstado");
  if (!estado) return;
  estado.classList.remove("oculto", "analizando", "error", "ok");
  estado.classList.add(tipo);
  estado.textContent = texto;
}
function setValor(id, valor) {
  const el = $(id); if (!el || valor === undefined || valor === null || valor === "") return;
  el.value = valor;
}
function seleccionarOpcion(id, valor) {
  const el = $(id); if (!el || !valor) return;
  const buscado = String(valor).trim().toLowerCase();
  const opcion = [...el.options].find(o => o.value.toLowerCase() === buscado || o.textContent.trim().toLowerCase() === buscado);
  if (opcion) el.value = opcion.value;
}
function aplicarFacturaExtraida(f) {
  if (!f || typeof f !== "object") return;
  camposRevision = Array.isArray(f.campos_revision) ? f.campos_revision.filter(Boolean) : [];
  alicuotasDetectadas = Array.isArray(f.alicuotas_iva) ? f.alicuotas_iva.filter(a => numero(a?.tasa)>0 && (numero(a?.neto)>0 || numero(a?.iva)>0)) : [];
  setValor("comprasProveedor", f.proveedor || f.razon_social);
  setValor("comprasRazonSocial", f.razon_social || f.proveedor);
  setValor("comprasCuit", f.cuit);
  seleccionarOpcion("comprasCondicionFiscal", f.condicion_fiscal);
  seleccionarOpcion("comprasComprobante", f.comprobante);
  setValor("comprasPuntoVenta", f.punto_venta);
  setValor("comprasNumero", f.numero);
  setValor("comprasFecha", f.fecha);
  setValor("comprasVencimiento", f.vencimiento);
  seleccionarOpcion("comprasCondicionPago", f.condicion_pago);
  seleccionarOpcion("comprasMoneda", f.moneda);
  if ($("comprasDescuentos")) $("comprasDescuentos").value = numero(f.descuentos);
  if ($("comprasOtrosImpuestos")) $("comprasOtrosImpuestos").value = numero(f.otros_impuestos);
  if (f.observaciones) setValor("comprasObservaciones", f.observaciones);
  calcularTotales();
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
    subtotal: numero(f.subtotal || f.neto_gravado || subtotalLineas),
    neto: numero(f.neto_gravado || f.neto_gravado_21 || subtotalLineas),
    iva: numero(f.iva_total || f.iva_21),
    total: numero(f.total)
  };
  renderItems();
}

async function extraerFactura(file) {
  if (!$("comprasAutoDetectar")?.checked) return;
  setEstadoArchivo(`Analizando ${file.name}…`, "analizando");
  try {
    const base64 = await archivoABase64(file);
    const apiBase = String(window.API_BASE_URL || "").replace(/\/$/, "");
    const respuesta = await fetch(`${apiBase}/compras/facturas/extraer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: file.name, tipo: file.type, base64 })
    });
    const tipoRespuesta = respuesta.headers.get("content-type") || "";
    const data = tipoRespuesta.includes("application/json") ? await respuesta.json().catch(() => ({})) : {};
    if (!respuesta.ok) {
      const detalle = data.error || data.mensaje || `El servidor respondió HTTP ${respuesta.status}`;
      throw new Error(detalle);
    }
    aplicarFacturaExtraida(data.factura);
    const cantidad = Array.isArray(data.factura?.items) ? data.factura.items.length : 0;
    const revision = camposRevision.length ? ` · Revisar: ${camposRevision.join(", ")}` : "";
    setEstadoArchivo(`✓ Datos detectados${cantidad ? ` · ${cantidad} ítem${cantidad === 1 ? "" : "s"}` : ""}${revision}. Revisá la información antes de guardar.`, "ok");
  } catch (error) {
    console.error("Lectura automática de factura:", error);
    setEstadoArchivo(`⚠ ${error.message || "No se pudo leer automáticamente"}. Podés completar los datos manualmente.`, "error");
  }
}
async function renderizarPdf(file) {
  const preview = $("comprasPreview");
  if (!preview) return;
  const token = ++pdfRenderToken;
  preview.className = "compras-preview-empty compras-pdf-canvas-wrap";
  preview.innerHTML = '<span class="compras-pdf-loading">Preparando vista previa del PDF…</span>';
  try {
    const pdfjsLib = await import(PDFJS_URL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    if (token !== pdfRenderToken || archivoActual !== file) return;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const anchoDisponible = Math.max(220, preview.clientWidth - 18);
    const altoDisponible = Math.max(220, preview.clientHeight - 18);
    const escala = Math.min(2, anchoDisponible / baseViewport.width, altoDisponible / baseViewport.height);
    const viewport = page.getViewport({ scale: Math.max(.5, escala) });
    const canvas = document.createElement("canvas");
    canvas.className = "compras-pdf-canvas";
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise;
    if (token !== pdfRenderToken || archivoActual !== file) return;
    preview.innerHTML = "";
    preview.appendChild(canvas);
  } catch (error) {
    console.error("Vista previa PDF:", error);
    if (token !== pdfRenderToken) return;
    preview.innerHTML = '<svg class="app-icon"><use href="#icon-clipboard"></use></svg><span>No se pudo dibujar la vista previa del PDF. El análisis automático igualmente continuará.</span>';
  }
}
function setArchivo(file) {
  if (!file) return;
  if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) { alert("Formato no permitido. Usá PDF, JPG o PNG."); return; }
  archivoActual = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file); previewZoom=1;
  const preview=$("comprasPreview");
  if (file.type === "application/pdf") {
    renderizarPdf(file);
  } else {
    preview.className="compras-preview-empty";
    preview.innerHTML=`<img src="${previewUrl}" alt="Vista previa de factura">`;
  }
  setEstadoArchivo(`✓ ${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`, "ok");
  extraerFactura(file);
}
function ajustarZoom(delta=0, reset=false){
  previewZoom=reset?1:Math.min(2.5,Math.max(.5,previewZoom+delta));
  const preview=$("comprasPreview");
  const img=preview?.querySelector("img");
  if(img) img.style.transform=`scale(${previewZoom})`;
  const pdfCanvas=preview?.querySelector("canvas.compras-pdf-canvas");
  if(pdfCanvas) pdfCanvas.style.transform=`scale(${previewZoom})`;
}
function limpiarArchivo(){ pdfRenderToken++; archivoActual=null; if(previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=""; const p=$("comprasPreview"); if(p) p.innerHTML='<svg class="app-icon"><use href="#icon-clipboard"></use></svg><span>Importá una factura para verla aquí</span>'; $("comprasArchivoEstado")?.classList.add("oculto"); if($("comprasArchivo")) $("comprasArchivo").value=""; }
function valor(id){ return $(id)?.value?.trim?.() ?? $(id)?.value ?? ""; }
function hoy(){ return new Date().toISOString().slice(0,10); }
function resetForm(){ importesDetectados=null; alicuotasDetectadas=[]; camposRevision=[]; ["comprasProveedor","comprasCuit","comprasRazonSocial","comprasPuntoVenta","comprasNumero","comprasVencimiento","comprasObservaciones"].forEach(id=>{if($(id))$(id).value=""}); if($("comprasFecha"))$("comprasFecha").value=hoy(); if($("comprasDescuentos"))$("comprasDescuentos").value=0; if($("comprasOtrosImpuestos"))$("comprasOtrosImpuestos").value=0; items=[itemVacio()]; adjuntos=[]; limpiarArchivo(); renderItems(); renderAdjuntos(); }
function construirRegistro(){ const t=calcularTotales(); return { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, creadoEn:new Date().toISOString(), proveedor:valor("comprasProveedor"), cuit:valor("comprasCuit"), razonSocial:valor("comprasRazonSocial"), condicionFiscal:valor("comprasCondicionFiscal"), comprobante:valor("comprasComprobante"), puntoVenta:valor("comprasPuntoVenta"), numero:valor("comprasNumero"), fecha:valor("comprasFecha"), condicionPago:valor("comprasCondicionPago"), moneda:valor("comprasMoneda"), rubro:valor("comprasRubro"), vencimiento:valor("comprasVencimiento"), observaciones:valor("comprasObservaciones"), items:items.map(x=>({...x})), ...t, archivo: archivoActual ? {nombre:archivoActual.name,tipo:archivoActual.type,tamano:archivoActual.size} : null, adjuntos:adjuntos.map(f=>({nombre:f.name,tipo:f.type,tamano:f.size})) }; }
function guardar(){ const r=construirRegistro(); if(!r.proveedor){ alert("Completá el proveedor antes de guardar."); $("comprasProveedor")?.focus(); return; } if(!r.fecha){ alert("Completá la fecha del comprobante."); return; } if(!items.some(it=>it.descripcion || numero(it.precio)>0)){ alert("Agregá al menos un ítem al comprobante."); return; } const lista=facturas(); lista.unshift(r); guardarFacturas(lista); actualizarResumen(); renderHistorial(); alert("Factura guardada correctamente."); resetForm(); }
function renderAdjuntos(){ const c=$("comprasAdjuntosLista"); if(c) c.innerHTML=adjuntos.map(f=>`<small style="display:block;margin-top:6px;color:#697386">• ${f.name}</small>`).join(""); }
function actualizarResumen(){ const lista=facturas(), mes=hoy().slice(0,7), delMes=lista.filter(f=>String(f.fecha||f.creadoEn).slice(0,7)===mes); const gasto=delMes.reduce((s,f)=>s+numero(f.total),0); if($("adminComprasFacturasMes"))$("adminComprasFacturasMes").textContent=delMes.length; if($("adminComprasGastoMes"))$("adminComprasGastoMes").textContent=money(gasto); }
function renderHistorial(){ const q=(valor("comprasHistBuscar")||"").toLowerCase(), mes=valor("comprasHistMes"); let lista=facturas().filter(f=>(!mes||String(f.fecha||"").startsWith(mes))&&(!q||`${f.proveedor} ${f.cuit} ${f.numero} ${f.rubro}`.toLowerCase().includes(q))); if($("comprasHistCantidad"))$("comprasHistCantidad").textContent=lista.length; if($("comprasHistTotal"))$("comprasHistTotal").textContent=money(lista.reduce((s,f)=>s+numero(f.total),0)); const body=$("comprasHistBody"); if(!body)return; body.innerHTML=lista.length?lista.map(f=>`<tr><td>${f.fecha||"—"}</td><td><strong>${f.proveedor||"—"}</strong></td><td>${f.comprobante||"—"}</td><td>${[f.puntoVenta,f.numero].filter(Boolean).join("-")||"—"}</td><td>${f.rubro||"—"}</td><td><strong>${money(f.total)}</strong></td><td><button type="button" data-remove="${f.id}" aria-label="Eliminar" style="border:0;background:#fff0f2;color:#f42545;border-radius:7px;padding:6px;cursor:pointer"><svg class="app-icon" style="width:15px;height:15px"><use href="#icon-trash"></use></svg></button></td></tr>`).join(""):'<tr><td colspan="7" class="compras-history-empty">Todavía no hay facturas registradas.</td></tr>'; body.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>{if(!confirm("¿Eliminar esta factura del historial?"))return; guardarFacturas(facturas().filter(f=>f.id!==b.dataset.remove)); renderHistorial(); actualizarResumen();})); }
function mostrarHistorial(ver){ $("comprasEditor")?.classList.toggle("oculto",ver); $("comprasHistorial")?.classList.toggle("oculto",!ver); $("comprasVerHistorial")?.classList.toggle("oculto",ver); if(ver)renderHistorial(); }
function init(){ if(!$("adminTab-compras"))return; $("comprasFecha").value ||= hoy(); items=[itemVacio()]; renderItems(); actualizarResumen();
  $("comprasDropzone")?.addEventListener("click",()=>$("comprasArchivo")?.click()); $("comprasArchivo")?.addEventListener("change",e=>setArchivo(e.target.files?.[0])); const dz=$("comprasDropzone"); ["dragenter","dragover"].forEach(ev=>dz?.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("dragover")})); ["dragleave","drop"].forEach(ev=>dz?.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("dragover")})); dz?.addEventListener("drop",e=>setArchivo(e.dataTransfer.files?.[0]));
  $("comprasAgregarItem")?.addEventListener("click",()=>{items.push(itemVacio());invalidarImportesDetectados();renderItems()}); $("comprasEditarItems")?.addEventListener("click",()=>$("comprasItemsBody")?.querySelector("input")?.focus()); ["comprasDescuentos","comprasOtrosImpuestos","comprasComprobante"].forEach(id=>$(id)?.addEventListener("input",()=>{ invalidarImportesDetectados(); calcularTotales(); })); $("comprasZoomOut")?.addEventListener("click",()=>ajustarZoom(-.15)); $("comprasZoomIn")?.addEventListener("click",()=>ajustarZoom(.15)); $("comprasPreviewReset")?.addEventListener("click",()=>ajustarZoom(0,true)); $("comprasQuitarArchivo")?.addEventListener("click",limpiarArchivo); $("comprasAdjuntoBtn")?.addEventListener("click",()=>$("comprasAdjunto")?.click()); $("comprasAdjunto")?.addEventListener("change",e=>{adjuntos.push(...e.target.files);renderAdjuntos();e.target.value=""}); $("comprasGuardar")?.addEventListener("click",guardar); $("comprasCancelar")?.addEventListener("click",()=>{if(confirm("¿Cancelar la carga actual?"))resetForm()}); $("comprasVerHistorial")?.addEventListener("click",()=>mostrarHistorial(true)); $("comprasNuevaFactura")?.addEventListener("click",()=>mostrarHistorial(false)); $("comprasHistBuscar")?.addEventListener("input",renderHistorial); $("comprasHistMes")?.addEventListener("change",renderHistorial); $("comprasNuevoProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus()); $("comprasBuscarProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus());
}
window.ComprasFacturas={render(){actualizarResumen();renderItems();},actualizarResumen};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
