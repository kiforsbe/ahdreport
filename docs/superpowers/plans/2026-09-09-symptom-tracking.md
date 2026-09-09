# Symptom Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Apple Health symptom events and present them in the dashboard, charts, detailed report, PDF, CSV, and Excel exports.

**Architecture:** Keep numeric `HealthRecord` data unchanged and add a separate `SymptomRecord[]` collection to `HealthData`. Pure helpers in `src/report.ts` derive summaries, daily symptom coverage, episodes, and descriptive same-day comparisons. React components render a full-width symptom section and pass a selected symptom id to chart overlays without coupling symptom logic to Recharts internals.

**Tech Stack:** TypeScript, React 19, Recharts, Vitest, JSZip, Electron Apple Health XML parser.

**Spec:** `docs/superpowers/specs/2026-09-09-symptom-tracking-design.md`

## Global Constraints

- Symptoms are read-only Apple Health imports; no manual symptom entry.
- Symptoms remain separate from the numeric `Metric` union and numeric `HealthRecord` pipeline.
- Analytical copy must use descriptive association language and must not imply causation or diagnosis.
- Existing numeric charts, tables, exports, PDF preparation, and unrelated working-tree changes must remain functional.
- New production behavior is implemented test-first: each new test must fail for the intended missing behavior before implementation is written.

---

### Task 1: Add symptom types and parser support

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `electron/appleHealthParser.ts`
- Test: `tests/appleHealthParser.test.ts`

**Interfaces:**
- Produces `SymptomId`, `SymptomRecord`, and `HealthData.symptoms`.
- Produces parser support for the Apple Health symptom identifiers listed in the spec.

- [ ] **Step 1: Write the failing parser tests**

Add a synthetic XML fixture containing a headache interval, a dizziness point event, an exact duplicate, an unknown type, and an invalid-date symptom. Assert that the result has normalized `start`/`end` ISO timestamps, preserved category `value`, source, duplicate removal, and one skipped unsupported record. Assert `result.symptoms` is sorted by start time and malformed dates are not included.

- [ ] **Step 2: Run the parser tests and verify the expected failure**

Run: `npm test -- tests/appleHealthParser.test.ts`

Expected: FAIL because `HealthData.symptoms` and symptom parsing do not exist.

- [ ] **Step 3: Add the shared symptom model**

Add the `SymptomId` union, `SymptomRecord` interface, and `symptoms: SymptomRecord[]` property. Keep `HealthRecord` numeric and do not add symptoms to `Metric`.

- [ ] **Step 4: Add the parser type map and event normalization**

Add a `symptomTypeMap` for the supported `HKCategoryTypeIdentifier...` values. For each mapped row, parse `startDate` and `endDate`, use `startDate` when `endDate` is absent, preserve `r.value` as a string, and deduplicate using `symptom|start|end|value|source`. Sort the symptom collection independently by `start` and return it alongside numeric records.

- [ ] **Step 5: Run parser tests and the full existing suite**

Run: `npm test -- tests/appleHealthParser.test.ts`

Expected: PASS for the new parser cases.

Run: `npm test`

Expected: the original 90 tests plus the new parser tests pass.

- [ ] **Step 6: Commit the task when Git metadata is writable**

```bash
git add src/shared/types.ts electron/appleHealthParser.ts tests/appleHealthParser.test.ts
git commit -m "feat: import Apple Health symptom events"
```

If the managed checkout still blocks `.git` writes, leave the files unstaged and record that limitation in the final report.

### Task 2: Add pure symptom report helpers

**Files:**
- Modify: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- `symptomLabel(symptom: SymptomId): string`
- `symptomSummary(symptoms: SymptomRecord[]): { episodeCount: number; symptomCount: number; symptomDays: number; medianDurationHours?: number; bySymptom: { symptom: SymptomId; episodes: number; days: number; durationHours: number }[] }`
- `symptomDays(symptoms: SymptomRecord[], from: string, to: string): { date: string; symptoms: SymptomId[]; episodeCount: number }[]`
- `filteredSymptoms(symptoms: SymptomRecord[], from: string, to: string): SymptomRecord[]`
- `symptomEpisodes(symptoms: SymptomRecord[]): (SymptomRecord & { durationHours: number; key: string })[]`
- `symptomAssociations(symptoms: SymptomRecord[], records: HealthRecord[]): { metric: Metric; label: string; symptomDays: number; otherDays: number; symptomMedian?: number; otherMedian?: number; difference?: number; unit?: string }[]`

- [ ] **Step 1: Write failing tests for summaries and episodes**

Use three symptom events spanning two days, including one multi-day interval and one point event. Assert distinct symptom-day grouping, episode count, median duration, stable episode keys, and chronological duration calculation.

- [ ] **Step 2: Run the focused report tests and verify failure**

Run: `npm test -- tests/report.test.ts`

Expected: FAIL because the new helpers are not exported.

- [ ] **Step 3: Implement labels, duration, grouping, and summary helpers**

Add a complete human-readable label map for all `SymptomId` values. Use `Date.parse(end) - Date.parse(start)` for duration, clamp negative durations to zero, expand intervals across calendar days for `symptomDays`, and return newest-first episode rows for display.

- [ ] **Step 4: Write failing tests for association thresholds**

Create records for heart rate, sleep, and steps over at least six days. Assert that symptom-day medians and other-day medians are returned when both groups contain at least three days, and that a metric with fewer than three comparison days has `difference === undefined`.

- [ ] **Step 5: Implement same-day descriptive associations**

Aggregate numeric records by day using the existing `daily` helper. Mark a day as a symptom day if any symptom interval touches that calendar day. Compare medians for heart rate, resting heart rate, systolic pressure, diastolic pressure, body temperature, sleep, and steps. Return counts, units, and differences without p-values or causal interpretation.

- [ ] **Step 6: Run report tests and the full suite**

Run: `npm test -- tests/report.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit the task when possible**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat: calculate symptom summaries and associations"
```

### Task 3: Extend CSV and Excel exports

**Files:**
- Modify: `src/export.ts`
- Modify: `src/App.tsx`
- Test: `tests/export.test.ts`

**Interfaces:**
- `createCsv(records: HealthRecord[], symptoms?: SymptomRecord[]): string`
- `createExcel(records: HealthRecord[], symptoms?: SymptomRecord[]): Promise<string>`

- [ ] **Step 1: Write failing export tests**

Assert that CSV has a `Record type` column and includes a `symptom` row with symptom label, start, end, duration, value, and source. Assert that Excel contains a `Symptoms` worksheet and a symptom data row while preserving the existing measurement sheet.

- [ ] **Step 2: Run export tests and verify failure**

Run: `npm test -- tests/export.test.ts`

Expected: FAIL because the current export signatures only accept numeric records and emit one worksheet.

- [ ] **Step 3: Implement combined CSV rows**

Keep numeric rows backward-compatible, add `recordType`, and append symptom rows in newest-first order. Use `symptomLabel` and duration hours formatted to one decimal place. Update `App.tsx` to pass `data.symptoms` into both export calls.

- [ ] **Step 4: Implement the Symptoms worksheet**

Create `sheet2.xml`, update workbook relationships and content types, and keep the existing `Health data` worksheet unchanged. Add headers `Start`, `End`, `Symptom`, `Duration (h)`, `Value`, and `Source`.

- [ ] **Step 5: Run export tests and the full suite**

Run: `npm test -- tests/export.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit the task when possible**

```bash
git add src/export.ts src/App.tsx tests/export.test.ts
git commit -m "feat: export symptoms to CSV and Excel"
```

### Task 4: Build the symptom timeline and association components

**Files:**
- Create: `src/components/SymptomTimeline.tsx`
- Create: `src/components/SymptomAssociationPanel.tsx`
- Create: `src/components/SymptomOverview.tsx`
- Test: `tests/symptomComponents.test.tsx`

**Interfaces:**
- `SymptomOverview({ symptoms, records, from, to, printLayout, onSelectedSymptomChange, selectedSymptom })`
- `SymptomTimeline({ symptoms, from, to, selectedSymptom, onSelectedSymptomChange })`
- `SymptomAssociationPanel({ symptoms, records })`

- [ ] **Step 1: Write failing component tests**

Render `SymptomOverview` with synthetic events and records. Assert summary labels, one lane per symptom, duration text, “Observed associations,” the causation disclaimer, empty-state behavior, and that selecting a lane calls the selection callback.

- [ ] **Step 2: Run the component tests and verify failure**

Run: `npm test -- tests/symptomComponents.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the timeline**

Render an accessible section with a date axis and one lane per present symptom. Position interval bars from the selected range start/end, use stable amber/blue/purple accents for the first three lanes, mute unselected lanes, and expose event details through accessible text.

- [ ] **Step 4: Implement the association panel**

Render comparison rows only when `difference` is available. Show sample counts and the descriptive callout. Use “Symptom days” and “Other days” labels and suppress underpowered metrics with “Not enough symptom days for a comparison.”

- [ ] **Step 5: Implement the overview shell**

Render summary values, the timeline, the association panel, and an opt-in checkbox for chart overlays. Keep selected symptom state in `App` so chart overlays and the timeline stay synchronized.

- [ ] **Step 6: Add focused styles and run tests**

Add symptom-specific rules to `src/styles.css` for summary cards, lanes, event bars, association rows, and responsive stacking. Run the focused component tests and then `npm test`.

- [ ] **Step 7: Commit the task when possible**

```bash
git add src/components/SymptomTimeline.tsx src/components/SymptomAssociationPanel.tsx src/components/SymptomOverview.tsx src/styles.css tests/symptomComponents.test.tsx
git commit -m "feat: add symptom timeline and association view"
```

### Task 5: Add chart overlays and detailed symptom table

**Files:**
- Create: `src/components/SymptomOverlay.tsx`
- Create: `src/components/tables/SymptomsReportTable.tsx`
- Modify: `src/components/charts/MetricChart.tsx`
- Modify: `src/components/charts/RangeMetricChart.tsx`
- Modify: `src/components/tables/VitalsReportTable.tsx`
- Test: `tests/symptomOverlay.test.tsx`
- Test: `tests/detailedReportLazy.test.tsx`

**Interfaces:**
- `SymptomOverlay({ symptoms, from, to, selectedSymptom, visible })`
- `SymptomsReportTable({ symptoms, records, printLayout, from, to })`
- Numeric charts receive optional `symptoms`, `selectedSymptom`, and `showSymptomOverlay` props.

- [ ] **Step 1: Write failing tests**

Assert that the overlay renders no marks when disabled, renders interval/onset marks for the selected symptom when enabled, and that `SymptomsReportTable` renders symptom, duration, value, and same-day context. Assert the lazy detailed report includes the symptom table when opened.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/symptomOverlay.test.tsx tests/detailedReportLazy.test.tsx`

Expected: FAIL because the overlay and table do not exist and chart props are not wired.

- [ ] **Step 3: Implement the overlay**

Use a Recharts-compatible `ReferenceArea` for selected symptom intervals and `ReferenceLine` for onsets where chart rows have matching calendar dates. Keep the overlay off in print layout unless the chart has fixed PDF dimensions. Add a small legend/copy line explaining the marks.

- [ ] **Step 4: Thread overlay props through chart components**

Update `MetricChart` and `RangeMetricChart` signatures and their callers. Preserve current memoization and all existing chart behavior when symptom props are absent.

- [ ] **Step 5: Implement the detailed table**

Use the existing 365-row viewer and 90-row PDF limits. Render newest-first episodes, duration, preserved category value, source, and compact numeric context for matching days. Add truncation notes with `TableNotes`.

- [ ] **Step 6: Run focused tests and the full suite**

Run: `npm test -- tests/symptomOverlay.test.tsx tests/detailedReportLazy.test.tsx`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit the task when possible**

```bash
git add src/components/SymptomOverlay.tsx src/components/tables/SymptomsReportTable.tsx src/components/charts/MetricChart.tsx src/components/charts/RangeMetricChart.tsx src/components/tables/VitalsReportTable.tsx tests/symptomOverlay.test.tsx tests/detailedReportLazy.test.tsx
git commit -m "feat: connect symptoms to charts and detailed report"
```

### Task 6: Integrate the selected symptom range into App, PDF, docs, and diagnostics

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/OverviewCards.tsx` only if a symptom summary card is needed for the existing overview layout
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CHANGELOG.md`
- Test: `tests/report.test.ts`
- Test: `tests/export.test.ts`

- [ ] **Step 1: Write failing integration assertions**

Add tests for `HealthData` fixtures containing symptoms, selected-range filtering through `filteredSymptoms`, empty symptom states, and the fact that existing numeric group presence logic remains unchanged.

- [ ] **Step 2: Implement App state and filtering**

Memoize `symptoms = filteredSymptoms(data.symptoms, from, to)`, store the selected symptom id and overlay visibility in local state, render `SymptomOverview` before the dashboard, and pass the selected symptom props to charts. Reset selection when the selected symptom disappears from the range.

- [ ] **Step 3: Add the detailed report and PDF path**

Render `SymptomsReportTable` before `VitalsReportTable` inside the existing lazy disclosure. Ensure print mode force-mounts it and that the timeline and association panel have fixed, print-safe output without responsive containers that would break PDF readiness checks.

- [ ] **Step 4: Update docs and supported-function copy**

Add Symptoms to the README supported-data table, describe event duration and descriptive comparisons, update the architecture data-flow and visualization sections, and add a changelog entry.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all commands exit 0; the existing unrelated documentation changes remain present and no generated files are added.

- [ ] **Step 6: Commit the task when possible**

```bash
git add src/App.tsx src/styles.css README.md docs/ARCHITECTURE.md CHANGELOG.md tests/report.test.ts tests/export.test.ts
git commit -m "feat: integrate symptom tracking across reports"
```

## Plan self-review

- Spec coverage: parser/model is Task 1; report calculations are Task 2; CSV/XLSX are Task 3; dashboard visual design is Task 4; chart/detail integration is Task 5; App/PDF/docs are Task 6.
- Placeholder scan: no `TODO`, `TBD`, or unspecified “handle edge cases” steps are used.
- Type consistency: `SymptomRecord`, `SymptomId`, selected symptom props, export arguments, and report helper signatures are named consistently across tasks.
- Scope check: manual entry, diagnosis, predictive modeling, and unrelated HealthKit quantities are explicitly excluded.
