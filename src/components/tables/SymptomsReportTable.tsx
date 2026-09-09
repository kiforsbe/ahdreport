import { memo } from "react";
import type { HealthRecord, SymptomRecord } from "../../shared/types";
import { MAX_PDF_TABLE_ROWS, MAX_TABLE_ROWS, daily, filteredSymptoms, format, formatDate, symptomEpisodes, symptomLabel } from "../../report";
import { TableNotes, truncationNote } from "../TableNotes";

function sameDayContext(records: HealthRecord[], date: string) {
  const values: [string, "heartRate" | "restingHeartRate" | "sleep", string, number][] = [
    ["HR", "heartRate" as const, "count/min", 0],
    ["RHR", "restingHeartRate" as const, "count/min", 0],
    ["Sleep", "sleep" as const, "hr", 1],
  ];
  return values
    .map(([label, metric, unit, decimals]) => {
      const row = daily(records, metric).find((item) => item.date === date);
      return row ? `${label} ${format(row.value, unit, decimals)}` : null;
    })
    .filter((value): value is string => !!value)
    .join(" · ");
}

export const SymptomsReportTable = memo(function SymptomsReportTable({
  symptoms,
  records,
  from,
  to,
  printLayout,
}: {
  symptoms: SymptomRecord[];
  records: HealthRecord[];
  from: string;
  to: string;
  printLayout: boolean;
}) {
  const allEpisodes = symptomEpisodes(filteredSymptoms(symptoms, from, to));
  const episodes = allEpisodes.slice(0, printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS);
  if (!episodes.length) return null;
  return (
    <section className="report-section symptoms-report-section">
      <h3>Symptoms and episodes</h3>
      <TableNotes notes={[truncationNote(episodes.length, allEpisodes.length)]} />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Symptom</th>
            <th>Duration</th>
            <th>Severity / status</th>
            <th>Source</th>
            <th>Same-day context</th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((episode) => {
            const date = episode.start.slice(0, 10);
            return (
              <tr key={episode.key}>
                <td>{formatDate(date)}</td>
                <td>{symptomLabel(episode.symptom)}</td>
                <td>{episode.durationHours.toFixed(1)} h</td>
                <td>{episode.value}</td>
                <td>{episode.source || "—"}</td>
                <td>{sameDayContext(records, date) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <TableNotes notes={["Descriptive comparison only; this does not establish causation or diagnosis."]} />
    </section>
  );
});
