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
import type { HealthData } from "../../shared/types";
import { bpDerived, format, outlierDates } from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { outlierDot, OutlierNote } from "./outlierHelpers";

const PULSE_PRESSURE_COLOR = "#5c5f66";
const MAP_COLOR = "#0b7285";

function PulsePressureTooltip({ active, payload, label }: any) {
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
      <div style={{ color: PULSE_PRESSURE_COLOR, marginTop: 4 }}>
        Pulse pressure: {format(row.pulsePressure, "mmHg")}
      </div>
      <div style={{ color: MAP_COLOR }}>MAP: {format(row.map, "mmHg")}</div>
    </div>
  );
}
export function PulsePressureChart({ records }: { records: HealthData["records"] }) {
  const printLayout = useContext(PrintLayoutContext);
  const rows = bpDerived(records);
  if (!rows.length)
    return (
      <div className="empty small">
        No blood pressure records in this period.
      </div>
    );
  const ppOutliers = outlierDates(
    rows.map((r) => ({ date: r.date, value: r.pulsePressure })),
  );
  const mapOutliers = outlierDates(
    rows.map((r) => ({ date: r.date, value: r.map })),
  );
  const values = rows.flatMap((r) => [r.pulsePressure, r.map]);
  const axisMin = niceAxisMin(Math.min(...values), Math.max(...values));
  const chart = (width?: number, height?: number) => (
    <AreaChart data={rows} width={width} height={height}>
      <CartesianGrid vertical={false} stroke="#e7eaf0" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
      <YAxis domain={[axisMin, "auto"]} tick={{ fontSize: 11 }} width={45} />
      <Tooltip content={<PulsePressureTooltip />} />
      <Area
        type="monotone"
        dataKey="pulsePressure"
        stroke={PULSE_PRESSURE_COLOR}
        strokeWidth={2.5}
        fill="none"
        dot={outlierDot(ppOutliers, PULSE_PRESSURE_COLOR)}
        isAnimationActive={!printLayout}
      />
      <Area
        type="monotone"
        dataKey="map"
        stroke={MAP_COLOR}
        strokeWidth={2.5}
        fill="none"
        dot={outlierDot(mapOutliers, MAP_COLOR)}
        isAnimationActive={!printLayout}
      />
    </AreaChart>
  );
  return (
    <article className="panel">
      <h3>Pulse pressure &amp; mean arterial pressure</h3>
      {printLayout ? (
        <div data-pdf-chart-ready="true">{chart(680, 260)}</div>
      ) : (
        <ResponsiveContainer key="pulse-pressure-screen" width="100%" height={210}>
          {chart()}
        </ResponsiveContainer>
      )}
      {!printLayout && (
        <div className="chart-legend">
          <small style={{ color: PULSE_PRESSURE_COLOR }}>▮ Pulse pressure</small>
          <small style={{ color: MAP_COLOR, marginLeft: 14 }}>
            ▮ Mean arterial pressure
          </small>
        </div>
      )}
      {!printLayout && (
        <>
          <OutlierNote
            label="Pulse pressure"
            outliers={ppOutliers}
            rows={rows.map((r) => ({ date: r.date, value: r.pulsePressure }))}
            unit="mmHg"
            decimals={0}
          />
          <OutlierNote
            label="MAP"
            outliers={mapOutliers}
            rows={rows.map((r) => ({ date: r.date, value: r.map }))}
            unit="mmHg"
            decimals={0}
          />
        </>
      )}
    </article>
  );
}
