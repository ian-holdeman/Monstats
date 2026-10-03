export function acceptsGzip(value: string | null) {
  if (!value) return false;
  const encodings = value
    .toLowerCase()
    .split(',')
    .map((part) => {
      const [name, ...parameters] = part.trim().split(';');
      const quality = parameters
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      const q = quality ? Number(quality.slice(2)) : 1;
      return {
        name: name.trim(),
        accepted: Number.isFinite(q) && q > 0 && q <= 1,
      };
    });
  return (
    (
      encodings.find((e) => e.name === 'gzip') ??
      encodings.find((e) => e.name === '*')
    )?.accepted ?? false
  );
}
