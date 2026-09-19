import { memo, useContext } from "react";
import {
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
  bpDerived,
  calloutsFromPlateauRows,
  denseDaily,
  format,
  formatDate,
  interpolatedColor,
  outlierDates,
  plateauSegments,
} from "../../report";
import { niceAxisMin } from "../../chartMath";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { outlierDot, plateauCalloutDot } from "./outlierHelpers";

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
      <b>{formatDate(label)}</b>
      <div style={{ color: PULSE_PRESSURE_COLOR, marginTop: 4 }}>
        Pulse pressure: {format(row.pulsePressure, "mmHg")}
      </div>
      <div style={{ color: MAP_COLOR }}>MAP: {format(row.map, "mmHg")}</div>
      {row.interpolated && (
        <div style={{ color: interpolatedColor }}>Interpolated (no data logged)</div>
      )}
    </div>
  );
}
export const PulsePressureChart = memo(function PulsePressureChart({ records }: { records: HealthData["records"] }) {
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
  const pulsePressurePlateau = plateauSegments(
    rows.map((r) => ({ date: r.date, value: r.pulsePressure, unit: "mmHg" })),
  );
  const pulsePressurePlateauByDate = new Map(
    pulsePressurePlateau.map((row) => [row.date, row.value]),
  );
  const pulsePressureCallouts = new Map(
    calloutsFromPlateauRows(pulsePressurePlateau).map((row) => [row.date, row.value]),
  );
  const mapPlateau = plateauSegments(
    rows.map((r) => ({ date: r.date, value: r.map, unit: "mmHg" })),
  );
  const mapPlateauByDate = new Map(mapPlateau.map((row) => [row.date, row.value]));
  const mapCallouts = new Map(
    calloutsFromPlateauRows(mapPlateau).map((row) => [row.date, row.value]),
  );
  const ppDense = denseDaily(
    rows.map((r) => ({ date: r.date, value: r.pulsePressure, unit: "mmHg" })),
  );
  const mapDense = denseDaily(
    rows.map((r) => ({ date: r.date, value: r.map, unit: "mmHg" })),
  );
  const mapDenseByDate = new Map(mapDense.map((row) => [row.date, row]));
  const chartRows = ppDense.map((pp) => {
    const mapRow = mapDenseByDate.get(pp.date);
    return {
      date: pp.date,
      pulsePressure: pp.value,
      map: mapRow?.value,
      realPulsePressure: pp.interpolated ? undefined : pp.value,
      realMap: mapRow && !mapRow.interpolated ? mapRow.value : undefined,
      interpolated: pp.interpolated || Boolean(mapRow?.interpolated),
      pulsePressurePlateau: pulsePressurePlateauByDate.get(pp.date),
      mapPlateau: mapPlateauByDate.get(pp.date),
    };
  });
  const chart = (width?: number, height?: number) => (
    <ComposedChart data={chartRows} width={width} height={height}>
      <CartesianGrid vertical={false} stroke="#e7eaf0" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
      <YAxis domain={[axisMin, "auto"]} tick={{ fontSize: 11 }} width={45} />
      <Tooltip content={<PulsePressureTooltip />} />
      <Line
        type="monotone"
        dataKey="pulsePressure"
        stroke={interpolatedColor}
        strokeWidth={2}
        strokeDasharray="4 3"
        strokeOpacity={0.6}
        dot={false}
        isAnimationActive={!printLayout}
      />
      <Line
        type="monotone"
        dataKey="realPulsePressure"
        stroke={PULSE_PRESSURE_COLOR}
        strokeWidth={2.5}
        connectNulls={false}
        dot={outlierDot(ppOutliers, PULSE_PRESSURE_COLOR, {
          valueKey: "pulsePressure",
          unit: "mmHg",
          decimals: 0,
        })}
        isAnimationActive={!printLayout}
      />
      <Line
        type="monotone"
        dataKey="map"
        stroke={interpolatedColor}
        strokeWidth={2}
        strokeDasharray="4 3"
        strokeOpacity={0.6}
        dot={false}
        isAnimationActive={!printLayout}
      />
      <Line
        type="monotone"
        dataKey="realMap"
        stroke={MAP_COLOR}
        strokeWidth={2.5}
        connectNulls={false}
        dot={outlierDot(mapOutliers, MAP_COLOR, {
          valueKey: "map",
          unit: "mmHg",
          decimals: 0,
        })}
        isAnimationActive={!printLayout}
      />
      {pulsePressurePlateau.length > 0 && (
        <Line
          type="stepAfter"
          dataKey="pulsePressurePlateau"
          name="Pulse pressure plateau"
          stroke={PULSE_PRESSURE_COLOR}
          strokeWidth={2.5}
          dot={plateauCalloutDot(pulsePressureCallouts, PULSE_PRESSURE_COLOR, {
            unit: "mmHg",
            decimals: 0,
          })}
          isAnimationActive={!printLayout}
        />
      )}
      {mapPlateau.length > 0 && (
        <Line
          type="stepAfter"
          dataKey="mapPlateau"
          name="MAP plateau"
          stroke={MAP_COLOR}
          strokeWidth={2.5}
          dot={plateauCalloutDot(mapCallouts, MAP_COLOR, {
            unit: "mmHg",
            decimals: 0,
          })}
          isAnimationActive={!printLayout}
        />
      )}
    </ComposedChart>
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
    </article>
  );
});
