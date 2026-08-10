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
  metricGroups,
  outlierDates,
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
