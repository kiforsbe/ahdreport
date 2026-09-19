# Blood Glucose Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Apple Health blood glucose, insulin delivery, body composition, respiratory/oxygen, and cardio-fitness data. Add a Blood glucose overview tile, a Blood glucose dashboard section, and a detailed daily glucose table.

**Architecture:** New HealthKit types become ordinary `Metric`s. The parser normalizes units and maps two metadata keys into `HealthRecord.category`. Glucose calculations live in a new pure module, `src/glucose.ts`. UI is split into focused components under `src/components/glucose/` plus one table component. The charts are custom SVG (no Recharts), so the PDF readiness protocol is unaffected.

**Tech Stack:** TypeScript, React 19, Vitest 4 with jsdom and Testing Library, fast-xml-parser, and Electron (parser runs in the main process).

**Spec:** `docs/superpowers/specs/2026-09-19-glucose-tracking-design.md`. Reference prototypes are `docs/design/prototypes/glucose-summary.html`, `glucose-detailed.html`, and `glucose-data.js`.

## Global Constraints

- Glucose is always stored and displayed in mmol/L. mg/dL is divided by `18.0156`.
- Target presets:

  | Preset | Label | Range (mmol/L) |
  |---|---|---|
  | `type2` (default) | Type 2 diabetes | 3.9–10.0 |
  | `type1` | Type 1 diabetes | 3.9–10.0 |
  | `pregnancy` | Pregnancy / gestational | 3.5–7.8 |
  | `reference` | Non-diabetic reference | 3.9–7.8 |
  | `custom` | Custom | pre-filled 4.0–10.0 |

  A custom range is valid when `2.0 ≤ low < high ≤ 20.0`. Classification is inclusive for "within".
- Continuous-data gate: `daysWithReadings >= 14 && coverage >= 0.7`. Coverage is distinct 15-minute slots divided by `windowDays × 96`.
- Association minimums: 5 pairs for carbohydrates and activity; 3 nights in each sleep group.
- Status colours: below `#c92a2a`, within `#51cf66`, above `#d9480f`, line `#4263eb`, band `rgba(81, 207, 102, 0.13)`. Lane colours: carbs `#f08c00`, insulin `#9c36b5`, activity `#0ca678`, sleep `#4c6ef5`.
- Required copy, verbatim:
  - "Share of recorded readings, not time in range."
  - "Share of time, weighted by continuous readings."
  - "Descriptive comparison only. It does not establish cause, and it is not guidance on medication or insulin doses."
- Never infer "fasting" or any other meal context. Never use insulin in an association.
- Glucose helpers group by **local** calendar day (`localDay()`). They do not change the existing UTC-based `daily()`/`dailyStats()`.
- Helpers receive the parser's ascending-sorted records and must not re-sort them.
- Tests build timestamps with `new Date(2026, 0, d, h, m).toISOString()` so they don't depend on the machine's timezone.
- Run only the test files named in each task. The full suite, typecheck, and build run once, in Task 5.
- **Commit steps:** the user's global rule is to never `git commit` unless the user asked for it in the current request. Run a task's commit step only when the user has authorized commits for this execution; otherwise leave changes uncommitted and report them.

---

### Task 1: Data layer (metric types, metadata maps, parser)

**Files:**
- Modify: `src/shared/types.ts` (the `Metric` union)
- Modify: `src/report.ts` (`labels`, `decimalsByMetric`, `colorsByMetric`, `metricGroups`)
- Modify: `electron/appleHealthParser.ts` (`typeMap`, `plausibleRanges`, the record loop, new helpers)
- Create: `tests/newMetrics.test.ts`
- Modify: `tests/appleHealthParser.test.ts` (append a `describe` block)

**Interfaces:**
- Produces:
  - New `Metric` members: `"bloodGlucose" | "insulinDelivery" | "bodyMassIndex" | "bodyFatPercentage" | "waistCircumference" | "leanBodyMass" | "oxygenSaturation" | "respiratoryRate" | "heartRateVariability" | "vo2Max" | "walkingHeartRateAverage"`.
  - Glucose records: `unit: "mmol/L"`, `category?: "beforeMeal" | "afterMeal"`.
  - Insulin records: `unit: "IU"`, `category?: "basal" | "bolus"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/newMetrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { labels, metricGroups } from "../src/report";

describe("new health categories", () => {
  it("extends Vitals and Sleep & activity with the new metrics", () => {
    const vitals = metricGroups.find((g) => g.title === "Vitals")!.metrics;
    expect(vitals).toEqual(
      expect.arrayContaining([
        "bodyMassIndex",
        "bodyFatPercentage",
        "waistCircumference",
        "leanBodyMass",
        "heartRateVariability",
        "oxygenSaturation",
        "respiratoryRate",
      ]),
    );
    const activity = metricGroups.find((g) => g.title === "Sleep & activity")!.metrics;
    expect(activity).toEqual(expect.arrayContaining(["vo2Max", "walkingHeartRateAverage"]));
  });

  it("keeps glucose and insulin out of the generic dashboard groups", () => {
    const all = metricGroups.flatMap((g) => g.metrics);
    expect(all).not.toContain("bloodGlucose");
    expect(all).not.toContain("insulinDelivery");
  });

  it("labels the new metrics", () => {
    expect(labels.bloodGlucose).toBe("Blood glucose");
    expect(labels.insulinDelivery).toBe("Insulin delivery");
    expect(labels.oxygenSaturation).toBe("Blood oxygen");
    expect(labels.vo2Max).toBe("Cardio fitness (VO₂ max)");
  });
});
```

Append to `tests/appleHealthParser.test.ts`:

```ts
describe("glucose, insulin and additional categories", () => {
  const rec = (type: string, unit: string, value: string, time: string, children = "") =>
    `<Record type="${type}" sourceName="Src" unit="${unit}" value="${value}" startDate="2026-01-02 ${time}:00 +0000" endDate="2026-01-02 ${time}:00 +0000">${children}</Record>`;
  const meta = (key: string, value: string) => `<MetadataEntry key="${key}" value="${value}"/>`;
  const parse = (body: string) =>
    parseAppleHealthExport(
      Buffer.from(`<?xml version="1.0"?><HealthData>${body}</HealthData>`),
      "export.xml",
    );

  it("converts glucose to mmol/L and maps meal-time metadata", async () => {
    const result = await parse(
      rec("HKQuantityTypeIdentifierBloodGlucose", "mg/dL", "126", "08:00", meta("HKBloodGlucoseMealTime", "2")) +
        rec("HKQuantityTypeIdentifierBloodGlucose", "mmol&lt;180.15588000005408&gt;/L", "5.4", "09:00"),
    );
    const [first, second] = result.records;
    expect(first.metric).toBe("bloodGlucose");
    expect(first.unit).toBe("mmol/L");
    expect(first.value).toBeCloseTo(126 / 18.0156, 6);
    expect(first.category).toBe("afterMeal");
    expect(second).toMatchObject({ metric: "bloodGlucose", unit: "mmol/L", value: 5.4 });
    expect(second.category).toBeUndefined();
  });

  it("maps insulin delivery reason from single or multiple metadata entries", async () => {
    const result = await parse(
      rec(
        "HKQuantityTypeIdentifierInsulinDelivery",
        "IU",
        "6",
        "10:00",
        meta("HKWasUserEntered", "1") + meta("HKInsulinDeliveryReason", "2"),
      ) +
        rec("HKQuantityTypeIdentifierInsulinDelivery", "IU", "14", "22:00", meta("HKInsulinDeliveryReason", "1")) +
        rec("HKQuantityTypeIdentifierInsulinDelivery", "IU", "2", "23:00"),
    );
    expect(result.records.map((r) => [r.metric, r.value, r.category])).toEqual([
      ["insulinDelivery", 6, "bolus"],
      ["insulinDelivery", 14, "basal"],
      ["insulinDelivery", 2, undefined],
    ]);
  });

  it("converts fraction percentages and rejects implausible glucose after conversion", async () => {
    const result = await parse(
      rec("HKQuantityTypeIdentifierOxygenSaturation", "%", "0.97", "11:00") +
        rec("HKQuantityTypeIdentifierBodyFatPercentage", "%", "0.253", "12:00") +
        rec("HKQuantityTypeIdentifierBloodGlucose", "mg/dL", "900", "13:00"),
    );
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ metric: "oxygenSaturation", unit: "%" });
    expect(result.records[0].value).toBeCloseTo(97, 6);
    expect(result.records[1].value).toBeCloseTo(25.3, 6);
    expect(result.diagnostics.implausible).toBe(1);
  });

  it("maps the remaining new quantity types", async () => {
    const result = await parse(
      rec("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "ms", "42", "01:00") +
        rec("HKQuantityTypeIdentifierRespiratoryRate", "count/min", "14.5", "02:00") +
        rec("HKQuantityTypeIdentifierVO2Max", "mL/min·kg", "33.1", "03:00") +
        rec("HKQuantityTypeIdentifierWalkingHeartRateAverage", "count/min", "102", "04:00") +
        rec("HKQuantityTypeIdentifierBodyMassIndex", "count", "29.4", "05:00") +
        rec("HKQuantityTypeIdentifierWaistCircumference", "cm", "102", "06:00") +
        rec("HKQuantityTypeIdentifierLeanBodyMass", "kg", "58", "07:00"),
    );
    expect(result.records.map((r) => r.metric)).toEqual([
      "heartRateVariability",
      "respiratoryRate",
      "vo2Max",
      "walkingHeartRateAverage",
      "bodyMassIndex",
      "waistCircumference",
      "leanBodyMass",
    ]);
    expect(result.diagnostics.unsupported).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/newMetrics.test.ts tests/appleHealthParser.test.ts`
Expected: FAIL. `labels.bloodGlucose` is undefined, the new records are counted as unsupported, and TypeScript errors appear on unknown metrics.

- [ ] **Step 3: Extend the `Metric` union**

In `src/shared/types.ts`, insert the following before `| "medication";`:

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

- [ ] **Step 4: Add report metadata and group membership**

In `src/report.ts`, add these entries before `medication` in each map.

`labels`:

```ts
  bloodGlucose: "Blood glucose",
  insulinDelivery: "Insulin delivery",
  bodyMassIndex: "Body mass index",
  bodyFatPercentage: "Body fat",
  waistCircumference: "Waist circumference",
  leanBodyMass: "Lean body mass",
  oxygenSaturation: "Blood oxygen",
  respiratoryRate: "Respiratory rate",
  heartRateVariability: "Heart rate variability",
  vo2Max: "Cardio fitness (VO₂ max)",
  walkingHeartRateAverage: "Walking heart rate average",
```

`decimalsByMetric`:

```ts
  bloodGlucose: 1,
  insulinDelivery: 1,
  bodyMassIndex: 1,
  bodyFatPercentage: 1,
  waistCircumference: 0,
  leanBodyMass: 1,
  oxygenSaturation: 0,
  respiratoryRate: 1,
  heartRateVariability: 0,
  vo2Max: 1,
  walkingHeartRateAverage: 0,
```

`colorsByMetric`:

```ts
  bloodGlucose: "#4263eb",
  insulinDelivery: "#9c36b5",
  bodyMassIndex: "#0ca678",
  bodyFatPercentage: "#f08c00",
  waistCircumference: "#7048e8",
  leanBodyMass: "#1098ad",
  oxygenSaturation: "#1098ad",
  respiratoryRate: "#0ca678",
  heartRateVariability: "#e64980",
  vo2Max: "#e03131",
  walkingHeartRateAverage: "#e64980",
```

In `metricGroups`:
- Append to the Vitals `metrics` array after `"bodyTemperature"`: `"bodyMassIndex", "bodyFatPercentage", "waistCircumference", "leanBodyMass", "heartRateVariability", "oxygenSaturation", "respiratoryRate"`.
- Change the Sleep & activity array to `["sleep", "steps", "activeEnergy", "exerciseTime", "distance", "vo2Max", "walkingHeartRateAverage"]`.

The generic `ReportTable` loop in `App.tsx` iterates `metricGroups` minus the specialised metrics, so the new metrics get detailed tables with no further change.

- [ ] **Step 5: Parser mapping, normalization, metadata, bounds**

In `electron/appleHealthParser.ts`, add to `typeMap` before the `HKClinicalTypeIdentifierMedicationRecord` line:

```ts
  HKQuantityTypeIdentifierBloodGlucose: "bloodGlucose",
  HKQuantityTypeIdentifierInsulinDelivery: "insulinDelivery",
  HKQuantityTypeIdentifierBodyMassIndex: "bodyMassIndex",
  HKQuantityTypeIdentifierBodyFatPercentage: "bodyFatPercentage",
  HKQuantityTypeIdentifierWaistCircumference: "waistCircumference",
  HKQuantityTypeIdentifierLeanBodyMass: "leanBodyMass",
  HKQuantityTypeIdentifierOxygenSaturation: "oxygenSaturation",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "heartRateVariability",
  HKQuantityTypeIdentifierVO2Max: "vo2Max",
  HKQuantityTypeIdentifierWalkingHeartRateAverage: "walkingHeartRateAverage",
```

Extend `plausibleRanges`. Units are the post-normalization strings:

```ts
  bloodGlucose: { "mmol/L": [1, 40] },
  insulinDelivery: { IU: [0, 300] },
  oxygenSaturation: { "%": [50, 100] },
  respiratoryRate: { "count/min": [4, 60] },
  heartRateVariability: { ms: [1, 300] },
  bodyMassIndex: { count: [10, 80] },
  bodyFatPercentage: { "%": [2, 75] },
  waistCircumference: { cm: [40, 200], in: [16, 80] },
  leanBodyMass: { kg: [10, 200], lb: [22, 440] },
  vo2Max: { "mL/min·kg": [5, 90] },
  walkingHeartRateAverage: { "count/min": [30, 220] },
```

Add these helpers directly after `isPlausible`:

```ts
const MG_PER_MMOL_GLUCOSE = 18.0156;
// Apple stores these as fractions (0.97) with unit "%".
const fractionPercentMetrics: Metric[] = ["oxygenSaturation", "bodyFatPercentage"];
function normalizeQuantity(
  metric: Metric,
  value: number,
  unit: string,
): { value: number; unit: string } {
  if (metric === "bloodGlucose") {
    if (unit === "mg/dL") return { value: value / MG_PER_MMOL_GLUCOSE, unit: "mmol/L" };
    // The mmol unit embeds the molar mass, e.g. "mmol<180.15588000005408>/L".
    if (/^mmol(<[\d.]+>)?\/L$/.test(unit)) return { value, unit: "mmol/L" };
  }
  if (fractionPercentMetrics.includes(metric) && unit === "%" && value <= 1)
    return { value: value * 100, unit };
  return { value, unit };
}
// Only these two metrics read MetadataEntry children; every other record
// skips the work so large exports are not slowed down.
const metadataCategories: Partial<
  Record<Metric, { key: string; values: Record<string, string> }>
> = {
  bloodGlucose: {
    key: "HKBloodGlucoseMealTime",
    values: { "1": "beforeMeal", "2": "afterMeal" },
  },
  insulinDelivery: {
    key: "HKInsulinDeliveryReason",
    values: { "1": "basal", "2": "bolus" },
  },
};
function metadataCategory(metric: Metric, raw: unknown): string | undefined {
  const spec = metadataCategories[metric];
  if (!spec) return undefined;
  const entries = (raw && typeof raw === "object"
    ? (raw as { MetadataEntry?: unknown }).MetadataEntry
    : undefined);
  const entry = nodes(entries)
    .map(attribute)
    .find((candidate) => candidate.key === spec.key);
  return entry ? spec.values[String(entry.value)] : undefined;
}
```

`nodes` is declared later in the file as a function declaration, so it is hoisted and can be used here.

Replace the body of the record loop from `const start = r.startDate;` through the `records.push({...});` call with:

```ts
    const start = r.startDate;
    const end = r.endDate || start;
    const rawValue = metric === "sleep" ? sleepHours(start, end) : Number(r.value);
    const timestamp = Date.parse(start);
    if (!start || !Number.isFinite(timestamp) || !Number.isFinite(rawValue))
      continue;
    const date = new Date(timestamp).toISOString();
    const { value, unit } = normalizeQuantity(
      metric,
      rawValue,
      metric === "sleep" ? "hr" : r.unit || "",
    );
    if (!isPlausible(metric, value, unit)) {
      implausible++;
      continue;
    }
    const key = `${metric}|${date}|${value}|${unit}|${r.sourceName || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      metric,
      date,
      value,
      unit,
      source: r.sourceName,
      category: metric === "sleep" ? r.value : metadataCategory(metric, raw),
    });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/newMetrics.test.ts tests/appleHealthParser.test.ts tests/report.test.ts`
Expected: PASS, including the existing parser and report tests.

- [ ] **Step 7: Commit (only if commits are authorized; see Global Constraints)**

```bash
git add src/shared/types.ts src/report.ts electron/appleHealthParser.ts tests/newMetrics.test.ts tests/appleHealthParser.test.ts
git commit -m "Import blood glucose, insulin and additional Apple Health quantity types"
```

---

### Task 2: Glucose analysis module

**Files:**
- Create: `src/glucose.ts`
- Create: `tests/glucose.test.ts`

**Interfaces:**
- Consumes: `Metric` values from Task 1; `quantile(sorted, p)` and `format(value, unit, decimals)` from `src/report.ts`.
- Produces (all exported from `src/glucose.ts`):
  - `type GlucosePresetId = "type2" | "type1" | "pregnancy" | "reference" | "custom"`
  - `interface GlucoseRange { preset: GlucosePresetId; low: number; high: number }`
  - `glucosePresets`, `presetRange(id): GlucoseRange`, `defaultGlucoseRange`, `glucosePresetLabel(id): string`, `withCustomBound(range, "low" | "high", value): GlucoseRange`
  - `type GlucoseClass = "below" | "within" | "above"`, `classifyGlucose(value, range): GlucoseClass`, `glucoseStatusColor(value, range): string`, `glucoseColors`
  - `formatMmol(value): string`, `glucoseRangeText(range): string`, `localDay(value: string | number): string`, `shortDate(isoDay): string`, `timeOfDay(value: string | number): string`, `medianOf(values): number | undefined`
  - `MG_PER_MMOL`, `MINUTE_MS`, `HOUR_MS`, `ASSOCIATION_MIN_PAIRS`
  - `glucoseReadings(records): HealthRecord[]`
  - `interface GlucoseSummary` and `glucoseSummary(records, range, from, to): GlucoseSummary | undefined`
  - `interface ActivitySession { start: number; end: number; minutes: number }` and `activitySessions(records)`
  - `interface SleepNight { start: number; end: number; hours: number; date: string }` and `sleepNights(records)`
  - `interface GlucoseDay` and `glucoseDaily(records, range): GlucoseDay[]` (newest first)
  - `interface HourProfile` and `glucoseHourlyProfile(records): HourProfile[]` (24 entries)
  - `interface GlucoseAssociations` and `glucoseAssociations(records): GlucoseAssociations`

- [ ] **Step 1: Write the failing tests**

Create `tests/glucose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { HealthRecord } from "../src/shared/types";
import {
  activitySessions,
  classifyGlucose,
  defaultGlucoseRange,
  glucoseAssociations,
  glucoseDaily,
  glucoseHourlyProfile,
  glucoseSummary,
  localDay,
  presetRange,
  sleepNights,
  withCustomBound,
} from "../src/glucose";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 0, 1 + day, hour, minute).toISOString();
const glucose = (date: string, value: number, category?: string): HealthRecord => ({
  metric: "bloodGlucose",
  date,
  value,
  unit: "mmol/L",
  category,
});
const byDate = (records: HealthRecord[]) =>
  records.slice().sort((a, b) => a.date.localeCompare(b.date));
function denseDays(days: number, perDay = 96, value = 6.0) {
  const out: HealthRecord[] = [];
  for (let d = 0; d < days; d++)
    for (let k = 0; k < perDay; k++) out.push(glucose(at(d, 0, k * 15), value));
  return out;
}
const type2 = defaultGlucoseRange;

describe("target range", () => {
  it("classifies inclusively at the bounds", () => {
    expect(classifyGlucose(3.9, type2)).toBe("within");
    expect(classifyGlucose(10.0, type2)).toBe("within");
    expect(classifyGlucose(3.89, type2)).toBe("below");
    expect(classifyGlucose(10.01, type2)).toBe("above");
  });
  it("provides presets", () => {
    expect(presetRange("pregnancy")).toEqual({ preset: "pregnancy", low: 3.5, high: 7.8 });
    expect(presetRange("custom")).toEqual({ preset: "custom", low: 4.0, high: 10.0 });
  });
  it("accepts valid custom bounds and keeps the last valid range otherwise", () => {
    expect(withCustomBound(type2, "low", 4.5)).toEqual({ preset: "custom", low: 4.5, high: 10 });
    expect(withCustomBound(type2, "low", 12)).toBe(type2);
    expect(withCustomBound(type2, "high", 25)).toBe(type2);
    expect(withCustomBound(type2, "low", 1.5)).toBe(type2);
    expect(withCustomBound(type2, "low", Number.NaN)).toBe(type2);
  });
});

describe("glucoseSummary", () => {
  it("returns undefined without readings", () => {
    expect(glucoseSummary([], type2, "", "")).toBeUndefined();
  });

  it("uses count-based shares for spot readings", () => {
    const records = [glucose(at(0, 8), 5), glucose(at(0, 12), 8), glucose(at(0, 18), 12)];
    const s = glucoseSummary(records, type2, "", "")!;
    expect(s.dense).toBe(false);
    expect(s.gmi).toBeUndefined();
    expect(s.median).toBe(8);
    expect(s.split.within).toBeCloseTo(2 / 3, 10);
    expect(s.split.above).toBeCloseTo(1 / 3, 10);
    expect(s.latest.value).toBe(12);
    expect(s.windowDays).toBe(1);
  });

  it("weights continuous readings by time to the next reading, capped at 15 minutes", () => {
    const extras = Array.from({ length: 14 }, (_, i) => glucose(at(0, 12, i + 1), 12));
    const records = byDate([...denseDays(14), ...extras]);
    const s = glucoseSummary(records, type2, localDay(at(0, 0)), localDay(at(13, 0)))!;
    expect(s.dense).toBe(true);
    // 1342 base readings × 15 min + 12:00 base (1) + 14 extras (1 each) + last reading (5)
    expect(s.split.above).toBeCloseTo(14 / 20150, 10);
  });

  it("gates continuous metrics on 14 days and 70% coverage", () => {
    const from = localDay(at(0, 0));
    expect(glucoseSummary(denseDays(13), type2, from, localDay(at(12, 0)))!.dense).toBe(false);
    expect(glucoseSummary(denseDays(14, 67), type2, from, localDay(at(13, 0)))!.dense).toBe(false);
    expect(glucoseSummary(denseDays(14, 68), type2, from, localDay(at(13, 0)))!.dense).toBe(true);
  });

  it("computes GMI, IFCC and CV", () => {
    const s = glucoseSummary(denseDays(14), type2, localDay(at(0, 0)), localDay(at(13, 0)))!;
    expect(s.gmi!.percent).toBeCloseTo(5.896, 3);
    expect(s.gmi!.mmolPerMol).toBeCloseTo(40.92, 2);
    expect(s.cv).toBe(0);
  });

  it("summarizes meal-time tags without inferring untagged readings", () => {
    const records = [
      glucose(at(0, 7), 5, "beforeMeal"),
      glucose(at(0, 9), 9, "afterMeal"),
      glucose(at(0, 12), 7, "beforeMeal"),
      glucose(at(0, 15), 6),
    ];
    const s = glucoseSummary(records, type2, "", "")!;
    expect(s.mealContext.beforeMeal).toEqual({ count: 2, median: 6 });
    expect(s.mealContext.afterMeal).toEqual({ count: 1, median: 9 });
    expect(s.mealContext.untagged).toEqual({ count: 1, median: 6 });
  });
});

describe("context events", () => {
  const exercise = (date: string, minutes: number): HealthRecord => ({
    metric: "exerciseTime",
    date,
    value: minutes,
    unit: "min",
  });
  const sleep = (date: string, hours: number, stage: string): HealthRecord => ({
    metric: "sleep",
    date,
    value: hours,
    unit: "hr",
    category: `HKCategoryValueSleepAnalysis${stage}`,
  });

  it("merges exercise minutes into sessions and drops sessions under 10 minutes", () => {
    const sessions = activitySessions([
      exercise(at(0, 8, 0), 5),
      exercise(at(0, 8, 5), 5),
      exercise(at(0, 8, 18), 5),
      exercise(at(0, 12, 0), 5),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].minutes).toBe(15);
    expect(sessions[0].start).toBe(Date.parse(at(0, 8, 0)));
    expect(sessions[0].end).toBe(Date.parse(at(0, 8, 23)));
  });

  it("does not double-count overlapping exercise records from two sources", () => {
    const sessions = activitySessions([exercise(at(0, 8), 10), exercise(at(0, 8), 10)]);
    expect(sessions[0].minutes).toBe(10);
  });

  it("groups asleep segments into nights, excluding in-bed and awake", () => {
    const nights = sleepNights([
      sleep(at(0, 21, 30), 9, "InBed"),
      sleep(at(0, 22, 0), 2, "AsleepCore"),
      sleep(at(1, 0, 0), 0.2, "Awake"),
      sleep(at(1, 0, 15), 1.5, "AsleepREM"),
      sleep(at(1, 2, 0), 4, "AsleepCore"),
      sleep(at(1, 23, 0), 7, "AsleepCore"),
    ]);
    expect(nights).toHaveLength(2);
    expect(nights[0].hours).toBeCloseTo(7.5, 10);
    expect(nights[0].end).toBe(Date.parse(at(1, 6, 0)));
    expect(nights[0].date).toBe(localDay(at(1, 6, 0)));
  });
});

describe("glucoseDaily and glucoseHourlyProfile", () => {
  it("builds newest-first local-day rows with context and insulin totals", () => {
    const records = byDate([
      glucose(at(0, 8), 5.0, "beforeMeal"),
      glucose(at(0, 10), 11.0, "afterMeal"),
      glucose(at(0, 22), 3.5),
      { metric: "carbs", date: at(0, 8, 10), value: 45, unit: "g" },
      { metric: "insulinDelivery", date: at(0, 8, 5), value: 6, unit: "IU", category: "bolus" },
      { metric: "insulinDelivery", date: at(0, 12), value: 2, unit: "IU" },
      { metric: "insulinDelivery", date: at(0, 22), value: 14, unit: "IU", category: "basal" },
      { metric: "exerciseTime", date: at(0, 18), value: 20, unit: "min" },
      glucose(at(1, 9), 7.0),
    ]);
    const days = glucoseDaily(records, type2);
    expect(days.map((d) => d.date)).toEqual([localDay(at(1, 9)), localDay(at(0, 8))]);
    const day = days[1];
    expect(day).toMatchObject({
      count: 3,
      min: 3.5,
      max: 11,
      median: 5,
      counts: { below: 1, within: 1, above: 1 },
      beforeMealMedian: 5,
      afterMealMedian: 11,
      basal: 14,
      bolus: 6,
      unspecifiedInsulin: 2,
    });
    expect(day.carbs).toHaveLength(1);
    expect(day.activity).toHaveLength(1);
  });

  it("computes hour-of-day percentiles and leaves empty hours without values", () => {
    const records = Array.from({ length: 21 }, (_, i) => glucose(at(i, 8, 30), i + 1));
    const profile = glucoseHourlyProfile(records);
    expect(profile).toHaveLength(24);
    expect(profile[8].percentiles).toMatchObject({ p5: 2, p50: 11, p95: 20 });
    expect(profile[3]).toEqual({ hour: 3, count: 0 });
  });
});

describe("glucoseAssociations", () => {
  const carbs = (date: string, grams: number): HealthRecord => ({ metric: "carbs", date, value: grams, unit: "g" });

  it("reports the median rise after logged carbohydrates once 5 pairs exist", () => {
    const records: HealthRecord[] = [];
    for (let d = 0; d < 5; d++)
      records.push(
        glucose(at(d, 7, 50), 6.0),
        carbs(at(d, 8, 0), 50),
        glucose(at(d, 9, 0), 8.5),
        glucose(at(d, 9, 30), 9.0),
      );
    const result = glucoseAssociations(byDate(records));
    expect(result.carbs).toEqual({ n: 5, value: 3 });
    const fewer = glucoseAssociations(byDate(records.slice(4)));
    expect(fewer.carbs.n).toBe(4);
    expect(fewer.carbs.value).toBeUndefined();
  });

  it("ignores carbohydrate entries without a reading in the previous 30 minutes", () => {
    const records = byDate([glucose(at(0, 7, 0), 6.0), carbs(at(0, 8, 0), 50), glucose(at(0, 9, 0), 9)]);
    expect(glucoseAssociations(records).carbs.n).toBe(0);
  });

  it("uses the reading closest to 2 hours after activity starts", () => {
    const records: HealthRecord[] = [];
    for (let d = 0; d < 5; d++)
      records.push(
        glucose(at(d, 16, 55), 7.0),
        { metric: "exerciseTime", date: at(d, 17, 0), value: 30, unit: "min" },
        glucose(at(d, 19, 0), 6.0),
        glucose(at(d, 20, 30), 5.0),
      );
    expect(glucoseAssociations(byDate(records)).activity).toEqual({ n: 5, value: -1 });
  });

  it("compares first morning readings after shorter and longer nights", () => {
    const records: HealthRecord[] = [];
    [5, 8, 5, 8, 5, 8].forEach((hours, d) => {
      const wake = new Date(2026, 0, 2 + d, 7, 0).getTime();
      records.push(
        {
          metric: "sleep",
          date: new Date(wake - hours * 3_600_000).toISOString(),
          value: hours,
          unit: "hr",
          category: "HKCategoryValueSleepAnalysisAsleepCore",
        },
        glucose(new Date(wake + 20 * 60_000).toISOString(), hours === 5 ? 7.5 : 6.5),
      );
    });
    const { sleep } = glucoseAssociations(byDate(records));
    expect(sleep).toEqual({ shorter: 3, longer: 3, splitHours: 6.5, value: 1 });
  });

  it("does not use a morning reading taken after the first carbohydrate entry", () => {
    const records: HealthRecord[] = [];
    [5, 8].forEach((hours, d) => {
      const wake = new Date(2026, 0, 2 + d, 7, 0).getTime();
      records.push({
        metric: "sleep",
        date: new Date(wake - hours * 3_600_000).toISOString(),
        value: hours,
        unit: "hr",
        category: "HKCategoryValueSleepAnalysisAsleepCore",
      });
      // Carbs before the reading on the short night only.
      if (hours === 5) records.push(carbs(new Date(wake + 10 * 60_000).toISOString(), 30));
      records.push(glucose(new Date(wake + 20 * 60_000).toISOString(), 9));
    });
    const { sleep } = glucoseAssociations(byDate(records));
    expect(sleep.shorter).toBe(0);
    expect(sleep.longer).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/glucose.test.ts`
Expected: FAIL with "Failed to resolve import ../src/glucose".

- [ ] **Step 3: Implement `src/glucose.ts`**

```ts
import type { HealthRecord } from "./shared/types";
import { format, quantile } from "./report";

// ---------- target range ----------
export type GlucosePresetId = "type2" | "type1" | "pregnancy" | "reference" | "custom";
export interface GlucoseRange {
  preset: GlucosePresetId;
  low: number;
  high: number;
}
export const glucosePresets: { id: GlucosePresetId; label: string; low: number; high: number }[] = [
  { id: "type2", label: "Type 2 diabetes", low: 3.9, high: 10.0 },
  { id: "type1", label: "Type 1 diabetes", low: 3.9, high: 10.0 },
  { id: "pregnancy", label: "Pregnancy / gestational", low: 3.5, high: 7.8 },
  { id: "reference", label: "Non-diabetic reference", low: 3.9, high: 7.8 },
  // Pre-filled with the common Swedish clinical shorthand.
  { id: "custom", label: "Custom", low: 4.0, high: 10.0 },
];
export function presetRange(id: GlucosePresetId): GlucoseRange {
  const preset = glucosePresets.find((p) => p.id === id) ?? glucosePresets[0];
  return { preset: preset.id, low: preset.low, high: preset.high };
}
export const defaultGlucoseRange = presetRange("type2");
export function glucosePresetLabel(id: GlucosePresetId) {
  return (glucosePresets.find((p) => p.id === id) ?? glucosePresets[0]).label;
}
// Returns `range` itself when the edit would make it invalid.
export function withCustomBound(
  range: GlucoseRange,
  bound: "low" | "high",
  value: number,
): GlucoseRange {
  const next: GlucoseRange = { ...range, preset: "custom", [bound]: value };
  const valid =
    Number.isFinite(value) && next.low >= 2 && next.high <= 20 && next.low < next.high;
  return valid ? next : range;
}

export type GlucoseClass = "below" | "within" | "above";
export function classifyGlucose(
  value: number,
  range: Pick<GlucoseRange, "low" | "high">,
): GlucoseClass {
  return value < range.low ? "below" : value > range.high ? "above" : "within";
}
export const glucoseColors = {
  below: "#c92a2a",
  within: "#51cf66",
  above: "#d9480f",
  line: "#4263eb",
  band: "rgba(81, 207, 102, 0.13)",
  carbs: "#f08c00",
  insulin: "#9c36b5",
  activity: "#0ca678",
  sleep: "#4c6ef5",
} as const;
// In-range readings keep the series colour; only out-of-range readings use status colours.
export function glucoseStatusColor(value: number, range: Pick<GlucoseRange, "low" | "high">) {
  const status = classifyGlucose(value, range);
  return status === "within" ? glucoseColors.line : glucoseColors[status];
}

// ---------- formatting & time ----------
export const MG_PER_MMOL = 18.0156;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const ASSOCIATION_MIN_PAIRS = 5;
const SLOT_MS = 15 * MINUTE_MS;

export function formatMmol(value: number) {
  return format(value, "", 1);
}
export function glucoseRangeText(range: Pick<GlucoseRange, "low" | "high">) {
  return `${formatMmol(range.low)}–${formatMmol(range.high)} mmol/L`;
}
// Local calendar day, matching filtered()'s local-day boundaries.
export function localDay(value: string | number) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shortDate(isoDay: string) {
  return new Date(`${isoDay}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
export function timeOfDay(value: string | number) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function daySpan(first: string, last: string) {
  const a = new Date(`${first}T12:00:00`).getTime();
  const b = new Date(`${last}T12:00:00`).getTime();
  return Math.round((b - a) / (24 * HOUR_MS)) + 1;
}
export function medianOf(values: number[]) {
  if (!values.length) return undefined;
  return quantile(values.slice().sort((a, b) => a - b), 0.5);
}
function populationSd(values: number[], mean: number) {
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}
export function glucoseReadings(records: HealthRecord[]) {
  return records.filter((record) => record.metric === "bloodGlucose");
}

// ---------- summary ----------
export interface MealContextStat {
  count: number;
  median?: number;
}
export interface GlucoseSummary {
  count: number;
  daysWithReadings: number;
  windowDays: number;
  coverage: number;
  dense: boolean;
  latest: HealthRecord;
  median: number;
  mean: number;
  sd: number;
  cv: number;
  split: Record<GlucoseClass, number>;
  gmi?: { percent: number; mmolPerMol: number };
  mealContext: { beforeMeal: MealContextStat; afterMeal: MealContextStat; untagged: MealContextStat };
}
export function glucoseSummary(
  records: HealthRecord[],
  range: GlucoseRange,
  from: string,
  to: string,
): GlucoseSummary | undefined {
  const readings = glucoseReadings(records);
  if (!readings.length) return undefined;
  const times = readings.map((r) => Date.parse(r.date));
  const values = readings.map((r) => r.value);
  const days = new Set(readings.map((r) => localDay(r.date)));
  const windowDays = daySpan(
    from || localDay(readings[0].date),
    to || localDay(readings.at(-1)!.date),
  );
  const coverage = new Set(times.map((t) => Math.floor(t / SLOT_MS))).size / (windowDays * 96);
  const dense = days.size >= 14 && coverage >= 0.7;
  // Continuous data: weight by time until the next reading (capped), so a
  // burst of readings does not outweigh the rest of the day.
  const weights = times.map((t, i) =>
    dense ? Math.min((times[i + 1] ?? t + 5 * MINUTE_MS) - t, SLOT_MS) : 1,
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const split: Record<GlucoseClass, number> = { below: 0, within: 0, above: 0 };
  values.forEach((v, i) => {
    split[classifyGlucose(v, range)] += weights[i] / totalWeight;
  });
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = populationSd(values, mean);
  const gmiPercent = 3.31 + 0.02392 * mean * MG_PER_MMOL;
  const stat = (vs: number[]): MealContextStat => ({ count: vs.length, median: medianOf(vs) });
  return {
    count: readings.length,
    daysWithReadings: days.size,
    windowDays,
    coverage,
    dense,
    latest: readings.at(-1)!,
    median: medianOf(values)!,
    mean,
    sd,
    cv: (sd / mean) * 100,
    split,
    gmi: dense ? { percent: gmiPercent, mmolPerMol: (gmiPercent - 2.152) / 0.09148 } : undefined,
    mealContext: {
      beforeMeal: stat(readings.filter((r) => r.category === "beforeMeal").map((r) => r.value)),
      afterMeal: stat(readings.filter((r) => r.category === "afterMeal").map((r) => r.value)),
      untagged: stat(readings.filter((r) => !r.category).map((r) => r.value)),
    },
  };
}

// ---------- context events ----------
export interface ActivitySession {
  start: number;
  end: number;
  minutes: number;
}
export function activitySessions(records: HealthRecord[]): ActivitySession[] {
  const sessions: ActivitySession[] = [];
  for (const record of records) {
    if (record.metric !== "exerciseTime") continue;
    const start = Date.parse(record.date);
    const end = start + record.value * MINUTE_MS;
    const last = sessions.at(-1);
    if (last && start - last.end <= 10 * MINUTE_MS) {
      // Count only the non-overlapping part, so duplicate sources don't add up.
      last.minutes += Math.max(0, end - Math.max(start, last.end)) / MINUTE_MS;
      last.end = Math.max(last.end, end);
    } else sessions.push({ start, end, minutes: record.value });
  }
  return sessions.filter((session) => session.minutes >= 10);
}
export interface SleepNight {
  start: number;
  end: number;
  hours: number;
  date: string;
}
export function sleepNights(records: HealthRecord[]): SleepNight[] {
  const nights: Omit<SleepNight, "date">[] = [];
  for (const record of records) {
    if (
      record.metric !== "sleep" ||
      !record.category?.startsWith("HKCategoryValueSleepAnalysisAsleep")
    )
      continue;
    const start = Date.parse(record.date);
    const end = start + record.value * HOUR_MS;
    const last = nights.at(-1);
    if (last && start - last.end <= HOUR_MS) {
      last.hours += Math.max(0, end - Math.max(start, last.end)) / HOUR_MS;
      last.end = Math.max(last.end, end);
    } else nights.push({ start, end, hours: record.value });
  }
  return nights.map((night) => ({ ...night, date: localDay(night.end) }));
}

// ---------- daily rows ----------
export interface GlucoseDay {
  date: string;
  readings: HealthRecord[];
  carbs: HealthRecord[];
  insulin: HealthRecord[];
  activity: ActivitySession[];
  count: number;
  min: number;
  max: number;
  average: number;
  standardDeviation: number;
  median: number;
  counts: Record<GlucoseClass, number>;
  beforeMealMedian?: number;
  afterMealMedian?: number;
  basal: number;
  bolus: number;
  unspecifiedInsulin: number;
}
export function glucoseDaily(records: HealthRecord[], range: GlucoseRange): GlucoseDay[] {
  type Bucket = Pick<GlucoseDay, "readings" | "carbs" | "insulin" | "activity">;
  const buckets = new Map<string, Bucket>();
  const bucket = (day: string) => {
    let found = buckets.get(day);
    if (!found) {
      found = { readings: [], carbs: [], insulin: [], activity: [] };
      buckets.set(day, found);
    }
    return found;
  };
  for (const record of records) {
    if (record.metric === "bloodGlucose") bucket(localDay(record.date)).readings.push(record);
    else if (record.metric === "carbs") bucket(localDay(record.date)).carbs.push(record);
    else if (record.metric === "insulinDelivery") bucket(localDay(record.date)).insulin.push(record);
  }
  for (const session of activitySessions(records)) bucket(localDay(session.start)).activity.push(session);
  const sum = (rows: HealthRecord[]) => rows.reduce((total, row) => total + row.value, 0);
  return [...buckets]
    .filter(([, b]) => b.readings.length)
    .map(([date, b]) => {
      const values = b.readings.map((r) => r.value);
      const average = values.reduce((a, v) => a + v, 0) / values.length;
      const counts: Record<GlucoseClass, number> = { below: 0, within: 0, above: 0 };
      values.forEach((v) => counts[classifyGlucose(v, range)]++);
      return {
        date,
        ...b,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        average,
        standardDeviation: populationSd(values, average),
        median: medianOf(values)!,
        counts,
        beforeMealMedian: medianOf(b.readings.filter((r) => r.category === "beforeMeal").map((r) => r.value)),
        afterMealMedian: medianOf(b.readings.filter((r) => r.category === "afterMeal").map((r) => r.value)),
        basal: sum(b.insulin.filter((r) => r.category === "basal")),
        bolus: sum(b.insulin.filter((r) => r.category === "bolus")),
        unspecifiedInsulin: sum(b.insulin.filter((r) => !r.category)),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- typical-day profile ----------
export interface HourProfile {
  hour: number;
  count: number;
  percentiles?: { p5: number; p25: number; p50: number; p75: number; p95: number };
}
export function glucoseHourlyProfile(records: HealthRecord[]): HourProfile[] {
  const hours: number[][] = Array.from({ length: 24 }, () => []);
  for (const reading of glucoseReadings(records)) hours[new Date(reading.date).getHours()].push(reading.value);
  return hours.map((values, hour) => {
    if (!values.length) return { hour, count: 0 };
    const s = values.slice().sort((a, b) => a - b);
    return {
      hour,
      count: values.length,
      percentiles: {
        p5: quantile(s, 0.05),
        p25: quantile(s, 0.25),
        p50: quantile(s, 0.5),
        p75: quantile(s, 0.75),
        p95: quantile(s, 0.95),
      },
    };
  });
}

// ---------- associations ----------
export interface GlucoseAssociations {
  carbs: { n: number; value?: number };
  activity: { n: number; value?: number };
  sleep: { shorter: number; longer: number; splitHours?: number; value?: number };
}
export function glucoseAssociations(records: HealthRecord[]): GlucoseAssociations {
  const readings = glucoseReadings(records).map((r) => ({ t: Date.parse(r.date), v: r.value }));
  const times = readings.map((r) => r.t);
  // First index whose time is >= t.
  const lowerIndex = (t: number) => {
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // Readings with from < t <= to.
  const between = (from: number, to: number) => readings.slice(lowerIndex(from + 1), lowerIndex(to + 1));
  const lastIn = (from: number, to: number) => between(from - 1, to).at(-1);

  const carbTimes = records.filter((r) => r.metric === "carbs").map((r) => Date.parse(r.date));
  const carbDeltas: number[] = [];
  for (const t of carbTimes) {
    const base = lastIn(t - 30 * MINUTE_MS, t);
    const after = between(t, t + 2 * HOUR_MS);
    if (base && after.length) carbDeltas.push(Math.max(...after.map((r) => r.v)) - base.v);
  }

  const activityDeltas: number[] = [];
  for (const session of activitySessions(records)) {
    const base = lastIn(session.start - 30 * MINUTE_MS, session.start);
    const target = session.start + 2 * HOUR_MS;
    const near = between(target - HOUR_MS - 1, target + HOUR_MS).sort(
      (a, b) => Math.abs(a.t - target) - Math.abs(b.t - target),
    )[0];
    if (base && near) activityDeltas.push(near.v - base.v);
  }

  const nights = sleepNights(records);
  const splitHours = nights.length >= 2 ? medianOf(nights.map((n) => n.hours)) : undefined;
  const shorter: number[] = [];
  const longer: number[] = [];
  if (splitHours !== undefined)
    for (const night of nights) {
      const firstCarb = carbTimes.find((t) => t > night.end);
      const limit = Math.min(night.end + 2 * HOUR_MS, firstCarb === undefined ? Infinity : firstCarb - 1);
      const morning = between(night.end - 1, limit)[0];
      if (morning) (night.hours < splitHours ? shorter : longer).push(morning.v);
    }

  const enough = (deltas: number[]) => deltas.length >= ASSOCIATION_MIN_PAIRS;
  const shorterMedian = medianOf(shorter);
  const longerMedian = medianOf(longer);
  return {
    carbs: { n: carbDeltas.length, value: enough(carbDeltas) ? medianOf(carbDeltas) : undefined },
    activity: { n: activityDeltas.length, value: enough(activityDeltas) ? medianOf(activityDeltas) : undefined },
    sleep: {
      shorter: shorter.length,
      longer: longer.length,
      splitHours,
      value:
        shorter.length >= 3 && longer.length >= 3 && shorterMedian !== undefined && longerMedian !== undefined
          ? shorterMedian - longerMedian
          : undefined,
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/glucose.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/glucose.ts tests/glucose.test.ts
git commit -m "Add glucose analysis module: target ranges, summary, daily rows, context events, associations"
```

---

### Task 3: Detailed glucose table

**Files:**
- Modify: `src/components/DailyDistribution.tsx` (optional `band` prop)
- Create: `src/components/GlucoseDayTrace.tsx`
- Create: `src/components/tables/GlucoseReportTable.tsx`
- Create: `src/glucose.css`
- Modify: `src/main.tsx` (import `./glucose.css` after the existing stylesheets)
- Create: `tests/glucoseReportTable.test.tsx`

**Interfaces:**
- Consumes (from Task 2): `GlucoseDay`, `GlucoseRange`, `glucoseDaily`, `glucoseSummary`, `glucoseColors`, `glucoseStatusColor`, `glucosePresetLabel`, `glucoseRangeText`, `formatMmol`, `HOUR_MS`, `MINUTE_MS`, `defaultGlucoseRange`.
- Produces:
  - `GlucoseReportTable({ records, from, to, metadata, range })`
  - `GlucoseDayTrace({ day, range, width })`
  - `DailyDistribution` accepts `band?: { low: number; high: number; color: string }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/glucoseReportTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlucoseReportTable } from "../src/components/tables/GlucoseReportTable";
import { PrintLayoutContext } from "../src/PrintLayoutContext";
import { rangeMetadata } from "../src/report";
import { defaultGlucoseRange, formatMmol as m, glucoseRangeText } from "../src/glucose";
import type { HealthRecord } from "../src/shared/types";

// Expected numbers are built with the app's formatter: Intl uses the machine locale.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 0, 1 + day, hour, minute).toISOString();
const glucose = (date: string, value: number, category?: string): HealthRecord => ({
  metric: "bloodGlucose",
  date,
  value,
  unit: "mmol/L",
  category,
});
function renderTable(records: HealthRecord[], printLayout = false) {
  return render(
    <PrintLayoutContext.Provider value={printLayout}>
      <GlucoseReportTable
        records={records}
        from=""
        to=""
        metadata={rangeMetadata(records)}
        range={defaultGlucoseRange}
      />
    </PrintLayoutContext.Provider>,
  );
}

describe("GlucoseReportTable", () => {
  it("renders nothing without glucose readings", () => {
    const { container } = renderTable([{ metric: "weight", date: at(0, 8), value: 70, unit: "kg" }]);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per day with the range split, insulin totals and trace", () => {
    const records: HealthRecord[] = [
      glucose(at(0, 8), 5.0),
      { metric: "insulinDelivery", date: at(0, 8, 5), value: 6, unit: "IU", category: "bolus" },
      glucose(at(0, 12), 12.0),
      { metric: "insulinDelivery", date: at(0, 22), value: 14, unit: "IU", category: "basal" },
      glucose(at(1, 9), 7.0),
    ];
    const { container } = renderTable(records);
    expect(screen.getByRole("heading", { name: "Blood glucose" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("0 / 50 / 50%")).toBeInTheDocument();
    expect(screen.getByText(`${m(14)} / ${m(6)}`)).toBeInTheDocument();
    expect(screen.getByText("Range columns are shares of recorded readings, not time in range.")).toBeInTheDocument();
    expect(
      screen.getByText(`Target range: Type 2 diabetes, ${glucoseRangeText(defaultGlucoseRange)}.`),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg.glucose-day-trace")).toHaveLength(2);
  });

  it("shows the meal column only when readings carry a meal-time tag, and never in print", () => {
    const untagged = [glucose(at(0, 8), 5.0)];
    renderTable(untagged);
    expect(screen.queryByText(/Before \/ after meal/)).not.toBeInTheDocument();
    const tagged = [glucose(at(0, 8), 5.0, "beforeMeal"), glucose(at(0, 10), 9.0, "afterMeal")];
    const { unmount } = renderTable(tagged);
    expect(screen.getByText(/Before \/ after meal/)).toBeInTheDocument();
    expect(screen.getByText(`${m(5)} / ${m(9)}`)).toBeInTheDocument();
    unmount();
    renderTable(tagged, true);
    expect(screen.queryByText(/Before \/ after meal/)).not.toBeInTheDocument();
  });

  it("adds a truncation note beyond the row limit", () => {
    const records = Array.from({ length: 366 }, (_, d) => glucose(at(d, 8), 6));
    renderTable(records);
    expect(screen.getByText("Showing the most recent 365 of 366 days with data.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/glucoseReportTable.test.tsx`
Expected: FAIL with "Failed to resolve import …/GlucoseReportTable".

- [ ] **Step 3: Add the `band` prop to `DailyDistribution`**

In `src/components/DailyDistribution.tsx`:
- Add `band?: { low: number; high: number; color: string };` to the props type.
- Add `band,` to the destructured props.
- Make the band the first child inside the `grid` fragment (before the minor ticks):

```tsx
      {band && (
        <rect
          x={Math.max(8, x(band.low))}
          y="3"
          width={Math.max(0, Math.min(152, x(band.high)) - Math.max(8, x(band.low)))}
          height="20"
          fill={band.color}
        />
      )}
```

Existing callers pass no `band`, so their output is unchanged.

- [ ] **Step 4: Create `src/components/GlucoseDayTrace.tsx`**

```tsx
import { memo } from "react";
import {
  type GlucoseDay,
  type GlucoseRange,
  HOUR_MS,
  MINUTE_MS,
  glucoseColors,
  glucoseStatusColor,
} from "../glucose";

const HEIGHT = 40;
const PLOT = 28;
const Y_MAX = 14;

// Clock-time trace (x = 00:00–24:00). The generic DayTrace spaces points by
// index, which misrepresents irregular fingerstick timing.
export const GlucoseDayTrace = memo(function GlucoseDayTrace({
  day,
  range,
  width,
}: {
  day: GlucoseDay;
  range: GlucoseRange;
  width: number;
}) {
  const dayStart = new Date(`${day.date}T00:00:00`).getTime();
  const x = (t: number) => ((t - dayStart) / (24 * HOUR_MS)) * width;
  const y = (v: number) => 1 + (1 - Math.min(v, Y_MAX) / Y_MAX) * (PLOT - 2);
  const points = day.readings.map((r) => ({ t: Date.parse(r.date), v: r.value }));
  const continuous = points.length > 40;
  let path = "";
  let previous = -Infinity;
  if (continuous)
    for (const p of points) {
      path += `${p.t - previous > 20 * MINUTE_MS ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      previous = p.t;
    }
  return (
    <svg
      className="glucose-day-trace"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      aria-label={`Readings across the day: ${day.counts.below} below and ${day.counts.above} above target; ${day.carbs.length} carbohydrate, ${day.insulin.length} insulin and ${day.activity.length} activity entries`}
    >
      <rect x="0" y={y(range.high)} width={width} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
      {[6, 12, 18].map((h) => (
        <line key={h} x1={x(dayStart + h * HOUR_MS)} x2={x(dayStart + h * HOUR_MS)} y1="0" y2={PLOT} stroke="#eef1f6" />
      ))}
      <line x1="0" x2={width} y1={PLOT} y2={PLOT} stroke="#d9dfeb" />
      {continuous ? (
        <path d={path} fill="none" stroke={glucoseColors.line} strokeWidth="1.5" />
      ) : (
        <>
          {points.length > 1 && (
            <polyline
              points={points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={glucoseColors.line}
              strokeOpacity=".45"
              strokeWidth="1"
            />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={x(p.t)} cy={y(p.v)} r="2.6" fill={glucoseStatusColor(p.v, range)} stroke="white" strokeWidth=".8" />
          ))}
        </>
      )}
      {day.carbs.map((c, i) => (
        <rect key={`c${i}`} x={x(Date.parse(c.date)) - 1} y={PLOT + 3} width="2" height="7" rx="1" fill={glucoseColors.carbs} />
      ))}
      {day.insulin.map((u, i) =>
        u.category === "basal" ? (
          <rect key={`i${i}`} x={x(Date.parse(u.date)) - 1.5} y={PLOT + 4} width="3" height="5" rx="1" fill="none" stroke={glucoseColors.insulin} strokeWidth=".8" />
        ) : (
          <rect key={`i${i}`} x={x(Date.parse(u.date)) - 1} y={PLOT + 3} width="2" height="7" rx="1" fill={glucoseColors.insulin} />
        ),
      )}
      {day.activity.map((a, i) => (
        <rect key={`a${i}`} x={x(a.start)} y={PLOT + 5} width={Math.max(3, x(a.end) - x(a.start))} height="4" rx="2" fill={glucoseColors.activity} />
      ))}
    </svg>
  );
});
```

- [ ] **Step 5: Create `src/components/tables/GlucoseReportTable.tsx`**

```tsx
import { memo, useContext } from "react";
import type { HealthData } from "../../shared/types";
import {
  MAX_PDF_TABLE_ROWS,
  MAX_TABLE_ROWS,
  boundsOf,
  format,
  formatDate,
  type RangeMetadata,
} from "../../report";
import {
  type GlucoseDay,
  type GlucoseRange,
  formatMmol,
  glucoseColors,
  glucoseDaily,
  glucosePresetLabel,
  glucoseRangeText,
  glucoseSummary,
} from "../../glucose";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { DailyDistribution } from "../DailyDistribution";
import { GlucoseDayTrace } from "../GlucoseDayTrace";
import { TableNotes, coverageNote, truncationNote } from "../TableNotes";

const statuses = ["below", "within", "above"] as const;
const percent = (n: number, total: number) => Math.round((n / total) * 100);
const mmolOrDash = (value?: number) => (value === undefined ? "—" : formatMmol(value));
function insulinCell(day: GlucoseDay) {
  if (!day.basal && !day.bolus && !day.unspecifiedInsulin) return "—";
  const main = `${day.basal ? format(day.basal, "", 1) : "—"} / ${day.bolus ? format(day.bolus, "", 1) : "—"}`;
  return day.unspecifiedInsulin ? `${main} · ${format(day.unspecifiedInsulin, "", 1)} other` : main;
}

export const GlucoseReportTable = memo(function GlucoseReportTable({
  records,
  from,
  to,
  metadata,
  range,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
  metadata: RangeMetadata;
  range: GlucoseRange;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const allDays = glucoseDaily(records, range);
  const days = allDays.slice(0, printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS);
  if (!days.length) return null;
  const summary = glucoseSummary(records, range, from, to)!;
  // Fixed-ish scale so the target band sits in the same place on every row.
  const bounds = boundsOf(days.flatMap((day) => day.readings.map((r) => r.value)));
  const columnMin = Math.min(2, bounds.min);
  const columnMax = Math.max(14, bounds.max);
  const showMeal = !printLayout && days.some((day) => day.readings.some((r) => r.category));
  const traceWidth = printLayout ? 190 : 240;
  return (
    <section className="report-section glucose-report-section">
      <h3>Blood glucose</h3>
      <TableNotes
        notes={[
          `Target range: ${glucosePresetLabel(range.preset)}, ${glucoseRangeText(range)}.`,
          summary.dense
            ? `Continuous data: ${Math.round(summary.coverage * 100)}% coverage across ${summary.daysWithReadings} days. Range columns are shares of readings per day.`
            : "Range columns are shares of recorded readings, not time in range.",
          truncationNote(days.length, allDays.length),
          coverageNote("bloodGlucose", metadata, from, to),
        ]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Readings</th>
            <th>Daily distribution (mmol/L)</th>
            <th>Below / within / above</th>
            {showMeal && (
              <th>
                Before / after meal<span className="glucose-th-sub">median mmol/L</span>
              </th>
            )}
            <th>
              Across the day
              <div className="glucose-trace-axis" style={{ width: traceWidth }}>
                <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
              </div>
            </th>
            <th>
              Insulin (IU)<span className="glucose-th-sub">basal / bolus</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{formatDate(day.date)}</td>
              <td>{day.count}</td>
              <td>
                <DailyDistribution
                  min={day.min}
                  max={day.max}
                  average={day.average}
                  standardDeviation={day.standardDeviation}
                  unit="mmol/L"
                  single={day.count === 1}
                  decimals={1}
                  columnMin={columnMin}
                  columnMax={columnMax}
                  color={glucoseColors.line}
                  band={{ low: range.low, high: range.high, color: glucoseColors.band }}
                />
              </td>
              <td className="glucose-split-cell">
                <div className="glucose-split-bar" aria-hidden="true">
                  {statuses
                    .filter((status) => day.counts[status])
                    .map((status) => (
                      <i key={status} style={{ flex: day.counts[status], background: glucoseColors[status] }} />
                    ))}
                </div>
                <small>
                  {`${percent(day.counts.below, day.count)} / ${percent(day.counts.within, day.count)} / ${percent(day.counts.above, day.count)}%`}
                </small>
              </td>
              {showMeal && (
                <td className="glucose-num">{`${mmolOrDash(day.beforeMealMedian)} / ${mmolOrDash(day.afterMealMedian)}`}</td>
              )}
              <td>
                <GlucoseDayTrace day={day} range={range} width={traceWidth} />
              </td>
              <td className="glucose-num">{insulinCell(day)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="glucose-legend glucose-table-legend">
        <span style={{ "--c": glucoseColors.below } as React.CSSProperties}>Below target</span>
        <span style={{ "--c": glucoseColors.line } as React.CSSProperties}>Within target</span>
        <span style={{ "--c": glucoseColors.above } as React.CSSProperties}>Above target</span>
        <span style={{ "--c": glucoseColors.carbs } as React.CSSProperties}>Carbohydrates</span>
        <span style={{ "--c": glucoseColors.insulin } as React.CSSProperties}>Insulin bolus</span>
        <span className="hollow" style={{ "--c": glucoseColors.insulin } as React.CSSProperties}>Insulin basal</span>
        <span style={{ "--c": glucoseColors.activity } as React.CSSProperties}>Activity</span>
      </div>
      <small className="table-notes">Markers appear only when those records exist in the Apple Health export.</small>
    </section>
  );
});
```

The file uses `React.CSSProperties` as a type, so add `import type React from "react";` next to the existing `react` import.

- [ ] **Step 6: Create `src/glucose.css` and import it**

Create `src/glucose.css`. Task 4 appends the section styles to this file.

```css
/* Blood glucose: detailed table */
.glucose-th-sub { display: block; font-weight: 400; font-size: 10px; color: #8a94a6; margin-top: 2px; }
.glucose-split-cell { min-width: 108px; }
.glucose-split-bar { display: flex; gap: 2px; height: 8px; width: 104px; }
.glucose-split-bar i { display: block; border-radius: 3px; min-width: 3px; }
.glucose-split-cell small { display: block; margin-top: 4px; font-size: 11px; color: #536176; font-variant-numeric: tabular-nums; }
.glucose-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.glucose-trace-axis { display: flex; justify-content: space-between; font-size: 9px; font-weight: 400; color: #8a94a6; margin-top: 3px; }
.glucose-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 11px; color: #667085; margin-top: 9px; }
.glucose-legend span::before {
  content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 2px;
  background: var(--c); margin-right: 5px; vertical-align: -1px;
}
.glucose-legend span.hollow::before { background: none; border: 1px solid var(--c); }
@media (max-width: 800px) { .glucose-report-section { overflow-x: auto; } }
```

In `src/main.tsx`, add `import "./glucose.css";` on the line after `import "./table-overrides.css";`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/glucoseReportTable.test.tsx tests/detailedReportLazy.test.tsx tests/componentMemoization.test.tsx`
Expected: PASS. The last two confirm the `DailyDistribution` change left existing tables intact.

- [ ] **Step 8: Commit (only if authorized)**

```bash
git add src/components/DailyDistribution.tsx src/components/GlucoseDayTrace.tsx src/components/tables/GlucoseReportTable.tsx src/glucose.css src/main.tsx tests/glucoseReportTable.test.tsx
git commit -m "Add detailed blood glucose table with target band, range split and clock-time trace"
```

---

### Task 4: Summary UI (charts, Blood glucose section, overview tile)

**Files:**
- Create: `src/components/glucose/GlucoseDailyChart.tsx`
- Create: `src/components/glucose/GlucoseTimeline.tsx`
- Create: `src/components/glucose/GlucoseDailyPattern.tsx`
- Create: `src/components/glucose/GlucoseRangeControl.tsx`
- Create: `src/components/glucose/GlucoseSummaryCard.tsx`
- Create: `src/components/glucose/GlucoseAssociationPanel.tsx`
- Create: `src/components/glucose/GlucoseOverview.tsx`
- Modify: `src/components/OverviewCards.tsx` (optional glucose tile)
- Modify: `src/glucose.css` (append section styles)
- Create: `tests/glucoseOverview.test.tsx`

**Interfaces:**
- Consumes: everything from Task 2, and `PrintLayoutContext`.
- Produces:
  - `GlucoseOverview({ records, from, to, range, onRangeChange, hasGlucose })`
  - `OverviewCards` gains the optional prop `glucose?: { range: GlucoseRange; from: string; to: string }`. The tile renders only when the prop is set. It never calls `report.latest`, which keeps `tests/overviewCardsLazy.test.tsx`'s call counts valid.

- [ ] **Step 1: Write the failing tests**

Create `tests/glucoseOverview.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlucoseOverview } from "../src/components/glucose/GlucoseOverview";
import { GlucoseDailyChart } from "../src/components/glucose/GlucoseDailyChart";
import { GlucoseTimeline } from "../src/components/glucose/GlucoseTimeline";
import { OverviewCards } from "../src/components/OverviewCards";
import { PrintLayoutContext } from "../src/PrintLayoutContext";
import {
  defaultGlucoseRange,
  formatMmol as m,
  glucoseDaily,
  glucoseRangeText,
  localDay,
  presetRange,
  type GlucoseRange,
} from "../src/glucose";
import type { HealthRecord } from "../src/shared/types";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 0, 1 + day, hour, minute).toISOString();
const glucose = (date: string, value: number, category?: string): HealthRecord => ({
  metric: "bloodGlucose",
  date,
  value,
  unit: "mmol/L",
  category,
});
const spot = [glucose(at(0, 8), 5), glucose(at(0, 12), 8), glucose(at(0, 18), 12)];
function dense(days = 14) {
  const out: HealthRecord[] = [];
  for (let d = 0; d < days; d++) for (let k = 0; k < 96; k++) out.push(glucose(at(d, 0, k * 15), 6.5));
  return out;
}
function renderOverview(
  records: HealthRecord[],
  { range = defaultGlucoseRange, hasGlucose = true, printLayout = false, onRangeChange = vi.fn() } = {},
) {
  const from = records.length ? localDay(records[0].date) : "";
  const to = records.length ? localDay(records.at(-1)!.date) : "";
  return render(
    <PrintLayoutContext.Provider value={printLayout}>
      <GlucoseOverview
        records={records}
        from={from}
        to={to}
        range={range}
        onRangeChange={onRangeChange}
        hasGlucose={hasGlucose}
      />
    </PrintLayoutContext.Provider>,
  );
}
const share = (container: HTMLElement, status: string) =>
  container.querySelector(`[data-status="${status}"] b`)?.textContent;

describe("GlucoseOverview", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing when the import has no glucose", () => {
    const { container } = renderOverview([], { hasGlucose: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an empty state when the period has no readings", () => {
    renderOverview([]);
    expect(screen.getByRole("heading", { name: "Blood glucose" })).toBeInTheDocument();
    expect(screen.getByText("No blood glucose readings were found for this period.")).toBeInTheDocument();
  });

  it("uses spot-reading wording without continuous metrics", () => {
    const { container } = renderOverview(spot);
    expect(screen.getByText("Share of recorded readings, not time in range.")).toBeInTheDocument();
    expect(screen.getByText(/^Spot readings/)).toBeInTheDocument();
    expect(screen.getByText("Readings in range")).toBeInTheDocument();
    expect(screen.queryByText("Typical day")).not.toBeInTheDocument();
    expect(screen.queryByText(/GMI/)).not.toBeInTheDocument();
    expect(share(container, "within")).toBe("67%");
    expect(screen.getByText(/Descriptive comparison only/)).toBeInTheDocument();
  });

  it("adds continuous metrics and the typical day for dense data", () => {
    renderOverview(dense());
    expect(screen.getByText("Share of time, weighted by continuous readings.")).toBeInTheDocument();
    expect(screen.getByText("Continuous data · 100% coverage")).toBeInTheDocument();
    expect(screen.getByText("Time in range")).toBeInTheDocument();
    expect(screen.getByText(/GMI/)).toBeInTheDocument();
    expect(screen.getByText("Typical day")).toBeInTheDocument();
  });

  it("shows meal context only for tagged readings", () => {
    renderOverview(spot);
    expect(screen.queryByText("Meal context")).not.toBeInTheDocument();
    renderOverview([glucose(at(0, 7), 5.5, "beforeMeal"), glucose(at(0, 9), 9.1, "afterMeal")]);
    expect(screen.getByText("Meal context")).toBeInTheDocument();
    expect(screen.getByText("Before meal")).toBeInTheDocument();
  });

  it("changes presets and recomputes the split for a new range", () => {
    const onRangeChange = vi.fn();
    const { container, rerender } = renderOverview(spot, { onRangeChange });
    fireEvent.change(screen.getByLabelText("Target range"), { target: { value: "pregnancy" } });
    expect(onRangeChange).toHaveBeenCalledWith({ preset: "pregnancy", low: 3.5, high: 7.8 });
    rerender(
      <PrintLayoutContext.Provider value={false}>
        <GlucoseOverview records={spot} from="" to="" range={presetRange("pregnancy")} onRangeChange={onRangeChange} hasGlucose />
      </PrintLayoutContext.Provider>,
    );
    expect(share(container, "within")).toBe("33%");
  });

  it("commits valid custom bounds on blur and ignores invalid ones", () => {
    const onRangeChange = vi.fn();
    const custom: GlucoseRange = presetRange("custom");
    renderOverview(spot, { range: custom, onRangeChange });
    const low = screen.getByLabelText("Lower target (mmol/L)");
    fireEvent.change(low, { target: { value: "4.5" } });
    fireEvent.blur(low);
    expect(onRangeChange).toHaveBeenLastCalledWith({ preset: "custom", low: 4.5, high: 10 });
    onRangeChange.mockClear();
    fireEvent.change(low, { target: { value: "12" } });
    fireEvent.blur(low);
    expect(onRangeChange).not.toHaveBeenCalled();
  });

  it("prints the target range as plain text", () => {
    renderOverview(spot, { printLayout: true });
    expect(screen.queryByLabelText("Target range")).not.toBeInTheDocument();
    expect(
      screen.getByText(`Target range: Type 2 diabetes, ${glucoseRangeText(defaultGlucoseRange)}`),
    ).toBeInTheDocument();
  });
});

describe("glucose charts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws one median per day and breaks the line across missing days", () => {
    const records = [glucose(at(0, 8), 6), glucose(at(2, 8), 7), glucose(at(3, 8), 8)];
    const { container } = render(
      <GlucoseDailyChart days={glucoseDaily(records, defaultGlucoseRange)} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(3, 0))} />,
    );
    expect(container.querySelectorAll("circle.glucose-median")).toHaveLength(3);
    expect(container.querySelector("path.glucose-median-line")!.getAttribute("d")!.match(/M/g)).toHaveLength(2);
  });

  it("shows a tooltip for the hovered day", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 760, height: 220, right: 760, bottom: 220, x: 0, y: 0, toJSON() {},
    } as DOMRect);
    const records = [glucose(at(0, 8), 6), glucose(at(1, 8), 7), glucose(at(2, 8), 8)];
    const { container } = render(
      <GlucoseDailyChart days={glucoseDaily(records, defaultGlucoseRange)} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(2, 0))} />,
    );
    fireEvent.mouseMove(container.querySelector(".glucose-chart-hit")!, { clientX: 392 });
    expect(screen.getByRole("status")).toHaveTextContent(`Median ${m(7)} mmol/L`);
  });

  it("plots spot readings as points and continuous data as a line with lanes", () => {
    const { container, unmount } = render(
      <GlucoseTimeline records={spot} range={defaultGlucoseRange} from="" to="" continuous={false} />,
    );
    expect(container.querySelectorAll("circle.glucose-timeline-point")).toHaveLength(3);
    ["Carbohydrates", "Insulin", "Activity", "Sleep"].forEach((lane) => expect(screen.getByText(lane)).toBeInTheDocument());
    unmount();
    const { container: dense14 } = render(
      <GlucoseTimeline records={dense()} range={defaultGlucoseRange} from="" to="" continuous />,
    );
    expect(dense14.querySelector("path.glucose-timeline-line")).not.toBeNull();
    expect(dense14.querySelectorAll("circle.glucose-timeline-point")).toHaveLength(0);
  });

  it("aggregates to one point per day for periods over 45 days", () => {
    const records = Array.from({ length: 60 }, (_, d) => glucose(at(d, 8), 12));
    const { container } = render(
      <GlucoseTimeline records={records} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(59, 0))} continuous={false} />,
    );
    expect(screen.getByText(/one point per day/)).toBeInTheDocument();
    expect(container.querySelectorAll("circle.glucose-timeline-point")).toHaveLength(60);
  });
});

describe("OverviewCards glucose tile", () => {
  it("is absent without the glucose prop", () => {
    render(<OverviewCards records={spot} periodLabel="Last 30 days" />);
    expect(screen.queryByText("Blood glucose")).not.toBeInTheDocument();
  });
  it("shows the median and the share of readings in range", () => {
    render(
      <OverviewCards records={spot} periodLabel="Last 30 days" glucose={{ range: defaultGlucoseRange, from: "", to: "" }} />,
    );
    expect(screen.getByText("Blood glucose")).toBeInTheDocument();
    expect(screen.getByText(`${m(8)} mmol/L`)).toBeInTheDocument();
    expect(screen.getByText(`Median · 67% of readings in ${m(3.9)}–${m(10)}`)).toBeInTheDocument();
  });
});
```

The tooltip test's `clientX: 392` is the centre of day index 1 in a 3-day window: `34 + 1.5 / 3 × 716`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/glucoseOverview.test.tsx`
Expected: FAIL with "Failed to resolve import …/GlucoseOverview".

- [ ] **Step 3: Create `src/components/glucose/GlucoseDailyChart.tsx`**

```tsx
import { memo, useState, type MouseEvent } from "react";
import { formatDate } from "../../report";
import { type GlucoseDay, type GlucoseRange, HOUR_MS, formatMmol, glucoseColors, localDay, shortDate } from "../../glucose";

const W = 760, H = 220, L = 34, R = 10, T = 10, B = 24;

// Daily min–max bars with a median dot, in the RangeMetricChart visual language.
export const GlucoseDailyChart = memo(function GlucoseDailyChart({
  days,
  range,
  from,
  to,
}: {
  days: GlucoseDay[];
  range: GlucoseRange;
  from: string;
  to: string;
}) {
  const [hover, setHover] = useState<number>();
  if (!days.length) return null;
  const ascending = days.slice().reverse();
  const first = from || ascending[0].date;
  const last = to || ascending.at(-1)!.date;
  const origin = new Date(`${first}T12:00:00`).getTime();
  const indexOf = (date: string) => Math.round((new Date(`${date}T12:00:00`).getTime() - origin) / (24 * HOUR_MS));
  const dateAt = (index: number) => localDay(origin + index * 24 * HOUR_MS);
  const count = indexOf(last) + 1;
  const byIndex = new Map(ascending.map((day) => [indexOf(day.date), day]));
  const yMax = Math.max(14, Math.ceil((Math.max(...days.map((d) => d.max)) + 1) / 2) * 2);
  const x = (i: number) => L + ((i + 0.5) / count) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const labelEvery = Math.max(1, Math.ceil(count / 8));
  let path = "";
  let previous = -2;
  for (const day of ascending) {
    const i = indexOf(day.date);
    path += `${i === previous + 1 ? "L" : "M"}${x(i).toFixed(1)},${y(day.median).toFixed(1)}`;
    previous = i;
  }
  const onMove = (event: MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    if (!box.width) return;
    const sx = ((event.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(count - 1, Math.floor(((sx - L) / (W - L - R)) * count))));
  };
  const hovered = hover === undefined ? undefined : byIndex.get(hover);
  return (
    <div className="glucose-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily glucose range and median over the selected period">
        {Array.from({ length: yMax / 2 + 1 }, (_, k) => k * 2).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f6" />
            <text x={L - 7} y={y(v) + 3.5} fontSize="10" fill="#8a94a6" textAnchor="end">{v}</text>
          </g>
        ))}
        <rect x={L} y={y(range.high)} width={W - L - R} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
        {Array.from({ length: Math.ceil(count / labelEvery) }, (_, k) => k * labelEvery).map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="#8a94a6" textAnchor="middle">{shortDate(dateAt(i))}</text>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#cfd6e3" />
        {ascending.map((day) => (
          <line key={`r${day.date}`} x1={x(indexOf(day.date))} x2={x(indexOf(day.date))} y1={y(day.max)} y2={y(day.min)} stroke={glucoseColors.line} strokeOpacity=".28" strokeWidth="5" strokeLinecap="round" />
        ))}
        <path className="glucose-median-line" d={path} fill="none" stroke={glucoseColors.line} strokeWidth="2" />
        {ascending.map((day) => (
          <circle key={`m${day.date}`} className="glucose-median" cx={x(indexOf(day.date))} cy={y(day.median)} r="4" fill={glucoseColors.line} stroke="white" strokeWidth="2" />
        ))}
        {hover !== undefined && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#23314a" strokeDasharray="3 3" opacity=".5" />}
        <rect className="glucose-chart-hit" x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(undefined)} />
      </svg>
      {hover !== undefined && (
        <div className="glucose-tooltip" role="status" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{formatDate(dateAt(hover))}</b>
          {hovered ? (
            <>
              <span>Median {formatMmol(hovered.median)} mmol/L</span>
              <small>Range {formatMmol(hovered.min)}–{formatMmol(hovered.max)} · {hovered.count} readings</small>
            </>
          ) : (
            <small>No glucose readings</small>
          )}
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 4: Create `src/components/glucose/GlucoseTimeline.tsx`**

```tsx
import { memo, useMemo, useState, type MouseEvent } from "react";
import type { HealthRecord } from "../../shared/types";
import { format } from "../../report";
import {
  type GlucoseRange,
  HOUR_MS,
  MINUTE_MS,
  activitySessions,
  classifyGlucose,
  formatMmol,
  glucoseColors,
  glucoseDaily,
  glucoseReadings,
  glucoseStatusColor,
  localDay,
  medianOf,
  shortDate,
  sleepNights,
  timeOfDay,
} from "../../glucose";

const W = 760, L = 92, R = 8, T = 6, PLOT_H = 170, LANE_H = 30, Y_MAX = 14;
const DAY_MS = 24 * HOUR_MS;
const LANES = ["Carbohydrates", "Insulin", "Activity", "Sleep"];
const LANE_COLORS = [glucoseColors.carbs, glucoseColors.insulin, glucoseColors.activity, glucoseColors.sleep];
const LANES_TOP = T + PLOT_H + 22;
const H = LANES_TOP + LANES.length * LANE_H + 4;
const AGGREGATE_AFTER_DAYS = 45;

interface Point { t: number; v: number }
interface Mark { t: number; t2?: number; value: number; size: number; hollow?: boolean; text?: string }
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
function perDay(items: { t: number; value: number }[]) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(localDay(item.t), (totals.get(localDay(item.t)) ?? 0) + item.value);
  return [...totals].map(([day, value]) => ({ t: noon(day), value }));
}
// Label the largest marks, skipping any within 60 units of an already-labelled one.
function labelLargest(marks: Mark[], x: (t: number) => number, count: number, text: (v: number) => string) {
  const kept: Mark[] = [];
  for (const mark of marks.slice().sort((a, b) => b.value - a.value)) {
    if (kept.length === count) break;
    if (kept.every((k) => Math.abs(x(k.t) - x(mark.t)) > 60)) kept.push(mark);
  }
  kept.forEach((mark) => { mark.text = text(mark.value); });
  return marks;
}
function scaled(items: { t: number; value: number }[], cap?: number): Mark[] {
  const max = cap ?? Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => ({ t: i.t, value: i.value, size: Math.min(1, i.value / max) }));
}

function buildTimeline(records: HealthRecord[], range: GlucoseRange, from: string, to: string, continuous: boolean) {
  const readings = glucoseReadings(records);
  if (!readings.length) return undefined;
  const start = new Date(`${from || localDay(readings[0].date)}T00:00:00`).getTime();
  const end = new Date(`${to || localDay(readings.at(-1)!.date)}T00:00:00`).getTime() + DAY_MS;
  const aggregated = (end - start) / DAY_MS > AGGREGATE_AFTER_DAYS;
  const x = (t: number) => L + ((t - start) / (end - start)) * (W - L - R);
  const carbs = records.filter((r) => r.metric === "carbs").map((r) => ({ t: Date.parse(r.date), value: r.value }));
  const insulin = records
    .filter((r) => r.metric === "insulinDelivery")
    .map((r) => ({ t: Date.parse(r.date), value: r.value, basal: r.category === "basal" }));
  const sessions = activitySessions(records);
  const nights = sleepNights(records);
  let points: Point[];
  if (aggregated)
    points = glucoseDaily(records, range).reverse().map((day) => ({ t: noon(day.date), v: day.median }));
  else if (continuous) {
    const hours = new Map<number, number[]>();
    for (const reading of readings) {
      const key = Math.floor(Date.parse(reading.date) / HOUR_MS);
      const bucket = hours.get(key);
      if (bucket) bucket.push(reading.value);
      else hours.set(key, [reading.value]);
    }
    points = [...hours].map(([key, values]) => ({ t: key * HOUR_MS + HOUR_MS / 2, v: medianOf(values)! }));
  } else points = readings.map((r) => ({ t: Date.parse(r.date), v: r.value }));

  let lanes: Mark[][];
  if (aggregated)
    lanes = [
      labelLargest(scaled(perDay(carbs)), x, 1, (v) => `${Math.round(v)} g`),
      labelLargest(scaled(perDay(insulin)), x, 1, (v) => `${format(v, "", 1)} IU`),
      labelLargest(scaled(perDay(sessions.map((s) => ({ t: s.start, value: s.minutes })))), x, 1, (v) => `${Math.round(v)} min`),
      labelLargest(scaled(nights.map((n) => ({ t: noon(n.date), value: n.hours }))), x, 1, (v) => `${format(v, "", 1)} h`),
    ];
  else {
    const sleepMarks: Mark[] = nights.map((n) => ({ t: n.start, t2: n.end, value: n.hours, size: 1 }));
    const bySleep = sleepMarks.slice().sort((a, b) => a.value - b.value);
    [bySleep[0], bySleep.at(-1)]
      .filter((mark, i, all): mark is Mark => !!mark && (i === 0 || Math.abs(x(mark.t) - x(all[0]!.t)) > 60))
      .forEach((mark) => { mark.text = `${format(mark.value, "", 1)} h`; });
    lanes = [
      labelLargest(scaled(carbs, 95), x, 3, (v) => `${Math.round(v)} g`),
      insulin.map((u) => ({ t: u.t, value: u.value, size: u.basal ? 0.5 : 1, hollow: u.basal })),
      labelLargest(sessions.map((s) => ({ t: s.start, t2: s.end, value: s.minutes, size: 1 })), x, 1, (v) => `${Math.round(v)} min`),
      sleepMarks,
    ];
  }
  const window = aggregated ? DAY_MS / 2 : 90 * MINUTE_MS;
  const eventsNear = (t: number) => ({
    carbs: carbs.filter((c) => Math.abs(c.t - t) < window),
    insulin: insulin.filter((u) => Math.abs(u.t - t) < window),
    sessions: sessions.filter((s) => Math.abs(s.start - t) < window),
  });
  return { start, end, aggregated, x, points, lanes, eventsNear };
}

function LaneMark({ mark, x, top, color }: { mark: Mark; x: (t: number) => number; top: number; color: string }) {
  const label = mark.text && (
    <text x={mark.t2 === undefined ? x(mark.t) : (x(mark.t) + x(mark.t2)) / 2} y={top + 8} fontSize="9" fontWeight="700" fill="#23314a" textAnchor="middle">
      {mark.text}
    </text>
  );
  if (mark.t2 !== undefined)
    return (
      <>
        {label}
        <rect x={x(mark.t)} y={top + 14} width={Math.max(3, x(mark.t2) - x(mark.t))} height="8" rx="3" fill={color} />
      </>
    );
  const height = 4 + mark.size * 13;
  return (
    <>
      {label}
      <rect
        x={x(mark.t) - 1.25}
        y={top + LANE_H - 4 - height}
        width="2.5"
        height={height}
        rx="1.25"
        fill={mark.hollow ? "none" : color}
        stroke={mark.hollow ? color : undefined}
      />
    </>
  );
}

export const GlucoseTimeline = memo(function GlucoseTimeline({
  records,
  range,
  from,
  to,
  continuous,
}: {
  records: HealthRecord[];
  range: GlucoseRange;
  from: string;
  to: string;
  continuous: boolean;
}) {
  const model = useMemo(() => buildTimeline(records, range, from, to, continuous), [records, range, from, to, continuous]);
  const [hover, setHover] = useState<Point>();
  if (!model) return null;
  const { x, points, lanes, aggregated } = model;
  const y = (v: number) => T + (1 - Math.min(v, Y_MAX) / Y_MAX) * PLOT_H;
  const laneTop = (k: number) => LANES_TOP + k * LANE_H;
  const days = Math.round((model.end - model.start) / DAY_MS);
  const labelEvery = Math.max(1, Math.ceil(days / 8));
  const asLine = aggregated || continuous;
  const gap = aggregated ? 1.5 * DAY_MS : 2 * HOUR_MS;
  let path = "";
  let previous = -Infinity;
  if (asLine)
    for (const p of points) {
      path += `${p.t - previous > gap ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      previous = p.t;
    }
  // Lines show out-of-range points only; spot readings show every point.
  const dots = asLine && !aggregated ? points.filter((p) => classifyGlucose(p.v, range) !== "within") : points;
  const onMove = (event: MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    if (!box.width) return;
    const t = model.start + ((((event.clientX - box.left) / box.width) * W - L) / (W - L - R)) * (model.end - model.start);
    setHover(points.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best)));
  };
  const near = hover && model.eventsNear(hover.t);
  return (
    <div className="glucose-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Glucose readings with carbohydrate, insulin, activity and sleep lanes">
        {[0, 2, 4, 6, 8, 10, 12, 14].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f6" />
            <text x={L - 7} y={y(v) + 3.5} fontSize="10" fill="#8a94a6" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x="0" y={T + PLOT_H / 2} fontSize="11" fill="#536176">mmol/L</text>
        <rect x={L} y={y(range.high)} width={W - L - R} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
        {asLine && <path className="glucose-timeline-line" d={path} fill="none" stroke={glucoseColors.line} strokeWidth="1.2" strokeOpacity=".85" />}
        {dots.map((p, i) => (
          <circle
            key={i}
            className="glucose-timeline-point"
            cx={x(p.t)}
            cy={y(p.v)}
            r={asLine ? 2.2 : 3.4}
            fill={glucoseStatusColor(p.v, range)}
            stroke={asLine ? undefined : "white"}
          />
        ))}
        {Array.from({ length: Math.floor(days / labelEvery) + 1 }, (_, k) => k * labelEvery).map((i) => (
          <text key={i} x={x(model.start + i * DAY_MS)} y={T + PLOT_H + 15} fontSize="10" fill="#8a94a6" textAnchor="middle">
            {shortDate(localDay(model.start + i * DAY_MS + DAY_MS / 2))}
          </text>
        ))}
        {LANES.map((name, k) => (
          <g key={name}>
            <line x1={L} x2={W - R} y1={laneTop(k)} y2={laneTop(k)} stroke="#e5e9f0" />
            <text x="0" y={laneTop(k) + LANE_H / 2 + 4} fontSize="11" fill="#23314a">{name}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={laneTop(LANES.length)} y2={laneTop(LANES.length)} stroke="#e5e9f0" />
        {lanes.map((marks, k) => marks.map((mark, i) => <LaneMark key={`${k}-${i}`} mark={mark} x={x} top={laneTop(k)} color={LANE_COLORS[k]} />))}
        {hover && <line x1={x(hover.t)} x2={x(hover.t)} y1={T} y2={laneTop(LANES.length)} stroke="#23314a" strokeDasharray="3 3" opacity=".5" />}
        <rect className="glucose-chart-hit" x={L} y={T} width={W - L - R} height={laneTop(LANES.length) - T} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(undefined)} />
      </svg>
      {aggregated && <small className="glucose-timeline-note">Periods longer than 45 days show one point per day and daily totals.</small>}
      {hover && near && (
        <div className="glucose-tooltip" role="status" style={{ left: `${(x(hover.t) / W) * 100}%` }}>
          <b>
            {shortDate(localDay(hover.t))}
            {aggregated ? "" : ` ${timeOfDay(hover.t)}`}
          </b>
          <span>
            {formatMmol(hover.v)} mmol/L{aggregated ? " (daily median)" : continuous ? " (hourly median)" : ""}
          </span>
          {near.carbs.length > 0 && <small>Carbohydrates {near.carbs.map((c) => `${Math.round(c.value)} g`).join(", ")}</small>}
          {near.insulin.length > 0 && (
            <small>Insulin {near.insulin.map((u) => `${format(u.value, "", 1)} IU${u.basal ? " basal" : ""}`).join(", ")}</small>
          )}
          {near.sessions.length > 0 && <small>Activity {near.sessions.map((s) => `${Math.round(s.minutes)} min`).join(", ")}</small>}
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 5: Create `src/components/glucose/GlucoseDailyPattern.tsx`**

```tsx
import { memo } from "react";
import { type GlucoseRange, type HourProfile, formatMmol, glucoseColors } from "../../glucose";

const W = 760, H = 220, L = 34, R = 10, T = 10, B = 24, Y_MAX = 16;
type Band = "p5" | "p25" | "p50" | "p75" | "p95";

// Hour-of-day percentile profile (AGP-style). Only rendered for continuous data.
export const GlucoseDailyPattern = memo(function GlucoseDailyPattern({
  profile,
  range,
}: {
  profile: HourProfile[];
  range: GlucoseRange;
}) {
  const filled = profile.filter((p) => p.percentiles);
  if (!filled.length) return null;
  const x = (hour: number) => L + (hour / 23) * (W - L - R);
  const y = (v: number) => T + (1 - Math.min(v, Y_MAX) / Y_MAX) * (H - T - B);
  // Break the shapes at hours without readings.
  const runs: HourProfile[][] = [[]];
  for (const p of profile) {
    if (p.percentiles) runs.at(-1)!.push(p);
    else if (runs.at(-1)!.length) runs.push([]);
  }
  const at = (p: HourProfile, band: Band) => `${x(p.hour)},${y(p.percentiles![band])}`;
  const area = (run: HourProfile[], lo: Band, hi: Band) =>
    `M${run.map((p) => at(p, hi)).join("L")}L${run.slice().reverse().map((p) => at(p, lo)).join("L")}Z`;
  const peak = filled.reduce((a, b) => (b.percentiles!.p50 > a.percentiles!.p50 ? b : a));
  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <div className="glucose-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Glucose percentiles by hour of day">
        {[0, 4, 8, 12, 16].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f6" />
            <text x={L - 7} y={y(v) + 3.5} fontSize="10" fill="#8a94a6" textAnchor="end">{v}</text>
          </g>
        ))}
        <rect x={L} y={y(range.high)} width={W - L - R} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
        {runs.filter((run) => run.length > 1).map((run, i) => (
          <g key={i}>
            <path d={area(run, "p5", "p95")} fill={glucoseColors.line} fillOpacity=".1" />
            <path d={area(run, "p25", "p75")} fill={glucoseColors.line} fillOpacity=".24" />
            <path className="glucose-pattern-median" d={`M${run.map((p) => at(p, "p50")).join("L")}`} fill="none" stroke={glucoseColors.line} strokeWidth="2" />
          </g>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <text key={h} x={x(h)} y={H - 6} fontSize="10" fill="#8a94a6" textAnchor="middle">{hourLabel(h)}</text>
        ))}
        <text x={x(peak.hour)} y={y(peak.percentiles!.p95) - 6} fontSize="9" fontWeight="700" fill="#23314a" textAnchor="middle">
          Median peak {formatMmol(peak.percentiles!.p50)} at {hourLabel(peak.hour)}
        </text>
      </svg>
    </div>
  );
});
```

- [ ] **Step 6: Create the range control, summary card, and association panel**

`src/components/glucose/GlucoseRangeControl.tsx`:

```tsx
import { useContext } from "react";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import {
  type GlucosePresetId,
  type GlucoseRange,
  formatMmol,
  glucosePresetLabel,
  glucosePresets,
  glucoseRangeText,
  presetRange,
  withCustomBound,
} from "../../glucose";

export function GlucoseRangeControl({ range, onChange }: { range: GlucoseRange; onChange: (range: GlucoseRange) => void }) {
  const printLayout = useContext(PrintLayoutContext);
  if (printLayout)
    return <p className="glucose-range-print">{`Target range: ${glucosePresetLabel(range.preset)}, ${glucoseRangeText(range)}`}</p>;
  // Uncontrolled inputs commit on blur/Enter; `key` resets a rejected draft to the current value.
  const commit = (bound: "low" | "high", text: string) => {
    const next = withCustomBound(range, bound, Number(text));
    if (next !== range) onChange(next);
  };
  const boundInput = (bound: "low" | "high", label: string) => (
    <input
      key={`${bound}-${range[bound]}`}
      type="number"
      step="0.1"
      min="2"
      max="20"
      aria-label={label}
      defaultValue={range[bound]}
      onBlur={(event) => commit(bound, event.currentTarget.value)}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  );
  return (
    <div className="glucose-range-control">
      <label htmlFor="glucose-range-preset">Target range</label>
      <select
        id="glucose-range-preset"
        value={range.preset}
        onChange={(event) => onChange(presetRange(event.currentTarget.value as GlucosePresetId))}
      >
        {glucosePresets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.id === "custom" ? preset.label : `${preset.label} · ${formatMmol(preset.low)}–${formatMmol(preset.high)}`}
          </option>
        ))}
      </select>
      {range.preset === "custom" && (
        <>
          {boundInput("low", "Lower target (mmol/L)")}
          <span>–</span>
          {boundInput("high", "Upper target (mmol/L)")}
          <span>mmol/L</span>
        </>
      )}
    </div>
  );
}
```

`src/components/glucose/GlucoseSummaryCard.tsx`:

```tsx
import type React from "react";
import { format, formatDate } from "../../report";
import {
  type GlucoseClass,
  type GlucoseDay,
  type GlucoseRange,
  type GlucoseSummary,
  formatMmol,
  glucoseColors,
  glucoseRangeText,
  localDay,
  timeOfDay,
} from "../../glucose";
import { GlucoseDailyChart } from "./GlucoseDailyChart";

const pct = (share: number) => `${Math.round(share * 100)}%`;
const statusLabels: [GlucoseClass, string][] = [["below", "Below"], ["within", "Within"], ["above", "Above"]];

function GlucoseRangeSplit({ split }: { split: Record<GlucoseClass, number> }) {
  return (
    <div className="glucose-range-split">
      <div className="glucose-range-split-bar" aria-hidden="true">
        {statusLabels
          .filter(([status]) => split[status] > 0)
          .map(([status]) => <i key={status} style={{ flex: split[status], background: glucoseColors[status] }} />)}
      </div>
      <div className="glucose-range-split-legend">
        {statusLabels.map(([status, label]) => (
          <span key={status} data-status={status} style={{ "--c": glucoseColors[status] } as React.CSSProperties}>
            {label} <b>{pct(split[status])}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function GlucoseSummaryCard({
  summary,
  days,
  range,
  from,
  to,
}: {
  summary: GlucoseSummary;
  days: GlucoseDay[];
  range: GlucoseRange;
  from: string;
  to: string;
}) {
  return (
    <article className="card glucose-summary-card">
      <div className="glucose-headline">
        <span>Latest reading</span>
        <strong>
          {formatMmol(summary.latest.value)}
          <em>mmol/L</em>
        </strong>
        <small>{`${formatDate(localDay(summary.latest.date))} at ${timeOfDay(summary.latest.date)}`}</small>
        <dl className="glucose-stats">
          <div><dt>Median</dt><dd>{formatMmol(summary.median)} mmol/L</dd></div>
          {summary.gmi ? (
            <>
              <div><dt>Time in range</dt><dd>{pct(summary.split.within)}</dd></div>
              <div>
                <dt>GMI (estimated A1c)</dt>
                <dd>{format(summary.gmi.percent, "", 1)}%<small>{Math.round(summary.gmi.mmolPerMol)} mmol/mol</small></dd>
              </div>
              <div><dt>Variability (CV)</dt><dd>{Math.round(summary.cv)}%</dd></div>
            </>
          ) : (
            <>
              <div><dt>Readings in range</dt><dd>{pct(summary.split.within)}</dd></div>
              <div><dt>Variability (SD)</dt><dd>{formatMmol(summary.sd)} mmol/L</dd></div>
            </>
          )}
        </dl>
      </div>
      <div>
        <div className="glucose-chart-title"><b>Daily range and median</b><span>Target {glucoseRangeText(range)}</span></div>
        <GlucoseDailyChart days={days} range={range} from={from} to={to} />
        <GlucoseRangeSplit split={summary.split} />
        <small>{summary.dense ? "Share of time, weighted by continuous readings." : "Share of recorded readings, not time in range."}</small>
      </div>
      <div className="glucose-card-footer">
        <span>{`${summary.count.toLocaleString()} readings · ${summary.daysWithReadings} of ${summary.windowDays} days`}</span>
        <span className={`glucose-density-chip ${summary.dense ? "dense" : "sparse"}`}>
          {summary.dense
            ? `Continuous data · ${pct(summary.coverage)} coverage`
            : "Spot readings · time-based metrics need ≥14 days and ≥70% coverage"}
        </span>
      </div>
    </article>
  );
}
```

`src/components/glucose/GlucoseAssociationPanel.tsx`:

```tsx
import { format } from "../../report";
import { ASSOCIATION_MIN_PAIRS, type GlucoseAssociations, formatMmol } from "../../glucose";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatMmol(Math.abs(v))} mmol/L`;

function Row({ title, value, detail, fallback }: { title: string; value?: number; detail: string; fallback: string }) {
  return (
    <div className="glucose-assoc-row">
      <div className="glucose-assoc-title">
        <b>{title}</b>
        {value === undefined ? <span className="na">—</span> : <span>{signed(value)}</span>}
      </div>
      <small>{value === undefined ? fallback : detail}</small>
    </div>
  );
}

export function GlucoseAssociationPanel({ associations: a }: { associations: GlucoseAssociations }) {
  return (
    <article className="panel glucose-association-panel">
      <div className="glucose-panel-heading">
        <h3>Observed associations</h3>
        <small>Readings paired with nearby events in this period.</small>
      </div>
      <Row
        title="After logged carbohydrates"
        value={a.carbs.value}
        detail={`Median rise to the highest reading within 2 h · ${a.carbs.n} paired meals`}
        fallback={`Not enough paired meals for a comparison (${a.carbs.n} of ${ASSOCIATION_MIN_PAIRS})`}
      />
      <Row
        title="After logged activity"
        value={a.activity.value}
        detail={`Median change about 2 h after starting · ${a.activity.n} sessions`}
        fallback={`Not enough paired sessions for a comparison (${a.activity.n} of ${ASSOCIATION_MIN_PAIRS})`}
      />
      <Row
        title="After shorter nights"
        value={a.sleep.value}
        detail={`First morning reading after nights under ${format(a.sleep.splitHours ?? 0, "", 1)} h, compared with longer nights · ${a.sleep.shorter} and ${a.sleep.longer} nights`}
        fallback="Not enough mornings with a reading for a comparison"
      />
      <p className="glucose-note">
        Descriptive comparison only. It does not establish cause, and it is not guidance on medication or insulin doses.
      </p>
    </article>
  );
}
```

- [ ] **Step 7: Create `src/components/glucose/GlucoseOverview.tsx`**

```tsx
import { memo, useMemo } from "react";
import type React from "react";
import type { HealthRecord } from "../../shared/types";
import {
  type GlucoseRange,
  type GlucoseSummary,
  formatMmol,
  glucoseAssociations,
  glucoseColors,
  glucoseDaily,
  glucoseHourlyProfile,
  glucoseSummary,
} from "../../glucose";
import { GlucoseAssociationPanel } from "./GlucoseAssociationPanel";
import { GlucoseDailyPattern } from "./GlucoseDailyPattern";
import { GlucoseRangeControl } from "./GlucoseRangeControl";
import { GlucoseSummaryCard } from "./GlucoseSummaryCard";
import { GlucoseTimeline } from "./GlucoseTimeline";

function MealContext({ context }: { context: GlucoseSummary["mealContext"] }) {
  const row = (label: string, stat: { count: number; median?: number }) => (
    <div>
      <b>{label}</b>
      <span>{stat.count} readings</span>
      <b>{stat.median === undefined ? "—" : `${formatMmol(stat.median)} mmol/L`}</b>
    </div>
  );
  return (
    <article className="panel">
      <div className="glucose-panel-heading">
        <h3>Meal context</h3>
        <small>From the meal-time tag the logging app stored with each reading.</small>
      </div>
      <div className="glucose-meal-context">
        {row("Before meal", context.beforeMeal)}
        {row("After meal", context.afterMeal)}
        {row("Not tagged", context.untagged)}
      </div>
      <p className="glucose-note">Medians per tag. Readings without a tag are not guessed from nearby meals.</p>
    </article>
  );
}

export const GlucoseOverview = memo(function GlucoseOverview({
  records,
  from,
  to,
  range,
  onRangeChange,
  hasGlucose,
}: {
  records: HealthRecord[];
  from: string;
  to: string;
  range: GlucoseRange;
  onRangeChange: (range: GlucoseRange) => void;
  hasGlucose: boolean;
}) {
  const summary = useMemo(() => glucoseSummary(records, range, from, to), [records, range, from, to]);
  const days = useMemo(() => glucoseDaily(records, range), [records, range]);
  const associations = useMemo(() => glucoseAssociations(records), [records]);
  const dense = summary?.dense ?? false;
  const profile = useMemo(() => (dense ? glucoseHourlyProfile(records) : undefined), [records, dense]);
  if (!hasGlucose) return null;
  const tagged = !!summary && summary.mealContext.beforeMeal.count + summary.mealContext.afterMeal.count > 0;
  return (
    <section className="glucose-group" aria-labelledby="glucose-heading">
      <div className="glucose-section-heading">
        <div>
          <p className="eyebrow">Metabolic</p>
          <h2 id="glucose-heading">Blood glucose</h2>
          <p className="glucose-section-copy">
            Readings against a target range, with meals, insulin, activity and sleep for context.
          </p>
        </div>
        <GlucoseRangeControl range={range} onChange={onRangeChange} />
      </div>
      {!summary ? (
        <div className="empty">No blood glucose readings were found for this period.</div>
      ) : (
        <>
          <GlucoseSummaryCard summary={summary} days={days} range={range} from={from} to={to} />
          <div className="glucose-overview-grid">
            <article className="panel">
              <div className="glucose-panel-heading">
                <h3>Glucose and context</h3>
                <small className="glucose-timeline-hint">
                  {summary.dense ? "Continuous readings shown as hourly medians. " : ""}
                  Hover to see what was logged around a reading.
                </small>
              </div>
              <GlucoseTimeline records={records} range={range} from={from} to={to} continuous={summary.dense} />
              <div className="glucose-legend glucose-dot-legend">
                <span style={{ "--c": glucoseColors.below } as React.CSSProperties}>Below target</span>
                <span style={{ "--c": glucoseColors.line } as React.CSSProperties}>Within target</span>
                <span style={{ "--c": glucoseColors.above } as React.CSSProperties}>Above target</span>
                <span style={{ "--c": glucoseColors.insulin } as React.CSSProperties}>Insulin: solid bolus, outlined basal</span>
              </div>
            </article>
            <GlucoseAssociationPanel associations={associations} />
          </div>
          {(profile || tagged) && (
            <div className={`glucose-secondary-grid${profile && tagged ? "" : " single"}`}>
              {profile && (
                <article className="panel">
                  <div className="glucose-panel-heading">
                    <h3>Typical day</h3>
                    <small>{`All ${summary.daysWithReadings} days overlaid by hour: median line, middle 50% and 5–95% bands.`}</small>
                  </div>
                  <GlucoseDailyPattern profile={profile} range={range} />
                </article>
              )}
              {tagged && <MealContext context={summary.mealContext} />}
            </div>
          )}
        </>
      )}
    </section>
  );
});
```

- [ ] **Step 8: Add the glucose tile to `OverviewCards`**

In `src/components/OverviewCards.tsx`:
- Add the imports `import { type GlucoseRange, formatMmol, glucoseSummary } from "../glucose";`.
- Add the prop `glucose?: { range: GlucoseRange; from: string; to: string };` to the props type and destructure it.
- Change `<div className="cards">` to `<div className={glucose ? "cards cards-6" : "cards"}>`.
- Directly after the `highlights.map(...)` expression, inside that div, add `{glucose && <GlucoseOverviewCard records={records} {...glucose} />}`.
- Add this component at the bottom of the file:

```tsx
// Does not call report.latest(): tests/overviewCardsLazy.test.tsx counts those calls per highlight.
function GlucoseOverviewCard({
  records,
  range,
  from,
  to,
}: {
  records: HealthData["records"];
  range: GlucoseRange;
  from: string;
  to: string;
}) {
  const summary = glucoseSummary(records, range, from, to);
  const bounds = `${formatMmol(range.low)}–${formatMmol(range.high)}`;
  return (
    <article className="card">
      <span>Blood glucose</span>
      <strong>{summary ? `${formatMmol(summary.median)} mmol/L` : "—"}</strong>
      <small>
        {summary
          ? `Median · ${Math.round(summary.split.within * 100)}% of ${summary.dense ? "time" : "readings"} in ${bounds}`
          : "No records"}
      </small>
    </article>
  );
}
```

- [ ] **Step 9: Append the section styles to `src/glucose.css`**

```css
/* Blood glucose: overview tile */
.cards.cards-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }

/* Blood glucose: dashboard section */
.glucose-group { margin-top: 36px; }
.glucose-section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 15px; }
.glucose-section-heading h2 { font-size: 21px; letter-spacing: -0.025em; margin: 3px 0 5px; }
.glucose-section-copy { color: #667085; margin: 0; }
.glucose-range-control { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #667085; }
.glucose-range-control select,
.glucose-range-control input { border: 1px solid #d8deea; border-radius: 7px; background: white; color: #23314a; padding: 7px 8px; font: inherit; }
.glucose-range-control input { width: 64px; font-variant-numeric: tabular-nums; }
.glucose-range-control select:focus-visible,
.glucose-range-control input:focus-visible { outline: 2px solid #dce5ff; outline-offset: 1px; border-color: #4263eb; }
.glucose-range-print { font-size: 12px; color: #536176; margin: 0; }

.glucose-summary-card { display: grid; grid-template-columns: minmax(230px, 280px) minmax(0, 1fr); gap: 28px; margin: 18px 0 15px; padding: 22px; }
.glucose-headline strong { display: block; font-size: 52px; letter-spacing: -0.04em; line-height: 1; margin: 12px 0 6px; font-variant-numeric: tabular-nums; }
.glucose-headline strong em { font-style: normal; font-size: 17px; font-weight: 500; letter-spacing: 0; color: #536176; margin-left: 6px; }
.glucose-stats { border-top: 1px solid #e5e9f0; margin: 16px 0 0; padding-top: 12px; display: grid; gap: 9px; }
.glucose-stats div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.glucose-stats dt { color: #667085; }
.glucose-stats dd { margin: 0; font-weight: 650; font-variant-numeric: tabular-nums; }
.glucose-stats dd small { font-weight: 400; margin-left: 4px; }
.glucose-chart-title { display: flex; justify-content: space-between; font-size: 12px; color: #667085; margin-bottom: 4px; }
.glucose-chart-title b { color: #23314a; font-weight: 600; }
.glucose-chart-wrap { position: relative; }
.glucose-chart-wrap svg { display: block; width: 100%; height: auto; overflow: visible; }
.glucose-tooltip {
  position: absolute; top: 8px; transform: translateX(12px); pointer-events: none; z-index: 2;
  background: white; border: 1px solid #d8deea; border-radius: 8px; box-shadow: 0 8px 20px rgba(32, 47, 72, 0.14);
  padding: 8px 10px; font-size: 12px; color: #23314a; line-height: 1.5; max-width: 260px;
  display: flex; flex-direction: column;
}
.glucose-tooltip small { font-size: 11px; }
.glucose-range-split { margin-top: 12px; }
.glucose-range-split-bar { display: flex; gap: 2px; height: 10px; }
.glucose-range-split-bar i { display: block; border-radius: 4px; min-width: 4px; }
.glucose-range-split-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 8px; font-size: 12px; color: #536176; }
.glucose-range-split-legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--c); margin-right: 6px; }
.glucose-range-split-legend b { color: #152033; font-variant-numeric: tabular-nums; }
.glucose-card-footer { grid-column: 1 / -1; border-top: 1px solid #e5e9f0; padding-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 12px; color: #667085; }
.glucose-density-chip { border-radius: 999px; padding: 3px 10px; font-weight: 600; font-size: 11px; }
.glucose-density-chip.dense { background: #e8edff; color: #243c9d; }
.glucose-density-chip.sparse { background: #eef2f6; color: #475467; }

.glucose-overview-grid,
.glucose-secondary-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(290px, 0.9fr); gap: 15px; }
.glucose-secondary-grid { margin-top: 15px; }
.glucose-secondary-grid.single { grid-template-columns: 1fr; }
.glucose-secondary-grid.single .glucose-chart-wrap { max-width: 880px; }
.glucose-secondary-grid.single .glucose-meal-context { max-width: 560px; }
.glucose-panel-heading { margin-bottom: 10px; }
.glucose-panel-heading h3 { margin: 0 0 5px; }
.glucose-panel-heading small,
.glucose-note,
.glucose-assoc-row > small,
.glucose-timeline-note { color: #718096; font-size: 11px; }
.glucose-dot-legend span::before { border-radius: 50%; }
.glucose-assoc-row { border-top: 1px solid #e5e9f0; padding: 11px 0; }
.glucose-assoc-row:first-of-type { border-top: 0; padding-top: 0; }
.glucose-assoc-title { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.glucose-assoc-title b { font-weight: 600; }
.glucose-assoc-title span { color: #243c9d; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.glucose-assoc-title span.na { color: #98a2b3; font-weight: 500; }
.glucose-assoc-row > small { display: block; margin-top: 4px; line-height: 1.45; }
.glucose-note { border-left: 3px solid #4263eb; background: #eef2ff; margin: 8px 0 0; padding: 9px 10px; line-height: 1.45; }
.glucose-meal-context div { display: grid; grid-template-columns: 1fr auto auto; gap: 14px; align-items: baseline; padding: 9px 0; border-top: 1px solid #e5e9f0; font-size: 13px; }
.glucose-meal-context div:first-child { border-top: 0; }
.glucose-meal-context span { color: #667085; font-size: 12px; font-variant-numeric: tabular-nums; }

/* Print layout: one column, no hover chrome */
.print-layout .glucose-overview-grid,
.print-layout .glucose-secondary-grid { grid-template-columns: 1fr; }
.print-layout .glucose-summary-card { grid-template-columns: 200px minmax(0, 1fr); gap: 16px; padding: 14px; }
.print-layout .glucose-headline strong { font-size: 36px; }
.print-layout .glucose-tooltip,
.print-layout .glucose-timeline-hint { display: none; }

@media (max-width: 1000px) {
  .cards.cards-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .glucose-summary-card,
  .glucose-overview-grid,
  .glucose-secondary-grid { grid-template-columns: 1fr; }
}
@media (max-width: 800px) {
  .cards.cards-6 { grid-template-columns: 1fr 1fr; }
  .glucose-section-heading { flex-direction: column; align-items: flex-start; }
}
/* Must follow the max-width rules: the A4 print viewport is narrower than 800px. */
@media print {
  .cards.cards-6 { grid-template-columns: repeat(6, 1fr); gap: 8px; }
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run tests/glucoseOverview.test.tsx tests/overviewCardsLazy.test.tsx`
Expected: PASS. `overviewCardsLazy` still passes because it never sets the `glucose` prop.

- [ ] **Step 11: Commit (only if authorized)**

```bash
git add src/components/glucose src/components/OverviewCards.tsx src/glucose.css tests/glucoseOverview.test.tsx
git commit -m "Add Blood glucose dashboard section, context timeline, typical day and overview tile"
```

---

### Task 5: App wiring, export regression test, docs, full verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/export.test.ts` (one test in the `createCsv` describe block)
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: `GlucoseOverview`, `GlucoseReportTable`, `OverviewCards` with its `glucose` prop, `defaultGlucoseRange`, and `GlucoseRange`.

- [ ] **Step 1: Add the export regression test**

In `tests/export.test.ts`, add inside `describe("createCsv", ...)`:

```ts
  it("exports glucose and insulin rows with their normalized unit and context category", () => {
    const csv = createCsv([
      { metric: "bloodGlucose", date: "2026-01-01T08:00:00.000Z", value: 6.2, unit: "mmol/L", category: "beforeMeal" },
      { metric: "insulinDelivery", date: "2026-01-01T08:05:00.000Z", value: 6, unit: "IU", category: "bolus" },
    ]);
    expect(csv).toContain("Blood glucose,6.2,mmol/L,,beforeMeal");
    expect(csv).toContain("Insulin delivery,6,IU,,bolus");
  });
```

Run: `npx vitest run tests/export.test.ts`
Expected: PASS. Tasks 1–2 already provide this behavior, so no export code changes; the test locks it in.

- [ ] **Step 2: Wire the glucose state and components into `App.tsx`**

Add these imports:

```ts
import { GlucoseOverview } from "./components/glucose/GlucoseOverview";
import { GlucoseReportTable } from "./components/tables/GlucoseReportTable";
import { type GlucoseRange, defaultGlucoseRange } from "./glucose";
```

Add state and a derived flag after the `showSymptomOverlay` state:

```ts
  const [glucoseRange, setGlucoseRange] = useState<GlucoseRange>(defaultGlucoseRange);
  const hasGlucose = useMemo(
    () => !!data?.records.some((record) => record.metric === "bloodGlucose"),
    [data],
  );
```

In `importData()`, inside `if (result) {`, add `setGlucoseRange(defaultGlucoseRange);` after `setData(result);`.

Replace the three `<OverviewCards …/>` elements with:

```tsx
      <OverviewCards
        records={overviewRecords}
        periodLabel="Last 30 days"
        glucose={hasGlucose ? { range: glucoseRange, from: rangeDate(30, to), to } : undefined}
      />
      <OverviewCards
        records={yearOverviewRecords}
        periodLabel="Last year"
        collapsible
        glucose={hasGlucose ? { range: glucoseRange, from: rangeDate(365, to), to } : undefined}
      />
      <OverviewCards
        records={allTimeOverviewRecords}
        periodLabel="All time"
        collapsible
        glucose={hasGlucose ? { range: glucoseRange, from: "", to } : undefined}
      />
```

`glucose` is a new object literal on every render, so the tile's memoization works at the `OverviewCards` level only. That's acceptable because the collapsed sections compute lazily.

Directly after the `<SymptomOverview … />` element, add:

```tsx
      <GlucoseOverview
        records={records}
        from={from}
        to={to}
        range={glucoseRange}
        onRangeChange={setGlucoseRange}
        hasGlucose={hasGlucose}
      />
```

In the detailed report, directly after the `<SymptomsReportTable … />` element, add:

```tsx
              <GlucoseReportTable
                records={records}
                from={from}
                to={to}
                metadata={metadata}
                range={glucoseRange}
              />
```

- [ ] **Step 3: Update `docs/ARCHITECTURE.md`**

- **§3 module map:** add rows for `src/glucose.ts` ("Pure glucose calculations: target ranges, summary with continuous-data gate, daily rows, hourly profile, activity sessions, sleep nights, descriptive associations"), `src/components/glucose/*`, `src/components/tables/GlucoseReportTable.tsx`, and `src/glucose.css`. Add test rows for `tests/glucose.test.ts`, `tests/glucoseOverview.test.tsx`, and `tests/glucoseReportTable.test.tsx`.
- **§4, the paragraph listing supported metrics:** add blood glucose, insulin delivery, body composition (BMI, body fat, waist, lean body mass), SpO₂, respiratory rate, HRV, VO₂ max, and walking heart rate average. Note that `category` also carries the glucose meal-time and insulin basal/bolus context.
- **§5.1:** add a paragraph covering four things:
  - glucose is converted to mmol/L (mg/dL ÷ 18.0156; the `mmol<…>/L` unit is rewritten);
  - SpO₂ and body fat fractions are multiplied by 100;
  - `MetadataEntry` is read only for glucose (`HKBloodGlucoseMealTime`) and insulin (`HKInsulinDeliveryReason`);
  - plausibility is checked after normalization.
- **§7:** add `glucoseRange` to the App state list (session-only, default Type 2 3.9–10.0 mmol/L, reset on import), and add the Blood glucose section to the flowchart description.
- **§8:**
  - Add a paragraph on the Blood glucose section: summary card, context timeline, associations, typical day and meal context, the continuous-data gate (≥14 days, ≥70% coverage), and custom SVG charts that aren't part of the `data-pdf-chart-ready` protocol.
  - Add `GlucoseReportTable` to the table list.
  - Correct "PDF tables use the 90 most recent days" to match `MAX_PDF_TABLE_ROWS` (365).
- **§12:** change "PDF tables are capped at 90 days" to 365.

- [ ] **Step 4: Full verification**

Run each of these and read the complete output:

```bash
npm run typecheck
npm test
npm run build
```

Expected: typecheck exits 0, all test files pass, and the build writes `dist/` and `dist-electron/`. If anything fails, list every failing test name from the full output; do not truncate it with `tail`.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/App.tsx tests/export.test.ts docs/ARCHITECTURE.md
git commit -m "Wire blood glucose section, detailed table and target range into the report"
```
