/** Canonical provider sets keep immutable cohort URLs independent of click order. */
export function sourceSelection(value = 'all'): string {
  if (value === 'all' || value === 'none') return value;
  const ids = [...new Set(value.split(','))].sort();
  if (
    ids.length > 8 ||
    ids.some(
      (id) => !/^[a-z0-9-]{1,60}$/.test(id) || id === 'all' || id === 'none',
    )
  )
    throw new Error('Invalid source selection');
  return ids.join(',');
}
export function sourceMatches(
  selection: string | undefined,
  providers: string[],
) {
  return (
    selection === undefined ||
    selection === 'all' ||
    (selection !== 'none' &&
      selection.split(',').some((id) => providers.includes(id)))
  );
}
export function toggleSource(
  selection: string,
  id: string,
  available: string[],
) {
  const ids = new Set(
    selection === 'all'
      ? available
      : selection === 'none'
        ? []
        : selection.split(','),
  );
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return ids.size ? sourceSelection([...ids].join(',')) : 'none';
}
