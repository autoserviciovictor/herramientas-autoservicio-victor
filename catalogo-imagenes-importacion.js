const zlib = require("zlib");
const path = require("path");

const EXTENSIONES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const MAX_ENTRADAS_ZIP = 5000;
const MAX_IMAGENES_IMPORTAR = 1500;
const MAX_ARCHIVO_DESCOMPRIMIDO = 8 * 1024 * 1024;
const MAX_TOTAL_DESCOMPRIMIDO = 300 * 1024 * 1024;

function errorZip(mensaje, status = 400) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function buscarEocd(buffer) {
  const firma = 0x06054b50;
  const inicio = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= inicio; i -= 1) {
    if (buffer.readUInt32LE(i) === firma) return i;
  }
  return -1;
}

function nombreEntrada(buffer, inicio, largo, flags) {
  const bytes = buffer.subarray(inicio, inicio + largo);
  // Los ZIP modernos usan UTF-8 con el bit 11. Para nombres ASCII (EAN) ambas rutas coinciden.
  return bytes.toString((flags & 0x0800) ? "utf8" : "utf8").replace(/\\/g, "/");
}

function listarEntradasZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw errorZip("El archivo ZIP está vacío o es inválido.");
  const eocd = buscarEocd(buffer);
  if (eocd < 0) throw errorZip("No se encontró la estructura central del ZIP.");

  const totalEntradas = buffer.readUInt16LE(eocd + 10);
  const tamCentral = buffer.readUInt32LE(eocd + 12);
  const offsetCentral = buffer.readUInt32LE(eocd + 16);
  if (totalEntradas > MAX_ENTRADAS_ZIP) throw errorZip(`El ZIP tiene demasiados archivos (${totalEntradas}).`, 413);
  if (offsetCentral + tamCentral > buffer.length) throw errorZip("La estructura del ZIP está incompleta.");

  const entradas = [];
  let cursor = offsetCentral;
  for (let i = 0; i < totalEntradas; i += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw errorZip("El directorio central del ZIP está dañado.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const metodo = buffer.readUInt16LE(cursor + 10);
    const tamComprimido = buffer.readUInt32LE(cursor + 20);
    const tamDescomprimido = buffer.readUInt32LE(cursor + 24);
    const largoNombre = buffer.readUInt16LE(cursor + 28);
    const largoExtra = buffer.readUInt16LE(cursor + 30);
    const largoComentario = buffer.readUInt16LE(cursor + 32);
    const offsetLocal = buffer.readUInt32LE(cursor + 42);
    const nombre = nombreEntrada(buffer, cursor + 46, largoNombre, flags);

    if (flags & 0x0001) throw errorZip("El ZIP contiene archivos cifrados y no puede importarse.");
    if (![0, 8].includes(metodo)) throw errorZip(`El ZIP usa un método de compresión no compatible (${metodo}).`);
    if (tamDescomprimido > MAX_ARCHIVO_DESCOMPRIMIDO) throw errorZip(`El archivo ${nombre} supera los 8 MB descomprimido.`, 413);

    entradas.push({ nombre, metodo, tamComprimido, tamDescomprimido, offsetLocal });
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

function extraerEntrada(buffer, entrada) {
  const off = entrada.offsetLocal;
  if (off + 30 > buffer.length || buffer.readUInt32LE(off) !== 0x04034b50) {
    throw errorZip(`No se pudo leer ${entrada.nombre}.`);
  }
  const largoNombre = buffer.readUInt16LE(off + 26);
  const largoExtra = buffer.readUInt16LE(off + 28);
  const inicio = off + 30 + largoNombre + largoExtra;
  const fin = inicio + entrada.tamComprimido;
  if (fin > buffer.length) throw errorZip(`El archivo ${entrada.nombre} está incompleto.`);
  const comprimido = buffer.subarray(inicio, fin);
  const data = entrada.metodo === 0 ? Buffer.from(comprimido) : zlib.inflateRawSync(comprimido);
  if (data.length > MAX_ARCHIVO_DESCOMPRIMIDO) throw errorZip(`El archivo ${entrada.nombre} supera los 8 MB.`, 413);
  return data;
}

function codigoDesdeNombre(nombre) {
  const base = path.posix.basename(nombre).replace(/\.[^.]+$/, "").trim();
  // Los códigos del catálogo se manejan como texto. Conservamos ceros a la izquierda.
  return /^\d{6,18}$/.test(base) ? base : "";
}

function seleccionarImagenesImportables(buffer) {
  const entradas = listarEntradasZip(buffer);
  const imagenes = entradas.filter((entrada) => {
    if (!entrada.nombre || entrada.nombre.endsWith("/") || entrada.nombre.includes("__MACOSX/")) return false;
    return EXTENSIONES.has(path.posix.extname(entrada.nombre).toLowerCase());
  });

  const hayCarpetaListas = imagenes.some((e) => /(^|\/)listas\//i.test(e.nombre));
  const candidatas = hayCarpetaListas ? imagenes.filter((e) => /(^|\/)listas\//i.test(e.nombre)) : imagenes;
  const porCodigo = new Map();
  let ignoradasNombre = 0;
  let totalDescomprimido = 0;

  for (const entrada of candidatas) {
    const codigo = codigoDesdeNombre(entrada.nombre);
    if (!codigo) { ignoradasNombre += 1; continue; }
    if (porCodigo.has(codigo)) continue;
    totalDescomprimido += entrada.tamDescomprimido;
    if (totalDescomprimido > MAX_TOTAL_DESCOMPRIMIDO) throw errorZip("El contenido descomprimido del ZIP supera el límite permitido.", 413);
    porCodigo.set(codigo, entrada);
  }

  if (porCodigo.size > MAX_IMAGENES_IMPORTAR) {
    throw errorZip(`El ZIP contiene ${porCodigo.size} imágenes válidas. El máximo por lote es ${MAX_IMAGENES_IMPORTAR}.`, 413);
  }
  if (!porCodigo.size) {
    throw errorZip(hayCarpetaListas
      ? "La carpeta listas/ no contiene imágenes nombradas con el código de barras."
      : "No se encontraron imágenes JPG, PNG o WEBP cuyo nombre sea el código de barras.");
  }

  const items = [...porCodigo.entries()].map(([codigo, entrada]) => ({
    codigo,
    nombre: entrada.nombre,
    mime: EXTENSIONES.get(path.posix.extname(entrada.nombre).toLowerCase()),
    obtenerBuffer: () => extraerEntrada(buffer, entrada),
  }));

  return {
    items,
    usaCarpetaListas: hayCarpetaListas,
    totalEntradas: entradas.length,
    totalImagenesEncontradas: imagenes.length,
    ignoradasNombre,
  };
}

module.exports = {
  seleccionarImagenesImportables,
  listarEntradasZip,
  codigoDesdeNombre,
};
