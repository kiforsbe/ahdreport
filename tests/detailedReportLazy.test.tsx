import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LazyDisclosure } from "../src/components/LazyDisclosure";
import { VitalsReportTable } from "../src/components/tables/VitalsReportTable";
import { rangeMetadata } from "../src/report";
import type { HealthRecord } from "../src/shared/types";

async function clickAndFlush(element: HTMLElement) {
  fireEvent.click(element);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const records: HealthRecord[] = [
  { metric: "heartRate", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "count/min" },
  { metric: "heartRate", date: "2026-01-02T09:00:00.000Z", value: 71, unit: "count/min" },
];
const metadata = rangeMetadata(records);

function DetailedReportHarness({ printLayout }: { printLayout: boolean }) {
  return (
    <LazyDisclosure
      summary="Show detailed measurements"
      summaryClassName="detailed-report-toggle"
      open={printLayout || undefined}
      keepMounted={false}
    >
      {() => (
        <VitalsReportTable records={records} from="" to="" metadata={metadata} />
      )}
    </LazyDisclosure>
  );
}

describe("Detailed measurements lazy disclosure", () => {
  afterEach(() => vi.restoreAllMocks());

  it("has no table rows or SVGs in the closed viewer DOM", () => {
    const { container } = render(<DetailedReportHarness printLayout={false} />);
    expect(screen.queryAllByRole("row").length).toBe(0);
    expect(container.querySelectorAll("svg").length).toBe(0);
  });

  it("renders the existing table content once opened", async () => {
    render(<DetailedReportHarness printLayout={false} />);
    await clickAndFlush(screen.getByText("Show detailed measurements"));
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1); // header + data rows
  });

  it("mounts full content when printLayout is forced true, regardless of prior viewer state", () => {
    const { rerender } = render(<DetailedReportHarness printLayout={false} />);
    expect(screen.queryAllByRole("row").length).toBe(0);
    rerender(<DetailedReportHarness printLayout={true} />);
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("returns to a zero-row closed DOM after printLayout reverts to false, when never opened by the user", () => {
    const { rerender } = render(<DetailedReportHarness printLayout={false} />);
    rerender(<DetailedReportHarness printLayout={true} />);
    rerender(<DetailedReportHarness printLayout={false} />);
    expect(screen.queryAllByRole("row").length).toBe(0);
  });

  it("restores the user's own open choice after a print cycle, not just the closed default", async () => {
    const { rerender } = render(<DetailedReportHarness printLayout={false} />);
    await clickAndFlush(screen.getByText("Show detailed measurements")); // user opens it
    rerender(<DetailedReportHarness printLayout={true} />); // print forces open
    rerender(<DetailedReportHarness printLayout={false} />); // print ends
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("does not move focus when content mounts, on user open or forced print-open", async () => {
    const { rerender } = render(<DetailedReportHarness printLayout={false} />);
    const summary = screen.getByText("Show detailed measurements");
    summary.focus();
    await clickAndFlush(summary);
    expect(document.activeElement).toBe(summary);
    rerender(<DetailedReportHarness printLayout={true} />);
    expect(document.activeElement).toBe(summary);
  });
});
