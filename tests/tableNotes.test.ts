import { describe, expect, it } from "vitest";
import { coverageNote } from "../src/components/TableNotes";
import { rangeMetadata } from "../src/report";
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
