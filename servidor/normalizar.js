// Normaliza un texto para comparar sin distinguir mayúsculas, tildes ni espacios repetidos.
// "  Fontanería " -> "fontaneria". Se usa en RN-05 (sectores únicos) y en la búsqueda de ciudades.
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

module.exports = { normalizar };
