# Detailed performance implementation plan

Status: Draft for implementation  
Related proposal: `proposal.md`

## 1. Objective

Improve the speed and responsiveness of Apple Health import, report-period filtering,
aggregation, chart rendering, and detailed-table rendering without changing clinical
values, supported record behavior, privacy properties, or exported content.

The work is intentionally divided into independently measurable milestones. Later
milestones, especially parser replacement and compact IPC transfer, must not begin only
because they appear theoretically faster. They require profiles showing that the
preceding work left a meaningful bottleneck.

## 2. Current behavior and constraints

### Import

The Electron main process reads the entire selected file into a `Buffer`. ZIP imports
are loaded by JSZip, `export.xml` is decompressed into a complete string, and
`fast-xml-parser` creates a complete object tree. Supported records are then normalized,
deduplicated, and sorted before the resulting object array is returned through Electron
IPC.

This creates overlapping representations of the same data and performs CPU-heavy XML
work on Electron's main thread. CDA extraction is already partially streamed and stops
after `recordTarget`; that behavior should be retained.

### Filtering and aggregation

Parser records are globally sorted in ascending ISO timestamp order. Filtering uses
lexical ISO comparisons, but scans the full array. App state produces selected, 30-day,
365-day, and all-time arrays. A `WeakMap` caches daily derivations for each array, but a
date change creates a new array and cache, and each aggregate type still builds its own
per-metric result.

### Rendering

The dashboard and detailed report share one React tree. Detailed tables are always
mounted in viewer mode and may contain hundreds of rows per section. Many cells contain
custom SVG visualizations. Recharts receives every selected day, including multi-year
ranges. Closed overview `<details>` elements still have their card values calculated.

PDF preparation deliberately switches to a fixed-width chart tree and waits for chart
readiness. Any lazy-mounting or containment work must preserve this synchronization.

### Repository and privacy constraints

- Keep processing local.
- Use only deterministic synthetic data in committed fixtures and benchmarks.
- Preserve sandboxing, context isolation, and the narrow preload API.
- Do not add arbitrary renderer filesystem access.
- Preserve exact raw data for tables and CSV/XLSX export.
- Maintain compatibility with standalone XML and Apple Health ZIP input.

## 3. Performance model and measurements

### 3.1 Fixture matrix

Create a deterministic generator rather than storing large generated XML files. It
must accept a seed and record count and produce repeatable timestamps and values.

Generate these standard scenarios:

| Fixture | Records | Composition | Purpose |
|---|---:|---|---|
| Small | 10,000 | All supported metric families | Correctness and quick local runs |
| Medium | 100,000 | Supported, unsupported, duplicates, sleep | Routine profiling |
| Large | 500,000 | Representative metric distribution | Render and aggregation profiling |
| Stress | 1,000,000+ | Configurable XML and ZIP | Manual memory and responsiveness testing |

ZIP fixtures should optionally include a small synthetic CDA document. Values must be
obviously fictional and contain no real identifiers.

### 3.2 Instrumented phases

Capture the following durations independently:

1. File read or stream open.
2. ZIP discovery and decompression.
3. XML parsing.
4. normalization, validation, deduplication, and sorting.
5. report-index construction.
6. worker-to-main transfer, when applicable.
7. main-to-renderer IPC transfer.
8. React state commit.
9. first interactive dashboard render.
10. detailed-report expansion.
11. date-range update to committed render.
12. print-layout preparation and PDF generation.

Also capture:

- process RSS and heap before import, at peak where measurable, and after import;
- renderer DOM element and SVG counts;
- long tasks over 50 ms in the renderer and main process;
- chart point/shape counts;
- selected-record and daily-row counts.

Development timing can use `performance.mark` and `performance.measure`, guarded so it
does not expose patient content or add telemetry. Prefer returning aggregate timings to
the development console or benchmark runner rather than changing the normal UI.

### 3.3 Baseline record

Record the machine, operating system, Node version, Electron version, build mode, input
shape, and five-run median. Keep raw timing observations in the ignored temporary-plan
directory or another explicitly local location. Do not impose tight CI performance
thresholds on shared runners; use correctness tests in CI and broad regression checks
where timing stability is sufficient.

### 3.4 Initial acceptance gate

Before optimization begins:

- all existing tests pass;
- a production build succeeds;
- the four fixture sizes can be generated deterministically;
- medium and large baselines are recorded;
- import and render phases can be distinguished rather than measured as one total.

## 4. Milestone 1: low-risk hot-path improvements

### 4.1 Reuse number and date formatters

Create module-level or memoized formatter caches keyed by the required decimal count and
locale. Reuse a day-only `Intl.DateTimeFormat` for repeated table dates and tooltip
labels.

Implementation requirements:

- preserve current locale-aware display;
- preserve fixed decimals where `decimalsByMetric` requires them;
- do not cache final formatted values by health reading, which could grow without bound;
- add tests covering zero, negative, fractional, and unit-bearing values.

Acceptance:

- formatter construction is bounded by the number of supported decimal configurations,
  not the number of rendered cells;
- existing formatting tests and snapshots remain equivalent.

### 4.2 Memoize metric presence and data spans

For each selected range, derive in one pass:

```ts
interface RangeMetadata {
  presentMetrics: Set<Metric>;
  spanByMetric: Map<Metric, { earliest: string; latest: string }>;
}
```

Use this metadata for group visibility, medication presence, blood-pressure presence,
and coverage notes. Remove repeated `records.some`, `filter`, and `map` calls from render
paths.

Acceptance:

- a selected-range render performs one metadata traversal;
- missing metric, partial coverage, and medication messages remain unchanged;
- unit tests cover empty input and a metric whose available dates are narrower than the
  selected period.

### 4.3 Binary date-range lookup

Add tested lower-bound and upper-bound helpers for the globally sorted record array.
Use normalized ISO boundary strings and retain inclusive From/To behavior.

Suggested API:

```ts
interface RecordRange {
  start: number;
  end: number; // exclusive
}

function recordRange(
  records: readonly HealthRecord[],
  from: string,
  to: string,
): RecordRange;
```

Initially, keep `filtered()` compatible by returning `records.slice(start, end)`. Later
report-model code may consume the bounds directly to avoid copying all-time ranges.

Correctness cases:

- empty records;
- no From or no To value;
- both boundaries absent;
- multiple readings exactly at midnight and at the end of the selected day;
- no records within the range;
- range outside the dataset;
- daylight-saving transition days;
- invalid UI dates handled consistently with current behavior;
- duplicate timestamps.

Acceptance:

- results are property-tested against the existing linear implementation on generated
  sorted data;
- one million records and four representative ranges complete within 10 ms on the
  baseline development machine, excluding array allocation where bounds are consumed
  directly;
- record ordering is unchanged.

### 4.4 Avoid needless descending export sorts

The selected records remain sorted ascending. CSV and XLSX export currently clone and
sort them descending. Replace the sort with reverse index iteration or `toReversed()`
when a materialized array is genuinely required.

Acceptance:

- exported records remain newest-first;
- equal-timestamp ordering stays deterministic;
- CSV and XLSX tests cover the first and last exported records.

## 5. Milestone 2: defer and contain rendering

### 5.1 Lazy collapsed overview cards

Create a small controlled disclosure component that tracks whether it has been opened.
Do not calculate the 365-day and all-time card summaries until their respective
disclosures are open. Decide whether values remain mounted after the first opening; the
default should retain them to make repeated toggling instant.

When print layout requires these cards, explicitly define whether closed summaries are
part of the PDF. Preserve current output unless a separate product decision changes it.

Acceptance:

- initial viewer render calculates only the visible 30-day cards;
- opening a disclosure calculates the correct values once;
- changing the report end date invalidates any affected opened summary;
- keyboard and screen-reader behavior remains equivalent to native `<details>`.

### 5.2 Lazy detailed report

In viewer mode, show a "Detailed measurements" disclosure or explicit action and do not
mount its tables until opened. During PDF preparation, mount the detailed report
regardless of viewer disclosure state.

The implementation must coordinate with `healthAtlasPrintLayout`:

1. set print layout synchronously;
2. ensure detailed tables and fixed-size charts are committed;
3. await fonts and animation frames;
4. perform existing chart readiness checks;
5. generate the PDF;
6. restore the previous viewer disclosure state.

Acceptance:

- the closed viewer DOM contains no detailed table rows or cell SVGs;
- opening the report renders exact existing content;
- PDF content is independent of whether the viewer disclosure was open;
- canceling or failing PDF export restores viewer state;
- accessibility focus does not jump unexpectedly when content mounts.

### 5.3 Off-screen containment

Evaluate `content-visibility: auto` and `contain-intrinsic-size` for dashboard panels and
mounted report sections. Disable or override containment in print layout so Chromium
does not omit off-screen printable content.

Acceptance:

- scrolling has no large layout jumps;
- browser find and accessibility behavior remain acceptable;
- all printable content appears in vector and compact PDF modes.

### 5.4 Component memoization

After derived models have stable object identities, wrap expensive chart and table
sections with `React.memo`. Avoid premature custom equality functions. State changes to
notices or export menus should not reconstruct unchanged report rows.

Acceptance:

- React profiling shows unchanged charts and tables do not commit when only a notice
  changes;
- date-range and print-layout changes still update all affected content.

### 5.5 Virtualization decision gate

Measure detailed-report expansion after lazy mounting. If expansion or scrolling still
misses the agreed target, introduce viewer-only row virtualization or pagination.
Printing must use the full bounded table data and cannot use a virtualized viewport.

Prefer the least complex solution that meets the target:

1. lazy mounting plus containment;
2. pagination;
3. semantic-table-compatible virtualization;
4. a separate viewer grid only if necessary.

## 6. Milestone 3: unified report index

### 6.1 Data structure

Build one index for an imported session. A possible shape is:

```ts
interface MetricIndex {
  records: HealthRecord[];
  earliest?: string;
  latest?: string;
  dailyAverage: DailyAverage[]; // canonical ascending order
  dailyTotals: DailyTotal[];    // canonical ascending order
  dailyStats: DailyStats[];     // canonical ascending order
}

interface HealthIndex {
  records: HealthRecord[];      // global ascending order
  metrics: Map<Metric, MetricIndex>;
  presentMetrics: Set<Metric>;
}
```

Do not automatically store three independent copies of every daily value. During the
design spike, determine whether a canonical daily-stat object can expose average and
total projections without duplicated arrays. Activity metrics need totals; many other
metrics need averages or distributions.

### 6.2 One-pass construction

Traverse normalized records once to:

- append to the per-metric record list;
- establish earliest and latest timestamps;
- group readings by day;
- accumulate count, sum, minimum, maximum, and values required for standard deviation
  and day trace;
- accumulate daily totals where appropriate;
- establish the set of present metrics.

Because input records are globally sorted, per-metric and per-day insertion order is
already chronological. Avoid sorting again unless parser equivalence tests prove that
the assumption can be violated.

For standard deviation, use a numerically stable online algorithm such as Welford's
method. Preserve the current population standard deviation definition.

### 6.3 Range-specific report model

Introduce a pure selector that turns `HealthIndex` and From/To boundaries into a model
consumed by the UI:

```ts
interface ReportModel {
  recordBounds: RecordRange;
  metadata: RangeMetadata;
  seriesByMetric: Map<Metric, MetricSeries>;
  overview: {
    last30: OverviewSummary;
    last365?: OverviewSummary;
    allTime?: OverviewSummary;
  };
}
```

Daily arrays are sorted, so range selection should also use binary bounds. Avoid
filtering raw records to determine chart and table content.

Exact median calculation still requires values for the requested overview interval.
Use the much smaller per-metric record list rather than scanning all metrics. Do not
introduce approximate medians without a separate product decision.

### 6.4 Component migration

Migrate consumers incrementally:

1. presence checks and coverage notes;
2. overview cards;
3. simple area charts;
4. range charts and blood pressure;
5. detailed tables;
6. CSV/XLSX record selection.

Keep compatibility wrappers around current report helpers until all consumers and tests
have moved. Remove the `WeakMap` cache only after profiling confirms it is redundant.

### 6.5 Correctness gate

For generated datasets, compare old and new implementations for:

- selected raw record identity and order;
- latest value and change;
- exact median;
- daily average and total;
- minimum, maximum, average, and population standard deviation;
- day-trace reading order;
- earliest and latest availability;
- empty and single-reading days.

All comparisons should include multiple sources, equal timestamps, duplicates that have
already passed parser deduplication, and metrics using different aggregation semantics.

## 7. Milestone 4: bounded chart work

### 7.1 Establish point budgets

Use actual chart width when available and deterministic fixed widths in print mode.
Start with a target near one to two horizontal samples per pixel, capped to a sensible
upper bound established by profiling. Do not downsample when the source series is below
the budget.

### 7.2 Sampling by chart type

- Area trends: use Largest-Triangle-Three-Buckets or an equivalent shape-preserving
  method.
- Daily range charts: bucket adjacent days while retaining the lowest minimum, highest
  maximum, and a count-weighted average.
- Blood pressure: keep systolic and diastolic observations aligned by bucket.
- Sparse medication or event-like metrics: avoid interpolation and retain discrete
  events.

Sampling must be deterministic for the same width, data, and range.

### 7.3 Exact-data boundary

Sampled values are allowed only in chart presentation. Tooltips must make sense for a
bucketed point, and developer documentation should state when aggregation occurs.
Detailed tables, overview calculations, CSV, XLSX, and raw record selection remain
exact.

### 7.4 Acceptance

- no screen or print chart renders more than the agreed point budget;
- first and last dates are retained;
- significant extrema are retained in test datasets;
- the overall average is computed from exact daily values, not an unweighted average of
  sampled buckets;
- PDF chart readiness and compact rasterization continue to pass;
- visual review covers 7-day, 365-day, and multi-year selections.

## 8. Milestone 5: worker-isolated import

### 8.1 Worker boundary

Create a Node worker owned by the Electron main process. Pass it the selected file path
and non-sensitive parser options; do not read the entire file in the main process first.

Worker messages should be a small explicit protocol:

```ts
type ImportWorkerRequest = {
  id: string;
  path: string;
};

type ImportWorkerMessage =
  | { id: string; type: "progress"; phase: string; completed?: number; total?: number }
  | { id: string; type: "result"; data: HealthData }
  | { id: string; type: "error"; error: SerializedImportError };
```

Avoid including record content in logs or progress messages.

### 8.2 Lifecycle and cancellation

- Cancel the active worker if the window closes.
- Prevent stale results from replacing a newer import.
- Terminate the worker after completion or reuse it only if profiling justifies the
  additional lifecycle complexity.
- Convert worker failures into the existing user-facing error behavior.
- Ensure canceling the file dialog creates no worker.

### 8.3 UI progress

Expose coarse progress through the narrow preload bridge only if it materially improves
the experience. A simple indeterminate "Importing" state is acceptable before byte or
record totals are available. Do not add high-frequency IPC messages; throttle progress
updates.

### 8.4 Acceptance

- the Electron main event loop remains responsive during the stress import;
- application window movement, cancellation, and error display remain functional;
- worker output is equivalent to the current parser for the complete fixture suite;
- no health content is written to temporary files or logs;
- packaged and development builds can locate the worker script.

## 9. Milestone 6: streaming XML and ZIP import

### 9.1 Library evaluation

Evaluate maintained streaming XML and ZIP libraries using these criteria:

- Node 22 and Electron compatibility;
- TypeScript support;
- ability to stream one ZIP entry without inflating the entire archive;
- explicit size and error handling;
- no network or native runtime dependency;
- acceptable maintenance and security posture;
- measurable performance on the medium and stress fixtures.

`fast-xml-parser` may remain for the small CDA fragment, but the main `export.xml` path
requires an event-driven or SAX-style parser.

### 9.2 Standalone XML path

Read the selected file as a stream. Validate the root and react only to record elements
and the minimum metadata needed for diagnostics. Unsupported types should increment the
diagnostic counter without creating a general-purpose XML node object.

For every supported record:

1. map the HealthKit type;
2. validate timestamps and values;
3. convert sleep intervals;
4. normalize timestamps and units;
5. deduplicate using current key semantics;
6. append to the normalized collection or index builder;
7. update diagnostics.

### 9.3 ZIP path

Open the archive from its path, locate `export.xml` case-insensitively using current path
rules, and stream its decompressed bytes into the same record parser. Locate the first
matching clinical candidate and retain the early-stop `recordTarget` behavior.

Do not inflate unrelated archive entries.

### 9.4 Safety limits

Define and test configurable internal limits for:

- compressed file size;
- expanded bytes for `export.xml`;
- record count;
- per-element attribute length;
- CDA fragment size;
- ZIP entry count and suspicious compression ratios;
- malformed or deeply nested XML.

Limits must produce clear errors. They should accommodate realistic large Apple exports
and be documented before release.

Disable external entity resolution and any network-backed XML feature. Treat selected
files as untrusted even though they are local.

### 9.5 Ordering and deduplication

Do not assume Apple input order is guaranteed unless that invariant is documented and
tested. Retain a final numeric timestamp sort initially. Profile radix-like or chunked
sorting only if the sort becomes a significant share after streaming.

Avoid constructing large interpolated deduplication strings if profiling shows them to
be costly. A nested map or stable hash is acceptable only when exact collision behavior
is tested.

### 9.6 Parser migration

Keep the existing parser as a development fallback while comparing outputs. Add a
temporary opt-in switch that is not exposed as a permanent user feature. Remove the old
path and the switch after equivalence, performance, ZIP, and packaging gates pass.

### 9.7 Acceptance

- every existing parser test passes against the streaming implementation;
- generated property tests compare current and streaming output;
- diagnostics, warnings, patient fields, ordering, units, sleep values, and duplicate
  removal match;
- malformed XML, missing `export.xml`, truncated ZIP, and limit violations fail safely;
- peak memory falls by at least 40% on the agreed large ZIP baseline;
- import time does not regress materially on small input and improves on large input;
- the main process remains responsive because parsing runs in the worker.

## 10. Milestone 7: optional compact data transfer

This milestone is conditional. First measure worker-to-main transfer, main-to-renderer
transfer, and renderer object creation after streaming and indexing.

Proceed only if serialization or retained renderer data remains a significant part of
import time or memory.

### 10.1 Candidate representation

Use dictionary tables for repeated strings and typed columns for repeated numeric data:

```text
metricIds:    Uint8Array or Uint16Array
timestamps:   Float64Array
values:       Float64Array
unitIds:      Uint16Array
sourceIds:    Uint16Array or Uint32Array
categoryIds:  typed array with a missing-value sentinel
dictionaries: metrics, units, sources, categories
```

Transfer buffers where Electron's supported IPC path permits it. If invoke-result IPC
cannot transfer ownership efficiently, evaluate a dedicated `MessagePort` rather than
adding ad hoc channels.

### 10.2 Alternatives

Compare compact transfer with retaining raw records in the main/worker side and sending
only the indexed report model to the renderer. The latter complicates CSV/XLSX export
and arbitrary range selection, so it should be chosen only with a clear ownership and
query protocol.

### 10.3 Acceptance

- serialization time and renderer retained memory improve materially on the large
  fixture;
- exact records can still be reconstructed for selected-range export;
- source, category, unit, timestamp, and metric values round-trip exactly;
- the public preload surface remains narrow;
- complexity is documented and justified by measurements.

## 11. Test plan

### Unit tests

- binary lower/upper bounds and inclusive date filtering;
- formatter reuse and exact formatting behavior;
- metadata and span construction;
- one-pass daily averages, totals, and statistics;
- exact median and change calculations;
- chart sampling invariants;
- parser record normalization and diagnostic counters;
- compact representation round trips, if implemented.

### Property and equivalence tests

Generate randomized sorted records and compare old and new selectors. Generate XML with
randomized supported and unsupported types and compare old and streaming parser output.
Use fixed seeds in failures so cases reproduce locally.

### Component and integration tests

- detailed rows are absent before expansion and present afterward;
- print layout mounts all required report content;
- collapsed overview summaries calculate on demand;
- changing dates updates visible and previously opened content;
- progress, cancellation, malformed input, and worker failure states;
- CSV/XLSX newest-first order and exact selected range;
- vector and compact PDF readiness.

### Manual visual checks

- empty import ranges and sparse metrics;
- short, annual, and all-time ranges;
- chart extrema and bucketed tooltips;
- large-table expansion and scrolling;
- PDF page breaks, tables, headers, and charts;
- responsive layouts at narrow and wide window sizes.

### Required verification per milestone

Run:

```bash
npm test
npm run build
```

For rendering or PDF milestones, also run the Electron application with small and large
synthetic fixtures and complete both PDF modes.

## 12. Rollout and review strategy

Use focused changes that can be reviewed independently:

1. benchmark generator and instrumentation;
2. formatter and range helper changes;
3. lazy viewer rendering;
4. unified report index and component migration;
5. chart sampling;
6. worker boundary;
7. streaming standalone XML;
8. streaming ZIP and CDA integration;
9. optional compact IPC representation.

For each change, record:

- user-visible behavior;
- correctness tests added;
- before/after median timings;
- before/after memory and DOM counts where relevant;
- PDF or visual verification performed;
- known limitations and rollback path.

Avoid combining parser replacement with report-model migration in one change. Keeping
those boundaries separate makes correctness regressions and performance effects easier
to isolate.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Date-range boundary regression | Property-test binary selection against the current linear implementation |
| Daily-statistic drift | Equivalence tests, stable ordering, and population-standard-deviation checks |
| Lazy content missing from PDF | Make print layout an explicit mount condition and extend readiness verification |
| Downsampling hides important extrema | Use extrema-preserving algorithms and keep tables/exports exact |
| Worker packaging failure | Test both development and production Electron paths |
| ZIP bomb or malformed XML | Expanded-byte, element, record, and compression-ratio limits |
| Streaming parser behavior differs | Temporary fallback and fixture-by-fixture output comparison |
| IPC optimization adds excessive complexity | Make compact transfer conditional on measured bottlenecks |
| Performance tests become flaky | Use five-run medians locally and broad thresholds only in stable CI environments |
| Sensitive data appears in diagnostics | Synthetic fixtures only; timings and counts contain no values or patient fields |

## 14. Definition of done

The performance initiative is complete when:

- agreed synthetic baselines and measurement instructions are documented;
- date-range selection uses binary bounds and passes equivalence tests;
- report aggregates are produced from a single reusable per-session index;
- closed detailed reports are not mounted in viewer mode;
- chart work is bounded for long ranges;
- large import parsing runs outside Electron's main thread;
- standalone XML and ZIP imports stream without materializing the complete parsed XML
  tree;
- current parser, report, export, and PDF behavior is preserved by automated and manual
  verification;
- the large-fixture goals for filtering, first render, and peak memory are met or any
  revised targets are justified with recorded evidence;
- obsolete caches, fallback switches, and parser code are removed after migration;
- architecture and user/developer documentation reflect the final implementation.

The compact transfer milestone is not required for completion when profiling shows that
IPC serialization is no longer a material bottleneck.
