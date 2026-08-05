# AHDReport

AHDReport turns an Apple Health export into a readable desktop report with clinical
overview cards, trend charts, daily distributions, and a detailed A4 PDF.

Everything is processed locally on your computer. AHDReport does not upload health
records, patient details, or generated reports to a server.

> [!IMPORTANT]
> AHDReport is a reporting and visualization tool, not a medical device. Its output is
> not medical advice and should not replace professional assessment or the source data
> in Apple Health.

## What AHDReport provides

- Import from Apple Health `export.zip` or a standalone `export.xml`.
- Patient demographics from a CDA/clinical XML file included in the ZIP, when present.
- Editable name, personnummer, date of birth, and sex fields.
- Quick report periods: 7 days, 30 days, 90 days, last 365 days, year-to-date, and all
  time, plus custom From and To dates.
- Last-30-days overview cards for weight, heart rate, steps, and sleep.
- Collapsible last-year and all-time overview cards.
- Trend charts for vitals, sleep, activity, and mobility.
- Daily blood-pressure ranges with systolic and diastolic averages.
- Detailed daily tables with min/max, average, standard deviation, and intra-day traces.
- A synchronized A4 PDF containing patient details, selected period, charts, tables,
  page numbers, and a patient summary header.
- No account, cloud service, database, analytics, or telemetry.

## Project status

AHDReport is currently an early-stage desktop project intended to be run from source.
The repository builds the Electron main process and Vite renderer, but it does not yet
include an installer or platform packaging script.

## Privacy first

Health exports can contain extremely sensitive information. AHDReport keeps imported
data in the current application session and does not intentionally send it anywhere.

- Clearing the session or closing the application removes imported data from the app.
- The original Apple Health export remains wherever you stored it.
- An exported PDF is a new persistent file; protect and delete it as appropriate.
- Local `.env` values can contain patient data and must not be committed or shared.
- Patient defaults are loaded at import time by the Electron main process and are not
  compiled into the Vite renderer bundle.
- Runtime defaults are still plain text and enter renderer memory when displayed. This
  improves build hygiene but does not turn `.env` into encrypted secret storage.
- Real exports, patient screenshots, PDFs, and `.env` files should never be attached to
  public issues. Use synthetic data for bug reports.

The repository ignores `.env`, `export.xml`, `export_cda.xml`, and
`apple_health_export/`, but you should still check `git status` before every commit.

## Requirements

To run the current source version:

- Node.js 22 or later
- npm
- Windows, macOS, or Linux with Electron support
- An Apple Health `export.zip` or `export.xml`

## Install and run

Clone the repository, install dependencies, and start the development application:

```bash
npm install
npm run dev
```

The Vite renderer starts on the local loopback interface and Electron opens the desktop
window. Nothing needs to be uploaded to use the application.

An `.env` file is optional. If you want fictional or local patient defaults, copy the
example before starting the app:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
npm run dev
```

### macOS or Linux

```bash
cp .env.example .env
npm run dev
```

## Obtain an Apple Health export

Use Apple Health's **Export All Health Data** action to create an export archive, then
transfer the resulting ZIP to the computer running AHDReport. Apple may change the
exact location or wording of this action between OS versions; consult the instructions
for your device if it is not visible.

Keep the archive private. It can include many years of measurements and, depending on
the export, clinical and identifying information.

## Import and view a report

1. Start AHDReport and select **Import Apple Health export**.
2. Choose either the original ZIP or its standalone `export.xml`.
3. Wait while the archive is parsed. Large exports are read locally and can take time.
4. Review the patient details and correct or complete them if needed.
5. Select a preset period or use the From and To fields.
6. Review overview cards, charts, data-coverage notes, and detailed tables.

The From and To fields use an inclusive range and are debounced briefly while editing.
The primary charts and detailed tables follow that selected range.

The four top cards intentionally use separate summary windows ending at the selected To
date:

- **Last 30 days** is always visible.
- **Last year** covers the last 365 days and is collapsed by default.
- **All time** covers imported history through the selected To date and is collapsed by
  default.

For weight, the card shows the latest reading and first-to-last change. Heart rate,
steps, and sleep show medians and ranges. The heart-rate card uses sustained min/max
bounds so isolated spikes do not define its summary range; source measurements remain
available elsewhere in the report.

## Patient details

When importing a ZIP, AHDReport looks for an accompanying CDA/clinical XML file such as
`export_cda.xml` or `clinical_data.xml`. It reads available values from the CDA
`recordTarget`, including:

- name;
- patient identifier/personnummer;
- date of birth;
- administrative sex.

A standalone `export.xml` normally does not contain those CDA demographics, so the
fields can remain empty. All four fields are editable after import.

If runtime defaults are configured, each non-empty value takes precedence over the
corresponding CDA value. Values are resolved from lowest to highest priority:

```text
empty field
  → imported CDA value
  → repository .env
  → Electron user-data patient.env
  → AHDREPORT_PATIENT_ENV_FILE
  → process environment
```

The last non-empty value for each field wins. Supported variables are:

```dotenv
AHDREPORT_PATIENT_NAME=John Doe
AHDREPORT_PERSONNUMMER=800101-1234
AHDREPORT_DATE_OF_BIRTH=1980-01-01
AHDREPORT_SEX=Male
```

For development, save `.env` in the repository root. A packaged-style installation can
instead use `patient.env` in Electron's user-data directory. To keep the file somewhere
else, set an environment variable pointing to it before launching AHDReport:

```text
AHDREPORT_PATIENT_ENV_FILE=C:\private\ahdreport-patient.env
```

Files are read again on every import. After changing one, clear the current session and
import again; rebuilding the renderer is not required. Changing the process environment
itself still requires restarting AHDReport.

Older `VITE_DEFAULT_*` field names are recognized by the main-process loader as a
runtime-only migration fallback. New configurations should use `AHDREPORT_*`; the
renderer no longer references or embeds the legacy variables.

Leave a field empty or remove it when an imported CDA value should be used instead.

Do not distribute a patient defaults file with the application. Although values are no
longer compiled into the renderer bundle, the file itself contains readable personal
data.

## Export a PDF

1. Select the desired report period.
2. Confirm the patient details.
3. Select **Export detailed PDF**.
4. Choose a destination in the native save dialog.

The PDF includes:

- a compact patient summary and printed date in the page header;
- page numbers in the footer;
- the selected From and To dates;
- text-only patient details without editable controls;
- overview cards and full-width trend charts;
- detailed daily measurement tables;
- coverage and truncation information where applicable.

Detailed sections show at most the 365 most recent days with data per section. AHDReport
adds a note when more data exists or a metric covers less than the selected period.

PDF generation temporarily switches the renderer to a fixed A4-safe chart layout and
waits for the charts to finish rendering before capture. The interactive layout is
restored afterward, including if PDF creation fails.

## Supported health data

Apple Health record types are mapped into these report groups:

| Group | Metrics |
|---|---|
| Vitals | Weight, heart rate, resting heart rate, systolic pressure, diastolic pressure, body temperature |
| Sleep and activity | Sleep, steps, active energy, exercise time, walking/running distance |
| Mobility | Walking speed, step length, walking asymmetry, double-support percentage, stair ascent speed, stair descent speed, six-minute walk distance |
| Clinical | Medication records when a supported record is present |

Unsupported HealthKit record types are skipped and counted in import diagnostics rather
than causing the entire import to fail. Invalid dates and non-numeric values are also
skipped. Exact duplicate supported measurements are removed.

Sleep values are derived from each record's start/end duration. Imported data remains a
read-only representation of the Apple Health export; AHDReport does not provide manual
measurement or medication entry.

## Troubleshooting

### The ZIP is rejected

The selected archive must contain a file named `export.xml`, possibly inside a folder.
Try opening the original Apple Health ZIP without renaming or restructuring its
contents. A CDA file alone is not a valid primary import.

### Patient details are empty

Not every export includes a CDA/clinical file, and some CDA identifiers explicitly
indicate that no identifier is available. Enter the details in the viewer or configure
optional `.env` defaults.

### `.env` does not override imported data

Check that:

- the file is named exactly `.env` and is saved in the repository root;
- variable names use the documented `AHDREPORT_` names;
- the desired value is non-empty;
- the current session was cleared and the Apple Health export was imported again;
- `AHDREPORT_PATIENT_ENV_FILE`, if set, points to an existing readable file;
- a higher-priority process environment value is not overriding the file.

### Importing takes a long time or uses substantial memory

The CDA reader stops after the patient section, but the selected file and primary
`export.xml` are currently loaded and parsed in memory. Very large multi-year exports
can therefore require significant RAM and processing time.

### The secure desktop bridge did not load

Fully close Electron and restart `npm run dev`. Renderer hot reload cannot update every
main-process or preload change.

### PDF output does not reflect a source change

Fully restart Electron after changes to `electron/main.ts` or the preload bridge. A Vite
hot-module update refreshes renderer code only.

### PDF creation fails

Choose a writable destination, ensure an existing PDF is not locked by another program,
and retry. The app restores viewer mode after a failed export.

## Current limitations

- There is no installer or signed binary produced by the current scripts.
- There is no persistence between application sessions.
- Imports are limited to Apple Health XML/ZIP exports.
- The primary HealthKit XML is parsed in memory rather than as a stream.
- Health measurements are read-only.
- Detailed report sections are capped at 365 days.
- The app is not a medical device and does not interpret clinical significance.

## Developer guide

### Scripts

```bash
npm run dev             # Run Vite and Electron together
npm run dev:renderer    # Run only the Vite renderer
npm run dev:electron    # Compile and launch Electron after Vite is available
npm test                # Run Vitest once
npm run build           # Build renderer and Electron targets
npm run build:renderer  # Build dist/
npm run build:electron  # Compile dist-electron/
```

After a production build, the compiled application can be launched from the repository
with:

```bash
npx electron .
```

This launches the compiled output; it does not create an installer.

### Process boundaries

AHDReport follows Electron's three-context model:

```text
Electron main process
  ├─ native file dialogs
  ├─ local file reads/writes
  ├─ Apple Health parsing
  └─ PDF generation
          │
          │ typed IPC through preload
          ▼
Sandboxed React renderer
  ├─ session and patient-field state
  ├─ filtering and aggregation
  ├─ charts and detailed tables
  └─ synchronized print layout
```

The renderer uses `contextIsolation`, has no Node integration, and receives only the
small `window.healthAPI` bridge defined by the preload script.

### Repository structure

```text
electron/
  main.ts                 Electron lifecycle, IPC, dialogs, and PDF capture
  preload.cts             Sandboxed renderer bridge
  appleHealthParser.ts    HealthKit and CDA parsing
src/
  App.tsx                 UI, charts, report tables, and print coordination
  report.ts               Pure filtering and aggregation helpers
  shared/types.ts         IPC and domain contracts shared with Electron
  styles.css              Screen, responsive, and print styles
tests/
  appleHealthParser.test.ts
  report.test.ts
docs/
  ARCHITECTURE.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flow, domain contracts, CDA
streaming behavior, patient precedence, and the PDF readiness protocol.

### Testing and validation

Before opening a pull request:

```bash
npm test
npm run build
git diff --check
```

Parser and report tests use synthetic data and run without launching Electron. UI or PDF
layout changes should also be checked manually with synthetic exports because unit tests
do not validate Chromium pagination or Recharts rendering.

### Working with sensitive data

- Never commit real Apple Health exports, `.env` files, generated PDFs, or screenshots
  containing patient information.
- Never use a real name, identifier, birth date, or measurement history in fixtures.
- Scan staged changes before committing: `git diff --cached`.
- If personal data is committed accidentally, removing the current line is not enough;
  the Git history must also be rewritten before publishing.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow. Report security
issues privately as described in [SECURITY.md](SECURITY.md), and always use synthetic
health data in reports and reproductions.

## License

AHDReport is available under the [MIT License](LICENSE).
