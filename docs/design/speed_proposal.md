# Performance optimization proposal

Status: Proposed  
Scope: Apple Health import, date filtering and aggregation, dashboard rendering,
and detailed-report rendering

## Summary

AHDReport already avoids several common performance problems: date inputs are
debounced, top-level filtered ranges are memoized, report tables are capped, Excel
support is loaded on demand, and derived daily data is cached for the lifetime of a
filtered record array.

The largest remaining opportunities are structural:

1. Do not mount detailed tables until the user asks to see them or PDF preparation
   requires them.
2. Index imported records once by metric and day instead of scanning the selected
   record array separately for every metric and aggregate type.
3. Use binary searches over the already sorted records to find date ranges.
4. Limit chart point counts to what can be displayed at the chart's pixel width.
5. Move import work off Electron's main thread and stream `export.xml` from XML or ZIP
   input.

The first four changes should be completed and measured before replacing the parser.
They are less invasive and directly address the delay between a completed import and
an interactive report. Streaming import is expected to provide the largest memory and
responsiveness improvement for very large exports, but it requires more extensive
correctness and security testing.

## Evidence

Local synthetic measurements taken during the investigation provide directional
baselines, not stable CI thresholds:

| Scenario | Current approach | Candidate approach |
|---|---:|---:|
| Four date ranges over 1,000,000 sorted records | 47.6 ms | 2.8 ms using binary bounds and slices |
| Grouping 500,000 records across 19 metrics | 45.2 ms | 22.4 ms using one indexing pass |
| Parsing 100,000 unique records from 16.1 MiB XML | 403 ms | Streaming version not yet measured |

The XML run increased retained heap by approximately 64 MiB and reached about 250 MiB
process RSS, although the RSS figure also includes construction of the synthetic input.
Real Apple Health exports may contain many more records and substantially more
unsupported XML content.

Code inspection also found that:

- four top-level date ranges are produced with full-array filtering;
- a new selected-range array creates a new report cache;
- each aggregate type can still scan the selected array once per metric;
- collapsed overview content is calculated even when closed;
- detailed tables are mounted in viewer mode and can create thousands of SVG nodes;
- chart series are not bounded by available display resolution;
- number and date formatters are repeatedly constructed while rendering;
- import materializes the input buffer, decompressed XML string, parsed XML object tree,
  and normalized records before returning data through IPC.

## Proposed work

### 1. Measurement and regression fixtures

Add deterministic synthetic XML and ZIP generators and a local performance harness.
Measure import phases, IPC transfer, first interactive render, date-range changes, DOM
node count, chart render time, PDF preparation, and peak memory. No real health data
may be added to the repository.

### 2. Low-risk filtering and rendering improvements

- Cache `Intl.NumberFormat` and day formatting helpers.
- Memoize present metrics and per-metric data spans.
- Replace full-array date filtering with lower and upper bounds over sorted dates.
- Lazily calculate collapsed overview cards.
- Lazily mount detailed viewer tables; always mount them for print layout.
- Add off-screen layout containment where it is compatible with printing.

### 3. Unified report index

Build a single per-session index containing metric records, present metrics, data
spans, daily statistics, daily totals, and daily averages. Components should consume a
range-specific report model produced from this index instead of independently deriving
the same data.

### 4. Bounded chart rendering

Cap screen and print chart series based on their rendered width. Use algorithms that
retain extrema for range charts and preserve the visual shape of continuous trends.
Tables and data exports must continue to use exact, unsampled values.

### 5. Worker-based streaming import

Pass the selected file path to a worker, stream the relevant ZIP entry, and parse
individual record elements without building a complete XML object tree. Preserve all
current validation, normalization, deduplication, sorting, diagnostics, and CDA patient
extraction behavior. Add progress reporting, cancellation, decompression limits, and a
temporary fallback to the existing parser during validation.

### 6. Optional compact transfer format

Profile worker-to-main and main-to-renderer serialization independently. If IPC cloning
remains material after streaming, dictionary-encode repeated strings and transfer
columnar numeric data. This step should only proceed with measured justification.

## Success criteria

- Imported values, daily aggregates, overview values, tables, CSV/XLSX exports, and PDF
  content remain equivalent for the same selected range.
- Date filters remain inclusive and correct across time zones and daylight-saving
  transitions.
- The Electron main process remains responsive during a large import.
- Initial viewer rendering does not mount the detailed report while it is closed.
- Long charts have a bounded number of rendered points or shapes.
- A one-million-record date-range update completes within 10 ms in the local synthetic
  model benchmark, excluding React rendering.
- Viewer DOM size and first interactive render time improve by at least 50% on the
  agreed large synthetic fixture.
- Streaming import materially reduces peak memory on the agreed ZIP fixture, with a
  target of at least 40% compared with the current parser.
- Existing tests, new equivalence tests, the production build, and PDF verification all
  pass.

## Constraints and non-goals

- Processing must remain local; no telemetry, cloud processing, or remote storage is
  introduced.
- Real Apple Health exports and patient details must never be used as committed test
  fixtures.
- Performance changes must not silently reduce report or export accuracy.
- Chart sampling is presentation-only and must be disclosed in developer documentation;
  exact source values remain available in tables and exports.
- The proposal does not add session persistence or a database.

## Recommended delivery order

1. Baselines and synthetic fixtures.
2. Formatter, metadata, binary-range, and lazy-rendering changes.
3. Unified per-session report index.
4. Chart point limiting and viewer table virtualization if still needed.
5. Worker isolation.
6. Streaming XML and ZIP processing.
7. Compact IPC representation only if profiling shows a remaining bottleneck.

Each stage should be independently reviewable and benchmarked. Detailed implementation
steps and acceptance gates are defined in `plan.md`.
