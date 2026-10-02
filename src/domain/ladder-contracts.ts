import configured from '../../config/ladder-sources.json' with { type: 'json' };
export const ladderSources = configured;
export function championsContract(season?: string, now = Date.now()) {
  const matches = ladderSources.champions.filter(
    (c) =>
      c.reviewed &&
      (season
        ? c.season === season
        : now >= Date.parse(c.startsAt) && now <= Date.parse(c.endsAt)),
  );
  if (matches.length !== 1)
    throw new Error('Champions season contract needs a new source audit');
  return matches[0];
}
export function configuredShowdown(formatId: string) {
  const contract =
    ladderSources.showdown.formats[
      formatId as keyof typeof ladderSources.showdown.formats
    ];
  if (!contract) throw new Error('Unsupported Showdown doubles format');
  return contract as { regulation: string; format: 'BO1' | 'BO3' };
}
