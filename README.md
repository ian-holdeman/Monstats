# Monstats

Explore Pokémon Champions tournament teams, matchups, and ladder trends in one place.

Monstats combines colorful Pokémon tables with detailed statistics and flexible filters. Follow a Pokémon from usage rankings into its teammates, builds, and observed results, or compare complete combinations in the Matchups calculator.

## Explore the data

- **Tournaments:** registration usage and observed team performance, with source, sheet, event-size, and official-event filters.
- **Matchups:** compare combinations of one to six Pokémon, inspect their overall records, and discover their best and worst observed results against a selected opponent.
- **Ladder:** browse monthly Pokémon Showdown usage and separate in-game Champions ranks and build information.
- **Archive:** revisit published coverage from earlier regulations.

Filters apply together when you select **Apply Filter**. Details include sample information, source coverage, and comparable baselines. Keyboard navigation and compact layouts support desktop and smaller screens.

## What the numbers mean

Tournament usage counts complete registered teams. Win rates describe decisive competitive results where both teams are known; a best-of-three series counts as one result. Matchup differences are percentage-point changes from the same combination's overall win rate under the selected filters.

These are observed associations, not battle predictions. Missing teams, uneven event coverage, and small samples limit what results can tell you. Ladder usage and in-game ranks are separate populations and do not supply tournament win rates.

See [methodology](docs/methodology.md) and [Ladder data](docs/ladder-coverage.md) for definitions and limitations.

## Run locally

Requires Node **24.19+ in the 24.x line** and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://127.0.0.1:3000). A fresh installation starts without saved statistics. [Local setup](docs/local-development.md) covers collection, a production-style preview, and tests.

Browsing uses saved local publications and artwork; it does not contact providers. Runtime data stays in `.monstats/`, or the directory selected by `MONSTATS_DATA_DIR`, and is excluded from Git.

## Credits

Tournament sources: [Limitless](https://docs.limitlesstcg.com/developer/tournaments.html), [Victory Road](https://circuit.victoryroad.pro/), and the [pokedata mirror](https://pokedata.ovh/standings2/). Ladder sources: [Smogon statistics](https://www.smogon.com/stats/) and [MunchStats](https://www.munchstats.com/about/). Canonical identities use [@pkmn/dex](https://github.com/pkmn/ps).

Artwork: [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/) and **Kyledove** Mega sprites contributed to [PokeAPI](https://github.com/PokeAPI/sprites/pull/236). See [artwork credits](docs/artwork.md).

Monstats is an unofficial project. Pokémon characters and artwork belong to their respective rights holders.
