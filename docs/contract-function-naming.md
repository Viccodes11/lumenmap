# Contract function naming limits

`DetailPanel`'s "Top Soroban functions" bar chart
(`components/dashboard/ContractFunctionBarChart.tsx`) ranks a selected
contract's invoked functions by operation count. The function names it shows
come from `lib/entities/contract-function-breakdown.ts`'s
`buildContractFunctionBreakdown`, which reads the events treemap built from
`lib/hubble/shared-queries.mjs`'s `sorobanFunctionQuery` /
`sorobanFunctionContractQuery`. Both derive `function_name` the same way:

```sql
CASE
  WHEN soroban_operation_type = 'invoke_contract'
    AND parameters_decoded[SAFE_OFFSET(1)].type = 'Sym'
  THEN parameters_decoded[SAFE_OFFSET(1)].value
  ELSE soroban_operation_type
END AS function_name
```

## What this means for the names you see

- **A real method name** — e.g. `transfer`, `swap` — is shown only when the
  operation is `invoke_contract` *and* its first parameter is a Soroban
  `Sym` (symbol), which is how a contract call's invoked method is
  conventionally encoded. This covers the large majority of normal contract
  calls.
- **A raw operation type** — e.g. `extend_footprint_ttl`,
  `restore_footprint`, or `invoke_contract` itself — is shown when either
  condition doesn't hold: a non-invoke Soroban operation, or an
  `invoke_contract` whose first argument isn't a plain symbol (uncommon, but
  not disallowed by the protocol). This is not a bug or a missing label —
  it's the operation type itself, same as every other category label in this
  app, and it is never hidden or merged into an "Unknown" bucket.
- **Per-contract limit**: at most `TOP_FUNCTIONS_PER_CONTRACT` (15, in
  `lib/hubble/shared-queries.mjs`) functions are kept per contract, ranked by
  operation count. A contract that genuinely has more than 15 distinct
  observed functions in a period only shows its top 15 here — the panel
  doesn't claim completeness beyond that, and `ContractFunctionBarChart`
  shows the configured limit in its caption (`Top {configuredLimit} ...`) so
  that bound is visible, not implied.

## Why this isn't "fixed" to always show a real name

Treating the fallback operation-type string as if it were a method name
would be more pleasant to read but would misrepresent what was actually
observed — the app would be asserting a function identity the raw operation
data doesn't support. The raw operation type is shown as-is instead, the
same choice this app makes elsewhere when a label can't be resolved (see,
e.g., how an unlabeled address is handled in
`docs/remittance-corridors.md`).
