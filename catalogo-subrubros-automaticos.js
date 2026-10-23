// Subrubros mínimos aprobados. Reglas conservadoras: sin coincidencia => sin subrubro.
const DEFINICIONES = {
  almacen: {
    'Fideos, Arroz y Sopas': /\b(fideos?|tallarines?|spaghetti|espaguetis?|mostacholes?|tirabuzones?|coditos?|monitos?|ravioles?|noquis?|capelettis?|arroz|arroces|sopas?|caldos?|consomes?|ramen)\b/,
    'Harinas y Legumbres': /\b(harinas?|premezclas?|semolas?|polentas?|lentejas?|garbanzos?|porotos?|legumbres?|arvejas? secas?)\b/,
    'Aceites y Salsas': /\b(aceites?|salsas?|pure de tomates?|extracto de tomates?|tomates? triturados?|passatas?)\b/,
    'Yerba y Infusiones': /\b(yerbas?|mates? cocidos?|tes?|infusiones?|cafes?|cappuccinos?|capuchinos?)\b/,
    'Dulces y Repostería': /\b(azucar|azucares|edulcorantes?|stevia|mermeladas?|dulces? de leche|levaduras?|polvo de hornear|esencias?|vainilla|coco rallado|cacao|coberturas?|granas?|reposteria|gelatinas?|flanes?|bizcochuelos?)\b/,
    'Enlatados': /\b(atun|sardinas?|caballas?|conservas?|enlatados?|choclo|palmitos?|arvejas? en lata|latas? de)\b/,
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
