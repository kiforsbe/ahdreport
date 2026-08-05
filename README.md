# AHDReport

AHDReport is a local-first desktop viewer for Apple Health exports. It turns health records into an interactive clinical overview, trend charts, daily-detail tables, and a printable PDF report.

Health data is processed locally in the Electron app; it is not uploaded by AHDReport.

## Features

- Imports Apple Health `export.xml` and ZIP exports.
- Reads available patient demographics from the accompanying CDA clinical file.
- Provides 30-day, last-year, and all-time clinical summaries.
- Shows vitals, activity, sleep, and mobility trends.
- Exports an A4 PDF with patient details and detailed daily measurements.
- Supports local, editable patient defaults through `.env`.

## Requirements

- Node.js 22 or later
- npm

## Getting started

```bash
npm install
copy .env.example .env
npm run dev
```

On macOS or Linux, use `cp .env.example .env` instead. Edit `.env` only if you want local patient-field defaults. Non-empty environment values override matching values in the imported clinical XML.

## Commands

```bash
npm run dev       # Start the Vite renderer and Electron app
npm test          # Run the test suite
npm run build     # Build renderer and Electron processes
```

## Privacy

Imported data stays in the local app session and is cleared when the session is cleared or the app closes. Do not commit `.env` files or real health-export files to a repository.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For design and implementation details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

AHDReport is licensed under the [MIT License](LICENSE).
