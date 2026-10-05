import { memo } from "react";
import {
  type GlucoseDay,
  type GlucoseRange,
  HOUR_MS,
  MINUTE_MS,
  glucoseColors,
  glucoseStatusColor,
  DEFAULT_GLUCOSE_DAY_START,
  glucoseMealPairs,
  glucoseTrackingWindow,
} from "../glucose";
import { GlucoseReferenceLines } from "./glucose/GlucoseReferenceLines";

const HEIGHT = 40;
const PLOT = 28;
// Standalone default (no caller currently uses this): the pre-fix ceiling.
const DEFAULT_Y_MAX = 14;

// Clock-time trace (x = morning–next morning). The generic DayTrace spaces points by
// index, which misrepresents irregular fingerstick timing.
export const GlucoseDayTrace = memo(function GlucoseDayTrace({
  day,
  range,
  width,
  yMax = DEFAULT_Y_MAX,
  startHour = DEFAULT_GLUCOSE_DAY_START,
}: {
  day: GlucoseDay;
  range: GlucoseRange;
  width: number;
  // Shared across a column of rows (see GlucoseReportTable), so every row in
  // the table plots on the same scale, like DailyDistribution's columnMax.
  yMax?: number;
  startHour?: number;
}) {
  const { start: dayStart, end: dayEnd } = glucoseTrackingWindow(day.date, startHour);
  const x = (t: number) => ((t - dayStart) / (dayEnd - dayStart)) * width;
  const y = (v: number) => 1 + (1 - Math.min(v, yMax) / yMax) * (PLOT - 2);
  const points = day.readings.map((r) => ({ t: Date.parse(r.date), v: r.value }));
  const continuous = points.length > 40;
  const pairs = glucoseMealPairs([...day.readings, ...day.carbs]);
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
      <GlucoseReferenceLines range={range} left={0} right={width} y={y} labels={false} />
      {[6, 12, 18].map((h) => (
        <line key={h} x1={x(dayStart + h * HOUR_MS)} x2={x(dayStart + h * HOUR_MS)} y1="0" y2={PLOT} stroke="#eef1f6" />
      ))}
      <line x1="0" x2={width} y1={PLOT} y2={PLOT} stroke="#d9dfeb" />
      {continuous ? (
        <path d={path} fill="none" stroke={glucoseColors.line} strokeWidth="1.5" />
      ) : (
        <>
          {pairs.map((pair, i) => <line key={`pair${i}`} className="glucose-pair-trace"
            x1={x(Date.parse(pair.before.date))} x2={x(Date.parse(pair.after.date))}
            y1={y(pair.before.value)} y2={y(pair.after.value)} stroke={pair.delta > 0 ? "#d97736" : "#0a8d83"}
            strokeDasharray={pair.evidence === "timing" ? "2 2" : undefined} strokeWidth="1.2">
            <title>{`${pair.minutes} min · Δ ${pair.delta.toFixed(1)} mmol/L · ${pair.evidence === "timing" ? "inferred meal pair" : "meal context recorded"}`}</title>
          </line>)}
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
