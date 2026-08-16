import { afterEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { recordRange, type RecordRange } from "../src/report";
import type { HealthRecord } from "../src/shared/types";

function linearRange(records: HealthRecord[], from: string, to: string): RecordRange {
  const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  const kept: number[] = [];
  records.forEach((record, index) => {
    const t = Date.parse(record.date);
    if (Number.isFinite(t) && t >= start && t <= end) kept.push(index);
  });
  if (!kept.length) return { start: 0, end: 0 };
  return { start: kept[0], end: kept.at(-1)! + 1 };
}
const row = (t: number, i: number): HealthRecord => ({
  metric: "weight",
  date: new Date(t).toISOString(),
  value: i,
  unit: "kg",
});

describe("recordRange", () => {
  it("returns an empty range for an empty array", () => {
    expect(recordRange([], "2026-01-01", "2026-01-31")).toEqual({ start: 0, end: 0 });
  });
  it("returns the full range when both boundaries are absent", () => {
    const records = [row(1, 0), row(2, 1), row(3, 2)];
    expect(recordRange(records, "", "")).toEqual({ start: 0, end: 3 });
  });
  it("respects only a From boundary", () => {
    const records = [
      { ...row(0, 0), date: "2026-01-01T00:00:00.000Z" },
      { ...row(0, 1), date: "2026-01-02T00:00:00.000Z" },
    ];
    expect(recordRange(records, "2026-01-02", "")).toEqual({ start: 1, end: 2 });
  });
  it("respects only a To boundary", () => {
    const records = [
      { ...row(0, 0), date: "2026-01-01T00:00:00.000Z" },
      { ...row(0, 1), date: "2026-01-02T00:00:00.000Z" },
    ];
    expect(recordRange(records, "", "2026-01-01")).toEqual({ start: 0, end: 1 });
  });
  it("includes readings exactly at local midnight and at the last instant of the selected day", () => {
    const records: HealthRecord[] = [
      { metric: "weight", date: "2026-01-05T00:00:00.000Z", value: 1, unit: "kg" },
      { metric: "weight", date: "2026-01-05T23:59:59.999Z", value: 2, unit: "kg" },
      { metric: "weight", date: "2026-01-06T00:00:00.000Z", value: 3, unit: "kg" },
    ];
    // Local zone here is whatever the process TZ is (UTC in CI); the exact
    // boundary instant is validated per-zone in the timezone test below.
    const range = recordRange(records, "2026-01-05", "2026-01-05");
    expect(range).toEqual(linearRange(records, "2026-01-05", "2026-01-05"));
  });
  it("returns an empty range when no records fall inside the window", () => {
    const records = [row(Date.parse("2026-01-01T00:00:00Z"), 0)];
    expect(recordRange(records, "2026-02-01", "2026-02-28")).toEqual({ start: 0, end: 0 });
  });
  it("returns an empty range for a window entirely outside the dataset", () => {
    const records = [row(Date.parse("2026-06-01T00:00:00Z"), 0)];
    expect(recordRange(records, "2020-01-01", "2020-01-31")).toEqual({ start: 0, end: 0 });
  });
  it("treats an unparseable From the same as the linear implementation (empty result)", () => {
    const records = [row(Date.parse("2026-01-01T00:00:00Z"), 0)];
    expect(recordRange(records, "not-a-date", "")).toEqual(
      linearRange(records, "not-a-date", ""),
    );
  });
  it("treats an unparseable To the same as the linear implementation (empty result)", () => {
    const records = [row(Date.parse("2026-01-01T00:00:00Z"), 0)];
    expect(recordRange(records, "", "also-not-a-date")).toEqual(
      linearRange(records, "", "also-not-a-date"),
    );
  });
  it("keeps duplicate timestamps contiguous and inclusive", () => {
    const records: HealthRecord[] = [
      { metric: "weight", date: "2026-01-05T09:00:00.000Z", value: 1, unit: "kg" },
      { metric: "weight", date: "2026-01-05T09:00:00.000Z", value: 2, unit: "kg" },
      { metric: "weight", date: "2026-01-05T09:00:00.000Z", value: 3, unit: "kg" },
    ];
    expect(recordRange(records, "2026-01-05", "2026-01-05")).toEqual({ start: 0, end: 3 });
  });
  it("does not change record ordering", () => {
    const records = [row(1000, 0), row(2000, 1), row(3000, 2)];
    const { start, end } = recordRange(records, "", "");
    expect(records.slice(start, end).map((r) => r.value)).toEqual([0, 1, 2]);
  });
});

describe("recordRange matches the linear scan (property test)", () => {
  const sortedRecords = fc
    .array(fc.integer({ min: 1_700_000_000_000, max: 1_760_000_000_000 }), {
      minLength: 0,
      maxLength: 200,
    })
    .map((timestamps) =>
      timestamps
        .slice()
        .sort((a, b) => a - b)
        .map((t, i) => row(t, i)),
    );
  const dayString = fc.oneof(
    fc.constant(""),
    fc
      .integer({ min: 1_700_000_000_000, max: 1_760_000_000_000 })
      .map((t) => new Date(t).toISOString().slice(0, 10)),
    fc.constant("not-a-date"),
  );
  it("agrees with the reference linear implementation on generated sorted data", () => {
    fc.assert(
      fc.property(sortedRecords, dayString, dayString, (records, from, to) => {
        expect(recordRange(records, from, to)).toEqual(linearRange(records, from, to));
      }),
    );
  });
});

describe("recordRange across non-UTC timezones", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });
  it.each(["America/New_York", "Pacific/Chatham"])(
    "matches the linear scan when the local zone is %s, across a DST transition day",
    (tz) => {
      process.env.TZ = tz;
      // 2026-03-08 is a US spring-forward DST transition day.
      const records: HealthRecord[] = [
        { metric: "weight", date: "2026-03-08T04:30:00.000Z", value: 1, unit: "kg" },
        { metric: "weight", date: "2026-03-08T12:00:00.000Z", value: 2, unit: "kg" },
        { metric: "weight", date: "2026-03-09T04:00:00.000Z", value: 3, unit: "kg" },
      ];
      expect(recordRange(records, "2026-03-08", "2026-03-08")).toEqual(
        linearRange(records, "2026-03-08", "2026-03-08"),
      );
    },
  );
});
