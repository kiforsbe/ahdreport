import { memo } from "react";
import {
  type GlucoseDay,
  type GlucoseRange,
  HOUR_MS,
  MINUTE_MS,
  glucoseColors,
  glucoseStatusColor,
} from "../glucose";

const HEIGHT = 40;
const PLOT = 28;
// Standalone default (no caller currently uses this): the pre-fix ceiling.
const DEFAULT_Y_MAX = 14;

// Clock-time trace (x = 00:00–24:00). The generic DayTrace spaces points by
// index, which misrepresents irregular fingerstick timing.
export const GlucoseDayTrace = memo(function GlucoseDayTrace({
  day,
  range,
  width,
  yMax = DEFAULT_Y_MAX,
}: {
  day: GlucoseDay;
  range: GlucoseRange;
  width: number;
  // Shared across a column of rows (see GlucoseReportTable), so every row in
  // the table plots on the same scale, like DailyDistribution's columnMax.
  yMax?: number;
}) {
  const dayStart = new Date(`${day.date}T00:00:00`).getTime();
  const x = (t: number) => ((t - dayStart) / (24 * HOUR_MS)) * width;
  const y = (v: number) => 1 + (1 - Math.min(v, yMax) / yMax) * (PLOT - 2);
  const points = day.readings.map((r) => ({ t: Date.parse(r.date), v: r.value }));
  const continuous = points.length > 40;
  let path = "";
  let previous = -Infinity;
  if (continuous)
    for (const p of points) {
      path += `${p.t - previous > 20 * MINUTE_MS ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      previous = p.t;
    }
  return (
    <svg
      className="glucose-day-trace"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      aria-label={`Readings across the day: ${day.counts.below} below and ${day.counts.above} above target; ${day.carbs.length} carbohydrate, ${day.insulin.length} insulin and ${day.activity.length} activity entries`}
    >
      <rect x="0" y={y(range.high)} width={width} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
      {[6, 12, 18].map((h) => (
        <line key={h} x1={x(dayStart + h * HOUR_MS)} x2={x(dayStart + h * HOUR_MS)} y1="0" y2={PLOT} stroke="#eef1f6" />
      ))}
      <line x1="0" x2={width} y1={PLOT} y2={PLOT} stroke="#d9dfeb" />
      {continuous ? (
        <path d={path} fill="none" stroke={glucoseColors.line} strokeWidth="1.5" />
      ) : (
        <>
          {points.length > 1 && (
            <polyline
              points={points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={glucoseColors.line}
              strokeOpacity=".45"
              strokeWidth="1"
            />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={x(p.t)} cy={y(p.v)} r="2.6" fill={glucoseStatusColor(p.v, range)} stroke="white" strokeWidth=".8" />
          ))}
        </>
      )}
      {day.carbs.map((c, i) => (
        <rect key={`c${i}`} x={x(Date.parse(c.date)) - 1} y={PLOT + 3} width="2" height="7" rx="1" fill={glucoseColors.carbs} />
      ))}
      {day.insulin.map((u, i) =>
        u.category === "basal" ? (
          <rect key={`i${i}`} x={x(Date.parse(u.date)) - 1.5} y={PLOT + 4} width="3" height="5" rx="1" fill="none" stroke={glucoseColors.insulin} strokeWidth=".8" />
        ) : (
          <rect key={`i${i}`} x={x(Date.parse(u.date)) - 1} y={PLOT + 3} width="2" height="7" rx="1" fill={glucoseColors.insulin} />
        ),
      )}
      {day.activity.map((a, i) => (
        <rect key={`a${i}`} x={x(a.start)} y={PLOT + 5} width={Math.max(3, x(a.end) - x(a.start))} height="4" rx="2" fill={glucoseColors.activity} />
      ))}
    </svg>
  );
});
