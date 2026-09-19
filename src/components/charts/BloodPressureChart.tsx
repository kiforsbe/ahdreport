import { memo, useContext } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData, SymptomId, SymptomRecord } from "../../shared/types";
import {
  colorsByMetric,
  dailyStats,
  denseDateRange,
  format,
  formatDate,
  outlierDates,
  bpDerived,
  bpCategorySwedish,
  bpCategoryColorsSwedish,
  bpCategoryOrderSwedish,
  type RangeMetadata,
} from "../../report";
import type { SwedishBpCategory } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { coverageNote } from "../TableNotes";
import { bpRangeBarShape } from "./bpChartShapes";
import { SymptomOverlay } from "../SymptomOverlay";

const categoryShortLabelsSwedish: Record<SwedishBpCategory, string> = {
  Optimal: "Optimal",
  Normal: "Normal",
  "High normal": "High-norm.",
  "Grade 1 hypertension": "Grade 1",
  "Grade 2 hypertension": "Grade 2",
  "Grade 3 hypertension": "Grade 3",
};

function BpTooltip({ active, payload, label, categoryColors }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const range = (low?: number, high?: number, average?: number) =>
    low === undefined || average === undefined
      ? "—"
      : low === high
        ? format(average, "mmHg")
        : `${format(low, "mmHg")}–${format(high!, "mmHg")} (avg ${format(average, "mmHg")})`;
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
      <div style={{ color: colorsByMetric.bloodPressureSystolic, marginTop: 4 }}>
        Systolic: {range(row.sLow, row.sHigh, row.sAvg)}
      </div>
      <div style={{ color: colorsByMetric.bloodPressureDiastolic }}>
        Diastolic: {range(row.dLow, row.dHigh, row.dAvg)}
      </div>
      {row.category && (
        <div style={{ color: categoryColors?.[row.category] ?? "#71717a" }}>
          {row.category}
        </div>
      )}
    </div>
  );
}
function categoryDot(categoryColors: Record<string, string>) {
  return (props: any) => {
    const { cx, cy, payload } = props;
    if (payload?.categoryRank === undefined) return <g />;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill={categoryColors[payload.category] ?? "#71717a"}
        stroke="white"
        strokeWidth={1}
      />
    );
  };
}
export const BloodPressureChart = memo(function BloodPressureChart({
  records,
  from,
  to,
  metadata,
  symptoms = [],
  selectedSymptom,
  showSymptomOverlay = false,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
  metadata: RangeMetadata;
  symptoms?: SymptomRecord[];
  selectedSymptom?: SymptomId;
  showSymptomOverlay?: boolean;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const sNote = coverageNote("bloodPressureSystolic", metadata, from, to);
  const dNote = coverageNote("bloodPressureDiastolic", metadata, from, to);
  const byDate = new Map<
    string,
    {
      date: string;
      sLow?: number;
      sHigh?: number;
      sAvg?: number;
      sBase?: number;
      sRange?: number;
      dLow?: number;
      dHigh?: number;
      dAvg?: number;
      dBase?: number;
      dRange?: number;
    }
  >();
  dailyStats(records, "bloodPressureSystolic").forEach((day) =>
    byDate.set(day.date, {
      ...(byDate.get(day.date) ?? { date: day.date }),
      sLow: day.min,
      sHigh: day.max,
      sAvg: day.average,
      sBase: day.min,
      sRange: day.max - day.min,
    }),
  );
  dailyStats(records, "bloodPressureDiastolic").forEach((day) =>
    byDate.set(day.date, {
      ...(byDate.get(day.date) ?? { date: day.date }),
      dLow: day.min,
      dHigh: day.max,
      dAvg: day.average,
      dBase: day.min,
      dRange: day.max - day.min,
    }),
  );
  const rows = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const avg = (key: "sAvg" | "dAvg") => {
    const values = rows
      .map((r) => r[key])
      .filter((v): v is number => v !== undefined);
    return values.reduce((a, v) => a + v, 0) / values.length;
  };
  const lows = rows
    .flatMap((r) => [r.sLow, r.dLow])
    .filter((v): v is number => v !== undefined);
  const highs = rows
    .flatMap((r) => [r.sHigh, r.dHigh])
    .filter((v): v is number => v !== undefined);
  const axisMin = niceAxisMin(Math.min(...lows), Math.max(...highs));
  const sOutliers = outlierDates(
    rows
      .filter((r): r is typeof r & { sAvg: number } => r.sAvg !== undefined)
      .map((r) => ({ date: r.date, value: r.sAvg })),
  );
  const dOutliers = outlierDates(
    rows
      .filter((r): r is typeof r & { dAvg: number } => r.dAvg !== undefined)
      .map((r) => ({ date: r.date, value: r.dAvg })),
  );
  const derivedDays = bpDerived(records);
  const categoryFn = bpCategorySwedish;
  const categoryColors: Record<string, string> = bpCategoryColorsSwedish;
  const categoryOrder: string[] = bpCategoryOrderSwedish;
  const categoryShortLabels: Record<string, string> = categoryShortLabelsSwedish;
  const categorizedDays = derivedDays.map((d) => ({
    date: d.date,
    category: categoryFn(d.systolic, d.diastolic),
  }));
  const categoryByDate = new Map(
    categorizedDays.map((d) => [d.date, d.category]),
  );
  const chartRows = denseDateRange(rows.map((r) => r.date)).map((date) => {
    const r = byDate.get(date) ?? { date };
    const category = categoryByDate.get(date);
    return {
      ...r,
      sOutlier: sOutliers.has(date),
      dOutlier: dOutliers.has(date),
      category,
      categoryRank: category ? categoryOrder.indexOf(category) : undefined,
    };
  });
  const chart = (width?: number, height?: number) => (
    <ComposedChart
      data={chartRows}
      barGap={2}
      barCategoryGap="28%"
      width={width}
      height={height}
    >
      <CartesianGrid vertical={false} stroke="#e7eaf0" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
      <YAxis
        yAxisId="bp"
        domain={[axisMin, "auto"]}
        tick={{ fontSize: 11 }}
        width={45}
      />
      {derivedDays.length > 0 && (
        <YAxis
          yAxisId="risk"
          orientation="right"
          domain={[0, categoryOrder.length - 1]}
          ticks={categoryOrder.map((_, i) => i)}
          tickFormatter={(v) => categoryShortLabels[categoryOrder[v]] ?? ""}
          tick={{ fontSize: 10 }}
          width={72}
          axisLine={false}
          tickLine={false}
        />
      )}
      <Tooltip content={<BpTooltip categoryColors={categoryColors} />} />
      <Bar
        yAxisId="bp"
        dataKey="sBase"
        stackId="s"
        fill="transparent"
        isAnimationActive={false}
      />
      <Bar
        yAxisId="bp"
        dataKey="sRange"
        stackId="s"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureSystolic,
          "sLow",
          "sHigh",
          "sAvg",
          "sOutlier",
          { unit: "mmHg", decimals: 0 },
        )}
        isAnimationActive={false}
      />
      <Bar
        yAxisId="bp"
        dataKey="dBase"
        stackId="d"
        fill="transparent"
        isAnimationActive={false}
      />
      <Bar
        yAxisId="bp"
        dataKey="dRange"
        stackId="d"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureDiastolic,
          "dLow",
          "dHigh",
          "dAvg",
          "dOutlier",
          { unit: "mmHg", decimals: 0 },
        )}
        isAnimationActive={false}
      />
      {derivedDays.length > 0 && (
        <Line
          yAxisId="risk"
          type="stepAfter"
          dataKey="categoryRank"
          stroke="#71717a"
          strokeWidth={1.75}
          strokeDasharray="4 2"
          dot={categoryDot(categoryColors)}
          isAnimationActive={!printLayout}
          connectNulls={false}
          name="Hypertension level"
        />
      )}
    </ComposedChart>
  );
  return (
    <article className="panel">
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h3>Blood pressure</h3>
        <small>
          <b>{format(avg("sAvg"), "mmHg")}</b> systolic avg. ·{" "}
          <b>{format(avg("dAvg"), "mmHg")}</b> diastolic avg.
        </small>
      </div>
      {!printLayout && (sNote || dNote) && (
        <div className="table-notes">
          {sNote && <small>Systolic — {sNote}</small>}
          {dNote && <small>Diastolic — {dNote}</small>}
        </div>
      )}
      {printLayout ? (
        <div className="chart-with-symptom-overlay">
          <div data-pdf-chart-ready="true">{chart(680, 260)}</div>
          <SymptomOverlay
            symptoms={symptoms}
            from={from}
            to={to}
            selectedSymptom={selectedSymptom}
            visible={showSymptomOverlay}
          />
        </div>
      ) : (
        <div className="chart-with-symptom-overlay">
          <ResponsiveContainer
            key="blood-pressure-screen"
            width="100%"
            height={210}
          >
            {chart()}
          </ResponsiveContainer>
          <SymptomOverlay
            symptoms={symptoms}
            from={from}
            to={to}
            selectedSymptom={selectedSymptom}
            visible={showSymptomOverlay}
          />
        </div>
      )}
      {!printLayout && (
        <div className="bp-legend">
          <small style={{ color: colorsByMetric.bloodPressureSystolic }}>
            ▮ Systolic (range, avg tick)
          </small>
          <small
            style={{
              color: colorsByMetric.bloodPressureDiastolic,
              marginLeft: 14,
            }}
          >
            ▮ Diastolic (range, avg tick)
          </small>
          {derivedDays.length > 0 && (
            <small style={{ color: "#71717a", marginLeft: 14 }}>
              ┄● Hypertension level (right axis)
            </small>
          )}
        </div>
      )}
    </article>
  );
});
