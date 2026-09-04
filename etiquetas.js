import { iniciarScanner, detenerScanner } from "./scanner.js?v=1960-d21-cierre-etapa6-010926";
import { obtenerJsonCacheado } from "./api-cache.js?v=1960-d21-cierre-etapa6-010926";
import { ordenarPorBusqueda } from "./search.js?v=1960-d21-cierre-etapa6-010926";
import { escapeHTML as esc } from "./shared/dom-utils.js?v=1960-d21-cierre-etapa6-010926";

const $ = (id) => document.getElementById(id);
let catalogo = [];
let catalogoCargado = false;
let cargandoCatalogo = null;
let items = [];
let scannerAbierto = false;
let bloqueoLecturaHasta = 0;
let claveUsuarioActiva = "";

const STORAGE_ETIQUETAS_PREFIX = "autoservicio:etiquetas:v1:";

function identidadUsuario(usuario = window.AutoservicioAuth?.getUsuario?.()) {
  const valor = usuario?.usuario ?? usuario?.id ?? usuario?.email ?? "";
  return String(valor || "").trim().toLowerCase();
}

function claveStorageUsuario(usuario = window.AutoservicioAuth?.getUsuario?.()) {
  const identidad = identidadUsuario(usuario);
  return identidad ? `${STORAGE_ETIQUETAS_PREFIX}${encodeURIComponent(identidad)}` : "";
}

function normalizarItemsGuardados(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => ({
    ...normalizarProducto(item),
    cantidad: Math.max(1, Math.trunc(Number(item?.cantidad || 1)) || 1),
  })).filter((item) => item.codigo || item.articulo);
}

function guardarListaUsuario() {
  if (!claveUsuarioActiva) return;
  try {
    localStorage.setItem(claveUsuarioActiva, JSON.stringify(items));
  } catch (error) {
    console.warn("No se pudo guardar la lista de etiquetas del usuario.", error);
  }
}

function cargarListaUsuario(usuario = window.AutoservicioAuth?.getUsuario?.()) {
  const nuevaClave = claveStorageUsuario(usuario);
  if (claveUsuarioActiva && claveUsuarioActiva !== nuevaClave) guardarListaUsuario();
  claveUsuarioActiva = nuevaClave;
  if (!nuevaClave) {
    items = [];
    render();
    return;
  }
  try {
    items = normalizarItemsGuardados(JSON.parse(localStorage.getItem(nuevaClave) || "[]"));
  } catch (error) {
    console.warn("No se pudo recuperar la lista de etiquetas del usuario.", error);
    items = [];
  }
  render();
}

function vaciarListaUsuario() {
  items = [];
  if (claveUsuarioActiva) {
    try { localStorage.removeItem(claveUsuarioActiva); } catch {}
  }
  render();
}

function normalizarProducto(p) {
  return {
    codigo: String(p?.codigo || p?.ean || "").trim(),
    articulo: String(p?.articulo || p?.descripcion || "Producto").trim(),
    precio: Number(p?.precio || 0) || 0,
  };
}

function formatearPrecio(valor) {
  const numero = Number(valor || 0);
  if (!Number.isFinite(numero) || numero <= 0) return "Sin precio";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numero);
}

async function cargarCatalogo({ forzar = false } = {}) {
  if (catalogoCargado && !forzar) return catalogo;
  if (cargandoCatalogo) return cargandoCatalogo;
  cargandoCatalogo = obtenerJsonCacheado("/productos-maestro", {
    ttl: 5 * 60 * 1000,
    forzar,
  })
    .then((data) => (data.productos || []).map(normalizarProducto).filter((p) => p.codigo || p.articulo))
    .then((lista) => {
      catalogo = lista;
      catalogoCargado = true;
      return lista;
    })
    .finally(() => { cargandoCatalogo = null; });
  return cargandoCatalogo;
}

function fechaImpresion() {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function buscarExacto(codigo) {
  const limpio = String(codigo || "").trim();
  return catalogo.find((p) => p.codigo === limpio) || null;
}

function buscar(texto, limite = 8) {
  const q = String(texto || "").trim();
  if (q.length < 2) return [];
  return ordenarPorBusqueda(catalogo, q, { limite, campos: ["articulo", "codigo"] });
}

function agregarProducto(producto) {
  if (!producto) return;
  const p = normalizarProducto(producto);
  const existente = items.find((item) => item.codigo && item.codigo === p.codigo);
  if (existente) existente.cantidad += 1;
  else items.push({ ...p, cantidad: 1 });
  guardarListaUsuario();
  render();
}

function cambiarCantidad(index, delta) {
  const item = items[index];
  if (!item) return;
  item.cantidad = Math.max(1, Number(item.cantidad || 1) + delta);
  guardarListaUsuario();
  render();
}

function quitar(index) {
  items.splice(index, 1);
  guardarListaUsuario();
  render();
}

function totalEtiquetas() {
  return items.reduce((acc, item) => acc + Math.max(1, Number(item.cantidad || 1)), 0);
}

function render() {
  const lista = $("etiquetasLista");
  const productosCount = $("etiquetasProductosCount");
  const totalCount = $("etiquetasTotalCount");
  const imprimir = $("btnEtiquetasImprimir");
  const vaciar = $("btnEtiquetasVaciar");
  if (productosCount) productosCount.textContent = String(items.length);
  if (totalCount) totalCount.textContent = String(totalEtiquetas());
  if (imprimir) {
    imprimir.disabled = items.length === 0;
    const total = totalEtiquetas();
    imprimir.textContent = total ? `Imprimir hoja A4 (${total} etiqueta${total === 1 ? "" : "s"})` : "Imprimir hoja A4";
  }
  if (vaciar) vaciar.disabled = items.length === 0;
  if (!lista) return;

  if (!items.length) {
    lista.innerHTML = `<div class="etiquetas-empty"><span><svg class="app-icon"><use href="#icon-tag"></use></svg></span><strong>La hoja está vacía</strong><small>Escaneá o buscá productos para empezar.</small></div>`;
    return;
  }

  lista.innerHTML = `
    <div class="etiquetas-table-head" aria-hidden="true">
      <span>#</span><span>Descripción</span><span>Código de barras</span><span>Precio</span><span>Etiquetas</span><span>Acciones</span>
    </div>` + items.map((item, index) => `
    <article class="etiquetas-item">
      <span class="etiquetas-item-index">${index + 1}</span>
      <div class="etiquetas-item-copy"><strong>${esc(item.articulo)}</strong><small>Código: ${esc(item.codigo || "Sin código")}</small></div>
      <span class="etiquetas-item-code">${esc(item.codigo || "Sin código")}</span>
      <strong class="etiquetas-item-price">${esc(formatearPrecio(item.precio))}</strong>
      <div class="etiquetas-qty" aria-label="Cantidad de etiquetas">
        <button type="button" data-etiqueta-restar="${index}" aria-label="Quitar una etiqueta">−</button>
        <b>${Math.max(1, Number(item.cantidad || 1))}</b>
        <button type="button" data-etiqueta-sumar="${index}" aria-label="Agregar una etiqueta">＋</button>
      </div>
      <button class="etiquetas-remove" type="button" data-etiqueta-quitar="${index}" aria-label="Eliminar ${esc(item.articulo)}">×</button>
    </article>`).join("");

  lista.querySelectorAll("[data-etiqueta-restar]").forEach((b) => b.addEventListener("click", () => cambiarCantidad(Number(b.dataset.etiquetaRestar), -1)));
  lista.querySelectorAll("[data-etiqueta-sumar]").forEach((b) => b.addEventListener("click", () => cambiarCantidad(Number(b.dataset.etiquetaSumar), 1)));
  lista.querySelectorAll("[data-etiqueta-quitar]").forEach((b) => b.addEventListener("click", () => quitar(Number(b.dataset.etiquetaQuitar))));
}

function ocultarSugerencias() {
  const box = $("etiquetasSugerencias");
  if (!box) return;
  box.classList.add("oculto");
  box.innerHTML = "";
}

function renderSugerencias(lista) {
  const box = $("etiquetasSugerencias");
  if (!box) return;
  if (!lista.length) return ocultarSugerencias();
  box.innerHTML = lista.map((p, i) => `<button type="button" data-etiqueta-sugerencia="${i}"><strong>${esc(p.articulo)}</strong><small>${esc(p.codigo || "Sin código")}</small><span>＋</span></button>`).join("");
  box.classList.remove("oculto");
  box.querySelectorAll("[data-etiqueta-sugerencia]").forEach((btn) => btn.addEventListener("click", () => {
    const p = lista[Number(btn.dataset.etiquetaSugerencia)];
    if (!p) return;
    agregarProducto(p);
    $("etiquetasBuscarInput").value = "";
    ocultarSugerencias();
  }));
}

async function agregarDesdeEntrada(valor) {
  await cargarCatalogo();
  const q = String(valor || "").trim();
  if (!q) return false;
  const exacto = buscarExacto(q);
  if (exacto) {
    agregarProducto(exacto);
    return true;
  }
  const encontrados = buscar(q, 1);
  if (encontrados.length === 1) {
    agregarProducto(encontrados[0]);
    return true;
  }
  return false;
}

function resetearCargaScanner() {
  const start = $("etiquetasScanStart");
  const camera = $("etiquetasCameraCard");
  const manual = $("etiquetasManualPanel");
  const error = $("etiquetasCameraError");
  start?.classList.remove("oculto", "manual-active");
  camera?.classList.add("oculto");
  manual?.classList.add("oculto");
  if (error) {
    error.textContent = "";
    error.classList.add("oculto");
  }
  ocultarSugerenciasScanner();
}

function ocultarSugerenciasScanner() {
  const box = $("etiquetasScannerSugerencias");
  if (!box) return;
  box.innerHTML = "";
  box.classList.add("oculto");
}

function renderSugerenciasScanner(resultados) {
  const box = $("etiquetasScannerSugerencias");
  if (!box) return;
  if (!resultados.length) {
    ocultarSugerenciasScanner();
    return;
  }
  box.innerHTML = resultados.slice(0, 8).map((producto, index) => `
    <button type="button" class="manual-suggestion-item" data-etiqueta-scanner-sug="${index}">
      <strong>${esc(producto.articulo)}</strong>
      <span>${esc(producto.codigo || "Sin código")}</span>
    </button>`).join("");
  box.classList.remove("oculto");
  box.querySelectorAll("[data-etiqueta-scanner-sug]").forEach((button) => {
    button.addEventListener("click", () => {
      const producto = resultados[Number(button.dataset.etiquetaScannerSug)];
      if (!producto) return;
      agregarProducto(producto);
      const input = $("etiquetasCodigoManual");
      if (input) input.value = "";
      ocultarSugerenciasScanner();
    });
  });
}

async function abrirScanner() {
  if (scannerAbierto) return;
  const modal = $("etiquetasScannerModal");
  modal?.classList.remove("oculto");
  modal?.setAttribute("aria-hidden", "false");
  scannerAbierto = true;
  resetearCargaScanner();
  await cargarCatalogo().catch(() => {});
}

async function iniciarCamaraEtiquetas() {
  if (!scannerAbierto) return;
  const start = $("etiquetasScanStart");
  const camera = $("etiquetasCameraCard");
  const error = $("etiquetasCameraError");
  if (error) {
    error.textContent = "";
    error.classList.add("oculto");
  }
  start?.classList.add("oculto");
  camera?.classList.remove("oculto");
  try {
    await iniciarScanner("videoEtiquetas", async (codigo) => {
      if (!scannerAbierto || Date.now() < bloqueoLecturaHasta) return;
      bloqueoLecturaHasta = Date.now() + 900;
      await agregarDesdeEntrada(codigo);
    });
  } catch (err) {
    detenerScanner();
    camera?.classList.add("oculto");
    start?.classList.remove("oculto");
    if (error) {
      error.textContent = err?.message || "No se pudo iniciar la cámara. Revisá los permisos del navegador o usá el ingreso manual.";
      error.classList.remove("oculto");
    }
  }
}

function abrirManualEtiquetas() {
  detenerScanner();
  $("etiquetasCameraCard")?.classList.add("oculto");
  const start = $("etiquetasScanStart");
  const panel = $("etiquetasManualPanel");
  start?.classList.remove("oculto");
  start?.classList.add("manual-active");
  panel?.classList.remove("oculto");
  setTimeout(() => $("etiquetasCodigoManual")?.focus(), 0);
}

function cerrarScanner() {
  if (!scannerAbierto) return;
  scannerAbierto = false;
  detenerScanner();
  const modal = $("etiquetasScannerModal");
  modal?.classList.add("oculto");
  modal?.setAttribute("aria-hidden", "true");
  resetearCargaScanner();
}

function construirHojaImpresion() {
  document.getElementById("etiquetasPrintSheet")?.remove();
  const sheet = document.createElement("section");
  sheet.id = "etiquetasPrintSheet";
  sheet.className = "etiquetas-print-sheet";
  const fecha = fechaImpresion();
  const etiquetas = [];
  items.forEach((item) => {
    const cantidad = Math.max(1, Number(item.cantidad || 1));
    for (let i = 0; i < cantidad; i += 1) etiquetas.push(item);
  });
  sheet.innerHTML = etiquetas.map((item) => `<article class="etiqueta-print-item"><strong>${esc(item.articulo)}</strong><div class="etiqueta-print-price">${esc(formatearPrecio(item.precio))}</div><div class="etiqueta-print-meta"><b>${esc(item.codigo || "Sin código")}</b><span>${esc(fecha)}</span></div></article>`).join("");
  document.body.appendChild(sheet);
  return sheet;
}


function imprimir() {
  if (!items.length) return;
  construirHojaImpresion();
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

async function activar() {
  cargarListaUsuario();
  await cargarCatalogo().catch(() => {});
  render();
}

function desactivar() {
  cerrarScanner();
  ocultarSugerencias();
}

function init() {
  $("btnEtiquetasEscanear")?.addEventListener("click", abrirScanner);
  $("etiquetasFab")?.addEventListener("click", abrirScanner);
  $("btnEtiquetasScannerCerrar")?.addEventListener("click", cerrarScanner);
  $("etiquetasScannerModal")?.addEventListener("click", (e) => { if (e.target?.matches?.("[data-etiquetas-scan-close]")) cerrarScanner(); });
  $("btnEtiquetasAbrirCamara")?.addEventListener("click", iniciarCamaraEtiquetas);
  $("btnEtiquetasManualToggle")?.addEventListener("click", abrirManualEtiquetas);
  $("btnEtiquetasManualDesdeScanner")?.addEventListener("click", abrirManualEtiquetas);
  $("btnEtiquetasVaciar")?.addEventListener("click", vaciarListaUsuario);
  $("btnEtiquetasImprimir")?.addEventListener("click", imprimir);
  $("btnEtiquetasBuscar")?.addEventListener("click", async () => {
    const input = $("etiquetasBuscarInput");
    const ok = await agregarDesdeEntrada(input?.value);
    if (ok && input) input.value = "";
    ocultarSugerencias();
  });
  $("etiquetasBuscarInput")?.addEventListener("input", async (e) => {
    await cargarCatalogo().catch(() => {});
    renderSugerencias(buscar(e.target.value));
  });
  $("etiquetasBuscarInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("btnEtiquetasBuscar")?.click(); });
  $("btnEtiquetasCodigoManual")?.addEventListener("click", async () => {
    const input = $("etiquetasCodigoManual");
    const ok = await agregarDesdeEntrada(input?.value);
    if (ok && input) input.value = "";
  });
  $("etiquetasCodigoManual")?.addEventListener("input", async (e) => {
    await cargarCatalogo().catch(() => {});
    renderSugerenciasScanner(buscar(e.target.value));
  });
  $("etiquetasCodigoManual")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("btnEtiquetasCodigoManual")?.click(); });
  window.addEventListener("afterprint", () => document.getElementById("etiquetasPrintSheet")?.remove());
  window.addEventListener("autoservicio:sesion", (event) => cargarListaUsuario(event.detail));
  cargarListaUsuario();
}

window.EtiquetasModule = { activar, desactivar };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
