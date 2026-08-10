# Nutrition tracking design

Status: Approved
Scope: Apple Health dietary metrics — parsing, dashboard charts, overview card, and
detailed report table

## Summary

AHDReport currently has no nutrition support: `Metric` has no dietary member, the
Apple Health parser's `typeMap` maps no `HKQuantityTypeIdentifierDietary*` type, and
neither the dashboard nor the detailed report has a nutrition section. This design
adds six nutrition metrics — dietary energy, carbohydrates, sugar, fiber, protein, and
fat — following the existing per-metric patterns already used for vitals, activity,
and mobility, and fixes a pre-existing daily-aggregation bug that nutrition would
otherwise inherit.

## Data model

Six new members are added to the `Metric` union in [src/shared/types.ts](../../src/shared/types.ts):

- `dietaryEnergy`
- `carbs`
- `sugar`
- `fiber`
- `protein`
- `fat`

`HealthRecord` is unchanged — nutrition entries are ordinary records carrying one of
these metric tags. All six are independent metrics with their own chart panel and
table column; sugar is not nested under carbs, it sits alongside it (matching how
Apple Health, and the app's existing metric model, already treats them as distinct
quantity types).

## Parser mapping

[electron/appleHealthParser.ts](../../electron/appleHealthParser.ts) gets six new
`typeMap` entries:

| HealthKit identifier | Metric | Unit |
|---|---|---|
| `HKQuantityTypeIdentifierDietaryEnergyConsumed` | `dietaryEnergy` | kcal |
| `HKQuantityTypeIdentifierDietaryCarbohydrates` | `carbs` | g |
| `HKQuantityTypeIdentifierDietarySugar` | `sugar` | g |
| `HKQuantityTypeIdentifierDietaryFiber` | `fiber` | g |
| `HKQuantityTypeIdentifierDietaryProtein` | `protein` | g |
| `HKQuantityTypeIdentifierDietaryFatTotal` | `fat` | g |

No new value-transform logic is needed (unlike `sleep`'s start/end-to-duration
conversion) — the existing generic numeric path (`Number(r.value)`, `r.unit`) applies
directly. Units and existence are read from the export itself, so a nutrient absent
from a given export is simply absent from `records`, satisfying "where available."
Deduplication, sorting, and diagnostics require no changes since they operate
generically over `Metric`.

## Report metadata

[src/report.ts](../../src/report.ts) gets:

- `labels`: "Dietary energy", "Carbohydrates", "Sugar", "Fiber", "Protein", "Fat".
- `decimalsByMetric`: 0 for `dietaryEnergy` (whole kcal), 1 for the four gram-based
  macros (`carbs`, `sugar`, `fiber`, `protein`, `fat`).
- `colorsByMetric`: six new distinct shades, chosen for contrast against each other
  and against colors already used elsewhere in the same table/legend context.
- `metricGroups`: a new `"Nutrition"` group listing all six metrics, appended after
  `"Mobility"`.

No changes to `filtered`, `latest`, `median`, `change`, `daily`, `dailyTotals`,
`dailyStats`, `format`, or `dataSpan` — all are already generic over `Metric`.

## Dashboard: sum vs. average, and the existing bug

`MetricChart` in [src/App.tsx](../../src/App.tsx) currently renders every metric's
dashboard trend chart from `daily()`, which **averages** same-day entries. That is
correct for repeated point-in-time readings (weight, heart rate, body temperature)
but wrong for cumulative counters where Apple Health logs multiple entries per day
that represent portions of a whole-day total (steps, active energy burned, walking
distance — and now nutrition, where a day's intake is typically several food-log
entries: breakfast, lunch, dinner, snacks). The detailed tables already get this
right via `dailyTotals()` (see `ActivityReportTable`), so the dashboard charts and
detailed tables currently disagree with each other for `steps`, `activeEnergy`, and
`distance`.

This design fixes that inconsistency at the same time nutrition is added, since both
share the same code path:

- A `totalsMetrics` array is added to `App.tsx`: `steps`, `distance`, `activeEnergy`,
  `dietaryEnergy`, `carbs`, `sugar`, `fiber`, `protein`, `fat`.
- `MetricChart` sums per day for any metric in `totalsMetrics` (via `dailyTotals()`,
  mapped to `{date, value, unit}` and sorted ascending by date for left-to-right
  chart order) and continues averaging via `daily()` for everything else.
- `RangeMetricChart` (heart rate, walking metrics) is untouched — it already uses
  `dailyStats()` and is not part of this change.

This changes the *rendered values* of the existing steps/active-energy/distance
dashboard charts (they will now match their already-correct detailed tables) but
changes no other behavior: table rendering, CSV/XLSX export, and PDF layout are
unaffected.

## Overview card

`highlights` in `App.tsx` gains `dietaryEnergy` as a fifth card, alongside weight,
heart rate, steps, and sleep, using the existing median/min/max card format already
used for `steps` ("Median · Min X · Max Y").

## Detailed report table

A new `NutritionReportTable` component in `App.tsx`, structurally mirroring
`ActivityReportTable`: per-metric daily totals via `dailyTotals()`, one row per date,
one column per metric rendered with `DailyTotalBar` against a shared per-column
max bound (`totalBounds`), truncation and per-metric coverage notes via the existing
`TableNotes`/`truncationNote`/`coverageNote` helpers. Column order: Dietary energy,
Carbohydrates, Sugar, Fiber, Protein, Fat. Rendered in the detailed-measurements
section alongside `VitalsReportTable`, `ActivityReportTable`, and
`WalkingReportTable`, and excluded from the generic per-metric `ReportTable` list the
same way activity and walking metrics already are.

## Export formats

No changes. `createCsv` and the XLSX builder already serialize every record generically via `labels[record.metric]`; new metrics appear automatically once labeled.

## Testing

- [tests/appleHealthParser.test.ts](../../tests/appleHealthParser.test.ts): new
  HealthKit dietary type fixtures map to the correct `Metric`/unit, and are counted
  in `imported` rather than `unsupported`.
- [tests/report.test.ts](../../tests/report.test.ts): new metrics appear in
  `metricGroups` under `"Nutrition"`, and have entries in `labels`/`decimalsByMetric`.
- A test covering `MetricChart`'s sum-vs-average branch, if a suitable test surface
  exists for that component; otherwise this is covered indirectly through
  `dailyTotals` (already tested) since the branch is a thin wrapper over it.

## Out of scope

- No manual nutrition entry — matches the existing read-only-measurements
  constraint already stated for medication.
- No derived/relational display (e.g., sugar as a percentage of carbs, or calories
  recomputed from macros) — each metric is shown independently, consistent with how
  every other metric in the app is treated.
- No changes to PDF layout geometry beyond what naturally follows from adding one
  more `metricGroups` entry and one more detailed-report table (same mechanism
  Mobility and Walking already use).
