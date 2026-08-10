# Chart analysis: plateaus, outliers, and blood pressure metrics

Status: Approved
Scope: Dashboard trend/range charts, the Apple Health parser's validity filtering

## Summary

The dashboard's trend charts currently plot raw daily values (or daily totals) with no
analysis layered on top: a continuously noisy line for cumulative/logged metrics, plain
range bars for gait/heart-rate metrics, and a two-series range chart for blood
pressure. This design adds four analytical layers, chosen per metric rather than
applied uniformly:

1. **Plateau segmentation** — a change-point-merged step overlay for noisy
   totals-style metrics and weight, showing "this was the stable level for this
   stretch" instead of a constantly wiggling line.
2. **Outlier call-outs** — a shared, reusable flag for statistically unusual days,
   applied across every chart type.
3. **Blood pressure derived metrics** — pulse pressure and mean arterial pressure
   (MAP), computed from data already imported.
4. **Blood pressure category strip** — a day-by-day AHA category view alongside the
   existing BP range chart.

A fifth, unrelated-but-concurrent change tightens data quality at the source: the
Apple Health parser gets physiological plausibility bounds, so a sensor glitch (a
heart rate of 0, a corrupted unit conversion) can't skew every one of the above.

**Outliers vs. invalid data — a hard distinction maintained throughout this design:**
an outlier is statistically unusual but physiologically real, kept and highlighted
because it may be the most clinically important point in the chart. Invalid data is
physiologically impossible or a clear glitch, excluded before it reaches analysis at
all. The two mechanisms never share code or thresholds.

## 1. Plateau segmentation

### Algorithm

**Base buckets:** groups of 7 consecutive *days-with-data*, taken by position in the
already-computed daily series — not calendar weeks. This avoids calendar-anchoring
issues on arbitrary report periods (`from`/`to` are rarely week-aligned) and degrades
gracefully on sparse data (nutrition logging in particular): a "week" bucket is simply
the next 7 real observations, however far apart they fall.

**Merge pass**, greedy, left to right: start the current segment at bucket 1. For each
following bucket, compare its mean to the current segment's running mean (recomputed
over all days absorbed into it so far). Merge if:

```
|meanDiff| ≤ 0.75 × max(pooledSD, noiseFloor)
```

where `pooledSD` is the simple average of the two buckets' own standard deviations,
and `noiseFloor` is 2% of the metric's overall value range across the displayed
series (so a suspiciously flat bucket — e.g. a week of identical weight readings —
can't drive the threshold to zero and block all merging). A non-merge closes the
current segment and starts a new one from the next bucket. `0.75` and `2%` are
heuristic defaults, not statistically derived — expect to retune once real data is
visible.

**Minimum data guard:** fewer than 14 days-with-data in the period → return no
segments. The chart then shows only the raw line; there isn't enough data to say
anything about regime changes.

### New pure function (`src/report.ts`)

```ts
export function plateaus(
  records: HealthRecord[],
  metric: Metric,
  aggregate: "average" | "total" = "average",
): { date: string; value: number; unit: string }[]
```

Same output shape as `daily()` — one entry per day, but every day within a merged
segment carries that segment's mean as `value`. Internally calls `daily(records,
metric, aggregate)` first, buckets/merges its rows, then expands the segments back
out so every input date has a matching plateau row. This shape makes it trivial to
zip with `daily()`'s own rows by date when building chart data.

### Rendering

In each qualifying `MetricChart` panel, merge `daily()` and `plateaus()` rows by date
into one row set carrying both `value` (raw) and `plateau` (segment mean). Draw the
existing raw area/line faint (unchanged), and add a second series using Recharts'
native `type="stepAfter"` line interpolation for the plateau — a documented Recharts
feature, no custom path-drawing needed. The plateau line uses the same
`colorsByMetric[metric]` as the raw series, at full opacity/weight, so the raw line
reads as "faint background," the plateau as "the answer."

**Applies to:** steps, active energy, distance, exercise time, dietary energy, fiber,
protein, fat, and weight.

**Carbohydrates is a special case:** `CarbsChart` already renders a two-layer stacked
area (sugar at the base, other-carbs on top, summing to total carbs). Adding a
per-layer plateau there would be visually unreadable. Instead, the plateau is computed
on the **total** carbs series only (`plateaus(records, "carbs", "total")`) and drawn
as a single `stepAfter` line traced along the *top* of the existing stack — same
regime signal, stack stays legible.

**Does not apply to:** sugar (folded into the carbs panel above), heart rate and the
four walking/gait metrics (`RangeMetricChart` — these get outlier call-outs instead,
see below), blood pressure, sleep, medication, and the sparser mobility metrics
(six-minute walk, stair ascent/descent speed) where 14+ days of data is uncommon
enough that the guard will usually suppress the overlay anyway.

## 2. Outlier call-outs

### New pure function (`src/report.ts`)

```ts
export function outlierDates(
  rows: { date: string; value: number }[],
): Set<string>
```

Applies the same Tukey-fence test already used elsewhere in this codebase
(`boundsOf()` in `App.tsx`, used today for heart-rate "sustained" bounds): a date is
an outlier if its value falls outside `[Q1 − 1.5×IQR, Q3 + 1.5×IQR]` for the given
series. Generic over `{date, value}[]` so every chart type can reuse it without
depending on a specific `Metric`.

### Rendering

Applied broadly, across every chart built in this app — both the plateau-eligible
metrics above and the ones that aren't:

- **`MetricChart`** (plain trend charts): outlier test run on the raw daily series
  (`daily()`'s rows, independent of any plateau).
- **`RangeMetricChart`** (heart rate, walking speed, step length, walking asymmetry,
  double support): outlier test run on each day's `average`.
- **`BloodPressureChart`**: outlier test run independently on the systolic and
  diastolic daily-average series (different distributions, tested separately; a day
  can be flagged on one, both, or neither).
- **The new pulse pressure / MAP panel** (below): outlier test run on each derived
  series independently.
- **`CarbsChart`**: outlier test run on the total carbs series (same series the
  plateau line above uses).

Marked with a distinct ring/dot on the flagged point (a custom Recharts `dot`
renderer that returns a marker only for outlier dates, nothing for normal ones), plus
a short text line under the chart naming the specific date(s) and value(s) — capped
at 5 entries, chronological order, so a genuinely noisy series doesn't produce a wall
of text. This keeps outliers from being a marker someone might miss; they're stated
plainly.

## 3. Blood pressure derived metrics

### New pure function (`src/report.ts`)

```ts
export interface BpDerivedDay {
  date: string;
  unit: string; // "mmHg"
  systolic: number;
  diastolic: number;
  pulsePressure: number; // systolic − diastolic
  map: number;           // diastolic + pulsePressure / 3
  category: BpCategory;  // see section 4
}
export function bpDerived(records: HealthRecord[]): BpDerivedDay[]
```

Joins `dailyStats(records, "bloodPressureSystolic")` and
`dailyStats(records, "bloodPressureDiastolic")` by date (only days with both present),
using each day's average, and computes pulse pressure, MAP, and AHA category in one
pass. Both the derived-metrics panel and the category strip (section 4) consume this
same function, so the systolic/diastolic join only happens once.

### Rendering

A new panel/component rendered alongside (not merged into) the existing
`BloodPressureChart` composed range chart, which stays visually busy enough on its
own. Plain two-line trend chart (pulse pressure, MAP), following the same conventions
already established this session: per-series color, `niceAxisMin`-scaled y-axis
(these values cluster well above zero for almost everyone), and outlier call-outs as
described above. Two new fixed colors are used for these two lines specifically —
they're derived, chart-only quantities with no backing `HealthRecord`/`Metric`, so
they don't belong in `colorsByMetric` (which represents importable measurement
types).

## 4. Blood pressure category strip

### New pure values (`src/report.ts`)

```ts
export type BpCategory = "Normal" | "Elevated" | "Stage 1" | "Stage 2" | "Crisis";
export function bpCategory(systolic: number, diastolic: number): BpCategory;
export const bpCategoryColors: Record<BpCategory, string>;
export const bpCategoryOrder: BpCategory[]; // Normal → Crisis, for stable summary ordering
```

Classification follows the 2017 ACC/AHA guideline thresholds, checked most-severe
first so either value crossing a threshold is sufficient to escalate the category:

| Category | Threshold |
|---|---|
| Crisis | systolic > 180 or diastolic > 120 |
| Stage 2 | systolic ≥ 140 or diastolic ≥ 90 |
| Stage 1 | systolic ≥ 130 or diastolic ≥ 80 |
| Elevated | systolic ≥ 120 and diastolic < 80 |
| Normal | systolic < 120 and diastolic < 80 |

Colors are a dedicated green→red severity ramp (`bpCategoryColors`), deliberately
*not* drawn from `colorsByMetric` — this is encoding risk severity, an ordinal scale,
not per-metric identity, and reusing the metric palette would send the wrong signal.

### Rendering

A thin row of colored day-cells (plain HTML/CSS, not SVG/Recharts — simpler than
`DailyTotalBar` since there's no magnitude to encode, only a category color) rendered
directly under the existing `BloodPressureChart`, inside its existing panel wrapper.
Only days with BP data get a cell — no gray placeholder cells for gaps, consistent
with how the rest of the app treats missing days. Each cell's `title` attribute shows
the date and category on hover. Below the strip, a one-line text summary: the
percentage of days (of those with BP data) in each category present in the period,
e.g. "62% Normal · 28% Elevated · 10% Stage 1", using `bpCategoryOrder` so the
breakdown always reads least-to-most severe.

## 5. Invalid-data filtering (Apple Health parser)

### Where

In `electron/appleHealthParser.ts`, alongside the existing (already-present, already
untallied) invalid-date/non-numeric-value skip in the main parsing loop — the natural
place, since this file is already the app's single validation boundary for untrusted
imported data, and filtering here keeps charts, detail tables, and CSV/XLSX export
consistent with each other. A record failing this check never enters
`HealthData.records`.

### Rule

```ts
function isPlausible(metric: Metric, value: number, unit: string): boolean {
  if (value < 0) return false;
  if (metric === "sleep") return value <= 24;
  const bounds = plausibleRanges[metric]?.[unit];
  return !bounds || (value >= bounds[0] && value <= bounds[1]);
}
```

A blanket non-negative check applies to every metric — no supported measurement in
this app is ever legitimately negative. On top of that, a small table of wide,
conservative, unit-aware bounds catches flagrant vitals glitches without
second-guessing genuine extremes:

| Metric | Unit | Bounds |
|---|---|---|
| `heartRate`, `restingHeartRate` | `count/min` | 20–300 |
| `bloodPressureSystolic` | `mmHg` | 60–250 |
| `bloodPressureDiastolic` | `mmHg` | 30–150 |
| `bodyTemperature` | `degC` | 30–45 |
| `bodyTemperature` | `degF` | 86–113 |
| `weight` | `kg` | 20–300 |
| `weight` | `lb` | 44–660 |
| `sleep` | (n/a — already hours) | ≤ 24 |

A metric/unit combination not listed is never rejected by this table — the function
fails open. These bounds are deliberately wide: the goal is only to catch
impossibilities (a zeroed-out sensor reading, a unit-conversion bug), never to filter
out a real but extreme reading a clinician might actually need to see. Counters
(steps, distance, active energy, nutrition macros, mobility speeds) rely solely on
the blanket non-negative check — there's no defensible universal upper bound to
invent for those, and their genuine outliers are better served by section 2's
outlier call-outs than by silent exclusion.

The unit strings above (`count/min`, `mmHg`, `degC`/`degF`, `kg`/`lb`) are the
standard values Apple Health uses for these record types; the parser doesn't
normalize or convert units today (`r.unit` is read verbatim from the XML), so the
table keys need to match exactly. Confirm the exact strings against a real export
sample while implementing — if a locale or device turns out to use something else,
the fail-open behavior means that record simply skips the tighter bounds check
rather than being wrongly rejected.

### Diagnostics

`ImportDiagnostics` (`src/shared/types.ts`) gains a new field:

```ts
implausible: number;
```

Incremented alongside the existing `unsupported` counter, populated the same way.
`App.tsx`'s diagnostics section gets one more line matching the existing
`unsupported`-count line exactly in style ("N record(s) were excluded as
physiologically implausible."), and a warning is added to `diagnostics.warnings`
when `implausible > 0`, following the same pattern as the existing medication/clinical
warnings.

## Testing

- `plateaus()`: a synthetic two-regime series (first half flat around X, second half
  flat around Y, gap much larger than in-segment noise) produces exactly two segments
  with correct date ranges and means; fewer than 14 days-with-data returns `[]`.
- `outlierDates()`: a series with one clear IQR-violating spike flags exactly that
  date; a series with no real outliers returns an empty set.
- `bpDerived()`: known systolic/diastolic pairs produce the expected pulse
  pressure/MAP arithmetic and are classified into the expected `BpCategory` at each
  threshold boundary (e.g. 118/76 → Normal, 125/78 → Elevated, 135/85 → Stage 1,
  145/95 → Stage 2, 185/125 → Crisis).
- Parser: an injected implausible record (e.g. heart rate far outside 20–300) is
  excluded, `diagnostics.implausible` increments, and the warning appears; a
  boundary-plausible record (e.g. heart rate exactly 20 or 300) is kept, confirming
  the bounds are inclusive and genuine extremes aren't falsely rejected.

## Out of scope

- Heart rate variability (SDNN) and cardio fitness (VO2max) — real, clinically
  meaningful metrics, but Apple Health tracks them under HealthKit identifiers this
  parser doesn't currently import. That's a data-import feature in its own right, a
  sibling project to this one, not a same-pass addition.
- Cross-field validation (e.g. rejecting a systolic/diastolic pair where diastolic
  exceeds systolic) — systolic and diastolic are independent `HealthRecord` entries
  at parse time with no guaranteed shared timestamp to pair them on; per-value bounds
  already catch the overwhelming majority of real glitches.
- Retuning the plateau merge constants (`0.75`, `2%`) against real exported data —
  flagged above as heuristic defaults, revisit once the feature is in use.
