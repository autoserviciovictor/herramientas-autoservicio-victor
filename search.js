// Buscador inteligente compartido - V5.2.1
// Tolera acentos, palabras en distinto orden, códigos parciales y errores breves.

export function normalizarBusqueda(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compacto(valor) {
  return normalizarBusqueda(valor).replace(/\s+/g, "");
}

function distanciaLimitada(a, b, limite = 2) {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > limite) return limite + 1;

  const anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  const actual = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    actual[0] = i;
    let minimoFila = actual[0];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(
        anterior[j] + 1,
        actual[j - 1] + 1,
        anterior[j - 1] + costo
      );
      minimoFila = Math.min(minimoFila, actual[j]);
    }
    if (minimoFila > limite) return limite + 1;
    for (let j = 0; j <= b.length; j++) anterior[j] = actual[j];
  }
  return anterior[b.length];
}

function puntuarToken(token, palabras, textoCompleto, textoCompacto) {
  if (!token) return 0;
  if (textoCompleto === token) return 120;
  if (textoCompleto.startsWith(token)) return 95;
  if (textoCompleto.includes(token)) return 75;

  const tokenCompacto = token.replace(/\s+/g, "");
  if (tokenCompacto && textoCompacto.includes(tokenCompacto)) return 72;

  let mejor = 0;
  for (const palabra of palabras) {
    if (palabra === token) return 100;
    if (palabra.startsWith(token) || token.startsWith(palabra)) mejor = Math.max(mejor, 82);
    else if (palabra.includes(token) || token.includes(palabra)) mejor = Math.max(mejor, 68);
    else if (token.length >= 3 && palabra.length >= 3) {
      const limite = token.length >= 7 ? 2 : 1;
      const distancia = distanciaLimitada(token, palabra, limite);
      if (distancia <= limite) mejor = Math.max(mejor, 58 - distancia * 8);
    }
  }
  return mejor;
}

export function puntuarBusqueda(consulta, item, campos = ["articulo", "codigo"]) {
  const q = normalizarBusqueda(consulta);
  if (!q) return 1;

  const codigo = normalizarBusqueda(item?.codigo ?? "");
  const codigoCompacto = compacto(item?.codigo ?? "");
  const qCompacta = compacto(q);
  if (qCompacta && codigoCompacto) {
    if (codigoCompacto === qCompacta) return 10000;
    if (codigoCompacto.startsWith(qCompacta)) return 7000;
    if (codigoCompacto.includes(qCompacta)) return 5500;
  }

  const texto = normalizarBusqueda(campos.map(campo => item?.[campo] ?? "").join(" "));
  const textoCompacto = compacto(texto);
  const palabras = texto.split(" ").filter(Boolean);
  const tokens = q.split(" ").filter(Boolean);
  if (!tokens.length) return 1;

  let total = 0;
  for (const token of tokens) {
    const puntos = puntuarToken(token, palabras, texto, textoCompacto);
    if (puntos <= 0) return 0;
    total += puntos;
  }

  if (texto.startsWith(q)) total += 120;
  else if (texto.includes(q)) total += 85;

  return total;
}

export function ordenarPorBusqueda(items, consulta, opciones = {}) {
  const { limite = 80, campos = ["articulo", "codigo"], desempate } = opciones;
  const q = normalizarBusqueda(consulta);
  if (!q) return items.slice(0, limite);

  return items
    .map((item, indice) => ({ item, indice, puntos: puntuarBusqueda(q, item, campos) }))
    .filter(resultado => resultado.puntos > 0)
    .sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if (typeof desempate === "function") {
        const diferencia = desempate(a.item, b.item);
        if (diferencia) return diferencia;
      }
      return a.indice - b.indice;
    })
    .slice(0, limite)
    .map(resultado => resultado.item);
}

export function coincideBusqueda(item, consulta, campos = ["articulo", "codigo"]) {
  return puntuarBusqueda(consulta, item, campos) > 0;
}
