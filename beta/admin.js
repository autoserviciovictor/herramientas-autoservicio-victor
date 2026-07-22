import { API_BASE_URL } from "./config.js?v=71-entrega3-lista-notificaciones";

const $ = id => document.getElementById(id);
let usuarios = [];
let historialVencimientos = [];
let historialPeriodo = "hoy";
let historialLimite = 20;
let historialBusquedaTimer = null;
let importacionPendiente = null;
let importacionResumenPendiente = null;

function mensaje(texto, tipo = "") {
  const el = $("adminMensaje");
  if (!el) return;
  el.textContent = texto;
  el.className = `admin-message ${tipo}`.trim();
  clearTimeout(mensaje.timer);
  mensaje.timer = setTimeout(() => { el.textContent = ""; el.className = "admin-message"; }, 4500);
}

async function api(ruta, opciones = {}) {
  const r = await fetch(`${API_BASE_URL}${ruta}`, opciones);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.mensaje || "No se pudo completar la operación");
  return data;
}

function ocultarPanelAdmin() {
  const panel = $("pantallaAdmin");
  if (!panel) return;
  panel.classList.remove("activa");
  panel.setAttribute("aria-hidden", "true");
}

function mostrarPanel() {
  if (!window.AutoservicioAuth?.esAdmin()) {
    window.AutoservicioNavigate?.("inicio");
    return;
  }
  window.AutoservicioNavigate?.("admin");
  const panel = $("pantallaAdmin");
  if (panel) {
    panel.hidden = false;
    panel.classList.add("activa");
    panel.setAttribute("aria-hidden", "false");
  }
  cambiarTab("usuarios");
  cargarTodo();
}

async function cargarResumen() {
  const data = await api("/admin/resumen");
  $("adminVersion").textContent = `V${data.version}`;
  $("adminProductos").textContent = data.productos;
  $("adminVencimientos").textContent = data.vencimientos;
  $("adminServidorEstado").textContent = "● Servidor conectado";
  if ($("adminVersionSistema")) $("adminVersionSistema").textContent = data.version;
}

async function cargarUsuarios() {
  const data = await api("/admin/usuarios");
  usuarios = data.usuarios || [];
  renderUsuarios();
}

function renderUsuarios() {
  const cont = $("adminUsuariosLista");
  if (!cont) return;
  if (!usuarios.length) { cont.innerHTML = '<div class="empty-state">No hay usuarios.</div>'; return; }
  cont.innerHTML = usuarios.map(u => `
    <article class="admin-user-card ${u.activo ? "" : "inactivo"}" data-usuario="${u.usuario}">
      <div class="admin-user-main"><div class="admin-avatar">${(u.nombre || u.usuario).slice(0,1).toUpperCase()}</div><div><strong>${u.nombre}</strong><span>@${u.usuario} · ${u.rol === "administrador" ? "Administrador" : "Repositor"}</span></div></div>
      <div class="admin-user-actions"><span class="user-status ${u.activo ? "activo" : "inactivo"}">${u.activo ? "Activo" : "Inactivo"}</span><button type="button" class="btn-editar-usuario">Editar</button></div>
    </article>`).join("");
  cont.querySelectorAll(".btn-editar-usuario").forEach(btn => btn.addEventListener("click", () => abrirEditarUsuario(btn.closest("[data-usuario]").dataset.usuario)));
}

function abrirNuevoUsuario() {
  $("adminUsuarioModalTitulo").textContent = "Crear usuario";
  $("adminUsuarioOriginal").value = "";
  $("adminUsuarioNombre").value = "";
  $("adminUsuarioUsuario").value = "";
  $("adminUsuarioUsuario").disabled = false;
  $("adminUsuarioPassword").value = "";
  $("adminUsuarioPassword").placeholder = "Mínimo 4 caracteres";
  $("adminUsuarioRol").value = "repositor";
  $("adminUsuarioActivo").checked = true;
  $("adminUsuarioActivoFila").classList.add("oculto");
  $("adminUsuarioModal").classList.remove("oculto");
}

function abrirEditarUsuario(clave) {
  const u = usuarios.find(x => x.usuario === clave); if (!u) return;
  $("adminUsuarioModalTitulo").textContent = "Editar usuario";
  $("adminUsuarioOriginal").value = u.usuario;
  $("adminUsuarioNombre").value = u.nombre;
  $("adminUsuarioUsuario").value = u.usuario;
  $("adminUsuarioUsuario").disabled = true;
  $("adminUsuarioPassword").value = "";
  $("adminUsuarioPassword").placeholder = "Dejar vacío para no cambiar";
  $("adminUsuarioRol").value = u.rol;
  $("adminUsuarioActivo").checked = u.activo;
  $("adminUsuarioActivoFila").classList.remove("oculto");
  $("adminUsuarioModal").classList.remove("oculto");
}

function cerrarUsuarioModal() { $("adminUsuarioModal")?.classList.add("oculto"); }

async function guardarUsuario() {
  const original = $("adminUsuarioOriginal").value;
  const payload = {
    nombre: $("adminUsuarioNombre").value.trim(),
    usuario: $("adminUsuarioUsuario").value.trim(),
    password: $("adminUsuarioPassword").value,
    rol: $("adminUsuarioRol").value,
    activo: $("adminUsuarioActivo").checked
  };
  const btn = $("btnAdminGuardarUsuario"); btn.disabled = true;
  try {
    if (original) await api(`/admin/usuarios/${encodeURIComponent(original)}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    else await api("/admin/usuarios", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    cerrarUsuarioModal(); mensaje(original ? "Usuario actualizado" : "Usuario creado", "ok"); await cargarUsuarios();
  } catch(e) { mensaje(e.message, "error"); }
  finally { btn.disabled = false; }
}

function escaparHtml(valor = "") {
  return String(valor).replace(/[&<>'"]/g, caracter => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[caracter]);
}

function normalizarTexto(valor = "") {
  return String(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function fechaHistorialAFecha(valor = "", hora = "") {
  const texto = String(valor).trim();
  let partes;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    partes = texto.split("-").map(Number);
    const [anio, mes, dia] = partes;
    const [h = 0, m = 0, seg = 0] = String(hora).split(":").map(Number);
    return new Date(anio, mes - 1, dia, h, m, seg);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(texto)) {
    partes = texto.split("/").map(Number);
    let [dia, mes, anio] = partes;
    if (anio < 100) anio += 2000;
    const [h = 0, m = 0, seg = 0] = String(hora).split(":").map(Number);
    return new Date(anio, mes - 1, dia, h, m, seg);
  }
  const fecha = new Date(`${texto} ${hora}`.trim());
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function inicioDelDia(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function accionNormalizada(accion = "") {
  return normalizarTexto(accion).replace(/[^a-z]/g, "");
}

function obtenerHistorialFiltrado() {
  const usuario = $("adminHistorialUsuario")?.value || "";
  const accion = $("adminHistorialAccion")?.value || "";
  const busqueda = normalizarTexto($("adminHistorialBuscar")?.value || "");
  const ahora = new Date();
  const hoy = inicioDelDia(ahora);

  return historialVencimientos.filter(item => {
    const fecha = fechaHistorialAFecha(item.fecha, item.hora);
    if (historialPeriodo !== "todo") {
      if (!fecha) return false;
      const inicio = new Date(hoy);
      const dias = historialPeriodo === "hoy" ? 0 : Number(historialPeriodo) - 1;
      inicio.setDate(inicio.getDate() - dias);
      if (fecha < inicio || fecha > ahora) return false;
    }
    const claveUsuario = item.usuario || item.nombre || "";
    if (usuario && claveUsuario !== usuario) return false;
    if (accion && accionNormalizada(item.accion) !== accion) return false;
    if (busqueda) {
      const contenido = normalizarTexto(`${item.articulo || ""} ${item.codigo || ""}`);
      const terminos = busqueda.split(/\s+/).filter(Boolean);
      if (!terminos.every(termino => contenido.includes(termino))) return false;
    }
    return true;
  });
}

function actualizarUsuariosHistorial() {
  const select = $("adminHistorialUsuario");
  if (!select) return;
  const actual = select.value;
  const mapa = new Map();
  historialVencimientos.forEach(item => {
    const clave = item.usuario || item.nombre || "";
    if (clave) mapa.set(clave, item.nombre || item.usuario || clave);
  });
  const opciones = [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  select.innerHTML = '<option value="">Todos</option>' + opciones.map(([valor, etiqueta]) =>
    `<option value="${escaparHtml(valor)}">${escaparHtml(etiqueta)}</option>`
  ).join("");
  if ([...select.options].some(opcion => opcion.value === actual)) select.value = actual;
}

function renderResumenHistorial(items) {
  const cont = $("adminHistorialResumen");
  if (!cont) return;
  if (!items.length) {
    cont.innerHTML = "";
    return;
  }
  const usuarios = new Map();
  items.forEach(item => {
    const nombre = item.nombre || item.usuario || "Sin usuario";
    usuarios.set(nombre, (usuarios.get(nombre) || 0) + 1);
  });
  const detalle = [...usuarios.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, 6)
    .map(([nombre, cantidad]) => `<span><strong>${escaparHtml(nombre)}</strong> ${cantidad}</span>`)
    .join("");
  cont.innerHTML = `<div><strong>${items.length}</strong><span>${items.length === 1 ? "movimiento" : "movimientos"}</span></div><div class="admin-history-summary-users">${detalle}</div>`;
}

function renderHistorialVencimientos() {
  const cont = $("adminHistorialLista");
  const botonMas = $("btnAdminHistorialMas");
  if (!cont) return;
  const filtrados = obtenerHistorialFiltrado();
  renderResumenHistorial(filtrados);
  if (!filtrados.length) {
    cont.innerHTML = '<div class="empty-state">No hay movimientos que coincidan con los filtros.</div>';
    botonMas?.classList.add("oculto");
    return;
  }
  const visibles = filtrados.slice(0, historialLimite);
  cont.innerHTML = visibles.map((h, indice) => {
    const accion = escaparHtml(h.accion || "Movimiento");
    const articulo = escaparHtml(h.articulo || "Producto");
    const usuario = escaparHtml(h.nombre || h.usuario || "Sin usuario");
    const codigo = escaparHtml(h.codigo || "");
    const vencimiento = escaparHtml(h.vencimiento || "");
    const detalle = escaparHtml(h.detalle || "");
    const claseAccion = accionNormalizada(h.accion);
    return `<article class="admin-history-card accion-${claseAccion}" data-history-index="${indice}">
      <button type="button" class="admin-history-toggle" aria-expanded="false">
        <span class="admin-history-action">${accion}</span>
        <span class="admin-history-main"><strong>${articulo}</strong><small>${escaparHtml(h.fecha || "")} ${escaparHtml(h.hora || "")} · ${usuario}</small></span>
        <span class="admin-history-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="admin-history-detail oculto">
        ${codigo ? `<p><b>Código:</b> ${codigo}</p>` : ""}
        ${vencimiento ? `<p><b>Vencimiento:</b> ${vencimiento}</p>` : ""}
        ${detalle ? `<p><b>Detalle:</b> ${detalle}</p>` : ""}
      </div>
    </article>`;
  }).join("");
  cont.querySelectorAll(".admin-history-toggle").forEach(boton => boton.addEventListener("click", () => {
    const tarjeta = boton.closest(".admin-history-card");
    const detalle = tarjeta?.querySelector(".admin-history-detail");
    const abrir = detalle?.classList.contains("oculto");
    detalle?.classList.toggle("oculto", !abrir);
    boton.setAttribute("aria-expanded", abrir ? "true" : "false");
    tarjeta?.classList.toggle("abierta", Boolean(abrir));
  }));
  botonMas?.classList.toggle("oculto", filtrados.length <= historialLimite);
}

function reiniciarPaginacionHistorial() {
  historialLimite = 20;
  renderHistorialVencimientos();
}

async function cargarHistorialVencimientos() {
  const data = await api("/admin/historial-vencimientos");
  historialVencimientos = data.historial || [];
  actualizarUsuariosHistorial();
  reiniciarPaginacionHistorial();
}

async function cargarTodo() {
  $("adminServidorEstado").textContent = "Consultando servidor…";
  try { await Promise.all([cargarResumen(), cargarUsuarios(), cargarHistorialVencimientos()]); }
  catch(e) { $("adminServidorEstado").textContent = e.message; mensaje(e.message, "error"); }
}

function cambiarTab(tab) {
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.toggle("activo", b.dataset.adminTab === tab));
  document.querySelectorAll(".admin-tab-panel").forEach(p => p.classList.toggle("oculto", p.id !== `adminTab-${tab}`));
}



function abrirAdmin() {
  if (window.AutoservicioAuth?.esAdmin()) mostrarPanel();
  else ocultarPanelAdmin();
}


function normalizarEncabezadoImportacion(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function detectarColumnasImportacion(filas) {
  const alias = {
    codigo: ["codigo", "codigo de barras", "cod barra", "cod barras", "ean", "barcode"],
    articulo: ["articulo", "descripcion", "producto", "nombre articulo"],
    stock: ["stock", "existencia", "cantidad"],
    precio: ["precio", "precio venta", "precio de venta", "p venta", "importe", "venta"],
    subtotal: ["sub total", "subtotal", "total valuado", "valor total"]
  };
  for (let r=0; r<Math.min(filas.length,50); r++) {
    const normalizados=(filas[r]||[]).map(normalizarEncabezadoImportacion);
    const buscar = lista => normalizados.findIndex(v => lista.some(a => v===a || v.includes(a)));
    const encontrados = {
      codigo: buscar(alias.codigo), articulo: buscar(alias.articulo), stock: buscar(alias.stock),
      precio: buscar(alias.precio), subtotal: buscar(alias.subtotal)
    };
    if (encontrados.codigo < 0 || encontrados.articulo < 0) continue;
    const posiciones = Object.entries(encontrados).filter(([,i]) => i >= 0).sort((a,b) => a[1]-b[1]);
    const rangos = {};
    posiciones.forEach(([nombre, inicio], indice) => {
      rangos[nombre] = { inicio, fin: indice + 1 < posiciones.length ? posiciones[indice+1][1] : normalizados.length };
    });
    return { fila:r, rangos, formatoValuado: encontrados.precio >= 0 && encontrados.subtotal >= 0 };
  }
  return null;
}

function leerCampoImportacion(fila, rango) {
  if (!rango) return "";
  for (let i=rango.inicio; i<rango.fin; i++) {
    const valor=fila?.[i];
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") return valor;
  }
  return "";
}

function limpiarCodigoImportacion(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number") return Number.isSafeInteger(valor) ? String(valor) : String(valor).replace(/\.0+$/, "");
  const texto=String(valor).trim();
  if (/^\d+(\.0+)?$/.test(texto)) return texto.replace(/\.0+$/, "");
  return texto;
}

function parsearPrecioImportacion(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let texto=String(valor).trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!texto) return null;
  if (texto.includes(",") && texto.includes(".")) texto = texto.lastIndexOf(",") > texto.lastIndexOf(".") ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  else if (texto.includes(",")) texto=texto.replace(/\./g, "").replace(",", ".");
  const n=Number(texto); return Number.isFinite(n) && n>=0 ? n : null;
}

function abrirVistaPreviaImportacion(resumen, archivoNombre) {
  importacionResumenPendiente = resumen;
  $("adminImportarPreviewArchivo").textContent = archivoNombre;
  $("adminImportarPreviewProcesados").textContent = resumen.procesados ?? 0;
  $("adminImportarPreviewNuevos").textContent = resumen.nuevos ?? 0;
  $("adminImportarPreviewNombres").textContent = resumen.nombresActualizados ?? 0;
  $("adminImportarPreviewPrecios").textContent = resumen.preciosActualizados ?? 0;
  $("adminImportarPreviewSinCambios").textContent = resumen.sinCambios ?? 0;
  $("adminImportarPreviewTotal").textContent = resumen.totalCatalogo ?? 0;

  const advertencias = [];
  if (resumen.duplicadosArchivo) advertencias.push(`${resumen.duplicadosArchivo} código(s) duplicado(s) dentro del archivo`);
  if (resumen.sinCodigo) advertencias.push(`${resumen.sinCodigo} fila(s) sin código`);
  if (resumen.sinArticulo) advertencias.push(`${resumen.sinArticulo} fila(s) sin artículo`);
  if (resumen.codigosInvalidos) advertencias.push(`${resumen.codigosInvalidos} código(s) inválido(s)`);
  if (resumen.preciosInvalidos) advertencias.push(`${resumen.preciosInvalidos} precio(s) inválido(s), que no serán actualizados`);
  if (resumen.duplicadosCatalogo) advertencias.push(`${resumen.duplicadosCatalogo} código(s) ya duplicado(s) en Productos; no se crearán duplicados nuevos`);

  const cajaAdvertencias = $("adminImportarPreviewAdvertencias");
  if (cajaAdvertencias) {
    cajaAdvertencias.innerHTML = advertencias.length
      ? `<strong>Revisar:</strong><ul>${advertencias.map(texto => `<li>${escaparHtml(texto)}</li>`).join("")}</ul>`
      : "<strong>Archivo correcto:</strong> no se detectaron filas problemáticas.";
    cajaAdvertencias.classList.toggle("sin-advertencias", advertencias.length === 0);
  }

  const modal=$("adminImportarPreviewModal");
  modal?.classList.remove("oculto"); modal?.setAttribute("aria-hidden","false");
}

function cerrarVistaPreviaImportacion() {
  const modal=$("adminImportarPreviewModal");
  modal?.classList.add("oculto"); modal?.setAttribute("aria-hidden","true");
}

function extraerProductosImportacion(filas, columnas) {
  const mapa=new Map();
  const estadisticas={
    filasVacias:0,
    sinCodigo:0,
    sinArticulo:0,
    codigosInvalidos:0,
    preciosInvalidos:0,
    duplicadosArchivo:0,
    filasIgnoradas:0
  };

  for (let i=columnas.fila+1;i<filas.length;i++) {
    const fila=filas[i]||[];
    const tieneDatos=fila.some(valor => valor !== null && valor !== undefined && String(valor).trim() !== "");
    if (!tieneDatos) { estadisticas.filasVacias++; continue; }

    const codigo=limpiarCodigoImportacion(leerCampoImportacion(fila,columnas.rangos.codigo));
    const articulo=String(leerCampoImportacion(fila,columnas.rangos.articulo)??"").trim();
    const precioOriginal=columnas.rangos.precio ? leerCampoImportacion(fila,columnas.rangos.precio) : "";
    const precio=columnas.rangos.precio ? parsearPrecioImportacion(precioOriginal) : null;

    if (!codigo) { estadisticas.sinCodigo++; estadisticas.filasIgnoradas++; continue; }
    if (!articulo) { estadisticas.sinArticulo++; estadisticas.filasIgnoradas++; continue; }
    if (!/^\d{4,}$/.test(codigo)) { estadisticas.codigosInvalidos++; estadisticas.filasIgnoradas++; continue; }
    if (columnas.rangos.precio && String(precioOriginal ?? "").trim() !== "" && precio === null) estadisticas.preciosInvalidos++;
    if (mapa.has(codigo)) estadisticas.duplicadosArchivo++;

    // Ante códigos repetidos en el archivo se conserva la última aparición,
    // que normalmente corresponde al dato más actualizado de la exportación.
    mapa.set(codigo,{codigo,articulo,precio});
  }
  return { productos:[...mapa.values()], ...estadisticas };
}

async function importarArchivoCatalogo(archivo) {
  if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel");
  const estado=$("adminImportarEstado");
  estado.textContent="Leyendo archivo…";
  const datos=await archivo.arrayBuffer();
  const libro=window.XLSX.read(datos,{type:"array",raw:true});
  let filas=[], columnas=null, hojaNombre="";
  for (const nombre of libro.SheetNames) {
    // raw:false conserva códigos con ceros iniciales cuando el XLS trae formato numérico.
    const actuales=window.XLSX.utils.sheet_to_json(libro.Sheets[nombre],{header:1,defval:"",raw:false});
    const detectadas=detectarColumnasImportacion(actuales);
    if (detectadas) { filas=actuales; columnas=detectadas; hojaNombre=nombre; break; }
  }
  if (!columnas) throw new Error("No encontré las columnas Código y Artículo en el archivo");
  const extraidos=extraerProductosImportacion(filas,columnas);
  if (!extraidos.productos.length) throw new Error("No encontré productos válidos para importar");
  importacionPendiente={productos:extraidos.productos, archivoNombre:archivo.name, hojaNombre, estadisticas:extraidos};
  estado.textContent=`Analizando ${extraidos.productos.length} productos…`;
  const data=await api("/admin/importar-productos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productos:extraidos.productos,confirmar:false})});
  const resumen={...(data.resumen||{}),...extraidos};
  // El array solo se conserva en importacionPendiente, no dentro del resumen visual.
  delete resumen.productos;
  importacionResumenPendiente=resumen;
  estado.textContent="Vista previa lista. Confirmá para guardar los cambios.";
  abrirVistaPreviaImportacion(resumen,archivo.name);
}

function construirResumenImportacionFinal(r) {
  const advertencias = [];
  if (r.duplicadosArchivo) advertencias.push(`${r.duplicadosArchivo} duplicado(s) en el archivo`);
  if (r.filasIgnoradas) advertencias.push(`${r.filasIgnoradas} fila(s) ignorada(s)`);
  if (r.preciosInvalidos) advertencias.push(`${r.preciosInvalidos} precio(s) inválido(s)`);
  const detalleAdvertencias = advertencias.length ? `<br><span>Advertencias: ${advertencias.join(" · ")}.</span>` : "";
  return `<strong>Catálogo actualizado</strong><span>Productos nuevos: ${r.nuevos||0} · Nombres actualizados: ${r.nombresActualizados||0} · Precios actualizados: ${r.preciosActualizados||0} · Sin cambios: ${r.sinCambios||0}.</span><span>Total catálogo: ${r.totalCatalogo||0} productos.</span>${detalleAdvertencias}<span>La hoja Stock no fue modificada.</span>`;
}

async function confirmarImportacionCatalogo() {
  if (!importacionPendiente) return;
  const boton=$("btnAdminConfirmarImportacion");
  const estado=$("adminImportarEstado");
  boton.disabled=true; boton.textContent="Importando…";
  try {
    const data=await api("/admin/importar-productos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productos:importacionPendiente.productos,confirmar:true})});
    const r={...(data.resumen||{}),...(importacionPendiente.estadisticas||{})};
    delete r.productos;
    cerrarVistaPreviaImportacion();
    estado.innerHTML=construirResumenImportacionFinal(r);
    importacionPendiente=null; importacionResumenPendiente=null;
    mensaje("Catálogo actualizado", "ok");
    await cargarResumen();
  } finally {
    boton.disabled=false; boton.textContent="Importar y guardar";
  }
}


document.addEventListener("DOMContentLoaded", () => {
  $("btnAbrirAdminHome")?.addEventListener("click", abrirAdmin);
  $("btnAdminActualizar")?.addEventListener("click", cargarTodo);
  $("btnAdminNuevoUsuario")?.addEventListener("click", abrirNuevoUsuario);
  $("btnAdminCerrarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminCancelarUsuario")?.addEventListener("click", cerrarUsuarioModal);
  $("btnAdminGuardarUsuario")?.addEventListener("click", guardarUsuario);
  document.querySelectorAll(".admin-tab").forEach(btn => btn.addEventListener("click", () => cambiarTab(btn.dataset.adminTab)));
  document.querySelectorAll(".admin-period-btn").forEach(btn => btn.addEventListener("click", () => {
    historialPeriodo = btn.dataset.periodo || "hoy";
    document.querySelectorAll(".admin-period-btn").forEach(item => item.classList.toggle("activo", item === btn));
    reiniciarPaginacionHistorial();
  }));
  $("adminHistorialUsuario")?.addEventListener("change", reiniciarPaginacionHistorial);
  $("adminHistorialAccion")?.addEventListener("change", reiniciarPaginacionHistorial);
  $("adminHistorialBuscar")?.addEventListener("input", () => {
    clearTimeout(historialBusquedaTimer);
    historialBusquedaTimer = setTimeout(reiniciarPaginacionHistorial, 180);
  });
  $("btnAdminImportarArchivo")?.addEventListener("click", () => $("adminImportarArchivo")?.click());
  $("adminImportarArchivo")?.addEventListener("change", async event => {
    const archivo=event.target.files?.[0];
    if (!archivo) return;
    try { await importarArchivoCatalogo(archivo); }
    catch(error) { $("adminImportarEstado").textContent=error.message; mensaje(error.message,"error"); importacionPendiente=null; }
    finally { event.target.value=""; }
  });
  $("btnAdminCancelarImportacion")?.addEventListener("click", () => { cerrarVistaPreviaImportacion(); importacionPendiente=null; importacionResumenPendiente=null; $("adminImportarEstado").textContent="Importación cancelada. No se modificó ningún dato."; });
  $("btnAdminCerrarImportacion")?.addEventListener("click", () => { cerrarVistaPreviaImportacion(); importacionPendiente=null; importacionResumenPendiente=null; });
  $("btnAdminConfirmarImportacion")?.addEventListener("click", async () => { try { await confirmarImportacionCatalogo(); } catch(error) { mensaje(error.message,"error"); $("adminImportarEstado").textContent=error.message; } });
  $("btnAdminHistorialMas")?.addEventListener("click", () => {
    historialLimite += 20;
    renderHistorialVencimientos();
  });
  ocultarPanelAdmin();
  window.addEventListener("autoservicio:sesion", (event) => {
    if (event.detail?.rol !== "administrador") ocultarPanelAdmin();
  });
});
