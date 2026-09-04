const sharp = require("sharp");
const {
  obtenerProductoCatalogoAdminDb,
  guardarResultadoImagenCatalogoDb,
  obtenerImagenCatalogoDb,
  listarPendientesImagenCatalogoDb,
} = require("./db-catalogo-publico");

const OFF_TIMEOUT_MS = 6500;
const BRAVE_TIMEOUT_MS = 7000;
const IMAGEN_TIMEOUT_MS = 8000;
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024;
const MAX_LOTE = 60;
const CONCURRENCIA = 3;
const LADO_CATALOGO = 600;
const FONDO_BLANCO_MINIMO = 0.88;

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

async function fetchJson(url, timeoutMs, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "AutoservicioVictorCatalogo/1.0 (product-image-matching)",
        ...extraHeaders,
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

async function descargarImagen(url, timeoutMs = IMAGEN_TIMEOUT_MS) {
  const segura = urlHttps(url);
  if (!segura) throw new Error("URL de imagen inválida");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(segura, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "AutoservicioVictorCatalogo/1.0 (image-quality-check)",
      },
    });
    if (!r.ok) throw new Error(`La imagen respondió HTTP ${r.status}`);
    const tipo = String(r.headers.get("content-type") || "").toLowerCase();
    if (!tipo.startsWith("image/")) throw new Error("El recurso encontrado no es una imagen");
    const largo = Number(r.headers.get("content-length") || 0);
    if (largo > MAX_IMAGEN_BYTES) throw new Error("La imagen supera el tamaño permitido");
    const data = Buffer.from(await r.arrayBuffer());
    if (!data.length || data.length > MAX_IMAGEN_BYTES) throw new Error("La imagen está vacía o es demasiado grande");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function porcentajeBlancoEnBorde(raw, width, height, channels) {
  let total = 0;
  let blancos = 0;
  const espesor = Math.max(2, Math.round(Math.min(width, height) * 0.08));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const borde = x < espesor || y < espesor || x >= width - espesor || y >= height - espesor;
      if (!borde) continue;
      const i = (y * width + x) * channels;
      const r = raw[i] ?? 255;
      const g = raw[i + 1] ?? r;
      const b = raw[i + 2] ?? r;
      total += 1;
      if (r >= 238 && g >= 238 && b >= 238) blancos += 1;
    }
  }
  return total ? blancos / total : 0;
}

function cajaProducto(raw, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let pixeles = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = raw[i] ?? 255;
      const g = raw[i + 1] ?? r;
      const b = raw[i + 2] ?? r;
      if (r < 242 || g < 242 || b < 242) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixeles += 1;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    ancho: maxX - minX + 1,
    alto: maxY - minY + 1,
    ocupacion: pixeles / (width * height),
  };
}

async function analizarCalidadImagen(buffer) {
  try {
    const base = sharp(buffer, { failOn: "none" }).rotate();
    const meta = await base.metadata();
    const width = Number(meta.width) || 0;
    const height = Number(meta.height) || 0;
    if (width < 400 || height < 400) {
      return { acepta: false, motivo: "resolución menor a 400×400", width, height, score: 0 };
    }

    const { data, info } = await base.clone().resize(128, 128, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const blancoBorde = porcentajeBlancoEnBorde(data, info.width, info.height, info.channels);
    const caja = cajaProducto(data, info.width, info.height, info.channels);
    if (!caja) return { acepta: false, motivo: "no se detectó el producto", width, height, score: 0 };

    const anchoRel = caja.ancho / info.width;
    const altoRel = caja.alto / info.height;
    const tocaBorde = caja.minX <= 1 || caja.minY <= 1 || caja.maxX >= info.width - 2 || caja.maxY >= info.height - 2;

    if (blancoBorde < FONDO_BLANCO_MINIMO) {
      return { acepta: false, motivo: "el fondo no es suficientemente blanco", width, height, blancoBorde, score: Math.round(blancoBorde * 100) };
    }
    if (tocaBorde || anchoRel > 0.96 || altoRel > 0.96) {
      return { acepta: false, motivo: "el producto está recortado o toca los bordes", width, height, blancoBorde, score: 55 };
    }
    if (anchoRel < 0.16 || altoRel < 0.34 || caja.ocupacion < 0.035) {
      return { acepta: false, motivo: "el producto aparece demasiado pequeño", width, height, blancoBorde, score: 55 };
    }

    const score = Math.min(99, Math.max(70, Math.round(blancoBorde * 80 + Math.min(0.19, caja.ocupacion) * 100)));
    return { acepta: true, motivo: "fondo blanco y escala apta", width, height, blancoBorde, score, caja };
  } catch (error) {
    return { acepta: false, motivo: `imagen no procesable: ${error?.message || "formato inválido"}`, score: 0 };
  }
}

async function normalizarImagenCatalogo(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 12 })
    .resize(LADO_CATALOGO - 96, LADO_CATALOGO - 96, { fit: "inside", withoutEnlargement: true })
    .extend({ top: 48, bottom: 48, left: 48, right: 48, background: "#ffffff" })
    .resize(LADO_CATALOGO, LADO_CATALOGO, { fit: "contain", background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function validarCandidato(candidato) {
  if (!candidato?.url) return null;
  const urls = [...new Set([candidato.url, candidato.fallbackUrl].map(urlHttps).filter(Boolean))];
  for (const url of urls) {
    try {
      const buffer = await descargarImagen(url);
      const calidad = await analizarCalidadImagen(buffer);
      if (!calidad.acepta) continue;
      const normalizada = await normalizarImagenCatalogo(buffer);
      return {
        ...candidato,
        url,
        puntaje: Math.max(Number(candidato.puntaje) || 0, calidad.score || 0),
        calidadVerificada: true,
        calidad,
        normalizada,
        mime: "image/jpeg",
      };
    } catch {
      // Si el sitio original bloquea la descarga, intentamos la miniatura proxy de Brave.
    }
  }
  return null;
}

function candidatosOpenFacts(data, fuente) {
  if (!data || Number(data.status) !== 1 || !data.product) return [];
  const p = data.product || {};
  const urls = [p.image_front_url, p.image_url, p.image_front_small_url]
    .map(urlHttps)
    .filter(Boolean);
  return [...new Set(urls)].map((imagen) => ({
    url: imagen,
    fuente,
    titulo: String(p.product_name || "").trim().slice(0, 220),
    marca: String(p.brands || "").trim().slice(0, 160),
    presentacion: String(p.quantity || "").trim().slice(0, 120),
    puntaje: 82,
    exacta: true,
    calidadVerificada: false,
  }));
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
    for (const candidato of candidatosOpenFacts(data, fuente)) {
      const valido = await validarCandidato(candidato);
      if (valido) return valido;
    }
  }
  return null;
}

async function buscarBrave(producto) {
  const apiKey = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
  if (!apiKey) return null;

  const descripcion = [producto.marca, producto.nombre, producto.presentacion].filter(Boolean).join(" ").trim();
  if (!descripcion) return null;

  const consulta = [
    codigoEAN(producto.codigo),
    descripcion,
    "producto fondo blanco solo producto packshot envase",
  ].filter(Boolean).join(" ").trim();

  const params = new URLSearchParams({
    q: consulta.slice(0, 380),
    country: "AR",
    search_lang: "es",
    safesearch: "strict",
    count: "30",
    spellcheck: "true",
  });

  const data = await fetchJson(
    `https://api.search.brave.com/res/v1/images/search?${params}`,
    BRAVE_TIMEOUT_MS,
    { "X-Subscription-Token": apiKey }
  );

  const items = Array.isArray(data?.results) ? data.results : [];
  const candidatos = items.map((item) => {
    const imagen = urlHttps(item?.properties?.url);
    const miniatura = urlHttps(item?.thumbnail?.src);
    if (!imagen && !miniatura) return null;

    const w = Number(item?.properties?.width) || Number(item?.thumbnail?.width) || 0;
    const h = Number(item?.properties?.height) || Number(item?.thumbnail?.height) || 0;
    if (w && h && (w < 400 || h < 400)) return null;

    const ratio = w && h ? w / h : 1;
    if (ratio < 0.42 || ratio > 2.35) return null;

    const confianza = String(item?.confidence || "").toLowerCase();
    const bonusConfianza = confianza === "high" ? 8 : confianza === "medium" ? 4 : 0;
    const cercaniaCuadrado = 1 - Math.min(1, Math.abs(1 - ratio));
    const dominio = String(item?.source || item?.meta_url?.hostname || "web").trim();

    return {
      url: imagen || miniatura,
      fallbackUrl: imagen && miniatura && miniatura !== imagen ? miniatura : "",
      fuente: `Brave Search · ${dominio}`.slice(0, 220),
      titulo: String(item?.title || descripcion).trim().slice(0, 220),
      marca: producto.marca || "",
      presentacion: producto.presentacion || "",
      puntaje: 70 + bonusConfianza + Math.round(cercaniaCuadrado * 7),
      exacta: false,
      calidadVerificada: false,
    };
  }).filter(Boolean);

  // Limitamos las descargas de candidatos: la búsqueda puede devolver hasta 30,
  // pero validar demasiadas imágenes hace innecesariamente lenta cada operación.
  for (const candidato of candidatos.slice(0, 12)) {
    const valido = await validarCandidato(candidato);
    if (valido) return valido;
  }
  return null;
}

async function buscarImagenProducto(codigo, { guardar = true } = {}) {
  const producto = await obtenerProductoCatalogoAdminDb(codigo);
  if (!producto) throw new Error("Producto no encontrado");

  // Prioridad 1: coincidencia exacta por EAN en bases de productos.
  // Prioridad 2: búsqueda comercial por nombre/marca/presentación con Brave Search.
  let candidato = await buscarPorEAN(producto.codigo);
  if (!candidato) candidato = await buscarBrave(producto);

  if (!guardar) return { producto, candidato };

  if (candidato) {
    await guardarResultadoImagenCatalogoDb(producto.codigo, {
      estado: "revisar",
      candidatoUrl: candidato.url,
      candidatoFuente: candidato.fuente,
      candidatoTitulo: candidato.titulo,
      candidatoPuntaje: candidato.puntaje,
      candidatoData: candidato.normalizada,
      candidatoMime: candidato.mime || "image/jpeg",
      error: "",
    });
    return {
      encontrado: true,
      confirmado: false,
      candidato,
      producto: await obtenerProductoCatalogoAdminDb(producto.codigo),
    };
  }

  const braveConfigurado = Boolean(String(process.env.BRAVE_SEARCH_API_KEY || "").trim());
  const error = braveConfigurado
    ? "No se encontró una imagen que cumpla fondo blanco, producto completo y buena resolución. Podés pegar una URL manual o volver a intentar más adelante."
    : "No se encontró una imagen válida por EAN. Para ampliar la búsqueda por nombre, marca y presentación configurá BRAVE_SEARCH_API_KEY en Render.";
  await guardarResultadoImagenCatalogoDb(producto.codigo, {
    estado: "sin_imagen",
    candidatoUrl: "",
    candidatoFuente: "",
    candidatoTitulo: "",
    candidatoPuntaje: 0,
    candidatoData: null,
    candidatoMime: "",
    error,
  });
  return { encontrado: false, confirmado: false, candidato: null, mensaje: error, requiereConfiguracion: !braveConfigurado, producto: await obtenerProductoCatalogoAdminDb(producto.codigo) };
}

async function obtenerImagenNormalizadaProducto(codigo, tipo = "candidato") {
  const guardada = await obtenerImagenCatalogoDb(codigo, tipo);
  if (guardada?.data) return { buffer: guardada.data, mime: guardada.mime || "image/jpeg" };

  // Compatibilidad con imágenes guardadas antes de esta corrección: se importan una sola vez.
  const producto = await obtenerProductoCatalogoAdminDb(codigo);
  if (!producto) throw new Error("Producto no encontrado");
  const esCandidato = tipo === "candidato";
  const url = esCandidato ? (producto.candidatoImagen || producto.imagen) : producto.imagen;
  if (!url) throw new Error("El producto no tiene una imagen descargada disponible");
  const original = await descargarImagen(url);
  const calidad = await analizarCalidadImagen(original);
  if (!calidad.acepta) throw new Error(`La imagen guardada fue rechazada: ${calidad.motivo}`);
  const normalizada = await normalizarImagenCatalogo(original);
  if (esCandidato) {
    await guardarResultadoImagenCatalogoDb(codigo, { candidatoData: normalizada, candidatoMime: "image/jpeg", error: "" });
  } else {
    await guardarResultadoImagenCatalogoDb(codigo, { imagenData: normalizada, imagenMime: "image/jpeg", error: "" });
  }
  return { buffer: normalizada, mime: "image/jpeg" };
}

async function importarImagenManual(codigo, url) {
  const producto = await obtenerProductoCatalogoAdminDb(codigo);
  if (!producto) throw new Error("Producto no encontrado");
  const buffer = await descargarImagen(url);
  const calidad = await analizarCalidadImagen(buffer);
  if (!calidad.acepta) {
    const error = new Error(`La imagen fue rechazada: ${calidad.motivo}`);
    error.status = 422;
    throw error;
  }
  const normalizada = await normalizarImagenCatalogo(buffer);
  await guardarResultadoImagenCatalogoDb(producto.codigo, {
    imagen: String(url || "").trim(),
    fuente: "Manual · descargada y normalizada",
    estado: "confirmada",
    imagenData: normalizada,
    imagenMime: "image/jpeg",
    candidatoUrl: "",
    candidatoFuente: "",
    candidatoTitulo: "",
    candidatoPuntaje: 0,
    candidatoData: null,
    candidatoMime: "",
    error: "",
  });
  return obtenerProductoCatalogoAdminDb(producto.codigo);
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
  obtenerImagenNormalizadaProducto,
  importarImagenManual,
  analizarCalidadImagen,
};
