# Contributing to AHDReport

Thanks for contributing.

## Development workflow

1. Create a branch from `main`.
2. Run `npm install`.
3. Make focused changes and add or update tests when behavior changes.
4. Run `npm test` and `npm run build` before opening a pull request.

## Health-data safety

- Never commit real Apple Health exports, screenshots containing health data, or `.env` files.
- Use synthetic patient details and measurements in tests, documentation, and issue reports.
- Keep all processing local unless a proposed change explicitly documents a different data flow.

## Pull requests

Describe the user-visible change, note verification performed, and include screenshots for UI or PDF layout changes.
