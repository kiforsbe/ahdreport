import { memo, useContext } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData, Metric, SymptomId, SymptomRecord } from "../../shared/types";
import {
  colorsByMetric,
  dailyStats,
  decimalsByMetric,
  denseDateRange,
  format,
  formatDate,
  labels,
  outlierDates,
} from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { bpRangeBarShape } from "./bpChartShapes";
import { SymptomOverlay } from "../SymptomOverlay";

function RangeMetricTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const range =
    row.low === row.high
      ? format(row.average, row.unit)
      : `${format(row.low, row.unit)}–${format(row.high, row.unit)} (avg ${format(row.average, row.unit)})`;
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e4e8ef",
        borderRadius: 8,
        padding: "8px 11px",
        fontSize: 12,
      }}
    >
      <b>{formatDate(label)}</b>
      <div style={{ color: row.color, marginTop: 4 }}>
        {row.label}: {range}
      </div>
    </div>
  );
}
export const RangeMetricChart = memo(function RangeMetricChart({
  metric,
  records,
  symptoms = [],
  selectedSymptom,
  showSymptomOverlay = false,
}: {
  metric: Metric;
  records: HealthData["records"];
  symptoms?: SymptomRecord[];
  selectedSymptom?: SymptomId;
  showSymptomOverlay?: boolean;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const color = colorsByMetric[metric];
  const rows = dailyStats(records, metric)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      unit: day.unit,
      label: labels[metric],
      color,
      low: day.min,
      high: day.max,
      average: day.average,
      base: day.min,
      range: day.max - day.min,
    }));
  if (!rows.length)
    return (
      <div className="empty small">
        No {labels[metric].toLowerCase()} records in this period.
      </div>
    );
  const overallAverage =
    rows.reduce((total, row) => total + row.average, 0) / rows.length;
  const axisMin = niceAxisMin(
    Math.min(...rows.map((row) => row.low)),
    Math.max(...rows.map((row) => row.high)),
  );
  const outliers = outlierDates(
    rows.map((row) => ({ date: row.date, value: row.average })),
  );
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const chartRows = denseDateRange(rows.map((row) => row.date)).map((date) => {
    const row = byDate.get(date);
    return row
      ? { ...row, isOutlier: outliers.has(date) }
      : {
          date,
          unit: rows[0].unit,
          label: labels[metric],
          color,
          low: undefined,
          high: undefined,
          average: undefined,
          base: undefined,
          range: undefined,
          isOutlier: false,
        };
  });
  const chart = (width?: number, height?: number) => (
    <ComposedChart
      data={chartRows}
      barCategoryGap="28%"
      width={width}
      height={height}
    >
      <CartesianGrid vertical={false} stroke="#e7eaf0" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
      <YAxis domain={[axisMin, "auto"]} tick={{ fontSize: 11 }} width={45} />
      <Tooltip content={<RangeMetricTooltip />} />
      <ReferenceLine
        y={overallAverage}
        stroke={color}
        strokeDasharray="4 4"
        strokeOpacity={0.7}
      />
      <Bar dataKey="base" stackId={metric} fill="transparent" isAnimationActive={false} />
      <Bar
        dataKey="range"
        stackId={metric}
        shape={bpRangeBarShape(color, "low", "high", "average", "isOutlier", {
          unit: rows[0].unit,
          decimals: decimalsByMetric[metric],
        })}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
  if (printLayout)
    return (
      <div className="chart-with-symptom-overlay">
        <div data-pdf-chart-ready="true">{chart(680, 260)}</div>
        <SymptomOverlay
          symptoms={symptoms}
          from={rows[0].date}
          to={rows.at(-1)!.date}
          selectedSymptom={selectedSymptom}
          visible={showSymptomOverlay}
        />
        <small style={{ color }}>
          ▮ Daily range (avg tick) · ┄ Overall average {format(overallAverage, rows[0].unit)}
        </small>
      </div>
    );
  return (
    <div className="chart-with-symptom-overlay">
      <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
        {chart()}
      </ResponsiveContainer>
      <SymptomOverlay
        symptoms={symptoms}
        from={rows[0].date}
        to={rows.at(-1)!.date}
        selectedSymptom={selectedSymptom}
        visible={showSymptomOverlay}
      />
      <small style={{ color }}>
        ▮ Daily range (avg tick) · ┄ Overall average {format(overallAverage, rows[0].unit)}
      </small>
    </div>
  );
});
