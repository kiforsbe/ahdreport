# ADHReport — Architecture & Design Specification

## 1. Purpose

ADHReport is a local-first Electron desktop application that imports an Apple Health
export (`export.xml` or the zipped `export.zip`), lets a user browse and filter their
health metrics over a date range, and produces a printable / PDF clinical-style report.
No data leaves the machine: import, parsing, aggregation, rendering, and PDF generation
all happen locally.

## 2. Process Architecture

The app follows Electron's standard three-context split. The renderer has **no** direct
Node.js or filesystem access; all privileged work (file dialogs, filesystem reads, PDF
capture) happens in the main process and is exposed to the renderer through a narrow,
typed `contextBridge` API.

```mermaid
flowchart LR
    subgraph MAIN["Main process (Node.js) — electron/main.ts"]
        M1["BrowserWindow\n(sandbox: true, contextIsolation: true,\nnodeIntegration: false)"]
        M2["ipcMain.handle('health:import')"]
        M3["ipcMain.handle('health:exportPdf')"]
        M4["appleHealthParser.ts"]
        M5["dialog.showOpenDialog /\ndialog.showSaveDialog"]
        M6["fs.readFile / fs.writeFile"]
    end

    subgraph PRELOAD["Preload (isolated bridge) — electron/preload.cts"]
        P1["contextBridge.exposeInMainWorld('healthAPI', …)"]
    end

    subgraph RENDERER["Renderer process (Chromium) — src/*"]
        R1["main.tsx → App.tsx (React 19)"]
        R2["report.ts\n(filtering / aggregation)"]
        R3["recharts + custom SVG\n(charts, tables)"]
        R4["window.healthAPI"]
    end

    R4 -- "ipcRenderer.invoke" --> P1
    P1 -- "contextBridge" --> M2
    P1 -- "contextBridge" --> M3
    M2 --> M5 --> M6
    M2 --> M4
    M4 -- "HealthData" --> M2
    M2 -- "IPC result" --> P1
    P1 --> R4
    M3 --> M5
    M3 -- "webContents.printToPDF" --> M6
    R1 --> R2 --> R3
    R1 -- "uses" --> R4
```

**Why this shape:** `nodeIntegration: false` + `contextIsolation: true` + `sandbox: true`
(`electron/main.ts:10`) mean the renderer (which loads a normal web page / React app) can
never reach `fs`, `child_process`, or other Node APIs directly, even if it were later
compromised (e.g. via a malicious SVG/XML payload). The only surface it has is the two
functions the preload script explicitly whitelists.

## 3. Module Map

| Layer | File | Responsibility |
|---|---|---|
| Main | `electron/main.ts` | App lifecycle, `BrowserWindow` creation, IPC handlers for import & PDF export |
| Main | `electron/appleHealthParser.ts` | Unzips/reads the export, parses HealthKit XML into typed, deduplicated `HealthRecord[]` |
| Bridge | `electron/preload.cts` | Exposes `window.healthAPI` (`importExport`, `exportPdf`) via `contextBridge` |
| Shared | `src/shared/types.ts` | Types shared by main and renderer: `Metric`, `HealthRecord`, `HealthData`, `HealthAPI` |
| Renderer entry | `src/main.tsx` | Mounts the React tree, loads global stylesheets |
| Renderer | `src/App.tsx` | All UI: landing/import screen, dashboard, charts, printable report tables |
| Renderer | `src/report.ts` | Pure functions: date filtering, daily average/total/statistics aggregation, formatting |
| Styling | `src/styles.css`, `src/table-overrides.css` | Screen + print stylesheets |
| Tests | `tests/*.test.ts` | Vitest unit tests for the parser and the report/aggregation functions |

Only `src/shared/types.ts` is imported by *both* the Node-side (`electron/`) and the
browser-side (`src/`) code — it is the contract between the two worlds and is compiled
twice: once by `tsconfig.json` (renderer, DOM libs) and once by `tsconfig.electron.json`
(Node target).

## 4. Domain Model (Class Diagram)

```mermaid
classDiagram
    class Metric {
        <<enumeration>>
        weight
        heartRate
        restingHeartRate
        bloodPressureSystolic
        bloodPressureDiastolic
        bodyTemperature
        steps
        activeEnergy
        exerciseTime
        distance
        sleep
        walkingSpeed
        stepLength
        walkingAsymmetry
        doubleSupport
        stairAscentSpeed
        stairDescentSpeed
        sixMinuteWalk
        medication
    }

    class HealthRecord {
        +Metric metric
        +string date
        +number value
        +string unit
        +string source
        +string category
    }

    class ImportDiagnostics {
        +string fileName
        +number imported
        +number unsupported
        +string earliest
        +string latest
        +string[] warnings
    }

    class HealthData {
        +HealthRecord[] records
        +ImportDiagnostics diagnostics
    }

    class PdfExportResult {
        +string path
        +boolean canceled
    }

    class HealthAPI {
        <<interface>>
        +importExport() Promise~HealthData~
        +exportPdf() Promise~PdfExportResult~
    }

    class DailyStats {
        +string date
        +number[] values
        +string unit
        +number min
        +number max
        +number average
        +number standardDeviation
    }

    HealthData "1" *-- "0..*" HealthRecord
    HealthData "1" *-- "1" ImportDiagnostics
    HealthRecord ..> Metric : typed by
    DailyStats ..> HealthRecord : derived from report.ts
    HealthAPI ..> HealthData : returns
    HealthAPI ..> PdfExportResult : returns
```

Notes on the model above:

- `Metric` is modeled as an `<<enumeration>>` even though in TypeScript it's a string
  union (`src/shared/types.ts:1`), which is the closest UML equivalent for a closed set
  of literal values.
- `source`, `category`, `earliest`, and `latest` are all optional (`?`) in the TypeScript
  source; UML attributes don't have a first-class optional marker, so treat every field
  above as potentially absent unless the accompanying prose says otherwise.
- `HealthAPI.importExport()` actually resolves to `Promise<HealthData | null>` — `null`
  when the user cancels the file-picker dialog. `PdfExportResult` mirrors the anonymous
  `{ path?: string; canceled: boolean }` return type of `exportPdf()` (`src/shared/types.ts:6`);
  it isn't a named type in the code, only introduced here for diagram clarity.
- `DailyStats` (`src/report.ts:13`) is not persisted or transferred over IPC — it is a
  derived, renderer-only aggregate computed on demand from the currently-filtered
  `HealthRecord[]` for a single metric.

## 5. Component Diagram — Renderer UI

```mermaid
flowchart TB
    App["App() — src/App.tsx\n(owns: data, from, to, notice state)"]

    Landing["Landing screen\n(shown when data === null)"]
    Dashboard["Dashboard\n(cards, controls, group charts, medication, diagnostics)"]
    PrintReport["Printable report\n(.print-report — screen-hidden, print-visible)"]

    App --> Landing
    App --> Dashboard
    App --> PrintReport

    Dashboard --> Cards["highlight cards\n(weight, resting HR, steps, sleep)"]
    Dashboard --> Controls["date-range controls\n(7D/30D/90D/YTD/All time presets)"]
    Dashboard --> MetricChart["MetricChart\n(AreaChart, per metric)"]
    Dashboard --> BpChart["BloodPressureChart\n(ComposedChart: floating range bars\n+ avg tick, systolic & diastolic)"]

    PrintReport --> VitalsTable["VitalsReportTable\n(BP + heart rate + weight, per day)"]
    PrintReport --> ActivityTable["ActivityReportTable\n(steps/distance/energy/sleep totals)"]
    PrintReport --> WalkingTable["WalkingReportTable\n(gait metrics, compact distributions)"]
    PrintReport --> ReportTable["ReportTable\n(all remaining metrics)"]

    VitalsTable --> DailyDistribution["DailyDistribution\n(min/avg/max + σ band, SVG)"]
    ActivityTable --> DailyDistribution
    WalkingTable --> DailyDistribution
    ReportTable --> DailyDistribution
    ReportTable --> DayTrace["DayTrace\n(intra-day sparkline, SVG)"]

    App -.->|"filtered(records, from, to)"| ReportLib["report.ts"]
    MetricChart -.->|"daily()"| ReportLib
    BpChart -.->|"dailyStats()"| ReportLib
    ActivityTable -.->|"dailyTotals() / dailyStats()"| ReportLib
    VitalsTable -.->|"dailyStats()"| ReportLib
    WalkingTable -.->|"dailyStats()"| ReportLib
    ReportTable -.->|"dailyStats()"| ReportLib
```

`App.tsx` is intentionally a flat, single-file component tree (no routing, no global
state library) — the only piece of state is `{ data, from, to, notice }`, and every chart
or table is a pure function of `records` (the already date-filtered slice) plus the
`report.ts` aggregation helpers. There is one DOM tree containing both the interactive
dashboard and the `.print-report` section; CSS `@media print` rules toggle which parts
are visible, so printing/PDF export needs no separate render pass.

## 6. Sequence — Import an Apple Health export

```mermaid
sequenceDiagram
    actor User
    participant UI as App.tsx (renderer)
    participant Bridge as preload.cts (contextBridge)
    participant Main as main.ts (ipcMain)
    participant Parser as appleHealthParser.ts
    participant FS as Filesystem

    User->>UI: Click "Import Apple Health export"
    UI->>Bridge: window.healthAPI.importExport()
    Bridge->>Main: ipcRenderer.invoke('health:import')
    Main->>FS: dialog.showOpenDialog (.zip or .xml)
    FS-->>Main: selected file path, or canceled
    alt canceled
        Main-->>Bridge: null
        Bridge-->>UI: null, no state change
    else file chosen
        Main->>FS: readFile(path)
        FS-->>Main: file contents as a Buffer
        Main->>Parser: parseAppleHealthExport(buffer, fileName)
        Parser->>Parser: unzip if .zip, then locate export.xml
        Parser->>Parser: XMLParser.parse() to get HealthKit records
        Parser->>Parser: map HK type to Metric, dedupe, sort by date
        Parser-->>Main: HealthData with records and diagnostics
        Main-->>Bridge: HealthData
        Bridge-->>UI: HealthData
        UI->>UI: setData(result), then set from/to from earliest and latest dates
        UI->>User: renders dashboard and printable report
    end
```

## 7. Sequence — Export to PDF

```mermaid
sequenceDiagram
    actor User
    participant UI as App.tsx (renderer)
    participant Bridge as preload.cts
    participant Main as main.ts (ipcMain)
    participant Win as BrowserWindow.webContents
    participant FS as Filesystem

    User->>UI: Click "Export detailed PDF"
    UI->>Bridge: window.healthAPI.exportPdf()
    Bridge->>Main: ipcRenderer.invoke('health:exportPdf')
    Main->>User: dialog.showSaveDialog, default adhreport.pdf
    alt canceled
        Main-->>Bridge: canceled true
    else path chosen
        Main->>Win: printToPDF with printBackground and A4 page size
        Win-->>Main: PDF buffer<br/>renders the already-visible DOM, @media print rules applied
        Main->>FS: writeFile(path, buffer)
        Main-->>Bridge: canceled false, with the saved path
    end
    Bridge-->>UI: result
    UI->>User: notice - PDF saved to the selected path
```

Because `printToPDF` captures the **already-rendered** page, there is no second
render/navigation step — the same `.print-report` DOM that is hidden on screen (via
`@media print` CSS) is what gets captured, so the PDF and the interactive dashboard are
always in sync with the currently selected date range.

## 8. Data Flow Summary

```mermaid
flowchart LR
    XML["export.xml / export.zip"] -->|"parseAppleHealthExport"| Records["HealthRecord[]\n(typed, deduped, sorted)"]
    Records -->|"filtered(from, to)"| Filtered["date-range slice"]
    Filtered -->|"daily / dailyTotals / dailyStats"| Aggregates["per-day series & stats"]
    Aggregates --> Charts["recharts visuals"]
    Aggregates --> Tables["print-report tables"]
    Charts --> Screen["on-screen dashboard"]
    Tables --> PDF["printToPDF → saved .pdf"]
```

## 9. Build & Tooling

| Concern | Tool | Notes |
|---|---|---|
| Renderer bundling | Vite 6 (`vite.config.ts`) | `base: './'` so `dist/index.html` loads with relative asset paths under `file://` in packaged builds |
| Renderer types | `tsconfig.json` | `strict`, DOM libs, `noEmit` (Vite handles transpilation) |
| Electron/Node compile | `tsconfig.electron.json` + `tsc` | Compiles `electron/` + `src/shared/` to `dist-electron/`, `NodeNext` module resolution |
| Dev loop | `concurrently` + `wait-on` | `npm run dev` starts Vite on `127.0.0.1:5173`, waits for it, then launches Electron pointed at `VITE_DEV_SERVER_URL` |
| Packaging input | `dist/` (renderer) + `dist-electron/` (main/preload) | `main.ts` loads `dist/index.html` directly when `VITE_DEV_SERVER_URL` is unset |
| Tests | Vitest | `tests/report.test.ts` (aggregation/filtering), `tests/appleHealthParser.test.ts` (XML/zip parsing) — both exercise pure functions with no Electron runtime needed |

## 10. Security Model

- **Renderer sandboxing**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
  (`electron/main.ts:10`) — the imported XML/zip is parsed entirely in the main process;
  the renderer only ever sees the resulting plain-data `HealthData` object.
- **Minimal IPC surface**: exactly two channels (`health:import`, `health:exportPdf`),
  both parameterless from the renderer's side — the renderer cannot pass an arbitrary
  file path into the main process; the main process always drives the native file dialog.
- **No network egress**: there is no HTTP client anywhere in the codebase; all
  computation and rendering happens on-device, matching the "nothing is uploaded"
  claim shown on the landing screen.

## 11. Known Constraints / Non-Goals

- Single-window, single-session app — no persistence between launches (closing the app
  discards the imported data; the user re-imports each session).
- No manual data entry — medication and all other metrics are read-only reflections of
  the Apple Health export; `App.tsx` explicitly disables manual medication entry.
- Report tables cap at `MAX_TABLE_ROWS` (365) most recent days per section, to keep the
  printed/PDF report a bounded size. When a table or metric column has more data than
  that, or when a specific metric's own data starts later or ends earlier than the
  selected report period, `App.tsx` renders an explicit note (`coverageNote` /
  `truncationNote`) under that table or chart rather than silently truncating.
- Single supported source format: Apple Health's HealthKit XML export (`export.xml`,
  optionally zipped as `export.zip`); no support for other wearable/health export formats.
