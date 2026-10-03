// Only these cosmetic forms are equivalent. Other form policies stay unchanged.
export const SPECIES_EQUIVALENCE_VERSION = 'sinistcha-cosmetic-v1';
export function analyticalSpeciesId(id: string) {
  return id === 'sinistchamasterpiece' ? 'sinistcha' : id;
}
export function sinistchaSourceForm(value: string) {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return [
    'sinistcha',
    'sinistchaunremarkable',
    'sinistchaunremarkableform',
  ].includes(key)
    ? 'unremarkable'
    : ['sinistchamasterpiece', 'sinistchamasterpieceform'].includes(key)
      ? 'masterpiece'
      : null;
}
export function speciesSearch(id: string, name: string, query: string) {
  const term = query.toLowerCase().trim();
  return (
    name.toLowerCase().includes(term) ||
    (analyticalSpeciesId(id) === 'sinistcha' &&
      [
        'Sinistcha-Masterpiece',
        'Sinistcha [Masterpiece Form]',
        'Sinistcha [Unremarkable Form]',
      ].some((alias) => alias.toLowerCase().includes(term)))
  );
}
