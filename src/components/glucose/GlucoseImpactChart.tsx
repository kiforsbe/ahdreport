import { memo, useContext, useMemo, useState } from "react";
import type { HealthRecord } from "../../shared/types";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import {
  type GlucoseRange, type GlucoseAxis, DEFAULT_GLUCOSE_DAY_START, formatMmol, glucoseColors, glucoseChartAxis,
  glucoseDaily, glucoseMealPairs, glucoseMorningReading, glucoseTrackingDay,
  localDay, shortDate, timeOfDay,
} from "../../glucose";
import { GlucoseReferenceLines } from "./GlucoseReferenceLines";

const H = 300, L = 34, R = 10, T = 18, B = 55;
const rise = "#d97736", fall = "#0a8d83";

// Each daily cluster uses clock time within a morning-to-morning window.
// Its candle endpoints are the actual two measurements, never inferred peaks.
export const GlucoseImpactChart = memo(function GlucoseImpactChart({ records, contextRecords = records, range, startHour = DEFAULT_GLUCOSE_DAY_START, axis }: {
  records: HealthRecord[]; contextRecords?: HealthRecord[]; range: GlucoseRange; startHour?: number; axis?: GlucoseAxis;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const model = useMemo(() => {
    const days = glucoseDaily(records, range, startHour).reverse();
    const fasting = new Map([...new Set(records.filter(r => r.metric === "bloodGlucose").map(r => localDay(r.date)))]
      .map(day => [day, glucoseMorningReading(contextRecords, day)]));
    const pairs = glucoseMealPairs(records);
    return days.map(day => ({
      ...day,
      fasting: day.readings.filter(r => fasting.get(localDay(r.date))?.reading === r),
      pairs: pairs.filter(pair => glucoseTrackingDay(pair.before.date, startHour) === day.date),
    }));
  }, [records, contextRecords, range, startHour]);
  const [hover, setHover] = useState<{ x: number; lines: string[] }>();
  const bounds = useMemo(() => axis ?? glucoseChartAxis(records, contextRecords, startHour), [axis, records, contextRecords, startHour]);
  if (!model.length) return null;
  // Horizontal scroll preserves small candles for long histories; every day stays accessible.
  const width = Math.max(760, model.length * 60 + L + R);
  const slot = (width - L - R) / model.length;
  const y = (value: number) => T + (bounds.max - value) / (bounds.max - bounds.min) * (H - T - B);
  const bandLow = Math.max(bounds.min, range.low), bandHigh = Math.min(bounds.max, range.high);
  const clockX = (i: number, hour: number) => L + i * slot + slot * (0.1 + hour / 24 * 0.8);
  const x = (i: number, record: HealthRecord) => {
    const date = new Date(record.date);
    const hour = (date.getHours() + date.getMinutes() / 60 - startHour + 24) % 24;
    return clockX(i, hour);
  };
  const activate = (cx: number, lines: string[]) => ({
    tabIndex: printLayout ? undefined : 0,
    onMouseEnter: () => setHover({ x: cx, lines }), onMouseLeave: () => setHover(undefined),
    onFocus: () => setHover({ x: cx, lines }), onBlur: () => setHover(undefined),
  });
  const allPairs = model.flatMap(day => day.pairs);
  const startLabel = `${String(startHour).padStart(2, "0")}:00`;
  return <>
    <div className="glucose-impact-scroll">
      <div className="glucose-chart-wrap glucose-impact-chart" style={{ minWidth: printLayout ? undefined : width > 760 ? width : undefined }}>
        <svg viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Fasting readings and meal-response candles for ${model.length} morning-to-morning days`}>
          {bounds.ticks.map(value => <g key={value} className="glucose-y-axis">
            <line x1={L} x2={width - R} y1={y(value)} y2={y(value)} stroke="#eef1f6" />
            <text x={L - 7} y={y(value) + 3.5} textAnchor="end" fontSize="10" fill="#8a94a6">{value}</text>
          </g>)}
          {bandHigh > bandLow && <rect className="glucose-target-band" x={L} y={y(bandHigh)} width={width - L - R} height={y(bandLow) - y(bandHigh)} fill={glucoseColors.band} />}
          <GlucoseReferenceLines range={range} left={L} right={width - R} y={y} />
          {model.map((day, i) => {
            const paired = new Set(day.pairs.flatMap(p => [p.before, p.after]));
            return <g key={day.date}>
              <line x1={L + i * slot} x2={L + i * slot} y1={T} y2={H - B} stroke="#edf0f6" />
              {day.readings.filter(r => !paired.has(r) && !day.fasting.includes(r)).map((r, j) => <circle
                key={`r${j}`} cx={x(i, r)} cy={y(r.value)} r="2.4" fill="#94a3b8">
                <title>{`${shortDate(localDay(r.date))} ${timeOfDay(r.date)} · ${formatMmol(r.value)} mmol/L · unpaired reading`}</title>
              </circle>)}
              {day.pairs.map((pair, j) => {
                const beforeX = x(i, pair.before);
                // A pair crossing the morning boundary keeps its endpoint in the
                // preceding day and labels the next-morning time in its tooltip.
                const afterX = glucoseTrackingDay(pair.after.date, startHour) === day.date ? x(i, pair.after) : clockX(i, 24);
                const cx = (beforeX + afterX) / 2, beforeY = y(pair.before.value), afterY = y(pair.after.value);
                const color = pair.delta > 0 ? rise : fall;
                const lines = [
                  `${shortDate(localDay(pair.before.date))} · ${pair.evidence === "timing" ? "Inferred meal pair" : pair.evidence === "tags" ? "Meal-tagged pair" : "Logged-carbohydrate pair"}`,
                  `${timeOfDay(pair.before.date)} ${formatMmol(pair.before.value)} → ${timeOfDay(pair.after.date)} ${formatMmol(pair.after.value)} mmol/L`,
                  `${pair.minutes} min · Δ ${pair.delta > 0 ? "+" : ""}${formatMmol(pair.delta)} mmol/L`,
                ];
                return <g key={`p${j}`} className="glucose-meal-candle" aria-label={lines.join(". ")} {...activate(cx, lines)}>
                  <title>{lines.join("\n")}</title>
                  <rect x={cx - 5} y={Math.min(beforeY, afterY) - 5} width="10" height={Math.max(12, Math.abs(afterY - beforeY) + 10)} fill="transparent" />
                  <line x1={cx} x2={cx} y1={beforeY} y2={afterY} stroke={color} strokeWidth="3" strokeDasharray={pair.evidence === "timing" ? "3 2" : undefined} />
                  <circle cx={cx} cy={beforeY} r="3.3" fill="white" stroke={color} strokeWidth="1.7" />
                  <circle cx={cx} cy={afterY} r="3.5" fill={color} stroke="white" strokeWidth=".8" />
                  <path className="glucose-meal-interval" d={`M${beforeX},${H - B + 2}v4H${afterX}v-4`} fill="none" stroke={color} strokeWidth="1.4" />
                </g>;
              })}
              {day.fasting.map((r, j) => {
                const cx = x(i, r) - 5, cy = y(r.value);
                const color = range.preset === "reference" ? r.value >= 7 ? "#c92a2a" : r.value >= 5.6 ? "#b7791f" : glucoseColors.line : glucoseColors.line;
                const lines = [`${shortDate(localDay(r.date))} ${timeOfDay(r.date)} · ${r.category === "fasting" ? "Tagged fasting" : "Assumed fasting"}`,
                  `${formatMmol(r.value)} mmol/L`, "First reading of the calendar day, before 10:00"];
                return <g key={`f${j}`} className="glucose-fasting-marker" aria-label={lines.join(". ")} {...activate(cx, lines)}>
                  <title>{lines.join("\n")}</title>
                  <path d={`M${cx},${cy - 5}l5,5l-5,5l-5,-5Z`} fill={color} stroke="white" strokeWidth="1.2" />
                </g>;
              })}
              {[0, 6, 12, 18, 24].map(offset => <g key={offset}>
                <line x1={clockX(i, offset)} x2={clockX(i, offset)} y1={H - B + 8} y2={H - B + 12} stroke="#cfd6e3" />
                <text x={clockX(i, offset)} y={H - B + 24} fontSize="8" textAnchor="middle" fill="#8a94a6">{String((startHour + offset) % 24).padStart(2, "0")}</text>
              </g>)}
              <text x={L + (i + .5) * slot} y={H - 9} fontSize="10" textAnchor="middle" fill="#536176">{shortDate(day.date)}</text>
            </g>;
          })}
        </svg>
        {hover && !printLayout && <div className="glucose-tooltip glucose-impact-tooltip" role="status"
          style={{ left: `${Math.min(75, hover.x / width * 100)}%` }}>
          <b>{hover.lines[0]}</b>{hover.lines.slice(1).map(line => <span key={line}>{line}</span>)}
        </div>}
      </div>
    </div>
    <div className="glucose-impact-legend">
      <span><i className="diamond" />Assumed fasting</span>
      <span><i className="candle up" />Rise after inferred meal</span>
      <span><i className="candle down" />Fall after inferred meal</span>
      <span><i className="unpaired" />Unpaired reading</span>
    </div>
    <small className="glucose-timeline-note">Each day runs {startLabel} → {startLabel} next morning. Candle position and the bracket below show the measurement interval. Days without readings are omitted; scroll to see the whole period.</small>
    <small className="glucose-timeline-note">First reading before 10:00 is assumed fasting. Hollow → solid candle ends show consecutive readings 1–3 hours apart; dashed candles infer a meal from timing.</small>
    {!allPairs.length && <small className="glucose-timeline-note">No consecutive readings 1–3 hours apart; no meal-response candles can be shown.</small>}
  </>;
});
