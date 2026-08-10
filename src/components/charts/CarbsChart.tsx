import { useContext } from "react";
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
import type { HealthData } from "../../shared/types";
import {
  colorsByMetric,
  daily,
  decimalsByMetric,
  format,
  outlierDates,
  plateaus,
} from "../../report";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { outlierDot } from "./outlierHelpers";

function CarbsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
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
      <b>{new Date(`${label}T00:00:00`).toLocaleDateString()}</b>
      <div style={{ color: colorsByMetric.carbs, marginTop: 4 }}>
        Carbohydrates: {format(row.carbs, row.unit)}
      </div>
      <div style={{ color: colorsByMetric.sugar }}>
        of which sugar: {format(row.sugar, row.unit)}
      </div>
    </div>
  );
}
export function CarbsChart({ records }: { records: HealthData["records"] }) {
  const printLayout = useContext(PrintLayoutContext);
  const carbTotals = new Map(
    daily(records, "carbs", "total").map((d) => [d.date, d]),
  );
  const sugarTotals = new Map(
    daily(records, "sugar", "total").map((d) => [d.date, d]),
  );
  const dates = [
    ...new Set([...carbTotals.keys(), ...sugarTotals.keys()]),
  ].sort((a, b) => a.localeCompare(b));
  const rows = dates.map((date) => {
    const carbs = carbTotals.get(date)?.value ?? 0;
    const sugar = sugarTotals.get(date)?.value ?? 0;
    const unit = carbTotals.get(date)?.unit ?? sugarTotals.get(date)?.unit ?? "g";
    return { date, unit, carbs, sugar, other: Math.max(0, carbs - sugar) };
  });
  if (!rows.length)
    return (
      <div className="empty small">
        No carbohydrate records in this period.
      </div>
    );
  const outliers = outlierDates(rows.map((row) => ({ date: row.date, value: row.carbs })));
  const plateauRows = plateaus(records, "carbs", "total");
  const plateauByDate = new Map(plateauRows.map((row) => [row.date, row.value]));
  const chartRows = rows.map((row) => ({
    ...row,
    plateau: plateauByDate.get(row.date),
  }));
  const chart = (width?: number, height?: number) => (
    <ComposedChart data={chartRows} width={width} height={height}>
      <defs>
        <linearGradient id="fill-carbs-other" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colorsByMetric.carbs} stopOpacity=".32" />
          <stop offset="100%" stopColor={colorsByMetric.carbs} stopOpacity=".02" />
        </linearGradient>
        <linearGradient id="fill-carbs-sugar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colorsByMetric.sugar} stopOpacity=".55" />
          <stop offset="100%" stopColor={colorsByMetric.sugar} stopOpacity=".08" />
        </linearGradient>
      </defs>
      <CartesianGrid vertical={false} stroke="#e7eaf0" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
      <YAxis tick={{ fontSize: 11 }} width={45} />
      <Tooltip content={<CarbsTooltip />} />
      <Area
        type="monotone"
        dataKey="sugar"
        stackId="carbs"
        stroke={colorsByMetric.sugar}
        strokeWidth={2}
        strokeOpacity={0.35}
        fill="url(#fill-carbs-sugar)"
        isAnimationActive={!printLayout}
      />
      <Area
        type="monotone"
        dataKey="other"
        stackId="carbs"
        stroke={colorsByMetric.carbs}
        strokeWidth={2}
        strokeOpacity={0.35}
        fill="url(#fill-carbs-other)"
        isAnimationActive={!printLayout}
        dot={outlierDot(outliers, colorsByMetric.carbs, {
          valueKey: "carbs",
          unit: rows[0].unit,
          decimals: decimalsByMetric.carbs,
        })}
      />
      {plateauRows.length > 0 && (
        <Line
          type="stepAfter"
          dataKey="plateau"
          name="Plateau"
          stroke={colorsByMetric.carbs}
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={!printLayout}
        />
      )}
    </ComposedChart>
  );
  return (
    <>
      {printLayout ? (
        <div data-pdf-chart-ready="true">{chart(680, 260)}</div>
      ) : (
        <ResponsiveContainer key="carbs-screen" width="100%" height={210}>
          {chart()}
        </ResponsiveContainer>
      )}
      {!printLayout && (
        <div className="chart-legend">
          <small style={{ color: colorsByMetric.sugar }}>▮ Sugar</small>
          <small style={{ color: colorsByMetric.carbs, marginLeft: 14 }}>
            ▮ Other carbohydrates
          </small>
        </div>
      )}
    </>
  );
}
