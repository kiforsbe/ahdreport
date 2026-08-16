import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import * as report from "../src/report";
import { MetricChart } from "../src/components/charts/MetricChart";
import { ReportTable } from "../src/components/tables/ReportTable";
import { PrintLayoutContext } from "../src/PrintLayoutContext";
import { rangeMetadata } from "../src/report";
import type { HealthRecord } from "../src/shared/types";

const records: HealthRecord[] = [
  { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
  { metric: "weight", date: "2026-01-02T09:00:00.000Z", value: 71, unit: "kg" },
];

/**
 * Renders `target()` fresh on every NoticeHarness render — a new element
 * object each time, not a `children` prop captured once at the outer
 * `render()` call. A `children` prop stays the same element reference
 * across a parent-only re-render, so React's own element-identity bailout
 * would skip the subtree regardless of whether the child is React.memo'd,
 * making the memoization assertion below pass even with memo removed. A
 * fresh element each render forces React to actually reconcile props
 * against the child's memo comparison, which is the behavior under test.
 */
function NoticeHarness({ target }: { target: () => ReactNode }) {
  const [notice, setNotice] = useState("");
  return (
    <div>
      <button onClick={() => setNotice("unrelated update")}>trigger</button>
      {notice && <p>{notice}</p>}
      {target()}
    </div>
  );
}

describe("chart/table memoization", () => {
  afterEach(() => vi.restoreAllMocks());

  it("MetricChart does not recompute daily() when only unrelated notice state changes", () => {
    const dailySpy = vi.spyOn(report, "daily");
    render(
      <NoticeHarness target={() => <MetricChart metric="weight" records={records} />} />,
    );
    const callsAfterMount = dailySpy.mock.calls.length;
    fireEvent.click(screen.getByText("trigger"));
    expect(dailySpy.mock.calls.length).toBe(callsAfterMount);
  });

  it("MetricChart does recompute when its records prop actually changes", () => {
    const dailySpy = vi.spyOn(report, "daily");
    const { rerender } = render(<MetricChart metric="weight" records={records} />);
    const callsAfterMount = dailySpy.mock.calls.length;
    const updatedRecords: HealthRecord[] = [
      ...records,
      { metric: "weight", date: "2026-01-03T09:00:00.000Z", value: 72, unit: "kg" },
    ];
    rerender(<MetricChart metric="weight" records={updatedRecords} />);
    expect(dailySpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("MetricChart still updates when print-layout context changes, despite memo", () => {
    const { rerender, container } = render(
      <PrintLayoutContext.Provider value={false}>
        <MetricChart metric="weight" records={records} />
      </PrintLayoutContext.Provider>,
    );
    expect(container.querySelector('[data-pdf-chart-ready="true"]')).toBeNull();
    rerender(
      <PrintLayoutContext.Provider value={true}>
        <MetricChart metric="weight" records={records} />
      </PrintLayoutContext.Provider>,
    );
    expect(container.querySelector('[data-pdf-chart-ready="true"]')).not.toBeNull();
  });

  it("ReportTable does not recompute dailyStats() when only unrelated notice state changes", () => {
    const statsSpy = vi.spyOn(report, "dailyStats");
    const metadata = rangeMetadata(records);
    render(
      <NoticeHarness
        target={() => (
          <ReportTable metric="weight" records={records} from="" to="" metadata={metadata} />
        )}
      />,
    );
    const callsAfterMount = statsSpy.mock.calls.length;
    fireEvent.click(screen.getByText("trigger"));
    expect(statsSpy.mock.calls.length).toBe(callsAfterMount);
  });
});
