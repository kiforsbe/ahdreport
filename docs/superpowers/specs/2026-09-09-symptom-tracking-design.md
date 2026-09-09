# Symptom Tracking Design

**Status:** Approved for implementation

**Goal:** Import Apple Health symptom category events and present them as a first-class, read-only event stream with a timeline, optional overlays on numeric charts, descriptive same-day comparisons, detailed episode rows, and CSV/XLSX/PDF support.

## Product decisions

Symptoms are context events, not numeric metrics. They must not be added to the `Metric` union or forced through daily averages and numeric chart components. The existing numeric record pipeline remains unchanged; `HealthData` gains a separate `symptoms` collection.

The first release imports Apple Health symptom records only. Manual symptom entry is out of scope because the product currently treats imported data as read-only.

Symptoms appear as a dashboard group immediately before Vitals. A full-width symptom panel contains a frequency summary, an event timeline, and a descriptive association panel. Numeric charts expose an opt-in symptom overlay so the timeline remains readable when many events exist.

All analytical language is descriptive: “observed difference,” “symptom days,” and “associated with.” The UI must not claim causation, diagnosis, risk, or clinical significance.

## Data model

Add to `src/shared/types.ts`:

```ts
export type SymptomId =
  | "abdominalCramps"
  | "acne"
  | "appetiteChanges"
  | "bladderIncontinence"
  | "bloating"
  | "breastPain"
  | "chestTightnessOrPain"
  | "chills"
  | "constipation"
  | "coughing"
  | "diarrhea"
  | "dizziness"
  | "drySkin"
  | "fainting"
  | "fatigue"
  | "fever"
  | "generalizedBodyAche"
  | "headache"
  | "heartburn"
  | "hotFlashes"
  | "hairLoss"
  | "lossOfSmell"
  | "lossOfTaste"
  | "lowerBackPain"
  | "memoryLapse"
  | "menstrualCramps"
  | "moodChanges"
  | "nausea"
  | "nightSweats"
  | "pelvicPain"
  | "rapidPoundingOrFlutteringHeartbeat"
  | "runnyNose"
  | "shortnessOfBreath"
  | "sinusCongestion"
  | "skippedHeartbeat"
  | "soreThroat"
  | "sleepChanges"
  | "vaginalDryness"
  | "vomiting"
  | "wheezing";

export interface SymptomRecord {
  symptom: SymptomId;
  start: string;
  end: string;
  value: string;
  source?: string;
}
```

`HealthData` gains `symptoms: SymptomRecord[]`. `value` preserves the Apple Health category value, including presence, severity, or symptom-specific categories. Duration is derived from `end - start`, never guessed in the parser. A missing or invalid end time falls back to the start time as a point event.

The parser maps supported `HKCategoryTypeIdentifier...` symptom types to `SymptomId`, normalizes timestamps to ISO strings, deduplicates by symptom/start/end/value/source, and keeps symptom events sorted by start time. Symptoms count as imported records for diagnostics, but they do not enter `HealthData.records` or numeric metric metadata.

## Report calculations

Add pure helpers in `src/report.ts`:

- `symptomDays(symptoms, from, to)` groups events by calendar day and returns per-day symptom ids and episode count.
- `symptomSummary(symptoms)` returns total events, distinct symptom ids, distinct symptom days, and median duration in hours.
- `symptomEpisodes(symptoms)` returns sorted event rows with duration hours and a stable key.
- `symptomAssociations(symptoms, records)` compares daily medians for symptom days and non-symptom days for heart rate, resting heart rate, blood pressure, body temperature, sleep, and steps.

The association helper uses the existing daily aggregation semantics. It requires at least three symptom days and three comparison days for a metric; otherwise that comparison is returned as unavailable. It returns sample counts and raw differences so the UI can explain coverage. No significance tests, causal models, or medical thresholds are introduced.

## UI composition

Create focused components:

- `src/components/SymptomOverview.tsx`: summary values and the timeline/association panel.
- `src/components/SymptomTimeline.tsx`: aligned symptom lanes, duration bars, selection state, and accessible event labels.
- `src/components/SymptomAssociationPanel.tsx`: same-day comparison rows and the descriptive callout.
- `src/components/SymptomOverlay.tsx`: reusable chart marker rail for selected symptom ids.
- `src/components/tables/SymptomsReportTable.tsx`: detailed episode table.

The timeline uses one lane per symptom present in the selected range, with rounded duration bars. The selected symptom is highlighted; other lanes remain visible but muted. On numeric charts, selected symptoms render as translucent interval bands with dashed onset lines. The overlay is opt-in and capped to the selected symptom so charts do not become unreadable.

The detailed section adds `SymptomsReportTable` before the existing Vitals table. The Vitals table receives a compact symptom-context column only when symptom events exist. The complete event information remains in the dedicated symptom table rather than repeating long notes in every numeric row.

The section is omitted when no symptom data exists. When data exists but a comparison is underpowered, the UI says “Not enough symptom days for a comparison” rather than showing a misleading zero.

## Export and print

CSV rows gain a `recordType` field. Numeric rows use `measurement`; symptom rows use `symptom` and include symptom, start, end, duration, value, source, and blank numeric fields. Excel receives a dedicated Symptoms worksheet while preserving the existing measurements worksheet.

The PDF includes the symptom summary, timeline, association panel, and a bounded detailed episode table. The PDF layout uses the existing fixed chart dimensions and the same 90-day detailed-table limit, with a truncation note when necessary.

## Styling and copy

Use the existing AHDReport neutral surfaces and typography. Symptoms use a muted amber section accent, with blue and purple secondary series for additional lanes. Severity is expressed through opacity or border weight rather than a red alarm scale. Color is always paired with symptom text and event shape.

Required copy includes:

- “Symptoms”
- “Observed associations”
- “Symptom days”
- “Other days”
- “Descriptive comparison only; this does not establish causation or diagnosis.”

## Testing

Add parser tests for symptom mapping, interval normalization, category-value preservation, duplicate removal, and malformed dates. Add report tests for day grouping, duration, median summary, and association thresholds. Add component tests for empty state, selected-lane highlighting, overlay visibility, and detailed rows. Extend export tests to cover the record type and Symptoms worksheet.

## Scope exclusions

- Manual symptom entry or editing.
- Clinical diagnosis, severity scoring, alerts, or recommendations.
- Cross-day causal or predictive modeling.
- New HealthKit quantity types unrelated to symptom tracking.
