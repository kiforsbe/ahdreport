import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SymptomOverlay } from "../src/components/SymptomOverlay";
import { SymptomsReportTable } from "../src/components/tables/SymptomsReportTable";
import type { HealthRecord, SymptomRecord } from "../src/shared/types";

const symptoms: SymptomRecord[] = [
  {
    symptom: "headache",
    start: "2026-01-02T08:00:00.000Z",
    end: "2026-01-02T12:00:00.000Z",
    value: "HKCategoryValueSeverityModerate",
    source: "Health",
  },
  {
    symptom: "dizziness",
    start: "2026-01-01T09:00:00.000Z",
    end: "2026-01-01T09:30:00.000Z",
    value: "HKCategoryValuePresencePresent",
    source: "Watch",
  },
];
const records: HealthRecord[] = [
  { metric: "heartRate", date: "2026-01-02T12:00:00.000Z", value: 68, unit: "count/min" },
  { metric: "sleep", date: "2026-01-02T08:00:00.000Z", value: 5.9, unit: "hr" },
];

describe("SymptomOverlay", () => {
  it("renders selected symptom duration and onset marks only when visible", () => {
    const { container, rerender } = render(
      <SymptomOverlay
        symptoms={symptoms}
        from="2026-01-01"
        to="2026-01-03"
        selectedSymptom="headache"
        visible
      />,
    );
    expect(container.querySelectorAll(".symptom-overlay-band")).toHaveLength(1);
    expect(container.querySelectorAll(".symptom-overlay-line")).toHaveLength(1);
    expect(screen.getByLabelText("Headache overlay")).toBeInTheDocument();
    rerender(
      <SymptomOverlay
        symptoms={symptoms}
        from="2026-01-01"
        to="2026-01-03"
        selectedSymptom="headache"
        visible={false}
      />,
    );
    expect(container.querySelector(".symptom-overlay-band")).toBeNull();
  });
});

describe("SymptomsReportTable", () => {
  it("renders duration, category value, source, and same-day context", () => {
    render(
      <SymptomsReportTable
        symptoms={symptoms}
        records={records}
        from="2026-01-01"
        to="2026-01-03"
        printLayout={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Symptoms and episodes" })).toBeInTheDocument();
    expect(screen.getByText("Headache")).toBeInTheDocument();
    expect(screen.getByText("4.0 h")).toBeInTheDocument();
    expect(screen.getByText("HKCategoryValueSeverityModerate")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText(/68/)).toBeInTheDocument();
  });
});
