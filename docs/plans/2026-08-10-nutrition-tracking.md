# Nutrition Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nutrition tracking (dietary energy, carbohydrates, sugar, fiber, protein, fat) to AHDReport's dashboard charts, overview cards, and detailed report table, sourced from Apple Health's dietary HealthKit records.

**Architecture:** Six new `Metric` union members flow through the existing generic pipeline (parser → `HealthRecord[]` → `report.ts` pure helpers → `App.tsx` rendering) with no new data structures. A pre-existing bug where dashboard trend charts average same-day cumulative entries instead of summing them (already fixed correctly in the detail tables) is fixed for `steps`/`distance`/`activeEnergy` at the same time nutrition is added, since nutrition needs the same daily-total behavior and touches the same code path.

**Tech Stack:** TypeScript, React 19, Recharts, Vitest. No new dependencies.

## Global Constraints

- Strict TypeScript (`strict: true` in both `tsconfig.json` and `tsconfig.electron.json`); every task must type-check under both.
- No new npm dependencies.
- No comments unless documenting a non-obvious "why" — this codebase writes none by default.
- Verification is `npx tsc -p tsconfig.json`, `npx tsc -p tsconfig.electron.json`, and `npm test` (Vitest). Per project convention, do not launch the app in a browser to verify UI changes — there is no component-test harness in this repo, and pure logic is fully covered by Vitest.
- Design reference: [docs/design/nutrition_tracking.md](../design/nutrition_tracking.md).

---

### Task 1: Nutrition metric types and Apple Health parser mapping

**Files:**
- Modify: `src/shared/types.ts:19-20`
- Modify: `electron/appleHealthParser.ts:28-29`
- Test: `tests/appleHealthParser.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Metric` union gains `"dietaryEnergy" | "carbs" | "sugar" | "fiber" | "protein" | "fat"`. `typeMap` in `appleHealthParser.ts` maps six `HKQuantityTypeIdentifierDietary*` HealthKit identifiers to these metrics. Every later task depends on these six string literals existing on `Metric`.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block to the end of `tests/appleHealthParser.test.ts` (after the existing `"clinical data in Apple Health ZIP exports"` block):

```ts
describe("nutrition records", () => {
  const nutritionXml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierDietaryEnergyConsumed" sourceName="MyFitnessPal" unit="kcal" value="650" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryCarbohydrates" sourceName="MyFitnessPal" unit="g" value="80" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietarySugar" sourceName="MyFitnessPal" unit="g" value="20" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryFiber" sourceName="MyFitnessPal" unit="g" value="8" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="MyFitnessPal" unit="g" value="25" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryFatTotal" sourceName="MyFitnessPal" unit="g" value="22" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/></HealthData>`;
  it("maps all six dietary identifiers to nutrition metrics", async () => {
    const result = await parseAppleHealthExport(
      Buffer.from(nutritionXml),
      "export.xml",
    );
    expect(result.diagnostics.unsupported).toBe(0);
    expect(result.records).toEqual([
      expect.objectContaining({ metric: "dietaryEnergy", value: 650, unit: "kcal" }),
      expect.objectContaining({ metric: "carbs", value: 80, unit: "g" }),
      expect.objectContaining({ metric: "sugar", value: 20, unit: "g" }),
      expect.objectContaining({ metric: "fiber", value: 8, unit: "g" }),
      expect.objectContaining({ metric: "protein", value: 25, unit: "g" }),
      expect.objectContaining({ metric: "fat", value: 22, unit: "g" }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/appleHealthParser.test.ts`
Expected: FAIL — all six records are currently unmapped, so `result.records` is empty and `result.diagnostics.unsupported` is `6`, not `0`.

- [ ] **Step 3: Add the six metrics to the `Metric` union**

In `src/shared/types.ts`, change:

```ts
  | "sixMinuteWalk"
  | "medication";
```

to:

```ts
  | "sixMinuteWalk"
  | "dietaryEnergy"
  | "carbs"
  | "sugar"
  | "fiber"
  | "protein"
  | "fat"
  | "medication";
```

- [ ] **Step 4: Add the six HealthKit identifiers to `typeMap`**

In `electron/appleHealthParser.ts`, change:

```ts
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: "sixMinuteWalk",
  HKClinicalTypeIdentifierMedicationRecord: "medication",
```

to:

```ts
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: "sixMinuteWalk",
  HKQuantityTypeIdentifierDietaryEnergyConsumed: "dietaryEnergy",
  HKQuantityTypeIdentifierDietaryCarbohydrates: "carbs",
  HKQuantityTypeIdentifierDietarySugar: "sugar",
  HKQuantityTypeIdentifierDietaryFiber: "fiber",
  HKQuantityTypeIdentifierDietaryProtein: "protein",
  HKQuantityTypeIdentifierDietaryFatTotal: "fat",
  HKClinicalTypeIdentifierMedicationRecord: "medication",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/appleHealthParser.test.ts`
Expected: PASS

- [ ] **Step 6: Type-check both projects**

Run: `npx tsc -p tsconfig.json && npx tsc -p tsconfig.electron.json`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts electron/appleHealthParser.ts tests/appleHealthParser.test.ts
git commit -m "Add nutrition metrics and Apple Health dietary type mapping"
```

---

### Task 2: Nutrition metric metadata and dashboard group

**Files:**
- Modify: `src/report.ts:22-95`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: `Metric` union from Task 1 (must already include the six nutrition members).
- Produces: `labels`, `decimalsByMetric`, and `colorsByMetric` have entries for all six nutrition metrics. `metricGroups` gains a `"Nutrition"` entry: `{ title: "Nutrition", metrics: ["dietaryEnergy", "carbs", "sugar", "fiber", "protein", "fat"] }`. Later tasks (App.tsx rendering) rely on this exact metrics array and on `labels`/`decimalsByMetric`/`colorsByMetric` being fully populated for these six keys.

- [ ] **Step 1: Write the failing test**

In `tests/report.test.ts`, change the import block from:

```ts
import {
  change,
  daily,
  dailyStats,
  filtered,
  latest,
  median,
} from "../src/report";
```

to:

```ts
import {
  change,
  daily,
  dailyStats,
  decimalsByMetric,
  filtered,
  labels,
  latest,
  median,
  metricGroups,
} from "../src/report";
```

Then add this new `describe` block at the end of the file:

```ts
describe("nutrition metric metadata", () => {
  const nutritionMetrics = [
    "dietaryEnergy",
    "carbs",
    "sugar",
    "fiber",
    "protein",
    "fat",
  ] as const;
  it("groups all six nutrition metrics under a Nutrition dashboard section", () => {
    const nutritionGroup = metricGroups.find(
      (group) => group.title === "Nutrition",
    );
    expect(nutritionGroup?.metrics).toEqual([...nutritionMetrics]);
  });
  it("labels dietary energy in whole kcal and macros to one decimal place", () => {
    expect(labels.dietaryEnergy).toBe("Dietary energy");
    expect(decimalsByMetric.dietaryEnergy).toBe(0);
    nutritionMetrics
      .filter((metric) => metric !== "dietaryEnergy")
      .forEach((metric) => expect(decimalsByMetric[metric]).toBe(1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/report.test.ts`
Expected: FAIL — `metricGroups` has no `"Nutrition"` entry yet and `labels.dietaryEnergy`/`decimalsByMetric.dietaryEnergy` are `undefined`.

- [ ] **Step 3: Add nutrition labels**

In `src/report.ts`, change:

```ts
  sixMinuteWalk: "Six-minute walk",
  medication: "Medication",
};
```

to:

```ts
  sixMinuteWalk: "Six-minute walk",
  dietaryEnergy: "Dietary energy",
  carbs: "Carbohydrates",
  sugar: "Sugar",
  fiber: "Fiber",
  protein: "Protein",
  fat: "Fat",
  medication: "Medication",
};
```

- [ ] **Step 4: Add nutrition decimal precision**

In `src/report.ts`, change:

```ts
  sixMinuteWalk: 1,
  medication: 0,
};
```

to:

```ts
  sixMinuteWalk: 1,
  dietaryEnergy: 0,
  carbs: 1,
  sugar: 1,
  fiber: 1,
  protein: 1,
  fat: 1,
  medication: 0,
};
```

- [ ] **Step 5: Add nutrition chart/table colors**

In `src/report.ts`, change:

```ts
  sixMinuteWalk: "#e8590c",
  medication: "#e03131",
};
```

to:

```ts
  sixMinuteWalk: "#e8590c",
  dietaryEnergy: "#e03131",
  carbs: "#f08c00",
  sugar: "#e64980",
  fiber: "#2f9e44",
  protein: "#4263eb",
  fat: "#9c36b5",
  medication: "#e03131",
};
```

These six are mutually distinct hues (red, orange, pink, green, blue, purple) so the six adjacent columns in the new nutrition table stay easy to tell apart, matching the existing per-table distinctness rule documented above `colorsByMetric`.

- [ ] **Step 6: Add the Nutrition dashboard group**

In `src/report.ts`, change:

```ts
  {
    title: "Mobility",
    metrics: [
      "walkingSpeed",
      "stepLength",
      "walkingAsymmetry",
      "doubleSupport",
      "stairAscentSpeed",
      "stairDescentSpeed",
      "sixMinuteWalk",
    ],
  },
];
```

to:

```ts
  {
    title: "Mobility",
    metrics: [
      "walkingSpeed",
      "stepLength",
      "walkingAsymmetry",
      "doubleSupport",
      "stairAscentSpeed",
      "stairDescentSpeed",
      "sixMinuteWalk",
    ],
  },
  {
    title: "Nutrition",
    metrics: ["dietaryEnergy", "carbs", "sugar", "fiber", "protein", "fat"],
  },
];
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/report.test.ts`
Expected: PASS

- [ ] **Step 8: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "Add nutrition metric labels, decimals, colors, and dashboard group"
```

---

### Task 3: Daily-total aggregation option in `daily()`

**Files:**
- Modify: `src/report.ts:128-144`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `daily(records, metric, aggregate?: "average" | "total")` — third parameter, defaults to `"average"` (identical behavior to today when omitted). `"total"` sums same-day values instead of averaging them. Task 4 depends on this exact signature and the `"average" | "total"` literal union.

- [ ] **Step 1: Write the failing test**

In `tests/report.test.ts`, add this test immediately after the existing `"averages measurements per day for a trend"` test inside the `"report model"` describe block:

```ts
  it("sums measurements per day when total aggregation is requested", () =>
    expect(daily(rows, "weight", "total")).toEqual([
      { date: "2026-01-01", value: 142, unit: "kg" },
    ]));
```

(`rows` already contains two same-day weight readings, 70 and 72, from the file's existing fixture.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/report.test.ts`
Expected: FAIL — `daily()` currently takes only two parameters and always averages, so the result is `[{ date: "2026-01-01", value: 71, unit: "kg" }]`, not `142`.

- [ ] **Step 3: Add the `aggregate` parameter**

In `src/report.ts`, change:

```ts
export function daily(records: HealthRecord[], metric: Metric) {
  const map = new Map<string, { total: number; count: number; unit: string }>();
  records
    .filter((r) => r.metric === metric)
    .forEach((r) => {
      const day = r.date.slice(0, 10);
      const current = map.get(day) ?? { total: 0, count: 0, unit: r.unit };
      current.total += r.value;
      current.count++;
      map.set(day, current);
    });
  return [...map].map(([date, d]) => ({
    date,
    value: d.total / d.count,
    unit: d.unit,
  }));
}
```

to:

```ts
export function daily(
  records: HealthRecord[],
  metric: Metric,
  aggregate: "average" | "total" = "average",
) {
  const map = new Map<string, { total: number; count: number; unit: string }>();
  records
    .filter((r) => r.metric === metric)
    .forEach((r) => {
      const day = r.date.slice(0, 10);
      const current = map.get(day) ?? { total: 0, count: 0, unit: r.unit };
      current.total += r.value;
      current.count++;
      map.set(day, current);
    });
  return [...map].map(([date, d]) => ({
    date,
    value: aggregate === "total" ? d.total : d.total / d.count,
    unit: d.unit,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/report.test.ts`
Expected: PASS — including the pre-existing average test, which still calls `daily(rows, "weight")` with no third argument.

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "Add optional daily-total aggregation to daily()"
```

---

### Task 4: Dashboard chart wiring — totals-based charts and overview card

**Files:**
- Modify: `src/App.tsx:40-53` (metric arrays), `src/App.tsx:371-417` (`MetricChart`)
- Modify: `src/styles.css:210-213`, `src/styles.css:440-443`

**Interfaces:**
- Consumes: `daily(records, metric, aggregate)` from Task 3; `metricGroups` including `"Nutrition"` from Task 2.
- Produces: `nutritionMetrics: Metric[]` (the six nutrition metrics, in display order) and `totalsMetrics: Metric[]` (`steps`, `distance`, `activeEnergy`, plus all of `nutritionMetrics`) as module-level constants in `App.tsx`. Task 5 consumes `nutritionMetrics` by name.

This task has no new unit-testable logic of its own (the aggregation logic it calls was already tested in Task 3) — its deliverable is verified by type-checking and by the existing Vitest suite staying green, per this project's convention of not browser-verifying UI changes.

- [ ] **Step 1: Add `dietaryEnergy` to the overview highlights**

In `src/App.tsx`, change:

```ts
const highlights: Metric[] = ["weight", "heartRate", "steps", "sleep"];
```

to:

```ts
const highlights: Metric[] = [
  "weight",
  "heartRate",
  "steps",
  "sleep",
  "dietaryEnergy",
];
```

This is enough on its own for the overview card: `OverviewCards` already renders one card per `highlights` entry using a generic median/min/max branch (the same branch `steps` and `sleep` already use), so `dietaryEnergy` needs no other `OverviewCards` change.

- [ ] **Step 2: Add `nutritionMetrics` and `totalsMetrics` constants**

In `src/App.tsx`, change:

```ts
const activityMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  "sleep",
];
```

to:

```ts
const activityMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  "sleep",
];
const nutritionMetrics: Metric[] = [
  "dietaryEnergy",
  "carbs",
  "sugar",
  "fiber",
  "protein",
  "fat",
];
const totalsMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  ...nutritionMetrics,
];
```

`totalsMetrics` intentionally does not include `sleep`: this plan only changes the aggregation for the three cumulative-counter metrics called out during design review (steps, active energy, distance) plus the new nutrition metrics, and leaves every other existing chart's behavior untouched.

- [ ] **Step 3: Make `MetricChart` sum per day for totals-based metrics**

In `src/App.tsx`, change:

```ts
  const printLayout = useContext(PrintLayoutContext);
  const rows = daily(records, metric);
```

to:

```ts
  const printLayout = useContext(PrintLayoutContext);
  const rows = daily(
    records,
    metric,
    totalsMetrics.includes(metric) ? "total" : "average",
  );
```

(This is inside `MetricChart`, after the early `RangeMetricChart` return for `heartRate`/`walkingMetrics` — leave that branch untouched.)

- [ ] **Step 4: Widen the overview cards grid from 4 to 5 columns**

In `src/styles.css`, change:

```css
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}
```

to:

```css
.cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 15px;
}
```

And change the narrower-viewport/print variant:

```css
  .cards {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
```

to:

```css
  .cards {
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
```

(This second block is inside the `@media print` rule and is distinguished from the first by its `8px` gap — do not change the separate `@media (max-width: 800px) { .cards, .grid { grid-template-columns: 1fr; } }` single-column collapse rule elsewhere in the file, which is unrelated and applies only at narrow viewport widths.)

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (no test exercises `MetricChart` directly, so this confirms nothing else broke)

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Sum daily totals for nutrition and cumulative-counter dashboard charts"
```

---

### Task 5: Nutrition detailed report table

**Files:**
- Modify: `src/App.tsx:1424-1425` (insert `NutritionReportTable` between `ActivityReportTable` and `export function App()`)
- Modify: `src/App.tsx:1777-1789` (wire the table into the detailed-measurements section; exclude nutrition metrics from the generic per-metric table list)

**Interfaces:**
- Consumes: `nutritionMetrics: Metric[]` from Task 4; `dailyTotals`, `totalBounds`, `DailyTotalBar`, `TableNotes`, `truncationNote`, `coverageNote`, `unitLabel`, `MAX_TABLE_ROWS`, `MAX_PDF_TABLE_ROWS`, `PrintLayoutContext`, `labels`, `decimalsByMetric`, `colorsByMetric` — all already defined/imported in `App.tsx` and already used identically by `ActivityReportTable`.
- Produces: `NutritionReportTable({ records, from, to })` component, rendered in the detailed-measurements section.

Like Task 4, this task's deliverable is a rendering component with no existing component-test harness in this repo; it is verified by type-checking and by the full Vitest suite staying green.

Note: this table has 7 columns (date + 6 nutrients) versus `ActivityReportTable`'s 5 (date + 4). Each cell's `DailyTotalBar` renders a fixed 195px-wide SVG, unchanged from the existing component — if the resulting table reads as visually cramped in the viewer or PDF, that is a follow-up worth raising, not something to fix speculatively here.

- [ ] **Step 1: Add the `NutritionReportTable` component**

In `src/App.tsx`, insert this new function immediately after the closing `}` of `ActivityReportTable` (the line directly before `export function App() {`):

```tsx
function NutritionReportTable({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const totalsByMetric = new Map(
    nutritionMetrics.map((metric) => [
      metric,
      new Map(dailyTotals(records, metric).map((day) => [day.date, day])),
    ]),
  );
  const allDates = [
    ...new Set(
      nutritionMetrics.flatMap((metric) => [
        ...totalsByMetric.get(metric)!.keys(),
      ]),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(
    0,
    printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS,
  );
  if (!dates.length) return null;
  const boundsByMetric = new Map(
    nutritionMetrics.map((metric) => [
      metric,
      totalBounds(
        dates.map((date) => totalsByMetric.get(metric)!.get(date)?.total),
      ),
    ]),
  );
  const unitFor = (metric: Metric) =>
    totalsByMetric.get(metric)!.values().next().value?.unit ?? "";
  const columnNotes = nutritionMetrics.map((metric) => {
    const note = coverageNote(metric, records, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Daily nutrition</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {nutritionMetrics.map((metric) => (
              <th key={metric}>
                {labels[metric]}
                {unitLabel(unitFor(metric))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date}>
              <td>{new Date(`${date}T00:00:00`).toLocaleDateString()}</td>
              {nutritionMetrics.map((metric) => {
                const day = totalsByMetric.get(metric)!.get(date);
                const bounds = boundsByMetric.get(metric)!;
                return (
                  <td key={metric}>
                    {day ? (
                      <DailyTotalBar
                        value={day.total}
                        columnMax={bounds.max}
                        unit={day.unit}
                        decimals={decimalsByMetric[metric]}
                        color={colorsByMetric[metric]}
                      />
                    ) : (
                      <small>—</small>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Render the table in the detailed-measurements section**

In `src/App.tsx`, change:

```tsx
        <VitalsReportTable records={records} from={from} to={to} />
        <ActivityReportTable records={records} from={from} to={to} />
        <WalkingReportTable records={records} from={from} to={to} />
        {metricGroups
          .flatMap((g) => g.metrics)
          .filter(
            (metric) =>
              !bpMetrics.includes(metric) &&
              metric !== "heartRate" &&
              metric !== "weight" &&
              !activityMetrics.includes(metric) &&
              !walkingMetrics.includes(metric),
          )
          .map((m) => (
```

to:

```tsx
        <VitalsReportTable records={records} from={from} to={to} />
        <ActivityReportTable records={records} from={from} to={to} />
        <WalkingReportTable records={records} from={from} to={to} />
        <NutritionReportTable records={records} from={from} to={to} />
        {metricGroups
          .flatMap((g) => g.metrics)
          .filter(
            (metric) =>
              !bpMetrics.includes(metric) &&
              metric !== "heartRate" &&
              metric !== "weight" &&
              !activityMetrics.includes(metric) &&
              !walkingMetrics.includes(metric) &&
              !nutritionMetrics.includes(metric),
          )
          .map((m) => (
```

This keeps nutrition metrics out of the generic per-metric `ReportTable` fallback list, the same way activity and walking metrics are already excluded.

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Add detailed daily nutrition report table"
```

---

## Final verification

After Task 5, run the full check once more from a clean state:

```bash
npx tsc -p tsconfig.json
npx tsc -p tsconfig.electron.json
npm test
```

All three must pass with no errors and no failing tests.
