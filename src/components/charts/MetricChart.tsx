import { memo, useContext } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData, Metric, SymptomId, SymptomRecord } from "../../shared/types";
import {
  colorsByMetric,
  daily,
  decimalsByMetric,
  format,
  labels,
  outlierDates,
  plateauMetrics,
  plateaus,
  totalsMetrics,
  walkingMetrics,
} from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { RangeMetricChart } from "./RangeMetricChart";
import { CarbsChart } from "./CarbsChart";
import { outlierDot } from "./outlierHelpers";
import { SymptomOverlay } from "../SymptomOverlay";

export const MetricChart = memo(function MetricChart({
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
  if (metric === "heartRate" || walkingMetrics.includes(metric))
    return (
      <RangeMetricChart
        metric={metric}
        records={records}
        symptoms={symptoms}
        selectedSymptom={selectedSymptom}
        showSymptomOverlay={showSymptomOverlay}
      />
    );
  if (metric === "carbs") return <CarbsChart records={records} />;
  const printLayout = useContext(PrintLayoutContext);
  const color = colorsByMetric[metric];
  const rows = daily(
    records,
    metric,
    totalsMetrics.includes(metric) ? "total" : "average",
  );
  if (!rows.length)
    return (
      <div className="empty small">
        No {labels[metric].toLowerCase()} records in this period.
      </div>
    );
  const values = rows.map((row) => row.value);
  const axisMin = niceAxisMin(Math.min(...values), Math.max(...values));
  const outliers = outlierDates(rows);
  const plateauRows = plateauMetrics.includes(metric)
    ? plateaus(records, metric, totalsMetrics.includes(metric) ? "total" : "average")
    : [];
  const plateauByDate = new Map(plateauRows.map((row) => [row.date, row.value]));
  const chartRows = rows.map((row) => ({
    ...row,
    plateau: plateauByDate.get(row.date),
  }));
  const chart = (width?: number, height?: number) => (
    <ComposedChart data={chartRows} width={width} height={height}>
        <defs>
          <linearGradient id={`fill-${metric}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".32" />
            <stop offset="100%" stopColor={color} stopOpacity=".02" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e7eaf0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
        <YAxis domain={[axisMin, "auto"]} tick={{ fontSize: 11 }} width={45} />
        <Tooltip formatter={(value) => format(Number(value), rows[0].unit)} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          strokeOpacity={0.35}
          fill={`url(#fill-${metric})`}
          isAnimationActive={!printLayout}
          dot={outlierDot(outliers, color, {
            unit: rows[0].unit,
            decimals: decimalsByMetric[metric],
          })}
        />
        {plateauRows.length > 0 && (
          <Line
            type="stepAfter"
            dataKey="plateau"
            name="Plateau"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={!printLayout}
          />
        )}
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
    </div>
  );
});
