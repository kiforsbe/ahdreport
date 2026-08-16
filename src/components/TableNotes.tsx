import type { Metric } from "../shared/types";
import { formatDate, type RangeMetadata } from "../report";

export function unitLabel(unit: string) {
  return unit ? ` (${unit})` : "";
}
export function truncationNote(shown: number, total: number) {
  return total > shown
    ? `Showing the most recent ${shown.toLocaleString()} of ${total.toLocaleString()} days with data.`
    : null;
}
export function coverageNote(
  metric: Metric,
  metadata: RangeMetadata,
  from: string,
  to: string,
) {
  const span = metadata.spanByMetric.get(metric);
  if (!span) return null;
  const { earliest, latest } = span;
  if (!(from && earliest > from) && !(to && latest < to)) return null;
  return `Data available ${formatDate(earliest)} – ${formatDate(latest)}, narrower than the selected period.`;
}
export function TableNotes({ notes }: { notes: (string | null)[] }) {
  const visible = notes.filter((n): n is string => !!n);
  if (!visible.length) return null;
  return (
    <div className="table-notes">
      {visible.map((note) => (
        <small key={note}>{note}</small>
      ))}
    </div>
  );
}
