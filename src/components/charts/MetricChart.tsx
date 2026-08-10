import { useContext } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData, Metric } from "../../shared/types";
import {
  colorsByMetric,
  daily,
  format,
  labels,
  totalsMetrics,
  walkingMetrics,
} from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { RangeMetricChart } from "./RangeMetricChart";
import { CarbsChart } from "./CarbsChart";

export function MetricChart({
  metric,
  records,
}: {
  metric: Metric;
  records: HealthData["records"];
}) {
  if (metric === "heartRate" || walkingMetrics.includes(metric))
    return <RangeMetricChart metric={metric} records={records} />;
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
  const chart = (width?: number, height?: number) => (
    <AreaChart data={rows} width={width} height={height}>
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
          fill={`url(#fill-${metric})`}
          isAnimationActive={!printLayout}
        />
    </AreaChart>
  );
  if (printLayout)
    return <div data-pdf-chart-ready="true">{chart(680, 260)}</div>;
  return (
    <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
      {chart()}
    </ResponsiveContainer>
  );
}
