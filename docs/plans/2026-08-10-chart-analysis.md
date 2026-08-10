# Chart Analysis (Plateaus, Outliers, BP Metrics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add plateau segmentation, outlier call-outs, and blood-pressure derived metrics (pulse pressure/MAP, Swedish/AHA category classification with a period-average badge and sustained-run call-out) to the dashboard, plus physiological-plausibility filtering in the Apple Health parser.

**Architecture:** Five new pure functions live in `src/report.ts` (`plateaus`, `outlierDates`, `bpDerived`, `bpPeriodAverage`, `bpCategorySwedish`/`bpCategoryAha`/`longestElevatedRun` and their supporting constants) — all framework-free, unit-tested directly with Vitest. Four existing chart components under `src/components/charts/` (`MetricChart`, `CarbsChart`, `RangeMetricChart`, `BloodPressureChart`) consume them to render plateau overlays, outlier call-outs, and (for `BloodPressureChart`) the category strip; a new `src/components/charts/PulsePressureChart.tsx` renders the pulse pressure/MAP panel. Two small shared rendering helpers (`outlierDot`, `OutlierNote`) live in a new `src/components/charts/outlierHelpers.tsx` and are reused across all of them. `electron/appleHealthParser.ts` gets a new plausibility-bounds table applied inline in the existing parse loop, with a new `implausible` diagnostics counter threaded through `src/shared/types.ts` and surfaced in `src/App.tsx`.

**Tech Stack:** React 18 + TypeScript, Recharts (`Line`'s `type="stepAfter"` for plateau overlays, custom `dot` render-props and custom `Bar` `shape` functions for outlier markers), Vitest for pure-function tests.

## Global Constraints

- No browser/e2e verification in this project — verify with `npx tsc -p tsconfig.json` (renderer; covers `src/`), `npx tsc -p tsconfig.electron.json` (covers `electron/` and `src/shared/`), and `npm test` (Vitest). Only run electron tsc for tasks touching `electron/` or `src/shared/types.ts`.
- Design source of truth: `docs/design/chart_analysis.md` — every threshold, function signature, and color below is copied from it verbatim.
- Follow existing file conventions: `report.ts` functions are exported pure functions with no React/Electron imports; chart components under `src/components/charts/` follow the existing `printLayout`-branching pattern (`useContext(PrintLayoutContext)`, a `chart(width?, height?)` closure, `data-pdf-chart-ready="true"` in print mode, `ResponsiveContainer` otherwise).
- Commit after each task.

---

### Task 1: Apple Health parser — physiological plausibility filtering

**Files:**
- Modify: `src/shared/types.ts:36-43` (`ImportDiagnostics`)
- Modify: `electron/appleHealthParser.ts`
- Modify: `src/App.tsx:376-386` (diagnostics section)
- Test: `tests/appleHealthParser.test.ts`

**Interfaces:**
- Produces: `ImportDiagnostics.implausible: number`

- [ ] **Step 1: Write the failing tests**

Add to `tests/appleHealthParser.test.ts`, after the existing `describe("nutrition records", ...)` block:

```ts
describe("physiological plausibility filtering", () => {
  it("excludes implausible vitals readings and counts them in diagnostics", async () => {
    const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="999" startDate="2026-01-06 08:00:00 +0000" endDate="2026-01-06 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="62" startDate="2026-01-06 09:00:00 +0000" endDate="2026-01-06 09:00:00 +0000"/></HealthData>`;
    const result = await parseAppleHealthExport(
      Buffer.from(xml),
      "export.xml",
    );
    expect(result.records).toEqual([
      expect.objectContaining({
        metric: "heartRate",
        value: 62,
        unit: "count/min",
      }),
    ]);
    expect(result.diagnostics.implausible).toBe(1);
    expect(result.diagnostics.warnings).toContain(
      "1 record(s) were excluded as physiologically implausible.",
    );
  });
  it("keeps boundary-plausible readings", async () => {
    const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="20" startDate="2026-01-06 08:00:00 +0000" endDate="2026-01-06 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="300" startDate="2026-01-06 09:00:00 +0000" endDate="2026-01-06 09:00:00 +0000"/></HealthData>`;
    const result = await parseAppleHealthExport(
      Buffer.from(xml),
      "export.xml",
    );
    expect(result.records).toHaveLength(2);
    expect(result.diagnostics.implausible).toBe(0);
  });
  it("rejects negative values for any metric", async () => {
    const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" value="-5" startDate="2026-01-06 08:00:00 +0000" endDate="2026-01-06 08:00:00 +0000"/></HealthData>`;
    const result = await parseAppleHealthExport(
      Buffer.from(xml),
      "export.xml",
    );
    expect(result.records).toHaveLength(0);
    expect(result.diagnostics.implausible).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/appleHealthParser.test.ts`
Expected: FAIL — `result.diagnostics.implausible` is `undefined`, not `0`/`1`.

- [ ] **Step 3: Add the `implausible` field to `ImportDiagnostics`**

In `src/shared/types.ts`, change:

```ts
export interface ImportDiagnostics {
  fileName: string;
  imported: number;
  unsupported: number;
  earliest?: string;
  latest?: string;
  warnings: string[];
}
```

to:

```ts
export interface ImportDiagnostics {
  fileName: string;
  imported: number;
  unsupported: number;
  implausible: number;
  earliest?: string;
  latest?: string;
  warnings: string[];
}
```

- [ ] **Step 4: Add the plausibility table and filter to the parser**

In `electron/appleHealthParser.ts`, add after the `typeMap` declaration (after line 36):

```ts
const plausibleRanges: Partial<
  Record<Metric, Partial<Record<string, [number, number]>>>
> = {
  heartRate: { "count/min": [20, 300] },
  restingHeartRate: { "count/min": [20, 300] },
  bloodPressureSystolic: { mmHg: [60, 250] },
  bloodPressureDiastolic: { mmHg: [30, 150] },
  bodyTemperature: { degC: [30, 45], degF: [86, 113] },
  weight: { kg: [20, 300], lb: [44, 660] },
};
function isPlausible(metric: Metric, value: number, unit: string): boolean {
  if (value < 0) return false;
  if (metric === "sleep") return value <= 24;
  const bounds = plausibleRanges[metric]?.[unit];
  return !bounds || (value >= bounds[0] && value <= bounds[1]);
}
```

Then in `parseAppleHealthExport`, change:

```ts
  const records: HealthRecord[] = [];
  const seen = new Set<string>();
  let unsupported = 0;
```

to:

```ts
  const records: HealthRecord[] = [];
  const seen = new Set<string>();
  let unsupported = 0;
  let implausible = 0;
```

and change:

```ts
    const date = new Date(timestamp).toISOString();
    const unit = metric === "sleep" ? "hr" : r.unit || "";
    const key = `${metric}|${date}|${value}|${unit}|${r.sourceName || ""}`;
```

to:

```ts
    const date = new Date(timestamp).toISOString();
    const unit = metric === "sleep" ? "hr" : r.unit || "";
    if (!isPlausible(metric, value, unit)) {
      implausible++;
      continue;
    }
    const key = `${metric}|${date}|${value}|${unit}|${r.sourceName || ""}`;
```

- [ ] **Step 5: Populate the new diagnostics field and warning**

In the returned `diagnostics` object at the end of `parseAppleHealthExport`, change:

```ts
    diagnostics: {
      fileName,
      imported: records.length,
      unsupported,
      earliest: dates[0],
      latest: dates.at(-1),
      warnings: [
        ...(records.some((r) => r.metric === "medication")
          ? []
          : ["No supported medication records were found in this export."]),
        ...(clinicalDataWarning ? [clinicalDataWarning] : []),
      ],
    },
```

to:

```ts
    diagnostics: {
      fileName,
      imported: records.length,
      unsupported,
      implausible,
      earliest: dates[0],
      latest: dates.at(-1),
      warnings: [
        ...(records.some((r) => r.metric === "medication")
          ? []
          : ["No supported medication records were found in this export."]),
        ...(clinicalDataWarning ? [clinicalDataWarning] : []),
        ...(implausible > 0
          ? [
              `${implausible} record(s) were excluded as physiologically implausible.`,
            ]
          : []),
      ],
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/appleHealthParser.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 7: Add the diagnostics line to `App.tsx`**

In `src/App.tsx`, change:

```tsx
      <section className="diagnostics">
        <b>Import diagnostics</b>
        <span>
          {data.diagnostics.unsupported.toLocaleString()} unsupported Apple
          Health record types were safely skipped.
        </span>
        {data.diagnostics.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </section>
```

to:

```tsx
      <section className="diagnostics">
        <b>Import diagnostics</b>
        <span>
          {data.diagnostics.unsupported.toLocaleString()} unsupported Apple
          Health record types were safely skipped.
        </span>
        <span>
          {data.diagnostics.implausible.toLocaleString()} record(s) were
          excluded as physiologically implausible.
        </span>
        {data.diagnostics.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </section>
```

- [ ] **Step 8: Type-check**

Run: `npx tsc -p tsconfig.electron.json && npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts electron/appleHealthParser.ts src/App.tsx tests/appleHealthParser.test.ts
git commit -m "Filter physiologically implausible records in the Apple Health parser"
```

---

### Task 2: `outlierDates()` pure function

**Files:**
- Modify: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Produces: `outlierDates(rows: { date: string; value: number }[]): Set<string>`

- [ ] **Step 1: Write the failing tests**

Add to `tests/report.test.ts`, add `outlierDates` to the existing import from `../src/report`, and add:

```ts
describe("outlierDates", () => {
  it("flags a clear IQR-violating spike", () => {
    const rows = [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: 11 },
      { date: "2026-01-03", value: 9 },
      { date: "2026-01-04", value: 10 },
      { date: "2026-01-05", value: 60 },
      { date: "2026-01-06", value: 10 },
    ];
    expect(outlierDates(rows)).toEqual(new Set(["2026-01-05"]));
  });
  it("returns an empty set when nothing is unusual", () => {
    const rows = [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: 11 },
      { date: "2026-01-03", value: 9 },
    ];
    expect(outlierDates(rows)).toEqual(new Set());
  });
  it("returns an empty set for empty input", () => {
    expect(outlierDates([])).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/report.test.ts`
Expected: FAIL — `outlierDates is not a function` (or not exported).

- [ ] **Step 3: Implement `outlierDates()`**

Add to `src/report.ts`, after `dataSpan()`. Reuses the exported `quantile(sorted, p)` helper that already lives in this file (used by `boundsOf`) instead of duplicating it:

```ts
// Tukey fences (1.5x IQR) — flags a day as statistically unusual without
// excluding it; distinct from the parser's physiological-plausibility filter,
// which excludes data before it ever reaches this function.
export function outlierDates(
  rows: { date: string; value: number }[],
): Set<string> {
  if (!rows.length) return new Set();
  const sorted = rows.map((r) => r.value).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1 || 1;
  const lower = q1 - iqr * 1.5;
  const upper = q3 + iqr * 1.5;
  return new Set(
    rows.filter((r) => r.value < lower || r.value > upper).map((r) => r.date),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "Add outlierDates() Tukey-fence helper to report.ts"
```

---

### Task 3: `plateaus()` pure function

**Files:**
- Modify: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: `daily()` (existing, `src/report.ts`)
- Produces: `plateaus(records: HealthRecord[], metric: Metric, aggregate?: "average" | "total"): { date: string; value: number; unit: string }[]`

- [ ] **Step 1: Write the failing tests**

Add `plateaus` to the import from `../src/report` in `tests/report.test.ts`, and add:

```ts
describe("plateaus", () => {
  const twoRegimeRows: HealthRecord[] = [
    ...Array.from({ length: 7 }, (_, i) => ({
      metric: "weight" as const,
      date: `2026-01-${String(i + 1).padStart(2, "0")}T08:00:00.000Z`,
      value: 70,
      unit: "kg",
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      metric: "weight" as const,
      date: `2026-01-${String(i + 8).padStart(2, "0")}T08:00:00.000Z`,
      value: 90,
      unit: "kg",
    })),
  ];
  it("merges into two segments for a clear two-regime series", () => {
    const result = plateaus(twoRegimeRows, "weight");
    expect(result).toHaveLength(14);
    expect(result.slice(0, 7).every((r) => r.value === 70)).toBe(true);
    expect(result.slice(7).every((r) => r.value === 90)).toBe(true);
  });
  it("returns no segments below the 14-day-with-data minimum", () => {
    expect(plateaus(twoRegimeRows.slice(0, 13), "weight")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/report.test.ts`
Expected: FAIL — `plateaus is not a function`.

- [ ] **Step 3: Implement `plateaus()`**

Add to `src/report.ts`, after `outlierDates()`:

```ts
// Change-point-merged plateau overlay: groups days-with-data into 7-day
// buckets by position (not calendar weeks), then greedily merges adjacent
// buckets whose means are close relative to their combined noise. See
// docs/design/chart_analysis.md section 1 for the algorithm rationale.
export function plateaus(
  records: HealthRecord[],
  metric: Metric,
  aggregate: "average" | "total" = "average",
): { date: string; value: number; unit: string }[] {
  const rows = daily(records, metric, aggregate).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (rows.length < 14) return [];
  const values = rows.map((r) => r.value);
  const range = Math.max(...values) - Math.min(...values);
  const noiseFloor = range * 0.02;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stdDev = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / xs.length);
  };
  const bucketSize = 7;
  const buckets: { values: number[]; startIndex: number; endIndex: number }[] =
    [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const end = Math.min(i + bucketSize, rows.length);
    buckets.push({
      values: values.slice(i, end),
      startIndex: i,
      endIndex: end - 1,
    });
  }
  const segments: { values: number[]; startIndex: number; endIndex: number }[] =
    [{ ...buckets[0] }];
  for (let i = 1; i < buckets.length; i++) {
    const bucket = buckets[i];
    const current = segments.at(-1)!;
    const currentMean = mean(current.values);
    const bucketMean = mean(bucket.values);
    const pooledSD = (stdDev(current.values) + stdDev(bucket.values)) / 2;
    const threshold = 0.75 * Math.max(pooledSD, noiseFloor);
    if (Math.abs(bucketMean - currentMean) <= threshold) {
      current.values = current.values.concat(bucket.values);
      current.endIndex = bucket.endIndex;
    } else {
      segments.push({ ...bucket });
    }
  }
  const unit = rows[0].unit;
  const result: { date: string; value: number; unit: string }[] = [];
  for (const segment of segments) {
    const segmentMean = mean(segment.values);
    for (let i = segment.startIndex; i <= segment.endIndex; i++) {
      result.push({ date: rows[i].date, value: segmentMean, unit });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "Add plateaus() change-point segmentation helper to report.ts"
```

---

### Task 4: `bpDerived()` and `bpPeriodAverage()` pure functions

**Files:**
- Modify: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: `dailyStats()` (existing, `src/report.ts`)
- Produces: `BpDerivedDay` interface, `bpDerived(records: HealthRecord[]): BpDerivedDay[]`, `bpPeriodAverage(days: { systolic: number; diastolic: number }[]): { systolic: number; diastolic: number } | undefined`

- [ ] **Step 1: Write the failing tests**

Add `bpDerived` and `bpPeriodAverage` to the import from `../src/report` in `tests/report.test.ts`, and add:

```ts
describe("blood pressure derived metrics", () => {
  const bpRows: HealthRecord[] = [
    {
      metric: "bloodPressureSystolic",
      date: "2026-01-01T08:00:00.000Z",
      value: 130,
      unit: "mmHg",
    },
    {
      metric: "bloodPressureDiastolic",
      date: "2026-01-01T08:00:00.000Z",
      value: 80,
      unit: "mmHg",
    },
    {
      metric: "bloodPressureSystolic",
      date: "2026-01-02T08:00:00.000Z",
      value: 120,
      unit: "mmHg",
    },
  ];
  it("joins systolic/diastolic by date and computes pulse pressure and MAP", () => {
    const result = bpDerived(bpRows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2026-01-01",
      unit: "mmHg",
      systolic: 130,
      diastolic: 80,
      pulsePressure: 50,
    });
    expect(result[0].map).toBeCloseTo(96.667, 2);
  });
  it("averages a period of derived days", () => {
    expect(
      bpPeriodAverage([
        { systolic: 130, diastolic: 80 },
        { systolic: 120, diastolic: 70 },
      ]),
    ).toEqual({ systolic: 125, diastolic: 75 });
  });
  it("returns undefined for an empty period", () => {
    expect(bpPeriodAverage([])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/report.test.ts`
Expected: FAIL — `bpDerived is not a function`.

- [ ] **Step 3: Implement `bpDerived()` and `bpPeriodAverage()`**

Add to `src/report.ts`, after `plateaus()`:

```ts
export interface BpDerivedDay {
  date: string;
  unit: string; // "mmHg"
  systolic: number;
  diastolic: number;
  pulsePressure: number; // systolic − diastolic
  map: number; // diastolic + pulsePressure / 3
}
export function bpDerived(records: HealthRecord[]): BpDerivedDay[] {
  const systolic = new Map(
    dailyStats(records, "bloodPressureSystolic").map((d) => [d.date, d]),
  );
  const diastolic = new Map(
    dailyStats(records, "bloodPressureDiastolic").map((d) => [d.date, d]),
  );
  return [...systolic.keys()]
    .filter((date) => diastolic.has(date))
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const s = systolic.get(date)!;
      const d = diastolic.get(date)!;
      const pulsePressure = s.average - d.average;
      return {
        date,
        unit: s.unit,
        systolic: s.average,
        diastolic: d.average,
        pulsePressure,
        map: d.average + pulsePressure / 3,
      };
    });
}
export function bpPeriodAverage(
  days: { systolic: number; diastolic: number }[],
): { systolic: number; diastolic: number } | undefined {
  if (!days.length) return undefined;
  return {
    systolic: days.reduce((sum, d) => sum + d.systolic, 0) / days.length,
    diastolic: days.reduce((sum, d) => sum + d.diastolic, 0) / days.length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "Add bpDerived() and bpPeriodAverage() to report.ts"
```

---

### Task 5: BP category schemes (Swedish/AHA) and `longestElevatedRun()`

**Files:**
- Modify: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Produces: `BpScheme`, `SwedishBpCategory`, `bpCategorySwedish()`, `bpCategoryColorsSwedish`, `bpCategoryOrderSwedish`, `AhaBpCategory`, `bpCategoryAha()`, `bpCategoryColorsAha`, `bpCategoryOrderAha`, `longestElevatedRun<T extends string>(days: { date: string; category: T }[], order: T[], floor: T): { start: string; end: string; length: number } | undefined`

- [ ] **Step 1: Write the failing tests**

Add the new names to the import from `../src/report` in `tests/report.test.ts` (`bpCategorySwedish`, `bpCategoryAha`, `bpCategoryOrderSwedish`, `longestElevatedRun`), and add:

```ts
describe("blood pressure categorization", () => {
  it("classifies Swedish categories at each threshold boundary", () => {
    expect(bpCategorySwedish(115, 75)).toBe("Optimal");
    expect(bpCategorySwedish(125, 78)).toBe("Normal");
    expect(bpCategorySwedish(132, 86)).toBe("High normal");
    expect(bpCategorySwedish(145, 92)).toBe("Grade 1 hypertension");
    expect(bpCategorySwedish(165, 102)).toBe("Grade 2 hypertension");
    expect(bpCategorySwedish(185, 115)).toBe("Grade 3 hypertension");
  });
  it("classifies AHA categories at each threshold boundary", () => {
    expect(bpCategoryAha(118, 76)).toBe("Normal");
    expect(bpCategoryAha(125, 78)).toBe("Elevated");
    expect(bpCategoryAha(135, 85)).toBe("Stage 1");
    expect(bpCategoryAha(145, 95)).toBe("Stage 2");
    expect(bpCategoryAha(185, 125)).toBe("Crisis");
  });
});
describe("longestElevatedRun", () => {
  const days = (categories: string[]) =>
    categories.map((category, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      category,
    }));
  it("finds the longest run at or above the floor category", () => {
    const series = days([
      "Normal",
      "Grade 1 hypertension",
      "Grade 1 hypertension",
      "Grade 2 hypertension",
      "Grade 1 hypertension",
      "Normal",
      "Normal",
    ]);
    expect(
      longestElevatedRun(series, bpCategoryOrderSwedish, "Grade 1 hypertension"),
    ).toEqual({ start: "2026-01-02", end: "2026-01-05", length: 4 });
  });
  it("ignores a run shorter than the 3-day minimum", () => {
    const series = days([
      "Normal",
      "Grade 1 hypertension",
      "Grade 1 hypertension",
      "Normal",
    ]);
    expect(
      longestElevatedRun(series, bpCategoryOrderSwedish, "Grade 1 hypertension"),
    ).toBeUndefined();
  });
  it("returns undefined when no day reaches the floor category", () => {
    const series = days(["Optimal", "Normal", "High normal"]);
    expect(
      longestElevatedRun(series, bpCategoryOrderSwedish, "Grade 1 hypertension"),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/report.test.ts`
Expected: FAIL — `bpCategorySwedish is not a function`.

- [ ] **Step 3: Implement the category schemes and `longestElevatedRun()`**

Add to `src/report.ts`, after `bpPeriodAverage()`:

```ts
export type BpScheme = "swedish" | "aha";

export type SwedishBpCategory =
  | "Optimal"
  | "Normal"
  | "High normal"
  | "Grade 1 hypertension"
  | "Grade 2 hypertension"
  | "Grade 3 hypertension";
export function bpCategorySwedish(
  systolic: number,
  diastolic: number,
): SwedishBpCategory {
  if (systolic >= 180 || diastolic >= 110) return "Grade 3 hypertension";
  if (systolic >= 160 || diastolic >= 100) return "Grade 2 hypertension";
  if (systolic >= 140 || diastolic >= 90) return "Grade 1 hypertension";
  if (systolic >= 130 || diastolic >= 85) return "High normal";
  if (systolic >= 120 || diastolic >= 80) return "Normal";
  return "Optimal";
}
export const bpCategoryColorsSwedish: Record<SwedishBpCategory, string> = {
  Optimal: "#2f9e44",
  Normal: "#66a80f",
  "High normal": "#f59f00",
  "Grade 1 hypertension": "#e8590c",
  "Grade 2 hypertension": "#e03131",
  "Grade 3 hypertension": "#862e2e",
};
export const bpCategoryOrderSwedish: SwedishBpCategory[] = [
  "Optimal",
  "Normal",
  "High normal",
  "Grade 1 hypertension",
  "Grade 2 hypertension",
  "Grade 3 hypertension",
];

export type AhaBpCategory =
  | "Normal"
  | "Elevated"
  | "Stage 1"
  | "Stage 2"
  | "Crisis";
export function bpCategoryAha(
  systolic: number,
  diastolic: number,
): AhaBpCategory {
  if (systolic > 180 || diastolic > 120) return "Crisis";
  if (systolic >= 140 || diastolic >= 90) return "Stage 2";
  if (systolic >= 130 || diastolic >= 80) return "Stage 1";
  if (systolic >= 120 && diastolic < 80) return "Elevated";
  return "Normal";
}
export const bpCategoryColorsAha: Record<AhaBpCategory, string> = {
  Normal: "#2f9e44",
  Elevated: "#f59f00",
  "Stage 1": "#e8590c",
  "Stage 2": "#e03131",
  Crisis: "#862e2e",
};
export const bpCategoryOrderAha: AhaBpCategory[] = [
  "Normal",
  "Elevated",
  "Stage 1",
  "Stage 2",
  "Crisis",
];

// Longest run of consecutive covered days (by position, not calendar) at or
// above `floor`'s severity rank in `order`; undefined below a 3-day minimum.
export function longestElevatedRun<T extends string>(
  days: { date: string; category: T }[],
  order: T[],
  floor: T,
): { start: string; end: string; length: number } | undefined {
  const floorRank = order.indexOf(floor);
  let best: { start: string; end: string; length: number } | undefined;
  let runStart = -1;
  for (let i = 0; i <= days.length; i++) {
    const qualifies =
      i < days.length && order.indexOf(days[i].category) >= floorRank;
    if (qualifies) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const length = i - runStart;
      if (length >= 3 && (!best || length > best.length)) {
        best = { start: days[runStart].date, end: days[i - 1].date, length };
      }
      runStart = -1;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "Add Swedish/AHA BP category schemes and longestElevatedRun() to report.ts"
```

---

### Task 6: Plateau overlay rendering (`MetricChart`, `CarbsChart`)

**Files:**
- Modify: `src/report.ts`
- Modify: `src/components/charts/MetricChart.tsx`
- Modify: `src/components/charts/CarbsChart.tsx`

**Interfaces:**
- Produces: `plateauMetrics: Metric[]` (`src/report.ts`)
- Consumes: `plateaus()` (Task 3)

- [ ] **Step 1: Add the `plateauMetrics` constant to `report.ts`**

In `src/report.ts`, change:

```ts
export const totalsMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  ...nutritionMetrics,
];

export function quantile(sorted: number[], p: number) {
```

to:

```ts
export const totalsMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  ...nutritionMetrics,
];
export const plateauMetrics: Metric[] = [
  "steps",
  "activeEnergy",
  "distance",
  "exerciseTime",
  "dietaryEnergy",
  "fiber",
  "protein",
  "fat",
  "weight",
];

export function quantile(sorted: number[], p: number) {
```

- [ ] **Step 2: Import `Line` and `plateaus`/`plateauMetrics` in `MetricChart`**

In `src/components/charts/MetricChart.tsx`, change:

```tsx
import { useContext } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData, Metric } from "../../shared/types";
import {
  colorsByMetric,
  daily,
  format,
  labels,
  totalsMetrics,
  walkingMetrics,
} from "../../report";
```

to:

```tsx
import { useContext } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData, Metric } from "../../shared/types";
import {
  colorsByMetric,
  daily,
  format,
  labels,
  plateauMetrics,
  plateaus,
  totalsMetrics,
  walkingMetrics,
} from "../../report";
```

- [ ] **Step 3: Compute and overlay the plateau line in `MetricChart`**

In `src/components/charts/MetricChart.tsx`, change:

```tsx
  const values = rows.map((row) => row.value);
  const axisMin = niceAxisMin(Math.min(...values), Math.max(...values));
  const chart = (width?: number, height?: number) => (
    <AreaChart data={rows} width={width} height={height}>
```

to:

```tsx
  const values = rows.map((row) => row.value);
  const axisMin = niceAxisMin(Math.min(...values), Math.max(...values));
  const plateauRows = plateauMetrics.includes(metric)
    ? plateaus(records, metric, totalsMetrics.includes(metric) ? "total" : "average")
    : [];
  const plateauByDate = new Map(plateauRows.map((row) => [row.date, row.value]));
  const chartRows = rows.map((row) => ({
    ...row,
    plateau: plateauByDate.get(row.date),
  }));
  const chart = (width?: number, height?: number) => (
    <AreaChart data={chartRows} width={width} height={height}>
```

and change:

```tsx
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#fill-${metric})`}
          isAnimationActive={!printLayout}
        />
    </AreaChart>
```

to:

```tsx
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#fill-${metric})`}
          isAnimationActive={!printLayout}
        />
        {plateauRows.length > 0 && (
          <Line
            type="stepAfter"
            dataKey="plateau"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={!printLayout}
          />
        )}
    </AreaChart>
```

- [ ] **Step 4: Overlay the total-carbs plateau line in `CarbsChart`**

In `src/components/charts/CarbsChart.tsx`, change the recharts and report imports:

```tsx
import { useContext } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData } from "../../shared/types";
import { colorsByMetric, daily, format } from "../../report";
```

to:

```tsx
import { useContext } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData } from "../../shared/types";
import { colorsByMetric, daily, format, plateaus } from "../../report";
```

change:

```tsx
  if (!rows.length)
    return (
      <div className="empty small">
        No carbohydrate records in this period.
      </div>
    );
  const chart = (width?: number, height?: number) => (
    <AreaChart data={rows} width={width} height={height}>
```

to:

```tsx
  if (!rows.length)
    return (
      <div className="empty small">
        No carbohydrate records in this period.
      </div>
    );
  const plateauRows = plateaus(records, "carbs", "total");
  const plateauByDate = new Map(plateauRows.map((row) => [row.date, row.value]));
  const chartRows = rows.map((row) => ({
    ...row,
    plateau: plateauByDate.get(row.date),
  }));
  const chart = (width?: number, height?: number) => (
    <AreaChart data={chartRows} width={width} height={height}>
```

and change:

```tsx
      <Area
        type="monotone"
        dataKey="other"
        stackId="carbs"
        stroke={colorsByMetric.carbs}
        strokeWidth={2}
        fill="url(#fill-carbs-other)"
        isAnimationActive={!printLayout}
      />
    </AreaChart>
```

to:

```tsx
      <Area
        type="monotone"
        dataKey="other"
        stackId="carbs"
        stroke={colorsByMetric.carbs}
        strokeWidth={2}
        fill="url(#fill-carbs-other)"
        isAnimationActive={!printLayout}
      />
      {plateauRows.length > 0 && (
        <Line
          type="stepAfter"
          dataKey="plateau"
          stroke={colorsByMetric.carbs}
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={!printLayout}
        />
      )}
    </AreaChart>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/report.ts src/components/charts/MetricChart.tsx src/components/charts/CarbsChart.tsx
git commit -m "Render plateau overlays on noisy-metric and carbs charts"
```

---

### Task 7: Outlier call-out rendering (`MetricChart`, `RangeMetricChart`, `BloodPressureChart`, `CarbsChart`)

**Files:**
- Create: `src/components/charts/outlierHelpers.tsx`
- Modify: `src/components/charts/bpChartShapes.tsx`
- Modify: `src/components/charts/MetricChart.tsx`
- Modify: `src/components/charts/RangeMetricChart.tsx`
- Modify: `src/components/charts/CarbsChart.tsx`
- Modify: `src/components/charts/BloodPressureChart.tsx`

**Interfaces:**
- Consumes: `outlierDates()` (Task 2)
- Produces (new shared helpers, reused by Task 8): `outlierDot(outliers, color)`, `<OutlierNote>` (`src/components/charts/outlierHelpers.tsx`)
- Modifies (backward-compatible, optional 5th param): `bpRangeBarShape()` (`src/components/charts/bpChartShapes.tsx`)

- [ ] **Step 1: Create `outlierHelpers.tsx`**

Create `src/components/charts/outlierHelpers.tsx`:

```tsx
import { format, formatDate } from "../../report";

export function outlierDot(outliers: Set<string>, color: string) {
  return (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !outliers.has(payload.date)) return <g />;
    return (
      <circle cx={cx} cy={cy} r={5} fill="white" stroke={color} strokeWidth={2.5} />
    );
  };
}
export function OutlierNote({
  label,
  outliers,
  rows,
  unit,
  decimals,
}: {
  label?: string;
  outliers: Set<string>;
  rows: { date: string; value: number }[];
  unit: string;
  decimals?: number;
}) {
  if (!outliers.size) return null;
  const flagged = rows.filter((row) => outliers.has(row.date)).slice(0, 5);
  return (
    <small className="table-notes">
      {label ? `${label} — u` : "U"}nusual:{" "}
      {flagged
        .map((row) => `${formatDate(row.date)} (${format(row.value, unit, decimals)})`)
        .join(", ")}
    </small>
  );
}
```

- [ ] **Step 2: Extend `bpRangeBarShape` with an optional outlier ring**

In `src/components/charts/bpChartShapes.tsx`, change:

```tsx
export function bpRangeBarShape(
  color: string,
  lowKey: string,
  highKey: string,
  avgKey: string,
) {
  return (props: any) => {
    const { x, y, width, height, payload } = props;
    const low = payload[lowKey],
      high = payload[highKey],
      average = payload[avgKey];
    if (low === undefined) return <g />;
    const barHeight = Math.max(height, 3);
    const barWidth = Math.max(width, 4);
    const xAdj = x - (barWidth - width) / 2;
    const yAdj = y - (barHeight - height) / 2;
    const avgY =
      high > low
        ? yAdj + barHeight * ((high - average) / (high - low))
        : yAdj + barHeight / 2;
    return (
      <g>
        <rect
          x={xAdj}
          y={yAdj}
          width={barWidth}
          height={barHeight}
          rx={Math.min(4, width / 2)}
          fill={color}
          fillOpacity={0.55}
        />
        <line
          x1={xAdj}
          x2={xAdj + barWidth}
          y1={avgY}
          y2={avgY}
          stroke={color}
          strokeWidth={2}
        />
      </g>
    );
  };
}
```

to:

```tsx
export function bpRangeBarShape(
  color: string,
  lowKey: string,
  highKey: string,
  avgKey: string,
  outlierKey?: string,
) {
  return (props: any) => {
    const { x, y, width, height, payload } = props;
    const low = payload[lowKey],
      high = payload[highKey],
      average = payload[avgKey];
    if (low === undefined) return <g />;
    const barHeight = Math.max(height, 3);
    const barWidth = Math.max(width, 4);
    const xAdj = x - (barWidth - width) / 2;
    const yAdj = y - (barHeight - height) / 2;
    const avgY =
      high > low
        ? yAdj + barHeight * ((high - average) / (high - low))
        : yAdj + barHeight / 2;
    const isOutlier = outlierKey ? Boolean(payload[outlierKey]) : false;
    return (
      <g>
        <rect
          x={xAdj}
          y={yAdj}
          width={barWidth}
          height={barHeight}
          rx={Math.min(4, width / 2)}
          fill={color}
          fillOpacity={0.55}
        />
        <line
          x1={xAdj}
          x2={xAdj + barWidth}
          y1={avgY}
          y2={avgY}
          stroke={color}
          strokeWidth={2}
        />
        {isOutlier && (
          <rect
            x={xAdj - 2}
            y={yAdj - 2}
            width={barWidth + 4}
            height={barHeight + 4}
            rx={Math.min(6, width / 2 + 2)}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        )}
      </g>
    );
  };
}
```

- [ ] **Step 3: Apply outlier marking in `MetricChart`**

In `src/components/charts/MetricChart.tsx`, change the report import (as left by Task 6):

```tsx
import {
  colorsByMetric,
  daily,
  format,
  labels,
  plateauMetrics,
  plateaus,
  totalsMetrics,
  walkingMetrics,
} from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { RangeMetricChart } from "./RangeMetricChart";
import { CarbsChart } from "./CarbsChart";
```

to:

```tsx
import {
  colorsByMetric,
  daily,
  decimalsByMetric,
  format,
  labels,
  outlierDates,
  plateauMetrics,
  plateaus,
  totalsMetrics,
  walkingMetrics,
} from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { RangeMetricChart } from "./RangeMetricChart";
import { CarbsChart } from "./CarbsChart";
import { outlierDot, OutlierNote } from "./outlierHelpers";
```

change (as left by Task 6):

```tsx
  const plateauRows = plateauMetrics.includes(metric)
```

to:

```tsx
  const outliers = outlierDates(rows);
  const plateauRows = plateauMetrics.includes(metric)
```

change:

```tsx
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#fill-${metric})`}
          isAnimationActive={!printLayout}
        />
        {plateauRows.length > 0 && (
```

to:

```tsx
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#fill-${metric})`}
          isAnimationActive={!printLayout}
          dot={outlierDot(outliers, color)}
        />
        {plateauRows.length > 0 && (
```

and change the non-print return:

```tsx
  if (printLayout)
    return <div data-pdf-chart-ready="true">{chart(680, 260)}</div>;
  return (
    <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
      {chart()}
    </ResponsiveContainer>
  );
}
```

to:

```tsx
  if (printLayout)
    return <div data-pdf-chart-ready="true">{chart(680, 260)}</div>;
  return (
    <>
      <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
        {chart()}
      </ResponsiveContainer>
      <OutlierNote
        outliers={outliers}
        rows={rows}
        unit={rows[0].unit}
        decimals={decimalsByMetric[metric]}
      />
    </>
  );
}
```

- [ ] **Step 4: Apply outlier marking in `RangeMetricChart`**

In `src/components/charts/RangeMetricChart.tsx`, change:

```tsx
import type { HealthData, Metric } from "../../shared/types";
import { colorsByMetric, dailyStats, format, labels } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { bpRangeBarShape } from "./bpChartShapes";
```

to:

```tsx
import type { HealthData, Metric } from "../../shared/types";
import {
  colorsByMetric,
  dailyStats,
  decimalsByMetric,
  format,
  labels,
  outlierDates,
} from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { bpRangeBarShape } from "./bpChartShapes";
import { OutlierNote } from "./outlierHelpers";
```

change:

```tsx
  const overallAverage =
    rows.reduce((total, row) => total + row.average, 0) / rows.length;
  const axisMin = niceAxisMin(
    Math.min(...rows.map((row) => row.low)),
    Math.max(...rows.map((row) => row.high)),
  );
  const chart = (width?: number, height?: number) => (
    <ComposedChart
      data={rows}
      barCategoryGap="28%"
      width={width}
      height={height}
    >
```

to:

```tsx
  const overallAverage =
    rows.reduce((total, row) => total + row.average, 0) / rows.length;
  const axisMin = niceAxisMin(
    Math.min(...rows.map((row) => row.low)),
    Math.max(...rows.map((row) => row.high)),
  );
  const outliers = outlierDates(
    rows.map((row) => ({ date: row.date, value: row.average })),
  );
  const chartRows = rows.map((row) => ({
    ...row,
    isOutlier: outliers.has(row.date),
  }));
  const chart = (width?: number, height?: number) => (
    <ComposedChart
      data={chartRows}
      barCategoryGap="28%"
      width={width}
      height={height}
    >
```

change:

```tsx
      <Bar
        dataKey="range"
        stackId={metric}
        shape={bpRangeBarShape(color, "low", "high", "average")}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
```

to:

```tsx
      <Bar
        dataKey="range"
        stackId={metric}
        shape={bpRangeBarShape(color, "low", "high", "average", "isOutlier")}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
```

and change the non-print return:

```tsx
  return (
    <>
      <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
        {chart()}
      </ResponsiveContainer>
      <small style={{ color }}>
        ▮ Daily range (avg tick) · ┄ Overall average {format(overallAverage, rows[0].unit)}
      </small>
    </>
  );
}
```

to:

```tsx
  return (
    <>
      <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
        {chart()}
      </ResponsiveContainer>
      <small style={{ color }}>
        ▮ Daily range (avg tick) · ┄ Overall average {format(overallAverage, rows[0].unit)}
      </small>
      <OutlierNote
        outliers={outliers}
        rows={rows.map((row) => ({ date: row.date, value: row.average }))}
        unit={rows[0].unit}
        decimals={decimalsByMetric[metric]}
      />
    </>
  );
}
```

- [ ] **Step 5: Apply outlier marking in `CarbsChart`**

In `src/components/charts/CarbsChart.tsx`, change the report import (as left by Task 6):

```tsx
import { colorsByMetric, daily, format, plateaus } from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
```

to:

```tsx
import {
  colorsByMetric,
  daily,
  decimalsByMetric,
  format,
  outlierDates,
  plateaus,
} from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { outlierDot, OutlierNote } from "./outlierHelpers";
```

change (as left by Task 6):

```tsx
  const plateauRows = plateaus(records, "carbs", "total");
```

to:

```tsx
  const outliers = outlierDates(rows.map((row) => ({ date: row.date, value: row.carbs })));
  const plateauRows = plateaus(records, "carbs", "total");
```

change:

```tsx
      <Area
        type="monotone"
        dataKey="other"
        stackId="carbs"
        stroke={colorsByMetric.carbs}
        strokeWidth={2}
        fill="url(#fill-carbs-other)"
        isAnimationActive={!printLayout}
      />
      {plateauRows.length > 0 && (
```

to:

```tsx
      <Area
        type="monotone"
        dataKey="other"
        stackId="carbs"
        stroke={colorsByMetric.carbs}
        strokeWidth={2}
        fill="url(#fill-carbs-other)"
        isAnimationActive={!printLayout}
        dot={outlierDot(outliers, colorsByMetric.carbs)}
      />
      {plateauRows.length > 0 && (
```

and change the final return:

```tsx
      {!printLayout && (
        <div className="chart-legend">
          <small style={{ color: colorsByMetric.sugar }}>▮ Sugar</small>
          <small style={{ color: colorsByMetric.carbs, marginLeft: 14 }}>
            ▮ Other carbohydrates
          </small>
        </div>
      )}
    </>
  );
}
```

to:

```tsx
      {!printLayout && (
        <div className="chart-legend">
          <small style={{ color: colorsByMetric.sugar }}>▮ Sugar</small>
          <small style={{ color: colorsByMetric.carbs, marginLeft: 14 }}>
            ▮ Other carbohydrates
          </small>
        </div>
      )}
      {!printLayout && (
        <OutlierNote
          outliers={outliers}
          rows={rows.map((row) => ({ date: row.date, value: row.carbs }))}
          unit={rows[0].unit}
          decimals={decimalsByMetric.carbs}
        />
      )}
    </>
  );
}
```

- [ ] **Step 6: Apply outlier marking in `BloodPressureChart`**

In `src/components/charts/BloodPressureChart.tsx`, change:

```tsx
import type { HealthData } from "../../shared/types";
import { colorsByMetric, dailyStats, format } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { coverageNote } from "../TableNotes";
import { bpRangeBarShape } from "./bpChartShapes";
```

to:

```tsx
import type { HealthData } from "../../shared/types";
import { colorsByMetric, dailyStats, format, outlierDates } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { coverageNote } from "../TableNotes";
import { bpRangeBarShape } from "./bpChartShapes";
import { OutlierNote } from "./outlierHelpers";
```

change:

```tsx
  const lows = rows
    .flatMap((r) => [r.sLow, r.dLow])
    .filter((v): v is number => v !== undefined);
  const highs = rows
    .flatMap((r) => [r.sHigh, r.dHigh])
    .filter((v): v is number => v !== undefined);
  const axisMin = niceAxisMin(Math.min(...lows), Math.max(...highs));
  const chart = (width?: number, height?: number) => (
    <ComposedChart
      data={rows}
      barGap={2}
      barCategoryGap="28%"
      width={width}
      height={height}
    >
```

to:

```tsx
  const lows = rows
    .flatMap((r) => [r.sLow, r.dLow])
    .filter((v): v is number => v !== undefined);
  const highs = rows
    .flatMap((r) => [r.sHigh, r.dHigh])
    .filter((v): v is number => v !== undefined);
  const axisMin = niceAxisMin(Math.min(...lows), Math.max(...highs));
  const sOutliers = outlierDates(
    rows
      .filter((r): r is typeof r & { sAvg: number } => r.sAvg !== undefined)
      .map((r) => ({ date: r.date, value: r.sAvg })),
  );
  const dOutliers = outlierDates(
    rows
      .filter((r): r is typeof r & { dAvg: number } => r.dAvg !== undefined)
      .map((r) => ({ date: r.date, value: r.dAvg })),
  );
  const chartRows = rows.map((r) => ({
    ...r,
    sOutlier: sOutliers.has(r.date),
    dOutlier: dOutliers.has(r.date),
  }));
  const chart = (width?: number, height?: number) => (
    <ComposedChart
      data={chartRows}
      barGap={2}
      barCategoryGap="28%"
      width={width}
      height={height}
    >
```

change:

```tsx
      <Bar
        dataKey="sRange"
        stackId="s"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureSystolic,
          "sLow",
          "sHigh",
          "sAvg",
        )}
        isAnimationActive={false}
      />
```

to:

```tsx
      <Bar
        dataKey="sRange"
        stackId="s"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureSystolic,
          "sLow",
          "sHigh",
          "sAvg",
          "sOutlier",
        )}
        isAnimationActive={false}
      />
```

change:

```tsx
      <Bar
        dataKey="dRange"
        stackId="d"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureDiastolic,
          "dLow",
          "dHigh",
          "dAvg",
        )}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
```

to:

```tsx
      <Bar
        dataKey="dRange"
        stackId="d"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureDiastolic,
          "dLow",
          "dHigh",
          "dAvg",
          "dOutlier",
        )}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
```

and change the `bp-legend` block:

```tsx
      {!printLayout && (
        <div className="bp-legend">
          <small style={{ color: colorsByMetric.bloodPressureSystolic }}>
            ▮ Systolic (range, avg tick)
          </small>
          <small
            style={{
              color: colorsByMetric.bloodPressureDiastolic,
              marginLeft: 14,
            }}
          >
            ▮ Diastolic (range, avg tick)
          </small>
        </div>
      )}
    </article>
  );
}
```

to:

```tsx
      {!printLayout && (
        <div className="bp-legend">
          <small style={{ color: colorsByMetric.bloodPressureSystolic }}>
            ▮ Systolic (range, avg tick)
          </small>
          <small
            style={{
              color: colorsByMetric.bloodPressureDiastolic,
              marginLeft: 14,
            }}
          >
            ▮ Diastolic (range, avg tick)
          </small>
        </div>
      )}
      {!printLayout && (
        <>
          <OutlierNote
            label="Systolic"
            outliers={sOutliers}
            rows={rows
              .filter((r): r is typeof r & { sAvg: number } => r.sAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.sAvg }))}
            unit="mmHg"
            decimals={0}
          />
          <OutlierNote
            label="Diastolic"
            outliers={dOutliers}
            rows={rows
              .filter((r): r is typeof r & { dAvg: number } => r.dAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.dAvg }))}
            unit="mmHg"
            decimals={0}
          />
        </>
      )}
    </article>
  );
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/charts/outlierHelpers.tsx src/components/charts/bpChartShapes.tsx src/components/charts/MetricChart.tsx src/components/charts/RangeMetricChart.tsx src/components/charts/CarbsChart.tsx src/components/charts/BloodPressureChart.tsx
git commit -m "Add outlier call-outs across trend, range, carbs, and BP charts"
```

---

### Task 8: Pulse pressure / MAP panel

**Files:**
- Create: `src/components/charts/PulsePressureChart.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `bpDerived()` (Task 4), `outlierDates()` (Task 2), `outlierDot`/`OutlierNote` (Task 7)
- Produces: `PulsePressureChart` component (`src/components/charts/PulsePressureChart.tsx`)

- [ ] **Step 1: Create `PulsePressureChart.tsx`**

Create `src/components/charts/PulsePressureChart.tsx`. The `PULSE_PRESSURE_COLOR`/`MAP_COLOR` constants live locally in this file rather than in `chartMath.ts`, since nothing else needs them:

```tsx
import { useContext } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData } from "../../shared/types";
import { bpDerived, format, outlierDates } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { outlierDot, OutlierNote } from "./outlierHelpers";

const PULSE_PRESSURE_COLOR = "#5c5f66";
const MAP_COLOR = "#0b7285";

function PulsePressureTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e4e8ef",
        borderRadius: 8,
        padding: "8px 11px",
        fontSize: 12,
      }}
    >
      <b>{new Date(`${label}T00:00:00`).toLocaleDateString()}</b>
      <div style={{ color: PULSE_PRESSURE_COLOR, marginTop: 4 }}>
        Pulse pressure: {format(row.pulsePressure, "mmHg")}
      </div>
      <div style={{ color: MAP_COLOR }}>MAP: {format(row.map, "mmHg")}</div>
    </div>
  );
}
export function PulsePressureChart({ records }: { records: HealthData["records"] }) {
  const printLayout = useContext(PrintLayoutContext);
  const rows = bpDerived(records);
  if (!rows.length)
    return (
      <div className="empty small">
        No blood pressure records in this period.
      </div>
    );
  const ppOutliers = outlierDates(
    rows.map((r) => ({ date: r.date, value: r.pulsePressure })),
  );
  const mapOutliers = outlierDates(
    rows.map((r) => ({ date: r.date, value: r.map })),
  );
  const values = rows.flatMap((r) => [r.pulsePressure, r.map]);
  const axisMin = niceAxisMin(Math.min(...values), Math.max(...values));
  const chart = (width?: number, height?: number) => (
    <AreaChart data={rows} width={width} height={height}>
      <CartesianGrid vertical={false} stroke="#e7eaf0" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
      <YAxis domain={[axisMin, "auto"]} tick={{ fontSize: 11 }} width={45} />
      <Tooltip content={<PulsePressureTooltip />} />
      <Area
        type="monotone"
        dataKey="pulsePressure"
        stroke={PULSE_PRESSURE_COLOR}
        strokeWidth={2.5}
        fill="none"
        dot={outlierDot(ppOutliers, PULSE_PRESSURE_COLOR)}
        isAnimationActive={!printLayout}
      />
      <Area
        type="monotone"
        dataKey="map"
        stroke={MAP_COLOR}
        strokeWidth={2.5}
        fill="none"
        dot={outlierDot(mapOutliers, MAP_COLOR)}
        isAnimationActive={!printLayout}
      />
    </AreaChart>
  );
  return (
    <article className="panel">
      <h3>Pulse pressure &amp; mean arterial pressure</h3>
      {printLayout ? (
        <div data-pdf-chart-ready="true">{chart(680, 260)}</div>
      ) : (
        <ResponsiveContainer key="pulse-pressure-screen" width="100%" height={210}>
          {chart()}
        </ResponsiveContainer>
      )}
      {!printLayout && (
        <div className="chart-legend">
          <small style={{ color: PULSE_PRESSURE_COLOR }}>▮ Pulse pressure</small>
          <small style={{ color: MAP_COLOR, marginLeft: 14 }}>
            ▮ Mean arterial pressure
          </small>
        </div>
      )}
      {!printLayout && (
        <>
          <OutlierNote
            label="Pulse pressure"
            outliers={ppOutliers}
            rows={rows.map((r) => ({ date: r.date, value: r.pulsePressure }))}
            unit="mmHg"
            decimals={0}
          />
          <OutlierNote
            label="MAP"
            outliers={mapOutliers}
            rows={rows.map((r) => ({ date: r.date, value: r.map }))}
            unit="mmHg"
            decimals={0}
          />
        </>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Import and render the panel in `App.tsx`**

In `src/App.tsx`, change:

```tsx
import { MetricChart } from "./components/charts/MetricChart";
import { BloodPressureChart } from "./components/charts/BloodPressureChart";
import { coverageNote } from "./components/TableNotes";
```

to:

```tsx
import { MetricChart } from "./components/charts/MetricChart";
import { BloodPressureChart } from "./components/charts/BloodPressureChart";
import { PulsePressureChart } from "./components/charts/PulsePressureChart";
import { coverageNote } from "./components/TableNotes";
```

and, in the dashboard loop (`src/App.tsx:331-333`), change:

```tsx
              {group.title === "Vitals" && hasBloodPressure && (
                <BloodPressureChart records={records} from={from} to={to} />
              )}{" "}
```

to:

```tsx
              {group.title === "Vitals" && hasBloodPressure && (
                <BloodPressureChart records={records} from={from} to={to} />
              )}{" "}
              {group.title === "Vitals" && hasBloodPressure && (
                <PulsePressureChart records={records} />
              )}{" "}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/PulsePressureChart.tsx src/App.tsx
git commit -m "Add pulse pressure / MAP chart panel"
```

---

### Task 9: Blood pressure category strip (Swedish/AHA toggle, period-average badge, sustained-run call-out)

**Files:**
- Modify: `src/components/charts/BloodPressureChart.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `bpDerived()`, `bpPeriodAverage()` (Task 4), `bpCategorySwedish`/`bpCategoryAha`/`bpCategoryColorsSwedish`/`bpCategoryColorsAha`/`bpCategoryOrderSwedish`/`bpCategoryOrderAha`/`longestElevatedRun`/`BpScheme` (Task 5), `formatDate()` (existing, `src/report.ts`)

This task assumes Task 7 Step 6 (outlier marking in `BloodPressureChart`) has already landed — it builds directly on the `sOutliers`/`dOutliers`/`chartRows` and `OutlierNote` code that step adds.

- [ ] **Step 1: Import the new report.ts names and `useState`**

In `src/components/charts/BloodPressureChart.tsx`, change the imports (as left by Task 7 Step 6):

```tsx
import { useContext } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData } from "../../shared/types";
import { colorsByMetric, dailyStats, format, outlierDates } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { coverageNote } from "../TableNotes";
import { bpRangeBarShape } from "./bpChartShapes";
import { OutlierNote } from "./outlierHelpers";
```

to:

```tsx
import { useContext, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData } from "../../shared/types";
import {
  colorsByMetric,
  dailyStats,
  format,
  formatDate,
  outlierDates,
  bpDerived,
  bpPeriodAverage,
  bpCategorySwedish,
  bpCategoryColorsSwedish,
  bpCategoryOrderSwedish,
  bpCategoryAha,
  bpCategoryColorsAha,
  bpCategoryOrderAha,
  longestElevatedRun,
} from "../../report";
import type { BpScheme } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { coverageNote } from "../TableNotes";
import { bpRangeBarShape } from "./bpChartShapes";
import { OutlierNote } from "./outlierHelpers";
```

- [ ] **Step 2: Add classification state**

In `BloodPressureChart`, change the function's opening:

```tsx
export function BloodPressureChart({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const sNote = coverageNote("bloodPressureSystolic", records, from, to);
  const dNote = coverageNote("bloodPressureDiastolic", records, from, to);
```

to:

```tsx
export function BloodPressureChart({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const [scheme, setScheme] = useState<BpScheme>("swedish");
  const sNote = coverageNote("bloodPressureSystolic", records, from, to);
  const dNote = coverageNote("bloodPressureDiastolic", records, from, to);
```

- [ ] **Step 3: Compute category data after the existing outlier block**

Immediately after the `chartRows` block added in Task 7 Step 6 (the `sOutlier`/`dOutlier` mapping, right before `const chart = (width?: number, height?: number) => (`), add:

```tsx
  const derivedDays = bpDerived(records);
  const categoryFn: (systolic: number, diastolic: number) => string =
    scheme === "swedish" ? bpCategorySwedish : bpCategoryAha;
  const categoryColors: Record<string, string> =
    scheme === "swedish" ? bpCategoryColorsSwedish : bpCategoryColorsAha;
  const categoryOrder: string[] =
    scheme === "swedish" ? bpCategoryOrderSwedish : bpCategoryOrderAha;
  const floorCategory: string =
    scheme === "swedish" ? "Grade 1 hypertension" : "Stage 1";
  const categorizedDays = derivedDays.map((d) => ({
    date: d.date,
    category: categoryFn(d.systolic, d.diastolic),
  }));
  const periodAverage = bpPeriodAverage(derivedDays);
  const periodCategory = periodAverage
    ? categoryFn(periodAverage.systolic, periodAverage.diastolic)
    : undefined;
  const elevatedRun = longestElevatedRun(
    categorizedDays,
    categoryOrder,
    floorCategory,
  );
  const categoryPercentages = categoryOrder
    .map((category) => ({
      category,
      pct: categorizedDays.length
        ? Math.round(
            (categorizedDays.filter((d) => d.category === category).length /
              categorizedDays.length) *
              100,
          )
        : 0,
    }))
    .filter((c) => c.pct > 0);
```

- [ ] **Step 4: Render the toggle, badge, run call-out, strip, and summary**

In `BloodPressureChart`'s return, change the block after the `bp-legend` div and the `OutlierNote`s added in Task 7 Step 6 — i.e. change:

```tsx
      {!printLayout && (
        <>
          <OutlierNote
            label="Systolic"
            outliers={sOutliers}
            rows={rows
              .filter((r): r is typeof r & { sAvg: number } => r.sAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.sAvg }))}
            unit="mmHg"
            decimals={0}
          />
          <OutlierNote
            label="Diastolic"
            outliers={dOutliers}
            rows={rows
              .filter((r): r is typeof r & { dAvg: number } => r.dAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.dAvg }))}
            unit="mmHg"
            decimals={0}
          />
        </>
      )}
    </article>
  );
}
```

to:

```tsx
      {!printLayout && (
        <>
          <OutlierNote
            label="Systolic"
            outliers={sOutliers}
            rows={rows
              .filter((r): r is typeof r & { sAvg: number } => r.sAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.sAvg }))}
            unit="mmHg"
            decimals={0}
          />
          <OutlierNote
            label="Diastolic"
            outliers={dOutliers}
            rows={rows
              .filter((r): r is typeof r & { dAvg: number } => r.dAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.dAvg }))}
            unit="mmHg"
            decimals={0}
          />
        </>
      )}
      {!printLayout && derivedDays.length > 0 && (
        <div className="bp-category">
          <div
            className="bp-scheme-toggle"
            role="group"
            aria-label="Blood pressure classification scheme"
          >
            <button
              type="button"
              className={scheme === "swedish" ? "active" : ""}
              onClick={() => setScheme("swedish")}
            >
              Swedish
            </button>
            <button
              type="button"
              className={scheme === "aha" ? "active" : ""}
              onClick={() => setScheme("aha")}
            >
              AHA
            </button>
          </div>
          {periodAverage && periodCategory && (
            <div
              className="bp-badge"
              style={{ borderColor: categoryColors[periodCategory] }}
            >
              <span>Period average</span>
              <strong style={{ color: categoryColors[periodCategory] }}>
                {format(periodAverage.systolic, "", 0)}/
                {format(periodAverage.diastolic, "", 0)} mmHg — {periodCategory}
              </strong>
              <small>
                Approximates the {scheme === "swedish" ? "Swedish (ESC/ESH)" : "AHA"}{" "}
                home-monitoring diagnostic threshold; not a clinical diagnosis.
              </small>
            </div>
          )}
          {elevatedRun && (
            <small className="table-notes">
              Sustained: {elevatedRun.length} consecutive days at{" "}
              {floorCategory} or higher ({formatDate(elevatedRun.start)}–
              {formatDate(elevatedRun.end)}).
            </small>
          )}
          <div className="bp-strip">
            {categorizedDays.map((day) => (
              <span
                key={day.date}
                className="bp-strip-cell"
                style={{ background: categoryColors[day.category] }}
                title={`${formatDate(day.date)}: ${day.category}`}
              />
            ))}
          </div>
          <small className="table-notes">
            {categoryPercentages
              .map((p) => `${p.pct}% ${p.category}`)
              .join(" · ")}
          </small>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 5: Add the new CSS**

In `src/styles.css`, add after the existing `.diagnostics b { color: #263348; }` rule (around line 341):

```css
.bp-category {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}
.bp-scheme-toggle {
  display: flex;
  gap: 6px;
}
.bp-scheme-toggle button {
  padding: 4px 10px;
  font-size: 12px;
  min-height: 0;
}
.bp-scheme-toggle button.active {
  background: #4263eb;
  border-color: #4263eb;
  color: white;
}
.bp-badge {
  border-left: 3px solid;
  padding: 6px 10px;
  background: #f6f8fb;
  border-radius: 6px;
}
.bp-badge span {
  display: block;
  font-size: 11px;
  color: #718096;
}
.bp-badge strong {
  display: block;
  font-size: 15px;
  margin: 2px 0;
}
.bp-strip {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
}
.bp-strip-cell {
  width: 10px;
  height: 18px;
  border-radius: 2px;
  display: inline-block;
}
```

Then change the existing print-hide rule:

```css
  .dashboard .table-notes,
  .dashboard .bp-legend,
  .dashboard .chart-legend {
    display: none !important;
  }
```

to:

```css
  .dashboard .table-notes,
  .dashboard .bp-legend,
  .dashboard .chart-legend,
  .dashboard .bp-category {
    display: none !important;
  }
```

- [ ] **Step 6: Type-check**

Run: `npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/charts/BloodPressureChart.tsx src/styles.css
git commit -m "Add Swedish/AHA BP category strip with period-average badge and sustained-run call-out"
```

---

## Final Verification

- [ ] Run the full suite once: `npx tsc -p tsconfig.json && npx tsc -p tsconfig.electron.json && npm test`
- [ ] Re-read `docs/design/chart_analysis.md` end to end and confirm every numbered section (1–5) has a corresponding completed task above.
