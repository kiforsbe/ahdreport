import { useContext } from "react";
import type { HealthData, Metric } from "../../shared/types";
import {
  MAX_PDF_TABLE_ROWS,
  MAX_TABLE_ROWS,
  activityMetrics,
  colorsByMetric,
  dailyTotals,
  decimalsByMetric,
  formatDate,
  labels,
  totalBounds,
} from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { DailyTotalBar } from "../DailyTotalBar";
import { TableNotes, coverageNote, truncationNote, unitLabel } from "../TableNotes";

export function ActivityReportTable({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const totalsByMetric = new Map(
    activityMetrics.map((metric) => [
      metric,
      new Map(dailyTotals(records, metric).map((day) => [day.date, day])),
    ]),
  );
  const allDates = [
    ...new Set(
      activityMetrics.flatMap((metric) => [
        ...totalsByMetric.get(metric)!.keys(),
      ]),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(
    0,
    printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS,
  );
  if (!dates.length) return null;
  const boundsByMetric = new Map(
    activityMetrics.map((metric) => [
      metric,
      totalBounds(
        dates.map((date) => totalsByMetric.get(metric)!.get(date)?.total),
      ),
    ]),
  );
  const unitFor = (metric: Metric) =>
    totalsByMetric.get(metric)!.values().next().value?.unit ?? "";
  const columnNotes = activityMetrics.map((metric) => {
    const note = coverageNote(metric, records, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Daily activity</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {activityMetrics.map((metric) => (
              <th key={metric}>
                {labels[metric]}
                {unitLabel(unitFor(metric))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date}>
              <td>{formatDate(date)}</td>
              {activityMetrics.map((metric) => {
                const day = totalsByMetric.get(metric)!.get(date);
                const bounds = boundsByMetric.get(metric)!;
                return (
                  <td key={metric}>
                    {day ? (
                      <DailyTotalBar
                        value={day.total}
                        columnMax={bounds.max}
                        unit={day.unit}
                        decimals={decimalsByMetric[metric]}
                        color={colorsByMetric[metric]}
                      />
                    ) : (
                      <small>—</small>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
