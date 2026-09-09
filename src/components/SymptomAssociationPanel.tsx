import { memo } from "react";
import type { HealthRecord, SymptomRecord } from "../shared/types";
import { format, symptomAssociations } from "../report";

export const SymptomAssociationPanel = memo(function SymptomAssociationPanel({
  symptoms,
  records,
}: {
  symptoms: SymptomRecord[];
  records: HealthRecord[];
}) {
  const associations = symptomAssociations(symptoms, records);
  const available = associations.filter((association) => association.difference !== undefined);
  return (
    <article className="panel symptom-associations">
      <div className="symptom-panel-heading">
        <div>
          <h3>Observed associations</h3>
          <small>Symptom days compared with other days</small>
        </div>
        {available.length > 0 && <small>{available.length} measures</small>}
      </div>
      {available.length ? (
        available.slice(0, 4).map((association) => {
          const difference = association.difference!;
          return (
            <div className="symptom-association-row" key={association.metric}>
              <div className="symptom-association-title">
                <b>{association.label}</b>
                <span>
                  {difference >= 0 ? "+" : "−"}
                  {format(Math.abs(difference), association.unit, association.metric === "bodyTemperature" ? 1 : 0)}
                </span>
              </div>
              <div className="symptom-association-values">
                <span>Symptom days: {format(association.symptomMedian!, association.unit)}</span>
                <span>Other days: {format(association.otherMedian!, association.unit)}</span>
              </div>
              <small>
                n={association.symptomDays} vs {association.otherDays} days
              </small>
            </div>
          );
        })
      ) : (
        <p className="empty small">Not enough symptom days for a comparison.</p>
      )}
      <p className="symptom-analysis-note">
        Descriptive comparison only; this does not establish causation or diagnosis.
      </p>
    </article>
  );
});
