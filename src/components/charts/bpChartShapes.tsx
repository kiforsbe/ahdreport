export function bpRangeBarShape(
  color: string,
  lowKey: string,
  highKey: string,
  avgKey: string,
  outlierKey?: string,
) {
  return (props: any) => {
    const { x, y, width, height, payload } = props;
    const low = payload[lowKey],
      high = payload[highKey],
      average = payload[avgKey];
    if (low === undefined) return <g />;
    const barHeight = Math.max(height, 3);
    const barWidth = Math.max(width, 4);
    const xAdj = x - (barWidth - width) / 2;
    const yAdj = y - (barHeight - height) / 2;
    const avgY =
      high > low
        ? yAdj + barHeight * ((high - average) / (high - low))
        : yAdj + barHeight / 2;
    const isOutlier = outlierKey ? Boolean(payload[outlierKey]) : false;
    return (
      <g>
        <rect
          x={xAdj}
          y={yAdj}
          width={barWidth}
          height={barHeight}
          rx={Math.min(4, width / 2)}
          fill={color}
          fillOpacity={0.55}
        />
        <line
          x1={xAdj}
          x2={xAdj + barWidth}
          y1={avgY}
          y2={avgY}
          stroke={color}
          strokeWidth={2}
        />
        {isOutlier && (
          <rect
            x={xAdj - 2}
            y={yAdj - 2}
            width={barWidth + 4}
            height={barHeight + 4}
            rx={Math.min(6, width / 2 + 2)}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        )}
      </g>
    );
  };
}
