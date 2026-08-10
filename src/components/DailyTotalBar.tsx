import { useId } from "react";
import {
  DEFAULT_GRID_COLOR,
  DEFAULT_GRID_MINOR_DIVISIONS,
  DEFAULT_GRID_TICK_COUNT,
  DEFAULT_SHADE_COLOR,
  niceStep,
  ticksAtStep,
} from "../chartMath";
import { format } from "../report";

export function DailyTotalBar({
  value,
  columnMax,
  unit,
  decimals,
  gridTickCount = DEFAULT_GRID_TICK_COUNT,
  gridColor = DEFAULT_GRID_COLOR,
  gridMinorDivisions = DEFAULT_GRID_MINOR_DIVISIONS,
  color = DEFAULT_SHADE_COLOR,
  subValue,
  subColor,
  subLabel,
}: {
  value: number;
  columnMax: number;
  unit: string;
  decimals?: number;
  gridTickCount?: number;
  gridColor?: string;
  gridMinorDivisions?: number;
  color?: string;
  subValue?: number;
  subColor?: string;
  subLabel?: string;
}) {
  const clipId = useId();
  const max = columnMax || 1;
  const x = (v: number) => 8 + (Math.max(0, Math.min(v, max)) / max) * 144;
  const labelX = 146;
  const labelFill = x(value) >= labelX - 4 ? "#ffffff" : "#17213a";
  const inRange = (gx: number) => gx > 9 && gx < 151;
  const step = niceStep(max, gridTickCount);
  const majorTicks = ticksAtStep(0, max, step);
  const minorTicks = ticksAtStep(0, max, step / gridMinorDivisions).filter(
    (v) => !majorTicks.some((m) => Math.abs(m - v) < step * 1e-6),
  );
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
  const clampedSubValue =
    subValue === undefined ? undefined : Math.min(subValue, value);
  const ariaLabel =
    clampedSubValue === undefined || !subLabel
      ? `${format(value, unit, decimals)} of up to ${format(max, unit, decimals)} for this column`
      : `${format(value, unit, decimals)} of up to ${format(max, unit, decimals)} for this column, including ${format(subValue!, unit, decimals)} ${subLabel}`;
  return (
    <svg width="195" height="28" viewBox="0 0 195 28" aria-label={ariaLabel}>
      {grid}
      <defs>
        <clipPath id={clipId}>
          <rect x="8" y="8" width="144" height="12" rx="6" />
        </clipPath>
      </defs>
      <rect
        x="8"
        y="8"
        width="144"
        height="12"
        rx="6"
        fill={color}
        fillOpacity=".18"
      />
      <rect
        x="8"
        y="8"
        width={x(value) - 8}
        height="12"
        fill={color}
        clipPath={`url(#${clipId})`}
      />
      {clampedSubValue !== undefined && subColor && (
        <rect
          x="8"
          y="8"
          width={x(clampedSubValue) - 8}
          height="12"
          fill={subColor}
          clipPath={`url(#${clipId})`}
        />
      )}
      <text x={labelX} y="17" fontSize="9" textAnchor="end" fill={labelFill}>
        {format(value, "", decimals)}
      </text>
    </svg>
  );
}
