const sharp = require("sharp");
const {
  obtenerProductoCatalogoAdminDb,
  guardarResultadoImagenCatalogoDb,
  obtenerImagenCatalogoDb,
} = require("./db-catalogo-publico");
const { ESTADOS_IMAGEN } = require("./catalogo-imagenes-estado");
const { buscarCandidatosMultiples, urlHttps } = require("./catalogo-imagenes-busqueda");
const { puntuarCandidato, decidirSeleccion } = require("./catalogo-imagenes-seleccion");

const IMAGEN_TIMEOUT_MS = 8000;
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024;
const LADO_CATALOGO = 600;
const FONDO_BLANCO_MINIMO = 0.88;

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

    if (tocaBorde || anchoRel > 0.985 || altoRel > 0.985) {
      return { acepta: false, motivo: "el producto está recortado o toca los bordes", width, height, blancoBorde, score: 45 };
    }
    if (anchoRel < 0.10 || altoRel < 0.20 || caja.ocupacion < 0.018) {
      return { acepta: false, motivo: "el producto aparece demasiado pequeño", width, height, blancoBorde, score: 42 };
    }

    // El catálogo usa una presentación homogénea: las imágenes automáticas
    // deben ser packshots con fondo blanco antes de poder confirmarse.
    const fondoBlanco = blancoBorde >= FONDO_BLANCO_MINIMO;
    if (!fondoBlanco) {
      return {
        acepta: false,
        motivo: "el fondo no es suficientemente blanco",
        width,
        height,
        blancoBorde,
        fondoBlanco: false,
        score: 35,
        caja,
      };
    }
    const resolucion = Math.min(100, Math.round((Math.min(width, height) / 1000) * 100));
    const encuadre = Math.min(100, Math.round((Math.min(anchoRel, 0.82) / 0.82) * 55 + (Math.min(altoRel, 0.88) / 0.88) * 45));
    const score = Math.max(45, Math.min(99, Math.round(
      28
      + resolucion * 0.28
      + encuadre * 0.44
    )));
    return {
      acepta: true,
      motivo: "packshot limpio, fondo blanco y escala apta",
      width,
      height,
      blancoBorde,
      fondoBlanco,
      score,
      caja,
    };
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

async function evaluarCandidatosProducto(producto, candidatos = [], limite = 10) {
  const evaluados = [];
  for (const candidato of candidatos.slice(0, Math.max(1, limite))) {
    const valido = await validarCandidato({
      ...candidato,
      puntaje: candidato.puntajePreliminar,
      exacta: candidato.exactaEAN,
    });
    if (!valido) continue;
    const evaluacion = puntuarCandidato(producto, candidato, valido.calidad);
    evaluados.push({ candidato, valido, evaluacion });
    // Un EAN exacto con score alto ya es suficiente; evita descargas innecesarias.
    if (evaluacion.exactoEAN && evaluacion.total >= 88) break;
  }
  return evaluados;
}

async function buscarImagenProducto(codigo, { guardar = true, confirmarAutomaticamente = true } = {}) {
  const producto = await obtenerProductoCatalogoAdminDb(codigo);
  if (!producto) throw new Error("Producto no encontrado");

  const confirmada = await obtenerImagenCatalogoDb(producto.codigo, "confirmada");
  if (producto.estadoImagen === ESTADOS_IMAGEN.CONFIRMADA && confirmada?.data) {
    return {
      encontrado: true,
      confirmado: true,
      omitido: true,
      motivo: "imagen_confirmada",
      producto,
    };
  }

  if (!guardar) {
    const busqueda = await buscarCandidatosMultiples(producto);
    return { producto, ...busqueda };
  }

  await guardarResultadoImagenCatalogoDb(producto.codigo, {
    estado: ESTADOS_IMAGEN.BUSCANDO,
    candidatoUrl: "",
    candidatoFuente: "",
    candidatoTitulo: "",
    candidatoPuntaje: 0,
    candidatoData: null,
    candidatoMime: "",
    candidatos: [],
    error: "",
  });

  try {
    const busqueda = await buscarCandidatosMultiples(producto);
    if (!busqueda.candidatos.length) {
      const mensaje = "No se encontraron candidatos en las fuentes gratuitas disponibles para este producto.";
      await guardarResultadoImagenCatalogoDb(producto.codigo, {
        estado: ESTADOS_IMAGEN.SIN_RESULTADO,
        candidatoUrl: "",
        candidatoFuente: "",
        candidatoTitulo: "",
        candidatoPuntaje: 0,
        candidatoData: null,
        candidatoMime: "",
        candidatos: [],
        error: mensaje,
      });
      return {
        encontrado: false,
        confirmado: false,
        candidato: null,
        candidatos: [],
        cantidadCandidatos: 0,
        mensaje,
        requiereConfiguracion: busqueda.requiereConfiguracion,
        producto: await obtenerProductoCatalogoAdminDb(producto.codigo),
      };
    }

    // P2: descargamos y evaluamos varios candidatos. La decisión final se toma
    // en un único módulo, no en cada proveedor.
    const evaluados = await evaluarCandidatosProducto(producto, busqueda.candidatos, 10);
    const decision = decidirSeleccion(evaluados);

    if (!decision.mejor) {
      const mensaje = "Se encontraron resultados, pero ninguna imagen pudo descargarse o superó la calidad mínima.";
      await guardarResultadoImagenCatalogoDb(producto.codigo, {
        estado: ESTADOS_IMAGEN.SIN_RESULTADO,
        candidatos: busqueda.candidatos,
        candidatoUrl: "",
        candidatoFuente: "",
        candidatoTitulo: "",
        candidatoPuntaje: 0,
        candidatoData: null,
        candidatoMime: "",
        error: mensaje,
      });
      return {
        encontrado: false,
        confirmado: false,
        cantidadCandidatos: busqueda.candidatos.length,
        mensaje,
        producto: await obtenerProductoCatalogoAdminDb(producto.codigo),
      };
    }

    const { candidato, valido, evaluacion } = decision.mejor;
    const fuente = `${candidato.fuente || candidato.proveedor || "Automática"} · confianza ${evaluacion.confianza}`;

    if (confirmarAutomaticamente && decision.accion === "confirmar") {
      // P3: persistencia definitiva. La imagen normalizada se guarda una sola
      // vez como BYTEA y desde este momento el producto queda protegido.
      await guardarResultadoImagenCatalogoDb(producto.codigo, {
        imagen: candidato.url,
        fuente,
        estado: ESTADOS_IMAGEN.CONFIRMADA,
        imagenData: valido.normalizada,
        imagenMime: valido.mime || "image/jpeg",
        candidatoUrl: "",
        candidatoFuente: "",
        candidatoTitulo: "",
        candidatoPuntaje: 0,
        candidatoData: null,
        candidatoMime: "",
        candidatos: [],
        error: "",
      });

      return {
        encontrado: true,
        confirmado: true,
        automatico: true,
        confianza: evaluacion.confianza,
        puntaje: evaluacion.total,
        candidato,
        cantidadCandidatos: busqueda.candidatos.length,
        fuentes: busqueda.fuentes,
        consultas: busqueda.consultas,
        producto: await obtenerProductoCatalogoAdminDb(producto.codigo),
      };
    }

    // Solo los casos de baja confianza quedan como candidata para revisión.
    await guardarResultadoImagenCatalogoDb(producto.codigo, {
      estado: ESTADOS_IMAGEN.CANDIDATO,
      candidatoUrl: candidato.url,
      candidatoFuente: fuente,
      candidatoTitulo: candidato.titulo,
      candidatoPuntaje: evaluacion.total,
      candidatoData: valido.normalizada,
      candidatoMime: valido.mime || "image/jpeg",
      candidatos: busqueda.candidatos,
      error: `Confianza ${evaluacion.confianza}. Se dejó como candidata para revisión manual.`,
    });
    return {
      encontrado: true,
      confirmado: false,
      automatico: false,
      confianza: evaluacion.confianza,
      puntaje: evaluacion.total,
      candidato,
      candidatos: busqueda.candidatos,
      cantidadCandidatos: busqueda.candidatos.length,
      fuentes: busqueda.fuentes,
      consultas: busqueda.consultas,
      producto: await obtenerProductoCatalogoAdminDb(producto.codigo),
    };
  } catch (error) {
    await guardarResultadoImagenCatalogoDb(producto.codigo, {
      estado: ESTADOS_IMAGEN.ERROR,
      error: error?.message || "Error inesperado durante la búsqueda de imagen",
    });
    throw error;
  }
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
    await guardarResultadoImagenCatalogoDb(codigo, { imagenData: normalizada, imagenMime: "image/jpeg", error: "" }, { forzarConfirmada: true });
  }
  return { buffer: normalizada, mime: "image/jpeg" };
}

async function importarImagenArchivoManual(codigo, buffer, mime = "") {
  const producto = await obtenerProductoCatalogoAdminDb(codigo);
  if (!producto) throw new Error("Producto no encontrado");
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const error = new Error("El archivo de imagen está vacío");
    error.status = 400;
    throw error;
  }
  if (buffer.length > MAX_IMAGEN_BYTES) {
    const error = new Error("La imagen supera el tamaño permitido");
    error.status = 413;
    throw error;
  }
  const tipo = String(mime || "").toLowerCase();
  if (tipo && !["image/jpeg", "image/png", "image/webp"].includes(tipo)) {
    const error = new Error("Formato no permitido. Usá JPG, PNG o WEBP");
    error.status = 415;
    throw error;
  }
  const calidad = await analizarCalidadImagen(buffer);
  if (!calidad.acepta) {
    const error = new Error(`La imagen fue rechazada: ${calidad.motivo}`);
    error.status = 422;
    throw error;
  }
  const normalizada = await normalizarImagenCatalogo(buffer);
  await guardarResultadoImagenCatalogoDb(producto.codigo, {
    imagen: `archivo-manual://${producto.codigo}`,
    fuente: "Manual · archivo local normalizado",
    estado: ESTADOS_IMAGEN.CONFIRMADA,
    imagenData: normalizada,
    imagenMime: "image/jpeg",
    candidatoUrl: "", candidatoFuente: "", candidatoTitulo: "", candidatoPuntaje: 0,
    candidatoData: null, candidatoMime: "", candidatos: [], error: "",
  }, { forzarConfirmada: true });
  return obtenerProductoCatalogoAdminDb(producto.codigo);
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
    estado: ESTADOS_IMAGEN.CONFIRMADA,
    imagenData: normalizada,
    imagenMime: "image/jpeg",
    candidatoUrl: "",
    candidatoFuente: "",
    candidatoTitulo: "",
    candidatoPuntaje: 0,
    candidatoData: null,
    candidatoMime: "",
    candidatos: [],
    error: "",
  }, { forzarConfirmada: true });
  return obtenerProductoCatalogoAdminDb(producto.codigo);
}


module.exports = {
  buscarImagenProducto,
  obtenerImagenNormalizadaProducto,
  importarImagenManual,
  importarImagenArchivoManual,
  analizarCalidadImagen,
};
