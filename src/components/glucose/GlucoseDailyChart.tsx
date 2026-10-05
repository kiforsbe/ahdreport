import { memo, useState, type MouseEvent } from "react";
import { formatDate } from "../../report";
import {
  type GlucoseDay,
  type GlucoseRange,
  HOUR_MS,
  formatMmol,
  glucoseColors,
  localDay,
  medianOf,
  niceYMax,
  shortDate,
} from "../../glucose";
import { GlucoseReferenceLines } from "./GlucoseReferenceLines";

const W = 760, H = 220, L = 34, R = 10, T = 10, B = 24;
// Periods this long draw one range-bar + median per week instead of per day,
// so a multi-year "All time" import doesn't crowd thousands of SVG nodes
// into a fixed-width viewBox. See GlucoseTimeline's own (smaller) threshold
// for the same idea applied to its per-reading view.
const AGGREGATE_AFTER_DAYS = 180;

// Daily min–max bars with a median dot, in the RangeMetricChart visual language.
export const GlucoseDailyChart = memo(function GlucoseDailyChart({
  days,
  range,
  from,
  to,
}: {
  days: GlucoseDay[];
  range: GlucoseRange;
  from: string;
  to: string;
}) {
  const [hover, setHover] = useState<number>();
  if (!days.length) return null;
  const ascending = days.slice().reverse();
  const first = from || ascending[0].date;
  const last = to || ascending.at(-1)!.date;
  const origin = new Date(`${first}T12:00:00`).getTime();
  const indexOf = (date: string) => Math.round((new Date(`${date}T12:00:00`).getTime() - origin) / (24 * HOUR_MS));
  const totalDays = indexOf(last) + 1;
  const weekly = totalDays > AGGREGATE_AFTER_DAYS;
  const unitDays = weekly ? 7 : 1;
  const dateAt = (index: number) => localDay(origin + index * unitDays * 24 * HOUR_MS);
  const count = weekly ? Math.ceil(totalDays / 7) : totalDays;

  interface Row { index: number; min: number; max: number; median: number; count: number }
  let rows: Row[];
  if (weekly) {
    const buckets = new Map<number, GlucoseDay[]>();
    for (const day of ascending) {
      const week = Math.floor(indexOf(day.date) / 7);
      const bucket = buckets.get(week);
      if (bucket) bucket.push(day);
      else buckets.set(week, [day]);
    }
    rows = [...buckets]
      .map(([week, weekDays]) => ({
        index: week,
        min: Math.min(...weekDays.map((d) => d.min)),
        max: Math.max(...weekDays.map((d) => d.max)),
        median: medianOf(weekDays.map((d) => d.median))!,
        count: weekDays.reduce((sum, d) => sum + d.count, 0),
      }))
      .sort((a, b) => a.index - b.index);
  } else {
    rows = ascending.map((day) => ({
      index: indexOf(day.date),
      min: day.min,
      max: day.max,
      median: day.median,
      count: day.count,
    }));
  }
  const byIndex = new Map(rows.map((row) => [row.index, row]));
  const yMax = niceYMax(Math.max(...days.map((d) => d.max)));
  const x = (i: number) => L + ((i + 0.5) / count) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const labelEvery = Math.max(1, Math.ceil(count / 8));
  let path = "";
  let previous = -2;
  for (const row of rows) {
    path += `${row.index === previous + 1 ? "L" : "M"}${x(row.index).toFixed(1)},${y(row.median).toFixed(1)}`;
    previous = row.index;
  }
  const onMove = (event: MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    if (!box.width) return;
    const sx = ((event.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(count - 1, Math.floor(((sx - L) / (W - L - R)) * count))));
  };
  const hovered = hover === undefined ? undefined : byIndex.get(hover);
  return (
    <div className="glucose-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily glucose range and median over the selected period">
        {Array.from({ length: yMax / 2 + 1 }, (_, k) => k * 2).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f6" />
            <text x={L - 7} y={y(v) + 3.5} fontSize="10" fill="#8a94a6" textAnchor="end">{v}</text>
          </g>
        ))}
        <rect x={L} y={y(range.high)} width={W - L - R} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
        <GlucoseReferenceLines range={range} left={L} right={W - R} y={y} />
        {Array.from({ length: Math.ceil(count / labelEvery) }, (_, k) => k * labelEvery).map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="#8a94a6" textAnchor="middle">{shortDate(dateAt(i))}</text>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#cfd6e3" />
        {rows.map((row) => (
          <line key={`r${row.index}`} x1={x(row.index)} x2={x(row.index)} y1={y(row.max)} y2={y(row.min)} stroke={glucoseColors.line} strokeOpacity=".28" strokeWidth="5" strokeLinecap="round" />
        ))}
        <path className="glucose-median-line" d={path} fill="none" stroke={glucoseColors.line} strokeWidth="2" />
        {rows.map((row) => (
          <circle key={`m${row.index}`} className="glucose-median" cx={x(row.index)} cy={y(row.median)} r="4" fill={glucoseColors.line} stroke="white" strokeWidth="2" />
        ))}
        {hover !== undefined && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#23314a" strokeDasharray="3 3" opacity=".5" />}
        <rect className="glucose-chart-hit" x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(undefined)} />
      </svg>
      {weekly && <small className="glucose-timeline-note">Periods longer than 180 days show one point per week.</small>}
      {hover !== undefined && (
        <div className="glucose-tooltip" role="status" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{weekly ? `Week of ${formatDate(dateAt(hover))}` : formatDate(dateAt(hover))}</b>
          {hovered ? (
            <>
              <span>Median {formatMmol(hovered.median)} mmol/L</span>
              <small>Range {formatMmol(hovered.min)}–{formatMmol(hovered.max)} · {hovered.count} readings</small>
            </>
          ) : (
            <small>No glucose readings</small>
          )}
        </div>
      )}
    </div>
  );
});
