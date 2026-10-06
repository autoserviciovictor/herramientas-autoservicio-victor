import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "autoservicio_compras_facturas_v1";
const FACTURA_IA_CACHE_KEY = "autoservicio_factura_ia_cache_v1";
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
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  return Math.max(0, Number(s) || 0);
};
const importeAR = (v) => `$ ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero(v))}`;
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
const facturas = () => {
  try {
    const lista = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(lista) ? lista.map(limpiarDatoPersistente) : [];
  } catch { return []; }
};
function guardarFacturas(lista) {
  const listaLiviana = (Array.isArray(lista) ? lista : []).map(limpiarDatoPersistente);
  const contenido = JSON.stringify(listaLiviana);
  try {
    localStorage.setItem(STORAGE_KEY, contenido);
  } catch (error) {
    if (error?.name !== "QuotaExceededError") throw error;
    // La caché de IA es prescindible y puede ocupar varios MB. Liberarla no
    // elimina facturas guardadas y permite conservar el historial real.
    try { localStorage.removeItem(FACTURA_IA_CACHE_KEY); } catch {}
    localStorage.setItem(STORAGE_KEY, contenido);
  }
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
  const suss = valorImporte("comprasSuss");
  const ganancias = valorImporte("comprasGanancias");
  const otros = valorImporte("comprasOtrosImpuestos");
  const totalNeto = valorImporte("comprasTotalNeto");
  const totalIva = totalIvaAuto;
  const totalAuto = Math.max(0, totalNeto - descuentos + totalIva + iibb + suss + ganancias + otros);
  ponerImporteAutomatico("comprasTotal", importesDetectados?.total ?? totalAuto);
  const total = valorImporte("comprasTotal");

  return { subtotal, neto21, neto105, totalNeto, iva21: totalIva, totalIva, descuentos, iibb, suss, ganancias, otros, total };
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
function aplicarFacturaExtraida(f) {
  if (!f || typeof f !== "object") return;
  totalesManuales.clear();
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
  if ($("comprasDescuentos")) $("comprasDescuentos").value = importeAR(f.descuentos);
  if ($("comprasOtrosImpuestos")) $("comprasOtrosImpuestos").value = importeAR(f.otros_impuestos);
  if ($("comprasIibb")) $("comprasIibb").value = importeAR(f.iibb || f.ingresos_brutos);
  if ($("comprasSuss")) $("comprasSuss").value = importeAR(f.suss);
  if ($("comprasGanancias")) $("comprasGanancias").value = importeAR(f.ganancias);
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
    subtotal: numero(f.subtotal || f.neto_gravado || subtotalLineas || f.total),
    neto: numero(f.neto_gravado || f.neto_gravado_21 || subtotalLineas || f.subtotal || f.total),
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
    if (estado === "uploading") meta.textContent = `Subiendo factura… · ${tipoArchivo} · ${tamanoArchivo}`;
    else if (estado === "uploaded") meta.textContent = `Factura subida correctamente · ${tipoArchivo} · ${tamanoArchivo}`;
    else if (estado === "upload-error") meta.textContent = `No se pudo subir la factura · ${tipoArchivo} · ${tamanoArchivo}`;
  }
}

async function extraerFactura(file) {
  if (!$("comprasAutoDetectar")?.checked) return;
  const token = ++facturaAnalisisToken;
  setEstadoArchivo(`Analizando ${file.name}…`, "analizando");
  try {
    // La vista previa y la lectura IA son independientes. Si este mismo archivo ya
    // fue analizado en este navegador, reutilizamos el resultado y evitamos otra
    // subida + otra llamada a IA.
    const claveCache = await huellaArchivo(file);
    if (token !== facturaAnalisisToken || archivoActual !== file) return;
    const facturaCacheada = leerCacheFactura(claveCache);
    if (facturaCacheada) {
      aplicarFacturaExtraida(facturaCacheada);
      $("comprasArchivoEstado")?.classList.add("oculto");
      setEstadoDropzoneFactura("uploaded", file);
      return;
    }

    const base64 = await archivoABase64(file);
    if (token !== facturaAnalisisToken || archivoActual !== file) return;
    const apiBase = String(API_BASE_URL || window.API_BASE_URL || "").replace(/\/$/, "");
    const inicioPeticion = performance.now();
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
  if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) { alert("Formato no permitido. Usá PDF, JPG o PNG."); return; }
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
  setEstadoDropzoneFactura("uploading", file);
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
function resetForm(limpiarArchivoTambien=true){
  importesDetectados=null; alicuotasDetectadas=[]; camposRevision=[]; totalesManuales.clear();
  ["comprasProveedor","comprasCuit","comprasRazonSocial","comprasPuntoVenta","comprasNumero","comprasVencimiento","comprasObservaciones"].forEach(id=>{if($(id))$(id).value=""});
  const defaults={comprasCondicionFiscal:"Responsable Inscripto",comprasComprobante:"",comprasCondicionPago:"",comprasMoneda:"Pesos",comprasRubro:""};
  Object.entries(defaults).forEach(([id,v])=>{if($(id)){ $(id).value=v; sincronizarSelector($(id)); }});
  if($("comprasFecha"))$("comprasFecha").value=hoy(); ["comprasSubtotal","comprasDescuentos","comprasNeto21","comprasNeto105","comprasIibb","comprasSuss","comprasGanancias","comprasOtrosImpuestos","comprasTotalNeto","comprasTotal"].forEach(id=>{if($(id))$(id).value="";});
  items=[itemVacio()]; adjuntos=[]; if(limpiarArchivoTambien) limpiarArchivo(true); renderItems(); renderAdjuntos(); calcularTotales();
}
function construirRegistro(){ const t=calcularTotales(); return { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, creadoEn:new Date().toISOString(), proveedor:valor("comprasProveedor"), cuit:valor("comprasCuit"), razonSocial:valor("comprasRazonSocial"), condicionFiscal:valor("comprasCondicionFiscal"), comprobante:valor("comprasComprobante"), puntoVenta:valor("comprasPuntoVenta"), numero:valor("comprasNumero"), fecha:valor("comprasFecha"), condicionPago:valor("comprasCondicionPago"), moneda:valor("comprasMoneda"), rubro:valor("comprasRubro"), vencimiento:valor("comprasVencimiento"), observaciones:valor("comprasObservaciones"), items:items.map(x=>({...x})), ...t, archivo: archivoActual ? {nombre:archivoActual.name,tipo:archivoActual.type,tamano:archivoActual.size} : null, adjuntos:adjuntos.map(f=>({nombre:f.name,tipo:f.type,tamano:f.size})) }; }
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
  else alert(`${opciones.title}\n\n${opciones.message}`);
  // Tras aceptar, descartar los datos del comprobante duplicado y su archivo.
  resetForm();
}
async function guardar(){
  const r=construirRegistro();
  if(!r.proveedor){
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:"Falta el proveedor",message:"Completá el proveedor antes de guardar.",confirmText:"Aceptar"});
    else alert("Completá el proveedor antes de guardar.");
    $("comprasProveedor")?.focus();
    return;
  }
  if(!r.fecha){
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:"Falta la fecha",message:"Completá la fecha del comprobante.",confirmText:"Aceptar"});
    else alert("Completá la fecha del comprobante.");
    return;
  }

  // Verificar antes de pedir confirmación; al aceptar el aviso se limpia el formulario.
  if (facturas().some(f => esFacturaDuplicada(r, f))) {
    await avisarFacturaDuplicada();
    return;
  }

  let confirmado=true;
  if(window.AppDialog?.confirm){
    confirmado=await window.AppDialog.confirm({
      title:"Guardar factura",
      message:`¿Querés guardar la factura ${r.comprobante || ""} ${r.numero || ""} de ${r.proveedor}?`,
      confirmText:"Guardar factura",
      cancelText:"Cancelar",
      tone:"primary"
    });
  }
  if(!confirmado) return;

  try{
    const lista=facturas();
    // Revalidar después del diálogo, por si el historial cambió mientras estaba abierto.
    if (lista.some(f => esFacturaDuplicada(r, f))) {
      await avisarFacturaDuplicada();
      return;
    }
    lista.unshift(r);
    guardarFacturas(lista);
    // El comprobante ya fue persistido: crear la ficha únicamente si falta.
    // Una falla de almacenamiento de proveedores no debe anunciar que falló la factura.
    try { registrarProveedorDeFactura(r); }
    catch (error) { console.warn("Factura guardada; no se pudo crear la ficha del proveedor", error); }
    actualizarResumen();
    renderHistorial();
    resetForm();
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:"Factura guardada",message:"La factura se guardó correctamente.",confirmText:"Aceptar"});
    else alert("La factura se guardó correctamente.");
  }catch(error){
    console.error("No se pudo guardar la factura",error);
    if(window.AppDialog?.alert) await window.AppDialog.alert({title:"No se pudo guardar",message:"Ocurrió un error al guardar la factura. Intentá nuevamente.",confirmText:"Aceptar"});
    else alert("No se pudo guardar la factura. Intentá nuevamente.");
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
function renderHistorial(){
  const q=(valor("comprasHistBuscar")||"").trim().toLocaleLowerCase("es"),tipo=valor("comprasHistTipo"),desde=valor("comprasHistDesde"),hasta=valor("comprasHistHasta"),proveedor=valor("comprasHistProveedor");
  const todas=facturas(),selector=$("comprasHistProveedor"),seleccion=selector?.value||"";
  if(selector){const nombres=[...new Set(todas.map(f=>f.proveedor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));selector.innerHTML='<option value="">Todos los proveedores</option>'+nombres.map(n=>`<option value="${escaparHtml(n)}">${escaparHtml(n)}</option>`).join("");selector.value=seleccion;}
  const lista=todas.filter(f=>{const fecha=String(f.fecha||"");return (!tipo||f.comprobante===tipo)&&(!desde||fecha>=desde)&&(!hasta||fecha<=hasta)&&(!proveedor||f.proveedor===proveedor)&&(!q||[f.proveedor,f.razonSocial,f.cuit,f.numero,f.puntoVenta,f.rubro,f.comprobante].join(" ").toLocaleLowerCase("es").includes(q));}).sort((a,b)=>String(b.creadoEn||b.fecha||"").localeCompare(String(a.creadoEn||a.fecha||"")));
  const total=lista.reduce((s,f)=>s+numero(f.total),0);$("comprasHistCantidad").textContent=lista.length;$("comprasHistTotal").textContent=money(total);$("comprasHistPromedio").textContent=money(lista.length?total/lista.length:0);
  const mesActual=hoy().slice(0,7);$("comprasHistUltimoMes").textContent=money(todas.filter(f=>String(f.fecha||"").startsWith(mesActual)).reduce((s,f)=>s+numero(f.total),0));
  paginaHistorial=Math.min(paginaHistorial,Math.max(1,Math.ceil(lista.length/porPaginaCompras)));
  const body=$("comprasHistBody");body.innerHTML=lista.slice((paginaHistorial-1)*porPaginaCompras,paginaHistorial*porPaginaCompras).map(f=>`<tr><td>${escaparHtml(f.creadoEn?new Date(f.creadoEn).toLocaleString("es-AR"):"—")}</td><td>${fechaCorta(f.fecha)}</td><td><strong>${escaparHtml(f.proveedor||"—")}</strong></td><td>${escaparHtml(f.comprobante||"—")}</td><td>${escaparHtml(f.numero||"—")}</td><td>${escaparHtml(f.puntoVenta||"—")}</td><td><span class="compras-fiscal-tag">${escaparHtml(f.condicionFiscal||"—")}</span></td><td><strong>${money(f.total)}</strong></td><td class="compras-note-cell" title="${escaparHtml(f.observaciones||"")}">${escaparHtml(f.observaciones||"—")}</td><td><button class="compras-row-action danger" type="button" data-remove="${escaparHtml(f.id)}" title="Eliminar factura" aria-label="Eliminar factura"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></button></td></tr>`).join("")||'<tr><td colspan="10" class="compras-history-empty">No hay facturas para los filtros seleccionados.</td></tr>';
  paginasCompras("comprasHistPaginas","comprasHistPaginacionInfo",lista.length,paginaHistorial,n=>{paginaHistorial=n;renderHistorial();});
  body.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",async()=>{const ok=window.AppDialog?.confirm?await window.AppDialog.confirm({title:"Eliminar factura",message:"¿Eliminar esta factura del historial?",confirmText:"Eliminar",cancelText:"Cancelar"}):confirm("¿Eliminar esta factura del historial?");if(!ok)return;guardarFacturas(facturas().filter(f=>String(f.id)!==b.dataset.remove));renderHistorial();actualizarResumen();}));
}

function escaparHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
const PROVEEDORES_KEY="autoservicio_proveedores_fichas_v1";
const proveedoresGuardados=()=>{try{const a=JSON.parse(localStorage.getItem(PROVEEDORES_KEY)||"[]");return Array.isArray(a)?a:[]}catch{return []}};
const guardarProveedores=a=>localStorage.setItem(PROVEEDORES_KEY,JSON.stringify(a));
// Comparación consistente con los registros históricos y las fichas manuales.
const cuitProveedor = valor => String(valor ?? "").replace(/\D/g, "");
const nombreProveedor = valor => String(valor ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
function registrarProveedorDeFactura(factura) {
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
   for (const [campo, dato] of Object.entries({cuit, razonSocial, nombreComercial, condicionFiscal: factura.condicionFiscal || ""})) {
     if (!ficha[campo] && dato) { ficha[campo] = dato; cambio = true; }
   }
   if (cambio) guardarProveedores(fichas);
   return;
 }
 const codigo = String(Math.max(0, ...fichas.map(p => Number(p.codigo) || 0)) + 1).padStart(3, "0");
 fichas.push({id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
   codigo, razonSocial, nombreComercial, cuit,
   condicionFiscal: factura.condicionFiscal || "", cuentas: [],
   creadoEn: new Date().toISOString(), origen: "factura"});
 guardarProveedores(fichas);
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
function guardarFichaProveedor(e){e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form).entries());
 data.razonSocial=(data.razonSocial||"").trim();data.cuit=(data.cuit||"").replace(/\D/g,"");
 if(!data.razonSocial){form.elements.razonSocial.focus();return;}
 const todos=proveedoresGuardados();if(data.cuit&&todos.some(p=>p.id!==proveedorEditando&&p.cuit===data.cuit)){alert("Ya existe un proveedor registrado con ese CUIT.");return;}
 data.cuentas=[...$("comprasCuentasBancarias").children].map(div=>{const cuenta={};div.querySelectorAll("[data-banco]").forEach(el=>cuenta[el.dataset.banco]=el.value.trim());cuenta.principal=div.querySelector('input[type="radio"]').checked;return cuenta}).filter(c=>Object.entries(c).some(([k,v])=>k!=="principal"&&v));
 if(data.cuentas.length&&!data.cuentas.some(c=>c.principal))data.cuentas[0].principal=true;
 data.id=proveedorEditando||crypto.randomUUID();data.codigo=proveedorEditando?(todos.find(p=>p.id===proveedorEditando)?.codigo||""):String(Math.max(0,...todos.map(p=>Number(p.codigo)||0))+1).padStart(3,"0");
 const i=todos.findIndex(p=>p.id===data.id);if(i<0)todos.push(data);else todos[i]=data;
 try{guardarProveedores(todos)}catch{alert("No se pudieron guardar los datos del proveedor.");return;}
 $("comprasFichaProveedorModal").classList.add("oculto");renderProveedores();actualizarResumen();
}
function agruparProveedores(){
 const grupos=new Map();
 proveedoresGuardados().forEach(p=>{const clave=p.cuit?`c:${p.cuit.replace(/\D/g,"")}`:`n:${p.razonSocial.toLocaleLowerCase("es")}`;grupos.set(clave,{...p,clave,nombre:p.nombreComercial||p.razonSocial,fiscal:p.condicionFiscal||"—",facturas:[],total:0,ultima:""});});
 facturas().forEach(f=>{const cuit=String(f.cuit||"").replace(/\D/g,""),nombre=String(f.proveedor||f.razonSocial||"").trim();if(!cuit&&!nombre)return;const clave=cuit?`c:${cuit}`:`n:${nombre.toLocaleLowerCase("es")}`;
 if(!grupos.has(clave))grupos.set(clave,{clave,nombre:nombre||"—",razonSocial:f.razonSocial||nombre,cuit:cuit||"—",fiscal:f.condicionFiscal||"—",facturas:[],total:0,ultima:""});
 const p=grupos.get(clave);p.facturas.push(f);p.total+=numero(f.total);if(String(f.fecha||"")>p.ultima)p.ultima=String(f.fecha||"");
 });return [...grupos.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
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
function init(){ if(!$("adminTab-compras"))return; $("comprasFecha").value ||= hoy(); items=[itemVacio()]; renderItems(); inicializarSelectores($("adminTab-compras")); actualizarResumen(); document.addEventListener("click",()=>cerrarSelectores());
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
    el.addEventListener("input",()=>{ totalesManuales.add(id); if (id !== "comprasTotal") { importesDetectados = null; totalesManuales.delete("comprasTotal"); } calcularTotales(); });
    el.addEventListener("blur",()=>{ el.value=importeAR(el.value); });
  }); $("comprasComprobante")?.addEventListener("input",calcularTotales); $("comprasZoomOut")?.addEventListener("click",()=>ajustarZoom(-.15)); $("comprasZoomIn")?.addEventListener("click",()=>ajustarZoom(.15)); $("comprasPreviewReset")?.addEventListener("click",()=>ajustarZoom(0,true)); $("comprasQuitarArchivo")?.addEventListener("click",()=>resetForm()); $("comprasAdjuntoBtn")?.addEventListener("click",()=>$("comprasAdjunto")?.click()); $("comprasAdjunto")?.addEventListener("change",e=>{adjuntos.push(...e.target.files);renderAdjuntos();e.target.value=""}); $("comprasGuardar")?.addEventListener("click",(e)=>{e.preventDefault(); guardar();}); $("comprasCancelar")?.addEventListener("click",()=>resetForm()); $("comprasVerHistorial")?.addEventListener("click",()=>mostrarVistaCompras("historial")); $("comprasVerTodasInferior")?.addEventListener("click",()=>mostrarVistaCompras("historial")); $("comprasNuevaFactura")?.addEventListener("click",()=>mostrarVistaCompras("editor")); $("comprasVerProveedores")?.addEventListener("click",()=>mostrarVistaCompras("proveedores")); $("comprasProveedoresVolver")?.addEventListener("click",()=>mostrarVistaCompras("editor")); $("comprasProvBuscar")?.addEventListener("input",()=>{paginaProveedores=1;$("comprasProvDetalle")?.classList.add("oculto");renderProveedores();}); $("comprasProvLimpiar")?.addEventListener("click",()=>{$("comprasProvBuscar").value="";$("comprasProvFiscal").value="";$("comprasProvOrden").value="nombre";paginaProveedores=1;$("comprasProvDetalle")?.classList.add("oculto");renderProveedores();}); $("comprasProvCerrarDetalle")?.addEventListener("click",()=>$("comprasProvDetalle")?.classList.add("oculto")); $("comprasProvFiscal")?.addEventListener("change",()=>{paginaProveedores=1;renderProveedores();});$("comprasProvOrden")?.addEventListener("change",()=>{paginaProveedores=1;renderProveedores();});$("comprasHistProveedor")?.addEventListener("change",()=>{paginaHistorial=1;renderHistorial();});$("comprasHistBuscar")?.addEventListener("input",()=>{paginaHistorial=1;renderHistorial();}); $("comprasHistMes")?.addEventListener("change",renderHistorial); ["comprasHistTipo","comprasHistDesde","comprasHistHasta"].forEach(id=>$(id)?.addEventListener("change",()=>{paginaHistorial=1;renderHistorial();})); $("comprasHistLimpiar")?.addEventListener("click",()=>{["comprasHistBuscar","comprasHistTipo","comprasHistDesde","comprasHistHasta","comprasHistProveedor"].forEach(id=>{if($(id))$(id).value="";});renderHistorial();}); $("comprasObservaciones")?.addEventListener("input",e=>{const c=document.querySelector("#adminTab-compras .compras-char-count");if(c)c.textContent=`${e.target.value.length} / 500`;}); $("comprasNuevoProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus()); $("comprasBuscarProveedor")?.addEventListener("click",()=>$("comprasProveedor")?.focus());
}
window.ComprasFacturas={render(){actualizarResumen();renderItems();},actualizarResumen,limpiar:()=>resetForm()};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
