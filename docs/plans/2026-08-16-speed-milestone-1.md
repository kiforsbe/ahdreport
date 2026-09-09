# Milestone 1: Low-Risk Hot-Path Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the four cheapest, lowest-risk render-path costs identified in the speed initiative — repeated `Intl` formatter construction, repeated per-metric presence/span scans, linear date-range filtering, and an unnecessary export sort — without changing any displayed value, clinical number, or exported byte.

**Architecture:** All four tasks are pure-function changes inside the existing `src/report.ts` / `src/export.ts` module boundary, consumed by `src/App.tsx` and the table/chart components under `src/components/`. Nothing here touches Electron IPC, the parser, or React tree shape, so each task is independently testable with plain Vitest (no DOM environment is configured in this repo today, and none of these tasks need one).

**Tech Stack:** TypeScript, React 19, Vitest 4 (`npm test` → `vitest run`), no test DOM environment configured. `fast-check` is added as a new devDependency in Task 3 for property-based testing (not present today).

**Spec:** docs/plans/speed_plan.md (§4.1–4.4)

## Global Constraints

Copied verbatim from speed_plan.md §2 ("Repository and privacy constraints"), which binds all milestones including this one:

- Keep processing local.
- Use only deterministic synthetic data in committed fixtures and benchmarks.
- Preserve sandboxing, context isolation, and the narrow preload API.
- Do not add arbitrary renderer filesystem access.
- Preserve exact raw data for tables and CSV/XLSX export.
- Maintain compatibility with standalone XML and Apple Health ZIP input.

Also binding, from speed_plan.md §1/§3.3 (no repo CLAUDE.md exists — none was found anywhere under this repo, so no additional repo-specific instructions apply beyond this doc):

- Do not change clinical values, supported record behavior, privacy properties, or exported content.
- Do not impose tight CI performance thresholds on shared runners; any hard timing numbers (e.g. "1,000,000 records in 10ms") are local/manual checks, not `npm test` assertions.
- Required verification per milestone task: `npm test` and `npm run build` must both pass before a task is considered done.

## Corrections to the source spec (confirmed against current code)

1. §4.2's "repeated `records.some`, `filter`, and `map` calls" are more spread out than the prose implies. The presence/group-visibility calls (`records.some(...)`) all live in `src/App.tsx` (lines 226–227, 342–348, 362–364). But the `filter`/`map` calls come from `dataSpan()` in `src/report.ts` (lines 237–245), which is invoked once per metric from **six different components** via `coverageNote()` in `src/components/TableNotes.tsx` (`VitalsReportTable`, `ActivityReportTable`, `WalkingReportTable`, `NutritionReportTable`, `ReportTable`, `BloodPressureChart`) — not just from `App.tsx`. Task 2 below threads `RangeMetadata` through all of these, not just `App.tsx`.
2. §4.1's formatter-reuse target is narrower than "any date formatting." Only `report.ts`'s `format()` calls `Intl.NumberFormat` directly (one call site). Day-string formatting is not centralized at all today: `formatDate()` exists in `report.ts` but only `TableNotes.tsx` calls it — five table components and four chart tooltip components each independently call `new Date(\`${date}T00:00:00\`).toLocaleDateString()` inline, per row/point, per render. Task 1 both caches the formatter inside `formatDate()` *and* routes those nine inline call sites through it. One call site, `OverviewCards.tsx:48`, formats a *full timestamp* (`new Date(item.date).toLocaleDateString()`, not a day string) and is deliberately left alone — routing it through the day-only `formatDate()` would silently change which calendar day gets displayed near local-midnight boundaries, which is out of scope for a "low-risk" milestone.
3. Confirmed: `record.date` is always produced by `new Date(timestamp).toISOString()` in `electron/appleHealthParser.ts:190` (UTC, fixed-width, so lexical string comparison = chronological order), and `filtered()`'s `from`/`to` boundaries are parsed via `new Date(\`${from}T00:00:00\`)` (`src/report.ts:119`) — a timezone-less date-time string, which per the ECMA-262 Date Time String Format is interpreted as **local** time, not UTC. The spec's premise in §4.3 is accurate.
4. Neither `fast-check` nor any DOM/component-testing library is currently installed (`package.json` has only `vitest`), and there is no `vitest.config.*` or CI `TZ` override (`.github/workflows/ci.yml` runs `ubuntu-latest` with no `TZ` set, so CI is fixed at UTC). Task 3 adds `fast-check` as a new devDependency and simulates non-UTC zones in-process via `process.env.TZ`.

---

### Task 1: Reuse number and date formatters

**Files:**
- Modify: `src/report.ts` (`format()` at lines 229–235, `formatDate()` at lines 246–248)
- Modify: `src/components/tables/VitalsReportTable.tsx` (line 112), `src/components/tables/ActivityReportTable.tsx` (line 80), `src/components/tables/WalkingReportTable.tsx` (line 76), `src/components/tables/NutritionReportTable.tsx` (line 85), `src/components/tables/ReportTable.tsx` (line 57), `src/components/charts/CarbsChart.tsx` (line 38), `src/components/charts/PulsePressureChart.tsx` (line 34), `src/components/charts/RangeMetricChart.tsx` (line 43), `src/components/charts/BloodPressureChart.tsx` (line 58)
- Test: `tests/report.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `format(value: number, unit?: string, decimals?: number): string` and `formatDate(isoDay: string): string` — signatures unchanged, now backed by module-level cached `Intl.NumberFormat`/`Intl.DateTimeFormat` instances so callers may call them per-cell/per-row without per-call construction cost. Safe for any later milestone to call in a tight loop.

Steps:

- [ ] 1. In `src/report.ts`, replace the `format()` function (lines 229–235) with a cached-formatter version:
  ```ts
  // Bounded by the number of distinct decimals configurations actually used
  // (decimalsByMetric's values plus the "auto" default) — not by render count.
  const numberFormatters = new Map<string, Intl.NumberFormat>();
  function numberFormatterFor(decimals?: number) {
    const key = decimals === undefined ? "auto" : String(decimals);
    let formatter = numberFormatters.get(key);
    if (!formatter) {
      const options: Intl.NumberFormatOptions =
        decimals === undefined
          ? { maximumFractionDigits: 1 }
          : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
      formatter = new Intl.NumberFormat(undefined, options);
      numberFormatters.set(key, formatter);
    }
    return formatter;
  }
  export function format(value: number, unit = "", decimals?: number) {
    return `${numberFormatterFor(decimals).format(value)}${unit ? ` ${unit}` : ""}`;
  }
  ```
- [ ] 2. In `src/report.ts`, replace `formatDate()` (lines 246–248) with a cached-formatter version:
  ```ts
  const dayFormatter = new Intl.DateTimeFormat(undefined);
  export function formatDate(isoDay: string) {
    return dayFormatter.format(new Date(`${isoDay}T00:00:00`));
  }
  ```
- [ ] 3. Add formatting tests to `tests/report.test.ts` (append a new `describe` block; add `format` and `formatDate` to the file's existing import from `../src/report` if not already present, and add `vi` to the existing `import { describe, expect, it } from "vitest";` line, making it `import { describe, expect, it, vi } from "vitest";`):
  ```ts
  describe("format", () => {
    it("formats zero with fixed decimals and a trailing unit", () => {
      expect(format(0, "kg", 1)).toBe(
        `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0)} kg`,
      );
    });
    it("formats negative fractional values", () => {
      expect(format(-3.456, "kg", 2)).toBe(
        `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(-3.456)} kg`,
      );
    });
    it("rounds to the configured decimals", () => {
      expect(format(72.5, "bpm", 0)).toBe(
        `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(72.5)} bpm`,
      );
    });
    it("omits the unit suffix when no unit is given", () => {
      expect(format(5, "", 0)).toBe(
        new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(5),
      );
    });
    it("falls back to maximumFractionDigits: 1 when decimals is omitted", () => {
      expect(format(3.14159)).toBe(
        new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(3.14159),
      );
    });
    it("constructs at most one NumberFormat per decimals configuration", () => {
      const ctorSpy = vi.spyOn(Intl, "NumberFormat");
      format(1, "kg", 3);
      format(2, "kg", 3);
      format(3, "kg", 3);
      const callsForThreeDecimals = ctorSpy.mock.calls.filter(
        ([, options]) =>
          (options as Intl.NumberFormatOptions | undefined)?.minimumFractionDigits === 3,
      ).length;
      expect(callsForThreeDecimals).toBeLessThanOrEqual(1);
      ctorSpy.mockRestore();
    });
  });
  describe("formatDate", () => {
    it("formats an ISO day string as a local calendar date", () => {
      expect(formatDate("2026-01-01")).toBe(
        new Date("2026-01-01T00:00:00").toLocaleDateString(),
      );
    });
  });
  ```
- [ ] 4. Run `npm test` and confirm all tests pass (there are no pre-existing tests asserting `format()`/`formatDate()` output today, so this step is purely additive — nothing to reconcile).
- [ ] 5. Commit: `git commit -m "Cache Intl formatters in report.ts's format()/formatDate()"`.
- [ ] 6. Replace the inline day-formatting call in `src/components/tables/VitalsReportTable.tsx`. Add `formatDate` to the existing `import { ... } from "../../report";` block, then change line 112:
  ```diff
  -              <td>{new Date(`${date}T00:00:00`).toLocaleDateString()}</td>
  +              <td>{formatDate(date)}</td>
  ```
- [ ] 7. Repeat the same replacement in `src/components/tables/ActivityReportTable.tsx` (line 80), `src/components/tables/WalkingReportTable.tsx` (line 76), `src/components/tables/NutritionReportTable.tsx` (line 85), and `src/components/tables/ReportTable.tsx` (line 57 — variable is `day.date`, so `{formatDate(day.date)}`). Add `formatDate` to each file's existing `../../report` import.
- [ ] 8. Replace the inline tooltip-date formatting in the four chart components. Add `formatDate` to each file's existing `../../report` import, then:
  - `src/components/charts/CarbsChart.tsx:38`: `<b>{formatDate(label)}</b>`
  - `src/components/charts/PulsePressureChart.tsx:34`: `<b>{formatDate(label)}</b>`
  - `src/components/charts/RangeMetricChart.tsx:43`: `<b>{formatDate(label)}</b>`
  - `src/components/charts/BloodPressureChart.tsx:58`: `<b>{formatDate(label)}</b>`
- [ ] 9. Run `npm test && npm run build` to confirm the type check and build both succeed (this touches nine files' imports, so the build step is the main risk-catcher here).
- [ ] 10. Commit: `git commit -m "Route table dates and chart tooltip labels through the shared day formatter"`.

---

### Task 2: Memoize metric presence and data spans

**Files:**
- Modify: `src/report.ts` (replace `dataSpan()` at lines 237–245 with `RangeMetadata`/`rangeMetadata()`)
- Modify: `src/components/TableNotes.tsx` (`coverageNote()` signature, lines 12–22)
- Modify: `src/App.tsx` (import list lines 4–14; presence checks at lines 226–227; group filter/empty checks at lines 342–348, 362–364; `coverageNote` call at line 350; new `metadata` `useMemo` placed alongside the existing `records` `useMemo` at lines 52–55; `metadata` prop threaded into the six component call sites around lines 317–357)
- Modify: `src/components/tables/VitalsReportTable.tsx`, `ActivityReportTable.tsx`, `WalkingReportTable.tsx`, `NutritionReportTable.tsx`, `ReportTable.tsx`, `src/components/charts/BloodPressureChart.tsx` (props + internal `coverageNote` call)
- Test: `tests/report.test.ts` (extend), new `tests/tableNotes.test.ts`

**Interfaces:**
- Consumes: `HealthRecord`, `Metric` from `src/shared/types.ts` (already imported in `report.ts`).
- Produces:
  ```ts
  interface RangeMetadata {
    presentMetrics: Set<Metric>;
    spanByMetric: Map<Metric, { earliest: string; latest: string }>;
  }
  function rangeMetadata(records: readonly HealthRecord[]): RangeMetadata;
  ```
  and an updated `coverageNote(metric: Metric, metadata: RangeMetadata, from: string, to: string): string | null` (was `coverageNote(metric, records, from, to)`). Downstream Milestone 3 index work can reuse this exact `RangeMetadata` shape as-is per speed_plan.md §6.3's `ReportModel.metadata` field.

Steps:

- [ ] 1. In `src/report.ts`, replace `dataSpan()` (lines 237–245, including its preceding comment) with a single-pass `rangeMetadata()`:
  ```ts
  export interface RangeMetadata {
    presentMetrics: Set<Metric>;
    spanByMetric: Map<Metric, { earliest: string; latest: string }>;
  }
  // Single traversal of a selected-range record array. Relies on records
  // being sorted ascending by date (guaranteed by the parser, see
  // electron/appleHealthParser.ts, and preserved by filtered()/recordRange()),
  // so a metric's first occurrence is its earliest date and every later
  // occurrence safely extends `latest`.
  export function rangeMetadata(records: readonly HealthRecord[]): RangeMetadata {
    const presentMetrics = new Set<Metric>();
    const spanByMetric = new Map<Metric, { earliest: string; latest: string }>();
    for (const record of records) {
      presentMetrics.add(record.metric);
      const day = record.date.slice(0, 10);
      const span = spanByMetric.get(record.metric);
      if (span) span.latest = day;
      else spanByMetric.set(record.metric, { earliest: day, latest: day });
    }
    return { presentMetrics, spanByMetric };
  }
  ```
- [ ] 2. In `src/components/TableNotes.tsx`, update the import and `coverageNote()`:
  ```diff
  -import { dataSpan, formatDate } from "../report";
  +import { formatDate, type RangeMetadata } from "../report";
  ```
  ```diff
   export function coverageNote(
     metric: Metric,
  -  records: HealthData["records"],
  +  metadata: RangeMetadata,
     from: string,
     to: string,
   ) {
  -  const { earliest, latest } = dataSpan(records, metric);
  -  if (!earliest || !latest) return null;
  +  const span = metadata.spanByMetric.get(metric);
  +  if (!span) return null;
  +  const { earliest, latest } = span;
     if (!(from && earliest > from) && !(to && latest < to)) return null;
     return `Data available ${formatDate(earliest)} – ${formatDate(latest)}, narrower than the selected period.`;
   }
  ```
  `HealthData` may still be used elsewhere in the file; if it becomes an unused import after this edit, drop it to keep the build clean.
- [ ] 3. Run `npm run build` to catch every now-broken call site (TypeScript will flag all six `coverageNote(metric, records, from, to)` calls as a type error since `records` is `HealthRecord[]`, not `RangeMetadata`) — use the error list as the exact checklist for the next two steps.
- [ ] 4. In `src/App.tsx`: add `rangeMetadata` to the `./report` import (lines 4–14 block), add a memoized `metadata` right after the existing `records` `useMemo` (lines 52–55):
  ```ts
  const metadata = useMemo(() => rangeMetadata(records), [records]);
  ```
  Then update the presence/visibility checks:
  ```diff
  -  const medicationPresent = records.some((r) => r.metric === "medication");
  -  const hasBloodPressure = records.some((r) => bpMetrics.includes(r.metric));
  +  const medicationPresent = metadata.presentMetrics.has("medication");
  +  const hasBloodPressure = bpMetrics.some((m) => metadata.presentMetrics.has(m));
  ```
  ```diff
               {group.metrics
                 .filter(
                   (m) =>
                     !bpMetrics.includes(m) &&
                     m !== "sugar" &&
  -                  records.some((r) => r.metric === m),
  +                  metadata.presentMetrics.has(m),
                 )
                 .map((m) => {
  -                const note = coverageNote(m, records, from, to);
  +                const note = coverageNote(m, metadata, from, to);
  ```
  ```diff
  -            {!group.metrics.some((m) =>
  -              records.some((r) => r.metric === m),
  -            ) && (
  +            {!group.metrics.some((m) => metadata.presentMetrics.has(m)) && (
  ```
  Then thread the new prop into the six components that internally call `coverageNote`:
  ```diff
  -        <BloodPressureChart records={records} from={from} to={to} />
  +        <BloodPressureChart records={records} from={from} to={to} metadata={metadata} />
  ```
  ```diff
  -        <VitalsReportTable records={records} from={from} to={to} />
  -        <ActivityReportTable records={records} from={from} to={to} />
  -        <WalkingReportTable records={records} from={from} to={to} />
  -        <NutritionReportTable records={records} from={from} to={to} />
  +        <VitalsReportTable records={records} from={from} to={to} metadata={metadata} />
  +        <ActivityReportTable records={records} from={from} to={to} metadata={metadata} />
  +        <WalkingReportTable records={records} from={from} to={to} metadata={metadata} />
  +        <NutritionReportTable records={records} from={from} to={to} metadata={metadata} />
        {metricGroups
          .flatMap((g) => g.metrics)
          .filter(...)
          .map((m) => (
            <ReportTable
              key={m}
              metric={m}
              records={records}
              from={from}
              to={to}
  +           metadata={metadata}
            />
          ))}
  ```
- [ ] 5. In each of `VitalsReportTable.tsx`, `ActivityReportTable.tsx`, `WalkingReportTable.tsx`, `NutritionReportTable.tsx`, `ReportTable.tsx`, add `metadata: RangeMetadata` to the component's props type and destructure, add `type { RangeMetadata } from "../../report"` to the existing `../../report` import, and change the internal `coverageNote(metric, records, from, to)` call to `coverageNote(metric, metadata, from, to)`. Example for `VitalsReportTable.tsx`:
  ```diff
   import {
     MAX_PDF_TABLE_ROWS,
     MAX_TABLE_ROWS,
     colorsByMetric,
     columnBounds,
     dailyStats,
     decimalsByMetric,
     labels,
  +  type RangeMetadata,
  +  formatDate,
   } from "../../report";
   ...
   export function VitalsReportTable({
     records,
     from,
     to,
  +  metadata,
   }: {
     records: HealthData["records"];
     from: string;
     to: string;
  +  metadata: RangeMetadata;
   }) {
     ...
  -    const note = coverageNote(metric, records, from, to);
  +    const note = coverageNote(metric, metadata, from, to);
  ```
  (`formatDate` is already present in this import if Task 1 landed first; if executing tasks out of order, add it per Task 1 step 7.)
- [ ] 6. In `src/components/charts/BloodPressureChart.tsx`, add `metadata` to the props type/destructure and update both calls:
  ```diff
   export function BloodPressureChart({
     records,
     from,
     to,
  +  metadata,
   }: {
     records: HealthData["records"];
     from: string;
     to: string;
  +  metadata: RangeMetadata;
   }) {
     const printLayout = useContext(PrintLayoutContext);
  -  const sNote = coverageNote("bloodPressureSystolic", records, from, to);
  -  const dNote = coverageNote("bloodPressureDiastolic", records, from, to);
  +  const sNote = coverageNote("bloodPressureSystolic", metadata, from, to);
  +  const dNote = coverageNote("bloodPressureDiastolic", metadata, from, to);
  ```
  Add `type RangeMetadata` to the existing `../../report` import.
- [ ] 7. Add `rangeMetadata()` unit tests to `tests/report.test.ts` (new `describe` block; add `rangeMetadata` to the top import from `../src/report`):
  ```ts
  describe("rangeMetadata", () => {
    it("returns empty presence and span data for no records", () => {
      const metadata = rangeMetadata([]);
      expect(metadata.presentMetrics.size).toBe(0);
      expect(metadata.spanByMetric.size).toBe(0);
    });
    it("tracks earliest/latest per metric across a mixed, sorted array", () => {
      const mixed: HealthRecord[] = [
        { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
        { metric: "steps", date: "2026-01-05T12:00:00.000Z", value: 500, unit: "count" },
        { metric: "weight", date: "2026-01-10T09:00:00.000Z", value: 71, unit: "kg" },
      ];
      const metadata = rangeMetadata(mixed);
      expect([...metadata.presentMetrics].sort()).toEqual(["steps", "weight"]);
      expect(metadata.spanByMetric.get("weight")).toEqual({
        earliest: "2026-01-01",
        latest: "2026-01-10",
      });
      expect(metadata.spanByMetric.get("steps")).toEqual({
        earliest: "2026-01-05",
        latest: "2026-01-05",
      });
    });
  });
  ```
- [ ] 8. Create `tests/tableNotes.test.ts` for `coverageNote`'s new metadata-based signature:
  ```ts
  import { describe, expect, it } from "vitest";
  import { coverageNote } from "../src/components/TableNotes";
  import { rangeMetadata } from "../src/report";
  import type { HealthRecord } from "../src/shared/types";

  const records: HealthRecord[] = [
    { metric: "weight", date: "2026-01-10T09:00:00.000Z", value: 70, unit: "kg" },
    { metric: "weight", date: "2026-01-20T09:00:00.000Z", value: 71, unit: "kg" },
  ];

  describe("coverageNote", () => {
    it("returns null when the metric is entirely absent", () => {
      const metadata = rangeMetadata(records);
      expect(coverageNote("steps", metadata, "2026-01-01", "2026-01-31")).toBeNull();
    });
    it("returns null when the metric's data covers the whole selected period", () => {
      const metadata = rangeMetadata(records);
      expect(coverageNote("weight", metadata, "2026-01-10", "2026-01-20")).toBeNull();
    });
    it("notes when a metric's available dates are narrower than the selected period", () => {
      const metadata = rangeMetadata(records);
      const note = coverageNote("weight", metadata, "2026-01-01", "2026-01-31");
      expect(note).toContain("narrower than the selected period");
    });
  });
  ```
- [ ] 9. Run `npm test && npm run build`.
- [ ] 10. Commit: `git commit -m "Replace per-metric dataSpan scans with a single rangeMetadata pass"`.

---

### Task 3: Binary date-range lookup

**Files:**
- Modify: `src/report.ts` (replace `filtered()` at lines 118–125 with `recordRange()` + helpers, `filtered()` delegating to it)
- Modify: `package.json` (add `fast-check` devDependency)
- Test: new `tests/recordRange.test.ts`, optional new `tests/recordRange.bench.ts` (manual, not run by `npm test`)

**Interfaces:**
- Consumes: `HealthRecord` from `src/shared/types.ts`.
- Produces:
  ```ts
  interface RecordRange {
    start: number;
    end: number; // exclusive
  }
  function recordRange(records: readonly HealthRecord[], from: string, to: string): RecordRange;
  ```
  `filtered(records: HealthRecord[], from: string, to: string): HealthRecord[]` keeps its exact current signature and behavior, now implemented via `recordRange()` + `slice()`. Later report-model code (Milestone 3) can call `recordRange()` directly and consume `{start, end}` without allocating a slice for all-time ranges.

Steps:

- [ ] 1. Add `fast-check` as a devDependency: run `npm install --save-dev fast-check` (adds an entry to `package.json`'s `devDependencies` and updates `package-lock.json`; this is dev-only, never shipped in the packaged Electron app, so it does not affect the app's runtime footprint or privacy surface).
- [ ] 2. In `src/report.ts`, replace `filtered()` (lines 118–125) with the binary-search implementation and its helpers, inserted at the same location:
  ```ts
  export interface RecordRange {
    start: number;
    end: number; // exclusive
  }
  function toUtcInstant(day: string, endOfDay: boolean): string | undefined {
    const time = endOfDay ? "23:59:59.999" : "00:00:00";
    const date = new Date(`${day}T${time}`);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  // First index i such that records[i].date >= iso.
  function lowerBound(records: readonly HealthRecord[], iso: string): number {
    let lo = 0;
    let hi = records.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (records[mid].date < iso) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  // First index i such that records[i].date > iso (i.e. count of dates <= iso).
  function upperBound(records: readonly HealthRecord[], iso: string): number {
    let lo = 0;
    let hi = records.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (records[mid].date <= iso) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  // Binary lower/upper bound over a globally ascending-sorted record array
  // (invariant established by the parser; see electron/appleHealthParser.ts).
  // `from`/`to` are local-time day boundaries, matching the UI's date
  // inputs; they are converted here to their equivalent UTC ISO instant —
  // exactly what `new Date(...).getTime()` (i.e. `Date.parse`) already does —
  // before comparing against `record.date`, which is always a UTC ISO string
  // produced by `Date.prototype.toISOString()`. Do not compare the raw local
  // boundary strings against record.date directly.
  export function recordRange(
    records: readonly HealthRecord[],
    from: string,
    to: string,
  ): RecordRange {
    if (!records.length) return { start: 0, end: 0 };
    let start = 0;
    if (from) {
      const startIso = toUtcInstant(from, false);
      if (startIso === undefined) return { start: 0, end: 0 };
      start = lowerBound(records, startIso);
    }
    let end = records.length;
    if (to) {
      const endIso = toUtcInstant(to, true);
      if (endIso === undefined) return { start: 0, end: 0 };
      end = upperBound(records, endIso);
    }
    return { start, end: Math.max(start, end) };
  }
  export function filtered(records: HealthRecord[], from: string, to: string) {
    const { start, end } = recordRange(records, from, to);
    return records.slice(start, end);
  }
  ```
  Note: this intentionally drops the old per-record `Number.isFinite(Date.parse(record.date))` defensive guard, since binary search requires the sortedness/validity invariant to hold for every element, and that invariant is already guaranteed by the parser (`electron/appleHealthParser.ts:188`) and already relied on elsewhere in this file (e.g. `rangeMetadata`'s ordering comment from Task 2). This is a deliberate, documented narrowing — mention it in the commit message.
- [ ] 3. Create `tests/recordRange.test.ts` with a linear reference implementation (a frozen copy of the *old* `filtered()` logic, kept only in the test) and explicit correctness cases:
  ```ts
  import { afterEach, describe, expect, it } from "vitest";
  import fc from "fast-check";
  import { recordRange, type RecordRange } from "../src/report";
  import type { HealthRecord } from "../src/shared/types";

  function linearRange(records: HealthRecord[], from: string, to: string): RecordRange {
    const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    const kept: number[] = [];
    records.forEach((record, index) => {
      const t = Date.parse(record.date);
      if (Number.isFinite(t) && t >= start && t <= end) kept.push(index);
    });
    if (!kept.length) return { start: 0, end: 0 };
    return { start: kept[0], end: kept.at(-1)! + 1 };
  }
  const row = (t: number, i: number): HealthRecord => ({
    metric: "weight",
    date: new Date(t).toISOString(),
    value: i,
    unit: "kg",
  });

  describe("recordRange", () => {
    it("returns an empty range for an empty array", () => {
      expect(recordRange([], "2026-01-01", "2026-01-31")).toEqual({ start: 0, end: 0 });
    });
    it("returns the full range when both boundaries are absent", () => {
      const records = [row(1, 0), row(2, 1), row(3, 2)];
      expect(recordRange(records, "", "")).toEqual({ start: 0, end: 3 });
    });
    it("respects only a From boundary", () => {
      const records = [
        { ...row(0, 0), date: "2026-01-01T00:00:00.000Z" },
        { ...row(0, 1), date: "2026-01-02T00:00:00.000Z" },
      ];
      expect(recordRange(records, "2026-01-02", "")).toEqual({ start: 1, end: 2 });
    });
    it("respects only a To boundary", () => {
      const records = [
        { ...row(0, 0), date: "2026-01-01T00:00:00.000Z" },
        { ...row(0, 1), date: "2026-01-02T00:00:00.000Z" },
      ];
      expect(recordRange(records, "", "2026-01-01")).toEqual({ start: 0, end: 1 });
    });
    it("includes readings exactly at local midnight and at the last instant of the selected day", () => {
      const records: HealthRecord[] = [
        { metric: "weight", date: "2026-01-05T00:00:00.000Z", value: 1, unit: "kg" },
        { metric: "weight", date: "2026-01-05T23:59:59.999Z", value: 2, unit: "kg" },
        { metric: "weight", date: "2026-01-06T00:00:00.000Z", value: 3, unit: "kg" },
      ];
      // Local zone here is whatever the process TZ is (UTC in CI); the exact
      // boundary instant is validated per-zone in the timezone test below.
      const range = recordRange(records, "2026-01-05", "2026-01-05");
      expect(range).toEqual(linearRange(records, "2026-01-05", "2026-01-05"));
    });
    it("returns an empty range when no records fall inside the window", () => {
      const records = [row(Date.parse("2026-01-01T00:00:00Z"), 0)];
      expect(recordRange(records, "2026-02-01", "2026-02-28")).toEqual({ start: 0, end: 0 });
    });
    it("returns an empty range for a window entirely outside the dataset", () => {
      const records = [row(Date.parse("2026-06-01T00:00:00Z"), 0)];
      expect(recordRange(records, "2020-01-01", "2020-01-31")).toEqual({ start: 0, end: 0 });
    });
    it("treats an unparseable From the same as the linear implementation (empty result)", () => {
      const records = [row(Date.parse("2026-01-01T00:00:00Z"), 0)];
      expect(recordRange(records, "not-a-date", "")).toEqual(
        linearRange(records, "not-a-date", ""),
      );
    });
    it("treats an unparseable To the same as the linear implementation (empty result)", () => {
      const records = [row(Date.parse("2026-01-01T00:00:00Z"), 0)];
      expect(recordRange(records, "", "also-not-a-date")).toEqual(
        linearRange(records, "", "also-not-a-date"),
      );
    });
    it("keeps duplicate timestamps contiguous and inclusive", () => {
      const records: HealthRecord[] = [
        { metric: "weight", date: "2026-01-05T09:00:00.000Z", value: 1, unit: "kg" },
        { metric: "weight", date: "2026-01-05T09:00:00.000Z", value: 2, unit: "kg" },
        { metric: "weight", date: "2026-01-05T09:00:00.000Z", value: 3, unit: "kg" },
      ];
      expect(recordRange(records, "2026-01-05", "2026-01-05")).toEqual({ start: 0, end: 3 });
    });
    it("does not change record ordering", () => {
      const records = [row(1000, 0), row(2000, 1), row(3000, 2)];
      const { start, end } = recordRange(records, "", "");
      expect(records.slice(start, end).map((r) => r.value)).toEqual([0, 1, 2]);
    });
  });

  describe("recordRange matches the linear scan (property test)", () => {
    const sortedRecords = fc
      .array(fc.integer({ min: 1_700_000_000_000, max: 1_760_000_000_000 }), {
        minLength: 0,
        maxLength: 200,
      })
      .map((timestamps) =>
        timestamps
          .slice()
          .sort((a, b) => a - b)
          .map((t, i) => row(t, i)),
      );
    const dayString = fc.oneof(
      fc.constant(""),
      fc
        .integer({ min: 1_700_000_000_000, max: 1_760_000_000_000 })
        .map((t) => new Date(t).toISOString().slice(0, 10)),
      fc.constant("not-a-date"),
    );
    it("agrees with the reference linear implementation on generated sorted data", () => {
      fc.assert(
        fc.property(sortedRecords, dayString, dayString, (records, from, to) => {
          expect(recordRange(records, from, to)).toEqual(linearRange(records, from, to));
        }),
      );
    });
  });

  describe("recordRange across non-UTC timezones", () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });
    it.each(["America/New_York", "Pacific/Chatham"])(
      "matches the linear scan when the local zone is %s, across a DST transition day",
      (tz) => {
        process.env.TZ = tz;
        // 2026-03-08 is a US spring-forward DST transition day.
        const records: HealthRecord[] = [
          { metric: "weight", date: "2026-03-08T04:30:00.000Z", value: 1, unit: "kg" },
          { metric: "weight", date: "2026-03-08T12:00:00.000Z", value: 2, unit: "kg" },
          { metric: "weight", date: "2026-03-09T04:00:00.000Z", value: 3, unit: "kg" },
        ];
        expect(recordRange(records, "2026-03-08", "2026-03-08")).toEqual(
          linearRange(records, "2026-03-08", "2026-03-08"),
        );
      },
    );
  });
  ```
- [ ] 4. Run `npm test` and fix anything the property test surfaces (it runs against real generated data, so failures here indicate a genuine equivalence bug, not test flakiness — investigate before adjusting the test).
- [ ] 5. (Optional, manual — not part of `npm test`) Create `tests/recordRange.bench.ts` using Vitest's built-in bench API to spot-check the "1,000,000 records within 10ms" acceptance number locally, run via `npx vitest bench tests/recordRange.bench.ts` (Vitest's `bench` files are not picked up by `vitest run`, so this never affects CI or `npm test`):
  ```ts
  import { bench, describe } from "vitest";
  import { recordRange } from "../src/report";
  import type { HealthRecord } from "../src/shared/types";

  const N = 1_000_000;
  const records: HealthRecord[] = Array.from({ length: N }, (_, i) => ({
    metric: "weight",
    date: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    value: i % 100,
    unit: "kg",
  }));
  const ranges: [string, string][] = [
    ["", ""],
    ["2023-11-14", "2023-11-14"],
    ["2023-12-01", "2024-01-01"],
    ["2050-01-01", "2050-01-02"],
  ];

  describe("recordRange on 1,000,000 records", () => {
    for (const [from, to] of ranges) {
      bench(`from=${from || "(none)"} to=${to || "(none)"}`, () => {
        recordRange(records, from, to);
      });
    }
  });
  ```
- [ ] 6. Run `npm test && npm run build`.
- [ ] 7. Commit: `git commit -m "Replace filtered()'s linear scan with O(log n) binary bounds"`.

---

### Task 4: Avoid needless descending export sorts

**Files:**
- Modify: `src/export.ts` (`exportRows()` at lines 11–13)
- Test: new `tests/export.test.ts`

**Interfaces:**
- Consumes: `HealthData["records"]` (i.e. `HealthRecord[]`) from `src/shared/types.ts`.
- Produces: `exportRows(records: HealthData["records"]): HealthData["records"]` — signature and newest-first output order unchanged; internal implementation is O(n) reversal instead of an O(n log n) `localeCompare`-based sort. `createCsv()` and `createExcel()` are unaffected callers and need no changes.

Steps:

- [ ] 1. In `src/export.ts`, replace `exportRows()` (lines 11–13):
  ```diff
   export function exportRows(records: HealthData["records"]) {
  -  return records.slice().sort((a, b) => b.date.localeCompare(a.date));
  +  return records.slice().reverse();
   }
  ```
  This assumes `records` is already sorted ascending, which is guaranteed by every caller: `App.tsx`'s `records` comes from `filtered()` (see Task 3), which slices an already-ascending array. This is a deliberate, low-risk behavior nuance: the old descending `Array.prototype.sort` was stable, so equal-timestamp records kept their original (ascending) relative order even under a descending comparator; the new `reverse()` places equal-timestamp records in the reverse of their original order instead. No existing test or documented contract pins the old tie order (there is no export test file today), and both orders are equally "deterministic" per the acceptance criterion — the test in the next step pins down and documents the new, intentional tie-break.
- [ ] 2. Create `tests/export.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import JSZip from "jszip";
  import { createCsv, createExcel, exportRows } from "../src/export";
  import type { HealthRecord } from "../src/shared/types";

  const ascending: HealthRecord[] = [
    { metric: "steps", date: "2026-01-01T08:00:00.000Z", value: 100, unit: "count" },
    { metric: "steps", date: "2026-01-02T08:00:00.000Z", value: 200, unit: "count" },
    { metric: "steps", date: "2026-01-02T08:00:00.000Z", value: 201, unit: "count" },
    { metric: "steps", date: "2026-01-03T08:00:00.000Z", value: 300, unit: "count" },
  ];

  describe("exportRows", () => {
    it("orders records newest first without mutating the input array", () => {
      const rows = exportRows(ascending);
      expect(rows.map((r) => r.date)).toEqual([
        "2026-01-03T08:00:00.000Z",
        "2026-01-02T08:00:00.000Z",
        "2026-01-02T08:00:00.000Z",
        "2026-01-01T08:00:00.000Z",
      ]);
      expect(ascending[0].date).toBe("2026-01-01T08:00:00.000Z");
    });
    it("resolves equal timestamps deterministically (reverse of input order)", () => {
      const rows = exportRows(ascending);
      expect(rows[1].value).toBe(201);
      expect(rows[2].value).toBe(200);
    });
  });

  describe("createCsv", () => {
    it("exports the newest record first and the oldest record last", () => {
      const csv = createCsv(ascending);
      const lines = csv.replace(/^﻿/, "").split("\r\n");
      expect(lines[1]).toContain("2026-01-03");
      expect(lines.at(-1)).toContain("2026-01-01");
    });
  });

  describe("createExcel", () => {
    it("writes the newest record to the first data row and the oldest to the last", async () => {
      const base64 = await createExcel(ascending);
      const zip = await JSZip.loadAsync(base64, { base64: true });
      const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
      const firstDataRow = sheet.match(/<row r="2">([\s\S]*?)<\/row>/)?.[1] ?? "";
      const lastRowNumber = ascending.length + 1;
      const lastDataRow =
        sheet.match(new RegExp(`<row r="${lastRowNumber}">([\\s\\S]*?)</row>`))?.[1] ?? "";
      expect(firstDataRow).toContain("2026-01-03");
      expect(lastDataRow).toContain("2026-01-01");
    });
  });
  ```
  If `createCsv`/`createExcel` have different exact signatures or output shapes than assumed here (e.g. a different CSV delimiter, BOM handling, or worksheet/row addressing), the implementer must adjust this test to match the real output format — the intent (verify newest-first ordering end-to-end through both export formats) is what's load-bearing, not the exact regex.
- [ ] 3. Run `npm test`.
- [ ] 4. Commit: `git commit -m "Replace export.ts's descending sort with a reverse, and add export order tests"`.
- [ ] 5. Run `npm run build` once more as a final full-milestone sanity check across all four tasks.
