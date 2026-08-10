import {
  DEFAULT_COLLAPSE_THRESHOLD_PX,
  DEFAULT_GRID_COLOR,
  DEFAULT_GRID_MINOR_DIVISIONS,
  DEFAULT_GRID_TICK_COUNT,
  DEFAULT_SHADE_COLOR,
  niceStep,
  ticksAtStep,
} from "../chartMath";
import { format } from "../report";

export function DailyDistribution({
  min,
  max,
  average,
  standardDeviation,
  unit,
  single,
  decimals,
  columnMin,
  columnMax,
  collapseThresholdPx = DEFAULT_COLLAPSE_THRESHOLD_PX,
  gridTickCount = DEFAULT_GRID_TICK_COUNT,
  gridColor = DEFAULT_GRID_COLOR,
  gridMinorDivisions = DEFAULT_GRID_MINOR_DIVISIONS,
  color = DEFAULT_SHADE_COLOR,
}: {
  min: number;
  max: number;
  average: number;
  standardDeviation: number;
  unit: string;
  single: boolean;
  decimals?: number;
  columnMin: number;
  columnMax: number;
  collapseThresholdPx?: number;
  gridTickCount?: number;
  gridColor?: string;
  gridMinorDivisions?: number;
  color?: string;
}) {
  const span = columnMax - columnMin || 1;
  const scaleMin = columnMin - span * 0.15;
  const scaleMax = columnMax + span * 0.15;
  const x = (value: number) =>
    8 + ((value - scaleMin) / (scaleMax - scaleMin)) * 144;
  const inRange = (gx: number) => gx > 9 && gx < 151;
  const step = niceStep(scaleMax - scaleMin, gridTickCount);
  const majorTicks = ticksAtStep(scaleMin, scaleMax, step);
  const minorTicks = ticksAtStep(
    scaleMin,
    scaleMax,
    step / gridMinorDivisions,
  ).filter((v) => !majorTicks.some((m) => Math.abs(m - v) < step * 1e-6));
  const grid = (
    <>
      {minorTicks
        .map(x)
        .filter(inRange)
        .map((gx) => (
          <line
            key={`minor-${gx}`}
            x1={gx}
            x2={gx}
            y1="8"
            y2="20"
            stroke={gridColor}
            strokeWidth="1"
            opacity=".6"
          />
        ))}
      {majorTicks
        .map(x)
        .filter(inRange)
        .map((gx) => (
          <line
            key={`major-${gx}`}
            x1={gx}
            x2={gx}
            y1="1"
            y2="27"
            stroke={gridColor}
            strokeWidth="1"
          />
        ))}
    </>
  );
  const avgLabel = (
    <text
      x={x(average)}
      y="6"
      fontSize="8"
      fontWeight="700"
      textAnchor="middle"
      fill="#17213a"
    >
      {format(average, "", decimals)}
    </text>
  );
  if (single)
    return (
      <svg
        width="195"
        height="28"
        viewBox="0 0 195 28"
        aria-label={`Single measurement ${format(average, unit, decimals)}`}
      >
        {grid}
        {avgLabel}
        <circle cx={x(average)} cy="12" r="4" fill={color} />
      </svg>
    );
  const deviationStart = x(Math.max(min, average - standardDeviation));
  const deviationEnd = x(Math.min(max, average + standardDeviation));
  const sigmaLabel = (
    <text x={x(average)} y="24" fontSize="7" textAnchor="middle" fill="#94a3b8">
      σ {format(standardDeviation, "", decimals)}
    </text>
  );
  if (x(max) - x(min) < collapseThresholdPx)
    return (
      <svg
        width="195"
        height="28"
        viewBox="0 0 195 28"
        aria-label={`Average ${format(average, unit, decimals)}, values tightly clustered, standard deviation ${format(standardDeviation, unit, decimals)}`}
      >
        {grid}
        {avgLabel}
        <circle cx={x(average)} cy="12" r="4" fill={color} />
        {sigmaLabel}
      </svg>
    );
  return (
    <svg
      width="195"
      height="28"
      viewBox="0 0 195 28"
      aria-label={`Low ${format(min, unit, decimals)}, average ${format(average, unit, decimals)}, high ${format(max, unit, decimals)}, standard deviation ${format(standardDeviation, unit, decimals)}`}
    >
      {grid}
      <line
        x1={x(min)}
        x2={x(max)}
        y1="12"
        y2="12"
        stroke={color}
        strokeOpacity=".55"
        strokeWidth="2"
      />
      <rect
        x={deviationStart}
        y="7"
        width={Math.max(2, deviationEnd - deviationStart)}
        height="10"
        rx="5"
        fill={color}
        fillOpacity=".3"
      />
      <line
        x1={x(min)}
        x2={x(min)}
        y1="7"
        y2="17"
        stroke={color}
        strokeOpacity=".55"
      />
      <line
        x1={x(max)}
        x2={x(max)}
        y1="7"
        y2="17"
        stroke={color}
        strokeOpacity=".55"
      />
      <circle cx={x(average)} cy="12" r="4" fill={color} />
      {avgLabel}
      {sigmaLabel}
      <text x={x(min)} y="27" fontSize="8" textAnchor="start" fill="#667085">
        {format(min, "", decimals)}
      </text>
      <text x={x(max)} y="27" fontSize="8" textAnchor="end" fill="#667085">
        {format(max, "", decimals)}
      </text>
    </svg>
  );
}
