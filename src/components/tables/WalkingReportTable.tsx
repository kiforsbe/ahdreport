import { memo, useContext } from "react";
import type { HealthData, Metric } from "../../shared/types";
import {
  MAX_PDF_TABLE_ROWS,
  MAX_TABLE_ROWS,
  colorsByMetric,
  columnBounds,
  dailyStats,
  decimalsByMetric,
  formatDate,
  labels,
  walkingMetrics,
  type RangeMetadata,
} from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { DailyDistribution } from "../DailyDistribution";
import { TableNotes, coverageNote, truncationNote, unitLabel } from "../TableNotes";

export const WalkingReportTable = memo(function WalkingReportTable({
  records,
  from,
  to,
  metadata,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
  metadata: RangeMetadata;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const byMetric = new Map(
    walkingMetrics.map((metric) => [
      metric,
      new Map(dailyStats(records, metric).map((day) => [day.date, day])),
    ]),
  );
  const allDates = [
    ...new Set(
      walkingMetrics.flatMap((metric) => [...byMetric.get(metric)!.keys()]),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(
    0,
    printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS,
  );
  if (!dates.length) return null;
  const boundsByMetric = new Map(
    walkingMetrics.map((metric) => [
      metric,
      columnBounds(dates.map((date) => byMetric.get(metric)!.get(date))),
    ]),
  );
  const unitFor = (metric: Metric) =>
    byMetric.get(metric)!.values().next().value?.unit ?? "";
  const columnNotes = walkingMetrics.map((metric) => {
    const note = coverageNote(metric, metadata, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Walking data</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {walkingMetrics.map((metric) => (
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
              {walkingMetrics.map((metric) => {
                const day = byMetric.get(metric)!.get(date);
                const bounds = boundsByMetric.get(metric)!;
                return (
                  <td key={metric}>
                    {day ? (
                      <DailyDistribution
                        min={day.min}
                        max={day.max}
                        average={day.average}
                        standardDeviation={day.standardDeviation}
                        unit={day.unit}
                        single={day.values.length === 1}
                        decimals={decimalsByMetric[metric]}
                        columnMin={bounds.min}
                        columnMax={bounds.max}
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
});
