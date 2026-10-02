# Evidence context

Monstats preserves observed usage, records, win rates and signed differences. Small information controls reveal limitations on hover, keyboard focus or tap; Escape or leaving the control dismisses them. Supporting counts, concentration and methodology stay in the existing evidence disclosures. These are descriptive explanations, not adjusted scores, causal ratings or confidence guarantees.

## Versioned definitions

`evidence-context-v2` in `src/domain/evidence.ts` defines:

- **Small usage sample:** fewer than 100 eligible registrations in the displayed usage population. A Pokémon on 10 of 1,000 registrations has 1% usage without a small-population warning.
- **Small match sample:** fewer than 100 distinct eligible physical matches/series supporting a performance statistic. Mirrored perspectives count once for evidence, even when both orientations contribute to the record. BO3 series are not expanded into individual games.
- **Sample unavailable:** no defensible supporting count. Unknown is neither zero nor a passed threshold.
- **Build sample:** registrations with the displayed field known. Independent marginals and aggregate percentages do not establish additional counts.

Matchup and candidate-specific overall-baseline evidence are separate; the baseline includes observations against the selected opponent. Either sample's limitation is discoverable beside their compact statistic group. Rows and combinations overlap, so their evidence cannot be added into independent trials. Zero wins remain 0%; absent outcomes remain unavailable.

## Event concentration

Player breadth and largest-player share are removed from notices, details, generated evidence and ordering because the sources do not establish verifiable human identities. Provider participant identifiers remain original source records and continue to support the existing provisional ranking floor; they are not reported as distinct people. Display names are never used to merge people.

Event breadth and largest-event share use distinct eligible physical results. The latter is the largest contributing event's distinct-result count divided by the sample's distinct-result count, expressed as a percentage.

Expanded source composition counts physical results associated with each reconciled record provider. A mirrored event can have multiple provider memberships; those counts overlap and must not be summed. Source All still pools compatible deduplicated records. Comparable official and community events receive equal treatment. Attendance describes the event, not every row's sample; large continues to mean 100+ entrants.

## Ordering and visibility

**Most evidence** uses descending distinct physical matches/series, then descending event breadth and canonical identity. The ordering describes volume, not reliability, and remains descending in both best/worst discovery contexts. Other accepted defaults remain unchanged. Usage has no evidence-quality sort because its population denominator is shared by the cohort; the existing physical-match sort orders performance evidence.

The configured automatic-ranking floor is still 20 physical results, two events and five namespaced participant identities (`config/evidence-floor.json`). This eligibility rule is independent of the explanations above. Automatic rankings continue excluding sparse rows, while manual comparisons remain available below the floor. **Hide entries with data notices** is the final checkbox in tournament, Archive and Matchups Filters. It takes effect only after Apply Filter; Reset restores the draft defaults and also requires Apply. It hides rows that would display their own notice, including a small or unavailable matchup or baseline sample. Shared cohort/source notices stay visible. Hidden rows do not change statistical denominators, rates, records or stored publications. Discovery filters before pagination and detail lists filter before choosing their top three. An enabled filter can hide a sparse manual comparison; switching it off restores that raw comparison.

## Saved publications and source boundaries

Evidence reuses existing eligibility, source reconciliation and physical-result counters. Dynamic Matchups reads its existing saved index; source memberships are already present. New aggregates carry versioned evidence within the existing atomic publication. Legacy and compatible archived views read a compressed, versioned supplemental artifact calculated explicitly from their own saved facts and frozen options, with a bounded 32-entry read cache. Raw stored rows, publication bytes, timestamps, pointers and frozen archives are not changed. A supplemental row attaches only when its record, rate, physical count and baseline reconcile with the stored values; incompatible or missing evidence leaves the raw result readable. Physical counts already present in raw rows remain usable even without the supplement.

Backfill publishes the entire supplemental publication and its ready marker in one transaction, keyed by source publication, evidence version and complete cohort options. Failure rolls back the supplement and preserves prior complete versions. Browsing never builds missing evidence artifacts or contacts providers. Reproduction:

```powershell
npm run evidence:backfill
# A specific saved publication, or current plus attached frozen archives:
npm run evidence:backfill -- PUBLICATION_ID
npm run evidence:backfill -- --all
```

Backfill is idempotent for the same source/evidence version. Existing missing Matchups indexes still require the explicit backfill documented in [Dynamic matchups](dynamic-matchups.md). Server/client Matchups caches and cohort read URLs include the evidence version. Displayed evidence travels with the displayed cohort and publication, including during failed or stale reads.

Showdown reports battles, weighted appearances and set observations, rather than a defensible independent-registration or BO3-series population. Champions ranks and marginal build captures omit sample counts. Their usage-population and known-field registration samples remain unavailable; published counts and percentages remain inspectable under About the data. Tournament outcomes, Showdown reports and Champions captures stay separate. No replay collection or cross-environment pooling occurs.

## Verification

The completed slice passes 88 offline tests and all 35 browser checks across focused runs, plus typecheck, lint, formatting and production build. Real-data filtering retains 111 of 296 Pokémon rows; all raw statistics remain exact. Three filtered discoveries match the independent reference across 150 returned rows. Desktop and narrow checkbox captures show no page errors or document overflow. Evidence v2 backfill preserves the source payload, publication timestamp and pointers.

Offline evidence regressions cover the 99/100 boundaries, removal of player metrics, notice-filter pagination, usage population, mirrored results, separate baselines, concentration, provider deduplication, unchanged ranking eligibility, zeros and legacy fallback. The independent bit-mask/physical-result reference also calculates evidence and validates all combination sizes, filters, directions and evidence sorting. Browser verification covers keyboard, hover, tap, layout stability, narrow screens, manual sparse results, source-specific unavailability and existing filter/stale-response behavior. Fixtures remain separate from owner data.

Initial local verification passed 87 offline tests, 33 browser checks, typecheck, lint, production build and formatting. Six saved-data desktop/narrow captures show no page errors or document overflow. Publication `19d9614a81c3d516` retains its exact source payload and timestamp. Independent saved-data checks cover all 296 Pokémon rows, 42 direct comparisons across sizes 1–6 and three evidence-sorted discoveries (150 returned rows). Derived concentration percentages allow a decimal-only comparison tolerance of 1e-10; raw metrics and integer counts compare exactly.

The explicit legacy backfill took about 58 seconds locally. A measured supplement read took approximately 291 ms cold and 1 ms warm; the three cold evidence discoveries took approximately 429–563 ms. These are local measurements, not guarantees. Cached raw responses without a ready supplement use no-store so an explicit subsequent backfill becomes visible; complete immutable responses retain long-lived caching. No provider data was collected for this slice.
