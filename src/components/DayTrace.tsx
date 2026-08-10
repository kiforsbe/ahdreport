import { DEFAULT_SHADE_COLOR } from "../chartMath";

export function DayTrace({
  values,
  color = DEFAULT_SHADE_COLOR,
}: {
  values: number[];
  color?: string;
}) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const points = values
    .map(
      (value, index) =>
        `${values.length === 1 ? 50 : (index / (values.length - 1)) * 100},${24 - ((value - low) / range) * 20}`,
    )
    .join(" ");
  return (
    <svg
      width="100"
      height="26"
      viewBox="0 0 100 26"
      aria-label="Measurements across the day"
    >
      <line x1="0" y1="24" x2="100" y2="24" stroke="#d9dfeb" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
