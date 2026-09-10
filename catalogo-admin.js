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
  imagenPreviewObjectUrl: "",
  pedidosPagina: 1,
  pedidosLimite: 50,
  pedidosPaginas: 1,
  pedidosTotal: 0,
  pedidos: [],
  pedidoAbierto: null,
  pedidoObservacionesSucias: false,
  pedidosBusquedaTimer: null,
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

async function apiBlob(ruta) {
  const r = await fetch(`${API_BASE_URL}${ruta}`, { cache: "no-store" });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.mensaje || "No se pudo descargar la imagen");
  }
  return r.blob();
}

function liberarPreviewImagen() {
  if (estado.imagenPreviewObjectUrl) {
    URL.revokeObjectURL(estado.imagenPreviewObjectUrl);
    estado.imagenPreviewObjectUrl = "";
  }
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
  actualizarBotonesPublicacionMasiva();
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
  window.AppSelect?.refresh?.(filtro);
  window.AppSelect?.refresh?.(producto);
  actualizarUIFiltrosProductos();
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

function cantidadFiltrosProductosActivos() {
  return ["catalogFiltroRubro", "catalogFiltroEstado", "catalogFiltroImagen"]
    .reduce((total, id) => total + (($(id)?.value || "todos") !== "todos" ? 1 : 0), 0);
}

function actualizarUIFiltrosProductos() {
  const cantidad = cantidadFiltrosProductosActivos();
  const boton = $("catalogBtnFiltros");
  const badge = $("catalogFiltrosBadge");
  if (boton) boton.classList.toggle("has-active", cantidad > 0);
  if (badge) {
    badge.textContent = String(cantidad);
    badge.classList.toggle("oculto", cantidad === 0);
  }
}

function cerrarFiltrosProductos() {
  const menu = $("catalogFiltrosMenu");
  const boton = $("catalogBtnFiltros");
  if (!menu || !boton) return;
  menu.classList.add("oculto");
  boton.setAttribute("aria-expanded", "false");
}

function alternarFiltrosProductos() {
  const menu = $("catalogFiltrosMenu");
  const boton = $("catalogBtnFiltros");
  if (!menu || !boton) return;
  const abrir = menu.classList.contains("oculto");
  window.AppSelect?.closeAll?.();
  menu.classList.toggle("oculto", !abrir);
  boton.setAttribute("aria-expanded", abrir ? "true" : "false");
}

async function limpiarFiltrosProductos() {
  ["catalogFiltroRubro", "catalogFiltroEstado", "catalogFiltroImagen"].forEach((id) => {
    const select = $(id);
    if (!select) return;
    select.value = "todos";
    window.AppSelect?.refresh?.(select);
  });
  actualizarUIFiltrosProductos();
  actualizarBotonesPublicacionMasiva();
  await cargarProductos({ conservarPagina: false });
}

function prepararSelectorCatalogo(id, { ancho = "normal", buscable = false } = {}) {
  const select = $(id);
  if (!select) return;
  window.AppSelect?.enhance?.(id);
  const wrapper = select.closest(".app-select-custom");
  const menu = wrapper?._appSelectMenu;
  if (!wrapper || !menu) return;
  wrapper.classList.add(`catalog-select-${ancho}`);
  menu.classList.add("catalog-select-menu", `catalog-select-menu-${ancho}`);
  if (!buscable || wrapper.dataset.catalogSearchBound === "1") return;
  wrapper.dataset.catalogSearchBound = "1";
  wrapper.querySelector(".app-select-custom__trigger")?.addEventListener("click", () => {
    setTimeout(() => {
      const menuActual = wrapper._appSelectMenu;
      if (!menuActual || !wrapper.classList.contains("is-open")) return;
      const existente = menuActual.querySelector(".catalog-select-search input");
      if (existente) { existente.focus({ preventScroll: true }); return; }
      if (!menuActual.querySelector(".catalog-select-search")) {
        const cabecera = document.createElement("div");
        cabecera.className = "catalog-select-search-shell";
        const contenedor = document.createElement("label");
        contenedor.className = "catalog-select-search";
        contenedor.innerHTML = '<svg class="app-icon" aria-hidden="true"><use href="#icon-search"></use></svg><input type="search" autocomplete="off" placeholder="Buscar rubro..." aria-label="Buscar rubro" />';
        const input = contenedor.querySelector("input");
        input.addEventListener("input", () => {
          const termino = input.value.trim().toLocaleLowerCase("es");
          menuActual.querySelectorAll(".app-select-custom__option").forEach((opcion) => {
            opcion.hidden = Boolean(termino) && !opcion.textContent.toLocaleLowerCase("es").includes(termino);
          });
        });
        cabecera.appendChild(contenedor);
        menuActual.prepend(cabecera);
        menuActual.scrollTop = 0;
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
        window.dispatchEvent(new Event("resize"));
      }
    }, 0);
  });
}

function prepararSelectoresCatalogo() {
  prepararSelectorCatalogo("catalogFiltroRubro", { ancho: "wide", buscable: true });
  prepararSelectorCatalogo("catalogFiltroEstado", { ancho: "normal" });
  prepararSelectorCatalogo("catalogFiltroImagen", { ancho: "normal" });
  prepararSelectorCatalogo("catalogProductoRubro", { ancho: "wide", buscable: true });
  prepararSelectorCatalogo("catalogProductoUnidad", { ancho: "compact" });
  prepararSelectorCatalogo("catalogPedidosFiltroEstado", { ancho: "orders" });
}

async function cargarProductos({ conservarPagina = true } = {}) {
  if (estado.cargando) return;
  estado.cargando = true;
  if (!conservarPagina) estado.pagina = 1;
  const body = $("catalogProductosBody");
  if (body) body.innerHTML = '<tr><td colspan="6"><div class="catalog-loading">Cargando productos…</div></td></tr>';
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
    body.innerHTML = '<tr><td colspan="6"><div class="catalog-empty">No hay productos que coincidan con los filtros.</div></td></tr>';
  } else {
    body.innerHTML = estado.productos.map((p) => {
      const chip = !p.configurado ? '<span class="catalog-chip unconfigured">Sin configurar</span>' : p.visible ? '<span class="catalog-chip visible">Visible</span>' : '<span class="catalog-chip hidden">Oculto</span>';
      return `<tr data-code="${esc(p.codigo)}">
        <td><div class="catalog-product-cell"><span class="catalog-product-thumb ${p.imagen ? "has-image" : ""}">${p.estadoImagen === "confirmada" ? `<img src="${API_BASE_URL}/catalogo/api/productos/${encodeURIComponent(p.codigo)}/imagen" alt="" loading="lazy" />` : '<svg class="app-icon"><use href="#icon-box"></use></svg>'}</span><div class="catalog-product-copy"><strong title="${esc(p.nombre)}">${esc(p.nombre)}</strong><small>${esc(p.codigo)}${p.destacado ? " · Destacado" : ""} · ${esc(({confirmada:"Imagen confirmada",candidato:"Imagen candidata",buscando:"Buscando imagen",sin_resultado:"Sin resultado",error:"Error de imagen",sin_imagen:"Sin imagen"})[p.estadoImagen] || "Sin imagen")}</small></div></div></td>
        <td>${p.rubro ? esc(p.rubro) : '<span class="catalog-chip unconfigured">Sin rubro</span>'}</td>
        <td><span class="catalog-price">${moneda(p.precio)}</span></td>
        <td>${esc(etiquetaUnidad(p.unidadVenta))}</td>
        <td>${chip}</td>
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

function fechaHora(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function etiquetaEstadoPedido(estadoPedido) {
  return ({
    recibido: "Recibido",
    preparando: "Preparando",
    listo: "Listo",
    entregado: "Entregado",
    cancelado: "Cancelado",
  })[estadoPedido] || estadoPedido || "—";
}

function parametrosPedidos() {
  const filtro = $("catalogPedidosFiltroEstado")?.value || "todos";
  const estadoPedido = ["recibido", "preparando", "listo", "entregado", "cancelado"].includes(filtro)
    ? filtro
    : "todos";

  const p = new URLSearchParams({
    pagina: String(estado.pedidosPagina),
    limite: String(estado.pedidosLimite),
    estado: estadoPedido,
  });

  if (filtro === "archivados") p.set("archivados", "si");

  const q = $("catalogPedidosBuscar")?.value?.trim();
  if (q) p.set("q", q);
  return p.toString();
}

async function cargarResumenPedidos() {
  const data = await api("/admin/catalogo/pedidos/resumen");
  $("catalogPedidosRecibidos").textContent = numero(data.recibidos);
  $("catalogPedidosPreparando").textContent = numero(data.preparando);
  $("catalogPedidosListos").textContent = numero(data.listos);
  $("catalogPedidosVentaHoy").textContent = moneda(data.ventaHoy);
  const badge = $("catalogPedidosBadge");
  if (badge) {
    badge.textContent = numero(data.recibidos);
    badge.classList.toggle("oculto", !Number(data.recibidos));
  }
}

async function cargarPedidos({ conservarPagina = true } = {}) {
  if (!conservarPagina) estado.pedidosPagina = 1;
  const body = $("catalogPedidosBody");
  if (body) body.innerHTML = '<tr><td colspan="7"><div class="catalog-loading">Cargando pedidos…</div></td></tr>';
  const data = await api(`/admin/catalogo/pedidos?${parametrosPedidos()}`);
  estado.pedidos = data.pedidos || [];
  estado.pedidosPagina = Number(data.pagina) || 1;
  estado.pedidosPaginas = Number(data.paginas) || 1;
  estado.pedidosTotal = Number(data.total) || 0;
  renderPedidos();
}

function renderPedidos() {
  const body = $("catalogPedidosBody");
  if (!body) return;
  if (!estado.pedidos.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="catalog-empty">No hay pedidos para mostrar.</div></td></tr>';
  } else {
    body.innerHTML = estado.pedidos.map((p) => `
      <tr>
        <td><div class="catalog-order-number"><strong>${esc(p.numero)}</strong><small>${numero(p.unidades)} unidades · ${numero(p.productos)} productos</small></div></td>
        <td><div class="catalog-order-customer"><strong>${esc(p.cliente)}</strong><small>${esc(p.telefono)}</small></div></td>
        <td><div class="catalog-order-delivery"><strong>${p.entrega === "delivery" ? `Delivery ${esc(p.horario || "")}` : "Retiro"}</strong><small>${p.entrega === "delivery" ? esc(p.direccion || "") : "Retiro en autoservicio"}</small></div></td>
        <td><strong class="catalog-price">${moneda(p.total)}</strong></td>
        <td><span class="catalog-order-status status-${esc(p.estado)}">${esc(etiquetaEstadoPedido(p.estado))}</span>${p.archivado ? `<small class="catalog-order-archived-label">Archivado</small>` : ""}</td>
        <td>${fechaHora(p.creadoEn)}</td>
        <td>
          <div class="catalog-order-row-actions">
            <button class="catalog-edit-btn" type="button" data-pedido-open="${esc(p.numero)}">Ver pedido</button>
            ${$("catalogPedidosFiltroEstado")?.value === "archivados"
              ? `<button class="catalog-delete-btn" type="button" data-pedido-delete="${esc(p.numero)}">Eliminar</button>`
              : ""}
          </div>
        </td>
      </tr>`).join("");
  }

  const desde = estado.pedidosTotal ? (estado.pedidosPagina - 1) * estado.pedidosLimite + 1 : 0;
  const hasta = Math.min(estado.pedidosTotal, estado.pedidosPagina * estado.pedidosLimite);
  $("catalogPedidosResumen").textContent = estado.pedidosTotal
    ? `Mostrando ${numero(desde)}–${numero(hasta)} de ${numero(estado.pedidosTotal)} pedidos`
    : "Sin pedidos";

  renderPaginacionPedidos();
  body.querySelectorAll("[data-pedido-open]").forEach((b) => b.addEventListener("click", () => abrirPedido(b.dataset.pedidoOpen)));
  body.querySelectorAll("[data-pedido-delete]").forEach((b) => b.addEventListener("click", () => eliminarPedidoArchivado(b.dataset.pedidoDelete)));
}

async function eliminarPedidoArchivado(numeroPedido) {
  if (!numeroPedido) return;

  const confirmado = window.confirm(
    `¿Eliminar definitivamente el pedido ${numeroPedido}?\n\nEsta acción no se puede deshacer.`,
  );
  if (!confirmado) return;

  try {
    await api(`/admin/catalogo/pedidos/${encodeURIComponent(numeroPedido)}`, {
      method: "DELETE",
    });
    await Promise.all([
      cargarPedidos({ conservarPagina: false }),
      cargarResumenPedidos(),
    ]);
    mensaje(`Pedido ${numeroPedido} eliminado definitivamente.`, "ok");
  } catch (e) {
    mensaje(e.message);
  }
}

function renderPaginacionPedidos() {
  const cont = $("catalogPedidosPaginacion");
  if (!cont) return;
  if (estado.pedidosPaginas <= 1) { cont.innerHTML = ""; return; }
  const parts = [];
  parts.push(`<button data-pedido-page="${Math.max(1, estado.pedidosPagina - 1)}" ${estado.pedidosPagina === 1 ? "disabled" : ""}>‹</button>`);
  for (let n = 1; n <= estado.pedidosPaginas; n++) {
    if (estado.pedidosPaginas > 7 && n > 2 && n < estado.pedidosPaginas - 1 && Math.abs(n - estado.pedidosPagina) > 1) {
      if (n === 3 || n === estado.pedidosPaginas - 2) parts.push("<button disabled>…</button>");
      continue;
    }
    parts.push(`<button data-pedido-page="${n}" class="${n === estado.pedidosPagina ? "activo" : ""}">${n}</button>`);
  }
  parts.push(`<button data-pedido-page="${Math.min(estado.pedidosPaginas, estado.pedidosPagina + 1)}" ${estado.pedidosPagina === estado.pedidosPaginas ? "disabled" : ""}>›</button>`);
  cont.innerHTML = parts.join("");
  cont.querySelectorAll("[data-pedido-page]").forEach((b) => b.addEventListener("click", () => {
    estado.pedidosPagina = Number(b.dataset.pedidoPage);
    cargarPedidos().catch((e) => mensaje(e.message));
  }));
}

function descripcionMovimientoPedido(movimiento) {
  const estadoNuevo = etiquetaEstadoPedido(movimiento.estado);
  if (!movimiento.estadoAnterior) return `Pedido recibido · ${estadoNuevo}`;
  return `${etiquetaEstadoPedido(movimiento.estadoAnterior)} → ${estadoNuevo}`;
}

function renderHistorialPedido(historial = []) {
  const cont = $("catalogPedidoHistorial");
  if (!cont) return;
  if (!Array.isArray(historial) || !historial.length) {
    cont.innerHTML = '<div class="catalog-order-history-empty">Sin movimientos registrados.</div>';
    return;
  }
  cont.innerHTML = historial.slice().reverse().map((mov, indice) => {
    const actor = mov.origen === "catalogo" ? "Catálogo online" : (mov.nombre || mov.usuario || "Administrador");
    const detalleActor = mov.origen === "catalogo"
      ? "Pedido creado por el cliente"
      : [mov.usuario && mov.usuario !== actor ? mov.usuario : "", mov.rol].filter(Boolean).join(" · ");
    return `<article class="catalog-order-history-item ${indice === 0 ? "is-latest" : ""}">
      <span class="catalog-order-history-dot" aria-hidden="true"></span>
      <div class="catalog-order-history-content">
        <div class="catalog-order-history-top"><strong>${esc(descripcionMovimientoPedido(mov))}</strong><time>${fechaHora(mov.creadoEn)}</time></div>
        <span>${esc(actor)}</span>${detalleActor ? `<small>${esc(detalleActor)}</small>` : ""}
      </div>
    </article>`;
  }).join("");
}

function htmlHojaPreparacionPedido(p) {
  const entrega = p.entrega === "delivery" ? `Delivery · ${esc(p.horario || "A confirmar")}` : "Retiro";
  const direccion = p.entrega === "delivery"
    ? [p.direccion, p.referencia].filter(Boolean).map(esc).join(" · ")
    : "Retiro en Autoservicio Victor";
  const productos = (p.items || []).map((item) => `
    <tr><td class="check-cell"><span class="print-check"></span></td><td class="qty-cell">${numero(item.cantidad)}</td>
    <td><strong>${esc(item.nombre)}</strong><small>${esc(item.codigo)} · ${esc(item.unidadVenta || "unidad")}</small></td>
    <td class="price-cell">${moneda(item.precio)}</td><td class="price-cell">${moneda(item.total)}</td></tr>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(p.numero)} · Autoservicio Victor</title>
  <style>
  @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:12px}
  .header{display:flex;justify-content:space-between;gap:20px;padding-bottom:10px;border-bottom:3px solid #e30613}
  .brand small{display:block;font-size:9px;font-weight:700;letter-spacing:.12em}.brand h1{margin:2px 0 0;color:#e30613;font-size:24px}
  .order-title{text-align:right}.order-title small{display:block;color:#555;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.order-title strong{display:block;margin-top:3px;font-size:18px}
  .section{margin-top:14px}.section-title{margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #222;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.info-item span{display:block;color:#666;font-size:9px;text-transform:uppercase}.info-item strong{display:block;margin-top:2px}.full{grid-column:1/-1}
  table{width:100%;border-collapse:collapse}th{padding:7px 5px;border-bottom:2px solid #111;font-size:9px;text-align:left;text-transform:uppercase}td{padding:8px 5px;border-bottom:1px solid #bbb;vertical-align:middle}td small{display:block;margin-top:2px;color:#666;font-size:9px}
  .check-cell{width:26px;text-align:center}.qty-cell{width:52px;text-align:center;font-size:14px;font-weight:800}.price-cell{width:88px;text-align:right;white-space:nowrap}.print-check{display:inline-block;width:15px;height:15px;border:1.5px solid #111;border-radius:2px}
  .total{display:flex;justify-content:flex-end;gap:18px;margin-top:10px;font-size:15px}.total strong{min-width:120px;text-align:right}
  .work-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px}.signature{min-height:58px;padding-top:38px;border-bottom:1px solid #111}.signature-label{margin-top:5px;font-size:10px;text-align:center;font-weight:700}.notes{min-height:68px;margin-top:14px;padding:8px;border:1px solid #888}.footer{margin-top:14px;padding-top:7px;border-top:1px solid #aaa;color:#555;font-size:9px;text-align:center}
  </style></head><body><main>
  <header class="header"><div class="brand"><small>AUTOSERVICIO</small><h1>Victor</h1></div><div class="order-title"><small>Hoja de preparación</small><strong>${esc(p.numero)}</strong><span>${esc(fechaHora(p.creadoEn))}</span></div></header>
  <section class="section"><h2 class="section-title">Datos del cliente</h2><div class="info-grid"><div class="info-item"><span>Cliente</span><strong>${esc(p.cliente)}</strong></div><div class="info-item"><span>Teléfono</span><strong>${esc(p.telefono)}</strong></div></div></section>
  <section class="section"><h2 class="section-title">Datos del pedido</h2><div class="info-grid"><div class="info-item"><span>Entrega</span><strong>${entrega}</strong></div><div class="info-item"><span>Forma de pago</span><strong>${esc(p.pago)}</strong></div><div class="info-item full"><span>Dirección / referencia</span><strong>${direccion}</strong></div><div class="info-item"><span>Estado</span><strong>${esc(etiquetaEstadoPedido(p.estado))}</strong></div><div class="info-item"><span>Productos / unidades</span><strong>${numero(p.productos)} productos · ${numero(p.unidades)} unidades</strong></div></div></section>
  <section class="section"><h2 class="section-title">Preparación de productos</h2><table><thead><tr><th>OK</th><th>Cant.</th><th>Producto</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${productos}</tbody></table><div class="total"><span>Total</span><strong>${moneda(p.total)}</strong></div></section>
  <section class="section"><h2 class="section-title">Control interno</h2><div class="work-grid"><div><div class="signature"></div><div class="signature-label">Armó pedido</div></div><div><div class="signature"></div><div class="signature-label">Controló</div></div></div><div class="notes"><strong>Observaciones:</strong>${p.observacionesInternas ? `<div style="margin-top:6px">${esc(p.observacionesInternas)}</div>` : ""}</div></section>
  <footer class="footer">Autoservicio Victor · Brindamos calidad y atención.</footer></main></body></html>`;
}

function imprimirPedidoCatalogo() {
  const p = estado.pedidoAbierto;
  if (!p) return mensaje("Abrí un pedido antes de imprimir.");

  document.getElementById("catalogPedidoPrintFrame")?.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "catalogPedidoPrintFrame";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    right: "0",
    bottom: "0",
  });
  document.body.appendChild(iframe);

  const documento = iframe.contentDocument || iframe.contentWindow?.document;
  const ventana = iframe.contentWindow;

  if (!documento || !ventana) {
    iframe.remove();
    mensaje("No se pudo preparar la impresión.");
    return;
  }

  documento.open();
  documento.write(htmlHojaPreparacionPedido(p));
  documento.close();

  let eliminado = false;
  const limpiar = () => {
    if (eliminado) return;
    eliminado = true;
    setTimeout(() => iframe.remove(), 150);
  };

  ventana.addEventListener("afterprint", limpiar, { once: true });

  const lanzar = () => {
    try {
      ventana.focus();
      ventana.print();
      setTimeout(limpiar, 15000);
    } catch {
      limpiar();
      mensaje("No se pudo abrir la configuración de impresión.");
    }
  };

  if (documento.readyState === "complete") setTimeout(lanzar, 120);
  else ventana.addEventListener("load", () => setTimeout(lanzar, 120), { once: true });
}

function renderObservacionesPedido(p) {
  const campo = $("catalogPedidoObservaciones");
  const estadoTexto = $("catalogPedidoObservacionesEstado");
  if (!campo || !estadoTexto) return;

  campo.value = p.observacionesInternas || "";
  estado.pedidoObservacionesSucias = false;
  estadoTexto.textContent = "Sin cambios pendientes.";

  campo.oninput = () => {
    estado.pedidoObservacionesSucias = true;
    estadoTexto.textContent = "Hay cambios sin guardar.";
  };
}

async function guardarObservacionesPedido() {
  const p = estado.pedidoAbierto;
  if (!p) return;

  const boton = $("catalogPedidoGuardarObservaciones");
  boton.disabled = true;

  try {
    const data = await api(`/admin/catalogo/pedidos/${encodeURIComponent(p.numero)}/observaciones`, {
      method: "PATCH",
      body: JSON.stringify({
        observaciones: $("catalogPedidoObservaciones").value.trim(),
      }),
    });

    estado.pedidoAbierto = data.pedido;
    renderObservacionesPedido(data.pedido);
    mensaje(`Observaciones de ${p.numero} guardadas.`, "ok");
  } catch (e) {
    mensaje(e.message);
  } finally {
    boton.disabled = false;
  }
}

async function abrirPedido(numeroPedido) {
  const data = await api(`/admin/catalogo/pedidos/${encodeURIComponent(numeroPedido)}`);
  const p = data.pedido;
  estado.pedidoAbierto = p;

  $("catalogPedidoModalNumero").textContent = p.numero;
  $("catalogPedidoCliente").textContent = p.cliente;
  $("catalogPedidoTelefono").textContent = p.telefono;
  $("catalogPedidoEntrega").textContent = p.entrega === "delivery" ? `Delivery · ${p.horario || "A confirmar"}` : "Retiro";
  $("catalogPedidoDireccion").textContent = p.entrega === "delivery"
    ? [p.direccion, p.referencia].filter(Boolean).join(" · ")
    : "Retiro en Autoservicio Victor";
  $("catalogPedidoPago").textContent = p.pago;
  $("catalogPedidoWhatsapp").textContent = p.whatsappAbierto ? "WhatsApp abierto" : "WhatsApp no confirmado";
  $("catalogPedidoFecha").textContent = fechaHora(p.creadoEn);
  $("catalogPedidoActualizado").textContent = `Actualizado: ${fechaHora(p.actualizadoEn)}`;
  $("catalogPedidoEstado").value = p.estado;
  $("catalogPedidoItemsResumen").textContent = `${numero(p.unidades)} unidades · ${numero(p.productos)} productos`;
  $("catalogPedidoTotal").textContent = moneda(p.total);
  renderObservacionesPedido(p);
  renderHistorialPedido(p.historial || []);

  $("catalogPedidoItems").innerHTML = (p.items || []).map((item) => `
    <div class="catalog-order-item">
      <div><strong>${esc(item.nombre)}</strong><small>${esc(item.codigo)} · ${esc(item.unidadVenta || "unidad")}</small></div>
      <span>${numero(item.cantidad)} × ${moneda(item.precio)}</span>
      <strong>${moneda(item.total)}</strong>
    </div>`).join("");

  abrirModal("catalogPedidoModal");
}

async function guardarEstadoPedido() {
  const p = estado.pedidoAbierto;
  if (!p) return;
  const boton = $("catalogPedidoGuardarEstado");
  boton.disabled = true;
  try {
    const data = await api(`/admin/catalogo/pedidos/${encodeURIComponent(p.numero)}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado: $("catalogPedidoEstado").value }),
    });
    estado.pedidoAbierto = data.pedido;
    cerrarModal("catalogPedidoModal");
    await Promise.all([cargarPedidos(), cargarResumenPedidos()]);
    mensaje(`Pedido ${p.numero} actualizado a ${etiquetaEstadoPedido(data.pedido.estado)}.`, "ok");
  } catch (e) {
    mensaje(e.message);
  } finally {
    boton.disabled = false;
  }
}


function cambiarTab(tab) {
  estado.tab = ["rubros", "pedidos"].includes(tab) ? tab : "productos";
  document.querySelectorAll("[data-catalog-tab]").forEach((b) => {
    const on = b.dataset.catalogTab === estado.tab;
    b.classList.toggle("activo", on);
    b.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll("[data-catalog-panel]").forEach((p) => p.classList.toggle("oculto", p.dataset.catalogPanel !== estado.tab));
  $("pantallaCatalogoAdmin")?.classList.toggle("catalog-tab-pedidos-activo", estado.tab === "pedidos");
  if (estado.tab === "pedidos") {
    Promise.all([cargarPedidos({ conservarPagina: false }), cargarResumenPedidos()]).catch((e) => mensaje(e.message));
  }
}

function etiquetaEstadoImagen(valor) {
  return ({ confirmada: "Confirmada", candidato: "Candidata", buscando: "Buscando", sin_resultado: "Sin resultado", error: "Error", sin_imagen: "Sin imagen" })[valor] || "Sin imagen";
}

function renderImagenProducto(p = {}) {
  const preview = $("catalogProductoImagenPreview");
  const input = $("catalogProductoImagenUrl");
  const meta = $("catalogProductoImagenMeta");
  const confirmar = $("catalogProductoConfirmarImagen");
  const quitar = $("catalogProductoQuitarImagen");
  const estadoEl = $("catalogProductoEstadoImagen");
  const status = $("catalogProductoImagenEstadoBusqueda");
  const candidata = p.candidatoImagen || "";
  const imagen = p.imagen || "";
  if (estadoEl) estadoEl.textContent = etiquetaEstadoImagen(p.estadoImagen);
  if (input) input.value = imagen || candidata || "";
  if (confirmar) confirmar.classList.toggle("oculto", !candidata);
  if (quitar) quitar.classList.toggle("oculto", !imagen && !candidata);
  if (meta) {
    if (candidata) meta.textContent = `Candidata: ${p.candidatoFuente || "fuente automática"}${p.candidatoPuntaje ? ` · calidad/coincidencia ${p.candidatoPuntaje}%` : ""}`;
    else if (imagen) meta.textContent = `Fuente: ${p.fuenteImagen || "configurada"}`;
    else if (p.errorImagen) meta.textContent = p.errorImagen;
    else meta.textContent = "Todavía no se buscó una imagen para este producto.";
  }

  liberarPreviewImagen();
  if (!preview) return;
  if (!candidata && !imagen) {
    preview.innerHTML = '<span><svg class="app-icon"><use href="#icon-box"></use></svg></span><small>Sin imagen</small>';
    return;
  }

  preview.innerHTML = '<span class="catalog-image-preview-loading">Preparando vista previa…</span>';
  const codigo = p.codigo || $("catalogProductoModal")?.dataset.codigo || "";
  const tipo = candidata ? "candidato" : "confirmada";
  apiBlob(`/admin/catalogo/productos/${encodeURIComponent(codigo)}/imagen/contenido?tipo=${tipo}`)
    .then((blob) => {
      if (!preview.isConnected) return;
      liberarPreviewImagen();
      estado.imagenPreviewObjectUrl = URL.createObjectURL(blob);
      preview.innerHTML = `<img src="${estado.imagenPreviewObjectUrl}" alt="Vista previa normalizada de ${esc(p.nombre || "producto")}" />`;
      if (status && candidata) {
        status.textContent = "Imagen descargada y normalizada a 600×600. Este caso quedó para revisión porque la confianza automática fue baja.";
        status.className = "catalog-image-search-status ok";
      }
    })
    .catch((error) => {
      preview.innerHTML = '<span><svg class="app-icon"><use href="#icon-box"></use></svg></span><small>No se pudo mostrar</small>';
      if (status) {
        status.textContent = error.message || "No se pudo descargar la vista previa.";
        status.className = "catalog-image-search-status error";
      }
    });
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
  const status = $("catalogProductoImagenEstadoBusqueda");
  boton.disabled = true;
  if (status) {
    status.textContent = "Buscando y seleccionando automáticamente la mejor imagen de referencia…";
    status.className = "catalog-image-search-status buscando";
  }
  try {
    const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}/imagen/buscar`, { method: "POST" });
    renderImagenProducto(data.producto || {});
    await cargarEstado();
    if (!data.encontrado && status) {
      status.textContent = data.mensaje || data.producto?.errorImagen || "No se encontró una imagen que cumpla las condiciones del catálogo.";
      status.className = `catalog-image-search-status ${data.requiereConfiguracion ? "aviso" : "error"}`;
    }
  } catch (e) {
    if (status) { status.textContent = e.message; status.className = "catalog-image-search-status error"; }
  } finally {
    boton.disabled = false;
  }
}

async function subirImagenArchivoActual(archivo) {
  const codigo = $("catalogProductoModal")?.dataset.codigo;
  if (!codigo || !archivo) return;
  const tipos = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!tipos.has(String(archivo.type || "").toLowerCase())) return mensaje("Usá una imagen JPG, PNG o WEBP.");
  if (archivo.size > 6 * 1024 * 1024) return mensaje("La imagen no puede superar los 6 MB.");
  const boton = $("catalogProductoElegirImagen");
  const status = $("catalogProductoImagenEstadoBusqueda");
  if (boton) boton.disabled = true;
  if (status) { status.textContent = "Subiendo y preparando la imagen…"; status.className = "catalog-image-search-status buscando"; }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result || ""));
      lector.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado"));
      lector.readAsDataURL(archivo);
    });
    const data = await api(`/admin/catalogo/productos/${encodeURIComponent(codigo)}/imagen/subir`, {
      method: "POST",
      body: JSON.stringify({ imagen: dataUrl, nombre: archivo.name, mime: archivo.type }),
    });
    renderImagenProducto(data.producto || {});
    await Promise.all([cargarEstado(), cargarProductos()]);
    if (status) { status.textContent = "Imagen cargada correctamente. Ya podés verla en la vista previa."; status.className = "catalog-image-search-status ok"; }
    mensaje("Imagen cargada y guardada.", "ok");
  } catch (e) {
    if (status) { status.textContent = e.message || "No se pudo subir la imagen."; status.className = "catalog-image-search-status error"; }
    mensaje(e.message || "No se pudo subir la imagen.");
  } finally {
    if (boton) boton.disabled = false;
    const input = $("catalogProductoImagenArchivo");
    if (input) input.value = "";
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

function alcancePublicacionMasiva() {
  const valor = $("catalogFiltroRubro")?.value || "todos";
  if (valor === "sin-rubro") return { rubroId: null, nombre: "productos sin rubro", sinRubro: true };
  if (valor === "todos") return { rubroId: null, nombre: "todo el catálogo", sinRubro: false };
  const rubro = estado.rubros.find((r) => String(r.id) === String(valor));
  return { rubroId: Number(valor), nombre: rubro?.nombre || "este rubro", sinRubro: false };
}

function actualizarBotonesPublicacionMasiva() {
  const alcance = alcancePublicacionMasiva();
  const publicar = $("catalogBtnPublicarMasivo");
  const ocultar = $("catalogBtnOcultarMasivo");
  if (publicar) {
    publicar.disabled = alcance.sinRubro;
    publicar.title = alcance.sinRubro ? "Asigná un rubro antes de publicar estos productos" : `Publicar ${alcance.nombre}`;
    const span = publicar.querySelector("span");
    if (span) span.textContent = alcance.rubroId ? "Publicar rubro" : "Publicar todos";
  }
  if (ocultar) {
    ocultar.title = `Ocultar ${alcance.nombre}`;
    const span = ocultar.querySelector("span");
    if (span) span.textContent = alcance.rubroId ? "Ocultar rubro" : "Ocultar todos";
  }
}

async function cambiarVisibilidadMasiva(visible) {
  const alcance = alcancePublicacionMasiva();
  if (visible && alcance.sinRubro) {
    mensaje("Los productos sin rubro no se pueden publicar. Asignales un rubro primero.");
    return;
  }
  const accion = visible ? "publicar" : "ocultar";
  const confirmar = await window.AutoservicioDialog?.confirm?.({
    title: visible ? "Publicar productos" : "Ocultar productos",
    message: `¿Querés ${accion} ${alcance.nombre}? Esta acción afecta a todos los productos de ese alcance, no solo a la página visible.`,
    confirmarTexto: visible ? "Publicar" : "Ocultar",
    cancelarTexto: "Cancelar",
    danger: !visible,
  });
  if (!confirmar) return;

  const publicar = $("catalogBtnPublicarMasivo");
  const ocultar = $("catalogBtnOcultarMasivo");
  if (publicar) publicar.disabled = true;
  if (ocultar) ocultar.disabled = true;
  try {
    const data = await api("/admin/catalogo/productos/visibilidad-masiva", {
      method: "POST",
      body: JSON.stringify({ visible, rubroId: alcance.rubroId }),
    });
    await Promise.all([cargarEstado(), cargarRubros(), cargarProductos({ conservarPagina: false })]);
    const omitidos = Number(data.omitidosSinRubro) || 0;
    const detalle = omitidos ? ` Se omitieron ${numero(omitidos)} productos sin rubro.` : "";
    mensaje(`${numero(data.actualizados)} productos ${visible ? "publicados" : "ocultados"}.${detalle}`, "ok");
  } catch (e) {
    mensaje(e.message);
  } finally {
    actualizarBotonesPublicacionMasiva();
  }
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
    window.AppSelect?.refresh?.($("catalogProductoRubro"));
    window.AppSelect?.refresh?.($("catalogProductoUnidad"));
    $("catalogProductoVisible").checked = Boolean(p.visible);
    $("catalogProductoDestacado").checked = Boolean(p.destacado);
    renderImagenProducto(p);
    estadoBusquedaImagen("");
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
    <div class="catalog-rubro-copy"><strong>${esc(r.nombre)}</strong><small>${esc(r.slug)}</small><div class="catalog-rubro-meta"><span>${numero(r.productos)} productos</span><span>${numero(r.visibles)} visibles</span><span>${r.activo ? "Activo" : "Inactivo"}</span></div></div>
    <div class="catalog-rubro-actions"><button type="button" class="catalog-edit-btn" data-rubro-edit="${r.id}">Editar</button></div>
  </article>`).join("");
  cont.querySelectorAll("[data-rubro-edit]").forEach((b) => b.addEventListener("click", () => abrirRubro(Number(b.dataset.rubroEdit))));
}

function abrirRubro(id = null) {
  const r = estado.rubros.find((x) => x.id === id);
  $("catalogRubroId").value = r?.id || "";
  $("catalogRubroModalTitulo").textContent = r ? "Editar rubro" : "Nuevo rubro";
  $("catalogRubroNombre").value = r?.nombre || "";
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
    await api(id ? `/admin/catalogo/rubros/${id}` : "/admin/catalogo/rubros", { method: id ? "PUT" : "POST", body: JSON.stringify({ nombre: $("catalogRubroNombre").value, descripcion: $("catalogRubroDescripcion").value, activo: $("catalogRubroActivo").checked }) });
    cerrarModal("catalogRubroModal");
  cerrarModal("catalogPedidoModal");
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
  cerrarModal("catalogPedidoModal");
    await Promise.all([cargarRubros(), cargarEstado()]);
    mensaje("Rubro eliminado.", "ok");
  } catch (e) { mensaje(e.message); }
}

function abrirModal(id) { const m = $(id); if (!m) return; m.classList.remove("oculto"); m.setAttribute("aria-hidden", "false"); }
function cerrarModal(id) { const m = $(id); if (!m) return; m.classList.add("oculto"); m.setAttribute("aria-hidden", "true"); }

function bind() {
  if (document.body.dataset.catalogAdminBound === "1") return;
  document.body.dataset.catalogAdminBound = "1";
  prepararSelectoresCatalogo();
  actualizarUIFiltrosProductos();
  document.querySelectorAll("[data-catalog-tab]").forEach((b) => b.addEventListener("click", () => cambiarTab(b.dataset.catalogTab)));
  $("catalogBuscarProductos")?.addEventListener("input", () => { clearTimeout(estado.busquedaTimer); estado.busquedaTimer = setTimeout(() => cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message)), 260); });
  $("catalogFiltroRubro")?.addEventListener("change", () => {
    actualizarUIFiltrosProductos();
    actualizarBotonesPublicacionMasiva();
    cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message));
  });
  $("catalogFiltroEstado")?.addEventListener("change", () => { actualizarUIFiltrosProductos(); cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message)); });
  $("catalogFiltroImagen")?.addEventListener("change", () => { actualizarUIFiltrosProductos(); cargarProductos({ conservarPagina: false }).catch((e) => mensaje(e.message)); });
  $("catalogBtnFiltros")?.addEventListener("click", alternarFiltrosProductos);
  $("catalogFiltrosLimpiar")?.addEventListener("click", () => limpiarFiltrosProductos().catch((e) => mensaje(e.message)));
  document.addEventListener("click", (e) => {
    if (e.target.closest(".catalog-filter-popover-wrap, .app-select-custom__menu.is-portal")) return;
    cerrarFiltrosProductos();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarFiltrosProductos(); });
  $("catalogBtnPublicarMasivo")?.addEventListener("click", () => cambiarVisibilidadMasiva(true));
  $("catalogBtnOcultarMasivo")?.addEventListener("click", () => cambiarVisibilidadMasiva(false));
  $("catalogBtnRecargar")?.addEventListener("click", () => Promise.all([cargarEstado(), cargarRubros(), cargarProductos()]).catch((e) => mensaje(e.message)));
  $("catalogPedidosBuscar")?.addEventListener("input", () => {
    clearTimeout(estado.pedidosBusquedaTimer);
    estado.pedidosBusquedaTimer = setTimeout(() => cargarPedidos({ conservarPagina: false }).catch((e) => mensaje(e.message)), 260);
  });
  $("catalogPedidosFiltroEstado")?.addEventListener("change", () => {
    cargarPedidos({ conservarPagina: false }).catch((e) => mensaje(e.message));
  });
  $("catalogPedidosRecargar")?.addEventListener("click", () => Promise.all([cargarPedidos(), cargarResumenPedidos()]).catch((e) => mensaje(e.message)));
  $("catalogPedidoGuardarEstado")?.addEventListener("click", guardarEstadoPedido);
  $("catalogPedidoImprimir")?.addEventListener("click", imprimirPedidoCatalogo);
  $("catalogPedidoGuardarObservaciones")?.addEventListener("click", guardarObservacionesPedido);
  $("catalogPedidoCerrar")?.addEventListener("click", () => cerrarModal("catalogPedidoModal"));
  $("catalogBtnVerPublico")?.addEventListener("click", () => window.open(new URL("./catalogo/", location.href).href, "_blank", "noopener"));
  $("catalogBtnNuevoRubro")?.addEventListener("click", () => abrirRubro());
  $("catalogProductoGuardar")?.addEventListener("click", guardarProducto);
  $("catalogProductoElegirImagen")?.addEventListener("click", () => $("catalogProductoImagenArchivo")?.click());
  $("catalogProductoImagenArchivo")?.addEventListener("change", (e) => subirImagenArchivoActual(e.target.files?.[0]));
  $("catalogProductoBuscarImagen")?.addEventListener("click", buscarImagenProductoActual);
  $("catalogProductoGuardarImagenUrl")?.addEventListener("click", guardarImagenManualActual);
  $("catalogProductoConfirmarImagen")?.addEventListener("click", confirmarImagenActual);
  $("catalogProductoQuitarImagen")?.addEventListener("click", quitarImagenActual);
  $("catalogProductoCerrar")?.addEventListener("click", () => cerrarModal("catalogProductoModal"));
  $("catalogProductoCancelar")?.addEventListener("click", () => cerrarModal("catalogProductoModal"));
  $("catalogRubroGuardar")?.addEventListener("click", guardarRubro);
  $("catalogRubroEliminar")?.addEventListener("click", eliminarRubro);
  $("catalogRubroCerrar")?.addEventListener("click", () => cerrarModal("catalogRubroModal"));
  $("catalogRubroCancelar")?.addEventListener("click", () => cerrarModal("catalogRubroModal"));
  ["catalogProductoModal", "catalogRubroModal", "catalogPedidoModal"].forEach((id) => $(id)?.addEventListener("click", (e) => { if (e.target.id === id) cerrarModal(id); }));
}

async function activar() {
  if (!window.AutoservicioAuth?.esAdmin?.()) { window.AutoservicioNavigate?.("inicio"); return; }
  estado.activo = true;
  bind();
  try {
    await Promise.all([cargarEstado(), cargarRubros(), cargarResumenPedidos()]);
    await cargarProductos({ conservarPagina: false });
  } catch (e) { mensaje(e.message); }
}
function desactivar() {
  estado.activo = false;
  cerrarModal("catalogProductoModal");
  cerrarModal("catalogRubroModal");
  cerrarModal("catalogPedidoModal");
}

window.CatalogoAdminModule = { activar, desactivar, recargar: activar };
