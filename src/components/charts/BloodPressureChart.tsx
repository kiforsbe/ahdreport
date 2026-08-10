import { useContext } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData } from "../../shared/types";
import { colorsByMetric, dailyStats, format, outlierDates } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { coverageNote } from "../TableNotes";
import { bpRangeBarShape } from "./bpChartShapes";
import { OutlierNote } from "./outlierHelpers";

function BpTooltip({ active, payload, label }: any) {
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
      <b>{new Date(`${label}T00:00:00`).toLocaleDateString()}</b>
      <div style={{ color: colorsByMetric.bloodPressureSystolic, marginTop: 4 }}>
        Systolic: {range(row.sLow, row.sHigh, row.sAvg)}
      </div>
      <div style={{ color: colorsByMetric.bloodPressureDiastolic }}>
        Diastolic: {range(row.dLow, row.dHigh, row.dAvg)}
      </div>
    </div>
  );
}
export function BloodPressureChart({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const sNote = coverageNote("bloodPressureSystolic", records, from, to);
  const dNote = coverageNote("bloodPressureDiastolic", records, from, to);
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
  const chartRows = rows.map((r) => ({
    ...r,
    sOutlier: sOutliers.has(r.date),
    dOutlier: dOutliers.has(r.date),
  }));
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
      <YAxis domain={[axisMin, "auto"]} tick={{ fontSize: 11 }} width={45} />
      <Tooltip content={<BpTooltip />} />
      <Bar
        dataKey="sBase"
        stackId="s"
        fill="transparent"
        isAnimationActive={false}
      />
      <Bar
        dataKey="sRange"
        stackId="s"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureSystolic,
          "sLow",
          "sHigh",
          "sAvg",
          "sOutlier",
        )}
        isAnimationActive={false}
      />
      <Bar
        dataKey="dBase"
        stackId="d"
        fill="transparent"
        isAnimationActive={false}
      />
      <Bar
        dataKey="dRange"
        stackId="d"
        shape={bpRangeBarShape(
          colorsByMetric.bloodPressureDiastolic,
          "dLow",
          "dHigh",
          "dAvg",
          "dOutlier",
        )}
        isAnimationActive={false}
      />
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
        <div data-pdf-chart-ready="true">{chart(680, 260)}</div>
      ) : (
        <ResponsiveContainer
          key="blood-pressure-screen"
          width="100%"
          height={210}
        >
          {chart()}
        </ResponsiveContainer>
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
        </div>
      )}
      {!printLayout && (
        <>
          <OutlierNote
            label="Systolic"
            outliers={sOutliers}
            rows={rows
              .filter((r): r is typeof r & { sAvg: number } => r.sAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.sAvg }))}
            unit="mmHg"
            decimals={0}
          />
          <OutlierNote
            label="Diastolic"
            outliers={dOutliers}
            rows={rows
              .filter((r): r is typeof r & { dAvg: number } => r.dAvg !== undefined)
              .map((r) => ({ date: r.date, value: r.dAvg }))}
            unit="mmHg"
            decimals={0}
          />
        </>
      )}
    </article>
  );
}
