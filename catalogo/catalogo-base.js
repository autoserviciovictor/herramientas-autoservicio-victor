const API_BASE_URL = "https://inventario-victor-api.onrender.com";
const CATALOGO_PEDIDO_CONFIG = Object.freeze({
  negocio: "Autoservicio Victor",
  whatsappNumero: "5492994670570",
  pedidoMinimoDelivery: 50000,
  horariosDelivery: ["12:00", "17:00"],
  formasPago: ["Efectivo", "Tarjeta", "Transferencia", "Mercado Pago"],
  notaDelivery: "Los horarios de entrega están sujetos a confirmación.",
  notaFinDeSemana: "Sábados y domingos: si pedís de 09:00 a 12:00, entregamos tu pedido al mediodía.",
  notaFeriado: "Feriados sin delivery.",
});

const CART_STORAGE_KEY = "autoservicio-victor-catalogo-carrito-v1";
const CHECKOUT_STORAGE_KEY = "autoservicio-victor-catalogo-checkout-v1";
const CUSTOMER_STORAGE_KEY = "autoservicio-victor-catalogo-cliente-v1";
const CUSTOMER_TOKEN_STORAGE_KEY = "autoservicio-victor-catalogo-cliente-token-v1";
const PAGE_SIZE = 50;
const state = {
  rubros: [],
  rubroExpandido: "",
  subrubro: "",
  productosSubrubro: [],
  cacheSubrubros: new Map(),
  grupoPortada: "",
  productosGrupo: [],
  productos: [],
  rubro: "",
  busqueda: "",
  pagina: 1,
  paginas: 0,
  total: 0,
  loading: false,
  estadoCatalogo: null,
  carrito: cargarCarrito(),
  editoresCantidad: new Set(),
  timersCantidad: new Map(),
  checkoutPaso: 1,
  checkout: cargarCheckout(),
  pedidoRegistrado: null,
  enviandoPedido: false,
  modoCatalogo: false,
  orden: "relevancia",
};

const $ = (id) => document.getElementById(id);
const els = {
  nav: $("catalogoCategoryNav"),
  mobileNav: $("catalogoMobileCategoryNav"),
  grid: $("catalogoProductsGrid"),
  count: $("catalogoProductsCount"),
  title: $("catalogoProductsTitle"),
  eyebrow: $("catalogoContextEyebrow"),
  feedback: $("catalogoFeedback"),
  pagination: $("catalogoPagination"),
  paginationSummary: $("catalogoPaginationSummary"),
  paginationButtons: $("catalogoPaginationButtons"),
  search: $("catalogoHeaderSearch"),
  searchForm: $("catalogoHeaderSearchForm"),
  cartButton: $("catalogoCartButton"),
  cartBadge: $("catalogoCartBadge"),
  cart: $("catalogoCart"),
  cartClose: $("catalogoCartClose"),
  cartItems: $("catalogoCartItems"),
  cartTotal: $("catalogoCartTotal"),
  cartProductsLabel: $("catalogoCartProductsLabel"),
  cartContinue: $("catalogoCartContinue"),
  overlay: $("catalogoOverlay"),
  menuBtn: $("catalogoMenuBtn"),
  mobileCategories: $("catalogoMobileCategories"),
  categoriesClose: $("catalogoCategoriesClose"),
  mobileCartbar: $("catalogoMobileCartbar"),
  mobileCartCount: $("catalogoMobileCartCount"),
  mobileCartTotal: $("catalogoMobileCartTotal"),
  checkout: $("catalogoCheckout"),
  checkoutClose: $("catalogoCheckoutClose"),
  checkoutNombre: $("checkoutNombre"),
  checkoutTelefono: $("checkoutTelefono"),
  checkoutDireccion: $("checkoutDireccion"),
  checkoutReferencia: $("checkoutReferencia"),
  checkoutHorario: $("checkoutHorario"),
  checkoutDeliveryFields: $("checkoutDeliveryFields"),
  checkoutPaymentGrid: $("checkoutPaymentGrid"),
  checkoutMinimoNotice: $("checkoutMinimoNotice"),
  checkoutMensajePaso1: $("checkoutMensajePaso1"),
  checkoutMensajePaso2: $("checkoutMensajePaso2"),
  checkoutMensajePaso3: $("checkoutMensajePaso3"),
  checkoutPaso1Siguiente: $("checkoutPaso1Siguiente"),
  checkoutPaso2Atras: $("checkoutPaso2Atras"),
  checkoutPaso2Siguiente: $("checkoutPaso2Siguiente"),
  checkoutPaso3Atras: $("checkoutPaso3Atras"),
  checkoutEnviarWhatsapp: $("checkoutEnviarWhatsapp"),
  checkoutCopiarPedido: $("checkoutCopiarPedido"),
  checkoutReviewCliente: $("checkoutReviewCliente"),
  checkoutReviewTelefono: $("checkoutReviewTelefono"),
  checkoutReviewEntrega: $("checkoutReviewEntrega"),
  checkoutReviewDireccion: $("checkoutReviewDireccion"),
  checkoutReviewPago: $("checkoutReviewPago"),
  checkoutReviewProductosCantidad: $("checkoutReviewProductosCantidad"),
  checkoutReviewProductos: $("checkoutReviewProductos"),
  checkoutReviewTotal: $("checkoutReviewTotal"),
  checkoutOrderConfirmation: $("checkoutOrderConfirmation"),
  checkoutOrderNumber: $("checkoutOrderNumber"),
  headerCartTotal: $("catalogoHeaderCartTotal"),
  home: $("catalogoHome"),
  bestSellersGrid: $("catalogoBestSellersGrid"),
  masVendidosGrid: $("catalogoMasVendidosGrid"),
  sortCustom: $("catalogoSortCustom"),
  sortTrigger: $("catalogoSortTrigger"),
  sortMenu: $("catalogoSortMenu"),
  sortLabel: $("catalogoSortLabel"),
  accountButton: $("catalogoAccountButton"), account: $("catalogoAccount"), accountClose: $("catalogoAccountClose"),
  accountNombre: $("accountNombre"), accountTelefono: $("accountTelefono"), accountDireccion: $("accountDireccion"), accountReferencia: $("accountReferencia"),
  accountGuardar: $("accountGuardar"), accountMensaje: $("accountMensaje"), accountPedidos: $("accountPedidos"), accountRecargar: $("accountRecargar"),
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Consultar";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(number);
}

function pluralProductos(n) { return `${n} ${n === 1 ? "producto" : "productos"}`; }

function categoryIcon(name = "") {
  const n = String(name || "").toLowerCase();

  const svg = (contenido) => `<svg class="category-logo__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${contenido}</svg>`;
  const icons = {
    todos: svg('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8" rx="1"/>'),
    botella: svg('<path d="M9 3h6v3l2 2v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-2V3Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 11h8M9 15h8" stroke="currentColor" stroke-width="1.5"/>'),
    bebida: svg('<path d="M9 3h6v3l1.5 2.5V20H7.5V8.5L9 6V3Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.5"/>'),
    almacen: svg('<path d="M5 7h14l-1 13H6L5 7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 7V5a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
    carne: svg('<path d="M6 17c2-5 4-8 8-10 2-1 4 0 4 2 0 4-4 8-8 10-2 1-4 0-4-2Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="15.5" cy="9.5" r="1.5" fill="currentColor"/>'),
    lacteos: svg('<path d="M8 4h8l2 5v11H6V9l2-5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 9h10M10 4v5" stroke="currentColor" stroke-width="1.5"/>'),
    limpieza: svg('<path d="M10 4h5v3h2l2 4v9H7V9l3-2V4Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4v3M8 13h10" stroke="currentColor" stroke-width="1.5"/>'),
    higiene: svg('<path d="M12 3c3 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 13c.8 1.3 1.7 2 3 2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    verdura: svg('<path d="M12 20c5 0 8-3 8-8-5 0-8 3-8 8ZM12 20c-5 0-8-3-8-8 5 0 8 3 8 8ZM12 20V7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9c0-3 2-5 5-5 0 3-2 5-5 5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
    congelados: svg('<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M8.5 4.5 12 7l3.5-2.5M8.5 19.5 12 17l3.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    pan: svg('<path d="M5 15c0-5 3-9 7-9s7 4 7 9c0 3-2 5-5 5H10c-3 0-5-2-5-5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9l2 2M13 8l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    golosina: svg('<path d="m8 8 8 8M8 16l8-8M5 9l3-1 8 8 1 3 3-3-1-3-8-8-3-1-3 5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
    mascota: svg('<circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="13" r="1.7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="13" r="1.7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 18c1-3 7-3 8 0 0 2-2 3-4 3s-4-1-4-3Z" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
    condimentos: svg('<path d="M8 5h8l1 3v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l1-3Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 5V3h8v2M7 11h10M10 14h4M10 17h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    electro: svg('<path d="M8 3v7M16 3v7M6 10h12v3a6 6 0 0 1-5 5.9V22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    embutidos: svg('<path d="M5 16c2-5 8-9 13-8 2 1 2 4 0 6-3 4-8 6-12 5-2-.5-2-2-1-3Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m5 16-2-1m15-7 2-2M9 15l1-1m3-2 1-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    cotillon: svg('<path d="M8 3c-3 0-5 3-5 6s2 5 5 5 5-2 5-5-2-6-5-6ZM17 6c-2 0-4 2-4 5s2 4 4 4 4-1 4-4-2-5-4-5Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m8 14 1 2-1 1m9-2 1 2-1 1M8 17c-2 2 3 3 1 5m8-4c-3 1 0 2-1 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    green: svg('<path d="M5 20C4 9 10 4 20 4c0 10-5 16-15 16ZM5 20c4-6 7-9 12-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    pescados: svg('<path d="M3 12c4-6 11-7 16 0-5 7-12 6-16 0Zm0 0-1-5 5 3m-4 2-1 5 5-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="15" cy="11" r="1" fill="currentColor"/>'),
    postres: svg('<path d="M4 12h16l-2 9H6l-2-9ZM4 12l3-5 4 2 3-4 6 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 15v3m6-3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
    juguetes: svg('<path d="M5 8 12 4l7 4v9l-7 4-7-4V8Zm0 0 7 4 7-4m-7 4v9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    vinos: svg('<path d="M6 3h12v5a6 6 0 0 1-12 0V3Zm6 11v7m-5 0h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6 8h12" stroke="currentColor" stroke-width="1.4"/>'),
    snacks: svg('<path d="m7 3 10 0 3 18H4L7 3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 8h10m-7 5 2-2 2 2-2 2-2-2Z" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
    conservas: svg('<path d="M6 5h12v16H6V5ZM5 3h14v2H5V3Zm3 7h8v6H8v-6Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    otros: svg('<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>'),
  };

  if (/^todos$/.test(n)) return icons.todos;
  if (/condiment|especia/.test(n)) return icons.condimentos;
  if (/electro/.test(n)) return icons.electro;
  if (/embutid/.test(n)) return icons.embutidos;
  if (/cotillon|cotillón|fiesta/.test(n)) return icons.cotillon;
  if (/^green$|organico|orgánico|natural/.test(n)) return icons.green;
  if (/pescad|marisco/.test(n)) return icons.pescados;
  if (/postre|reposteria|repostería|torta/.test(n)) return icons.postres;
  if (/juguet/.test(n)) return icons.juguetes;
  if (/vinoteca|aperitivo|vino/.test(n)) return icons.vinos;
  if (/snack/.test(n)) return icons.snacks;
  if (/conserva|frasco/.test(n)) return icons.conservas;
  if (/aderezo|salsa|aceite|vinagre/.test(n)) return icons.botella;
  if (/agua|jugo|energ|gase|cerve|bebida/.test(n)) return icons.bebida;
  if (/almacen|almacén|arroz|fideo|harina/.test(n)) return icons.almacen;
  if (/carne|carnic/.test(n)) return icons.carne;
  if (/fiambre/.test(n)) return icons.embutidos;
  if (/lact|ques/.test(n)) return icons.lacteos;
  if (/limp/.test(n)) return icons.limpieza;
  if (/higiene|perf|cuidado/.test(n)) return icons.higiene;
  if (/verd|fruta/.test(n)) return icons.verdura;
  if (/congel/.test(n)) return icons.congelados;
  if (/pan|gallet|panific/.test(n)) return icons.pan;
  if (/golos|chocol|caramel/.test(n)) return icons.golosina;
  if (/mascot|pet/.test(n)) return icons.mascota;
  return icons.otros;
}

function categoryTone(name = "") {
  const n = String(name || "").toLowerCase();
  if (/condiment|especia/.test(n)) return "tone-amber";
  if (/electro/.test(n)) return "tone-blue";
  if (/embutid|fiambre/.test(n)) return "tone-red";
  if (/cotillon|cotillón|fiesta/.test(n)) return "tone-magenta";
  if (/^green$|organico|orgánico|natural/.test(n)) return "tone-green";
  if (/pescad|marisco/.test(n)) return "tone-cyan";
  if (/postre|reposteria|repostería|torta/.test(n)) return "tone-pink";
  if (/juguet/.test(n)) return "tone-violet";
  if (/vinoteca|aperitivo|vino/.test(n)) return "tone-wine";
  if (/snack/.test(n)) return "tone-magenta";
  if (/conserva|frasco/.test(n)) return "tone-olive";
  if (/aderezo|salsa|aceite|vinagre/.test(n)) return "tone-amber";
  if (/agua|jugo|energ|gase|bebida/.test(n)) return "tone-blue";
  if (/cerve|alcohol/.test(n)) return "tone-wine";
  if (/lact|ques/.test(n)) return "tone-cyan";
  if (/limp/.test(n)) return "tone-violet";
  if (/higiene|perf|cuidado/.test(n)) return "tone-pink";
  if (/verd|fruta/.test(n)) return "tone-green";
  if (/congel/.test(n)) return "tone-ice";
  if (/pan|gallet|panific/.test(n)) return "tone-brown";
  if (/golos|chocol|caramel/.test(n)) return "tone-magenta";
  if (/carne|carnic/.test(n)) return "tone-red";
  if (/almacen|almacén|arroz|fideo|harina/.test(n)) return "tone-olive";
  return "tone-neutral";
}

function obtenerCustomerToken() {
  let token = String(localStorage.getItem(CUSTOMER_TOKEN_STORAGE_KEY) || "");
  if (!/^[a-zA-Z0-9_-]{20,100}$/.test(token)) {
    token = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replaceAll("-", "") : `cliente_${Date.now()}_${Math.random().toString(36).slice(2, 16)}`;
    localStorage.setItem(CUSTOMER_TOKEN_STORAGE_KEY, token);
  }
  return token;
}

function cargarDatosCliente() {
  try { const x = JSON.parse(localStorage.getItem(CUSTOMER_STORAGE_KEY) || "{}"); return x && typeof x === "object" ? x : {}; } catch { return {}; }
}
function guardarDatosCliente(datos) { localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(datos)); }
function aplicarDatosClienteAlCheckout() {
  const d = cargarDatosCliente();
  state.checkout = { ...state.checkout, nombre: d.nombre || state.checkout.nombre || "", telefono: d.telefono || state.checkout.telefono || "", direccion: d.direccion || state.checkout.direccion || "", referencia: d.referencia || state.checkout.referencia || "" };
  guardarCheckout();
}
function abrirMiCuenta() {
  cerrarDrawers();
  const d = cargarDatosCliente();
  els.accountNombre.value = d.nombre || ""; els.accountTelefono.value = d.telefono || ""; els.accountDireccion.value = d.direccion || ""; els.accountReferencia.value = d.referencia || "";
  els.account.classList.add("is-open"); els.account.setAttribute("aria-hidden", "false"); els.overlay.hidden = false; document.body.classList.add("drawer-open"); actualizarBloqueoCatalogo();
  cargarMisPedidos();
}
function cerrarMiCuenta() {
  els.account?.classList.remove("is-open"); els.account?.setAttribute("aria-hidden", "true");
  if (!els.cart.classList.contains("is-open") && !els.mobileCategories.classList.contains("is-open") && !els.checkout.classList.contains("is-open")) { els.overlay.hidden = true; document.body.classList.remove("drawer-open"); actualizarBloqueoCatalogo(); }
}
function guardarMiCuenta() {
  const datos = { nombre: String(els.accountNombre.value || "").trim(), telefono: normalizarTelefono(els.accountTelefono.value), direccion: String(els.accountDireccion.value || "").trim(), referencia: String(els.accountReferencia.value || "").trim() };
  if (datos.nombre.length < 3 || datos.telefono.replace(/\D/g, "").length < 8) { mensajeCheckout(els.accountMensaje, "Ingresá un nombre y teléfono válidos.", "error"); return; }
  guardarDatosCliente(datos); aplicarDatosClienteAlCheckout(); mensajeCheckout(els.accountMensaje, "Datos guardados correctamente.", "ok");
}
async function cargarMisPedidos() {
  if (!els.accountPedidos) return;
  els.accountPedidos.innerHTML = '<p class="account-empty">Cargando pedidos…</p>';
  try {
    const data = await apiJson(`/catalogo/api/mis-pedidos?clienteToken=${encodeURIComponent(obtenerCustomerToken())}`);
    const pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];
    if (!pedidos.length) { els.accountPedidos.innerHTML = '<p class="account-empty">Todavía no hay pedidos realizados desde este dispositivo.</p>'; return; }
    els.accountPedidos.innerHTML = pedidos.map((p) => `<article class="account-order"><div class="account-order__top"><strong>${escapeHtml(p.numero)}</strong><span>${escapeHtml(p.estado)}</span></div><div class="account-order__meta"><span>${new Date(p.creadoEn).toLocaleString("es-AR")}</span><b>${formatMoney(p.total)}</b></div></article>`).join("");
  } catch { els.accountPedidos.innerHTML = '<p class="account-empty">No pudimos cargar tus pedidos. Intentá nuevamente.</p>'; }
}

function cargarCheckout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKOUT_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function guardarCheckout() {
  localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(state.checkout));
}

function normalizarTelefono(valor = "") {
  return String(valor || "").replace(/[^\d+]/g, "").slice(0, 24);
}

function telefonoWhatsappConfigurado() {
  return String(CATALOGO_PEDIDO_CONFIG.whatsappNumero || "").replace(/\D/g, "");
}

function entregaSeleccionada() {
  return document.querySelector('input[name="checkoutEntrega"]:checked')?.value || "delivery";
}

function pagoSeleccionado() {
  return document.querySelector('input[name="checkoutPago"]:checked')?.value || "";
}

function mensajeCheckout(el, texto = "", tipo = "") {
  if (!el) return;
  el.textContent = texto;
  el.className = `checkout-message ${tipo}`.trim();
}

function setCheckoutPaso(paso) {
  state.checkoutPaso = Math.max(1, Math.min(3, Number(paso) || 1));
  document.querySelectorAll("[data-checkout-step]").forEach((el) => el.classList.toggle("is-active", Number(el.dataset.checkoutStep) === state.checkoutPaso));
  document.querySelectorAll("[data-checkout-progress]").forEach((el) => {
    const n = Number(el.dataset.checkoutProgress);
    el.classList.toggle("is-active", n === state.checkoutPaso);
    el.classList.toggle("is-done", n < state.checkoutPaso);
  });
  els.checkout?.scrollTo({ top: 0, behavior: "smooth" });
}

function totalCarrito() {
  return cartTotals().total;
}

function actualizarEstadoDelivery() {
  const delivery = entregaSeleccionada() === "delivery";
  if (els.checkoutDeliveryFields) els.checkoutDeliveryFields.hidden = !delivery;
  const minimo = Number(CATALOGO_PEDIDO_CONFIG.pedidoMinimoDelivery) || 0;
  const total = totalCarrito();
  if (!els.checkoutMinimoNotice) return;
  if (delivery && minimo > 0 && total < minimo) {
    els.checkoutMinimoNotice.textContent = `Pedido mínimo para delivery: ${formatMoney(minimo)}. Te faltan ${formatMoney(minimo - total)}.`;
    els.checkoutMinimoNotice.className = "is-warning";
  } else if (delivery && minimo > 0) {
    els.checkoutMinimoNotice.textContent = `Pedido mínimo para delivery: ${formatMoney(minimo)} ✓`;
    els.checkoutMinimoNotice.className = "is-ok";
  } else {
    els.checkoutMinimoNotice.textContent = "";
    els.checkoutMinimoNotice.className = "";
  }
}

function cargarCheckoutEnFormulario() {
  const c = state.checkout || {};
  if (els.checkoutNombre) els.checkoutNombre.value = c.nombre || "";
  if (els.checkoutTelefono) els.checkoutTelefono.value = c.telefono || "";
  if (els.checkoutDireccion) els.checkoutDireccion.value = c.direccion || "";
  if (els.checkoutReferencia) els.checkoutReferencia.value = c.referencia || "";

  if (els.checkoutHorario) {
    els.checkoutHorario.innerHTML = (CATALOGO_PEDIDO_CONFIG.horariosDelivery || []).map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
    if (c.horario && [...els.checkoutHorario.options].some((o) => o.value === c.horario)) els.checkoutHorario.value = c.horario;
  }

  if (els.checkoutPaymentGrid) {
    els.checkoutPaymentGrid.innerHTML = (CATALOGO_PEDIDO_CONFIG.formasPago || []).map((pago) => `
      <label class="checkout-choice checkout-choice--payment">
        <input type="radio" name="checkoutPago" value="${escapeHtml(pago)}" ${c.pago === pago ? "checked" : ""}>
        <span><strong>${escapeHtml(pago)}</strong></span>
      </label>`).join("");
  }

  const entrega = c.entrega || "delivery";
  document.querySelectorAll('input[name="checkoutEntrega"]').forEach((input) => { input.checked = input.value === entrega; });
  actualizarEstadoDelivery();
}

function tomarPaso1() {
  const nombre = String(els.checkoutNombre?.value || "").trim();
  const telefono = String(els.checkoutTelefono?.value || "").trim();
  if (nombre.length < 3) {
    mensajeCheckout(els.checkoutMensajePaso1, "Ingresá tu nombre y apellido.", "error");
    els.checkoutNombre?.focus();
    return false;
  }
  if (normalizarTelefono(telefono).replace(/\D/g, "").length < 8) {
    mensajeCheckout(els.checkoutMensajePaso1, "Ingresá un teléfono válido.", "error");
    els.checkoutTelefono?.focus();
    return false;
  }
  state.pedidoRegistrado = null;
  state.checkout = { ...state.checkout, nombre, telefono };
  guardarCheckout();
  mensajeCheckout(els.checkoutMensajePaso1, "");
  return true;
}

function tomarPaso2() {
  const entrega = entregaSeleccionada();
  const pago = pagoSeleccionado();
  const direccion = String(els.checkoutDireccion?.value || "").trim();
  const referencia = String(els.checkoutReferencia?.value || "").trim();
  const horario = String(els.checkoutHorario?.value || "").trim();

  if (entrega === "delivery") {
    const minimo = Number(CATALOGO_PEDIDO_CONFIG.pedidoMinimoDelivery) || 0;
    if (minimo > 0 && totalCarrito() < minimo) {
      mensajeCheckout(els.checkoutMensajePaso2, `El delivery requiere un pedido mínimo de ${formatMoney(minimo)}.`, "error");
      return false;
    }
    if (direccion.length < 5) {
      mensajeCheckout(els.checkoutMensajePaso2, "Ingresá la dirección de entrega.", "error");
      els.checkoutDireccion?.focus();
      return false;
    }
    if (!horario) {
      mensajeCheckout(els.checkoutMensajePaso2, "Elegí un horario preferido.", "error");
      return false;
    }
  }

  if (!pago) {
    mensajeCheckout(els.checkoutMensajePaso2, "Elegí una forma de pago.", "error");
    return false;
  }

  state.pedidoRegistrado = null;
  state.checkout = { ...state.checkout, entrega, direccion: entrega === "delivery" ? direccion : "", referencia: entrega === "delivery" ? referencia : "", horario: entrega === "delivery" ? horario : "", pago };
  guardarCheckout();
  mensajeCheckout(els.checkoutMensajePaso2, "");
  return true;
}

function resumenEntrega() {
  return state.checkout.entrega === "retiro" ? "Retiro por el autoservicio" : `Delivery · ${state.checkout.horario || "Horario a confirmar"}`;
}

function renderCheckoutReview() {
  const c = state.checkout || {};
  const totals = cartTotals();
  els.checkoutReviewCliente.textContent = c.nombre || "—";
  els.checkoutReviewTelefono.textContent = c.telefono || "—";
  els.checkoutReviewEntrega.textContent = resumenEntrega();
  els.checkoutReviewDireccion.textContent = c.entrega === "delivery" ? [c.direccion, c.referencia].filter(Boolean).join(" · ") : "Retiro en Autoservicio Victor";
  els.checkoutReviewPago.textContent = c.pago || "—";
  els.checkoutReviewProductosCantidad.textContent = pluralProductos(state.carrito.length);
  els.checkoutReviewTotal.textContent = formatMoney(totals.total);
  els.checkoutReviewProductos.innerHTML = state.carrito.map((item) => `
    <div class="checkout-review-product">
      <span>${escapeHtml(cantidadPresentada(item))} × ${escapeHtml(item.nombre)}</span>
      <strong>${formatMoney((Number(item.precio) || 0) * (Number(item.cantidad) || 0))}</strong>
    </div>`).join("");
}

function huellaPedidoActual() {
  const c = state.checkout || {};
  return `pedido-v2|${JSON.stringify({
    nombre: String(c.nombre || "").trim(),
    telefono: String(c.telefono || "").trim(),
    entrega: c.entrega || "delivery",
    direccion: String(c.direccion || "").trim(),
    referencia: String(c.referencia || "").trim(),
    horario: String(c.horario || "").trim(),
    pago: String(c.pago || "").trim(),
    items: state.carrito
      .map((item) => ({ codigo: String(item.codigo || ""), cantidad: Number(item.cantidad) || 0 }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  })}`;
}

function obtenerClientTokenPedido() {
  let token = String(state.checkout?.clientToken || "");
  const huella = huellaPedidoActual();
  const mismaOrden = String(state.checkout?.clientTokenHuella || "") === huella;

  // El token identifica una orden concreta, no al navegador. Si cambian los
  // datos o el carrito, debe nacer otro token para no reutilizar un pedido viejo.
  if (!mismaOrden || !/^[a-zA-Z0-9_-]{12,100}$/.test(token)) {
    if (globalThis.crypto?.randomUUID) token = globalThis.crypto.randomUUID().replaceAll("-", "");
    else token = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    state.checkout = { ...state.checkout, clientToken: token, clientTokenHuella: huella };
    guardarCheckout();
  }
  return token;
}

function payloadPedidoCatalogo() {
  const c = state.checkout || {};
  return {
    clientToken: obtenerClientTokenPedido(),
    customerToken: obtenerCustomerToken(),
    nombre: c.nombre || "",
    telefono: c.telefono || "",
    entrega: c.entrega || "delivery",
    direccion: c.direccion || "",
    referencia: c.referencia || "",
    horario: c.horario || "",
    pago: c.pago || "",
    items: state.carrito.map((item) => ({
      codigo: item.codigo,
      cantidad: Number(item.cantidad) || 0,
    })),
  };
}

async function registrarPedidoCatalogo() {
  if (state.pedidoRegistrado?.numero) return state.pedidoRegistrado;
  const respuesta = await fetch(`${API_BASE_URL}/catalogo/api/pedidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadPedidoCatalogo()),
  });
  const data = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !data?.ok || !data?.pedido?.numero) {
    throw new Error(data?.mensaje || "No se pudo registrar el pedido");
  }
  state.pedidoRegistrado = data.pedido;
  if (els.checkoutOrderNumber) els.checkoutOrderNumber.textContent = data.pedido.numero;
  if (els.checkoutOrderConfirmation) els.checkoutOrderConfirmation.hidden = false;
  return data.pedido;
}

function cantidadPresentada(item) {
  if (String(item.unidadVenta).toLowerCase() === "kg") {
    if (item.modoCompraKg === "unidades" && Number(item.piezasCompraKg) > 0)
      return `${Math.round(Number(item.piezasCompraKg))} unidades`;
    return `${Number(item.cantidad).toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`;
  }
  return `${item.cantidad} unidades`;
}

function generarMensajePedido() {
  const c = state.checkout || {};
  const totals = cartTotals();
  const lineas = [
    `*PEDIDO - ${CATALOGO_PEDIDO_CONFIG.negocio}*`,
    state.pedidoRegistrado?.numero ? `*N.º de pedido:* ${state.pedidoRegistrado.numero}` : "",
    "",
    `*Cliente:* ${c.nombre || "-"}`,
    `*Teléfono:* ${c.telefono || "-"}`, "",
    "*Productos:*",
    ...state.carrito.map((item) => `• ${cantidadPresentada(item)} de ${item.nombre} — ${formatMoney((Number(item.precio) || 0) * (Number(item.cantidad) || 0))}`),
    "", `*Total estimado:* ${formatMoney(totals.total)}`, "",
    `*Entrega:* ${resumenEntrega()}`,
  ];
  if (c.entrega === "delivery") {
    lineas.push(`*Dirección:* ${c.direccion || "-"}`);
    if (c.referencia) lineas.push(`*Referencia:* ${c.referencia}`);
  }
  lineas.push(`*Forma de pago:* ${c.pago || "-"}`, "", "Pedido enviado desde el catálogo online.");
  return lineas.join("\n");
}

async function copiarPedido() {
  try {
    await navigator.clipboard.writeText(generarMensajePedido());
    mensajeCheckout(els.checkoutMensajePaso3, "Pedido copiado.", "ok");
  } catch {
    mensajeCheckout(els.checkoutMensajePaso3, "No se pudo copiar automáticamente.", "error");
  }
}

async function enviarPedidoWhatsApp() {
  if (state.enviandoPedido) return;
  const numero = telefonoWhatsappConfigurado();
  if (!numero) { mensajeCheckout(els.checkoutMensajePaso3, "Falta configurar el número de WhatsApp del autoservicio.", "error"); return; }
  state.enviandoPedido = true;
  if (els.checkoutEnviarWhatsapp) { els.checkoutEnviarWhatsapp.disabled = true; els.checkoutEnviarWhatsapp.textContent = "Registrando pedido..."; }
  mensajeCheckout(els.checkoutMensajePaso3, "");
  try {
    await refrescarPreciosCarrito();
    await sincronizarDisponibilidadVisible();
    const pedido = await registrarPedidoCatalogo();
    const mensaje = generarMensajePedido();
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    fetch(`${API_BASE_URL}/catalogo/api/pedidos/${encodeURIComponent(pedido.numero)}/whatsapp-abierto`, { method: "POST", keepalive: true }).catch(() => {});
    // El pedido ya quedó registrado. Cerramos definitivamente este carrito para
    // que la próxima compra nazca como un pedido nuevo y no reutilice su token.
    state.carrito = [];
    guardarCarrito();
    state.checkout = { ...cargarDatosCliente(), clientToken: "", clientTokenHuella: "" };
    guardarCheckout();
    renderCart();
    mensajeCheckout(els.checkoutMensajePaso3, `Pedido ${pedido.numero} registrado correctamente. Abriendo WhatsApp...`, "ok");
    window.location.href = url;
  } catch (error) {
    state.pedidoRegistrado = null;
    mensajeCheckout(els.checkoutMensajePaso3, error?.message || "No se pudo registrar el pedido. No se abrió WhatsApp para evitar perderlo.", "error");
  } finally {
    state.enviandoPedido = false;
    if (els.checkoutEnviarWhatsapp) { els.checkoutEnviarWhatsapp.disabled = false; els.checkoutEnviarWhatsapp.innerHTML = '<span aria-hidden="true">◉</span> Enviar pedido por WhatsApp'; }
  }
}

function abrirCheckout() {
  if (!state.carrito.length) return;
  aplicarDatosClienteAlCheckout();
  cerrarDrawers();
  state.pedidoRegistrado = null;
  if (els.checkoutOrderConfirmation) els.checkoutOrderConfirmation.hidden = true;
  cargarCheckoutEnFormulario();
  setCheckoutPaso(1);
  els.checkout.classList.add("is-open");
  els.checkout.setAttribute("aria-hidden", "false");
  els.overlay.hidden = false;
  document.body.classList.add("drawer-open"); actualizarBloqueoCatalogo();
}

function cerrarCheckout() {
  els.checkout?.classList.remove("is-open");
  els.checkout?.setAttribute("aria-hidden", "true");
  if (!els.cart.classList.contains("is-open") && !els.mobileCategories.classList.contains("is-open")) {
    els.overlay.hidden = true;
    document.body.classList.remove("drawer-open"); actualizarBloqueoCatalogo();
  }
}

function cargarCarrito() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && x.codigo && Number(x.cantidad) > 0).map((x) => ({ ...x, cantidad: Math.min(999, Math.max(String(x.unidadVenta).toLowerCase() === "kg" ? 0.001 : 1, Number(x.cantidad) || 1)) }));
  } catch { return []; }
}

function guardarCarrito() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.carrito));
}

function imagenProducto(producto, clase = "") {
  const codigo = encodeURIComponent(producto.codigo);
  const src = `${API_BASE_URL}/catalogo/api/productos/${codigo}/imagen`;
  return `<span class="product-card__placeholder" aria-hidden="true"><span class="product-card__placeholder-box">▣</span><small>Sin imagen</small></span><img class="${clase}" src="${src}" alt="" loading="lazy" decoding="async" onload="this.previousElementSibling.hidden=true" onerror="this.remove()">`;
}

function renderSkeletons() {
  els.grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card" aria-hidden="true"></div>').join("");
}

function categoryButton(rubro, mobile = false) {
  const slug = rubro?.slug || "";
  const active = state.rubro === slug;
  const name = rubro?.nombre || "Todos";
  const count = rubro?.productos ?? state.total;
  return `<button class="category-button${active ? " is-active" : ""}" type="button" data-rubro="${escapeHtml(slug)}" title="${escapeHtml(name)}"${active ? ' aria-current="true"' : ""}>
    <span class="category-button__icon category-logo ${slug ? categoryTone(name) : "tone-red"}" aria-hidden="true">${slug ? categoryIcon(name) : categoryIcon("todos")}</span>
    <span>${escapeHtml(name)}</span>
    ${mobile || Number.isFinite(Number(count)) ? `<span class="category-button__count">${Number(count).toLocaleString("es-AR")}</span>` : ""}
  </button>`;
}

// Íconos vectoriales para los accesos principales del menú móvil.
function mobileMenuIcon(action) {
  const shapes = {
    inicio: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    ofertas: '<path d="M5 5h14v14H5z" opacity="0"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/><path d="M18.5 5.5 5.5 18.5"/>',
    vendidos: '<path d="m12 2.5 2.9 6.1 6.7 1-4.8 4.7 1.1 6.7-5.9-3.1-5.9 3.1 1.1-6.7-4.8-4.7 6.7-1z"/>',
  };
  return `<svg class="category-logo__svg category-logo__svg--shortcut" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[action] || shapes.inicio}</svg>`;
}

// Subrubros reales, definidos desde la administración (sin categorías precargadas).
function subrubrosParaRubro(rubro) {
  return Array.isArray(rubro?.subrubros) ? rubro.subrubros : [];
}
function subrubroDeProducto(producto) {
  return producto?.subrubroId == null ? "" : String(producto.subrubroId);
}
function rubroMenuEscritorio(rubro) {
  const slug = rubro?.slug || "";
  const subrubros = subrubrosParaRubro(rubro);
  if (!subrubros.length) return categoryButton(rubro);
  const abierto = state.rubroExpandido === slug;
  const boton = categoryButton(rubro).replace('data-rubro=', 'data-expand-rubro=');
  return `<div class="desktop-rubro-group">${boton}<button type="button" class="desktop-rubro-toggle" data-expand-rubro="${escapeHtml(slug)}" aria-label="Desplegar subrubros" aria-expanded="${abierto}"><svg class="desktop-rubro-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>` +
    (abierto ? `<div class="desktop-subrubros"><button class="category-subrubro" data-rubro="${escapeHtml(slug)}">Ver todos los productos</button>${subrubros.map(sub => `<button class="category-subrubro${state.subrubro === String(sub.id) && state.rubro === slug ? ' is-active' : ''}" data-subrubro="${escapeHtml(String(sub.id))}" data-parent-rubro="${escapeHtml(slug)}">${escapeHtml(sub.nombre)}</button>`).join('')}</div>` : '');
}
function rubroMenuMovil(rubro) {
  const slug = rubro?.slug || "";
  const subrubros = subrubrosParaRubro(rubro);
  const abierto = state.rubroExpandido === slug && subrubros.length > 0;
  const boton = categoryButton(rubro, true).replace('data-rubro=', `${subrubros.length ? 'data-expand-rubro=' : 'data-rubro='}`).replace('</button>', `<svg class="category-menu-chevron${abierto ? ' is-expanded' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`);
  if (!abierto) return boton;
  return boton + `<div class="category-subrubros" aria-label="Subrubros de ${escapeHtml(rubro.nombre)}">
    <button type="button" class="category-subrubro${state.rubro === slug && !state.subrubro ? ' is-active' : ''}" data-rubro="${escapeHtml(slug)}">Ver todos los productos <span>→</span></button>
    ${subrubros.map(sub => `<button type="button" class="category-subrubro${state.rubro === slug && state.subrubro === String(sub.id) ? ' is-active' : ''}" data-subrubro="${escapeHtml(String(sub.id))}" data-parent-rubro="${escapeHtml(slug)}">${escapeHtml(sub.nombre)}<span>›</span></button>`).join('')}
  </div>`;
}

function renderCategories() {
  // Los accesos principales son independientes del filtro de rubros.
  const mobileEntry = (action, title, active = false) => `<button class="category-button category-button--shortcut${active ? ' is-active' : ''}" type="button" data-menu-view="${action}"${active ? ' aria-current="page"' : ''}><span class="category-button__icon category-logo tone-red" aria-hidden="true">${mobileMenuIcon(action)}</span><span>${title}</span><svg class="category-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
  els.nav.innerHTML = state.rubros.map(rubroMenuEscritorio).join("");
  const isHome = !state.modoCatalogo && !state.rubro && !state.busqueda && !document.body.classList.contains('catalogo-mobile-offers-active') && !document.body.classList.contains('catalogo-mobile-bestsellers-active');
  els.mobileNav.innerHTML = [
    mobileEntry('inicio', 'Inicio', isHome),
    mobileEntry('ofertas', 'Ofertas', document.body.classList.contains('catalogo-mobile-offers-active')),
    mobileEntry('vendidos', 'Más vendidos', document.body.classList.contains('catalogo-mobile-bestsellers-active')),
    '<div class="category-menu-section-title">TODOS LOS RUBROS</div>',
    ...state.rubros.map(rubroMenuMovil)
  ].join('');
}

function cantidadEnCarrito(codigo) {
  return Number(state.carrito.find((x) => x.codigo === codigo)?.cantidad) || 0;
}

function controlCompraHtml(producto) {
  if (producto.disponible === false) return `<span style="display:block;text-align:center;padding:12px;color:#a11b2b;font-weight:700">Sin stock</span>`;
  const codigo = escapeHtml(producto.codigo);
  const cantidad = cantidadEnCarrito(producto.codigo);
  const editando = state.editoresCantidad.has(producto.codigo);
  if (String(producto.unidadVenta).toLowerCase() === "kg") return `<button class="add-button purchase-add-button" type="button" data-action="kg-select" data-code="${codigo}">${cantidad ? `${escapeHtml(cantidadPresentada(state.carrito.find(x => x.codigo === producto.codigo)))} · Cambiar` : "Elegir cantidad"}</button>`;

  if (!cantidad) {
    return `<button class="add-button purchase-add-button" type="button" data-action="add-first" data-code="${codigo}">Agregar</button>`;
  }

  if (!editando) {
    return `<button class="purchase-count-button" type="button" data-action="open-qty" data-code="${codigo}" aria-label="Editar cantidad: ${cantidad}">
      <span>${cantidad}</span>
    </button>`;
  }

  return `<div class="qty-control purchase-qty-editor" aria-label="Cantidad del producto">
    <button type="button" data-action="cart-minus" data-code="${codigo}" aria-label="Restar una unidad">−</button>
    <span data-purchase-qty-for="${codigo}">${cantidad}</span>
    <button type="button" data-action="cart-plus" data-code="${codigo}" aria-label="Sumar una unidad">+</button>
  </div>`;
}

function renderControlCompra(codigo) {
  const producto = buscarProducto(codigo);
  if (!producto) return;
  document.querySelectorAll(`[data-purchase-control="${CSS.escape(codigo)}"]`).forEach((contenedor) => {
    contenedor.innerHTML = controlCompraHtml(producto);
  });
}

function cancelarTimerCantidad(codigo) {
  const timer = state.timersCantidad.get(codigo);
  if (timer) clearTimeout(timer);
  state.timersCantidad.delete(codigo);
}

function programarCierreCantidad(codigo) {
  cancelarTimerCantidad(codigo);
  if (!state.editoresCantidad.has(codigo)) return;
  const timer = setTimeout(() => {
    state.editoresCantidad.delete(codigo);
    state.timersCantidad.delete(codigo);
    renderControlCompra(codigo);
  }, 1600);
  state.timersCantidad.set(codigo, timer);
}

function abrirEditorCantidad(codigo) {
  if (!cantidadEnCarrito(codigo)) return;
  state.editoresCantidad.add(codigo);
  renderControlCompra(codigo);
  programarCierreCantidad(codigo);
}

function precioVigente(producto) {
  const normal = Number(producto.precio) || 0;
  const oferta = producto.destacado && producto.precioOferta != null ? Number(producto.precioOferta) : null;
  return oferta !== null && Number.isFinite(oferta) && oferta > 0 && oferta < normal ? oferta : normal;
}

function renderProductCard(producto) {
  const marca = String(producto.marca || "").trim();
  return `<article class="product-card" data-product="${escapeHtml(producto.codigo)}">
    <div class="product-card__image">
      ${producto.destacado ? '<span class="product-card__featured">OFERTA</span>' : ""}
      ${imagenProducto(producto)}
    </div>
    <div class="product-card__body">
      <div class="product-card__rubric">${escapeHtml(producto.rubro?.nombre || "Producto")}</div>
      <h3 title="${escapeHtml(producto.nombre)}">${escapeHtml(producto.nombre)}</h3>
      ${marca ? `<div class="product-card__brand">${escapeHtml(marca)}</div>` : '<div class="product-card__brand">&nbsp;</div>'}
      <div class="product-card__meta">${precioVigente(producto) < Number(producto.precio) ? `<del class="product-card__old-price">${formatMoney(producto.precio)}</del>` : ""}<strong class="product-card__price">${formatMoney(precioVigente(producto))}</strong><span class="product-card__unit">${escapeHtml(producto.unidadVenta || "unidad")}</span></div>
      ${producto.disponible === false ? `<div style="color:#b42335;font-size:12px;font-weight:700;margin-bottom:5px">Sin stock · No disponible para comprar</div>` : ""}
      <div class="product-card__actions purchase-control" data-purchase-control="${escapeHtml(producto.codigo)}">
        ${controlCompraHtml(producto)}
      </div>
    </div>
  </article>`;
}

let ofertasHome = [];
let ofertasCargadas = false;
window.addEventListener('catalogo-producto-actualizado', async (evento) => {
  const producto = evento.detail?.producto;
  if (!producto) return;
  // Volver a leer las ofertas confirmadas desde el servidor sin perder scroll ni filtros.
  await cargarOfertasHome();
  const indice = state.productos.findIndex(p => String(p.codigo) === String(producto.codigo));
  if (indice >= 0) {
    if (!producto.visible) state.productos.splice(indice,1);
    else state.productos[indice] = {...state.productos[indice],...producto};
  }
  const item = state.carrito.find(p => String(p.codigo) === String(producto.codigo));
  if (item && producto.visible) {
    item.precio = precioVigente(producto);
    item.nombre = producto.nombre;
    guardarCarrito(); renderCart();
  }
});
async function cargarOfertasHome() {
  try {
    const data = await apiJson("/catalogo/api/productos?destacado=1&pagina=1&limite=60");
    ofertasHome = Array.isArray(data.productos) ? data.productos : [];
    ofertasCargadas = true;
  } catch (error) { console.warn("No se pudieron cargar las ofertas", error); ofertasHome = []; ofertasCargadas = true; }
  renderHomeProducts();
  renderMobileOffers();
  if (document.body.classList.contains("catalogo-mobile-offers-active")) { renderProducts(); updateHeading(); }
}
function renderMobileOffers() {
  const grid = document.getElementById("catalogoMobileOffersGrid");
  const count = document.getElementById("catalogoMobileOffersCount");
  if (!grid || !count) return;
  const items = ofertasHome.filter(p => p.destacado && p.visible !== false && precioVigente(p) < Number(p.precio));
  grid.innerHTML = items.length ? items.map(renderProductCard).join("") : `<p class="catalogo-mobile-offers-empty">No hay ofertas disponibles por el momento.</p>`;
  count.textContent = `${items.length} ${items.length === 1 ? "producto en oferta" : "productos en oferta"}`;
}
function renderHomeProducts() {
  if (!els.bestSellersGrid) return;
  const destacados = ofertasHome.filter((p) => p.destacado);
  els.bestSellersGrid.innerHTML = destacados.map(renderProductCard).join("");
  // Mantener la selección inicial que se utilizaba antes de separar Ofertas.
  // No hay un ranking de ventas disponible en esta API.
  if (els.masVendidosGrid) {
    els.masVendidosGrid.innerHTML = state.productos.map(renderProductCard).join("");
  }
}

function syncViewMode() {
  const browse = Boolean(state.modoCatalogo || state.rubro || state.busqueda || document.body.classList.contains("catalogo-mobile-bestsellers-active"));
  document.body.classList.toggle("catalogo-browse-mode", browse);
  document.body.classList.toggle("catalogo-home-active", !browse && !document.body.classList.contains("catalogo-mobile-offers-active"));
  if (els.home) els.home.hidden = browse;
}

function abrirCatalogoCompleto() {
  document.body.classList.remove("catalogo-mobile-offers-active", "catalogo-mobile-bestsellers-active");
  document.querySelectorAll('#catalogoBottomNav [data-mobile-nav]').forEach(button => {
    button.classList.remove('is-active');
    button.removeAttribute('aria-current');
  });
  state.modoCatalogo = true;
  state.grupoPortada = "";
  state.productosGrupo = [];
  state.rubro = "";
  state.subrubro = "";
  state.busqueda = "";
  state.pagina = 1;
  if (els.search) els.search.value = "";
  syncViewMode();
  cargarProductos();
  document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Los accesos de portada son agrupaciones, no necesariamente un rubro real.
const RUBROS_BEBIDAS = /\b(bebidas?|gaseosas?|aguas?|jugos?|cervezas?|vinos?|vinoteca|aperitivos?|energizantes?|isotonicas?|isot[oó]nicas?|licores?|espumantes?|sidras?)\b/i;

function seleccionarRubroPorNombre(nombre = "") {
  const buscado = String(nombre || "").trim().toLowerCase();
  if (buscado === "bebidas") {
    state.grupoPortada = "bebidas";
    state.productosGrupo = [];
    seleccionarRubro("");
    return;
  }
  state.grupoPortada = "";
  const rubro = state.rubros.find((r) => String(r.nombre || "").trim().toLowerCase() === buscado || String(r.nombre || "").toLowerCase().includes(buscado));
  if (rubro) seleccionarRubro(rubro.slug || "");
}

async function cargarGrupoBebidas() {
  const rubros = state.rubros.filter(r => RUBROS_BEBIDAS.test(String(r.nombre || "")));
  const productos = new Map();
  for (const rubro of rubros) {
    let pagina = 1;
    let paginas = 1;
    do {
      const params = new URLSearchParams({ pagina: String(pagina), limite: "100", rubro: String(rubro.slug) });
      const data = await apiJson(`/catalogo/api/productos?${params}`);
      for (const producto of (Array.isArray(data.productos) ? data.productos : [])) {
        productos.set(String(producto.codigo || producto.id), producto);
      }
      paginas = Number(data.paginas) || 1;
      pagina++;
    } while (pagina <= paginas);
  }
  state.productosGrupo = [...productos.values()];
}

function productosOrdenados() {
  const items = document.body.classList.contains("catalogo-mobile-bestsellers-active")
    ? [...state.productos].filter(p => !state.busqueda || `${p.nombre || ""} ${p.codigo || ""}`.toLowerCase().includes(state.busqueda.toLowerCase()))
    : document.body.classList.contains("catalogo-mobile-offers-active")
    ? ofertasHome.filter(p => p.destacado && p.visible !== false && precioVigente(p) < Number(p.precio) && (!state.busqueda || `${p.nombre || ""} ${p.codigo || ""} ${p.rubro || ""}`.toLowerCase().includes(state.busqueda.toLowerCase())))
    : [...state.productos];
  if (state.orden === "precio-asc") items.sort((a,b) => precioVigente(a) - precioVigente(b));
  else if (state.orden === "precio-desc") items.sort((a,b) => precioVigente(b) - precioVigente(a));
  else if (state.orden === "nombre") items.sort((a,b) => String(a.nombre||"").localeCompare(String(b.nombre||""), "es"));
  return items;
}

function renderProducts({ append = false } = {}) {
  if (document.body.classList.contains("catalogo-mobile-offers-active") || document.body.classList.contains("catalogo-mobile-bestsellers-active")) {
    const items = productosOrdenados();
    els.grid.innerHTML = items.length ? items.map(renderProductCard).join("") : `<div class="catalogo-empty"><h3>No encontramos productos</h3><p>Probá con otra búsqueda o volvé más tarde.</p></div>`;
    return;
  }
  if (!state.productos.length && !append) {
    const noVisible = !state.busqueda && !state.rubro;
    els.grid.innerHTML = `<div class="catalogo-empty"><div><div class="catalogo-empty__icon">⌕</div><h3>${noVisible ? "Todavía no hay productos publicados" : "No encontramos productos"}</h3><p>${noVisible ? "El catálogo está listo. Los productos aparecerán acá cuando sean marcados como visibles desde la administración." : "Probá con otro nombre, código o rubro."}</p></div></div>`;
    return;
  }
  const html = productosOrdenados().map(renderProductCard).join("");
  if (append) els.grid.insertAdjacentHTML("beforeend", html); else els.grid.innerHTML = html;
}

function updateHeading() {
  if (document.body.classList.contains("catalogo-mobile-bestsellers-active")) {
    els.eyebrow.textContent = "CATÁLOGO";
    els.title.textContent = "Más vendidos";
    els.count.textContent = pluralProductos(state.total);
    if (els.pagination) els.pagination.hidden = true;
    return;
  }
  if (document.body.classList.contains("catalogo-mobile-offers-active")) {
    els.eyebrow.textContent = "CATÁLOGO";
    els.title.textContent = "Ofertas";
    els.count.textContent = `${productosOrdenados().length} productos en oferta`;
    if (els.pagination) els.pagination.hidden = true;
    return;
  }
  const selected = state.rubros.find((r) => r.slug === state.rubro);
  if (state.grupoPortada === "bebidas" && !state.busqueda) {
    els.eyebrow.textContent = "CATEGORÍA";
    els.title.textContent = "Bebidas";
    els.count.textContent = pluralProductos(state.total);
    renderPagination();
    return;
  }
  if (state.busqueda) {
    els.eyebrow.textContent = "RESULTADOS";
    els.title.textContent = `“${state.busqueda}”`;
  } else if (selected) {
    els.eyebrow.textContent = "RUBRO";
    els.title.textContent = state.subrubro ? `${selected.nombre} · ${subrubrosParaRubro(selected).find(sub => String(sub.id) === state.subrubro)?.nombre || state.subrubro}` : selected.nombre;
  } else {
    els.eyebrow.textContent = "CATÁLOGO";
    els.title.textContent = "Todos los productos";
  }
  els.count.textContent = pluralProductos(state.total);
  renderPagination();
}

function renderPagination() {
  if (!els.pagination || !els.paginationButtons || !els.paginationSummary) return;
  const total = Math.max(0, state.total);
  const paginas = Math.max(1, state.paginas || Math.ceil(total / PAGE_SIZE));
  const actual = Math.min(Math.max(1, state.pagina), paginas);
  els.pagination.hidden = !total;
  if (!total) return;
  const desde = (actual - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(actual * PAGE_SIZE, total);
  els.paginationSummary.textContent = `Mostrando ${desde.toLocaleString("es-AR")}–${hasta.toLocaleString("es-AR")} de ${total.toLocaleString("es-AR")} productos`;
  // Con pocas páginas, mostrar todas en orden, sin puntos suspensivos.
  // Con muchas, mantener una ventana consecutiva alrededor de la página actual.
  const paginasVisibles = new Set();
  if (paginas <= 7) {
    for (let i = 1; i <= paginas; i++) paginasVisibles.add(i);
  } else {
    paginasVisibles.add(1);
    paginasVisibles.add(paginas);
    const inicio = actual <= 3 ? 1 : actual >= paginas - 2 ? paginas - 4 : actual - 1;
    for (let i = inicio; i <= Math.min(paginas, inicio + 4); i++) paginasVisibles.add(i);
  }
  const items = [...paginasVisibles].sort((a, b) => a - b);
  let previo = 0;
  const botones = [];
  const flecha = (direccion, pagina, deshabilitado) => `<button type="button" data-page="${pagina}" ${deshabilitado ? "disabled" : ""} aria-label="${direccion === "prev" ? "Página anterior" : "Página siguiente"}" title="${direccion === "prev" ? "Página anterior" : "Página siguiente"}" class="catalogo-page-button catalogo-page-arrow"><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false"><path d="${direccion === "prev" ? "M15 18 9 12l6-6" : "m9 18 6-6-6-6"}" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  const boton = (pagina, actualPagina = false) => `<button type="button" data-page="${pagina}" ${actualPagina ? 'aria-current="page"' : ""} aria-label="Página ${pagina}" class="catalogo-page-button${actualPagina ? " is-active" : ""}">${pagina}</button>`;
  botones.push(flecha("prev", actual - 1, actual === 1));
  for (const pagina of items) {
    if (previo && pagina > previo + 1) botones.push('<span class="catalogo-page-ellipsis" aria-hidden="true">…</span>');
    botones.push(boton(pagina, pagina === actual));
    previo = pagina;
  }
  botones.push(flecha("next", actual + 1, actual === paginas));
  els.paginationButtons.innerHTML = botones.join("");
}

async function cambiarPagina(pagina) {
  if (state.loading || !Number.isInteger(pagina) || pagina < 1 || pagina > state.paginas || pagina === state.pagina) return;
  const anterior = state.pagina;
  state.pagina = pagina;
  const ok = await cargarProductos();
  if (!ok) { state.pagina = anterior; renderPagination(); return; }
  document.querySelector(".catalogo-products-toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Validación de disponibilidad contra PostgreSQL, sin confiar en tarjetas en caché.
const verificacionesCompra = new Set();
async function verificarProductoParaCompra(codigo) {
  if (verificacionesCompra.has(codigo)) return null;
  verificacionesCompra.add(codigo);
  try {
    const response = await fetch(`${API_BASE_URL}/catalogo/api/precios-carrito`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos: [String(codigo)] }),
    });
    if (!response.ok) throw new Error("No se pudo verificar la disponibilidad");
    const data = await response.json();
    if (!data.ok) throw new Error(data.mensaje || "No se pudo verificar la disponibilidad");
    const actual = (data.productos || []).find(x => String(x.codigo) === String(codigo));
    if (!actual?.disponible) {
      await retirarProductoNoDisponible(codigo);
      alert("Producto no disponible. No se puede agregar al carrito porque está oculto o no tiene stock.");
      return null;
    }
    return actual;
  } catch (error) {
    alert("No pudimos verificar la disponibilidad. Intentá nuevamente.");
    return null;
  } finally { verificacionesCompra.delete(codigo); }
}
async function retirarProductoNoDisponible(codigo) {
  state.productos = state.productos.filter(p => String(p.codigo) !== String(codigo));
  ofertasHome = ofertasHome.filter(p => String(p.codigo) !== String(codigo));
  state.carrito = state.carrito.filter(p => String(p.codigo) !== String(codigo));
  guardarCarrito(); renderCart();
  renderProducts(); renderHomeProducts(); renderMobileOffers();
  // Recalcular contadores y páginas con los datos del servidor.
  await Promise.allSettled([cargarProductos(), cargarRubros()]);
}
async function sincronizarDisponibilidadVisible() {
  const codigos = [...new Set([
    ...Array.from(document.querySelectorAll("[data-product]"), el => el.dataset.product),
    ...state.carrito.map(item => String(item.codigo)),
  ].filter(Boolean))].slice(0, 100);
  if (!codigos.length) return;
  try {
    const response = await fetch(`${API_BASE_URL}/catalogo/api/precios-carrito`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos }),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.ok) return;
    const disponibles = new Set((data.productos || []).filter(p => p.disponible).map(p => String(p.codigo)));
    const retirados = codigos.filter(c => !disponibles.has(c));
    if (!retirados.length) return;
    const fuera = new Set(retirados);
    state.productos = state.productos.filter(p => !fuera.has(String(p.codigo)));
    ofertasHome = ofertasHome.filter(p => !fuera.has(String(p.codigo)));
    state.carrito = state.carrito.filter(p => !fuera.has(String(p.codigo)));
    guardarCarrito(); renderCart(); renderProducts(); renderHomeProducts(); renderMobileOffers();
    await Promise.allSettled([cargarProductos(), cargarRubros()]);
    els.feedback.textContent = "Se quitaron productos que ya no están disponibles.";
  } catch (error) { console.warn("No se pudo comprobar la disponibilidad:", error); }
}

let revisionCatalogoActual = null;
let actualizacionCatalogoEnCurso = false;

async function refrescarPreciosCarrito() {
  if (!state.carrito.length) return;
  const response = await fetch(`${API_BASE_URL}/catalogo/api/precios-carrito`, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigos: state.carrito.map((x) => String(x.codigo)) }),
  });
  if (!response.ok) throw new Error("No se pudieron verificar los precios del carrito");
  const data = await response.json();
  if (!data.ok) throw new Error(data.mensaje || "Error verificando precios");
  const vigentes = new Map((data.productos || []).map((x) => [String(x.codigo), x]));
  let cambio = false;
  for (const item of state.carrito) {
    const actual = vigentes.get(String(item.codigo));
    if (!actual) continue;
    if (Number.isFinite(Number(actual.precio)) && Number(item.precio) !== Number(actual.precio)) {
      item.precio = Number(actual.precio); cambio = true;
    }
    if (actual.nombre && item.nombre !== actual.nombre) { item.nombre = actual.nombre; cambio = true; }
  }
  if (cambio) {
    guardarCarrito(); renderCart();
    if (els.checkout?.classList.contains("is-open")) renderCheckoutReview();
    els.feedback.textContent = "Se actualizaron los precios del carrito según el último Excel.";
  }
}

async function comprobarActualizacionCatalogo() {
  if (actualizacionCatalogoEnCurso) return;
  actualizacionCatalogoEnCurso = true;
  try {
    const data = await apiJson("/catalogo/api/revision");
    const revision = String(data.revision || "");
    if (revisionCatalogoActual !== null && revision !== revisionCatalogoActual) {
      // No perder cantidades ni vaciar el carrito al recargar los productos.
      ofertasCargadas = false;
      state.productosGrupo = [];
      await cargarProductos();
      await cargarOfertasHome();
    }
    revisionCatalogoActual = revision;
    await refrescarPreciosCarrito();
    await sincronizarDisponibilidadVisible();
  } catch (error) { console.warn("No se pudo sincronizar el catálogo:", error); }
  finally { actualizacionCatalogoEnCurso = false; }
}

async function apiJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.ok) throw new Error(data?.mensaje || "Respuesta inválida");
  return data;
}

async function cargarEstadoCatalogo() {
  try {
    state.estadoCatalogo = await apiJson("/catalogo/api/estado");
  } catch (error) {
    console.warn("No se pudo consultar el estado del catálogo:", error);
    state.estadoCatalogo = null;
  }
}

async function cargarRubros() {
  try {
    const data = await apiJson("/catalogo/api/rubros");
    state.rubros = Array.isArray(data.rubros) ? data.rubros : [];
  } catch (error) {
    console.error("No se pudieron cargar los rubros:", error);
    state.rubros = [];
    els.feedback.textContent = "No pudimos cargar los rubros. Podés seguir usando el buscador.";
  }
  renderCategories();
}

let recargaBusquedaPendiente = false;
async function cargarProductos({ append = false } = {}) {
  if (state.loading) {
    recargaBusquedaPendiente = true;
    return;
  }
  state.loading = true;
  const busquedaSolicitada = state.busqueda;
  els.feedback.textContent = "";
  if (!append) renderSkeletons();
  try {
    if (state.grupoPortada === "bebidas" && !state.busqueda) {
      if (!state.productosGrupo.length) await cargarGrupoBebidas();
      state.total = state.productosGrupo.length;
      state.paginas = Math.ceil(state.total / PAGE_SIZE);
      state.productos = state.productosGrupo.slice((state.pagina - 1) * PAGE_SIZE, state.pagina * PAGE_SIZE);
      renderProducts();
      updateHeading();
      renderCategories();
      syncViewMode();
      return true;
    }
    const params = new URLSearchParams({ pagina: String(state.pagina), limite: String(PAGE_SIZE) });
    if (state.busqueda) params.set("q", state.busqueda);
    if (state.rubro) params.set("rubro", state.rubro);
    if (state.rubro && state.subrubro) params.set("subrubro", state.subrubro);
    const data = await apiJson(`/catalogo/api/productos?${params}`);
    if (busquedaSolicitada !== state.busqueda) return false;
    const nuevos = Array.isArray(data.productos) ? data.productos : [];
    state.productos = append ? [...state.productos, ...nuevos] : nuevos;
    state.total = Number(data.total) || 0;
    state.paginas = Number(data.paginas) || 0;
    renderProducts({ append: false });
    renderHomeProducts();
    if (!ofertasCargadas && !state.modoCatalogo && !state.rubro && !state.busqueda) cargarOfertasHome();
    updateHeading();
    renderCategories();
    syncViewMode();
    return true;
  } catch (error) {
    console.error("No se pudieron cargar los productos:", error);
    if (!append) state.productos = [];
    els.grid.innerHTML = '<div class="catalogo-empty"><div><div class="catalogo-empty__icon">!</div><h3>Catálogo temporalmente no disponible</h3><p>Intentá nuevamente en unos instantes.</p></div></div>';
    els.count.textContent = "No se pudieron cargar los productos";
    els.feedback.textContent = "Hubo un problema de conexión con el catálogo.";
    return false;
  } finally {
    state.loading = false;
    if (recargaBusquedaPendiente || busquedaSolicitada !== state.busqueda) {
      recargaBusquedaPendiente = false;
      cargarProductos();
    }
  }
}

function seleccionarRubro(slug = "", { cargar = true } = {}) {
  // Cada rubro (incluido Todos) abre el listado, nunca la portada de Inicio.
  document.body.classList.remove("catalogo-mobile-offers-active", "catalogo-mobile-bestsellers-active");
  document.querySelectorAll('#catalogoBottomNav [data-mobile-nav]').forEach(button => {
    const active = false; // Un rubro no es la pantalla Inicio.
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  state.modoCatalogo = true;
  if (slug) { state.grupoPortada = ""; state.productosGrupo = []; }
  state.rubro = slug;
  state.subrubro = "";
  state.busqueda = "";
  els.search.value = "";
  state.pagina = 1;
  cerrarDrawers();
  if (cargar) cargarProductos();
  document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buscar(texto = "", { desplazar = true } = {}) {
  if (document.body.classList.contains("catalogo-mobile-offers-active") || document.body.classList.contains("catalogo-mobile-bestsellers-active")) {
    state.busqueda = String(texto || "").trim().replace(/\s+/g, " ").slice(0, 100);
    els.search.value = state.busqueda;
    renderProducts(); updateHeading();
    return;
  }
  state.modoCatalogo = true;
  state.grupoPortada = "";
  state.productosGrupo = [];
  const q = String(texto || "").trim().replace(/\s+/g, " ").slice(0, 100);
  state.busqueda = q;
  state.pagina = 1;
  els.search.value = q;
  const campoDesktop = document.getElementById("catalogoDesktopSearch");
  if (campoDesktop) campoDesktop.value = q;
  cargarProductos();
  document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buscarProducto(codigo) { return state.productos.find((p) => p.codigo === codigo) || ofertasHome.find((p) => p.codigo === codigo) || state.carrito.find((p) => p.codigo === codigo); }

async function agregarPrimeraUnidad(codigo) {
  const vigente = await verificarProductoParaCompra(codigo);
  if (!vigente) return;
  state.pedidoRegistrado = null;
  const producto = buscarProducto(codigo);
  if (!producto) return;

  const existente = state.carrito.find((x) => x.codigo === codigo);
  if (existente) {
    existente.cantidad = Math.min(999, (Number(existente.cantidad) || 0) + 1);
    existente.precio = Number(vigente.precio);
  } else {
    state.carrito.push({
      codigo: producto.codigo,
      nombre: producto.nombre,
      precio: Number(vigente.precio),
      unidadVenta: producto.unidadVenta,
      rubro: producto.rubro,
      cantidad: 1,
    });
  }

  guardarCarrito();
  renderCart();
  state.editoresCantidad.add(codigo);
  renderControlCompra(codigo);
  programarCierreCantidad(codigo);
}

async function modificarCantidadProducto(codigo, delta) {
  if (delta > 0 && !(await verificarProductoParaCompra(codigo))) return;
  state.pedidoRegistrado = null;
  const item = state.carrito.find((x) => x.codigo === codigo);
  if (!item) return;

  const nueva = Math.min(999, (Number(item.cantidad) || 0) + delta);
  if (nueva <= 0) {
    cancelarTimerCantidad(codigo);
    state.editoresCantidad.delete(codigo);
    state.carrito = state.carrito.filter((x) => x.codigo !== codigo);
    guardarCarrito();
    renderCart();
    renderControlCompra(codigo);
    return;
  }

  item.cantidad = nueva;
  guardarCarrito();
  renderCart();

  document.querySelectorAll(`[data-purchase-qty-for="${CSS.escape(codigo)}"]`).forEach((el) => {
    el.textContent = String(nueva);
  });

  state.editoresCantidad.add(codigo);
  programarCierreCantidad(codigo);
}

async function actualizarCantidadCarrito(codigo, delta) {
  if (delta > 0 && !(await verificarProductoParaCompra(codigo))) return;
  state.pedidoRegistrado = null;
  const item = state.carrito.find((x) => x.codigo === codigo);
  if (!item) return;
  item.cantidad = Math.max(1, Math.min(999, item.cantidad + delta));
  guardarCarrito();
  renderCart();
  renderControlCompra(codigo);
}

function quitarDelCarrito(codigo) {
  state.pedidoRegistrado = null;
  cancelarTimerCantidad(codigo);
  state.editoresCantidad.delete(codigo);
  state.carrito = state.carrito.filter((x) => x.codigo !== codigo);
  guardarCarrito();
  renderCart();
  renderControlCompra(codigo);
}

function cartTotals() {
  return state.carrito.reduce((acc, item) => {
    const cantidad = Number(item.cantidad) || 0;
    acc.unidades += cantidad;
    acc.total += (Number(item.precio) || 0) * cantidad;
    return acc;
  }, { unidades: 0, total: 0 });
}

function renderCart() {
  const totals = cartTotals();
  const variedades = state.carrito.length;
  els.cartBadge.hidden = variedades === 0;
  els.cartBadge.textContent = variedades > 99 ? "99+" : String(variedades);
  els.cartProductsLabel.textContent = pluralProductos(state.carrito.length);
  els.cartTotal.textContent = formatMoney(totals.total);
  if (els.headerCartTotal) els.headerCartTotal.textContent = formatMoney(totals.total);
  els.mobileCartCount.textContent = pluralProductos(state.carrito.length);
  els.mobileCartTotal.textContent = formatMoney(totals.total);
  els.mobileCartbar.hidden = state.carrito.length === 0;

  if (!state.carrito.length) {
    els.cartItems.innerHTML = '<div class="cart-empty"><div><span aria-hidden="true">🛒</span><strong>Tu carrito está vacío</strong><small>Agregá productos para empezar tu pedido.</small></div></div>';
    return;
  }
  els.cartItems.innerHTML = state.carrito.map((item) => `<article class="cart-item">
    <div class="cart-item__image">${imagenProducto(item)}</div>
    <div><h3>${escapeHtml(item.nombre)}</h3><div class="cart-item__price">${formatMoney(item.precio)} / ${String(item.unidadVenta).toLowerCase()==="kg" ? "kg" : "unidad"}</div>${String(item.unidadVenta).toLowerCase()==="kg" ? `<button class="kg-cart-edit" type="button" data-action="kg-select" data-code="${escapeHtml(item.codigo)}">${escapeHtml(cantidadPresentada(item))} · Cambiar</button>` : `<div class="qty-control"><button type="button" data-cart-action="minus" data-code="${escapeHtml(item.codigo)}">−</button><span>${item.cantidad}</span><button type="button" data-cart-action="plus" data-code="${escapeHtml(item.codigo)}">+</button></div>`}</div>
    <button class="cart-item__remove" type="button" data-cart-action="remove" data-code="${escapeHtml(item.codigo)}" aria-label="Quitar ${escapeHtml(item.nombre)}">×</button>
  </article>`).join("");
}

// Mantiene inmóvil el catálogo mientras un panel lateral está abierto.
let catalogoScrollBloqueado = null;
function bloquearScrollCatalogo() {
  if (catalogoScrollBloqueado !== null) return;
  catalogoScrollBloqueado = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${catalogoScrollBloqueado}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.documentElement.classList.add("catalogo-scroll-locked");
}
function liberarScrollCatalogo() {
  if (catalogoScrollBloqueado === null) return;
  const y = catalogoScrollBloqueado;
  catalogoScrollBloqueado = null;
  for (const propiedad of ["position", "top", "left", "right", "width"]) document.body.style[propiedad] = "";
  document.documentElement.classList.remove("catalogo-scroll-locked");
  window.scrollTo(0, y);
}
function actualizarBloqueoCatalogo() {
  if (document.body.classList.contains("drawer-open")) bloquearScrollCatalogo();
  else liberarScrollCatalogo();
}

function abrirDrawer(tipo) {
  const isCart = tipo === "cart";
  els.cart.classList.toggle("is-open", isCart);
  els.mobileCategories.classList.toggle("is-open", !isCart);
  els.cart.setAttribute("aria-hidden", String(!isCart));
  if (isCart && els.mobileCategories.contains(document.activeElement)) els.menuBtn.focus();
  els.mobileCategories.setAttribute("aria-hidden", String(isCart));
  els.menuBtn.setAttribute("aria-expanded", String(!isCart));
  els.overlay.hidden = false;
  document.body.classList.add("drawer-open"); actualizarBloqueoCatalogo();
}

function cerrarDrawers() {
  // Antes de ocultar un panel, devolver el foco al control que lo abrió.
  if (els.mobileCategories.contains(document.activeElement)) els.menuBtn.focus();
  else if (els.cart.contains(document.activeElement)) els.cartButton?.focus();
  else if (els.account?.contains(document.activeElement)) els.accountButton?.focus();
  els.account?.classList.remove("is-open");
  els.account?.setAttribute("aria-hidden", "true");
  els.checkout?.classList.remove("is-open");
  els.checkout?.setAttribute("aria-hidden", "true");
  els.cart.classList.remove("is-open");
  els.mobileCategories.classList.remove("is-open");
  els.cart.setAttribute("aria-hidden", "true");
  els.mobileCategories.setAttribute("aria-hidden", "true");
  els.menuBtn.setAttribute("aria-expanded", "false");
  els.overlay.hidden = true;
  document.body.classList.remove("drawer-open"); actualizarBloqueoCatalogo();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const showProducts = event.target.closest("[data-show-products]");
    if (showProducts) return abrirCatalogoCompleto();

    const promo = event.target.closest("[data-rubro-name]");
    if (promo) return seleccionarRubroPorNombre(promo.dataset.rubroName || "");

    const menuView = event.target.closest('[data-menu-view]');
    if (menuView) {
      const view = menuView.dataset.menuView;
      cerrarDrawers();
      if (view === 'inicio' || view === 'ofertas') {
        document.querySelector(`#catalogoBottomNav [data-mobile-nav="${view}"]`)?.click();
      } else if (view === 'vendidos') {
        document.body.classList.remove('catalogo-mobile-offers-active');
        document.body.classList.add('catalogo-mobile-bestsellers-active');
        state.modoCatalogo = true;
        state.rubro = '';
        state.busqueda = '';
        state.pagina = 1;
        els.search.value = '';
        document.querySelectorAll('#catalogoBottomNav [data-mobile-nav]').forEach(b => { b.classList.remove('is-active'); b.removeAttribute('aria-current'); });
        syncViewMode();
        cargarProductos();
        window.scrollTo({top:0,behavior:'instant'});
      }
      renderCategories();
      return;
    }

    const expand = event.target.closest("[data-expand-rubro]");
    if (expand) {
      const slug = expand.dataset.expandRubro || "";
      state.rubroExpandido = state.rubroExpandido === slug ? "" : slug;
      renderCategories();
      return;
    }
    const sub = event.target.closest("[data-subrubro]");
    if (sub) {
      seleccionarRubro(sub.dataset.parentRubro || "", { cargar: false });
      state.subrubro = sub.dataset.subrubro || "";
      cargarProductos();
      return;
    }
    const category = event.target.closest("[data-rubro]");
    if (category) return seleccionarRubro(category.dataset.rubro || "");

    const action = event.target.closest("[data-action]");
    if (action) {
      const code = action.dataset.code || "";
      if (action.dataset.action === "add-first") agregarPrimeraUnidad(code);
      if (action.dataset.action === "kg-select") abrirSelectorKg(code);
      if (action.dataset.action === "open-qty") abrirEditorCantidad(code);
      if (action.dataset.action === "cart-minus") modificarCantidadProducto(code, -1);
      if (action.dataset.action === "cart-plus") modificarCantidadProducto(code, 1);
      return;
    }

    const cartAction = event.target.closest("[data-cart-action]");
    if (cartAction) {
      const code = cartAction.dataset.code || "";
      if (cartAction.dataset.cartAction === "minus") actualizarCantidadCarrito(code, -1);
      if (cartAction.dataset.cartAction === "plus") actualizarCantidadCarrito(code, 1);
      if (cartAction.dataset.cartAction === "remove") quitarDelCarrito(code);
    }
  });

  els.searchForm.addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(temporizadorBusqueda); buscar(els.search.value); });
  const desktopSearchForm = $("catalogoDesktopSearchForm");
  const desktopSearch = $("catalogoDesktopSearch");
  if (desktopSearchForm && desktopSearch) {
    desktopSearchForm.addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(temporizadorBusqueda); buscar(desktopSearch.value); });
  }

  // Sugerencias independientes: escribir no modifica la grilla de productos.
  let temporizadorBusqueda;
  let solicitudSugerencias = 0;
  const camposBusqueda = [els.search, desktopSearch].filter(Boolean);
  const menusBusqueda = new Map();
  const normalizarTextoBusqueda = texto => String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cerrarSugerencias = () => {
    for (const menu of menusBusqueda.values()) { menu.hidden = true; menu.replaceChildren(); }
    for (const campo of camposBusqueda) campo.setAttribute("aria-expanded", "false");
  };
  const confirmarBusqueda = texto => {
    clearTimeout(temporizadorBusqueda);
    solicitudSugerencias++;
    cerrarSugerencias();
    buscar(texto);
  };
  for (const campo of camposBusqueda) {
    const formulario = campo.closest("form");
    if (!formulario) continue;
    const menu = document.createElement("div");
    menu.className = "catalogo-search-suggestions";
    menu.id = `${campo.id}Suggestions`;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Sugerencias de productos");
    menu.hidden = true;
    formulario.appendChild(menu);
    menusBusqueda.set(campo, menu);
    campo.setAttribute("aria-controls", menu.id);
    campo.setAttribute("aria-expanded", "false");
    campo.setAttribute("aria-autocomplete", "list");
    campo.addEventListener("input", () => {
      for (const otro of camposBusqueda) if (otro !== campo) otro.value = campo.value;
      clearTimeout(temporizadorBusqueda);
      const version = ++solicitudSugerencias;
      cerrarSugerencias();
      const texto = campo.value.trim();
      if (!texto) return;
      temporizadorBusqueda = setTimeout(async () => {
        try {
          const data = await apiJson(`/catalogo/api/productos?${new URLSearchParams({q:texto, pagina:"1", limite:"8"})}`);
          if (version !== solicitudSugerencias || document.activeElement !== campo) return;
          const productos = (data.productos || []).slice(0, 5);
          menu.replaceChildren();
          if (!productos.length) {
            const vacio = document.createElement("div");
            vacio.className = "catalogo-search-suggestions__empty";
            vacio.textContent = "No encontramos coincidencias";
            menu.appendChild(vacio);
          }
          for (const producto of productos) {
            const opcion = document.createElement("button");
            opcion.type = "button";
            opcion.className = "catalogo-search-suggestions__item";
            opcion.setAttribute("role", "option");
            opcion.textContent = producto.nombre || producto.article || producto.name || producto.codigo || "Producto";
            opcion.addEventListener("click", () => confirmarBusqueda(producto.codigo || producto.code || opcion.textContent));
            menu.appendChild(opcion);
          }
          menu.hidden = false;
          campo.setAttribute("aria-expanded", "true");
        } catch (error) {
          if (version === solicitudSugerencias) cerrarSugerencias();
        }
      }, 300);
    });
    campo.addEventListener("keydown", e => {
      if (e.key === "Escape") { solicitudSugerencias++; cerrarSugerencias(); }
      if (e.key === "ArrowDown" && !menu.hidden) {
        const primero = menu.querySelector("button");
        if (primero) { e.preventDefault(); primero.focus(); }
      }
    });
    menu.addEventListener("keydown", e => {
      if (e.key === "Escape") { cerrarSugerencias(); campo.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const opciones = [...menu.querySelectorAll("button")];
        const actual = opciones.indexOf(document.activeElement);
        const siguiente = opciones[actual + (e.key === "ArrowDown" ? 1 : -1)];
        if (siguiente) { e.preventDefault(); siguiente.focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); campo.focus(); }
      }
    });
  }
  document.addEventListener("pointerdown", e => {
    if (!camposBusqueda.some(campo => campo.closest("form")?.contains(e.target))) {
      solicitudSugerencias++;
      cerrarSugerencias();
    }
  });
  for (const formulario of [els.searchForm, desktopSearchForm]) {
    formulario?.addEventListener("submit", () => { solicitudSugerencias++; cerrarSugerencias(); });
  }

  const sortLabels = {
    relevancia: "Más relevantes",
    "precio-asc": "Menor precio",
    "precio-desc": "Mayor precio",
    nombre: "Nombre A–Z",
  };

  const cerrarSort = () => {
    if (!els.sortMenu || !els.sortTrigger) return;
    els.sortMenu.hidden = true;
    els.sortTrigger.setAttribute("aria-expanded", "false");
    els.sortCustom?.classList.remove("is-open");
  };

  els.sortTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    const abrir = els.sortMenu?.hidden ?? true;
    if (!els.sortMenu) return;
    els.sortMenu.hidden = !abrir;
    els.sortTrigger.setAttribute("aria-expanded", String(abrir));
    els.sortCustom?.classList.toggle("is-open", abrir);
  });

  els.sortMenu?.addEventListener("click", (e) => {
    const option = e.target.closest("[data-sort-value]");
    if (!option) return;
    state.orden = option.dataset.sortValue || "relevancia";
    if (els.sortLabel) els.sortLabel.textContent = sortLabels[state.orden] || sortLabels.relevancia;
    els.sortMenu.querySelectorAll("[data-sort-value]").forEach((btn) => btn.setAttribute("aria-selected", String(btn === option)));
    cerrarSort();
    renderProducts();
  });

  document.addEventListener("click", (e) => {
    if (!els.sortCustom?.contains(e.target)) cerrarSort();
  });
  els.paginationButtons?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    cambiarPagina(Number(button.dataset.page));
  });
  els.accountButton?.addEventListener("click", abrirMiCuenta);
  els.accountClose?.addEventListener("click", cerrarMiCuenta);
  els.accountGuardar?.addEventListener("click", guardarMiCuenta);
  els.accountRecargar?.addEventListener("click", cargarMisPedidos);
  els.cartButton.addEventListener("click", () => {
    if (window.matchMedia("(min-width: 1100px)").matches) {
      els.cart?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      abrirDrawer("cart");
    }
  });
  els.mobileCartbar.addEventListener("click", () => abrirDrawer("cart"));
  els.cartClose.addEventListener("click", cerrarDrawers);
  els.cartContinue.addEventListener("click", abrirCheckout);
  els.checkoutClose?.addEventListener("click", cerrarCheckout);
  els.checkoutPaso1Siguiente?.addEventListener("click", () => {
    if (tomarPaso1()) setCheckoutPaso(2);
  });
  els.checkoutPaso2Atras?.addEventListener("click", () => setCheckoutPaso(1));
  els.checkoutPaso2Siguiente?.addEventListener("click", () => {
    if (!tomarPaso2()) return;
    renderCheckoutReview();
    setCheckoutPaso(3);
  });
  els.checkoutPaso3Atras?.addEventListener("click", () => setCheckoutPaso(2));
  els.checkoutEnviarWhatsapp?.addEventListener("click", enviarPedidoWhatsApp);
  els.checkoutCopiarPedido?.addEventListener("click", copiarPedido);
  document.querySelectorAll('input[name="checkoutEntrega"]').forEach((input) => input.addEventListener("change", actualizarEstadoDelivery));
  els.menuBtn.addEventListener("click", () => abrirDrawer("categories"));
  els.categoriesClose.addEventListener("click", cerrarDrawers);
  els.overlay.addEventListener("click", cerrarDrawers);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarDrawers(); });
}

async function iniciar() {
  bindEvents();
  renderCart();
  renderSkeletons();
  await cargarEstadoCatalogo();
  await cargarRubros();
  await cargarProductos();
  await comprobarActualizacionCatalogo();
  // Comprobación frecuente para catálogos web y de la app ya abiertos.
  setInterval(comprobarActualizacionCatalogo, 5000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void comprobarActualizacionCatalogo();
  });
}

iniciar();

// Botón Atrás del teléfono: primero cierra paneles o vuelve a Inicio.
// En Inicio requiere dos pulsaciones próximas para dejar actuar al navegador.
(() => {
  if (!window.history?.pushState) return;
  const MARCA = "__victorCatalogoBack";
  let ultimoAtrasInicio = 0;
  let saliendo = false;
  let avisoTimer = null;

  function avisoSalida() {
    let aviso = document.getElementById("catalogoAvisoSalida");
    if (!aviso) {
      aviso = document.createElement("div");
      aviso.id = "catalogoAvisoSalida";
      aviso.setAttribute("role", "status");
      Object.assign(aviso.style, {
        position: "fixed", bottom: "92px", left: "50%", transform: "translateX(-50%)",
        padding: "11px 17px", borderRadius: "12px", background: "#202329",
        color: "white", fontSize: "13px", fontWeight: "600", textAlign: "center",
        zIndex: "2147483647", boxShadow: "0 6px 22px #0004", maxWidth: "90vw",
        whiteSpace: "nowrap", pointerEvents: "none"
      });
      document.body.appendChild(aviso);
    }
    aviso.textContent = "Presioná Atrás nuevamente para salir";
    aviso.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { aviso.hidden = true; }, 2000);
  }

  function volverInicio() {
    cerrarDrawers();
    cerrarMiCuenta();
    cerrarCheckout();
    document.getElementById("catalogoKgModal")?.setAttribute("hidden", "");
    document.querySelector('#catalogoBottomNav [data-mobile-nav="inicio"]')?.click();
    // Al salir de un rubro, Inicio debe limpiar también la selección y la búsqueda.
    state.grupoPortada = "";
    state.productosGrupo = [];
    state.rubro = "";
    state.subrubro = "";
    state.busqueda = "";
    state.modoCatalogo = false;
    if (els.search) els.search.value = "";
    document.body.classList.remove("catalogo-mobile-bestsellers-active", "catalogo-mobile-offers-active");
    syncViewMode();
    renderCategories();
    cargarProductos();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function hayPantallaSecundaria() {
    return Boolean(
      els.cart?.classList.contains("is-open") ||
      els.mobileCategories?.classList.contains("is-open") ||
      els.checkout?.classList.contains("is-open") ||
      els.account?.classList.contains("is-open") ||
      document.getElementById("catalogoKgModal")?.hasAttribute("hidden") === false ||
      state.modoCatalogo || state.rubro || state.busqueda || state.grupoPortada ||
      document.body.classList.contains("catalogo-mobile-offers-active") ||
      document.body.classList.contains("catalogo-mobile-bestsellers-active")
    );
  }

  // Dos entradas propias permiten interceptar Atrás sin reemplazar la URL.
  history.pushState({ [MARCA]: 1 }, "", location.href);
  history.pushState({ [MARCA]: 2 }, "", location.href);
  window.addEventListener("popstate", () => {
    if (saliendo) return;
    const ahora = Date.now();
    if (hayPantallaSecundaria()) {
      ultimoAtrasInicio = 0;
      volverInicio();
      history.pushState({ [MARCA]: 2 }, "", location.href);
      return;
    }
    if (ahora - ultimoAtrasInicio <= 2000) {
      saliendo = true;
      // Estamos sobre la primera entrada de protección; retroceder dos
      // posiciones deja el historial del catálogo y vuelve al sitio anterior.
      history.go(-2);
      return;
    }
    ultimoAtrasInicio = ahora;
    avisoSalida();
    history.pushState({ [MARCA]: 2 }, "", location.href);
  });
})();

// Navegación horizontal de las secciones de inicio: deslizamiento táctil
// en celulares y botones anterior/siguiente en pantallas grandes.
document.addEventListener("click", (event) => {
  const boton = event.target.closest("[data-carousel-target][data-carousel-dir]");
  if (!boton) return;
  const lista = document.getElementById(boton.dataset.carouselTarget);
  if (!lista) return;
  const tarjeta = lista.querySelector(".product-card");
  if (!tarjeta) return;
  const separacion = parseFloat(getComputedStyle(lista).columnGap) || 12;
  const ancho = tarjeta.getBoundingClientRect().width + separacion;
  const visibles = window.matchMedia("(max-width: 700px)").matches ? 2 : 6;
  const paso = ancho * visibles;
  const maximo = Math.max(0, lista.scrollWidth - lista.clientWidth);
  const destino = Math.min(maximo, Math.max(0, Math.round(lista.scrollLeft / ancho / visibles + Number(boton.dataset.carouselDir)) * paso));
  lista.scrollTo({left: destino, behavior: "smooth"});
});

// Las flechas se activan únicamente si hay productos hacia ese lado.
// Observa los cambios en la lista porque los productos se cargan de forma asíncrona.
function actualizarFlechasCarrusel(lista) {
  const carrusel = lista.closest(".catalogo-carousel");
  if (!carrusel) return;
  const anterior = carrusel.querySelector('[data-carousel-dir="-1"]');
  const siguiente = carrusel.querySelector('[data-carousel-dir="1"]');
  const margen = 3;
  const maximo = Math.max(0, lista.scrollWidth - lista.clientWidth);
  if (anterior) anterior.disabled = lista.scrollLeft <= margen;
  if (siguiente) siguiente.disabled = maximo <= margen || lista.scrollLeft >= maximo - margen;
}

function configurarFlechasCarrusel() {
  document.querySelectorAll(".catalogo-carousel").forEach((carrusel) => {
    const lista = carrusel.querySelector(".catalogo-grid--carousel");
    if (!lista || carrusel.dataset.flechasConfiguradas === "1") return;
    carrusel.dataset.flechasConfiguradas = "1";
    carrusel.querySelectorAll(".catalogo-carousel-arrow").forEach((boton) => {
      const izquierda = boton.dataset.carouselDir === "-1";
      boton.innerHTML = izquierda
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg>';
      boton.disabled = true;
    });
    const actualizar = () => actualizarFlechasCarrusel(lista);
    lista.addEventListener("scroll", actualizar, {passive:true});
    new MutationObserver(actualizar).observe(lista, {childList:true});
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(actualizar).observe(lista);
    window.addEventListener("resize", actualizar);
    actualizar();
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", configurarFlechasCarrusel);
} else {
  configurarFlechasCarrusel();
}

// Selector de compra por KG. El servidor valida las cantidades y vuelve a calcular precios.
let kgSeleccion = null;
function abrirSelectorKg(codigo) {
  const producto = buscarProducto(codigo);
  if (!producto || String(producto.unidadVenta).toLowerCase() !== "kg") return;
  const previo = state.carrito.find(item => item.codigo === codigo);
  kgSeleccion = { producto, modo: previo?.modoCompraKg === "unidades" ? "unidades" : producto.modalidadKg === "solo_unidades" ? "unidades" : "peso", pasos: Math.max(1, Math.round((Number(previo?.cantidad) || 1) * 2)), piezas: Math.max(1, Math.round(Number(previo?.piezasCompraKg) || 1)) };
  const modal = document.getElementById("catalogoKgModal");
  modal.hidden = false;
  document.body.classList.add("kg-modal-open");
  dibujarSelectorKg();
  document.getElementById("catalogoKgCerrar").focus();
}
function cerrarSelectorKg() {
  document.getElementById("catalogoKgModal").hidden = true;
  document.body.classList.remove("kg-modal-open");
  kgSeleccion = null;
}
function dibujarSelectorKg() {
  if (!kgSeleccion) return;
  const {producto, modo, pasos, piezas} = kgSeleccion;
  const permiteUnidades = ["peso_unidades", "solo_unidades"].includes(producto.modalidadKg) && Number(producto.gramosPorUnidad) > 0;
  const kilos = modo === "peso" ? pasos * 0.5 : piezas * Number(producto.gramosPorUnidad) / 1000;
  document.getElementById("catalogoKgNombre").textContent = producto.nombre;
  document.getElementById("catalogoKgOpciones").innerHTML = `${producto.modalidadKg === "solo_unidades" ? "" : `<label class="kg-mode"><input type="radio" name="kgModo" value="peso" ${modo === "peso" ? "checked" : ""}><span>Peso<small>De 500 g en 500 g</small></span></label><div class="kg-step"><button type="button" data-kg-step="-1" ${modo !== "peso" || pasos <= 1 ? "disabled" : ""}>−</button><strong>${(pasos * 0.5).toLocaleString("es-AR")} kg</strong><button type="button" data-kg-step="1" ${modo !== "peso" ? "disabled" : ""}>+</button></div>`}${permiteUnidades ? `<label class="kg-mode"><input type="radio" name="kgModo" value="unidades" ${modo === "unidades" ? "checked" : ""}><span>Unidades<small>${producto.gramosPorUnidad} g aprox. por unidad</small></span></label><div class="kg-step"><button type="button" data-kg-piece="-1" ${modo !== "unidades" || piezas <= 1 ? "disabled" : ""}>−</button><strong>${piezas}</strong><button type="button" data-kg-piece="1" ${modo !== "unidades" ? "disabled" : ""}>+</button></div>` : ""}`;
  document.getElementById("catalogoKgPrecio").textContent = formatMoney(precioVigente(producto) * kilos);
  document.getElementById("catalogoKgCantidad").textContent = `${kilos.toLocaleString("es-AR", {maximumFractionDigits: 3})} kg estimados`;
}
async function confirmarSelectorKg() {
  if (!kgSeleccion) return;
  const {producto, modo, pasos, piezas} = kgSeleccion;
  const vigente = await verificarProductoParaCompra(producto.codigo);
  if (!vigente) { cerrarSelectorKg(); return; }
  const cantidad = modo === "peso" ? pasos / 2 : Math.round(piezas * Number(producto.gramosPorUnidad)) / 1000;
  if (!Number.isFinite(cantidad) || cantidad < 0.01 || cantidad > 999) return;
  const item = state.carrito.find(x => x.codigo === producto.codigo);
  if (item) { item.cantidad = cantidad; item.precio = Number(vigente.precio); item.unidadVenta = "kg"; item.modoCompraKg = modo; item.piezasCompraKg = modo === "unidades" ? piezas : null; }
  else state.carrito.push({ codigo:producto.codigo, nombre:producto.nombre, precio:Number(vigente.precio), unidadVenta:"kg", rubro:producto.rubro, cantidad, modoCompraKg:modo, piezasCompraKg:modo === "unidades" ? piezas : null });
  state.pedidoRegistrado = null;
  guardarCarrito(); renderCart(); renderControlCompra(producto.codigo); cerrarSelectorKg();
}
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.createElement("div");
  modal.id = "catalogoKgModal"; modal.className = "kg-modal"; modal.hidden = true;
  modal.innerHTML = `<div class="kg-modal__shade" data-kg-close></div><section class="kg-modal__panel" role="dialog" aria-modal="true" aria-labelledby="catalogoKgTitulo"><div class="kg-modal__handle"></div><header><h2 id="catalogoKgTitulo">Elegí cuánto querés</h2><button id="catalogoKgCerrar" type="button" aria-label="Cerrar">×</button></header><p class="kg-modal__product" id="catalogoKgNombre"></p><div class="kg-modal__options" id="catalogoKgOpciones"></div><div class="kg-modal__summary"><span>Tu producto<small id="catalogoKgCantidad"></small></span><strong id="catalogoKgPrecio"></strong></div><button type="button" class="kg-modal__confirm" id="catalogoKgConfirmar">Agregar al carrito</button></section>`;
  document.body.append(modal);
  modal.addEventListener("click", event => {
    if (event.target.closest("[data-kg-close], #catalogoKgCerrar")) cerrarSelectorKg();
    const step = event.target.closest("[data-kg-step]");
    if (step && kgSeleccion) { kgSeleccion.pasos = Math.max(1, Math.min(1998, kgSeleccion.pasos + Number(step.dataset.kgStep))); dibujarSelectorKg(); }
    const piece = event.target.closest("[data-kg-piece]");
    if (piece && kgSeleccion) { kgSeleccion.piezas = Math.max(1, Math.min(999, kgSeleccion.piezas + Number(piece.dataset.kgPiece))); dibujarSelectorKg(); }
  });
  modal.addEventListener("change", event => { if (event.target.name === "kgModo" && kgSeleccion) { kgSeleccion.modo = kgSeleccion.producto.modalidadKg === "solo_unidades" ? "unidades" : event.target.value; dibujarSelectorKg(); } });
  document.getElementById("catalogoKgConfirmar").addEventListener("click", confirmarSelectorKg);
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) cerrarSelectorKg(); });
});

// Navegación móvil: Pedidos y Perfil son pantallas independientes.
(() => {
  const nav = document.getElementById('catalogoBottomNav');
  const account = document.getElementById('catalogoAccount');
  if (!nav || !account) return;
  const buttons = [...nav.querySelectorAll('[data-mobile-nav]')];
  const showOffers = (enabled) => {
    document.body.classList.remove('catalogo-mobile-bestsellers-active');
    document.body.classList.toggle('catalogo-mobile-offers-active', enabled);
    state.busqueda = '';
    els.search.value = '';
    // El listado de Ofertas usa la misma sección que el catálogo normal.
    // Mantenerla visible aunque el usuario estuviera en la portada.
    if (enabled) {
      state.modoCatalogo = true;
      state.rubro = '';
    } else {
      state.modoCatalogo = false;
      state.rubro = '';
    }
    syncViewMode();
    if (enabled && !ofertasCargadas) cargarOfertasHome();
    if (!enabled) cargarProductos();
    else { renderProducts(); updateHeading(); }
    renderCategories();
    if (enabled) window.scrollTo({top:0,behavior:'instant'});
  };
  const activate = (name) => buttons.forEach(button => {
    const active = button.dataset.mobileNav === name;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const showScreen = (name) => {
    if (!window.matchMedia('(max-width:700px)').matches) return;
    account.dataset.mobileScreen = name;
    const title = document.getElementById('catalogoAccountTitle');
    if (title) title.textContent = name === 'pedidos' ? 'Mis pedidos' : 'Mi perfil';
    const kicker = account.querySelector('.drawer-header small');
    if (kicker) kicker.textContent = name === 'pedidos' ? 'PEDIDOS' : 'PERFIL';
    const body = account.querySelector('.account-body');
    if (body) body.scrollTop = 0;
    activate(name);
  };
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-mobile-nav]');
    if (!button) return;
    const target = button.dataset.mobileNav;
    if (target === 'inicio' || target === 'ofertas') {
      cerrarDrawers();
      showOffers(target === 'ofertas');
      account.removeAttribute('data-mobile-screen');
      activate(target);
      if (target === 'inicio') window.scrollTo({top: 0, behavior: 'smooth'});

    } else if (target === 'pedidos' || target === 'perfil') {
      showOffers(false);
      if (!account.classList.contains('is-open')) abrirMiCuenta();
      showScreen(target);
    }
  });
  document.getElementById('catalogoAccountClose')?.addEventListener('click', () => {
    account.removeAttribute('data-mobile-screen');
    activate('inicio');
  });
  document.getElementById('catalogoOverlay')?.addEventListener('click', () => {
    account.removeAttribute('data-mobile-screen');
    activate('inicio');
  });
  window.matchMedia('(max-width:700px)').addEventListener('change', event => {
    if (!event.matches) { account.removeAttribute('data-mobile-screen'); showOffers(false); }
  });
  // Posiciona el buscador en el listado en celular, sin cargar un script adicional.
  const applyMobileSearchLayout = () => {
    const section = document.querySelector('.catalogo-search-section');
    const hero = document.querySelector('.catalogo-hero');
    const services = document.querySelector('.catalogo-services');
    if (!section || !hero || !services) return;
    if (window.matchMedia('(max-width:700px)').matches) {
      // En celulares el buscador siempre debe estar inmediatamente antes del banner.
      if (section.nextElementSibling !== hero) hero.insertAdjacentElement('beforebegin', section);
    } else if (section.previousElementSibling !== services) {
      // En escritorio se conserva la ubicación original del buscador.
      services.insertAdjacentElement('afterend', section);
    }
  };
  applyMobileSearchLayout();
  window.matchMedia('(max-width:700px)').addEventListener('change', applyMobileSearchLayout);
})();
