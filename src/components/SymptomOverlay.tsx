import { memo } from "react";
import type { SymptomId, SymptomRecord } from "../shared/types";
import { symptomEpisodes, symptomLabel } from "../report";

function dayTimestamp(day: string) {
  return Date.parse(`${day}T00:00:00Z`);
}
function dayOf(value: string) {
  return value.slice(0, 10);
}
function rangeOf(symptoms: SymptomRecord[], from: string, to: string) {
  const dates = symptoms.flatMap((symptom) => [dayOf(symptom.start), dayOf(symptom.end)]).sort();
  const start = dayTimestamp(from || dates[0]);
  const end = dayTimestamp(to || dates.at(-1) || from);
  return { start, end: Math.max(end, start + 86_400_000) };
}
function position(value: string, start: number, end: number) {
  return Math.max(0, Math.min(100, ((dayTimestamp(dayOf(value)) - start) / (end - start)) * 100));
}

export const SymptomOverlay = memo(function SymptomOverlay({
  symptoms,
  from,
  to,
  selectedSymptom,
  visible,
}: {
  symptoms: SymptomRecord[];
  from: string;
  to: string;
  selectedSymptom?: SymptomId;
  visible: boolean;
}) {
  if (!visible || !selectedSymptom) return null;
  const rows = symptomEpisodes(symptoms).filter((row) => row.symptom === selectedSymptom);
  if (!rows.length) return null;
  const { start, end } = rangeOf(symptoms, from, to);
  return (
    <div className="symptom-overlay" aria-label={`${symptomLabel(selectedSymptom)} overlay`}>
      {rows.map((row) => {
        const left = position(row.start, start, end);
        const right = position(row.end, start, end);
        return (
          <span key={row.key}>
            <span
              className="symptom-overlay-band"
              style={{ left: `${left}%`, width: `${Math.max(1.2, right - left)}%` }}
              aria-hidden="true"
            />
            <span
              className="symptom-overlay-line"
              style={{ left: `${left}%` }}
              aria-label={`${symptomLabel(row.symptom)} onset ${dayOf(row.start)}`}
            />
          </span>
        );
      })}
    </div>
  );
});
