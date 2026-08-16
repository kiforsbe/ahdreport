import { describe, expect, it } from "vitest";
import { coverageNote } from "../src/components/TableNotes";
import { filtered, rangeMetadata } from "../src/report";
import type { HealthRecord } from "../src/shared/types";

const records: HealthRecord[] = [
  { metric: "weight", date: "2026-01-10T09:00:00.000Z", value: 70, unit: "kg" },
  { metric: "weight", date: "2026-01-20T09:00:00.000Z", value: 71, unit: "kg" },
];

describe("coverageNote", () => {
  it("returns null when the metric is entirely absent", () => {
    const metadata = rangeMetadata(records);
    expect(coverageNote("steps", metadata, "2026-01-01", "2026-01-31")).toBeNull();
  });
  it("returns null when the metric's data covers the whole selected period", () => {
    const metadata = rangeMetadata(records);
    expect(coverageNote("weight", metadata, "2026-01-10", "2026-01-20")).toBeNull();
  });
  it("notes when a metric's available dates are narrower than the selected period", () => {
    const metadata = rangeMetadata(records);
    const note = coverageNote("weight", metadata, "2026-01-01", "2026-01-31");
    expect(note).toContain("narrower than the selected period");
  });
});

describe("filtered() -> rangeMetadata() -> coverageNote() composition", () => {
  // Sorted ascending by date, matching the parser's invariant that
  // filtered()/rangeMetadata() rely on.
  const multiMetric: HealthRecord[] = [
    { metric: "weight", date: "2025-12-01T09:00:00.000Z", value: 65, unit: "kg" },
    { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
    { metric: "steps", date: "2026-01-10T09:00:00.000Z", value: 1000, unit: "count" },
    { metric: "steps", date: "2026-01-12T09:00:00.000Z", value: 1200, unit: "count" },
    { metric: "weight", date: "2026-01-31T09:00:00.000Z", value: 74, unit: "kg" },
    { metric: "steps", date: "2026-02-15T09:00:00.000Z", value: 1500, unit: "count" },
  ];
  const selectedFrom = "2026-01-01";
  const selectedTo = "2026-01-31";

  it("reports a narrower-than-selected-period span for a metric whose data doesn't cover the full filtered window", () => {
    const windowRecords = filtered(multiMetric, selectedFrom, selectedTo);
    // filtered() should have excluded the out-of-window Dec/Feb records.
    expect(windowRecords.map((r) => r.date)).toEqual([
      "2026-01-01T09:00:00.000Z",
      "2026-01-10T09:00:00.000Z",
      "2026-01-12T09:00:00.000Z",
      "2026-01-31T09:00:00.000Z",
    ]);

    const metadata = rangeMetadata(windowRecords);

    // Weight spans the entire selected window, so no coverage note.
    expect(
      coverageNote("weight", metadata, selectedFrom, selectedTo),
    ).toBeNull();

    // Steps only covers 01-10..01-12 within the filtered window, narrower
    // than the full selected period.
    const note = coverageNote("steps", metadata, selectedFrom, selectedTo);
    expect(note).toContain("narrower than the selected period");
  });
});
