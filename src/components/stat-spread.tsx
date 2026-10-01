import { spreadParts } from '@/domain/presentation';
export function StatSpread({ value }: { value: string }) {
  const spread = spreadParts(value);
  if (!spread) return value;
  const stats = [
    'HP',
    'Attack',
    'Defense',
    'Special Attack',
    'Special Defense',
    'Speed',
  ];
  const description = spread.values
    .map(
      (v, i) =>
        `${stats[i]} ${v}${i === spread.plus ? ' (raised)' : i === spread.minus ? ' (lowered)' : ''}`,
    )
    .join(', ');
  return (
    <span
      className="stat-spread"
      aria-label={description}
      title={spread.nature ? `${spread.nature}: ${description}` : description}
    >
      {spread.values.map((v, i) => (
        <span key={i} aria-hidden="true">
          {i > 0 && <span className="stat-separator">/</span>}
          <span
            className={
              i === spread.plus
                ? 'stat-raised'
                : i === spread.minus
                  ? 'stat-lowered'
                  : undefined
            }
          >
            {v}
          </span>
        </span>
      ))}
    </span>
  );
}
