import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as report from "../src/report";
import { OverviewCards } from "../src/components/OverviewCards";
import type { HealthRecord } from "../src/shared/types";

async function clickAndFlush(element: HTMLElement) {
  fireEvent.click(element);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const recordsA: HealthRecord[] = [
  { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
  { metric: "heartRate", date: "2026-01-01T09:00:00.000Z", value: 60, unit: "bpm" },
];
const recordsB: HealthRecord[] = [
  { metric: "weight", date: "2026-02-01T09:00:00.000Z", value: 80, unit: "kg" },
  { metric: "heartRate", date: "2026-02-01T09:00:00.000Z", value: 70, unit: "bpm" },
];

describe("OverviewCards lazy collapsed sections", () => {
  afterEach(() => vi.restoreAllMocks());

  it("computes only the always-open 30-day section on initial render", () => {
    const latestSpy = vi.spyOn(report, "latest");
    render(
      <>
        <OverviewCards records={recordsA} periodLabel="Last 30 days" />
        <OverviewCards records={recordsA} periodLabel="Last year" collapsible />
        <OverviewCards records={recordsA} periodLabel="All time" collapsible />
      </>,
    );
    expect(latestSpy.mock.calls.length).toBe(report.highlights.length);
  });

  it("computes a collapsed section's cards exactly once, on first open", async () => {
    const latestSpy = vi.spyOn(report, "latest");
    render(<OverviewCards records={recordsA} periodLabel="Last year" collapsible />);
    const before = latestSpy.mock.calls.length;
    await clickAndFlush(screen.getByText("Last year"));
    expect(latestSpy.mock.calls.length).toBe(before + report.highlights.length);
    expect(screen.getByText(report.labels.weight)).toBeInTheDocument();
  });

  it("does not recompute on repeated toggling (instant re-open)", async () => {
    const latestSpy = vi.spyOn(report, "latest");
    render(<OverviewCards records={recordsA} periodLabel="Last year" collapsible />);
    const summary = screen.getByText("Last year");
    await clickAndFlush(summary); // open
    const afterFirstOpen = latestSpy.mock.calls.length;
    await clickAndFlush(summary); // close
    await clickAndFlush(summary); // re-open
    expect(latestSpy.mock.calls.length).toBe(afterFirstOpen);
  });

  it("updates an already-opened section's values when the records prop changes", async () => {
    const { rerender } = render(
      <OverviewCards records={recordsA} periodLabel="Last year" collapsible />,
    );
    await clickAndFlush(screen.getByText("Last year"));
    expect(screen.getByText(/70/)).toBeInTheDocument();
    rerender(<OverviewCards records={recordsB} periodLabel="Last year" collapsible />);
    expect(screen.getByText(/80/)).toBeInTheDocument();
  });

  it("renders a native <details>/<summary> pair for collapsible sections", () => {
    render(<OverviewCards records={recordsA} periodLabel="Last year" collapsible />);
    const details = screen.getByText("Last year").closest("details")!;
    expect(details.tagName).toBe("DETAILS");
  });
});
