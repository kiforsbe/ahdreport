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
  type RangeMetadata,
} from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { DailyDistribution } from "../DailyDistribution";
import { TableNotes, coverageNote, truncationNote, unitLabel } from "../TableNotes";

export const VitalsReportTable = memo(function VitalsReportTable({
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
  const systolic = new Map(
    dailyStats(records, "bloodPressureSystolic").map((day) => [day.date, day]),
  );
  const diastolic = new Map(
    dailyStats(records, "bloodPressureDiastolic").map((day) => [day.date, day]),
  );
  const heartRate = new Map(
    dailyStats(records, "heartRate").map((day) => [day.date, day]),
  );
  const allDates = [
    ...new Set([
      ...systolic.keys(),
      ...diastolic.keys(),
      ...heartRate.keys(),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(
    0,
    printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS,
  );
  if (!dates.length) return null;
  const diastolicBounds = columnBounds(
    dates.map((date) => diastolic.get(date)),
  );
  const systolicBounds = columnBounds(dates.map((date) => systolic.get(date)));
  const heartRateBounds = columnBounds(
    dates.map((date) => heartRate.get(date)),
  );
  const unitOf = (map: Map<string, ReturnType<typeof dailyStats>[number]>) =>
    map.values().next().value?.unit ?? "";
  const cell = (
    day: ReturnType<typeof dailyStats>[number] | undefined,
    metric: Metric,
    bounds: { min: number; max: number },
  ) =>
    day ? (
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
    );
  const columnNotes = (
    [
      "bloodPressureDiastolic",
      "bloodPressureSystolic",
      "heartRate",
    ] as Metric[]
  ).map((metric) => {
    const note = coverageNote(metric, metadata, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Vitals</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Diastolic{unitLabel(unitOf(diastolic))}</th>
            <th>Systolic{unitLabel(unitOf(systolic))}</th>
            <th>Heart rate{unitLabel(unitOf(heartRate))}</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date}>
              <td>{formatDate(date)}</td>
              <td>
                {cell(
                  diastolic.get(date),
                  "bloodPressureDiastolic",
                  diastolicBounds,
                )}
              </td>
              <td>
                {cell(
                  systolic.get(date),
                  "bloodPressureSystolic",
                  systolicBounds,
                )}
              </td>
              <td>{cell(heartRate.get(date), "heartRate", heartRateBounds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});
