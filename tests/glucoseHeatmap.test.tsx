import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlucoseTimeline } from "../src/components/glucose/GlucoseTimeline";
import { PrintLayoutContext } from "../src/PrintLayoutContext";
import { defaultGlucoseRange, formatMmol } from "../src/glucose";
import { glucoseHeatmapBand, glucoseHeatmapBandLabels, glucoseHeatmapModel, HEATMAP_SCHEMES, heatmapTextColor } from "../src/glucoseHeatmap";
import type { HealthRecord } from "../src/shared/types";

const g = (day: number, hour: number, value: number, minute = 0): HealthRecord => ({
  metric: "bloodGlucose", unit: "mmol/L", value,
  date: new Date(2026, 0, day, hour, minute).toISOString(),
});
const view = (records: HealthRecord[], from = "2026-01-01", to = from) =>
  <GlucoseTimeline records={records} range={defaultGlucoseRange} from={from} to={to} continuous={false} />;
const cell = (container: HTMLElement, day: string, hour: number) =>
  container.querySelector(`.glucose-hour-cell[data-day="${day}"][data-hour="${hour}"]`)!;

describe("hourly glucose heatmap", () => {
  it("keeps the selector beside the title without a separate visible label or subtitle", () => {
    const { container } = render(view([g(1, 8, 6)]));
    const heading = screen.getByRole("heading", { name: "Glucose and context" });
    expect(heading.parentElement).toContainElement(screen.getByLabelText("Heatmap colour scheme"));
    expect(screen.queryByText("Heatmap colour scheme")).not.toBeInTheDocument();
    expect(container.querySelector(".glucose-heatmap-details")).toBeNull();
    expect(screen.queryByRole("img", { name: /Magnified hourly/ })).not.toBeInTheDocument();
  });

  it("places the glucose legend to the left of the graph in the same chart body", () => {
    const { container } = render(view([g(1, 8, 6)]));
    const legend = screen.getByLabelText("Hourly mean colour legend");
    const explorer = screen.getByRole("group", { name: /Explore hourly glucose/ });
    expect(explorer).toContainElement(legend);
    expect(legend.compareDocumentPosition(screen.getByRole("img", { name: /Hourly glucose heatmap/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".glucose-heatmap-legend")).toHaveTextContent("mmol/L");
  });

  it("aligns legend and context labels left while all daily data share a compact plot boundary", () => {
    const carb: HealthRecord = { metric: "carbs", date: new Date(2026, 0, 1, 12).toISOString(), value: 40, unit: "g" };
    const { container } = render(view([g(1, 8, 6), carb]));
    const legend = screen.getByLabelText("Hourly mean colour legend");
    const contextX = Number(screen.getByText("Carbohydrates").getAttribute("x"));
    const legendLeft = parseFloat(legend.style.left), legendRight = legendLeft + parseFloat(legend.style.width);
    const axisAnchor = Number(container.querySelector(".glucose-hour-axis")!.getAttribute("x"));
    expect(contextX).toBe(0);
    expect(legendLeft).toBe(contextX);
    expect(legendRight).toBeLessThan(axisAnchor - 45);
    const plotX = Number(container.querySelector(".glucose-chart-hit")!.getAttribute("x"));
    expect(plotX).toBeLessThanOrEqual(110);
    expect(Number(container.querySelector(".glucose-hour-fill")!.getAttribute("x"))).toBe(plotX);
    expect(Number(container.querySelector(".glucose-fasting-marker rect")!.getAttribute("x"))).toBe(plotX);
    expect(Number(container.querySelector(".glucose-context-bar")!.getAttribute("x"))).toBe(plotX);
    expect(container.querySelector(".glucose-heatmap-explorer")).toHaveStyle({ width: "100%" });
  });

  it("opens a transient reading popup on hover and hides it on leaving or Escape", () => {
    const { container } = render(view([g(1, 8, 6)]));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const hit = container.querySelector(".glucose-chart-hit")!;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 760, height: 397, left: 0, top: 0, right: 760, bottom: 397, x: 0, y: 0, toJSON() {} } as DOMRect);
    try {
      fireEvent.pointerMove(hit, { clientX: 430, clientY: 186 });
      expect(screen.getByRole("status")).toHaveTextContent(/Mean 6[.,]0 mmol\/L/);
      fireEvent.pointerLeave(hit);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      const explorer = screen.getByRole("group", { name: /Explore hourly glucose/ });
      fireEvent.focus(explorer);
      expect(screen.getByRole("status")).toHaveTextContent(/Mean 6[.,]0/);
      fireEvent.keyDown(explorer, { key: "Escape" });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally { spy.mockRestore(); }
  });

  it("retains visible hourly and fasting marks when the period exceeds the viewport pixel width", () => {
    const records = Array.from({ length: 1000 }, (_, i) => g(1 + i, 8, 6));
    const { container } = render(view(records, "", ""));
    const marks = [...container.querySelectorAll(".glucose-hour-cell .glucose-hour-fill, .glucose-fasting-marker rect")];
    expect(marks).toHaveLength(2000);
    expect(marks.every(mark => Number(mark.getAttribute("width")) >= 2)).toBe(true);
    const explorer = screen.getByRole("group", { name: /Explore hourly glucose/ });
    Object.defineProperty(explorer, "clientWidth", { configurable: true, value: 320 });
    fireEvent.keyDown(explorer, { key: "End" });
    expect(explorer.scrollLeft).toBeGreaterThan(0);
    fireEvent.keyDown(explorer, { key: "Home" });
    expect(explorer.scrollLeft).toBe(0);
  });

  it("fits long periods to print without dropping subpixel columns", () => {
    const records = Array.from({ length: 1000 }, (_, i) => g(1 + i, 8, 6));
    const { container } = render(<PrintLayoutContext.Provider value>{view(records, "", "")}</PrintLayoutContext.Provider>);
    const marks = [...container.querySelectorAll(".glucose-hour-cell .glucose-hour-fill, .glucose-fasting-marker rect")];
    expect(marks).toHaveLength(2000);
    expect(marks.every(mark => Number(mark.getAttribute("width")) > 0)).toBe(true);
    expect(screen.getByRole("img", { name: /Hourly glucose heatmap/ })).toHaveStyle({ width: "100%" });
  });

  it("keeps the full morning-ending sleep night, including stages before the 06:00 cutoff", () => {
    const sleep = (hour: number, hours: number): HealthRecord => ({ metric: "sleep", date: new Date(2026, 0, 1, hour).toISOString(), value: hours, unit: "hr", category: "HKCategoryValueSleepAnalysisAsleepCore" });
    const records = [sleep(0, 6), sleep(6, 2), g(1, 8, 6)];
    expect(glucoseHeatmapModel(records, records, defaultGlucoseRange, "2026-01-01", "2026-01-01")!.days[0].totals[3]).toBe(8);
    const beforeSix = [sleep(0, 5), g(1, 8, 6)];
    expect(glucoseHeatmapModel(beforeSix, beforeSix, defaultGlucoseRange, "2026-01-01", "2026-01-01")!.days[0].totals[3]).toBe(5);
    const lastNight = [...records, { ...sleep(0, 6), date: new Date(2026, 0, 2, 0).toISOString() }, g(2, 8, 7)];
    expect(glucoseHeatmapModel(lastNight, lastNight, defaultGlucoseRange, "2026-01-01", "2026-01-02")!.days.map(d => d.totals[3])).toEqual([8, 6]);
  });

  it("keeps numeric labels above 4.5:1 contrast for every light and dark colour band", () => {
    const luminance = (hex: string) => {
      const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    for (const scheme of Object.values(HEATMAP_SCHEMES)) for (const fill of [...scheme.light, ...scheme.dark]) {
      const levels = [luminance(fill), luminance(heatmapTextColor(fill))].sort((a, b) => a - b);
      expect((levels[1] + .05) / (levels[0] + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("measures the inner chart width rather than its padded outer surface", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const width = this.classList.contains("glucose-heatmap-explorer") ? 720 : 744;
      return { width, height: 400, left: 0, top: 0, right: width, bottom: 400, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
    try {
      render(view([g(1, 8, 6)]));
      expect(screen.getByRole("img", { name: /Hourly glucose heatmap/ }).getAttribute("viewBox")?.split(" ")[2]).toBe("720");
    } finally { spy.mockRestore(); }
  });

  it("updates chart geometry when only the explorer changes width", () => {
    let explorerWidth = 760;
    const observers: { target?: Element; notify: ResizeObserverCallback }[] = [];
    const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const width = this.classList.contains("glucose-heatmap-explorer") ? explorerWidth : 816;
      return { width, height: 397, left: 0, top: 0, right: width, bottom: 397, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
    vi.stubGlobal("ResizeObserver", class {
      entry: typeof observers[number];
      constructor(notify: ResizeObserverCallback) { this.entry = { notify }; observers.push(this.entry); }
      observe(target: Element) { this.entry.target = target; }
      disconnect() {}
    });
    try {
      render(view([g(1, 8, 6)]));
      const explorer = screen.getByRole("group", { name: /Explore hourly glucose/ });
      const svg = screen.getByRole("img", { name: /Hourly glucose heatmap/ });
      explorerWidth = 816;
      act(() => observers.filter(entry => entry.target === explorer).forEach(entry => entry.notify([], {} as ResizeObserver)));
      expect(svg.getAttribute("viewBox")?.split(" ")[2]).toBe("816");
    } finally { bounds.mockRestore(); vi.unstubAllGlobals(); }
  });

  it("keeps SVG coordinates pixel-aligned with the HTML legend before a resize notification", () => {
    render(view([g(1, 8, 6)]));
    const svg = screen.getByRole("img", { name: /Hourly glucose heatmap/ });
    const coordinateWidth = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    expect(parseFloat(svg.style.width)).toBe(coordinateWidth);
    expect(svg.style.width.endsWith("px")).toBe(true);
  });

  it("fills newly available card width on render without waiting for a resize notification", () => {
    let viewportWidth = 735;
    const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
      ({ width: viewportWidth, height: 397, left: 0, top: 0, right: viewportWidth, bottom: 397, x: 0, y: 0, toJSON() {} }) as DOMRect);
    try {
      render(view([g(1, 8, 6)]));
      viewportWidth = 791;
      fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "blue-dark" } });
      const svg = screen.getByRole("img", { name: /Hourly glucose heatmap/ });
      expect(svg.getAttribute("viewBox")?.split(" ")[2]).toBe("791");
    } finally { bounds.mockRestore(); }
  });

  it("extends the final day and context lane to within four pixels of the chart right edge", () => {
    const { container } = render(view([g(1, 8, 6)]));
    const svg = screen.getByRole("img", { name: /Hourly glucose heatmap/ });
    const width = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    const hit = container.querySelector(".glucose-chart-hit")!;
    const right = Number(hit.getAttribute("x")) + Number(hit.getAttribute("width"));
    expect(width - right).toBeLessThanOrEqual(4);
    expect(Number(container.querySelector(".glucose-fasting-marker rect")!.getAttribute("x")) + Number(container.querySelector(".glucose-fasting-marker rect")!.getAttribute("width"))).toBe(right);
  });

  it("averages samples in their actual hour and retains extremes hidden by the mean", () => {
    const { container } = render(view([g(1, 16, 4.7, 10), g(1, 16, 6.7, 30), g(1, 16, 11.6, 50)]));
    expect(container.querySelectorAll(".glucose-hour-cell")).toHaveLength(1);
    const mark = cell(container, "2026-01-01", 16);
    expect(Number(mark.getAttribute("data-mean"))).toBeCloseTo(7.6666667);
    expect(mark).toHaveAccessibleName(/3 readings/);
    expect(mark.querySelector(".glucose-hour-above")).not.toBeNull();
    fireEvent.focus(screen.getByRole("group", { name: /Explore hourly glucose/ }));
    expect(screen.getByRole("status")).toHaveTextContent(`Mean ${formatMmol(7.6666667)} mmol/L`);
    expect(screen.getByRole("status")).toHaveTextContent(`${formatMmol(4.7)}–${formatMmol(11.6)}`);
  });

  it("keeps missing calendar columns and empty hours blank without interpolation", () => {
    const { container } = render(view([g(1, 7, 5), g(3, 7, 7)], "2026-01-01", "2026-01-03"));
    const chart = screen.getByRole("img", { name: /Hourly glucose heatmap/ });
    expect(chart).toHaveAttribute("data-days", "3");
    expect(container.querySelectorAll(".glucose-hour-cell")).toHaveLength(2);
    const explore = screen.getByRole("group", { name: /Explore hourly glucose/ });
    fireEvent.keyDown(explore, { key: "ArrowRight" });
    expect(screen.getByRole("status")).toHaveTextContent("No readings in this hour");
  });

  it("puts morning at the bottom, truncates empty late hours at 22 and preserves fixed hourly height", () => {
    const { container } = render(view([g(1, 7, 5), g(1, 21, 8, 59)]));
    const chart = screen.getByRole("img", { name: /Hourly glucose heatmap/ });
    expect(chart).toHaveAttribute("data-hour-end", "22");
    const morning = cell(container, "2026-01-01", 7).querySelector(".glucose-hour-fill")!;
    const evening = cell(container, "2026-01-01", 21).querySelector(".glucose-hour-fill")!;
    expect(Number(morning.getAttribute("y"))).toBeGreaterThan(Number(evening.getAttribute("y")));
    expect(morning.getAttribute("height")).toBe(evening.getAttribute("height"));
  });

  it.each([[22, 0, 23], [23, 59, 24], [1, 0, 26], [5, 59, 30]])(
    "keeps a complete hour for a reading at %s:%s, including the next morning", (hour, minute, end) => {
      const day = hour < 6 ? 2 : 1;
      const { container } = render(view([g(1, 7, 5), g(day, hour, 8, minute)]));
      expect(screen.getByRole("img", { name: /Hourly glucose heatmap/ })).toHaveAttribute("data-hour-end", String(end));
      expect(cell(container, "2026-01-01", hour < 6 ? hour + 24 : hour)).not.toBeNull();
    },
  );

  it("uses only the displayed date window for trimming and hourly bins", () => {
    const { container } = render(view([g(1, 7, 5), g(10, 23, 9)]));
    expect(screen.getByRole("img", { name: /Hourly glucose heatmap/ })).toHaveAttribute("data-hour-end", "22");
    expect(container.querySelectorAll(".glucose-hour-cell")).toHaveLength(1);
  });

  it("changes white/dark colour schemes without changing means or aggregation", () => {
    const { container } = render(view([g(1, 8, 6), g(1, 8, 8, 30)]));
    const surface = container.querySelector(".glucose-heatmap") as HTMLElement;
    const original = surface.style.getPropertyValue("--heatmap-band-2");
    const originalSurfaceMode = surface.style.colorScheme;
    fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "cool-dark" } });
    expect(surface).toHaveAttribute("data-scheme", "cool");
    expect(surface).toHaveAttribute("data-palette-variant", "dark");
    expect(surface.style.colorScheme).toBe(originalSurfaceMode);
    expect(surface.style.getPropertyValue("--heatmap-band-2")).not.toBe(original);
    expect(cell(container, "2026-01-01", 8)).toHaveAttribute("data-mean", "7");
    fireEvent.focus(screen.getByRole("group", { name: /Explore hourly glucose/ }));
    expect(screen.getByRole("status")).toHaveTextContent(`Mean ${formatMmol(7)} mmol/L`);
    expect(screen.getAllByRole("option")).toHaveLength(8);
  });

  it("classifies five target-relative segments and keeps both target endpoints in range", () => {
    const range = { ...defaultGlucoseRange, low: 4, high: 9 };
    const values = [3.9, 4, 4.99, 5, 6, 7, 8, 9, 9.01];
    expect(values.map(value => glucoseHeatmapBand(value, range))).toEqual([0, 1, 2, 3, 4, 4, 5, 5, 6]);
  });

  it("anchors the lightest band at 5–6 rather than the midpoint of the selected target", () => {
    for (const [low, high] of [[3.9, 10], [3.9, 7.8], [3.5, 7.8]]) {
      const range = { ...defaultGlucoseRange, low, high };
      expect([5, 5.5, 5.99].map(value => glucoseHeatmapBand(value, range))).toEqual([3, 3, 3]);
      expect(glucoseHeatmapBandLabels(range)).toContain("5–6");
    }
    expect(glucoseHeatmapBandLabels(defaultGlucoseRange)).toEqual(["<3.9", "3.9–4.45", "4.45–5", "5–6", "6–8", "8–10", ">10"]);
    expect([2.8, 3, 12, 13].map(value => glucoseHeatmapBand(value, defaultGlucoseRange))).toEqual([0, 0, 6, 6]);
  });

  it.each([
    [7, 12, [7, 8, 9.5, 12], [4, 4, 5, 5], [">12", "9.5–12", "7–9.5", "<7"]],
    [4, 4.1, [4, 4.04, 4.05, 4.1], [1, 1, 2, 2], [">4.1", "4.05–4.1", "4–4.05", "<4"]],
    [5, 6, [5, 5.2, 5.9, 6], [3, 3, 3, 3], [">6", "5–6", "<5"]],
  ])("clips weighted bands to custom target %s–%s without empty legend rows or changing colour indices", (low, high, values, bands, labels) => {
    const range = { ...defaultGlucoseRange, low, high };
    expect(values.map(value => glucoseHeatmapBand(value, range))).toEqual(bands);
    const records = values.map((value, i) => g(i + 1, 8, value));
    const { container } = render(<GlucoseTimeline records={records} range={range} from="2026-01-01" to="2026-01-04" continuous={false} />);
    fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "target-light" } });
    expect([...container.querySelectorAll(".glucose-hour-fill")].map(mark => mark.getAttribute("fill"))).toEqual(bands.map(band => `var(--heatmap-band-${band})`));
    expect([...screen.getByLabelText("Hourly mean colour legend").querySelectorAll("span")].map(mark => mark.textContent)).toEqual(labels);
    expect(glucoseHeatmapBand(low - 0.01, range)).toBe(0);
    expect(glucoseHeatmapBand(high + 0.01, range)).toBe(6);
  });

  it("offers a mirrored red/teal target palette for hourly and fasting marks", () => {
    const range = { ...defaultGlucoseRange, low: 4, high: 9 };
    const records = [3.5, 4.25, 4.75, 5.5, 6.5, 8.5, 9.5].map((value, i) => g(i + 1, 8, value));
    const { container } = render(<GlucoseTimeline records={records} range={range} from="2026-01-01" to="2026-01-07" continuous={false} />);
    expect(screen.queryByRole("option", { name: "Target-relative · light palette" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "target-light" } });
    const surface = container.querySelector<HTMLElement>(".glucose-heatmap")!;
    const colours = Array.from({ length: 7 }, (_, i) => surface.style.getPropertyValue(`--heatmap-band-${i}`));
    expect(colours[0]).toBe(colours[6]);
    expect(colours[1]).toBe(colours[5]);
    expect(colours[2]).toBe(colours[4]);
    expect(new Set(colours.slice(0, 4)).size).toBe(4);
    expect([...container.querySelectorAll(".glucose-hour-fill")].map(mark => mark.getAttribute("fill"))).toEqual(Array.from({ length: 7 }, (_, i) => `var(--heatmap-band-${i})`));
    expect([...container.querySelectorAll(".glucose-fasting-marker rect")].map(mark => mark.getAttribute("fill"))).toEqual(Array.from({ length: 7 }, (_, i) => `var(--heatmap-band-${i})`));
    expect([...screen.getByLabelText("Hourly mean colour legend").querySelectorAll("span")].map(mark => mark.textContent)).toEqual([">9", "7.5–9", "6–7.5", "5–6", "4.5–5", "4–4.5", "<4"]);
  });

  it("rebins the selected target palette when target bounds change without altering recorded means", () => {
    const records = [g(1, 8, 6)];
    const chart = (low: number, high: number) => <GlucoseTimeline records={records} range={{ ...defaultGlucoseRange, low, high }} from="2026-01-01" to="2026-01-01" continuous={false} />;
    const { container, rerender } = render(chart(4, 9));
    expect(screen.queryByRole("option", { name: "Target-relative · dark palette" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "target-dark" } });
    expect(container.querySelector(".glucose-hour-fill")).toHaveAttribute("fill", "var(--heatmap-band-4)");
    rerender(chart(7, 12));
    expect(container.querySelector(".glucose-hour-fill")).toHaveAttribute("fill", "var(--heatmap-band-0)");
    expect(cell(container, "2026-01-01", 8)).toHaveAttribute("data-mean", "6");
    expect(screen.getByLabelText("Hourly mean colour legend")).toHaveTextContent(">12");
    fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "distinct-light" } });
    expect(container.querySelector(".glucose-hour-fill")).toHaveAttribute("fill", "var(--heatmap-band-3)");
    expect(screen.getByLabelText("Hourly mean colour legend")).toHaveTextContent(">10");
  });

  it("uses the red target caps for excursions hidden by an in-range hourly average and retains them in print", () => {
    const records = [g(1, 8, 3), g(1, 8, 10, 30)];
    const chart = <GlucoseTimeline records={records} range={{ ...defaultGlucoseRange, low: 4, high: 9 }} from="2026-01-01" to="2026-01-01" continuous={false} />;
    const { container, rerender } = render(<PrintLayoutContext.Provider value={false}>{chart}</PrintLayoutContext.Provider>);
    expect(screen.queryByRole("option", { name: "Target-relative · dark palette" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "target-dark" } });
    expect(container.querySelector(".glucose-hour-fill")).toHaveAttribute("fill", "var(--heatmap-band-4)");
    expect(container.querySelector(".glucose-hour-above")).toHaveAttribute("fill", "var(--heatmap-band-6)");
    expect(container.querySelector(".glucose-hour-below")).toHaveAttribute("fill", "var(--heatmap-band-0)");
    rerender(<PrintLayoutContext.Provider value>{chart}</PrintLayoutContext.Provider>);
    expect(container.querySelector(".glucose-heatmap")).toHaveAttribute("data-palette-variant", "light");
    expect(screen.getByLabelText("Hourly mean colour legend").querySelectorAll("span")).toHaveLength(7);
    expect(screen.queryByLabelText("Heatmap colour scheme")).not.toBeInTheDocument();
    expect(container.querySelector(".glucose-hour-above")).toHaveAttribute("fill", "var(--heatmap-band-6)");
  });

  it("prints the overview and colour legend without selector, magnifier or detail text", () => {
    const chart = view([g(1, 8, 6)]);
    const { container, rerender } = render(<PrintLayoutContext.Provider value={false}>{chart}</PrintLayoutContext.Provider>);
    fireEvent.change(screen.getByLabelText("Heatmap colour scheme"), { target: { value: "blue-dark" } });
    fireEvent.focus(screen.getByRole("group", { name: /Explore hourly glucose/ }));
    expect(screen.getByRole("status")).toHaveTextContent(/Mean 6[.,]0/);
    rerender(<PrintLayoutContext.Provider value>{chart}</PrintLayoutContext.Provider>);
    expect(screen.queryByLabelText("Heatmap colour scheme")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Magnified hourly/ })).not.toBeInTheDocument();
    expect(container.querySelector(".glucose-heatmap")).toHaveAttribute("data-scheme", "blue");
    expect(container.querySelector(".glucose-heatmap")).toHaveAttribute("data-palette-variant", "light");
    expect(screen.getByRole("img", { name: /Hourly glucose heatmap/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Hourly mean colour legend")).toBeInTheDocument();
  });
});
