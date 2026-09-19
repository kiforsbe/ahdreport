import { describe, expect, it, vi } from "vitest";
import {
  change,
  daily,
  dailyStats,
  decimalsByMetric,
  denseDaily,
  denseDateRange,
  filtered,
  format,
  formatDate,
  labels,
  latest,
  median,
  bpCategoryAha,
  bpCategoryOrderSwedish,
  bpCategorySwedish,
  bpDerived,
  bpPeriodAverage,
  longestElevatedRun,
  metricGroups,
  outlierDates,
  calloutsFromPlateauRows,
  plateauCallouts,
  plateaus,
  plateauSegments,
  rangeMetadata,
} from "../src/report";
import type { HealthRecord } from "../src/shared/types";
import type { SymptomRecord } from "../src/shared/types";
const rows: HealthRecord[] = [
  { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
  { metric: "weight", date: "2026-01-01T12:00:00.000Z", value: 72, unit: "kg" },
  {
    metric: "steps",
    date: "2026-01-02T12:00:00.000Z",
    value: 1000,
    unit: "count",
  },
];
describe("report model", () => {
  it("filters an inclusive date range", () =>
    expect(filtered(rows, "2026-01-01", "2026-01-01")).toHaveLength(2));
  it("excludes both older and newer records outside the selected span", () =>
    expect(filtered(rows, "2026-01-02", "2026-01-02")).toEqual([rows[2]]));
  it("averages measurements per day for a trend", () =>
    expect(daily(rows, "weight")).toEqual([
      { date: "2026-01-01", value: 71, unit: "kg" },
    ]));
  it("sums measurements per day when total aggregation is requested", () =>
    expect(daily(rows, "weight", "total")).toEqual([
      { date: "2026-01-01", value: 142, unit: "kg" },
    ]));
  it("creates a compact daily statistical summary", () =>
    expect(dailyStats(rows, "weight")[0]).toMatchObject({
      date: "2026-01-01",
      min: 70,
      max: 72,
      average: 71,
      standardDeviation: 1,
      values: [70, 72],
    }));
});

describe("denseDaily", () => {
  it("returns an empty array for empty input", () => {
    expect(denseDaily([])).toEqual([]);
  });
  it("leaves a gapless series untouched, marking every row as real", () => {
    const rows = [
      { date: "2026-01-01", value: 10, unit: "kg" },
      { date: "2026-01-02", value: 12, unit: "kg" },
    ];
    expect(denseDaily(rows)).toEqual([
      { date: "2026-01-01", value: 10, unit: "kg", interpolated: false },
      { date: "2026-01-02", value: 12, unit: "kg", interpolated: false },
    ]);
  });
  it("linearly interpolates a single missing day between two real readings", () => {
    const rows = [
      { date: "2026-01-01", value: 10, unit: "kg" },
      { date: "2026-01-03", value: 20, unit: "kg" },
    ];
    expect(denseDaily(rows)).toEqual([
      { date: "2026-01-01", value: 10, unit: "kg", interpolated: false },
      { date: "2026-01-02", value: 15, unit: "kg", interpolated: true },
      { date: "2026-01-03", value: 20, unit: "kg", interpolated: false },
    ]);
  });
  it("linearly interpolates across a multi-day gap in even steps", () => {
    const rows = [
      { date: "2026-01-01", value: 0, unit: "kg" },
      { date: "2026-01-05", value: 8, unit: "kg" },
    ];
    expect(denseDaily(rows).map((r) => [r.date, r.value, r.interpolated])).toEqual([
      ["2026-01-01", 0, false],
      ["2026-01-02", 2, true],
      ["2026-01-03", 4, true],
      ["2026-01-04", 6, true],
      ["2026-01-05", 8, false],
    ]);
  });
  it("never extrapolates before the first or after the last real day", () => {
    const rows = [{ date: "2026-01-01", value: 10, unit: "kg" }];
    expect(denseDaily(rows)).toEqual([
      { date: "2026-01-01", value: 10, unit: "kg", interpolated: false },
    ]);
  });
});

describe("denseDateRange", () => {
  it("returns an empty array for empty input", () => {
    expect(denseDateRange([])).toEqual([]);
  });
  it("leaves a gapless series of dates untouched", () => {
    expect(denseDateRange(["2026-01-01", "2026-01-02"])).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
  });
  it("fills in every missing calendar day between the first and last date", () => {
    expect(denseDateRange(["2026-01-05", "2026-01-01"])).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
    ]);
  });
  it("de-duplicates repeated dates", () => {
    expect(denseDateRange(["2026-01-01", "2026-01-01", "2026-01-02"])).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
  });
  it("never extrapolates beyond a single given date", () => {
    expect(denseDateRange(["2026-01-01"])).toEqual(["2026-01-01"]);
  });
});

describe("overview statistics", () => {
  const weights: HealthRecord[] = [
    {
      metric: "weight",
      date: "2026-01-30T12:00:00.000Z",
      value: 73,
      unit: "kg",
    },
    {
      metric: "weight",
      date: "2026-01-01T12:00:00.000Z",
      value: 70,
      unit: "kg",
    },
    {
      metric: "weight",
      date: "2026-01-15T12:00:00.000Z",
      value: 71,
      unit: "kg",
    },
    {
      metric: "weight",
      date: "2026-01-20T12:00:00.000Z",
      value: 72,
      unit: "kg",
    },
  ];
  it("calculates medians and chronological latest values", () => {
    expect(median(weights, "weight")).toBe(71.5);
    expect(latest(weights, "weight")?.value).toBe(73);
  });
  it("calculates the change from the first to latest value", () =>
    expect(change(weights, "weight")).toBe(3));
});

describe("nutrition metric metadata", () => {
  const nutritionMetrics = [
    "dietaryEnergy",
    "carbs",
    "sugar",
    "fiber",
    "protein",
    "fat",
  ] as const;
  it("groups all six nutrition metrics under a Nutrition dashboard section", () => {
    const nutritionGroup = metricGroups.find(
      (group) => group.title === "Nutrition",
    );
    expect(nutritionGroup?.metrics).toEqual([...nutritionMetrics]);
  });
  it("labels dietary energy in whole kcal and macros to one decimal place", () => {
    expect(labels.dietaryEnergy).toBe("Dietary energy");
    expect(decimalsByMetric.dietaryEnergy).toBe(0);
    nutritionMetrics
      .filter((metric) => metric !== "dietaryEnergy")
      .forEach((metric) => expect(decimalsByMetric[metric]).toBe(1));
  });
});

describe("outlierDates", () => {
  it("flags a clear IQR-violating spike", () => {
    const rows = [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: 11 },
      { date: "2026-01-03", value: 9 },
      { date: "2026-01-04", value: 10 },
      { date: "2026-01-05", value: 60 },
      { date: "2026-01-06", value: 10 },
    ];
    expect(outlierDates(rows)).toEqual(new Set(["2026-01-05"]));
  });
  it("returns an empty set when nothing is unusual", () => {
    const rows = [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: 11 },
      { date: "2026-01-03", value: 9 },
    ];
    expect(outlierDates(rows)).toEqual(new Set());
  });
  it("returns an empty set for empty input", () => {
    expect(outlierDates([])).toEqual(new Set());
  });
});

const twoRegimeRows: HealthRecord[] = [
  ...Array.from({ length: 7 }, (_, i) => ({
    metric: "weight" as const,
    date: `2026-01-${String(i + 1).padStart(2, "0")}T08:00:00.000Z`,
    value: 70,
    unit: "kg",
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    metric: "weight" as const,
    date: `2026-01-${String(i + 8).padStart(2, "0")}T08:00:00.000Z`,
    value: 90,
    unit: "kg",
  })),
];

describe("plateaus", () => {
  it("merges into two segments for a clear two-regime series", () => {
    const result = plateaus(twoRegimeRows, "weight");
    expect(result).toHaveLength(14);
    expect(result.slice(0, 7).every((r) => r.value === 70)).toBe(true);
    expect(result.slice(7).every((r) => r.value === 90)).toBe(true);
  });
  it("returns no segments for a run shorter than one bucket (the minimum plateau length)", () => {
    expect(plateaus(twoRegimeRows.slice(0, 6), "weight")).toEqual([]);
  });
});

describe("plateauCallouts", () => {
  it("returns one midpoint per segment", () => {
    const result = plateauCallouts(twoRegimeRows, "weight");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ date: "2026-01-04", value: 70 });
    expect(result[1]).toMatchObject({ date: "2026-01-11", value: 90 });
  });
  it("returns no callouts for a run shorter than one bucket (the minimum plateau length)", () => {
    expect(plateauCallouts(twoRegimeRows.slice(0, 6), "weight")).toEqual([]);
  });
});

describe("plateauSegments / calloutsFromPlateauRows (raw rows)", () => {
  const twoRegimeDailyRows = [
    ...Array.from({ length: 7 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      value: 40,
      unit: "mmHg",
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      date: `2026-01-${String(i + 8).padStart(2, "0")}`,
      value: 55,
      unit: "mmHg",
    })),
  ];
  it("merges a raw {date,value,unit} series into segments, for values that aren't a stored Metric", () => {
    const segments = plateauSegments(twoRegimeDailyRows);
    expect(segments).toHaveLength(14);
    expect(segments.slice(0, 7).every((r) => r.value === 40)).toBe(true);
    expect(segments.slice(7).every((r) => r.value === 55)).toBe(true);
    const callouts = calloutsFromPlateauRows(segments);
    expect(callouts).toHaveLength(2);
    expect(callouts[0]).toMatchObject({ date: "2026-01-04", value: 40 });
    expect(callouts[1]).toMatchObject({ date: "2026-01-11", value: 55 });
  });
  it("returns no segments for a run shorter than one bucket (the minimum plateau length)", () => {
    // 6 consecutive days: bucket size for this short a span is the 7-day
    // floor, so a 6-day run falls one day short of a full bucket.
    expect(plateauSegments(twoRegimeDailyRows.slice(0, 6))).toEqual([]);
  });
  it("returns a segment once a run reaches exactly one bucket's worth of days", () => {
    // A run doesn't need a second bucket to merge against to count as a
    // plateau — one full bucket (7 days here) is already the minimum
    // meaningful plateau length.
    const segments = plateauSegments(twoRegimeDailyRows.slice(0, 7));
    expect(segments).toHaveLength(7);
    expect(segments.every((s) => s.value === 40)).toBe(true);
  });
});

describe("plateauSegments bucket size scales with the report's date span", () => {
  const dateAt = (dayIndex: number) =>
    new Date(2026, 0, 1 + dayIndex).toISOString().slice(0, 10);
  const flatRows = (count: number, value: number, startDay: number) =>
    Array.from({ length: count }, (_, i) => ({
      date: dateAt(startDay + i),
      value,
      unit: "kg",
    }));
  it("keeps the original 7-day minimum for a short (~90 day or less) report span", () => {
    // A 7-day blip lands exactly on a bucket boundary at this span, so it
    // stays a pure, undiluted 7-day segment.
    const rows = [
      ...flatRows(14, 50, 0),
      ...flatRows(7, 80, 14),
      ...flatRows(14, 50, 21),
    ];
    const segments = plateauSegments(rows);
    const blip = segments.filter((r) => r.value !== 50);
    expect(blip).toHaveLength(7);
    expect(blip.every((r) => r.value === 80)).toBe(true);
  });
  it("widens the minimum plateau length for a much longer report span", () => {
    // Same 7-day blip, but embedded in a ~207-day span: the bucket grows
    // to ~16 days (round(207 / 13)), so the blip no longer aligns to a
    // bucket boundary and gets folded into a single wider, blended segment
    // instead of standing out as its own precise 7-day feature.
    const rows = [
      ...flatRows(100, 50, 0),
      ...flatRows(7, 80, 100),
      ...flatRows(100, 50, 107),
    ];
    const segments = plateauSegments(rows);
    const blended = segments.filter((r) => r.value !== 50);
    expect(blended).toHaveLength(16);
    expect(blended.every((r) => r.value !== 80)).toBe(true);
  });
});

describe("plateauSegments bridges gaps using interpolation, for continuous coverage", () => {
  const dateAt = (dayIndex: number) =>
    new Date(2026, 0, 1 + dayIndex).toISOString().slice(0, 10);
  it("covers every calendar day across a large real-data gap when both sides read the same value", () => {
    // A ~43-day stretch with no real readings at all between two short
    // clusters. The overlay must not leave a hole there: it's filled the
    // same way the chart's own line is (linear interpolation via
    // denseDaily), so a steady value either side of the gap reads as one
    // unbroken plateau across the whole range, matching how charts like
    // Body mass index / Body fat / Lean body mass are sampled sporadically
    // (e.g. an occasionally-used smart scale) but should still read as
    // continuous plateaus, not gaps.
    const regimeA = Array.from({ length: 3 }, (_, i) => ({
      date: dateAt(i),
      value: 40,
      unit: "mmHg",
    }));
    const regimeB = Array.from({ length: 20 }, (_, i) => ({
      date: dateAt(45 + i),
      value: 40,
      unit: "mmHg",
    }));
    const segments = plateauSegments([...regimeA, ...regimeB]);
    expect(segments).toHaveLength(65);
    expect(segments[0].date).toBe(dateAt(0));
    expect(segments.at(-1)!.date).toBe(dateAt(64));
    expect(segments.every((s) => s.value === 40)).toBe(true);
  });
  it("still finds a plateau in sparse-but-regular readings spanning a long calendar range", () => {
    // Only 11 real readings (every 3rd day) over a 31-day span — too few
    // raw readings to hit the old 14-reading minimum, but the span itself
    // is long enough, and the gaps between readings are small enough
    // (well under the 7-day bucket), that this should still read as one
    // steady 31-day plateau once the small gaps are filled in.
    const rows = Array.from({ length: 11 }, (_, i) => ({
      date: dateAt(i * 3),
      value: 20,
      unit: "%",
    }));
    const segments = plateauSegments(rows);
    expect(segments).toHaveLength(31);
    expect(segments.every((s) => s.value === 20)).toBe(true);
    // Includes dates that were only ever interpolated filler, not raw
    // readings, proving the plateau spans the full calendar range.
    expect(segments.some((s) => s.date === dateAt(1))).toBe(true);
  });
});

describe("blood pressure derived metrics", () => {
  const bpRows: HealthRecord[] = [
    {
      metric: "bloodPressureSystolic",
      date: "2026-01-01T08:00:00.000Z",
      value: 130,
      unit: "mmHg",
    },
    {
      metric: "bloodPressureDiastolic",
      date: "2026-01-01T08:00:00.000Z",
      value: 80,
      unit: "mmHg",
    },
    {
      metric: "bloodPressureSystolic",
      date: "2026-01-02T08:00:00.000Z",
      value: 120,
      unit: "mmHg",
    },
  ];
  it("joins systolic/diastolic by date and computes pulse pressure and MAP", () => {
    const result = bpDerived(bpRows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2026-01-01",
      unit: "mmHg",
      systolic: 130,
      diastolic: 80,
      pulsePressure: 50,
    });
    expect(result[0].map).toBeCloseTo(96.667, 2);
  });
  it("averages a period of derived days", () => {
    expect(
      bpPeriodAverage([
        { systolic: 130, diastolic: 80 },
        { systolic: 120, diastolic: 70 },
      ]),
    ).toEqual({ systolic: 125, diastolic: 75 });
  });
  it("returns undefined for an empty period", () => {
    expect(bpPeriodAverage([])).toBeUndefined();
  });
});

describe("blood pressure categorization", () => {
  it("classifies Swedish categories at each threshold boundary", () => {
    expect(bpCategorySwedish(115, 75)).toBe("Optimal");
    expect(bpCategorySwedish(125, 78)).toBe("Normal");
    expect(bpCategorySwedish(132, 86)).toBe("High normal");
    expect(bpCategorySwedish(145, 92)).toBe("Grade 1 hypertension");
    expect(bpCategorySwedish(165, 102)).toBe("Grade 2 hypertension");
    expect(bpCategorySwedish(185, 115)).toBe("Grade 3 hypertension");
  });
  it("classifies AHA categories at each threshold boundary", () => {
    expect(bpCategoryAha(118, 76)).toBe("Normal");
    expect(bpCategoryAha(125, 78)).toBe("Elevated");
    expect(bpCategoryAha(135, 85)).toBe("Stage 1");
    expect(bpCategoryAha(145, 95)).toBe("Stage 2");
    expect(bpCategoryAha(185, 125)).toBe("Crisis");
  });
});
describe("longestElevatedRun", () => {
  const days = (categories: string[]) =>
    categories.map((category, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      category,
    }));
  it("finds the longest run at or above the floor category", () => {
    const series = days([
      "Normal",
      "Grade 1 hypertension",
      "Grade 1 hypertension",
      "Grade 2 hypertension",
      "Grade 1 hypertension",
      "Normal",
      "Normal",
    ]);
    expect(
      longestElevatedRun(series, bpCategoryOrderSwedish, "Grade 1 hypertension"),
    ).toEqual({ start: "2026-01-02", end: "2026-01-05", length: 4 });
  });
  it("ignores a run shorter than the 3-day minimum", () => {
    const series = days([
      "Normal",
      "Grade 1 hypertension",
      "Grade 1 hypertension",
      "Normal",
    ]);
    expect(
      longestElevatedRun(series, bpCategoryOrderSwedish, "Grade 1 hypertension"),
    ).toBeUndefined();
  });
  it("returns undefined when no day reaches the floor category", () => {
    const series = days(["Optimal", "Normal", "High normal"]);
    expect(
      longestElevatedRun(series, bpCategoryOrderSwedish, "Grade 1 hypertension"),
    ).toBeUndefined();
  });
});
describe("format", () => {
  it("formats zero with fixed decimals and a trailing unit", () => {
    expect(format(0, "kg", 1)).toBe(
      `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0)} kg`,
    );
  });
  it("formats negative fractional values", () => {
    expect(format(-3.456, "kg", 2)).toBe(
      `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(-3.456)} kg`,
    );
  });
  it("rounds to the configured decimals", () => {
    expect(format(72.5, "bpm", 0)).toBe(
      `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(72.5)} bpm`,
    );
  });
  it("omits the unit suffix when no unit is given", () => {
    expect(format(5, "", 0)).toBe(
      new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(5),
    );
  });
  it("falls back to maximumFractionDigits: 1 when decimals is omitted", () => {
    expect(format(3.14159)).toBe(
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(3.14159),
    );
  });
  it("constructs at most one NumberFormat per decimals configuration", () => {
    const originalNumberFormat = Intl.NumberFormat;
    const ctorSpy = vi.spyOn(Intl, "NumberFormat");
    ctorSpy.mockImplementation(function(this: any, ...args: any[]) {
      return new originalNumberFormat(...args);
    } as any);
    format(1, "kg", 3);
    format(2, "kg", 3);
    format(3, "kg", 3);
    const callsForThreeDecimals = ctorSpy.mock.calls.filter(
      ([, options]) =>
        (options as Intl.NumberFormatOptions | undefined)?.minimumFractionDigits === 3,
    ).length;
    expect(callsForThreeDecimals).toBeLessThanOrEqual(1);
    ctorSpy.mockRestore();
  });
});
describe("formatDate", () => {
  it("formats an ISO day string as a local calendar date", () => {
    expect(formatDate("2026-01-01")).toBe(
      new Date("2026-01-01T00:00:00").toLocaleDateString(),
    );
  });
  it("returns 'Invalid Date' instead of throwing for an unparseable date", () => {
    expect(() => formatDate("not-a-date")).not.toThrow();
    expect(formatDate("not-a-date")).toBe("Invalid Date");
  });
});
describe("rangeMetadata", () => {
  it("returns empty presence and span data for no records", () => {
    const metadata = rangeMetadata([]);
    expect(metadata.presentMetrics.size).toBe(0);
    expect(metadata.spanByMetric.size).toBe(0);
  });
  it("tracks earliest/latest per metric across a mixed, sorted array", () => {
    const mixed: HealthRecord[] = [
      { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
      { metric: "steps", date: "2026-01-05T12:00:00.000Z", value: 500, unit: "count" },
      { metric: "weight", date: "2026-01-10T09:00:00.000Z", value: 71, unit: "kg" },
    ];
    const metadata = rangeMetadata(mixed);
    expect([...metadata.presentMetrics].sort()).toEqual(["steps", "weight"]);
    expect(metadata.spanByMetric.get("weight")).toEqual({
      earliest: "2026-01-01",
      latest: "2026-01-10",
    });
    expect(metadata.spanByMetric.get("steps")).toEqual({
      earliest: "2026-01-05",
      latest: "2026-01-05",
    });
  });
});

describe("symptom report helpers", () => {
  const symptoms: SymptomRecord[] = [
    {
      symptom: "headache",
      start: "2026-01-01T08:00:00.000Z",
      end: "2026-01-01T12:00:00.000Z",
      value: "HKCategoryValuePresencePresent",
    },
    {
      symptom: "headache",
      start: "2026-01-02T08:00:00.000Z",
      end: "2026-01-02T10:00:00.000Z",
      value: "HKCategoryValuePresencePresent",
    },
    {
      symptom: "dizziness",
      start: "2026-01-02T13:00:00.000Z",
      end: "2026-01-02T13:00:00.000Z",
      value: "HKCategoryValuePresencePresent",
    },
    {
      symptom: "fatigue",
      start: "2026-01-03T00:00:00.000Z",
      end: "2026-01-04T00:00:00.000Z",
      value: "HKCategoryValuePresencePresent",
    },
  ];

  it("summarizes episodes and expands multi-day events into symptom days", async () => {
    const report = await import("../src/report");
    expect(report.symptomSummary(symptoms)).toMatchObject({
      episodeCount: 4,
      symptomCount: 3,
      symptomDays: 4,
      medianDurationHours: 3,
    });
    expect(report.symptomDays(symptoms, "2026-01-01", "2026-01-03")).toEqual([
      { date: "2026-01-01", symptoms: ["headache"], episodeCount: 1 },
      {
        date: "2026-01-02",
        symptoms: ["dizziness", "headache"],
        episodeCount: 2,
      },
      { date: "2026-01-03", symptoms: ["fatigue"], episodeCount: 1 },
    ]);
    expect(report.symptomEpisodes(symptoms)[0]).toMatchObject({
      symptom: "fatigue",
      durationHours: 24,
      key: "fatigue|2026-01-03T00:00:00.000Z|2026-01-04T00:00:00.000Z",
    });
  });

  it("keeps symptom intervals that overlap the selected date range", async () => {
    const report = await import("../src/report");
    expect(report.filteredSymptoms(symptoms, "2026-01-02", "2026-01-02")).toHaveLength(2);
    expect(report.filteredSymptoms(symptoms, "2026-01-05", "2026-01-06")).toEqual([]);
  });

  it("compares symptom-day and other-day medians only with enough coverage", async () => {
    const associationSymptoms = symptoms.slice(0, 2).concat({
      symptom: "fatigue",
      start: "2026-01-03T00:00:00.000Z",
      end: "2026-01-03T00:00:00.000Z",
      value: "HKCategoryValuePresencePresent",
    });
    const records: HealthRecord[] = [
      ...[70, 71, 72].map((value, index) => ({
        metric: "heartRate" as const,
        date: `2026-01-0${index + 1}T12:00:00.000Z`,
        value,
        unit: "count/min",
      })),
      ...[60, 61, 62].map((value, index) => ({
        metric: "heartRate" as const,
        date: `2026-01-0${index + 4}T12:00:00.000Z`,
        value,
        unit: "count/min",
      })),
      ...[6, 5, 7, 8, 8].map((value, index) => ({
        metric: "sleep" as const,
        date: `2026-01-0${index + 1}T12:00:00.000Z`,
        value,
        unit: "hr",
      })),
    ];
    const report = await import("../src/report");
    const associations = report.symptomAssociations(associationSymptoms, records);
    expect(associations.find((item) => item.metric === "heartRate")).toMatchObject({
      symptomDays: 3,
      otherDays: 3,
      symptomMedian: 71,
      otherMedian: 61,
      difference: 10,
      unit: "count/min",
    });
    expect(associations.find((item) => item.metric === "sleep")).toMatchObject({
      symptomDays: 3,
      otherDays: 2,
      difference: undefined,
    });
  });
});
