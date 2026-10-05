import { memo, useContext } from "react";
import type React from "react";
import type { HealthData } from "../../shared/types";
import {
  MAX_PDF_TABLE_ROWS,
  MAX_TABLE_ROWS,
  boundsOf,
  format,
  formatDate,
  type RangeMetadata,
} from "../../report";
import {
  type GlucoseDay,
  type GlucoseRange,
  formatMmol,
  glucoseColors,
  glucoseDaily,
  glucosePresetLabel,
  glucoseRangeText,
  glucoseSummary,
  niceYMax,
  DEFAULT_GLUCOSE_DAY_START,
} from "../../glucose";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { DailyDistribution } from "../DailyDistribution";
import { GlucoseDayTrace } from "../GlucoseDayTrace";
import { TableNotes, coverageNote, truncationNote } from "../TableNotes";

const statuses = ["below", "within", "above"] as const;
const percent = (n: number, total: number) => Math.round((n / total) * 100);
const mmolOrDash = (value?: number) => (value === undefined ? "—" : formatMmol(value));
function insulinCell(day: GlucoseDay) {
  if (!day.basal && !day.bolus && !day.unspecifiedInsulin) return "—";
  const main = `${day.basal ? format(day.basal, "", 1) : "—"} / ${day.bolus ? format(day.bolus, "", 1) : "—"}`;
  return day.unspecifiedInsulin ? `${main} · ${format(day.unspecifiedInsulin, "", 1)} other` : main;
}

export const GlucoseReportTable = memo(function GlucoseReportTable({
  records,
  from,
  to,
  metadata,
  range,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
  metadata: RangeMetadata;
  range: GlucoseRange;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const allDays = glucoseDaily(records, range, DEFAULT_GLUCOSE_DAY_START);
  const days = allDays.slice(0, printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS);
  if (!days.length) return null;
  const summary = glucoseSummary(records, range, from, to)!;
  // Fixed-ish scale so the target band sits in the same place on every row.
  const bounds = boundsOf(days.flatMap((day) => day.readings.map((r) => r.value)));
  const columnMin = Math.min(2, bounds.min);
  const columnMax = Math.max(14, bounds.max);
  // Shared across every row's trace, like columnMin/columnMax above are for
  // DailyDistribution, so rows stay visually comparable down the column.
  const traceYMax = niceYMax(bounds.max);
  const showMeal = !printLayout && days.some((day) => day.readings.some((r) => r.category));
  const traceWidth = printLayout ? 190 : 240;
  return (
    <section className="report-section glucose-report-section">
      <h3>Blood glucose</h3>
      <TableNotes
        notes={[
          `Target range: ${glucosePresetLabel(range.preset)}, ${glucoseRangeText(range)}.`,
          "Each row runs 06:00 to 06:00 next morning. Dashed trace links show inferred meal pairs 1–3 hours apart.",
          summary.dense
            ? `Continuous data: ${Math.round(summary.coverage * 100)}% coverage across ${summary.daysWithReadings} days. Range columns are shares of readings per day.`
            : "Range columns are shares of recorded readings, not time in range.",
          truncationNote(days.length, allDays.length),
          coverageNote("bloodGlucose", metadata, from, to),
        ]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Daily distribution (mmol/L)</th>
            <th>Below / within / above</th>
            {showMeal && (
              <th>
                Before / after meal<span className="glucose-th-sub">median mmol/L</span>
              </th>
            )}
            <th>
              Across the day
              <div className="glucose-trace-axis" style={{ width: traceWidth }}>
                <span>06</span><span>12</span><span>18</span><span>00</span><span>06+1</span>
              </div>
            </th>
            <th>
              Insulin (IU)<span className="glucose-th-sub">basal / bolus</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{formatDate(day.date)}</td>
              <td>
                <DailyDistribution
                  min={day.min}
                  max={day.max}
                  average={day.average}
                  standardDeviation={day.standardDeviation}
                  unit="mmol/L"
                  single={day.count === 1}
                  decimals={1}
                  columnMin={columnMin}
                  columnMax={columnMax}
                  color={glucoseColors.line}
                  band={{ low: range.low, high: range.high, color: glucoseColors.band }}
                />
              </td>
              <td className="glucose-split-cell">
                <div className="glucose-split-bar" aria-hidden="true">
                  {statuses
                    .filter((status) => day.counts[status])
                    .map((status) => (
                      <i key={status} style={{ flex: day.counts[status], background: glucoseColors[status] }} />
                    ))}
                </div>
                <small>
                  {`${percent(day.counts.below, day.count)} / ${percent(day.counts.within, day.count)} / ${percent(day.counts.above, day.count)}%`}
                </small>
              </td>
              {showMeal && (
                <td className="glucose-num">{`${mmolOrDash(day.beforeMealMedian)} / ${mmolOrDash(day.afterMealMedian)}`}</td>
              )}
              <td>
                <GlucoseDayTrace day={day} range={range} width={traceWidth} yMax={traceYMax} />
              </td>
              <td className="glucose-num">{insulinCell(day)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="glucose-legend glucose-table-legend">
        <span style={{ "--c": glucoseColors.below } as React.CSSProperties}>Below target</span>
        <span style={{ "--c": glucoseColors.line } as React.CSSProperties}>Within target</span>
        <span style={{ "--c": glucoseColors.above } as React.CSSProperties}>Above target</span>
        <span style={{ "--c": glucoseColors.carbs } as React.CSSProperties}>Carbohydrates</span>
        <span style={{ "--c": glucoseColors.insulin } as React.CSSProperties}>Insulin bolus</span>
        <span className="hollow" style={{ "--c": glucoseColors.insulin } as React.CSSProperties}>Insulin basal</span>
        <span style={{ "--c": glucoseColors.activity } as React.CSSProperties}>Activity</span>
      </div>
      <small className="table-notes">Markers appear only when those records exist in the Apple Health export.</small>
    </section>
  );
});
