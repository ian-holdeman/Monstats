export const championsResponse = () => ({
  is_champions_game: true,
  champions_slug: 'doubles',
  selected_format: ['championsdoubles', '[Champions] In-Game Doubles'],
  selected_rating: '0',
  selected_pokemon: 'Rillaboom',
  champions_updated: 'September 30, 2026 at 12:00 UTC',
  current_pokemon: ['Rillaboom', '', '1', [67, 8]],
  pokemon_names: [
    ['Rillaboom', '#1', [], ''],
    ['Incineroar', '#2', [], ''],
  ],
  moves_list: [
    ['Fake Out', '95.0'],
    ['Protect', '0.0'],
  ],
  items_list: [['Miracle Seed', '58.2']],
  abilities_list: [['Grassy Surge', '99.9']],
  natures_list: [['Adamant', '84.9']],
  spreads_list: [['32/32/0/0/0/2', '11.6']],
  teammates_list: [['Incineroar', '#1']],
  trend_kind: 'rank',
  trend_months: ['2026-09-29', '2026-09-30'],
  trend_usage: [2, 1],
});
export const showdownUsage = `Total battles: 100
Avg. weight/team: 0.081
| Rank | Pokemon | Usage % | Raw | % | Real | % |
| 1 | Rillaboom | 45.00000% | 90 | 45.000% | 40 | 40.000% |
| 2 | Salamence-Mega | 0.00000% | 1 | 0.500% | 0 | 0.000% |`;
export const showdownChaos = () => ({
  info: {
    metagame: 'gen9championsvgc2026regmc',
    cutoff: 1630,
    'number of battles': 100,
  },
  data: {
    Rillaboom: {
      usage: 0.45,
      'Raw count': 110,
      Abilities: { grassysurge: 8, overgrow: 2 },
      Items: { miracleseed: 10 },
      Moves: { fakeout: 9, protect: 0 },
      Spreads: { 'Adamant:32/32/0/0/0/2': 10 },
      Teammates: { 'Salamence-Mega': 5, empty: 0 },
      'Checks and Counters': {},
    },
    'Salamence-Mega': {
      usage: 0,
      'Raw count': 1,
      Abilities: { aerilate: 1 },
      Items: { salamencite: 1 },
      Moves: { protect: 1 },
      Spreads: {},
      Teammates: { Rillaboom: 1 },
      'Checks and Counters': {},
    },
  },
});
