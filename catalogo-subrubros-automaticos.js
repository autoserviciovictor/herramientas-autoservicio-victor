// Subrubros mínimos aprobados. Reglas conservadoras: sin coincidencia => sin subrubro.
const DEFINICIONES = {
  almacen: {
    Fideos: /\b(fideos?|tallarines?|spaghetti|espaguetis?|mostacholes?|tirabuzones?|coditos?|moñitos?|ravioles?|ñoquis?|capelettis?)\b/,
    Harinas: /\b(harinas?|premezclas?|semolas?|polentas?)\b/,
    Arroz: /\b(arroz|arroces)\b/,
    Aceites: /\b(aceites?)\b/,
    Infusiones: /\b(yerbas?|mates? cocidos?|tes?|te en saquitos?|cafes?|cafe molido|cafe instantaneo|infusiones?)\b/,
    Repostería: /\b(levaduras?|polvo de hornear|esencias? de vainilla|coco rallado|cacao amargo|coberturas? de chocolate|gelatinas? sin sabor|granas?)\b/,
  },
  cervezas: {
    'Sin alcohol': /\b(sin alcohol|0[.,]0\s*%?|alcohol free|non alcoholic)\b/,
    'Con alcohol': null,
  },
  lacteos: {
    'Leches y yogures': /\b(leches?|yogur(?:es|t|ts)?|yoghurt|chocolatadas?|leche chocolatada|leche en polvo)\b/,
    'Quesos y derivados': /\b(quesos?|mozzarellas?|muzzarellas?|ricotas?|mantecas?|cremas? de leche|quesos? crema|untables?)\b/,
  },
  'vinoteca-aperitivos': {
    Espumantes: /\b(espumantes?|champagnes?|champanas?|champañas?|proseccos?|frizzantes?)\b/,
    Aperitivos: /\b(aperitivos?|fernets?|vermouths?|vermuts?|camparis?|aperols?|gins?|vodkas?|whiskys?|whiskeys?|rones?|tequilas?|licores?)\b/,
    Vinos: /\b(vinos?|malbec|cabernet|merlot|bonarda|syrah|chardonnay|sauvignon|torrontes|pinot noir|tempranillo)\b/,
  },
  galletas: {
    Saladas: /\b(saladas?|crackers?|criollitas?|bizcochitos?|galletitas? de agua|galletas? de agua)\b/,
    Dulces: /\b(dulces?|rellenas?|pepas?|chocolinas?|vainillas?|surtidas?|cookies?|oblea|oblea?s?)\b/,
  },
};
function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function slugRubro(nombre) { return normalizar(nombre).replace(/\s+/g, '-'); }
function detectarSubrubro(rubro, articulo) {
  const slug = slugRubro(rubro);
  const definicion = DEFINICIONES[slug];
  if (!definicion) return null;
  const nombre = normalizar(articulo);
  const coincidencias = Object.entries(definicion).filter(([, patron]) => patron && patron.test(nombre)).map(([sub]) => sub);
  if (slug === 'cervezas') return coincidencias.includes('Sin alcohol') ? 'Sin alcohol' : 'Con alcohol';
  return coincidencias.length === 1 ? coincidencias[0] : null;
}
module.exports = { DEFINICIONES, slugRubro, detectarSubrubro };
