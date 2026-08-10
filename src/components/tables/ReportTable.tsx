import { useContext } from "react";
import type { HealthData, Metric } from "../../shared/types";
import {
  MAX_PDF_TABLE_ROWS,
  MAX_TABLE_ROWS,
  colorsByMetric,
  columnBounds,
  dailyStats,
  decimalsByMetric,
  labels,
} from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { DailyDistribution } from "../DailyDistribution";
import { DayTrace } from "../DayTrace";
import { TableNotes, coverageNote, truncationNote, unitLabel } from "../TableNotes";

export function ReportTable({
  metric,
  records,
  from,
  to,
}: {
  metric: Metric;
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const allDays = dailyStats(records, metric);
  const days = allDays.slice(
    0,
    printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS,
  );
  if (!days.length) return null;
  const bounds = columnBounds(days);
  const unit = days[0].unit;
  return (
    <section className="report-section">
      <h3>{labels[metric]}</h3>
      <TableNotes
        notes={[
          truncationNote(days.length, allDays.length),
          coverageNote(metric, records, from, to),
        ]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Daily distribution{unitLabel(unit)}</th>
            <th>1-day trace</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{new Date(`${day.date}T00:00:00`).toLocaleDateString()}</td>
              <td>
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
              </td>
              <td>
                {day.values.length > 1 ? (
                  <DayTrace values={day.values} color={colorsByMetric[metric]} />
                ) : (
                  <small>Single reading</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
