import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  defaultGlucoseRange, glucoseDaily, glucoseMealPairs, glucoseMorningReading,
  glucoseTrackingDay, glucoseTrackingWindow, glucoseReferenceGuides, presetRange,
  glucoseTrackingRecords,
} from "../src/glucose";
import { GlucoseOverview } from "../src/components/glucose/GlucoseOverview";
import type { HealthRecord } from "../src/shared/types";
import { GlucoseImpactChart } from "../src/components/glucose/GlucoseImpactChart";
import { GlucoseTimeline } from "../src/components/glucose/GlucoseTimeline";
import { PrintLayoutContext } from "../src/PrintLayoutContext";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 0, day, hour, minute).toISOString();
const g = (day: number, hour: number, value: number, category?: string): HealthRecord =>
  ({ metric: "bloodGlucose", date: at(day, hour), value, category, unit: "mmol/L" });
const carb = (day: number, hour: number): HealthRecord =>
  ({ metric: "carbs", date: at(day, hour, 10), value: 40, unit: "g" });

describe("morning-to-morning glucose tracking", () => {
  it("assigns pre-boundary readings to the preceding local day", () => {
    expect(glucoseTrackingDay(at(2, 5, 59), 6)).toBe("2026-01-01");
    expect(glucoseTrackingDay(at(2, 6), 6)).toBe("2026-01-02");
    const { start, end } = glucoseTrackingWindow("2026-01-01", 6);
    expect(start).toBe(Date.parse(at(1, 6)));
    expect(end).toBe(Date.parse(at(2, 6)));
  });

  it("groups readings and context across midnight and counts the boundary once", () => {
    const days = glucoseDaily([g(1, 23, 6), carb(2, 0), g(2, 1, 8), g(2, 6, 5)], defaultGlucoseRange, 6);
    expect(days.map(d => [d.date, d.count])).toEqual([["2026-01-02", 1], ["2026-01-01", 2]]);
    expect(days[1].carbs).toHaveLength(1);
  });

  it("uses the next local morning across daylight-saving changes", () => {
    const { start, end } = glucoseTrackingWindow("2026-03-28", 6);
    expect(new Date(start).getHours()).toBe(6);
    expect(new Date(end).getHours()).toBe(6);
    expect(new Date(end).getDate()).toBe(29);
  });

  it("includes the following morning of the final report day and clips at its boundary", () => {
    const selected = glucoseTrackingRecords([g(1, 5, 5), g(1, 7, 6), g(2, 5, 7), g(2, 6, 8)], "2026-01-01", "2026-01-01", 6);
    expect(selected.map(r => r.value)).toEqual([6, 7]);
  });
});

describe("meal-response evidence", () => {
  it("pairs readings 1–3 hours apart across midnight with elapsed time and delta", () => {
    const pairs = glucoseMealPairs([g(1, 23, 5, "beforeMeal"), g(2, 1, 8, "afterMeal")]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ minutes: 120, delta: 3, evidence: "tags" });
  });

  it("keeps timing-only pairs distinct from logged meals and rejects outside the window", () => {
    expect(glucoseMealPairs([g(1, 8, 5), g(1, 10, 7)])[0].evidence).toBe("timing");
    expect(glucoseMealPairs([g(1, 8, 5), carb(1, 8), g(1, 10, 7)])[0].evidence).toBe("carbs");
    expect(glucoseMealPairs([g(1, 8, 5), g(1, 12, 7)])).toHaveLength(0);
    expect(glucoseMealPairs([g(1, 8, 5), g(1, 8, 7)])).toHaveLength(0);
    expect(glucoseMealPairs([g(1, 8, 5, "afterMeal"), g(1, 10, 7, "beforeMeal")])).toHaveLength(0);
  });

  it("represents every consecutive 1–3 hour difference even when a reading is shared", () => {
    const pairs = glucoseMealPairs([g(1, 8, 5), g(1, 10, 7), g(1, 12, 8)]);
    expect(pairs.map(p => p.delta)).toEqual([2, 1]);
  });

  it("marks the first reading before 10:00 as assumed fasting, but never confirms it", () => {
    expect(glucoseMorningReading([g(1, 7, 5)], "2026-01-01", 6)?.confirmedFasting).toBe(false);
    expect(glucoseMorningReading([g(1, 7, 5)], "2026-01-01", 6)?.assumedFasting).toBe(true);
    expect(glucoseMorningReading([g(1, 7, 5, "fasting")], "2026-01-01", 6)?.confirmedFasting).toBe(true);
    expect(glucoseMorningReading([g(1, 7, 8, "afterMeal")], "2026-01-01", 6)).toBeUndefined();
    expect(glucoseMorningReading([g(1, 10, 5)], "2026-01-01", 6)).toBeUndefined();
    expect(glucoseMorningReading([g(1, 5, 5), g(1, 7, 6)], "2026-01-01", 6)?.reading.value).toBe(5);
  });
});

describe("non-diabetic reference guides", () => {
  it("shows contextual risk indicators only for the non-diabetic target", () => {
    const reference = presetRange("reference");
    expect(glucoseReferenceGuides(reference).map(g => g.value)).toEqual([5.6, 7, 11.1]);
    expect(glucoseReferenceGuides(defaultGlucoseRange)).toEqual([]);
  });
});

describe("glucose impact overview", () => {
  const records = [g(1, 7, 5), g(1, 8, 5, "beforeMeal"), carb(1, 8), g(1, 10, 8, "afterMeal"), g(2, 1, 7), g(2, 7, 6)];
  it("keeps timed meal pairs and fasting markers in the upper chart without a day selector", () => {
    const { container } = render(<GlucoseOverview records={records} from="2026-01-01" to="2026-01-02"
      range={presetRange("reference")} onRangeChange={() => {}} hasGlucose />);
    const chart = screen.getByRole("img", { name: /Fasting readings and meal-response candles/ });
    expect(chart.querySelectorAll(".glucose-fasting-marker")).toHaveLength(2);
    expect(chart.querySelectorAll(".glucose-meal-candle")).toHaveLength(1);
    expect(screen.queryByLabelText("Tracking day")).not.toBeInTheDocument();
    fireEvent.focus(chart.querySelector(".glucose-meal-candle")!);
    expect(container.querySelector(".glucose-impact-tooltip")).toHaveTextContent(/120 min/);
    expect(screen.queryByLabelText("Reference lines")).not.toBeInTheDocument();
    expect(chart.querySelectorAll("line.glucose-reference-line")).toHaveLength(3);
    expect(screen.getByText(/2-hour diagnostic-test threshold 11[.,]1/)).toBeInTheDocument();
    expect(container.querySelectorAll(".glucose-reference-line").length).toBeGreaterThan(2);
  });

  it("shows only days with data and identifies missing meal follow-ups", () => {
    render(<GlucoseOverview records={[g(1, 8, 5), g(3, 8, 6)]} from="2026-01-01" to="2026-01-03"
      range={defaultGlucoseRange} onRangeChange={() => {}} hasGlucose />);
    const chart = screen.getByRole("img", { name: /Fasting readings and meal-response candles/ });
    expect(chart.querySelectorAll(".glucose-fasting-marker")).toHaveLength(2);
    expect(chart.querySelectorAll(".glucose-meal-candle")).toHaveLength(0);
    expect(screen.getByText(/No consecutive readings 1–3 hours apart/)).toBeInTheDocument();
  });

  it("keeps different hours separate and explores their means without inventing readings", () => {
    const { container } = render(<GlucoseTimeline records={[g(1, 8, 5), g(1, 10, 7), g(1, 12, 8)]} range={defaultGlucoseRange} from="2026-01-01" to="2026-01-01" continuous={false} />);
    const cells = [...container.querySelectorAll(".glucose-hour-cell")];
    expect(cells.map(c => [c.getAttribute("data-hour"), c.getAttribute("data-mean")])).toEqual([["8", "5"], ["10", "7"], ["12", "8"]]);
    const explorer = screen.getByRole("group", { name: /Explore hourly glucose/ });
    fireEvent.keyDown(explorer, { key: "ArrowUp" });
    expect(screen.getByRole("status")).toHaveTextContent("No readings in this hour");
    fireEvent.keyDown(explorer, { key: "ArrowUp" });
    expect(screen.getByRole("status")).toHaveTextContent(/10:00–11:00.*Mean 7[.,]0.*1 reading/);
  });

  it("halves the timed meal chart's day spacing without replacing its pair candles", () => {
    const records = Array.from({ length: 20 }, (_, i) => [g(i + 1, 8, 5), g(i + 1, 10, 7), g(i + 1, 12, 6)]).flat();
    const { container } = render(<GlucoseImpactChart records={records} range={defaultGlucoseRange} />);
    expect(screen.getByRole("img").getAttribute("viewBox")).toBe("0 0 1244 300");
    expect(container.querySelectorAll(".glucose-meal-candle")).toHaveLength(40);
    expect(container.querySelectorAll(".glucose-daily-candle")).toHaveLength(0);
  });

  it.each([37, 180])("keeps the exported meal chart tall with %s days of readings", (days) => {
    const records = Array.from({ length: days }, (_, i) => [g(i + 1, 8, 5), g(i + 1, 10, 7)]).flat();
    render(<PrintLayoutContext.Provider value={true}>
      <GlucoseImpactChart records={records} range={defaultGlucoseRange} />
    </PrintLayoutContext.Provider>);
    const chart = screen.getByRole("img");
    const [, , width, height] = chart.getAttribute("viewBox")!.split(" ").map(Number);
    // In the 470px PDF column, the plot must stay at least 250px tall.
    expect(470 * height / width).toBeGreaterThanOrEqual(250);
    expect(chart.querySelectorAll(".glucose-meal-candle")).toHaveLength(days);
    const dates = [...chart.querySelectorAll("text")].filter(text => text.getAttribute("y") === "291");
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates.length).toBeLessThanOrEqual(9);
  });

  it("keeps the calendar-first fasting indicator even when that sample precedes 06:00", () => {
    const contextRecords = [g(1, 5, 5), g(1, 8, 7), g(1, 10, 9)];
    const { container } = render(<GlucoseTimeline records={contextRecords.slice(1)} contextRecords={contextRecords}
      range={defaultGlucoseRange} from="2026-01-01" to="2026-01-01" continuous={false} />);
    expect(container.querySelectorAll(".glucose-fasting-marker")).toHaveLength(1);
    fireEvent.focus(screen.getByRole("group", { name: /Explore hourly glucose/ }));
    expect(screen.getByRole("status")).toHaveTextContent(/Assumed fasting 5[.,]0 at 05:00/);
    expect(container.querySelector(".glucose-fasting-marker")).toHaveAccessibleName(/Assumed fasting 5[.,]0 at 05:00/);
    expect([...container.querySelectorAll(".glucose-hour-cell")].map(c => c.getAttribute("data-mean"))).toEqual(["7", "9"]);
  });
});
