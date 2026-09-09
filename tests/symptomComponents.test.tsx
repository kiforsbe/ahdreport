import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SymptomOverview } from "../src/components/SymptomOverview";
import type { HealthRecord, SymptomRecord } from "../src/shared/types";

const symptoms: SymptomRecord[] = [
  {
    symptom: "headache",
    start: "2026-01-01T08:00:00.000Z",
    end: "2026-01-01T12:00:00.000Z",
    value: "HKCategoryValuePresencePresent",
  },
  {
    symptom: "dizziness",
    start: "2026-01-02T09:00:00.000Z",
    end: "2026-01-02T09:30:00.000Z",
    value: "HKCategoryValuePresencePresent",
  },
];
const records: HealthRecord[] = [
  { metric: "heartRate", date: "2026-01-01T12:00:00.000Z", value: 70, unit: "count/min" },
  { metric: "heartRate", date: "2026-01-02T12:00:00.000Z", value: 71, unit: "count/min" },
  { metric: "heartRate", date: "2026-01-03T12:00:00.000Z", value: 72, unit: "count/min" },
  { metric: "heartRate", date: "2026-01-04T12:00:00.000Z", value: 60, unit: "count/min" },
  { metric: "heartRate", date: "2026-01-05T12:00:00.000Z", value: 61, unit: "count/min" },
  { metric: "heartRate", date: "2026-01-06T12:00:00.000Z", value: 62, unit: "count/min" },
];

describe("SymptomOverview", () => {
  it("renders an empty state when no symptom events are available", () => {
    render(
      <SymptomOverview
        symptoms={[]}
        records={[]}
        from="2026-01-01"
        to="2026-01-06"
        selectedSymptom={undefined}
        onSelectedSymptomChange={vi.fn()}
        showOverlay={false}
        onShowOverlayChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Symptoms" })).toBeInTheDocument();
    expect(screen.getByText(/No symptom records/i)).toBeInTheDocument();
  });

  it("renders timeline, summary, and association copy and changes the selected lane", () => {
    const onSelectedSymptomChange = vi.fn();
    render(
      <SymptomOverview
        symptoms={symptoms}
        records={records}
        from="2026-01-01"
        to="2026-01-06"
        selectedSymptom="headache"
        onSelectedSymptomChange={onSelectedSymptomChange}
        showOverlay
        onShowOverlayChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Symptom days")).toBeInTheDocument();
    expect(screen.getByText("Headache")).toBeInTheDocument();
    expect(screen.getByText("Observed associations")).toBeInTheDocument();
    expect(screen.getByText(/descriptive comparison only/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dizziness" }));
    expect(onSelectedSymptomChange).toHaveBeenCalledWith("dizziness");
  });
});
