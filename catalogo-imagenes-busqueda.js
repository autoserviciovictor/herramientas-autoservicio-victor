const crypto = require("crypto");

const OFF_TIMEOUT_MS = 6500;
const BRAVE_TIMEOUT_MS = 7000;
const SEARCHALICIOUS_TIMEOUT_MS = 7000;
const LEGACY_SEARCH_TIMEOUT_MS = 7000;
const WEB_SEARCH_TIMEOUT_MS = 8000;
const WEB_PAGE_TIMEOUT_MS = 8000;
const MAX_RESULTADOS_GRATUITOS_TEXTO = 12;
const MAX_RESULTADOS_WEB = 6;
const MAX_PAGINAS_WEB = 4;
const MAX_CANDIDATOS = 24;
const MAX_RESULTADOS_BRAVE = 30;

function codigoEAN(valor = "") {
  const limpio = String(valor || "").replace(/\D/g, "");
  return limpio.length >= 8 && limpio.length <= 14 ? limpio : "";
}

function esHostPrivado(hostname = "") {
  const host = String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;

  // Bloqueo conservador de IPv4 locales, privadas, loopback y link-local.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b, c, d] = m.slice(1).map(Number);
    if ([a, b, c, d].some((n) => n < 0 || n > 255)) return true;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  // Bloqueo de rangos IPv6 locales más comunes cuando vienen como literal.
  if (host.includes(":")) {
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) return true;
  }
  return false;
}

function urlHttps(valor = "", base = "") {
  try {
    const u = base ? new URL(String(valor || "").trim(), base) : new URL(String(valor || "").trim());
    if (u.protocol !== "https:" || !u.hostname || esHostPrivado(u.hostname)) return "";
    u.username = "";
    u.password = "";
    return u.href.slice(0, 1200);
  } catch {
    return "";
  }
}

function texto(valor = "", maximo = 220) {
  return String(valor || "").trim().replace(/\s+/g, " ").slice(0, maximo);
}

function dominioDeUrl(url = "") {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function idCandidato(candidato = {}) {
  const base = [candidato.proveedor, candidato.url, candidato.fallbackUrl].filter(Boolean).join("|");
  return crypto.createHash("sha1").update(base).digest("hex").slice(0, 16);
}

async function fetchJson(url, timeoutMs, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "AutoservicioVictorCatalogo/1.0 (product-image-discovery)",
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

async function fetchText(url, timeoutMs, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
        "User-Agent": "Mozilla/5.0 (compatible; AutoservicioVictorCatalogo/1.0; +https://autoserviciovictor.github.io)",
        ...extraHeaders,
      },
    });
    if (!r.ok) return null;
    const tipo = String(r.headers.get("content-type") || "").toLowerCase();
    if (tipo && !tipo.includes("text/html") && !tipo.includes("application/xhtml+xml")) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function palabrasSignificativas(valor = "") {
  const stop = new Set(["de","del","la","las","el","los","con","sin","x","por","para","un","una","gr","g","kg","ml","lt","l","cc"]);
  return texto(valor, 300).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").split(" ").filter((p) => p.length >= 3 && !stop.has(p));
}

function puntajeTexto(producto, titulo = "") {
  const objetivo = new Set(palabrasSignificativas([producto.marca, producto.nombre, producto.presentacion].filter(Boolean).join(" ")));
  if (!objetivo.size) return 0;
  const halladas = new Set(palabrasSignificativas(titulo));
  let coincidencias = 0;
  for (const p of objetivo) if (halladas.has(p)) coincidencias += 1;
  return Math.round((coincidencias / objetivo.size) * 18);
}

function normalizarCandidato(candidato, producto) {
  const url = urlHttps(candidato.url);
  const fallbackUrl = urlHttps(candidato.fallbackUrl);
  if (!url && !fallbackUrl) return null;
  const ancho = Math.max(0, Number(candidato.ancho) || 0);
  const alto = Math.max(0, Number(candidato.alto) || 0);
  if (ancho && alto && (ancho < 220 || alto < 220)) return null;
  const ratio = ancho && alto ? ancho / alto : 1;
  if (ratio < 0.28 || ratio > 3.5) return null;

  const exactaEAN = Boolean(candidato.exactaEAN);
  const base = Math.max(0, Number(candidato.puntajePreliminar) || 0);
  const textoBonus = puntajeTexto(producto, candidato.titulo);
  const resolucionBonus = ancho >= 800 && alto >= 800 ? 5 : ancho >= 500 && alto >= 500 ? 3 : 0;
  const ratioBonus = Math.max(0, Math.round((1 - Math.min(1, Math.abs(1 - ratio))) * 4));
  const puntajePreliminar = Math.min(100, Math.round(base + textoBonus + resolucionBonus + ratioBonus));

  const limpio = {
    id: "",
    url: url || fallbackUrl,
    fallbackUrl: url && fallbackUrl && fallbackUrl !== url ? fallbackUrl : "",
    proveedor: texto(candidato.proveedor, 50),
    fuente: texto(candidato.fuente, 180),
    dominio: texto(candidato.dominio || dominioDeUrl(url || fallbackUrl), 120),
    titulo: texto(candidato.titulo, 220),
    marca: texto(candidato.marca || producto.marca, 120),
    presentacion: texto(candidato.presentacion || producto.presentacion, 120),
    consulta: texto(candidato.consulta, 380),
    ancho,
    alto,
    exactaEAN,
    tipoCoincidencia: texto(candidato.tipoCoincidencia || (exactaEAN ? "ean_exacto" : "texto"), 50),
    puntajePreliminar,
  };
  limpio.id = idCandidato(limpio);
  return limpio;
}

function deduplicarYOrdenar(candidatos, producto) {
  const porUrl = new Map();
  for (const bruto of candidatos) {
    const c = normalizarCandidato(bruto, producto);
    if (!c) continue;
    const clave = c.url.toLowerCase();
    const previo = porUrl.get(clave);
    if (!previo || c.puntajePreliminar > previo.puntajePreliminar) porUrl.set(clave, c);
  }
  return [...porUrl.values()]
    .sort((a, b) => (Number(b.exactaEAN) - Number(a.exactaEAN)) || (b.puntajePreliminar - a.puntajePreliminar) || a.id.localeCompare(b.id))
    .slice(0, MAX_CANDIDATOS);
}

function candidatosOpenFacts(data, proveedor, fuente, consulta, producto) {
  if (!data || Number(data.status) !== 1 || !data.product) return [];
  const p = data.product || {};
  const urls = [p.image_front_url, p.image_url, p.image_front_small_url].map((v) => urlHttps(v)).filter(Boolean);
  return [...new Set(urls)].map((url, indice) => ({
    url,
    proveedor,
    fuente,
    titulo: texto(p.product_name || producto.nombre),
    marca: texto(p.brands || producto.marca, 120),
    presentacion: texto(p.quantity || producto.presentacion, 120),
    consulta,
    exactaEAN: true,
    tipoCoincidencia: "ean_exacto",
    puntajePreliminar: 78 - indice * 2,
  }));
}

async function buscarEnOpenFacts(producto) {
  const ean = codigoEAN(producto.codigo);
  if (!ean) return { candidatos: [], fuentes: [], consultas: [] };
  const fields = "code,product_name,brands,quantity,image_front_url,image_url,image_front_small_url";
  const fuentes = [
    { proveedor: "open_food_facts", fuente: "Open Food Facts", url: `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}` },
    { proveedor: "open_beauty_facts", fuente: "Open Beauty Facts", url: `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}` },
    { proveedor: "open_pet_food_facts", fuente: "Open Pet Food Facts", url: `https://world.openpetfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}` },
    { proveedor: "open_products_facts", fuente: "Open Products Facts", url: `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}` },
  ];
  const candidatos = [];
  const fuentesConResultado = [];
  for (const f of fuentes) {
    const data = await fetchJson(f.url, OFF_TIMEOUT_MS);
    const hallados = candidatosOpenFacts(data, f.proveedor, f.fuente, ean, producto);
    if (hallados.length) fuentesConResultado.push(f.fuente);
    candidatos.push(...hallados);
  }
  return { candidatos, fuentes: fuentesConResultado, consultas: [ean] };
}

function consultaTextoGratis(producto) {
  return texto([producto.marca, producto.nombre, producto.presentacion].filter(Boolean).join(" "), 300);
}

function productosDeRespuestaBusqueda(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.products)) return data.products;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.documents)) return data.documents;
  if (Array.isArray(data.hits)) return data.hits.map((h) => h?._source || h?.document || h).filter(Boolean);
  if (Array.isArray(data?.hits?.hits)) return data.hits.hits.map((h) => h?._source || h?.document || h).filter(Boolean);
  return [];
}

function candidatosBusquedaTexto(items, proveedor, fuente, consulta, producto, base = 54) {
  return items.flatMap((item, indice) => {
    const p = item?._source || item?.document || item || {};
    const urls = [p.image_front_url, p.image_url, p.image_front_small_url].map((v) => urlHttps(v)).filter(Boolean);
    return [...new Set(urls)].map((url, imageIndex) => ({
      url,
      proveedor,
      fuente,
      titulo: texto(p.product_name || p.product_name_es || p.product_name_en || producto.nombre),
      marca: texto(p.brands || producto.marca, 120),
      presentacion: texto(p.quantity || producto.presentacion, 120),
      consulta,
      exactaEAN: false,
      tipoCoincidencia: "texto_gratuito",
      puntajePreliminar: Math.max(38, base - Math.min(12, indice) - imageIndex * 2),
    }));
  });
}

async function buscarEnSearchALicious(producto) {
  const consulta = consultaTextoGratis(producto);
  if (!consulta) return { candidatos: [], fuentes: [], consultas: [] };
  const params = new URLSearchParams({
    q: consulta,
    langs: "es,en",
    page_size: String(MAX_RESULTADOS_GRATUITOS_TEXTO),
    page: "1",
  });
  const data = await fetchJson(`https://search.openfoodfacts.org/search?${params}`, SEARCHALICIOUS_TIMEOUT_MS);
  const items = productosDeRespuestaBusqueda(data);
  const candidatos = candidatosBusquedaTexto(items, "open_food_facts_search", "Open Food Facts · búsqueda gratuita", consulta, producto, 58);
  return {
    candidatos,
    fuentes: candidatos.length ? ["Open Food Facts · búsqueda gratuita"] : [],
    consultas: [consulta],
  };
}

async function buscarEnOpenFoodFactsLegacy(producto) {
  const consulta = consultaTextoGratis(producto);
  if (!consulta) return { candidatos: [], fuentes: [], consultas: [] };
  const params = new URLSearchParams({
    search_terms: consulta,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(MAX_RESULTADOS_GRATUITOS_TEXTO),
    fields: "code,product_name,brands,quantity,image_front_url,image_url,image_front_small_url",
  });
  const data = await fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, LEGACY_SEARCH_TIMEOUT_MS);
  const items = productosDeRespuestaBusqueda(data);
  const candidatos = candidatosBusquedaTexto(items, "open_food_facts_legacy", "Open Food Facts · búsqueda alternativa", consulta, producto, 52);
  return {
    candidatos,
    fuentes: candidatos.length ? ["Open Food Facts · búsqueda alternativa"] : [],
    consultas: [consulta],
  };
}

function decodificarHtml(valor = "") {
  return String(valor || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n) || 32));
}

function limpiarHtml(valor = "") {
  return texto(decodificarHtml(String(valor || "").replace(/<[^>]+>/g, " ")), 260);
}

function dominioDescartadoWeb(url = "") {
  const host = dominioDeUrl(url);
  if (!host) return true;
  return [
    "google.com", "google.com.ar", "bing.com", "duckduckgo.com",
    "facebook.com", "instagram.com", "pinterest.com", "tiktok.com",
    "youtube.com", "x.com", "twitter.com", "mercadolibre.com",
  ].some((d) => host === d || host.endsWith(`.${d}`));
}

function urlResultadoDuckDuckGo(href = "") {
  const limpio = decodificarHtml(href);
  try {
    const u = new URL(limpio, "https://html.duckduckgo.com/");
    const destino = u.searchParams.get("uddg");
    const final = destino ? decodeURIComponent(destino) : u.href;
    return urlHttps(final);
  } catch {
    return "";
  }
}

function parsearResultadosDuckDuckGo(html = "") {
  const salida = [];
  const re = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ""))) && salida.length < MAX_RESULTADOS_WEB) {
    const url = urlResultadoDuckDuckGo(m[1]);
    if (!url || dominioDescartadoWeb(url)) continue;
    const titulo = limpiarHtml(m[2]);
    if (!titulo) continue;
    salida.push({ url, titulo, dominio: dominioDeUrl(url) });
  }
  return salida;
}

function extraerMeta(html = "", atributo = "", valor = "") {
  const patron1 = new RegExp(`<meta[^>]+${atributo}=["']${valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const patron2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${atributo}=["']${valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  return decodificarHtml((String(html || "").match(patron1) || String(html || "").match(patron2) || [])[1] || "");
}

function extraerTituloPagina(html = "") {
  const og = extraerMeta(html, "property", "og:title");
  if (og) return limpiarHtml(og);
  const title = (String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  return limpiarHtml(title);
}

function imagenesJsonLd(html = "") {
  const urls = [];
  const scripts = String(html || "").match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts.slice(0, 8)) {
    const cuerpo = script.replace(/^.*?>/s, "").replace(/<\/script>\s*$/i, "").trim();
    if (!cuerpo || cuerpo.length > 400000) continue;
    try {
      const data = JSON.parse(decodificarHtml(cuerpo));
      const pendientes = Array.isArray(data) ? [...data] : [data];
      while (pendientes.length && urls.length < 5) {
        const item = pendientes.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item["@graph"])) pendientes.push(...item["@graph"]);
        const image = item.image;
        if (typeof image === "string") urls.push(image);
        else if (Array.isArray(image)) {
          for (const x of image) {
            if (typeof x === "string") urls.push(x);
            else if (x && typeof x === "object" && typeof x.url === "string") urls.push(x.url);
          }
        } else if (image && typeof image === "object" && typeof image.url === "string") {
          urls.push(image.url);
        }
      }
    } catch {
      // JSON-LD inválido: seguimos con metadatos Open Graph/Twitter.
    }
  }
  return urls;
}

function extraerImagenesPagina(html = "", paginaUrl = "") {
  const crudas = [
    extraerMeta(html, "property", "og:image"),
    extraerMeta(html, "property", "og:image:secure_url"),
    extraerMeta(html, "name", "twitter:image"),
    extraerMeta(html, "property", "twitter:image"),
    ...imagenesJsonLd(html),
  ];
  const salida = [];
  for (const valor of crudas) {
    const url = urlHttps(valor, paginaUrl);
    if (!url) continue;
    if (!salida.includes(url)) salida.push(url);
    if (salida.length >= 4) break;
  }
  return salida;
}

function puntajeDominioWeb(producto, resultado) {
  const host = String(resultado?.dominio || "");
  const objetivo = palabrasSignificativas([producto.marca, producto.nombre].filter(Boolean).join(" "));
  let score = 52;
  if (objetivo.some((p) => host.includes(p))) score += 8;
  const coincidencias = puntajeTexto(producto, resultado?.titulo || "");
  score += Math.min(14, coincidencias);
  return Math.min(76, score);
}

async function buscarPaginasWebPorNombre(producto) {
  const consulta = consultaTextoGratis(producto);
  if (!consulta) return { candidatos: [], fuentes: [], consultas: [] };

  // Búsqueda web gratuita por nombre. No usa Google Images ni una API paga:
  // encuentra páginas públicas del producto y toma sus metadatos og:image /
  // twitter:image / JSON-LD para obtener la imagen original del artículo.
  const params = new URLSearchParams({
    q: `"${consulta}"`,
    kl: "ar-es",
  });
  const html = await fetchText(`https://html.duckduckgo.com/html/?${params}`, WEB_SEARCH_TIMEOUT_MS, {
    Referer: "https://duckduckgo.com/",
  });
  if (!html) return { candidatos: [], fuentes: [], consultas: [consulta] };

  const resultados = parsearResultadosDuckDuckGo(html);
  const candidatos = [];
  const fuentes = [];

  for (const resultado of resultados.slice(0, MAX_PAGINAS_WEB)) {
    const pagina = await fetchText(resultado.url, WEB_PAGE_TIMEOUT_MS);
    if (!pagina) continue;
    const tituloPagina = extraerTituloPagina(pagina) || resultado.titulo || producto.nombre;
    const imagenes = extraerImagenesPagina(pagina, resultado.url);
    if (!imagenes.length) continue;
    const base = puntajeDominioWeb(producto, { ...resultado, titulo: tituloPagina });
    fuentes.push(`Web · ${resultado.dominio}`);
    imagenes.forEach((url, indice) => {
      candidatos.push({
        url,
        proveedor: "web_nombre_gratis",
        fuente: `Web · ${resultado.dominio}`,
        dominio: resultado.dominio,
        titulo: tituloPagina,
        marca: producto.marca || "",
        presentacion: producto.presentacion || "",
        consulta,
        exactaEAN: false,
        tipoCoincidencia: "web_por_nombre",
        puntajePreliminar: Math.max(44, base - indice * 3),
      });
    });
    if (candidatos.length >= 10) break;
  }

  return {
    candidatos,
    fuentes: [...new Set(fuentes)],
    consultas: [consulta],
  };
}

async function buscarFuentesGratuitas(producto) {
  const exactas = await buscarEnOpenFacts(producto);
  if (exactas.candidatos.length) return { ...exactas, modo: "ean_exacto" };

  // La web por nombre va antes que las búsquedas internas de Open Food Facts:
  // cubre productos argentinos que existen en fabricantes/comercios pero no
  // están cargados en las bases abiertas por EAN.
  const web = await buscarPaginasWebPorNombre(producto);
  if (web.candidatos.length) {
    return {
      candidatos: web.candidatos,
      fuentes: [...new Set([...exactas.fuentes, ...web.fuentes])],
      consultas: [...new Set([...exactas.consultas, ...web.consultas])],
      modo: "web_por_nombre",
    };
  }

  const textoPrincipal = await buscarEnSearchALicious(producto);
  if (textoPrincipal.candidatos.length) {
    return {
      candidatos: textoPrincipal.candidatos,
      fuentes: [...new Set([...exactas.fuentes, ...web.fuentes, ...textoPrincipal.fuentes])],
      consultas: [...new Set([...exactas.consultas, ...web.consultas, ...textoPrincipal.consultas])],
      modo: "texto_gratuito",
    };
  }

  const alterna = await buscarEnOpenFoodFactsLegacy(producto);
  return {
    candidatos: alterna.candidatos,
    fuentes: [...new Set([...exactas.fuentes, ...web.fuentes, ...textoPrincipal.fuentes, ...alterna.fuentes])],
    consultas: [...new Set([...exactas.consultas, ...web.consultas, ...textoPrincipal.consultas, ...alterna.consultas])],
    modo: alterna.candidatos.length ? "texto_gratuito_alternativo" : "sin_resultado",
  };
}

function consultasBrave(producto) {
  const ean = codigoEAN(producto.codigo);
  const descripcion = texto([producto.marca, producto.nombre, producto.presentacion].filter(Boolean).join(" "), 280);
  const base = texto([descripcion, "producto packshot fondo blanco envase"].filter(Boolean).join(" "), 360);
  const conEan = ean ? texto(`${ean} ${base}`, 380) : "";
  const consultas = [];
  if (conEan) consultas.push({ q: conEan, tipo: "ean_y_texto" });
  if (base && (!conEan || base !== conEan)) consultas.push({ q: base, tipo: "texto_ampliado" });
  return consultas.slice(0, 2);
}

async function ejecutarBrave(consulta, apiKey, producto) {
  const params = new URLSearchParams({
    q: consulta.q,
    country: "AR",
    search_lang: "es",
    safesearch: "strict",
    count: String(MAX_RESULTADOS_BRAVE),
    spellcheck: "true",
  });
  const data = await fetchJson(`https://api.search.brave.com/res/v1/images/search?${params}`, BRAVE_TIMEOUT_MS, {
    "X-Subscription-Token": apiKey,
  });
  const items = Array.isArray(data?.results) ? data.results : [];
  return items.map((item) => {
    const url = urlHttps(item?.properties?.url);
    const fallbackUrl = urlHttps(item?.thumbnail?.src);
    if (!url && !fallbackUrl) return null;
    const ancho = Number(item?.properties?.width) || Number(item?.thumbnail?.width) || 0;
    const alto = Number(item?.properties?.height) || Number(item?.thumbnail?.height) || 0;
    const confianza = String(item?.confidence || "").toLowerCase();
    const bonus = confianza === "high" ? 8 : confianza === "medium" ? 4 : 0;
    const dominio = texto(item?.source || item?.meta_url?.hostname || dominioDeUrl(url || fallbackUrl), 120);
    const titulo = texto(item?.title || producto.nombre);
    const ean = codigoEAN(producto.codigo);
    const exactaEAN = Boolean(ean && (`${titulo} ${url}`.includes(ean)));
    return {
      url: url || fallbackUrl,
      fallbackUrl: url && fallbackUrl && fallbackUrl !== url ? fallbackUrl : "",
      proveedor: "brave",
      fuente: `Brave Search · ${dominio}`,
      dominio,
      titulo,
      marca: producto.marca || "",
      presentacion: producto.presentacion || "",
      consulta: consulta.q,
      ancho,
      alto,
      exactaEAN,
      tipoCoincidencia: exactaEAN ? "ean_en_resultado" : consulta.tipo,
      puntajePreliminar: 50 + bonus + (exactaEAN ? 16 : 0),
    };
  }).filter(Boolean);
}

async function buscarEnBrave(producto) {
  const apiKey = texto(process.env.BRAVE_SEARCH_API_KEY || "", 400);
  if (!apiKey) return { candidatos: [], fuentes: [], consultas: [], configurado: false };
  const consultas = consultasBrave(producto);
  const candidatos = [];
  const consultasEjecutadas = [];
  for (let i = 0; i < consultas.length; i += 1) {
    const consulta = consultas[i];
    const encontrados = await ejecutarBrave(consulta, apiKey, producto);
    candidatos.push(...encontrados);
    consultasEjecutadas.push(consulta.q);
    if (i === 0 && encontrados.length >= 10) break;
  }
  return { candidatos, fuentes: ["Brave Search"], consultas: consultasEjecutadas, configurado: true };
}

async function buscarCandidatosMultiples(producto) {
  // Estrategia gratuita primero. Brave queda únicamente como respaldo opcional
  // y jamás es requisito para completar el catálogo.
  const gratis = await buscarFuentesGratuitas(producto);
  let brave = { candidatos: [], fuentes: [], consultas: [], configurado: false };
  if (!gratis.candidatos.length && process.env.BRAVE_SEARCH_API_KEY) {
    brave = await buscarEnBrave(producto);
  }
  const candidatos = deduplicarYOrdenar([...gratis.candidatos, ...brave.candidatos], producto);
  return {
    candidatos,
    cantidad: candidatos.length,
    fuentes: [...new Set([...gratis.fuentes, ...brave.fuentes])],
    consultas: [...new Set([...gratis.consultas, ...brave.consultas])],
    modoGratis: gratis.modo,
    braveConfigurado: brave.configurado,
    requiereConfiguracion: false,
  };
}

module.exports = {
  esHostPrivado,
  buscarCandidatosMultiples,
  codigoEAN,
  urlHttps,
  deduplicarYOrdenar,
  consultasBrave,
  consultaTextoGratis,
  productosDeRespuestaBusqueda,
  buscarFuentesGratuitas,
  buscarPaginasWebPorNombre,
  parsearResultadosDuckDuckGo,
  extraerImagenesPagina,
  extraerTituloPagina,
};
