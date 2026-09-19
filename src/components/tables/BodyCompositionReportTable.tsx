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

export const BodyCompositionReportTable = memo(function BodyCompositionReportTable({
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
  const weight = new Map(
    dailyStats(records, "weight").map((day) => [day.date, day]),
  );
  const bmi = new Map(
    dailyStats(records, "bodyMassIndex").map((day) => [day.date, day]),
  );
  const bodyFat = new Map(
    dailyStats(records, "bodyFatPercentage").map((day) => [day.date, day]),
  );
  const leanMass = new Map(
    dailyStats(records, "leanBodyMass").map((day) => [day.date, day]),
  );
  const allDates = [
    ...new Set([
      ...weight.keys(),
      ...bmi.keys(),
      ...bodyFat.keys(),
      ...leanMass.keys(),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(
    0,
    printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS,
  );
  if (!dates.length) return null;
  const weightBounds = columnBounds(dates.map((date) => weight.get(date)));
  const bmiBounds = columnBounds(dates.map((date) => bmi.get(date)));
  const bodyFatBounds = columnBounds(dates.map((date) => bodyFat.get(date)));
  const leanMassBounds = columnBounds(dates.map((date) => leanMass.get(date)));
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
    ["weight", "bodyMassIndex", "bodyFatPercentage", "leanBodyMass"] as Metric[]
  ).map((metric) => {
    const note = coverageNote(metric, metadata, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Body composition</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Weight{unitLabel(unitOf(weight))}</th>
            <th>Body mass index{unitLabel(unitOf(bmi))}</th>
            <th>Body fat{unitLabel(unitOf(bodyFat))}</th>
            <th>Lean body mass{unitLabel(unitOf(leanMass))}</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date}>
              <td>{formatDate(date)}</td>
              <td>{cell(weight.get(date), "weight", weightBounds)}</td>
              <td>{cell(bmi.get(date), "bodyMassIndex", bmiBounds)}</td>
              <td>{cell(bodyFat.get(date), "bodyFatPercentage", bodyFatBounds)}</td>
              <td>{cell(leanMass.get(date), "leanBodyMass", leanMassBounds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});
