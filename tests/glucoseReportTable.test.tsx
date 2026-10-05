import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlucoseReportTable } from "../src/components/tables/GlucoseReportTable";
import { PrintLayoutContext } from "../src/PrintLayoutContext";
import { rangeMetadata } from "../src/report";
import { defaultGlucoseRange, formatMmol as m, glucoseRangeText } from "../src/glucose";
import type { HealthRecord } from "../src/shared/types";

// Expected numbers are built with the app's formatter: Intl uses the machine locale.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 0, 1 + day, hour, minute).toISOString();
const glucose = (date: string, value: number, category?: string): HealthRecord => ({
  metric: "bloodGlucose",
  date,
  value,
  unit: "mmol/L",
  category,
});
function renderTable(records: HealthRecord[], printLayout = false) {
  return render(
    <PrintLayoutContext.Provider value={printLayout}>
      <GlucoseReportTable
        records={records}
        from=""
        to=""
        metadata={rangeMetadata(records)}
        range={defaultGlucoseRange}
      />
    </PrintLayoutContext.Provider>,
  );
}

describe("GlucoseReportTable", () => {
  it("renders nothing without glucose readings", () => {
    const { container } = renderTable([{ metric: "weight", date: at(0, 8), value: 70, unit: "kg" }]);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per day with the range split, insulin totals and trace", () => {
    const records: HealthRecord[] = [
      glucose(at(0, 8), 5.0),
      { metric: "insulinDelivery", date: at(0, 8, 5), value: 6, unit: "IU", category: "bolus" },
      glucose(at(0, 12), 12.0),
      { metric: "insulinDelivery", date: at(0, 22), value: 14, unit: "IU", category: "basal" },
      glucose(at(1, 9), 7.0),
    ];
    const { container } = renderTable(records);
    expect(screen.getByRole("heading", { name: "Blood glucose" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("0 / 50 / 50%")).toBeInTheDocument();
    expect(screen.getByText(`${m(14)} / ${m(6)}`)).toBeInTheDocument();
    expect(screen.getByText("Range columns are shares of recorded readings, not time in range.")).toBeInTheDocument();
    expect(
      screen.getByText(`Target range: Type 2 diabetes, ${glucoseRangeText(defaultGlucoseRange)}.`),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg.glucose-day-trace")).toHaveLength(2);
  });

  it("shows the meal column only when readings carry a meal-time tag, and never in print", () => {
    const untagged = [glucose(at(0, 8), 5.0)];
    renderTable(untagged);
    expect(screen.queryByText(/Before \/ after meal/)).not.toBeInTheDocument();
    const tagged = [glucose(at(0, 8), 5.0, "beforeMeal"), glucose(at(0, 10), 9.0, "afterMeal")];
    const { unmount } = renderTable(tagged);
    expect(screen.getByText(/Before \/ after meal/)).toBeInTheDocument();
    expect(screen.getByText(`${m(5)} / ${m(9)}`)).toBeInTheDocument();
    unmount();
    renderTable(tagged, true);
    expect(screen.queryByText(/Before \/ after meal/)).not.toBeInTheDocument();
  });

  it("adds a truncation note beyond the row limit", () => {
    const records = Array.from({ length: 366 }, (_, d) => glucose(at(d, 8), 6));
    renderTable(records);
    expect(screen.getByText("Showing the most recent 365 of 366 days with data.")).toBeInTheDocument();
  });

  it("keeps an overnight pair in one morning-to-morning row", () => {
    const { container } = renderTable([glucose(at(0, 23), 5), glucose(at(1, 1), 8)]);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByText(/06:00.*next morning/)).toBeInTheDocument();
    expect(container.querySelector(".glucose-pair-trace")).not.toBeNull();
  });
});
