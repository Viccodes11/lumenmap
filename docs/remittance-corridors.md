# Remittance corridors

`/flow/corridors` (`components/dashboard/CorridorPanel.tsx`) shows the top
source → destination pairs for native XLM payments in a period, aggregated
from the same edge data `/api/v1/flow` already serves. The aggregation itself
lives in `lib/flow/corridors.ts` as a pure function (`buildCorridors`), so it
is unit-tested directly against fixtures rather than through the UI.

## Data source

- Edges: `GET /api/v1/flow?period=<period>` → `lib/flow/data.ts`'s
  `getFlowData`, the same payment-flow edge list the rest of the app uses.
  That endpoint already caps itself at 100 edges per period
  (`MAX_EDGES` in `lib/flow/data.ts`) and reports `sampled: true` when the
  period had more; the corridor panel surfaces that flag rather than hiding
  it.
- Entity labels: `lib/entities/registry.ts`'s `lookupEntity` /
  `getDisplayName`, reading `data/entities.json` and `data/directory.json`.
  No network call — this is the same local, synchronous registry the
  treemap and Flow table already use.

## Clustering rule

A corridor's source and destination are **clusters**, not raw addresses:

- An address with a registry entry clusters under `entity:<protocol>` — its
  display label is the entity's `name`. Two different addresses that share a
  `protocol` (e.g. two issuer accounts for the same project, or a pool and
  router contract for the same DeFi protocol) collapse into **one** corridor
  endpoint. This is a deliberate choice: the corridor view is about which
  *parties* move funds, not which specific account of a multi-account entity
  did.
- An address with no registry entry clusters under `account:<address>` — its
  own raw id, shown truncated via `getDisplayName`'s existing fallback. Two
  different unlabeled addresses are **never** merged with each other, even
  though neither has a name: merging unrelated unknown counterparties would
  misrepresent the graph, and an unresolved address is common and expected,
  not a defect to paper over (see the "evidence over inference" rule in
  `docs/methodology.md`).
- A corridor where the source and destination clusters resolve to the **same**
  entity (e.g. two of an exchange's own hot wallets) is dropped — that is
  internal movement, not a remittance between two parties. Its operations
  still count toward `totalOperationCount` for the period; they are excluded
  from the corridor list, not erased from the total.

## Ranking, capping, and coverage

Corridors are ranked by operation count (not volume) and capped at the top 20
(`DEFAULT_CORRIDOR_TOP_N`). The panel reports, honestly:

- `totalCorridorCount` — how many distinct corridors existed before the cap.
- `totalOperationCount` — operations across every corridor for the asset,
  including the ones dropped as same-cluster internal movement.
- `includedOperationCount` / `totalOperationCount` — what fraction of
  activity the displayed top-N rows actually represent.
- Whether the underlying `/api/v1/flow` edge list was itself already sampled
  for the period (a second, independent coverage caveat — the corridor cap
  and the edge-list cap are not the same sampling step, and both are
  disclosed).

## Why XLM only, for now

The panel defaults to `native:XLM` (`DEFAULT_CORRIDOR_ASSET_KEY`) per the
issue's "top XLM payment pairs" scope. `buildCorridors` itself is generic —
it takes any `assetKey` — so adding an asset selector later is a UI change,
not an aggregation change. Amounts are never summed across assets (same rule
documented for payment-flow edges elsewhere in this repo): a corridor's
`volume` is always for one asset key.

## Out of scope

- Off-chain FX rates — `volume` is the raw minor-unit amount for the asset,
  never converted.
- Country-level geolocation — "source"/"destination" are Stellar accounts or
  named entities, never claimed to be a jurisdiction. No such claim is made
  or implied anywhere in this feature.
