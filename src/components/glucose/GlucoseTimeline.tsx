import { memo, useMemo, useState, type MouseEvent } from "react";
import type { HealthRecord } from "../../shared/types";
import { format } from "../../report";
import {
  type GlucoseRange,
  HOUR_MS,
  MINUTE_MS,
  activitySessions,
  classifyGlucose,
  formatMmol,
  glucoseColors,
  glucoseDaily,
  glucoseReadings,
  glucoseStatusColor,
  localDay,
  medianOf,
  shortDate,
  sleepNights,
  timeOfDay,
} from "../../glucose";

const W = 760, L = 92, R = 8, T = 6, PLOT_H = 170, LANE_H = 30, Y_MAX = 14;
const DAY_MS = 24 * HOUR_MS;
const LANES = ["Carbohydrates", "Insulin", "Activity", "Sleep"];
const LANE_COLORS = [glucoseColors.carbs, glucoseColors.insulin, glucoseColors.activity, glucoseColors.sleep];
const LANES_TOP = T + PLOT_H + 22;
const H = LANES_TOP + LANES.length * LANE_H + 4;
const AGGREGATE_AFTER_DAYS = 45;

interface Point { t: number; v: number }
interface Mark { t: number; t2?: number; value: number; size: number; hollow?: boolean; text?: string }
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
function perDay(items: { t: number; value: number }[]) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(localDay(item.t), (totals.get(localDay(item.t)) ?? 0) + item.value);
  return [...totals].map(([day, value]) => ({ t: noon(day), value }));
}
// Label the largest marks, skipping any within 60 units of an already-labelled one.
function labelLargest(marks: Mark[], x: (t: number) => number, count: number, text: (v: number) => string) {
  const kept: Mark[] = [];
  for (const mark of marks.slice().sort((a, b) => b.value - a.value)) {
    if (kept.length === count) break;
    if (kept.every((k) => Math.abs(x(k.t) - x(mark.t)) > 60)) kept.push(mark);
  }
  kept.forEach((mark) => { mark.text = text(mark.value); });
  return marks;
}
function scaled(items: { t: number; value: number }[], cap?: number): Mark[] {
  const max = cap ?? Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => ({ t: i.t, value: i.value, size: Math.min(1, i.value / max) }));
}

function buildTimeline(records: HealthRecord[], range: GlucoseRange, from: string, to: string, continuous: boolean) {
  const readings = glucoseReadings(records);
  if (!readings.length) return undefined;
  const start = new Date(`${from || localDay(readings[0].date)}T00:00:00`).getTime();
  const end = new Date(`${to || localDay(readings.at(-1)!.date)}T00:00:00`).getTime() + DAY_MS;
  const aggregated = (end - start) / DAY_MS > AGGREGATE_AFTER_DAYS;
  const x = (t: number) => L + ((t - start) / (end - start)) * (W - L - R);
  const carbs = records.filter((r) => r.metric === "carbs").map((r) => ({ t: Date.parse(r.date), value: r.value }));
  const insulin = records
    .filter((r) => r.metric === "insulinDelivery")
    .map((r) => ({ t: Date.parse(r.date), value: r.value, basal: r.category === "basal" }));
  const sessions = activitySessions(records);
  const nights = sleepNights(records);
  let points: Point[];
  if (aggregated)
    points = glucoseDaily(records, range).reverse().map((day) => ({ t: noon(day.date), v: day.median }));
  else if (continuous) {
    const hours = new Map<number, number[]>();
    for (const reading of readings) {
      const key = Math.floor(Date.parse(reading.date) / HOUR_MS);
      const bucket = hours.get(key);
      if (bucket) bucket.push(reading.value);
      else hours.set(key, [reading.value]);
    }
    points = [...hours].map(([key, values]) => ({ t: key * HOUR_MS + HOUR_MS / 2, v: medianOf(values)! }));
  } else points = readings.map((r) => ({ t: Date.parse(r.date), v: r.value }));

  let lanes: Mark[][];
  if (aggregated)
    lanes = [
      labelLargest(scaled(perDay(carbs)), x, 1, (v) => `${Math.round(v)} g`),
      labelLargest(scaled(perDay(insulin)), x, 1, (v) => `${format(v, "", 1)} IU`),
      labelLargest(scaled(perDay(sessions.map((s) => ({ t: s.start, value: s.minutes })))), x, 1, (v) => `${Math.round(v)} min`),
      labelLargest(scaled(nights.map((n) => ({ t: noon(n.date), value: n.hours }))), x, 1, (v) => `${format(v, "", 1)} h`),
    ];
  else {
    const sleepMarks: Mark[] = nights.map((n) => ({ t: n.start, t2: n.end, value: n.hours, size: 1 }));
    const bySleep = sleepMarks.slice().sort((a, b) => a.value - b.value);
    [bySleep[0], bySleep.at(-1)]
      .filter((mark, i, all): mark is Mark => !!mark && (i === 0 || Math.abs(x(mark.t) - x(all[0]!.t)) > 60))
      .forEach((mark) => { mark.text = `${format(mark.value, "", 1)} h`; });
    lanes = [
      labelLargest(scaled(carbs, 95), x, 3, (v) => `${Math.round(v)} g`),
      insulin.map((u) => ({ t: u.t, value: u.value, size: u.basal ? 0.5 : 1, hollow: u.basal })),
      labelLargest(sessions.map((s) => ({ t: s.start, t2: s.end, value: s.minutes, size: 1 })), x, 1, (v) => `${Math.round(v)} min`),
      sleepMarks,
    ];
  }
  const window = aggregated ? DAY_MS / 2 : 90 * MINUTE_MS;
  const eventsNear = (t: number) => ({
    carbs: carbs.filter((c) => Math.abs(c.t - t) < window),
    insulin: insulin.filter((u) => Math.abs(u.t - t) < window),
    sessions: sessions.filter((s) => Math.abs(s.start - t) < window),
  });
  return { start, end, aggregated, x, points, lanes, eventsNear };
}

function LaneMark({ mark, x, top, color }: { mark: Mark; x: (t: number) => number; top: number; color: string }) {
  const label = mark.text && (
    <text x={mark.t2 === undefined ? x(mark.t) : (x(mark.t) + x(mark.t2)) / 2} y={top + 8} fontSize="9" fontWeight="700" fill="#23314a" textAnchor="middle">
      {mark.text}
    </text>
  );
  if (mark.t2 !== undefined)
    return (
      <>
        {label}
        <rect x={x(mark.t)} y={top + 14} width={Math.max(3, x(mark.t2) - x(mark.t))} height="8" rx="3" fill={color} />
      </>
    );
  const height = 4 + mark.size * 13;
  return (
    <>
      {label}
      <rect
        x={x(mark.t) - 1.25}
        y={top + LANE_H - 4 - height}
        width="2.5"
        height={height}
        rx="1.25"
        fill={mark.hollow ? "none" : color}
        stroke={mark.hollow ? color : undefined}
      />
    </>
  );
}

export const GlucoseTimeline = memo(function GlucoseTimeline({
  records,
  range,
  from,
  to,
  continuous,
}: {
  records: HealthRecord[];
  range: GlucoseRange;
  from: string;
  to: string;
  continuous: boolean;
}) {
  const model = useMemo(() => buildTimeline(records, range, from, to, continuous), [records, range, from, to, continuous]);
  const [hover, setHover] = useState<Point>();
  if (!model) return null;
  const { x, points, lanes, aggregated } = model;
  const y = (v: number) => T + (1 - Math.min(v, Y_MAX) / Y_MAX) * PLOT_H;
  const laneTop = (k: number) => LANES_TOP + k * LANE_H;
  const days = Math.round((model.end - model.start) / DAY_MS);
  const labelEvery = Math.max(1, Math.ceil(days / 8));
  const asLine = aggregated || continuous;
  const gap = aggregated ? 1.5 * DAY_MS : 2 * HOUR_MS;
  let path = "";
  let previous = -Infinity;
  if (asLine)
    for (const p of points) {
      path += `${p.t - previous > gap ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      previous = p.t;
    }
  // Lines show out-of-range points only; spot readings show every point.
  const dots = asLine && !aggregated ? points.filter((p) => classifyGlucose(p.v, range) !== "within") : points;
  const onMove = (event: MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    if (!box.width) return;
    const t = model.start + ((((event.clientX - box.left) / box.width) * W - L) / (W - L - R)) * (model.end - model.start);
    setHover(points.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best)));
  };
  const near = hover && model.eventsNear(hover.t);
  return (
    <div className="glucose-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Glucose readings with carbohydrate, insulin, activity and sleep lanes">
        {[0, 2, 4, 6, 8, 10, 12, 14].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f6" />
            <text x={L - 7} y={y(v) + 3.5} fontSize="10" fill="#8a94a6" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x="0" y={T + PLOT_H / 2} fontSize="11" fill="#536176">mmol/L</text>
        <rect x={L} y={y(range.high)} width={W - L - R} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
        {asLine && <path className="glucose-timeline-line" d={path} fill="none" stroke={glucoseColors.line} strokeWidth="1.2" strokeOpacity=".85" />}
        {dots.map((p, i) => (
          <circle
            key={i}
            className="glucose-timeline-point"
            cx={x(p.t)}
            cy={y(p.v)}
            r={asLine ? 2.2 : 3.4}
            fill={glucoseStatusColor(p.v, range)}
            stroke={asLine ? undefined : "white"}
          />
        ))}
        {Array.from({ length: Math.floor(days / labelEvery) + 1 }, (_, k) => k * labelEvery).map((i) => (
          <text key={i} x={x(model.start + i * DAY_MS)} y={T + PLOT_H + 15} fontSize="10" fill="#8a94a6" textAnchor="middle">
            {shortDate(localDay(model.start + i * DAY_MS + DAY_MS / 2))}
          </text>
        ))}
        {LANES.map((name, k) => (
          <g key={name}>
            <line x1={L} x2={W - R} y1={laneTop(k)} y2={laneTop(k)} stroke="#e5e9f0" />
            <text x="0" y={laneTop(k) + LANE_H / 2 + 4} fontSize="11" fill="#23314a">{name}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={laneTop(LANES.length)} y2={laneTop(LANES.length)} stroke="#e5e9f0" />
        {lanes.map((marks, k) => marks.map((mark, i) => <LaneMark key={`${k}-${i}`} mark={mark} x={x} top={laneTop(k)} color={LANE_COLORS[k]} />))}
        {hover && <line x1={x(hover.t)} x2={x(hover.t)} y1={T} y2={laneTop(LANES.length)} stroke="#23314a" strokeDasharray="3 3" opacity=".5" />}
        <rect className="glucose-chart-hit" x={L} y={T} width={W - L - R} height={laneTop(LANES.length) - T} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(undefined)} />
      </svg>
      {aggregated && <small className="glucose-timeline-note">Periods longer than 45 days show one point per day and daily totals.</small>}
      {hover && near && (
        <div className="glucose-tooltip" role="status" style={{ left: `${(x(hover.t) / W) * 100}%` }}>
          <b>
            {shortDate(localDay(hover.t))}
            {aggregated ? "" : ` ${timeOfDay(hover.t)}`}
          </b>
          <span>
            {formatMmol(hover.v)} mmol/L{aggregated ? " (daily median)" : continuous ? " (hourly median)" : ""}
          </span>
          {near.carbs.length > 0 && <small>Carbohydrates {near.carbs.map((c) => `${Math.round(c.value)} g`).join(", ")}</small>}
          {near.insulin.length > 0 && (
            <small>Insulin {near.insulin.map((u) => `${format(u.value, "", 1)} IU${u.basal ? " basal" : ""}`).join(", ")}</small>
          )}
          {near.sessions.length > 0 && <small>Activity {near.sessions.map((s) => `${Math.round(s.minutes)} min`).join(", ")}</small>}
        </div>
      )}
    </div>
  );
});
