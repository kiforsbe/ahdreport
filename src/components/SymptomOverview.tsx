import { memo } from "react";
import type { HealthRecord, SymptomId, SymptomRecord } from "../shared/types";
import { symptomLabel, symptomSummary } from "../report";
import { SymptomAssociationPanel } from "./SymptomAssociationPanel";
import { SymptomTimeline } from "./SymptomTimeline";

export const SymptomOverview = memo(function SymptomOverview({
  symptoms,
  records,
  from,
  to,
  selectedSymptom,
  onSelectedSymptomChange,
  showOverlay,
  onShowOverlayChange,
}: {
  symptoms: SymptomRecord[];
  records: HealthRecord[];
  from: string;
  to: string;
  selectedSymptom?: SymptomId;
  onSelectedSymptomChange: (symptom: SymptomId) => void;
  showOverlay: boolean;
  onShowOverlayChange: (visible: boolean) => void;
}) {
  const summary = symptomSummary(symptoms);
  return (
    <section className="symptom-group">
      <div className="symptom-section-heading">
        <div>
          <p className="eyebrow symptom-eyebrow">Context events</p>
          <h2>Symptoms</h2>
          <p className="symptom-section-copy">
            When symptoms occurred, how long they lasted, and what changed around those days.
          </p>
        </div>
        {symptoms.length > 0 && (
          <label className="symptom-overlay-toggle">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(event) => onShowOverlayChange(event.currentTarget.checked)}
            />
            Show on numeric charts
          </label>
        )}
      </div>
      {!symptoms.length ? (
        <div className="empty">No symptom records were found for this period.</div>
      ) : (
        <>
          <div className="symptom-summary-cards">
            <article className="card"><span>Symptom days</span><strong>{summary.symptomDays}</strong><small>of selected period</small></article>
            <article className="card"><span>Episodes</span><strong>{summary.episodeCount}</strong><small>across {summary.symptomCount} symptoms</small></article>
            <article className="card"><span>Median duration</span><strong>{summary.medianDurationHours?.toFixed(1) ?? "—"} h</strong><small>all episodes</small></article>
            <article className="card"><span>Most frequent</span><strong>{summary.bySymptom[0] ? symptomLabel(summary.bySymptom[0].symptom) : "—"}</strong><small>{summary.bySymptom[0]?.episodes ?? 0} episodes</small></article>
          </div>
          <div className="symptom-overview-grid">
            <article className="panel symptom-timeline-panel">
              <div className="symptom-panel-heading">
                <div><h3>Symptoms across the period</h3><small>Select a lane to highlight it elsewhere.</small></div>
              </div>
              <SymptomTimeline
                symptoms={symptoms}
                from={from}
                to={to}
                selectedSymptom={selectedSymptom}
                onSelectedSymptomChange={onSelectedSymptomChange}
              />
            </article>
            <SymptomAssociationPanel symptoms={symptoms} records={records} />
          </div>
        </>
      )}
    </section>
  );
});
