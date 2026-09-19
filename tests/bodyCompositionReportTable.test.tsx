import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BodyCompositionReportTable } from "../src/components/tables/BodyCompositionReportTable";
import { rangeMetadata } from "../src/report";
import type { HealthRecord } from "../src/shared/types";

const at = (day: number, hour = 8) =>
  new Date(2026, 0, 1 + day, hour).toISOString();
const record = (metric: HealthRecord["metric"], date: string, value: number, unit: string): HealthRecord => ({
  metric,
  date,
  value,
  unit,
});
function renderTable(records: HealthRecord[]) {
  return render(
    <BodyCompositionReportTable
      records={records}
      from=""
      to=""
      metadata={rangeMetadata(records)}
    />,
  );
}

describe("BodyCompositionReportTable", () => {
  it("renders nothing without any body composition readings", () => {
    const { container } = renderTable([
      { metric: "heartRate", date: at(0), value: 70, unit: "count/min" },
    ]);
    expect(container).toBeEmptyDOMElement();
  });

  it("merges weight and the three body composition metrics into one table by date", () => {
    renderTable([
      record("weight", at(0), 70, "kg"),
      record("bodyMassIndex", at(0), 24.5, "count"),
      record("bodyFatPercentage", at(0), 22, "%"),
      record("leanBodyMass", at(1), 58, "kg"),
    ]);
    expect(screen.getByRole("heading", { name: "Body composition" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 date rows
    expect(screen.getByText("Weight (kg)")).toBeInTheDocument();
    expect(screen.getByText("Body mass index (count)")).toBeInTheDocument();
    expect(screen.getByText("Body fat (%)")).toBeInTheDocument();
    expect(screen.getByText("Lean body mass (kg)")).toBeInTheDocument();
  });

  it("does not show a readings-count column", () => {
    renderTable([record("bodyMassIndex", at(0), 24.5, "count")]);
    expect(screen.queryByText("Readings")).not.toBeInTheDocument();
  });

  it("shows a dash for each metric missing on a date", () => {
    const { container } = renderTable([
      record("bodyMassIndex", at(0), 24.5, "count"),
    ]);
    expect(container.querySelectorAll("td small")).toHaveLength(3); // weight + fat + lean mass dashes
  });
});
