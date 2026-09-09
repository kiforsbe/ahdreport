# Changelog

All notable changes to AHDReport are documented in this file.

## [Unreleased]

### Changed

- Added read-only Apple Health symptom tracking with duration-aware timelines,
  optional numeric-chart overlays, descriptive same-day comparisons, detailed
  episode rows, and CSV/XLSX export support.
- Cached the `Intl.NumberFormat`/`Intl.DateTimeFormat` instances behind
  `format()`/`formatDate()` in `report.ts` instead of constructing them on
  every call, and routed table rows and chart tooltips through the shared
  `formatDate()` helper.
- Replaced per-metric `dataSpan()` scans with a single-pass `rangeMetadata()`
  traversal shared by all report tables and the blood pressure chart.
- Replaced the selected-date-range filter's linear scan with an O(log n)
  binary search (`recordRange()`), relying on the parser's ascending date
  sort.
- Replaced the CSV/XLSX export's descending sort with a plain array
  reverse; equal-timestamp records are now emitted in reverse-of-input
  order rather than the previous date-stable order.

## [0.3.0] - 2026-08-10

### Added

- Blood pressure classification against Swedish (ESC/ESH) and AHA hypertension
  category schemes, with a period-average hypertension warning surfaced at the
  top of the Vitals section.
- Pulse pressure and mean arterial pressure (MAP) chart panel.
- Outlier call-outs (Tukey-fence based) on trend, range, carbohydrate, and blood
  pressure charts, shown as on-chart labels at each flagged point.
- Plateau (change-point) segmentation overlays on noisy metric and carbohydrate
  charts.
- Physiological-plausibility filtering for implausible records during Apple
  Health import.

### Changed

- Blood pressure chart redesigned: hypertension level now plots as a
  secondary-axis step line integrated into the chart itself, and the
  period-average call-out moved above the chart grid as a section-level
  warning.
- Nutrition report table's daily bars narrowed to fit five metric columns.
- `App.tsx` split into focused modules (charts, tables, and shared state) for
  maintainability.

## [0.2.0] - 2026-08-10

### Added

- Nutrition tracking: dietary energy, carbohydrates, sugar, fiber, protein, and
  fat import mapping from Apple Health, with dedicated dashboard charts.
- Daily-total (cumulative) aggregation option for `daily()`, powering stacked
  daily-total nutrition charts.
- Detailed daily nutrition report table, with sugar shown as a nested sub-value
  under carbohydrates.

### Changed

- Chart ordering, series colors, and axis scaling adjustments across the
  dashboard.

## [0.1.0] - 2026-08-06

### Added

- Local Apple Health XML and ZIP import with supported metric mapping, validation,
  duplicate removal, and import diagnostics.
- CDA/clinical demographic extraction and runtime patient-default support.
- Editable patient details, selectable report periods, overview cards, daily charts,
  detailed measurement tables, and A4 PDF reporting.
- Daily min–max range charts with average ticks and overall-average guides for blood
  pressure, heart rate, walking speed, step length, walking asymmetry, and double
  support.
- Split export control with standard PDF, compact PDF, CSV, and Excel (`.xlsx`) output.
- Compact PDF chart rasterization at high resolution and a PDF-specific detailed-table
  cap to reduce export file size.
- Patient summary headers, print dates, and page numbers in PDF output.
- Parser and report-level Vitest coverage using synthetic data.

### Privacy and security

- Local-first operation with no account, server, telemetry, or cloud upload path.
- Sandboxed renderer with a narrow preload bridge; native dialogs and filesystem access
  stay in the Electron main process.

[0.3.0]: https://github.com/kiforsbe/ahdreport/releases/tag/v0.3.0
[0.2.0]: https://github.com/kiforsbe/ahdreport/releases/tag/v0.2.0
[0.1.0]: https://github.com/kiforsbe/ahdreport/releases/tag/v0.1.0
