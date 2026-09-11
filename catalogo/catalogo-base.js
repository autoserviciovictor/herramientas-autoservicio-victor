import { API_BASE_URL } from "../config.js?v=1960-d21-cierre-etapa6-010926";
import { CATALOGO_PEDIDO_CONFIG } from "./catalogo-pedido-config.js?v=1960-d21-cierre-etapa6-010926";

const CART_STORAGE_KEY = "autoservicio-victor-catalogo-carrito-v1";
const CHECKOUT_STORAGE_KEY = "autoservicio-victor-catalogo-checkout-v1";
const PAGE_SIZE = 32;
const state = {
  rubros: [],
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
  loadMoreWrap: $("catalogoLoadMoreWrap"),
  loadMore: $("catalogoLoadMore"),
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
  sortCustom: $("catalogoSortCustom"),
  sortTrigger: $("catalogoSortTrigger"),
  sortMenu: $("catalogoSortMenu"),
  sortLabel: $("catalogoSortLabel"),
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
    otros: svg('<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>'),
  };

  if (/aderezo|salsa|aceite|vinagre/.test(n)) return icons.botella;
  if (/agua|jugo|energ|gase|cerve|vino|bebida/.test(n)) return icons.bebida;
  if (/almacen|conserva|arroz|fideo|harina/.test(n)) return icons.almacen;
  if (/carne|carnic/.test(n)) return icons.carne;
  if (/lact|ques|fiambre/.test(n)) return icons.lacteos;
  if (/limp/.test(n)) return icons.limpieza;
  if (/higiene|perf|cuidado/.test(n)) return icons.higiene;
  if (/verd|fruta/.test(n)) return icons.verdura;
  if (/congel/.test(n)) return icons.congelados;
  if (/pan|gallet|panific/.test(n)) return icons.pan;
  if (/golos|snack|chocol|caramel/.test(n)) return icons.golosina;
  if (/mascot|pet/.test(n)) return icons.mascota;
  return icons.otros;
}

function categoryTone(name = "") {
  const n = String(name || "").toLowerCase();
  if (/aderezo|salsa|aceite|vinagre/.test(n)) return "tone-amber";
  if (/agua|jugo|energ|gase|bebida/.test(n)) return "tone-blue";
  if (/cerve|vino|alcohol/.test(n)) return "tone-wine";
  if (/lact|ques|fiambre/.test(n)) return "tone-cyan";
  if (/limp/.test(n)) return "tone-violet";
  if (/higiene|perf|cuidado/.test(n)) return "tone-pink";
  if (/verd|fruta/.test(n)) return "tone-green";
  if (/congel/.test(n)) return "tone-ice";
  if (/pan|gallet|panific/.test(n)) return "tone-brown";
  if (/golos|snack|chocol|caramel/.test(n)) return "tone-magenta";
  if (/carne|carnic/.test(n)) return "tone-red";
  if (/almacen|conserva|arroz|fideo|harina/.test(n)) return "tone-olive";
  return "tone-neutral";
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
      <span>${item.cantidad} × ${escapeHtml(item.nombre)}</span>
      <strong>${formatMoney((Number(item.precio) || 0) * (Number(item.cantidad) || 0))}</strong>
    </div>`).join("");
}

function obtenerClientTokenPedido() {
  let token = String(state.checkout?.clientToken || "");
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(token)) {
    if (globalThis.crypto?.randomUUID) token = globalThis.crypto.randomUUID().replaceAll("-", "");
    else token = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    state.checkout = { ...state.checkout, clientToken: token };
    guardarCheckout();
  }
  return token;
}

function payloadPedidoCatalogo() {
  const c = state.checkout || {};
  return {
    clientToken: obtenerClientTokenPedido(),
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
    ...state.carrito.map((item) => `• ${item.cantidad} x ${item.nombre} — ${formatMoney((Number(item.precio) || 0) * (Number(item.cantidad) || 0))}`),
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
  if (!numero) {
    mensajeCheckout(els.checkoutMensajePaso3, "Falta configurar el número de WhatsApp del autoservicio.", "error");
    return;
  }

  state.enviandoPedido = true;
  if (els.checkoutEnviarWhatsapp) {
    els.checkoutEnviarWhatsapp.disabled = true;
    els.checkoutEnviarWhatsapp.textContent = "Registrando pedido...";
  }
  mensajeCheckout(els.checkoutMensajePaso3, "");

  try {
    const pedido = await registrarPedidoCatalogo();
    mensajeCheckout(els.checkoutMensajePaso3, `Pedido ${pedido.numero} registrado correctamente. Abriendo WhatsApp...`, "ok");

    const url = `https://wa.me/${numero}?text=${encodeURIComponent(generarMensajePedido())}`;
    window.open(url, "_blank", "noopener,noreferrer");

    fetch(`${API_BASE_URL}/catalogo/api/pedidos/${encodeURIComponent(pedido.numero)}/whatsapp-abierto`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  } catch (error) {
    mensajeCheckout(els.checkoutMensajePaso3, error?.message || "No se pudo registrar el pedido. No se abrió WhatsApp.", "error");
  } finally {
    state.enviandoPedido = false;
    if (els.checkoutEnviarWhatsapp) {
      els.checkoutEnviarWhatsapp.disabled = false;
      els.checkoutEnviarWhatsapp.innerHTML = '<span aria-hidden="true">◉</span> Enviar pedido por WhatsApp';
    }
  }
}

function abrirCheckout() {
  if (!state.carrito.length) return;
  cerrarDrawers();
  state.pedidoRegistrado = null;
  if (els.checkoutOrderConfirmation) els.checkoutOrderConfirmation.hidden = true;
  cargarCheckoutEnFormulario();
  setCheckoutPaso(1);
  els.checkout.classList.add("is-open");
  els.checkout.setAttribute("aria-hidden", "false");
  els.overlay.hidden = false;
  document.body.classList.add("drawer-open");
}

function cerrarCheckout() {
  els.checkout?.classList.remove("is-open");
  els.checkout?.setAttribute("aria-hidden", "true");
  if (!els.cart.classList.contains("is-open") && !els.mobileCategories.classList.contains("is-open")) {
    els.overlay.hidden = true;
    document.body.classList.remove("drawer-open");
  }
}

function cargarCarrito() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && x.codigo && Number(x.cantidad) > 0).map((x) => ({ ...x, cantidad: Math.min(999, Math.max(1, Number(x.cantidad) || 1)) }));
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

function renderCategories() {
  const todos = { nombre: "Todos", slug: "", productos: state.rubros.reduce((a, r) => a + (Number(r.productos) || 0), 0) };
  const list = [todos, ...state.rubros];
  els.nav.innerHTML = list.map((r) => categoryButton(r)).join("");
  els.mobileNav.innerHTML = list.map((r) => categoryButton(r, true)).join("");

}

function cantidadEnCarrito(codigo) {
  return Number(state.carrito.find((x) => x.codigo === codigo)?.cantidad) || 0;
}

function controlCompraHtml(producto) {
  const codigo = escapeHtml(producto.codigo);
  const cantidad = cantidadEnCarrito(producto.codigo);
  const editando = state.editoresCantidad.has(producto.codigo);

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

function renderProductCard(producto) {
  const marca = String(producto.marca || "").trim();
  return `<article class="product-card" data-product="${escapeHtml(producto.codigo)}">
    <div class="product-card__image">
      ${producto.destacado ? '<span class="product-card__featured">DESTACADO</span>' : ""}
      ${imagenProducto(producto)}
    </div>
    <div class="product-card__body">
      <div class="product-card__rubric">${escapeHtml(producto.rubro?.nombre || "Producto")}</div>
      <h3 title="${escapeHtml(producto.nombre)}">${escapeHtml(producto.nombre)}</h3>
      ${marca ? `<div class="product-card__brand">${escapeHtml(marca)}</div>` : '<div class="product-card__brand">&nbsp;</div>'}
      <div class="product-card__meta"><strong class="product-card__price">${formatMoney(producto.precio)}</strong><span class="product-card__unit">${escapeHtml(producto.unidadVenta || "unidad")}</span></div>
      <div class="product-card__actions purchase-control" data-purchase-control="${escapeHtml(producto.codigo)}">
        ${controlCompraHtml(producto)}
      </div>
    </div>
  </article>`;
}

function renderHomeProducts() {
  if (!els.bestSellersGrid) return;
  const destacados = state.productos.filter((p) => p.destacado);
  const base = destacados.length >= 6 ? destacados : state.productos;
  els.bestSellersGrid.innerHTML = base.slice(0, 6).map(renderProductCard).join("");
}

function syncViewMode() {
  const browse = Boolean(state.modoCatalogo || state.rubro || state.busqueda);
  document.body.classList.toggle("catalogo-browse-mode", browse);
  if (els.home) els.home.hidden = browse;
}

function abrirCatalogoCompleto() {
  state.modoCatalogo = true;
  state.rubro = "";
  state.busqueda = "";
  state.pagina = 1;
  if (els.search) els.search.value = "";
  syncViewMode();
  cargarProductos();
  document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function seleccionarRubroPorNombre(nombre = "") {
  const buscado = String(nombre || "").trim().toLowerCase();
  const rubro = state.rubros.find((r) => String(r.nombre || "").trim().toLowerCase() === buscado || String(r.nombre || "").toLowerCase().includes(buscado));
  if (rubro) seleccionarRubro(rubro.slug || "");
}

function productosOrdenados() {
  const items = [...state.productos];
  if (state.orden === "precio-asc") items.sort((a,b) => (Number(a.precio)||0) - (Number(b.precio)||0));
  else if (state.orden === "precio-desc") items.sort((a,b) => (Number(b.precio)||0) - (Number(a.precio)||0));
  else if (state.orden === "nombre") items.sort((a,b) => String(a.nombre||"").localeCompare(String(b.nombre||""), "es"));
  return items;
}

function renderProducts({ append = false } = {}) {
  if (!state.productos.length && !append) {
    const noVisible = !state.busqueda && !state.rubro;
    els.grid.innerHTML = `<div class="catalogo-empty"><div><div class="catalogo-empty__icon">⌕</div><h3>${noVisible ? "Todavía no hay productos publicados" : "No encontramos productos"}</h3><p>${noVisible ? "El catálogo está listo. Los productos aparecerán acá cuando sean marcados como visibles desde la administración." : "Probá con otro nombre, código o rubro."}</p></div></div>`;
    return;
  }
  const html = productosOrdenados().map(renderProductCard).join("");
  if (append) els.grid.insertAdjacentHTML("beforeend", html); else els.grid.innerHTML = html;
}

function updateHeading() {
  const selected = state.rubros.find((r) => r.slug === state.rubro);
  if (state.busqueda) {
    els.eyebrow.textContent = "RESULTADOS";
    els.title.textContent = `“${state.busqueda}”`;
  } else if (selected) {
    els.eyebrow.textContent = "RUBRO";
    els.title.textContent = selected.nombre;
  } else {
    els.eyebrow.textContent = "CATÁLOGO";
    els.title.textContent = "Todos los productos";
  }
  els.count.textContent = pluralProductos(state.total);
  els.loadMoreWrap.hidden = state.pagina >= state.paginas || state.total === 0;
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

async function cargarProductos({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  els.feedback.textContent = "";
  if (!append) renderSkeletons();
  try {
    const params = new URLSearchParams({ pagina: String(state.pagina), limite: String(PAGE_SIZE) });
    if (state.busqueda) params.set("q", state.busqueda);
    if (state.rubro) params.set("rubro", state.rubro);
    const data = await apiJson(`/catalogo/api/productos?${params}`);
    const nuevos = Array.isArray(data.productos) ? data.productos : [];
    state.productos = append ? [...state.productos, ...nuevos] : nuevos;
    state.total = Number(data.total) || 0;
    state.paginas = Number(data.paginas) || 0;
    renderProducts({ append: false });
    renderHomeProducts();
    updateHeading();
    renderCategories();
    syncViewMode();
  } catch (error) {
    console.error("No se pudieron cargar los productos:", error);
    if (!append) state.productos = [];
    els.grid.innerHTML = '<div class="catalogo-empty"><div><div class="catalogo-empty__icon">!</div><h3>Catálogo temporalmente no disponible</h3><p>Intentá nuevamente en unos instantes.</p></div></div>';
    els.count.textContent = "No se pudieron cargar los productos";
    els.feedback.textContent = "Hubo un problema de conexión con el catálogo.";
  } finally {
    state.loading = false;
  }
}

function seleccionarRubro(slug = "") {
  state.modoCatalogo = true;
  state.rubro = slug;
  state.busqueda = "";
  els.search.value = "";
  state.pagina = 1;
  cerrarDrawers();
  cargarProductos();
  document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buscar(texto = "") {
  state.modoCatalogo = true;
  const q = String(texto || "").trim().replace(/\s+/g, " ").slice(0, 100);
  state.busqueda = q;
  state.pagina = 1;
  els.search.value = q;
  cargarProductos();
  document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buscarProducto(codigo) { return state.productos.find((p) => p.codigo === codigo) || state.carrito.find((p) => p.codigo === codigo); }

function agregarPrimeraUnidad(codigo) {
  state.pedidoRegistrado = null;
  const producto = buscarProducto(codigo);
  if (!producto) return;

  const existente = state.carrito.find((x) => x.codigo === codigo);
  if (existente) {
    existente.cantidad = Math.min(999, (Number(existente.cantidad) || 0) + 1);
  } else {
    state.carrito.push({
      codigo: producto.codigo,
      nombre: producto.nombre,
      precio: producto.precio,
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

function modificarCantidadProducto(codigo, delta) {
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

function actualizarCantidadCarrito(codigo, delta) {
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
  els.cartBadge.hidden = totals.unidades === 0;
  els.cartBadge.textContent = totals.unidades > 99 ? "99+" : String(totals.unidades);
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
    <div><h3>${escapeHtml(item.nombre)}</h3><div class="cart-item__price">${formatMoney(item.precio)}</div><div class="qty-control"><button type="button" data-cart-action="minus" data-code="${escapeHtml(item.codigo)}">−</button><span>${item.cantidad}</span><button type="button" data-cart-action="plus" data-code="${escapeHtml(item.codigo)}">+</button></div></div>
    <button class="cart-item__remove" type="button" data-cart-action="remove" data-code="${escapeHtml(item.codigo)}" aria-label="Quitar ${escapeHtml(item.nombre)}">×</button>
  </article>`).join("");
}

function abrirDrawer(tipo) {
  const isCart = tipo === "cart";
  els.cart.classList.toggle("is-open", isCart);
  els.mobileCategories.classList.toggle("is-open", !isCart);
  els.cart.setAttribute("aria-hidden", String(!isCart));
  els.mobileCategories.setAttribute("aria-hidden", String(isCart));
  els.menuBtn.setAttribute("aria-expanded", String(!isCart));
  els.overlay.hidden = false;
  document.body.classList.add("drawer-open");
}

function cerrarDrawers() {
  els.checkout?.classList.remove("is-open");
  els.checkout?.setAttribute("aria-hidden", "true");
  els.cart.classList.remove("is-open");
  els.mobileCategories.classList.remove("is-open");
  els.cart.setAttribute("aria-hidden", "true");
  els.mobileCategories.setAttribute("aria-hidden", "true");
  els.menuBtn.setAttribute("aria-expanded", "false");
  els.overlay.hidden = true;
  document.body.classList.remove("drawer-open");
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const showProducts = event.target.closest("[data-show-products]");
    if (showProducts) return abrirCatalogoCompleto();

    const promo = event.target.closest("[data-rubro-name]");
    if (promo) return seleccionarRubroPorNombre(promo.dataset.rubroName || "");

    const category = event.target.closest("[data-rubro]");
    if (category) return seleccionarRubro(category.dataset.rubro || "");

    const action = event.target.closest("[data-action]");
    if (action) {
      const code = action.dataset.code || "";
      if (action.dataset.action === "add-first") agregarPrimeraUnidad(code);
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

  els.searchForm.addEventListener("submit", (e) => { e.preventDefault(); buscar(els.search.value); });

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
  els.loadMore.addEventListener("click", async () => {
    if (state.pagina >= state.paginas || state.loading) return;
    state.pagina += 1;
    const anteriores = [...state.productos];
    state.loading = true;
    try {
      const params = new URLSearchParams({ pagina: String(state.pagina), limite: String(PAGE_SIZE) });
      if (state.busqueda) params.set("q", state.busqueda);
      if (state.rubro) params.set("rubro", state.rubro);
      const data = await apiJson(`/catalogo/api/productos?${params}`);
      state.productos = [...anteriores, ...(data.productos || [])];
      state.total = Number(data.total) || state.total;
      state.paginas = Number(data.paginas) || state.paginas;
      renderProducts(); updateHeading();
    } catch (error) {
      state.pagina -= 1;
      els.feedback.textContent = "No pudimos cargar más productos. Intentá nuevamente.";
    } finally { state.loading = false; }
  });
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
}

iniciar();
