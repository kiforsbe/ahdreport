import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { glucoseChartAxis, defaultGlucoseRange } from "../src/glucose";
import { GlucoseOverview } from "../src/components/glucose/GlucoseOverview";
import type { HealthRecord } from "../src/shared/types";

const glucose = (value: number, hour = 8, day = 1): HealthRecord => ({
  metric: "bloodGlucose", value, unit: "mmol/L",
  date: new Date(2026, 0, day, hour).toISOString(),
});

describe("adaptive glucose chart axis", () => {
  it("keeps the normal 3–12 range including measurements at either boundary", () => {
    expect(glucoseChartAxis([glucose(3), glucose(12, 10)])).toMatchObject({ min: 3, max: 12 });
    expect(glucoseChartAxis([])).toMatchObject({ min: 3, max: 12 });
  });

  it.each([
    [2.7, 8, 2, 12],
    [5, 12.2, 3, 13],
    [1.8, 24.2, 1, 25],
  ])("expands for observed extremes %s and %s without clipping", (low, high, min, max) => {
    const axis = glucoseChartAxis([glucose(low), glucose(high, 10)]);
    expect(axis).toMatchObject({ min, max });
    expect(axis.ticks[0]).toBe(min);
    expect(axis.ticks.at(-1)).toBe(max);
  });

  it("includes the displayed calendar-first fasting reading but not unrelated history", () => {
    const reading = glucose(6);
    const context = [glucose(25, 8, 10), glucose(2.7, 5), reading];
    expect(glucoseChartAxis([reading], context)).toMatchObject({ min: 2, max: 12 });
  });

  const charts = () => [
    screen.getByRole("img", { name: /Fasting readings and meal-response candles/ }),
    screen.getByRole("img", { name: /Hourly glucose heatmap/ }),
  ];
  const tickValues = (chart: HTMLElement) => [...chart.querySelectorAll(".glucose-y-axis text")].map(t => Number(t.textContent));

  it("keeps the upper chart's 3–12 scale and retains the actual hourly values below", () => {
    const records = [glucose(3), glucose(12, 10)];
    render(<GlucoseOverview records={records} from="2026-01-01" to="2026-01-01" range={defaultGlucoseRange} onRangeChange={() => {}} hasGlucose />);
    const [meal, daily] = charts();
    expect(tickValues(meal)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...meal.querySelectorAll(".glucose-meal-candle circle")].map(p => Number(p.getAttribute("cy")))).toEqual([245, 18]);
    expect([...daily.querySelectorAll(".glucose-hour-cell")].map(c => c.getAttribute("data-mean"))).toEqual(["3", "12"]);
  });

  it("expands the upper value axis without clipping extreme hourly values in the heatmap", () => {
    const records = [glucose(2.7), glucose(16.2, 10)];
    render(<GlucoseOverview records={records} from="2026-01-01" to="2026-01-01" range={defaultGlucoseRange} onRangeChange={() => {}} hasGlucose />);
    const [meal, daily] = charts();
    expect(tickValues(meal)[0]).toBe(2);
    expect(tickValues(meal).at(-1)).toBe(17);
    const ends = [...meal.querySelectorAll(".glucose-meal-candle circle")].map(p => Number(p.getAttribute("cy")));
    expect(ends).toHaveLength(2);
    for (const cy of ends) { expect(cy).toBeGreaterThan(18); expect(cy).toBeLessThan(245); }
    expect([...daily.querySelectorAll(".glucose-hour-cell")].map(c => c.getAttribute("data-mean"))).toEqual(["2.7", "16.2"]);
    expect(daily.querySelectorAll(".glucose-hour-below")).toHaveLength(1);
    expect(daily.querySelectorAll(".glucose-hour-above")).toHaveLength(1);
  });

  it("includes pre-06:00 fasting in the upper scale and lower fasting stripe", () => {
    const records = [glucose(6), glucose(8, 10)];
    render(<GlucoseOverview records={records} contextRecords={[glucose(2.7, 5), ...records]}
      from="2026-01-01" to="2026-01-01" range={defaultGlucoseRange} onRangeChange={() => {}} hasGlucose />);
    const [meal, daily] = charts();
    expect(tickValues(meal)[0]).toBe(2);
    expect(tickValues(meal).at(-1)).toBe(12);
    expect(daily.querySelector(".glucose-fasting-marker")).toHaveAccessibleName(/2[.,]7 at 05:00/);
    expect([...daily.querySelectorAll(".glucose-hour-cell")].map(c => c.getAttribute("data-mean"))).toEqual(["6", "8"]);
  });

  it("clips a custom target band's shading to the plot instead of expanding beyond the data", () => {
    const records = [glucose(5), glucose(8, 10)];
    render(<GlucoseOverview records={records} from="2026-01-01" to="2026-01-01"
      range={{ preset: "custom", low: 2, high: 20 }} onRangeChange={() => {}} hasGlucose />);
    const [meal, daily] = charts();
    expect(meal.querySelector(".glucose-target-band")).toHaveAttribute("y", "18");
    expect(meal.querySelector(".glucose-target-band")).toHaveAttribute("height", "227");
    expect(daily.querySelector(".glucose-target-band")).toBeNull();
    expect(daily.querySelectorAll(".glucose-hour-below, .glucose-hour-above")).toHaveLength(0);
  });
});
