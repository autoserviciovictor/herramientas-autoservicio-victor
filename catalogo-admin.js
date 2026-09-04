import { API_BASE_URL } from "./config.js?v=1960-d21-cierre-etapa6-010926";

const $ = (id) => document.getElementById(id);
const estado = {
  activo: false,
  tab: "productos",
  pagina: 1,
  limite: 50,
  paginas: 0,
  total: 0,
  productos: [],
  rubros: [],
  busquedaTimer: null,
  cargando: false,
};

const esc = (v = "") => String(v).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const moneda = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }) : "—";
const numero = (n) => Number(n || 0).toLocaleString("es-AR");

async function api(ruta, opciones = {}) {
  const headers = new Headers(opciones.headers || {});
  if (opciones.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const r = await fetch(`${API_BASE_URL}${ruta}`, { ...opciones, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.mensaje || "No se pudo completar la operación");
  return data;
}

function mensaje(texto = "", tipo = "") {
  const el = $("catalogAdminMensaje");
  if (!el) return;
  el.textContent = texto;
  el.className = `catalog-admin-message ${tipo}`.trim();
  clearTimeout(mensaje.timer);
  if (texto) mensaje.timer = setTimeout(() => mensaje(""), 3800);
}

async function cargarEstado() {
  const data = await api("/admin/catalogo/estado");
  $("catalogMetricaTotal").textContent = numero(data.total);
  $("catalogMetricaVisibles").textContent = numero(data.visibles);
  $("catalogMetricaOcultos").textContent = numero(data.ocultos);
  $("catalogMetricaRubros").textContent = numero(data.rubros);
}

async function cargarRubros() {
  const data = await api("/admin/catalogo/rubros");
  estado.rubros = data.rubros || [];
  poblarSelectRubros();
  renderRubros();
}

function poblarSelectRubros() {
  const filtro = $("catalogFiltroRubro");
  const producto = $("catalogProductoRubro");
  const actualFiltro = filtro?.value || "todos";
  const actualProducto = producto?.value || "";
  const opciones = estado.rubros.map((r) => `<option value="${r.id}">${esc(r.nombre)}${r.activo ? "" : " (inactivo)"}</option>`).join("");
  if (filtro) {
    filtro.innerHTML = `<option value="todos">Todos los rubros</option><option value="sin-rubro">Sin rubro</option>${opciones}`;
    if ([...filtro.options].some((o) => o.value === actualFiltro)) filtro.value = actualFiltro;
  }
  if (producto) {
    producto.innerHTML = `<option value="">Sin rubro</option>${opciones}`;
    if ([...producto.options].some((o) => o.value === actualProducto)) producto.value = actualProducto;
  }
}

function parametrosProductos() {
  const p = new URLSearchParams({ pagina: String(estado.pagina), limite: String(estado.limite) });
  const q = $("catalogBuscarProductos")?.value.trim();
  const rubro = $("catalogFiltroRubro")?.value || "todos";
  const est = $("catalogFiltroEstado")?.value || "todos";
  const imagen = $("catalogFiltroImagen")?.value || "todos";
  if (q) p.set("q", q);
  if (rubro !== "todos") p.set("rubro", rubro);
  if (est !== "todos") p.set("estado", est);
  if (imagen !== "todos") p.set("imagen", imagen);
  return p;
}

async function cargarProductos({ conservarPagina = true } = {}) {
  if (estado.cargando) return;
  estado.cargando = true;
  if (!conservarPagina) estado.pagina = 1;
  const body = $("catalogProductosBody");
  if (body) body.innerHTML = '<tr><td colspan="7"><div class="catalog-loading">Cargando productos…</div></td></tr>';
  try {
    const data = await api(`/admin/catalogo/productos?${parametrosProductos()}`);
    estado.productos = data.productos || [];
    estado.pagina = Number(data.pagina) || 1;
    estado.paginas = Number(data.paginas) || 0;
    estado.total = Number(data.total) || 0;
    renderProductos();
  } finally {
    estado.cargando = false;
  }
}

function etiquetaUnidad(u) {
  return ({ unidad: "Unidad", kg: "Kg", pack: "Pack", cajon: "Cajón", bulto: "Bulto", litro: "Litro", metro: "Metro" })[u] || u || "Unidad";
}

function renderProductos() {
  const body = $("catalogProductosBody");
  if (!body) return;
  if (!estado.productos.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="catalog-empty">No hay productos que coincidan con los filtros.</div></td></tr>';
  } else {
    body.innerHTML = estado.productos.map((p) => {
      const chip = !p.configurado ? '<span class="catalog-chip unconfigured">Sin configurar</span>' : p.visible ? '<span class="catalog-chip visible">Visible</span>' : '<span class="catalog-chip hidden">Oculto</span>';
      return `<tr data-code="${esc(p.codigo)}">
        <td><div class="catalog-product-cell"><span class="catalog-product-thumb ${p.imagen ? "has-image" : ""}">${p.imagen ? `<img src="${esc(p.imagen)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '<svg class="app-icon"><use href="#icon-box"></use></svg>'}</span><div class="catalog-product-copy"><strong title="${esc(p.nombre)}">${esc(p.nombre)}</strong><small>${esc(p.codigo)}${p.destacado ? " · Destacado" : ""} · ${esc(({confirmada:"Imagen confirmada",revisar:"Revisar imagen",pendiente:"Imagen pendiente",sin_imagen:"Sin imagen"})[p.estadoImagen] || "Sin imagen")}</small></div></div></td>
        <td>${p.rubro ? esc(p.rubro) : '<span class="catalog-chip unconfigured">Sin rubro</span>'}</td>
        <td><span class="catalog-price">${moneda(p.precio)}</span></td>
        <td>${esc(etiquetaUnidad(p.unidadVenta))}</td>
        <td>${chip}</td>
        <td class="catalog-col-order">${Number(p.orden) || 0}</td>
        <td><div class="catalog-row-actions"><label class="catalog-visibility-toggle" title="${p.visible ? "Ocultar producto" : "Mostrar producto"}"><input type="checkbox" data-catalog-visible="${esc(p.codigo)}" ${p.visible ? "checked" : ""}><span></span></label><button class="catalog-edit-btn" type="button" data-catalog-edit="${esc(p.codigo)}">Editar</button></div></td>
      </tr>`;
    }).join("");
  }
  const desde = estado.total ? (estado.pagina - 1) * estado.limite + 1 : 0;
  const hasta = Math.min(estado.total, estado.pagina * estado.limite);
  $("catalogProductosResumen").textContent = estado.total ? `Mostrando ${numero(desde)}–${numero(hasta)} de ${numero(estado.total)} productos` : "Sin resultados";
  renderPaginacion();
  body.querySelectorAll("[data-catalog-edit]").forEach((b) => b.addEventListener("click", () => abrirProducto(b.dataset.catalogEdit)));
  body.querySelectorAll("[data-catalog-visible]").forEach((input) => input.addEventListener("change", async () => {
    const previo = !input.checked;
    input.disabled = true;
    try {
      await api(`/admin/catalogo/productos/${encodeURIComponent(input.dataset.catalogVisible)}/visibilidad`, { method: "PATCH", body: JSON.stringify({ visible: input.checked }) });
      await Promise.all([cargarEstado(), cargarProductos()]);
      mensaje(input.checked ? "Producto visible en catálogo." : "Producto oculto del catálogo.", "ok");
    } catch (e) {
      input.checked = previo;
      mensaje(e.message);
    } finally { input.disabled = false; }
  }));
}

function paginasVisibles() {
  const total = estado.paginas;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total, estado.pagina - 1, estado.pagina, estado.pagina + 1]);
  return [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
}

function renderPaginacion() {
  const cont = $("catalogProductosPaginacion");
  if (!cont) return;
  if (estado.paginas <= 1) { cont.innerHTML = ""; return; }
  const parts = [`<button data-page="${Math.max(1, estado.pagina - 1)}" ${estado.pagina === 1 ? "disabled" : ""}>‹</button>`];
  let anterior = 0;
  for (const n of paginasVisibles()) {
    if (anterior && n - anterior > 1) parts.push('<button disabled>…</button>');
    parts.push(`<button data-page="${n}" class="${n === estado.pagina ? "activo" : ""}">${n}</button>`);
    anterior = n;
  }
  parts.push(`<button data-page="${Math.min(estado.paginas, estado.pagina + 1)}" ${estado.pagina === estado.paginas ? "disabled" : ""}>›</button>`);
  cont.innerHTML = parts.join("");
  cont.querySelectorAll("button[data-page]").forEach((b) => b.addEventListener("click", () => { estado.pagina = Number(b.dataset.page); cargarProductos(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
}

function cambiarTab(tab) {
  estado.tab = tab === "rubros" ? "rubros" : "productos";
  document.querySelectorAll("[data-catalog-tab]").forEach((b) => { const on = b.dataset.catalogTab === estado.tab; b.classList.toggle("activo", on); b.setAttribute("aria-selected", String(on)); });
  document.querySelectorAll("[data-catalog-panel]").forEach((p) => p.classList.toggle("oculto", p.dataset.catalogPanel !== estado.tab));
}

function etiquetaEstadoImagen(valor) {
  return ({ confirmada: "Confirmada", revisar: "Revisar", pendiente: "Pendiente", sin_imagen: "Sin imagen" })[valor] || "Sin imagen";
}

function renderImagenProducto(p = {}) {
  const preview = $("catalogProductoImagenPreview");
  const input = $("catalogProductoImagenUrl");
  const meta = $("catalogProductoImagenMeta");
  const confirmar = $("catalogProductoConfirmarImagen");
  const quitar = $("catalogProductoQuitarImagen");
  const estadoEl = $("catalogProductoEstadoImagen");
  const candidata = p.candidatoImagen || "";
  const imagen = p.imagen || "";
  const mostrada = candidata || imagen;
  if (estadoEl) estadoEl.textContent = etiquetaEstadoImagen(p.estadoImagen);
  if (input) input.value = imagen || candidata || "";
  if (preview) {
    preview.innerHTML = mostrada
      ? `<img src="${esc(mostrada)}" alt="Vista previa de ${esc(p.nombre || "producto")}" referrerpolicy="no-referrer" />`
      : '<span><svg class="app-icon"><use href="#icon-box"></use></svg></span><small>Sin imagen</small>';
  }
  if (confirmar) confirmar.classList.toggle("oculto", !candidata);
  if (quitar) quitar.classList.toggle("oculto", !imagen && !candidata);
  if (meta) {
    if (candidata) meta.textContent = `Candidata: ${p.candidatoFuente || "fuente automática"}${p.candidatoPuntaje ? ` · coincidencia ${p.candidatoPuntaje}%` : ""}`;
    else if (imagen) meta.textContent = `Fuente: ${p.fuenteImagen || "configurada"}`;
    else if (p.errorImagen) meta.textContent = p.errorImagen;
    else meta.textContent = "Todavía no se buscó una imagen para este producto.";
  }
}

async function recargarProductoAbierto() {
  const codigo = $("catalogProductoModal")?.dataset.codigo;
  if (!codigo) return null;
  const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}`);
  renderImagenProducto(data.producto || {});
  return data.producto;
}

function estadoBusquedaImagen(texto = "", tipo = "") {
  const el = $("catalogProductoImagenEstadoBusqueda");
  if (!el) return;
  el.textContent = texto;
  el.className = `catalog-image-search-status ${tipo}`.trim();
}

async function buscarImagenProductoActual() {
  const codigo = $("catalogProductoModal")?.dataset.codigo;
  if (!codigo) return;
  const boton = $("catalogProductoBuscarImagen");
  boton.disabled = true;
  estadoBusquedaImagen("Buscando imagen… Puede demorar unos segundos.", "buscando");
  try {
    const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}/imagen/buscar`, { method: "POST" });
    renderImagenProducto(data.producto || {});
    await cargarEstado();
    if (data.encontrado) estadoBusquedaImagen("Imagen candidata encontrada. Revisala antes de confirmarla.", "ok");
    else estadoBusquedaImagen("No se encontró una imagen automática para este producto.", "error");
  } catch (e) {
    estadoBusquedaImagen(e.message || "No se pudo buscar la imagen.", "error");
  } finally {
    boton.disabled = false;
  }
}

async function guardarImagenManualActual() {
  const codigo = $("catalogProductoModal")?.dataset.codigo;
  const imagen = $("catalogProductoImagenUrl")?.value.trim();
  if (!codigo || !imagen) return mensaje("Pegá una URL HTTPS de imagen.");
  try {
    const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}/imagen`, { method: "PUT", body: JSON.stringify({ imagen }) });
    renderImagenProducto(data.producto || {});
    await Promise.all([cargarEstado(), cargarProductos()]);
    mensaje("Imagen guardada y confirmada.", "ok");
  } catch (e) { mensaje(e.message); }
}

async function confirmarImagenActual() {
  const codigo = $("catalogProductoModal")?.dataset.codigo;
  if (!codigo) return;
  try {
    const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}/imagen/confirmar`, { method: "POST" });
    renderImagenProducto(data.producto || {});
    await Promise.all([cargarEstado(), cargarProductos()]);
    mensaje("Imagen confirmada.", "ok");
  } catch (e) { mensaje(e.message); }
}

async function quitarImagenActual() {
  const codigo = $("catalogProductoModal")?.dataset.codigo;
  if (!codigo) return;
  try {
    const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}/imagen`, { method: "DELETE" });
    renderImagenProducto(data.producto || {});
    await Promise.all([cargarEstado(), cargarProductos()]);
    mensaje("Imagen quitada.", "ok");
  } catch (e) { mensaje(e.message); }
}

async function buscarImagenesLote() {
  const boton = $("catalogBtnBuscarImagenes");
  if (!boton || boton.disabled) return;
  boton.disabled = true;
  const texto = boton.querySelector("span");
  const anterior = texto?.textContent || "Buscar 20 imágenes";
  if (texto) texto.textContent = "Buscando…";
  mensaje("Buscando imágenes para 20 productos sin imagen…");
  try {
    const data = await api("/admin/catalogo/imagenes/buscar-lote", { method: "POST", body: JSON.stringify({ limite: 20 }) });
    const r = data.resumen || {};
    await Promise.all([cargarEstado(), cargarProductos()]);
    mensaje(`Procesados ${numero(r.procesados)} · confirmadas ${numero(r.confirmadas)} · revisar ${numero(r.revisar)} · sin imagen ${numero(r.sinImagen)}`, "ok");
  } catch (e) { mensaje(e.message); }
  finally { boton.disabled = false; if (texto) texto.textContent = anterior; }
}

async function abrirProducto(codigo) {
  try {
    const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}`);
    const p = data.producto;
    $("catalogProductoModalTitulo").textContent = "Editar producto";
    $("catalogProductoModalCodigo").textContent = `Código: ${p.codigo}`;
    $("catalogProductoModal").dataset.codigo = p.codigo;
    $("catalogProductoNombre").value = p.nombre || "";
    $("catalogProductoPrecio").value = p.precio ?? "";
    $("catalogProductoRubro").value = p.rubroId ?? "";
    $("catalogProductoMarca").value = p.marca || "";
    $("catalogProductoPresentacion").value = p.presentacion || "";
    $("catalogProductoUnidad").value = p.unidadVenta || "unidad";
    $("catalogProductoOrden").value = Number(p.orden) || 0;
    $("catalogProductoVisible").checked = Boolean(p.visible);
    $("catalogProductoDestacado").checked = Boolean(p.destacado);
    renderImagenProducto(p);
    abrirModal("catalogProductoModal");
  } catch (e) { mensaje(e.message); }
}

async function guardarProducto() {
  const modal = $("catalogProductoModal");
  const codigo = modal?.dataset.codigo;
  if (!codigo) return;
  const boton = $("catalogProductoGuardar");
  boton.disabled = true;
  try {
    await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}`, { method: "PUT", body: JSON.stringify({
      nombre: $("catalogProductoNombre").value,
      precio: $("catalogProductoPrecio").value,
      rubroId: $("catalogProductoRubro").value || null,
      marca: $("catalogProductoMarca").value,
      presentacion: $("catalogProductoPresentacion").value,
      unidadVenta: $("catalogProductoUnidad").value,
      orden: Number($("catalogProductoOrden").value) || 0,
      visible: $("catalogProductoVisible").checked,
      destacado: $("catalogProductoDestacado").checked,
    }) });
    cerrarModal("catalogProductoModal");
    await Promise.all([cargarEstado(), cargarProductos()]);
    mensaje("Producto actualizado correctamente.", "ok");
  } catch (e) { mensaje(e.message); }
  finally { boton.disabled = false; }
}

function renderRubros() {
  const cont = $("catalogRubrosGrid");
  if (!cont) return;
  if (!estado.rubros.length) {
    cont.innerHTML = '<div class="catalog-empty">Todavía no hay rubros. Creá el primero para empezar a organizar el catálogo.</div>';
    return;
  }
  cont.innerHTML = estado.rubros.map((r) => `<article class="catalog-rubro-card ${r.activo ? "" : "catalog-rubro-inactive"}">
    <span class="catalog-rubro-icon"><svg class="app-icon"><use href="#icon-tag"></use></svg></span>
    <div class="catalog-rubro-copy"><strong>${esc(r.nombre)}</strong><small>${esc(r.slug)}</small><div class="catalog-rubro-meta"><span>${numero(r.productos)} productos</span><span>${numero(r.visibles)} visibles</span><span>Orden ${Number(r.orden)||0}</span><span>${r.activo ? "Activo" : "Inactivo"}</span></div></div>
    <div class="catalog-rubro-actions"><button type="button" class="catalog-edit-btn" data-rubro-edit="${r.id}">Editar</button></div>
  </article>`).join("");
  cont.querySelectorAll("[data-rubro-edit]").forEach((b) => b.addEventListener("click", () => abrirRubro(Number(b.dataset.rubroEdit))));
}

function abrirRubro(id = null) {
  const r = estado.rubros.find((x) => x.id === id);
  $("catalogRubroId").value = r?.id || "";
  $("catalogRubroModalTitulo").textContent = r ? "Editar rubro" : "Nuevo rubro";
  $("catalogRubroNombre").value = r?.nombre || "";
  $("catalogRubroOrden").value = r?.orden ?? estado.rubros.length;
  $("catalogRubroDescripcion").value = r?.descripcion || "";
  $("catalogRubroActivo").checked = r ? Boolean(r.activo) : true;
  $("catalogRubroEliminar").classList.toggle("oculto", !r);
  abrirModal("catalogRubroModal");
}

async function guardarRubro() {
  const id = $("catalogRubroId").value;
  const boton = $("catalogRubroGuardar");
  boton.disabled = true;
  try {
    await api(id ? `/admin/catalogo/rubros/${id}` : "/admin/catalogo/rubros", { method: id ? "PUT" : "POST", body: JSON.stringify({ nombre: $("catalogRubroNombre").value, orden: Number($("catalogRubroOrden").value) || 0, descripcion: $("catalogRubroDescripcion").value, activo: $("catalogRubroActivo").checked }) });
    cerrarModal("catalogRubroModal");
    await Promise.all([cargarRubros(), cargarEstado(), cargarProductos()]);
    mensaje(id ? "Rubro actualizado." : "Rubro creado.", "ok");
  } catch (e) { mensaje(e.message); }
  finally { boton.disabled = false; }
}

async function eliminarRubro() {
  const id = $("catalogRubroId").value;
  if (!id) return;
  const r = estado.rubros.find((x) => String(x.id) === String(id));
  const confirmar = await window.AutoservicioDialog?.confirm?.({ title: "Eliminar rubro", message: `¿Querés eliminar “${r?.nombre || "este rubro"}”? Solo se puede eliminar si no tiene productos asignados.`, confirmarTexto: "Eliminar", cancelarTexto: "Cancelar", danger: true });
  if (!confirmar) return;
  try {
    await api(`/admin/catalogo/rubros/${id}`, { method: "DELETE" });
    cerrarModal("catalogRubroModal");
    await Promise.all([cargarRubros(), cargarEstado()]);
    mensaje("Rubro eliminado.", "ok");
  } catch (e) { mensaje(e.message); }
}

function abrirModal(id) { const m = $(id); if (!m) return; m.classList.remove("oculto"); m.setAttribute("aria-hidden", "false"); }
function cerrarModal(id) { const m = $(id); if (!m) return; m.classList.add("oculto"); m.setAttribute("aria-hidden", "true"); }

function bind() {
  if (document.body.dataset.catalogAdminBound === "1") return;
  document.body.dataset.catalogAdminBound = "1";
  document.querySelectorAll("[data-catalog-tab]").forEach((b) => b.addEventListener("click", () => cambiarTab(b.dataset.catalogTab)));
  $("catalogBuscarProductos")?.addEventListener("input", () => { clearTimeout(estado.busquedaTimer); estado.busquedaTimer = setTimeout(() => cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message)), 260); });
  $("catalogFiltroRubro")?.addEventListener("change", () => cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message)));
  $("catalogFiltroEstado")?.addEventListener("change", () => cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message)));
  $("catalogFiltroImagen")?.addEventListener("change", () => cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message)));
  $("catalogBtnBuscarImagenes")?.addEventListener("click", buscarImagenesLote);
  $("catalogBtnRecargar")?.addEventListener("click", () => Promise.all([cargarEstado(), cargarRubros(), cargarProductos()]).catch((e) => mensaje(e.message)));
  $("catalogBtnVerPublico")?.addEventListener("click", () => window.open(new URL("./catalogo/", location.href).href, "_blank", "noopener"));
  $("catalogBtnNuevoRubro")?.addEventListener("click", () => abrirRubro());
  $("catalogProductoGuardar")?.addEventListener("click", guardarProducto);
  $("catalogProductoBuscarImagen")?.addEventListener("click", buscarImagenProductoActual);
  $("catalogProductoGuardarImagen")?.addEventListener("click", guardarImagenManualActual);
  $("catalogProductoConfirmarImagen")?.addEventListener("click", confirmarImagenActual);
  $("catalogProductoQuitarImagen")?.addEventListener("click", quitarImagenActual);
  $("catalogProductoCerrar")?.addEventListener("click", () => cerrarModal("catalogProductoModal"));
  $("catalogProductoCancelar")?.addEventListener("click", () => cerrarModal("catalogProductoModal"));
  $("catalogRubroGuardar")?.addEventListener("click", guardarRubro);
  $("catalogRubroEliminar")?.addEventListener("click", eliminarRubro);
  $("catalogRubroCerrar")?.addEventListener("click", () => cerrarModal("catalogRubroModal"));
  $("catalogRubroCancelar")?.addEventListener("click", () => cerrarModal("catalogRubroModal"));
  ["catalogProductoModal", "catalogRubroModal"].forEach((id) => $(id)?.addEventListener("click", (e) => { if (e.target.id === id) cerrarModal(id); }));
}

async function activar() {
  if (!window.AutoservicioAuth?.esAdmin?.()) { window.AutoservicioNavigate?.("inicio"); return; }
  estado.activo = true;
  bind();
  try {
    await Promise.all([cargarEstado(), cargarRubros()]);
    await cargarProductos({ conservarPagina: false });
  } catch (e) { mensaje(e.message); }
}
function desactivar() { estado.activo = false; cerrarModal("catalogProductoModal"); cerrarModal("catalogRubroModal"); }

window.CatalogoAdminModule = { activar, desactivar, recargar: activar };
