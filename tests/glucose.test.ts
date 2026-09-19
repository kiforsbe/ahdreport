import { describe, expect, it } from "vitest";
import type { HealthRecord } from "../src/shared/types";
import {
  activitySessions,
  classifyGlucose,
  defaultGlucoseRange,
  glucoseAssociations,
  glucoseDaily,
  glucoseHourlyProfile,
  glucoseSummary,
  localDay,
  presetRange,
  sleepNights,
  withCustomBound,
} from "../src/glucose";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 0, 1 + day, hour, minute).toISOString();
const glucose = (date: string, value: number, category?: string): HealthRecord => ({
  metric: "bloodGlucose",
  date,
  value,
  unit: "mmol/L",
  category,
});
const byDate = (records: HealthRecord[]) =>
  records.slice().sort((a, b) => a.date.localeCompare(b.date));
function denseDays(days: number, perDay = 96, value = 6.0) {
  const out: HealthRecord[] = [];
  for (let d = 0; d < days; d++)
    for (let k = 0; k < perDay; k++) out.push(glucose(at(d, 0, k * 15), value));
  return out;
}
const type2 = defaultGlucoseRange;

describe("target range", () => {
  it("classifies inclusively at the bounds", () => {
    expect(classifyGlucose(3.9, type2)).toBe("within");
    expect(classifyGlucose(10.0, type2)).toBe("within");
    expect(classifyGlucose(3.89, type2)).toBe("below");
    expect(classifyGlucose(10.01, type2)).toBe("above");
  });
  it("provides presets", () => {
    expect(presetRange("pregnancy")).toEqual({ preset: "pregnancy", low: 3.5, high: 7.8 });
    expect(presetRange("custom")).toEqual({ preset: "custom", low: 4.0, high: 10.0 });
  });
  it("accepts valid custom bounds and keeps the last valid range otherwise", () => {
    expect(withCustomBound(type2, "low", 4.5)).toEqual({ preset: "custom", low: 4.5, high: 10 });
    expect(withCustomBound(type2, "low", 12)).toBe(type2);
    expect(withCustomBound(type2, "high", 25)).toBe(type2);
    expect(withCustomBound(type2, "low", 1.5)).toBe(type2);
    expect(withCustomBound(type2, "low", Number.NaN)).toBe(type2);
  });
});

describe("glucoseSummary", () => {
  it("returns undefined without readings", () => {
    expect(glucoseSummary([], type2, "", "")).toBeUndefined();
  });

  it("uses count-based shares for spot readings", () => {
    const records = [glucose(at(0, 8), 5), glucose(at(0, 12), 8), glucose(at(0, 18), 12)];
    const s = glucoseSummary(records, type2, "", "")!;
    expect(s.dense).toBe(false);
    expect(s.gmi).toBeUndefined();
    expect(s.median).toBe(8);
    expect(s.split.within).toBeCloseTo(2 / 3, 10);
    expect(s.split.above).toBeCloseTo(1 / 3, 10);
    expect(s.latest.value).toBe(12);
    expect(s.windowDays).toBe(1);
  });

  it("weights continuous readings by time to the next reading, capped at 15 minutes", () => {
    const extras = Array.from({ length: 14 }, (_, i) => glucose(at(0, 12, i + 1), 12));
    const records = byDate([...denseDays(14), ...extras]);
    const s = glucoseSummary(records, type2, localDay(at(0, 0)), localDay(at(13, 0)))!;
    expect(s.dense).toBe(true);
    // 1342 base readings × 15 min + 12:00 base (1) + 14 extras (1 each) + last reading (5)
    expect(s.split.above).toBeCloseTo(14 / 20150, 10);
  });

  it("gates continuous metrics on 14 days and 70% coverage", () => {
    const from = localDay(at(0, 0));
    expect(glucoseSummary(denseDays(13), type2, from, localDay(at(12, 0)))!.dense).toBe(false);
    expect(glucoseSummary(denseDays(14, 67), type2, from, localDay(at(13, 0)))!.dense).toBe(false);
    expect(glucoseSummary(denseDays(14, 68), type2, from, localDay(at(13, 0)))!.dense).toBe(true);
  });

  it("computes GMI, IFCC and CV", () => {
    const s = glucoseSummary(denseDays(14), type2, localDay(at(0, 0)), localDay(at(13, 0)))!;
    expect(s.gmi!.percent).toBeCloseTo(5.896, 3);
    expect(s.gmi!.mmolPerMol).toBeCloseTo(40.92, 2);
    expect(s.cv).toBe(0);
  });

  it("summarizes meal-time tags without inferring untagged readings", () => {
    const records = [
      glucose(at(0, 7), 5, "beforeMeal"),
      glucose(at(0, 9), 9, "afterMeal"),
      glucose(at(0, 12), 7, "beforeMeal"),
      glucose(at(0, 15), 6),
    ];
    const s = glucoseSummary(records, type2, "", "")!;
    expect(s.mealContext.beforeMeal).toEqual({ count: 2, median: 6 });
    expect(s.mealContext.afterMeal).toEqual({ count: 1, median: 9 });
    expect(s.mealContext.untagged).toEqual({ count: 1, median: 6 });
  });
});

describe("context events", () => {
  const exercise = (date: string, minutes: number): HealthRecord => ({
    metric: "exerciseTime",
    date,
    value: minutes,
    unit: "min",
  });
  const sleep = (date: string, hours: number, stage: string): HealthRecord => ({
    metric: "sleep",
    date,
    value: hours,
    unit: "hr",
    category: `HKCategoryValueSleepAnalysis${stage}`,
  });

  it("merges exercise minutes into sessions and drops sessions under 10 minutes", () => {
    const sessions = activitySessions([
      exercise(at(0, 8, 0), 5),
      exercise(at(0, 8, 5), 5),
      exercise(at(0, 8, 18), 5),
      exercise(at(0, 12, 0), 5),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].minutes).toBe(15);
    expect(sessions[0].start).toBe(Date.parse(at(0, 8, 0)));
    expect(sessions[0].end).toBe(Date.parse(at(0, 8, 23)));
  });

  it("does not double-count overlapping exercise records from two sources", () => {
    const sessions = activitySessions([exercise(at(0, 8), 10), exercise(at(0, 8), 10)]);
    expect(sessions[0].minutes).toBe(10);
  });

  it("groups asleep segments into nights, excluding in-bed and awake", () => {
    const nights = sleepNights([
      sleep(at(0, 21, 30), 9, "InBed"),
      sleep(at(0, 22, 0), 2, "AsleepCore"),
      sleep(at(1, 0, 0), 0.2, "Awake"),
      sleep(at(1, 0, 15), 1.5, "AsleepREM"),
      sleep(at(1, 2, 0), 4, "AsleepCore"),
      sleep(at(1, 23, 0), 7, "AsleepCore"),
    ]);
    expect(nights).toHaveLength(2);
    expect(nights[0].hours).toBeCloseTo(7.5, 10);
    expect(nights[0].end).toBe(Date.parse(at(1, 6, 0)));
    expect(nights[0].date).toBe(localDay(at(1, 6, 0)));
  });
});

describe("glucoseDaily and glucoseHourlyProfile", () => {
  it("builds newest-first local-day rows with context and insulin totals", () => {
    const records = byDate([
      glucose(at(0, 8), 5.0, "beforeMeal"),
      glucose(at(0, 10), 11.0, "afterMeal"),
      glucose(at(0, 22), 3.5),
      { metric: "carbs", date: at(0, 8, 10), value: 45, unit: "g" },
      { metric: "insulinDelivery", date: at(0, 8, 5), value: 6, unit: "IU", category: "bolus" },
      { metric: "insulinDelivery", date: at(0, 12), value: 2, unit: "IU" },
      { metric: "insulinDelivery", date: at(0, 22), value: 14, unit: "IU", category: "basal" },
      { metric: "exerciseTime", date: at(0, 18), value: 20, unit: "min" },
      glucose(at(1, 9), 7.0),
    ]);
    const days = glucoseDaily(records, type2);
    expect(days.map((d) => d.date)).toEqual([localDay(at(1, 9)), localDay(at(0, 8))]);
    const day = days[1];
    expect(day).toMatchObject({
      count: 3,
      min: 3.5,
      max: 11,
      median: 5,
      counts: { below: 1, within: 1, above: 1 },
      beforeMealMedian: 5,
      afterMealMedian: 11,
      basal: 14,
      bolus: 6,
      unspecifiedInsulin: 2,
    });
    expect(day.carbs).toHaveLength(1);
    expect(day.activity).toHaveLength(1);
  });

  it("computes hour-of-day percentiles and leaves empty hours without values", () => {
    const records = Array.from({ length: 21 }, (_, i) => glucose(at(i, 8, 30), i + 1));
    const profile = glucoseHourlyProfile(records);
    expect(profile).toHaveLength(24);
    expect(profile[8].percentiles).toMatchObject({ p5: 2, p50: 11, p95: 20 });
    expect(profile[3]).toEqual({ hour: 3, count: 0 });
  });
});

describe("glucoseAssociations", () => {
  const carbs = (date: string, grams: number): HealthRecord => ({ metric: "carbs", date, value: grams, unit: "g" });

  it("reports the median rise after logged carbohydrates once 5 pairs exist", () => {
    const records: HealthRecord[] = [];
    for (let d = 0; d < 5; d++)
      records.push(
        glucose(at(d, 7, 50), 6.0),
        carbs(at(d, 8, 0), 50),
        glucose(at(d, 9, 0), 8.5),
        glucose(at(d, 9, 30), 9.0),
      );
    const result = glucoseAssociations(byDate(records));
    expect(result.carbs).toEqual({ n: 5, value: 3 });
    const fewer = glucoseAssociations(byDate(records.slice(4)));
    expect(fewer.carbs.n).toBe(4);
    expect(fewer.carbs.value).toBeUndefined();
  });

  it("ignores carbohydrate entries without a reading in the previous 30 minutes", () => {
    const records = byDate([glucose(at(0, 7, 0), 6.0), carbs(at(0, 8, 0), 50), glucose(at(0, 9, 0), 9)]);
    expect(glucoseAssociations(records).carbs.n).toBe(0);
  });

  it("uses the reading closest to 2 hours after activity starts", () => {
    const records: HealthRecord[] = [];
    for (let d = 0; d < 5; d++)
      records.push(
        glucose(at(d, 16, 55), 7.0),
        { metric: "exerciseTime", date: at(d, 17, 0), value: 30, unit: "min" },
        glucose(at(d, 19, 0), 6.0),
        glucose(at(d, 20, 30), 5.0),
      );
    expect(glucoseAssociations(byDate(records)).activity).toEqual({ n: 5, value: -1 });
  });

  it("compares first morning readings after shorter and longer nights", () => {
    const records: HealthRecord[] = [];
    [5, 8, 5, 8, 5, 8].forEach((hours, d) => {
      const wake = new Date(2026, 0, 2 + d, 7, 0).getTime();
      records.push(
        {
          metric: "sleep",
          date: new Date(wake - hours * 3_600_000).toISOString(),
          value: hours,
          unit: "hr",
          category: "HKCategoryValueSleepAnalysisAsleepCore",
        },
        glucose(new Date(wake + 20 * 60_000).toISOString(), hours === 5 ? 7.5 : 6.5),
      );
    });
    const { sleep } = glucoseAssociations(byDate(records));
    expect(sleep).toEqual({ shorter: 3, longer: 3, splitHours: 6.5, value: 1 });
  });

  it("does not use a morning reading taken after the first carbohydrate entry", () => {
    const records: HealthRecord[] = [];
    [5, 8].forEach((hours, d) => {
      const wake = new Date(2026, 0, 2 + d, 7, 0).getTime();
      records.push({
        metric: "sleep",
        date: new Date(wake - hours * 3_600_000).toISOString(),
        value: hours,
        unit: "hr",
        category: "HKCategoryValueSleepAnalysisAsleepCore",
      });
      // Carbs before the reading on the short night only.
      if (hours === 5) records.push(carbs(new Date(wake + 10 * 60_000).toISOString(), 30));
      records.push(glucose(new Date(wake + 20 * 60_000).toISOString(), 9));
    });
    const { sleep } = glucoseAssociations(byDate(records));
    expect(sleep.shorter).toBe(0);
    expect(sleep.longer).toBe(1);
  });
});
