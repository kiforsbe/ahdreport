import { useContext } from "react";
import type { HealthData, Metric } from "../../shared/types";
import {
  MAX_PDF_TABLE_ROWS,
  MAX_TABLE_ROWS,
  colorsByMetric,
  dailyTotals,
  decimalsByMetric,
  labels,
  nutritionMetrics,
  totalBounds,
} from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { DailyTotalBar } from "../DailyTotalBar";
import { TableNotes, coverageNote, truncationNote, unitLabel } from "../TableNotes";

export function NutritionReportTable({
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
    nutritionMetrics.map((metric) => [
      metric,
      new Map(dailyTotals(records, metric).map((day) => [day.date, day])),
    ]),
  );
  const allDates = [
    ...new Set(
      nutritionMetrics.flatMap((metric) => [
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
    nutritionMetrics.map((metric) => [
      metric,
      totalBounds(
        dates.map((date) => totalsByMetric.get(metric)!.get(date)?.total),
      ),
    ]),
  );
  const unitFor = (metric: Metric) =>
    totalsByMetric.get(metric)!.values().next().value?.unit ?? "";
  const tableColumns = nutritionMetrics.filter((metric) => metric !== "sugar");
  const columnNotes = tableColumns.map((metric) => {
    const note = coverageNote(metric, records, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Daily nutrition</h3>
      <TableNotes
        notes={[
          truncationNote(dates.length, allDates.length),
          "Carbohydrates bars include a darker sugar segment.",
          ...columnNotes,
        ]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {tableColumns.map((metric) => (
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
              <td>{new Date(`${date}T00:00:00`).toLocaleDateString()}</td>
              {tableColumns.map((metric) => {
                const day = totalsByMetric.get(metric)!.get(date);
                const bounds = boundsByMetric.get(metric)!;
                const sugarDay =
                  metric === "carbs"
                    ? totalsByMetric.get("sugar")!.get(date)
                    : undefined;
                return (
                  <td key={metric}>
                    {day ? (
                      <DailyTotalBar
                        value={day.total}
                        columnMax={bounds.max}
                        unit={day.unit}
                        decimals={decimalsByMetric[metric]}
                        color={colorsByMetric[metric]}
                        subValue={sugarDay?.total}
                        subColor={colorsByMetric.sugar}
                        subLabel={labels.sugar.toLowerCase()}
                        width={158}
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
