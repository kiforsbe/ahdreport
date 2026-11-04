import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlucoseOverview } from "../src/components/glucose/GlucoseOverview";
import { GlucoseDailyChart } from "../src/components/glucose/GlucoseDailyChart";
import { GlucoseTimeline } from "../src/components/glucose/GlucoseTimeline";
import { OverviewCards } from "../src/components/OverviewCards";
import { PrintLayoutContext } from "../src/PrintLayoutContext";
import {
  defaultGlucoseRange,
  formatMmol as m,
  glucoseDaily,
  glucoseRangeText,
  localDay,
  presetRange,
  type GlucoseRange,
} from "../src/glucose";
import type { HealthRecord } from "../src/shared/types";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 0, 1 + day, hour, minute).toISOString();
const glucose = (date: string, value: number, category?: string): HealthRecord => ({
  metric: "bloodGlucose",
  date,
  value,
  unit: "mmol/L",
  category,
});
const spot = [glucose(at(0, 8), 5), glucose(at(0, 12), 8), glucose(at(0, 18), 12)];
function dense(days = 14) {
  const out: HealthRecord[] = [];
  for (let d = 0; d < days; d++) for (let k = 0; k < 96; k++) out.push(glucose(at(d, 0, k * 15), 6.5));
  return out;
}
function renderOverview(
  records: HealthRecord[],
  { range = defaultGlucoseRange, hasGlucose = true, printLayout = false, onRangeChange = vi.fn() } = {},
) {
  const from = records.length ? localDay(records[0].date) : "";
  const to = records.length ? localDay(records.at(-1)!.date) : "";
  return render(
    <PrintLayoutContext.Provider value={printLayout}>
      <GlucoseOverview
        records={records}
        from={from}
        to={to}
        range={range}
        onRangeChange={onRangeChange}
        hasGlucose={hasGlucose}
      />
    </PrintLayoutContext.Provider>,
  );
}
const share = (container: HTMLElement, status: string) =>
  container.querySelector(`[data-status="${status}"] b`)?.textContent;

describe("GlucoseOverview", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing when the import has no glucose", () => {
    const { container } = renderOverview([], { hasGlucose: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an empty state when the period has no readings", () => {
    renderOverview([]);
    expect(screen.getByRole("heading", { name: "Blood glucose" })).toBeInTheDocument();
    expect(screen.getByText("No blood glucose readings were found for this period.")).toBeInTheDocument();
  });

  it("uses spot-reading wording without continuous metrics", () => {
    const { container } = renderOverview(spot);
    expect(screen.getByText("Share of recorded readings, not time in range.")).toBeInTheDocument();
    expect(screen.getByText(/^Spot readings/)).toBeInTheDocument();
    expect(screen.getByText("Readings in range")).toBeInTheDocument();
    expect(screen.queryByText("Typical day")).not.toBeInTheDocument();
    expect(screen.queryByText(/GMI/)).not.toBeInTheDocument();
    expect(share(container, "within")).toBe("67%");
    expect(screen.getByText(/Descriptive comparison only/)).toBeInTheDocument();
    expect(screen.queryByText(/Days across, hours upward/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Glucose and context" }).parentElement).toContainElement(screen.getByLabelText("Heatmap colour scheme"));
  });

  it("adds continuous metrics and the typical day for dense data", () => {
    renderOverview(dense());
    expect(screen.getByText("Share of time, weighted by continuous readings.")).toBeInTheDocument();
    expect(screen.getByText("Continuous data · 100% coverage")).toBeInTheDocument();
    expect(screen.getByText("Time in range")).toBeInTheDocument();
    expect(screen.getByText(/GMI/)).toBeInTheDocument();
    expect(screen.getByText("Typical day")).toBeInTheDocument();
  });

  it("shows meal context only for tagged readings", () => {
    renderOverview(spot);
    expect(screen.queryByText("Meal context")).not.toBeInTheDocument();
    renderOverview([glucose(at(0, 7), 5.5, "beforeMeal"), glucose(at(0, 9), 9.1, "afterMeal")]);
    expect(screen.getByText("Meal context")).toBeInTheDocument();
    expect(screen.getByText("Before meal")).toBeInTheDocument();
  });

  it("changes presets and recomputes the split for a new range", () => {
    const onRangeChange = vi.fn();
    const { container, rerender } = renderOverview(spot, { onRangeChange });
    fireEvent.change(screen.getByLabelText("Target range"), { target: { value: "pregnancy" } });
    expect(onRangeChange).toHaveBeenCalledWith({ preset: "pregnancy", low: 3.5, high: 7.8 });
    rerender(
      <PrintLayoutContext.Provider value={false}>
        <GlucoseOverview records={spot} from="" to="" range={presetRange("pregnancy")} onRangeChange={onRangeChange} hasGlucose />
      </PrintLayoutContext.Provider>,
    );
    expect(share(container, "within")).toBe("33%");
  });

  it("commits valid custom bounds on blur and ignores invalid ones", () => {
    const onRangeChange = vi.fn();
    const custom: GlucoseRange = presetRange("custom");
    renderOverview(spot, { range: custom, onRangeChange });
    const low = screen.getByLabelText("Lower target (mmol/L)");
    fireEvent.change(low, { target: { value: "4.5" } });
    fireEvent.blur(low);
    expect(onRangeChange).toHaveBeenLastCalledWith({ preset: "custom", low: 4.5, high: 10 });
    onRangeChange.mockClear();
    fireEvent.change(low, { target: { value: "12" } });
    fireEvent.blur(low);
    expect(onRangeChange).not.toHaveBeenCalled();
  });

  it("prints the target range as plain text", () => {
    renderOverview(spot, { printLayout: true });
    expect(screen.queryByLabelText("Target range")).not.toBeInTheDocument();
    expect(
      screen.getByText(`Target range: Type 2 diabetes, ${glucoseRangeText(defaultGlucoseRange)}`),
    ).toBeInTheDocument();
  });

  it.each([false, true])("keeps meal-response guidance on screen only (PDF layout: %s)", (printLayout) => {
    renderOverview(spot, { printLayout });
    for (const text of [
      "Assumed fasting",
      "Rise after inferred meal",
      "Fall after inferred meal",
      "Unpaired reading",
      /^Each day runs/,
      /^First reading before 10:00/,
    ]) {
      if (printLayout) expect(screen.queryByText(text)).not.toBeInTheDocument();
      else expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("img", { name: /Fasting readings and meal-response candles/ })).toBeInTheDocument();
    expect(screen.getByText("Share of recorded readings, not time in range.")).toBeInTheDocument();
  });
});

describe("glucose charts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws one median per day and breaks the line across missing days", () => {
    const records = [glucose(at(0, 8), 6), glucose(at(2, 8), 7), glucose(at(3, 8), 8)];
    const { container } = render(
      <GlucoseDailyChart days={glucoseDaily(records, defaultGlucoseRange)} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(3, 0))} />,
    );
    expect(container.querySelectorAll("circle.glucose-median")).toHaveLength(3);
    expect(container.querySelector("path.glucose-median-line")!.getAttribute("d")!.match(/M/g)).toHaveLength(2);
  });

  it("scales the y-axis to readings above the old fixed ceiling instead of clamping them", () => {
    const records = [glucose(at(0, 8), 12), glucose(at(1, 8), 20)];
    const { container } = render(
      <GlucoseDailyChart days={glucoseDaily(records, defaultGlucoseRange)} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(1, 0))} />,
    );
    const circles = [...container.querySelectorAll("circle.glucose-median")];
    expect(circles).toHaveLength(2);
    const cy = (el: Element) => Number(el.getAttribute("cy"));
    // 20 mmol/L must be plotted strictly higher (smaller cy) than 12 mmol/L.
    expect(cy(circles[1])).toBeLessThan(cy(circles[0]));
  });

  it("does not flatten two readings that both exceed the old fixed ceiling of 14 mmol/L", () => {
    const records = [glucose(at(0, 8), 15), glucose(at(1, 8), 25)];
    const { container } = render(
      <GlucoseDailyChart days={glucoseDaily(records, defaultGlucoseRange)} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(1, 0))} />,
    );
    const circles = [...container.querySelectorAll("circle.glucose-median")];
    expect(circles).toHaveLength(2);
    const cy = (el: Element) => Number(el.getAttribute("cy"));
    // Under the old hardcoded Y_MAX = 14, both 15 and 25 mmol/L would have
    // clamped to the same y position at the top of the chart.
    expect(cy(circles[1])).toBeLessThan(cy(circles[0]));
  });

  it("aggregates to one point per week for periods over 180 days", () => {
    const records = Array.from({ length: 200 }, (_, d) => glucose(at(d, 8), 6 + (d % 5)));
    const { container } = render(
      <GlucoseDailyChart days={glucoseDaily(records, defaultGlucoseRange)} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(199, 0))} />,
    );
    expect(screen.getByText(/one point per week/)).toBeInTheDocument();
    expect(container.querySelectorAll("circle.glucose-median")).toHaveLength(Math.ceil(200 / 7));
  });

  it("shows a tooltip for the hovered day", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 760, height: 220, right: 760, bottom: 220, x: 0, y: 0, toJSON() {},
    } as DOMRect);
    const records = [glucose(at(0, 8), 6), glucose(at(1, 8), 7), glucose(at(2, 8), 8)];
    const { container } = render(
      <GlucoseDailyChart days={glucoseDaily(records, defaultGlucoseRange)} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(2, 0))} />,
    );
    fireEvent.mouseMove(container.querySelector(".glucose-chart-hit")!, { clientX: 392 });
    expect(screen.getByRole("status")).toHaveTextContent(`Median ${m(7)} mmol/L`);
  });

  it("plots hourly cells for both spot and continuous data with daily context lanes", () => {
    const { container, unmount } = render(
      <GlucoseTimeline records={spot} range={defaultGlucoseRange} from="" to="" continuous={false} />,
    );
    expect(container.querySelectorAll(".glucose-hour-cell")).toHaveLength(3);
    ["Carbohydrates", "Insulin", "Activity", "Sleep"].forEach((lane) => expect(screen.getByText(lane)).toBeInTheDocument());
    unmount();
    const { container: dense14 } = render(
      <GlucoseTimeline records={dense()} range={defaultGlucoseRange} from="" to="" continuous />,
    );
    expect(dense14.querySelector("path.glucose-timeline-line")).toBeNull();
    expect(dense14.querySelectorAll(".glucose-hour-cell")).toHaveLength(14 * 24);
    expect([...dense14.querySelectorAll(".glucose-hour-cell")].every(c => c.getAttribute("data-mean") === "6.5")).toBe(true);
    expect(dense14.querySelectorAll("circle.glucose-timeline-point")).toHaveLength(0);
  });

  it("keeps only the measured hour occupied on sparse days", () => {
    const records = Array.from({ length: 60 }, (_, d) => glucose(at(d, 8), 12));
    const { container } = render(
      <GlucoseTimeline records={records} range={defaultGlucoseRange} from={localDay(at(0, 0))} to={localDay(at(59, 0))} continuous={false} />,
    );
    expect(screen.getByRole("img", { name: /Hourly glucose heatmap/ })).toHaveAttribute("data-days", "60");
    const cells = [...container.querySelectorAll(".glucose-hour-cell")];
    expect(cells).toHaveLength(60);
    expect(cells.every(c => c.getAttribute("data-hour") === "8" && c.getAttribute("data-mean") === "12")).toBe(true);
    expect(container.querySelectorAll(".glucose-hour-cell .glucose-hour-above")).toHaveLength(60);
  });
});

describe("OverviewCards glucose tile", () => {
  it("is absent without the glucose prop", () => {
    render(<OverviewCards records={spot} periodLabel="Last 30 days" />);
    expect(screen.queryByText("Blood glucose")).not.toBeInTheDocument();
  });
  it("shows the median and the share of readings in range", () => {
    render(
      <OverviewCards records={spot} periodLabel="Last 30 days" glucose={{ range: defaultGlucoseRange, from: "", to: "" }} />,
    );
    expect(screen.getByText("Blood glucose")).toBeInTheDocument();
    expect(screen.getByText(`${m(8)} mmol/L`)).toBeInTheDocument();
    expect(screen.getByText(`Median · 67% of readings in ${m(3.9)}–${m(10)}`)).toBeInTheDocument();
  });
});
