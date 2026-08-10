import { describe, expect, it } from "vitest";
import {
  change,
  daily,
  dailyStats,
  decimalsByMetric,
  filtered,
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
  plateaus,
} from "../src/report";
import type { HealthRecord } from "../src/shared/types";
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

describe("plateaus", () => {
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
  it("merges into two segments for a clear two-regime series", () => {
    const result = plateaus(twoRegimeRows, "weight");
    expect(result).toHaveLength(14);
    expect(result.slice(0, 7).every((r) => r.value === 70)).toBe(true);
    expect(result.slice(7).every((r) => r.value === 90)).toBe(true);
  });
  it("returns no segments below the 14-day-with-data minimum", () => {
    expect(plateaus(twoRegimeRows.slice(0, 13), "weight")).toEqual([]);
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
