# Changelog

All notable changes to AHDReport are documented in this file.

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

[0.1.0]: https://github.com/kiforsbe/ahdreport/releases/tag/v0.1.0
