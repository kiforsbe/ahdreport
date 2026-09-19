# Blood Glucose Tracking and Additional Health Categories Design

**Status:** Draft for review

**Goal:** Import Apple Health blood glucose and insulin delivery, and present them as a diabetes-oriented report: a glucose overview tile, a dedicated Blood glucose dashboard section (summary card, context timeline, descriptive associations, typical-day profile, meal context), and a detailed daily glucose table. At the same time, import additional Apple Health categories (body composition, respiratory and oxygen, cardio fitness) into the existing Vitals and Sleep & activity groups.

**Prototypes:** `docs/design/prototypes/glucose-summary.html` (summary side) and `docs/design/prototypes/glucose-detailed.html` (detailed side). They open directly from disk and use synthetic data with CGM, fingerstick, no-data, and PDF-width toggles. The calculations in `docs/design/prototypes/glucose-data.js` are the reference behavior for this spec. The original mockups are in `docs/design/mockups/`.

## Product decisions

Glucose tracking covers type 2 diabetes first. Target-range presets also cover type 1 diabetes, pregnancy (pre-existing or gestational), and a non-diabetic reference, plus a custom range. The presets only change the target range. There is no diabetes-type field and no type-specific logic.

Blood glucose and insulin delivery are ordinary numeric `Metric`s. They are not a separate event stream. Meal-time and delivery-reason context goes in the existing optional `HealthRecord.category` field. Filtering, coverage metadata, detailed-table limits, and CSV/XLSX export therefore work without new plumbing.

Glucose is always displayed in mmol/L. The parser converts mg/dL on import.

Metrics based on continuous glucose monitoring (CGM) appear only when the data is dense enough to support them: time-weighted time in range, GMI (glucose management indicator, an estimated HbA1c), coefficient of variation, and the typical-day percentile profile. Spot readings, such as fingerstick measurements, get count-based percentages with explicit "not time in range" wording.

All analysis is descriptive. The UI never gives dosing guidance, alerts, diagnoses, or risk scores. Insulin is shown as context but is never used in an association or comparison.

The new non-glucose categories extend the existing dashboard groups and use the generic `ReportTable`. They get no new sections or specialised tables.

## Data model

Extend `Metric` in `src/shared/types.ts`:

```ts
  | "bloodGlucose"
  | "insulinDelivery"
  | "bodyMassIndex"
  | "bodyFatPercentage"
  | "waistCircumference"
  | "leanBodyMass"
  | "oxygenSaturation"
  | "respiratoryRate"
  | "heartRateVariability"
  | "vo2Max"
  | "walkingHeartRateAverage"
```

Category values used on `HealthRecord.category`:

| Metric | Metadata key (export XML) | Value → category |
|---|---|---|
| `bloodGlucose` | `HKBloodGlucoseMealTime` | `1` → `"beforeMeal"`, `2` → `"afterMeal"`, absent → `undefined` |
| `insulinDelivery` | `HKInsulinDeliveryReason` | `1` → `"basal"`, `2` → `"bolus"`, absent → `undefined` |

HealthKit has no fasting meal-time value. The UI must not infer "fasting" or any other meal context from timing. Untagged readings stay untagged.

`labels`, `decimalsByMetric`, and `colorsByMetric` in `src/report.ts` gain entries for every new metric. Glucose uses 1 decimal and insulin uses 1 decimal. Glucose uses `#4263eb` and insulin uses `#9c36b5`.

## Parser (`electron/appleHealthParser.ts`)

### Type mapping

| HealthKit identifier | Metric |
|---|---|
| `HKQuantityTypeIdentifierBloodGlucose` | `bloodGlucose` |
| `HKQuantityTypeIdentifierInsulinDelivery` | `insulinDelivery` |
| `HKQuantityTypeIdentifierBodyMassIndex` | `bodyMassIndex` |
| `HKQuantityTypeIdentifierBodyFatPercentage` | `bodyFatPercentage` |
| `HKQuantityTypeIdentifierWaistCircumference` | `waistCircumference` |
| `HKQuantityTypeIdentifierLeanBodyMass` | `leanBodyMass` |
| `HKQuantityTypeIdentifierOxygenSaturation` | `oxygenSaturation` |
| `HKQuantityTypeIdentifierRespiratoryRate` | `respiratoryRate` |
| `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `heartRateVariability` |
| `HKQuantityTypeIdentifierVO2Max` | `vo2Max` |
| `HKQuantityTypeIdentifierWalkingHeartRateAverage` | `walkingHeartRateAverage` |

### Metadata

`MetadataEntry` children (`key`/`value` attributes, one element or an array) are read only for `bloodGlucose` and `insulinDelivery` records. All other records skip metadata work, so import cost for large exports does not change.

### Unit normalization

This step runs before the plausibility check and before the deduplication key is built.

- **Glucose:** `mg/dL` values are divided by 18.0156 and the unit becomes `mmol/L`. The mmol unit is exported as a string that embeds the molar mass, such as `mmol<180.15588000005408>/L`. Values in that unit are already mmol/L, and the unit is rewritten to `mmol/L`. Converted values keep full precision; rounding happens only at display time.
- **Fraction percentages:** `oxygenSaturation` and `bodyFatPercentage` are stored by Apple as fractions with unit `%` (for example `0.97`). A value ≤ 1 with unit `%` is multiplied by 100.

### Plausibility bounds

These are added to `plausibleRanges`:

| Metric | Unit | Range |
|---|---|---|
| `bloodGlucose` | mmol/L | 1.0–40 |
| `insulinDelivery` | IU | 0–300 |
| `oxygenSaturation` | % | 50–100 |
| `respiratoryRate` | count/min | 4–60 |
| `heartRateVariability` | ms | 1–300 |
| `bodyMassIndex` | count | 10–80 |
| `bodyFatPercentage` | % | 2–75 |
| `waistCircumference` | cm | 40–200 |
| `waistCircumference` | in | 16–80 |
| `vo2Max` | mL/min·kg | 5–90 |
| `walkingHeartRateAverage` | count/min | 30–220 |

Unit strings are matched exactly as they appear after normalization.

### Deduplication

Deduplication is unchanged (metric, timestamp, value, unit, source). The key is built from the normalized value and unit. Apple exports each type in a single preferred unit, so no special handling across units is needed.

## Calculations (`src/glucose.ts`, new)

`src/report.ts` is already large (~800 lines), so glucose logic lives in a new pure module that imports shared helpers (`median`, `quantile`, `formatDate`) from `report.ts`.

Every helper below takes the selected period's full `HealthRecord[]`, meaning all metrics, and selects `bloodGlucose`, `insulinDelivery`, `carbs`, `exerciseTime`, and `sleep` records internally. The input is already sorted ascending, which is the parser's invariant, so helpers must not re-sort.

### Target range

```ts
export type GlucosePresetId = "type2" | "type1" | "pregnancy" | "reference" | "custom";
export interface GlucoseRange { preset: GlucosePresetId; low: number; high: number }
export const glucosePresets: { id: GlucosePresetId; label: string; low: number; high: number }[];
```

| Preset | Label | Range (mmol/L) |
|---|---|---|
| `type2` (default) | Type 2 diabetes | 3.9–10.0 |
| `type1` | Type 1 diabetes | 3.9–10.0 |
| `pregnancy` | Pregnancy / gestational | 3.5–7.8 |
| `reference` | Non-diabetic reference | 3.9–7.8 |
| `custom` | Custom | pre-filled 4.0–10.0, the common Swedish clinical shorthand |

A custom range is valid when 2.0 ≤ low < high ≤ 20.0. Invalid input keeps the last valid value.

`classifyGlucose(value, range)` returns `"below" | "within" | "above"`. The boundaries are inclusive for within.

### Summary

`glucoseSummary(records, range, from, to)` covers the `bloodGlucose` records in the window and returns:

- `count`, `daysWithReadings`, `windowDays`
- `latest` (record), `median`, `mean`, `sd`, `cv` (SD / mean × 100)
- `coverage`: distinct 15-minute slots containing at least one reading, divided by `windowDays × 96`
- `dense`: `daysWithReadings >= 14 && coverage >= 0.7`
- `split`: the `below`/`within`/`above` shares
  - When `dense`, each reading is weighted by `min(gap to next reading, 15 min)`, with 5 min for the last reading.
  - Otherwise each reading counts once.
- `gmi`: `3.31 + 0.02392 × mean × 18.0156`, as %. Returned only when `dense`. The UI also shows the IFCC value, `(gmi − 2.152) / 0.09148` mmol/mol.
- `mealContext`: medians and counts for `beforeMeal`, `afterMeal`, and untagged readings.

### Daily rows

`glucoseDaily(records, range)` returns rows sorted newest first, with one row per local calendar day that has at least one reading. Each row contains:

- `count`, `min`, `max`, `average`, `standardDeviation`, `median`
- per-day below/within/above counts
- `beforeMealMedian`, `afterMealMedian`
- basal and bolus insulin totals (IU)
- the day's readings, carbohydrate records, insulin records, and activity sessions, used by the trace

### Typical-day profile

`glucoseHourlyProfile(records)` returns 24 hour-of-day buckets. Each bucket has p5, p25, p50, p75, and p95, using `quantile` from `report.ts`. It is only called when `dense`.

### Context events

- `activitySessions(records)`: consecutive `exerciseTime` records are merged into one session when each starts at most 10 minutes after the previous one ends. The end is the start plus the value in minutes. Sessions shorter than 10 minutes are dropped.
- `sleepNights(records)`: `sleep` records are grouped into nights. Only asleep categories count; in-bed and awake records are excluded. Segments are merged when the gap between them is 60 minutes or less. Wake time is the end of the last segment, and `hours` is the summed asleep duration. A night is attributed to the calendar date of its wake time.

### Associations

`glucoseAssociations(records)` returns `{ n, value? }` for three comparisons. Each value is reported only when it meets its minimum sample size; otherwise the UI shows how many samples exist ("2 of 5").

| Comparison | Baseline | Measured change | Minimum |
|---|---|---|---|
| After logged carbohydrates | last reading in the 30 minutes before the carb record | highest reading within the following 2 hours, minus baseline; median across pairs | 5 pairs |
| After logged activity | last reading in the 30 minutes before session start | reading closest to start + 2 h (within ±1 h), minus baseline; median across pairs | 5 pairs |
| After shorter nights | nights are split at the median sleep duration | median first morning reading after shorter nights minus the same after longer nights | 3 nights in each group |

For the sleep comparison, the first morning reading is the first reading after wake time, before the first carbohydrate record and within 2 hours of waking.

## Summary UI

### Overview tile

`OverviewCards` gains a Blood glucose tile after Dietary energy. It is rendered only when the full import contains any `bloodGlucose` records, so exports without glucose keep the current five tiles. App passes `hasGlucose` down. The grid becomes six columns when the tile is present.

- **Value:** median in mmol/L over the card's period.
- **Subtitle:** `Median · 71% of time in 3.9–10.0` when dense, or `Median · 68% of readings in 3.9–10.0` otherwise.
- The same tile appears in the lazily computed Last year and All time disclosures.

### Blood glucose section (`src/components/GlucoseOverview.tsx`)

The section renders after `SymptomOverview` and before the dashboard groups, and it uses the selected report period. It is omitted entirely when the selected period has no `bloodGlucose` records and the import has none. It shows an empty-state row ("No blood glucose readings were found for this period.") when the import has glucose but the period does not.

It contains, in order:

1. **Heading row.**
   - Eyebrow "Metabolic", heading "Blood glucose", and one line of copy.
   - Right-aligned target-range control: a preset `<select>`, plus two number inputs when Custom is selected.
   - In print layout the control is hidden and replaced by the plain text `Target range: <label>, <low>–<high> mmol/L`.
2. **Summary card (`GlucoseSummaryCard`).**
   - Left column: latest reading (large value, date and time), then median. When dense it adds time in range, GMI with mmol/mol, and CV. Otherwise it adds readings in range and SD.
   - Right column: the "Daily range and median" chart. Each day has a min–max bar and a median dot, and the median line breaks across days without readings. The target band is shaded and y starts at 0. It matches the `RangeMetricChart` visual language.
   - Below the chart: the below/within/above split bar with a labelled legend and a caption. The caption reads "Share of time, weighted by continuous readings." when dense and "Share of recorded readings, not time in range." otherwise.
   - Footer: `N readings · X of Y days`, plus a density chip. Dense: `Continuous data · 96% coverage`. Sparse: `Spot readings · time-based metrics need ≥14 days and ≥70% coverage`.
3. **Overview grid.** This reuses the `symptom-overview-grid` proportions.
   - **`GlucoseTimeline` panel.**
     - Readings plot with the target band. Spot readings are dots coloured by status. Continuous data is drawn as a line of hourly medians, broken at gaps longer than 2 hours, with out-of-range hours marked.
     - Four aligned lanes: Carbohydrates (tick height by grams), Insulin (solid tick for bolus, outlined for basal), Activity (bar width by duration), and Sleep (night intervals).
     - A few direct labels on extremes, such as the largest carb entries and the shortest and longest nights, with collision avoidance.
     - A hover crosshair and tooltip that list what was logged within ±90 minutes.
     - For selected periods longer than 45 days, the plot switches to daily median and min–max, and the lanes aggregate per day (carb total, insulin totals, activity minutes, sleep hours).
   - **`GlucoseAssociationPanel`.** Three rows from `glucoseAssociations`, followed by the callout "Descriptive comparison only. It does not establish cause, and it is not guidance on medication or insulin doses."
4. **Secondary grid.** Each panel appears only when applicable, and a lone panel spans the full width.
   - **`GlucoseDailyPattern` ("Typical day"):** dense data only. Median line, 25–75 and 5–95 bands over 24 hours, target band, and one direct label for the median peak.
   - **Meal context:** only when some readings carry a meal-time tag. Before meal, After meal, and Not tagged rows show count and median. The note reads "Readings without a tag are not guessed from nearby meals."

The selected range is `App` state (`glucoseRange`). It is session-only and not persisted, and it defaults to the `type2` preset. It is passed to `OverviewCards`, `GlucoseOverview`, and `GlucoseReportTable`. All derived values are memoized on `[records, glucoseRange]`, and the section components are wrapped in `React.memo` like the existing charts.

### Charts and PDF

The glucose charts are custom SVG with a fixed `viewBox`, `width: 100%`, and no `ResponsiveContainer`, following the `DailyDistribution` pattern. They do not carry `data-pdf-chart-ready` (that marker is for Recharts canvases), so the print-readiness check is unaffected. Compact PDF leaves them as vectors, and their size is small. Print layout stacks the section's grids into one column.

### Other new metrics in the dashboard

`metricGroups` gains:

- **Vitals:** `bodyMassIndex`, `bodyFatPercentage`, `waistCircumference`, `leanBodyMass`, `heartRateVariability`, `oxygenSaturation`, `respiratoryRate`
- **Sleep & activity:** `vo2Max`, `walkingHeartRateAverage`

They render through the existing `MetricChart` panel loop, which already skips metrics absent from the period. `bloodGlucose` and `insulinDelivery` are not added to any group; they appear only in the Blood glucose section.

## Detailed report (`src/components/tables/GlucoseReportTable.tsx`, new)

The table is inserted after `SymptomsReportTable` and before `VitalsReportTable`, matching the dashboard order. Row limits use `MAX_TABLE_ROWS` / `MAX_PDF_TABLE_ROWS`, with `truncationNote` and `coverageNote` as in the other tables.

Notes above the table:

- the target range, with its label;
- "Range columns are shares of recorded readings, not time in range." Dense data adds the coverage figure instead.

| Column | Content |
|---|---|
| Date | `formatDate` |
| Readings | count |
| Daily distribution (mmol/L) | `DailyDistribution` with a new optional `band?: { low, high }` prop that shades the target range behind the marks. Glucose uses a fixed column scale of `[min(2, colMin), max(14, colMax)]` so the band sits in the same place on every row. |
| Below / within / above | per-day split bar (2 px gaps) plus `b / w / a%` text |
| Before / after meal | median mmol/L for each tag, or `—`. The column appears only when any tagged reading exists and is hidden in print layout to fit 718 px. |
| Across the day | new `GlucoseDayTrace`, 240 px (190 px in print). x is clock time from 00 to 24; the existing `DayTrace` spaces points by index and cannot be reused. It has the target band, dots coloured by status (or a line when there are more than 40 readings, broken at gaps longer than 20 minutes), and a marker row for carbohydrates, insulin (solid bolus, outlined basal), and activity. The header cell carries a single 00 / 06 / 12 / 18 / 24 axis. |
| Insulin (IU) | `basal / bolus` totals, or `—` |

A legend below the table covers status colours and marker types, followed by "Markers appear only when those records exist in the Apple Health export."

The other new metrics fall through to the existing generic `ReportTable` loop in `App.tsx`, which iterates `metricGroups` minus the specialised metrics. No change to the loop is needed.

## Export

No structural change. Glucose and insulin rows export with their normalized value and unit (mmol/L, IU), and the meal-time and delivery context appears in the existing Category column. The display label is taken from `labels`. Tests cover one glucose and one insulin row.

## Styling and copy

- Use the existing surfaces, card and panel styles, and type scale. The section accent is the brand blue `#4263eb` (eyebrow, callout border), which distinguishes it from the amber used for Symptoms.
- New CSS classes are prefixed `glucose-`. The print and ≤800 px rules collapse grids to one column.
- Status colours were validated with the dataviz palette validator: below `#c92a2a`, within `#51cf66`, above `#d9480f`. The target band is `rgba(81, 207, 102, 0.13)`. Colour is always paired with a text label or with position relative to the band.
- Context lanes use carbohydrates `#f08c00` (the app's existing carbs colour), insulin `#9c36b5`, activity `#0ca678`, and sleep `#4c6ef5`. All lanes are direct-labelled.
- Required copy: "Blood glucose", "Target range", "Share of recorded readings, not time in range.", "Observed associations", and "Descriptive comparison only. It does not establish cause, and it is not guidance on medication or insulin doses."

## Testing

- **Parser** (`tests/appleHealthParser.test.ts`):
  - all new type mappings;
  - mg/dL → mmol/L conversion;
  - the `mmol<…>/L` unit rewrite;
  - fraction-to-percent normalization for SpO₂ and body fat;
  - meal-time and delivery-reason metadata, with single and array `MetadataEntry`;
  - absent or unknown metadata values;
  - plausibility rejection, applied after conversion.
- **Glucose helpers** (`tests/glucose.test.ts`):
  - range classification at the inclusive boundaries;
  - the density gate at 13/14 days and 69%/70% coverage;
  - time-weighted versus count-based split;
  - GMI and IFCC values;
  - CV;
  - meal-context medians;
  - daily rows including insulin totals;
  - hourly profile percentiles;
  - activity-session merging;
  - sleep-night grouping, excluding in-bed and awake;
  - each association including its insufficient-sample path;
  - custom-range validation.
- **Components** (`tests/glucoseComponents.test.tsx`):
  - section omitted without glucose;
  - empty state when the import has glucose but the period does not;
  - dense versus sparse wording and chip;
  - Typical day only when dense;
  - meal context only when tagged;
  - the preset change updates the split;
  - print layout shows plain-text range;
  - overview tile shown only when glucose exists.
- **Tables:** `GlucoseReportTable` rows, meal column conditional, print column hidden, and truncation note.
- **Export:** a glucose row and an insulin row with their category.

## Scope exclusions

- Manual entry of glucose, insulin, meals, or HbA1c.
- HbA1c laboratory values. HealthKit has no quantity type for them; they exist only as clinical (FHIR) records, which this app does not parse. GMI is the estimate shown instead.
- Alerts, hypoglycaemia warnings, dosing guidance, and insulin-based associations.
- Inferred fasting or meal context.
- A mg/dL display toggle.
- The five-band CGM split (very low < 3.0, low, in range, high, very high > 13.9). The three-band split matches the mockups; five bands are a candidate follow-up for dense data.
- Persisting the target range between sessions, or a patient-defaults environment variable for it.
- Workout (`<Workout>`) elements. Activity context comes from `exerciseTime` records.

## Follow-ups noted during design

- `walkingAsymmetry` and `doubleSupport` are also Apple fraction-percent types. Check a real export to see whether they currently display as fractions; if so, apply the same normalization in a separate change.
- `docs/ARCHITECTURE.md` states a 90-day PDF table limit, but `MAX_PDF_TABLE_ROWS` is 365. Update the document alongside this work.
- Glucose helpers group readings by local calendar day, which matches `filtered()`'s local-day boundaries and the clock-time trace. The existing `daily()` and `dailyStats()` group by UTC date (`date.slice(0, 10)`). Aligning them is a separate change.
