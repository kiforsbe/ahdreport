import { memo } from "react";
import { type GlucoseRange, type HourProfile, formatMmol, glucoseColors, niceYMax } from "../../glucose";

const W = 760, H = 220, L = 34, R = 10, T = 10, B = 24;
type Band = "p5" | "p25" | "p50" | "p75" | "p95";

// Hour-of-day percentile profile (AGP-style). Only rendered for continuous data.
export const GlucoseDailyPattern = memo(function GlucoseDailyPattern({
  profile,
  range,
}: {
  profile: HourProfile[];
  range: GlucoseRange;
}) {
  const filled = profile.filter((p) => p.percentiles);
  if (!filled.length) return null;
  const yMax = niceYMax(Math.max(...filled.map((p) => p.percentiles!.p95)));
  const x = (hour: number) => L + (hour / 23) * (W - L - R);
  const y = (v: number) => T + (1 - Math.min(v, yMax) / yMax) * (H - T - B);
  // Break the shapes at hours without readings.
  const runs: HourProfile[][] = [[]];
  for (const p of profile) {
    if (p.percentiles) runs.at(-1)!.push(p);
    else if (runs.at(-1)!.length) runs.push([]);
  }
  const at = (p: HourProfile, band: Band) => `${x(p.hour)},${y(p.percentiles![band])}`;
  const area = (run: HourProfile[], lo: Band, hi: Band) =>
    `M${run.map((p) => at(p, hi)).join("L")}L${run.slice().reverse().map((p) => at(p, lo)).join("L")}Z`;
  const peak = filled.reduce((a, b) => (b.percentiles!.p50 > a.percentiles!.p50 ? b : a));
  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <div className="glucose-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Glucose percentiles by hour of day">
        {Array.from({ length: yMax / 2 + 1 }, (_, k) => k * 2).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f6" />
            <text x={L - 7} y={y(v) + 3.5} fontSize="10" fill="#8a94a6" textAnchor="end">{v}</text>
          </g>
        ))}
        <rect x={L} y={y(range.high)} width={W - L - R} height={y(range.low) - y(range.high)} fill={glucoseColors.band} />
        {runs.filter((run) => run.length > 1).map((run, i) => (
          <g key={i}>
            <path d={area(run, "p5", "p95")} fill={glucoseColors.line} fillOpacity=".1" />
            <path d={area(run, "p25", "p75")} fill={glucoseColors.line} fillOpacity=".24" />
            <path className="glucose-pattern-median" d={`M${run.map((p) => at(p, "p50")).join("L")}`} fill="none" stroke={glucoseColors.line} strokeWidth="2" />
          </g>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <text key={h} x={x(h)} y={H - 6} fontSize="10" fill="#8a94a6" textAnchor="middle">{hourLabel(h)}</text>
        ))}
        <text x={x(peak.hour)} y={y(peak.percentiles!.p95) - 6} fontSize="9" fontWeight="700" fill="#23314a" textAnchor="middle">
          Median peak {formatMmol(peak.percentiles!.p50)} at {hourLabel(peak.hour)}
        </text>
      </svg>
    </div>
  );
});
