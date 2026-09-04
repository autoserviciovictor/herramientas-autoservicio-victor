const {
  obtenerProductoCatalogoAdminDb,
  guardarResultadoImagenCatalogoDb,
  listarPendientesImagenCatalogoDb,
} = require("./db-catalogo-publico");

const OFF_TIMEOUT_MS = 6500;
const GOOGLE_TIMEOUT_MS = 7000;
const MAX_LOTE = 60;
const CONCURRENCIA = 3;

function codigoEAN(valor = "") {
  const limpio = String(valor || "").replace(/\D/g, "");
  return limpio.length >= 8 && limpio.length <= 14 ? limpio : "";
}

function urlHttps(valor = "") {
  try {
    const u = new URL(String(valor || "").trim());
    if (u.protocol !== "https:") return "";
    return u.href.slice(0, 1200);
  } catch {
    return "";
  }
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "AutoservicioVictorCatalogo/1.0 (product-image-matching)",
      },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function candidatoOpenFacts(data, fuente) {
  if (!data || Number(data.status) !== 1 || !data.product) return null;
  const p = data.product || {};
  const imagen = urlHttps(p.image_front_url || p.image_url || p.image_front_small_url);
  if (!imagen) return null;
  return {
    url: imagen,
    fuente,
    titulo: String(p.product_name || "").trim().slice(0, 220),
    marca: String(p.brands || "").trim().slice(0, 160),
    presentacion: String(p.quantity || "").trim().slice(0, 120),
    puntaje: 82,
    exacta: true,
    calidadVerificada: false,
  };
}

async function buscarPorEAN(codigo) {
  const ean = codigoEAN(codigo);
  if (!ean) return null;
  const fields = "code,product_name,brands,quantity,image_front_url,image_url,image_front_small_url";
  const urls = [
    [`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}`, "Open Food Facts"],
    [`https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}`, "Open Products Facts"],
  ];
  for (const [url, fuente] of urls) {
    const data = await fetchJson(url, OFF_TIMEOUT_MS);
    const candidato = candidatoOpenFacts(data, fuente);
    if (candidato) return candidato;
  }
  return null;
}

async function buscarGoogle(producto) {
  const apiKey = String(process.env.GOOGLE_CSE_API_KEY || "").trim();
  const cx = String(process.env.GOOGLE_CSE_CX || "").trim();
  if (!apiKey || !cx) return null;
  const consulta = [producto.marca, producto.nombre, producto.presentacion].filter(Boolean).join(" ").trim();
  if (!consulta) return null;
  const consultaCalidad = [producto.codigo, consulta, 'producto fondo blanco solo producto packshot'].filter(Boolean).join(" ").trim();
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    searchType: "image",
    safe: "active",
    num: "5",
    imgType: "photo",
    imgSize: "large",
    q: consultaCalidad.slice(0, 220),
  });
  const data = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`, GOOGLE_TIMEOUT_MS);
  const items = Array.isArray(data?.items) ? data.items : [];
  const candidatos = items.map((item) => {
    const imagen = urlHttps(item?.link);
    const w = Number(item?.image?.width) || 0;
    const h = Number(item?.image?.height) || 0;
    if (!imagen || w < 400 || h < 400) return null;
    const ratio = w / h;
    if (ratio < 0.45 || ratio > 2.2) return null;
    const cercaniaCuadrado = 1 - Math.min(1, Math.abs(1 - ratio));
    return { item, imagen, w, h, score: 70 + Math.round(cercaniaCuadrado * 8) };
  }).filter(Boolean).sort((a,b) => b.score - a.score);
  const mejor = candidatos[0];
  if (!mejor) return null;
  return {
    url: mejor.imagen,
    fuente: "Google Programmable Search · fondo blanco",
    titulo: String(mejor.item?.title || consulta).slice(0, 220),
    marca: producto.marca || "",
    presentacion: producto.presentacion || "",
    puntaje: mejor.score,
    exacta: false,
    calidadVerificada: false,
  };
}

async function buscarImagenProducto(codigo, { guardar = true } = {}) {
  const producto = await obtenerProductoCatalogoAdminDb(codigo);
  if (!producto) throw new Error("Producto no encontrado");

  // Para calidad visual priorizamos una búsqueda comercial con fondo blanco.
  // El EAN sigue siendo la clave de identidad, pero una coincidencia exacta NO confirma la calidad de la foto.
  let candidato = await buscarGoogle(producto);
  if (!candidato) candidato = await buscarPorEAN(producto.codigo);

  if (!guardar) return { producto, candidato };

  if (candidato) {
    await guardarResultadoImagenCatalogoDb(producto.codigo, {
      // Toda imagen automática requiere revisión visual: fondo blanco, producto solo,
      // completo, centrado, nítido y con escala razonable. El EAN valida identidad, no calidad.
      estado: "revisar",
      candidatoUrl: candidato.url,
      candidatoFuente: candidato.fuente,
      candidatoTitulo: candidato.titulo,
      candidatoPuntaje: candidato.puntaje,
      error: "",
    });
    return { encontrado: true, confirmado: false, candidato, producto: await obtenerProductoCatalogoAdminDb(producto.codigo) };
  }

  await guardarResultadoImagenCatalogoDb(producto.codigo, {
    estado: "sin_imagen",
    candidatoUrl: "",
    candidatoFuente: "",
    candidatoTitulo: "",
    candidatoPuntaje: 0,
    error: "No se encontró una imagen automática",
  });
  return { encontrado: false, confirmado: false, candidato: null, producto: await obtenerProductoCatalogoAdminDb(producto.codigo) };
}

async function mapConcurrencia(items, concurrencia, fn) {
  const salida = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { salida[i] = await fn(items[i], i); }
      catch (error) { salida[i] = { error: error?.message || String(error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, items.length) }, worker));
  return salida;
}

async function buscarImagenesLote({ limite = 20 } = {}) {
  const cantidad = Math.max(1, Math.min(MAX_LOTE, Number(limite) || 20));
  const pendientes = await listarPendientesImagenCatalogoDb(cantidad);
  const resultados = await mapConcurrencia(pendientes, CONCURRENCIA, (p) => buscarImagenProducto(p.codigo));
  const resumen = { procesados: pendientes.length, confirmadas: 0, revisar: 0, sinImagen: 0, errores: 0 };
  for (const r of resultados) {
    if (r?.error) resumen.errores += 1;
    else if (r?.confirmado) resumen.confirmadas += 1;
    else if (r?.encontrado) resumen.revisar += 1;
    else resumen.sinImagen += 1;
  }
  return resumen;
}

module.exports = {
  buscarImagenProducto,
  buscarImagenesLote,
};
