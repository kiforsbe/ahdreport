import { format } from "../../report";

export function plateauCalloutDot(
  callouts: Map<string, number>,
  color: string,
  options?: { unit?: string; decimals?: number },
) {
  return (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !callouts.has(payload.date)) return <g />;
    const value = callouts.get(payload.date)!;
    return (
      <g>
        <rect
          x={cx - 4}
          y={cy - 4}
          width={8}
          height={8}
          transform={`rotate(45 ${cx} ${cy})`}
          fill="white"
          stroke={color}
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill={color}
        >
          {format(value, options?.unit ?? "", options?.decimals)}
        </text>
      </g>
    );
  };
}

export function outlierDot(
  outliers: Set<string>,
  color: string,
  options?: { valueKey?: string; unit?: string; decimals?: number },
) {
  const valueKey = options?.valueKey ?? "value";
  return (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !outliers.has(payload.date)) return <g />;
    const value = payload[valueKey];
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill="white" stroke={color} strokeWidth={2.5} />
        {value !== undefined && (
          <text
            x={cx}
            y={cy - 10}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={color}
          >
            {format(value, options?.unit ?? "", options?.decimals)}
          </text>
        )}
      </g>
    );
  };
}
