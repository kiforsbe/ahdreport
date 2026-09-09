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
  const dates = symptoms.flatMap((symptom) => [dayOf(symptom.start), dayOf(symptom.end)]);
  const start = dayTimestamp(from || dates.sort()[0]);
  const end = dayTimestamp(to || dates.sort().at(-1) || from);
  return { start, end: Math.max(end, start + 86_400_000) };
}
function position(value: string, start: number, end: number) {
  return Math.max(0, Math.min(100, ((dayTimestamp(dayOf(value)) - start) / (end - start)) * 100));
}

export const SymptomTimeline = memo(function SymptomTimeline({
  symptoms,
  from,
  to,
  selectedSymptom,
  onSelectedSymptomChange,
}: {
  symptoms: SymptomRecord[];
  from: string;
  to: string;
  selectedSymptom?: SymptomId;
  onSelectedSymptomChange: (symptom: SymptomId) => void;
}) {
  const { start, end } = rangeOf(symptoms, from, to);
  const ids = [...new Set(symptoms.map((symptom) => symptom.symptom))].sort();
  const colors = ["orange", "blue", "purple", "green"];
  return (
    <div className="symptom-timeline" aria-label="Symptom timeline">
      <div className="symptom-timeline-axis">
        <span>{from || "Start"}</span>
        <span>{to || "Latest"}</span>
      </div>
      {ids.map((id, index) => {
        const rows = symptomEpisodes(symptoms).filter((symptom) => symptom.symptom === id);
        return (
          <div className="symptom-lane" key={id}>
            <div className="symptom-lane-name">
              <button
                type="button"
                aria-pressed={selectedSymptom === id}
                className={selectedSymptom === id ? "selected" : undefined}
                onClick={() => onSelectedSymptomChange(id)}
              >
                {symptomLabel(id)}
              </button>
            </div>
            <div className="symptom-lane-track">
              {rows.map((row) => {
                const left = position(row.start, start, end);
                const right = position(row.end, start, end);
                const width = Math.max(1.2, right - left);
                return (
                  <button
                    type="button"
                    key={row.key}
                    className={`symptom-event ${colors[index % colors.length]} ${selectedSymptom && selectedSymptom !== id ? "muted" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    aria-label={`${symptomLabel(row.symptom)}, ${row.durationHours.toFixed(1)} hours, ${dayOf(row.start)}`}
                    onClick={() => onSelectedSymptomChange(id)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="symptom-timeline-legend">
        <span>Bar length represents duration</span>
        <span>Selected symptom is highlighted on numeric charts</span>
      </div>
    </div>
  );
});
