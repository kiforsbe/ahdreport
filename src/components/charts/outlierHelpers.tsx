import { format, formatDate } from "../../report";

export function outlierDot(outliers: Set<string>, color: string) {
  return (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !outliers.has(payload.date)) return <g />;
    return (
      <circle cx={cx} cy={cy} r={5} fill="white" stroke={color} strokeWidth={2.5} />
    );
  };
}
export function OutlierNote({
  label,
  outliers,
  rows,
  unit,
  decimals,
}: {
  label?: string;
  outliers: Set<string>;
  rows: { date: string; value: number }[];
  unit: string;
  decimals?: number;
}) {
  if (!outliers.size) return null;
  const flagged = rows.filter((row) => outliers.has(row.date)).slice(0, 5);
  return (
    <small className="table-notes">
      {label ? `${label} — u` : "U"}nusual:{" "}
      {flagged
        .map((row) => `${formatDate(row.date)} (${format(row.value, unit, decimals)})`)
        .join(", ")}
    </small>
  );
}
