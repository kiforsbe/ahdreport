import type { HealthData, Metric } from "../shared/types";
import { dataSpan, formatDate } from "../report";

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
  records: HealthData["records"],
  from: string,
  to: string,
) {
  const { earliest, latest } = dataSpan(records, metric);
  if (!earliest || !latest) return null;
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
