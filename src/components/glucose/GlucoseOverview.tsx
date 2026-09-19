import { memo, useMemo } from "react";
import type React from "react";
import type { HealthRecord } from "../../shared/types";
import {
  type GlucoseRange,
  type GlucoseSummary,
  formatMmol,
  glucoseAssociations,
  glucoseColors,
  glucoseDaily,
  glucoseHourlyProfile,
  glucoseSummary,
} from "../../glucose";
import { GlucoseAssociationPanel } from "./GlucoseAssociationPanel";
import { GlucoseDailyPattern } from "./GlucoseDailyPattern";
import { GlucoseRangeControl } from "./GlucoseRangeControl";
import { GlucoseSummaryCard } from "./GlucoseSummaryCard";
import { GlucoseTimeline } from "./GlucoseTimeline";

function MealContext({ context }: { context: GlucoseSummary["mealContext"] }) {
  const row = (label: string, stat: { count: number; median?: number }) => (
    <div>
      <b>{label}</b>
      <span>{stat.count} readings</span>
      <b>{stat.median === undefined ? "—" : `${formatMmol(stat.median)} mmol/L`}</b>
    </div>
  );
  return (
    <article className="panel">
      <div className="glucose-panel-heading">
        <h3>Meal context</h3>
        <small>From the meal-time tag the logging app stored with each reading.</small>
      </div>
      <div className="glucose-meal-context">
        {row("Before meal", context.beforeMeal)}
        {row("After meal", context.afterMeal)}
        {row("Not tagged", context.untagged)}
      </div>
      <p className="glucose-note">Medians per tag. Readings without a tag are not guessed from nearby meals.</p>
    </article>
  );
}

export const GlucoseOverview = memo(function GlucoseOverview({
  records,
  from,
  to,
  range,
  onRangeChange,
  hasGlucose,
}: {
  records: HealthRecord[];
  from: string;
  to: string;
  range: GlucoseRange;
  onRangeChange: (range: GlucoseRange) => void;
  hasGlucose: boolean;
}) {
  const summary = useMemo(() => glucoseSummary(records, range, from, to), [records, range, from, to]);
  const days = useMemo(() => glucoseDaily(records, range), [records, range]);
  const associations = useMemo(() => glucoseAssociations(records), [records]);
  const dense = summary?.dense ?? false;
  const profile = useMemo(() => (dense ? glucoseHourlyProfile(records) : undefined), [records, dense]);
  if (!hasGlucose) return null;
  const tagged = !!summary && summary.mealContext.beforeMeal.count + summary.mealContext.afterMeal.count > 0;
  return (
    <section className="glucose-group" aria-labelledby="glucose-heading">
      <div className="glucose-section-heading">
        <div>
          <p className="eyebrow">Metabolic</p>
          <h2 id="glucose-heading">Blood glucose</h2>
          <p className="glucose-section-copy">
            Readings against a target range, with meals, insulin, activity and sleep for context.
          </p>
        </div>
        <GlucoseRangeControl range={range} onChange={onRangeChange} />
      </div>
      {!summary ? (
        <div className="empty">No blood glucose readings were found for this period.</div>
      ) : (
        <>
          <GlucoseSummaryCard summary={summary} days={days} range={range} from={from} to={to} />
          <div className="glucose-overview-grid">
            <article className="panel">
              <div className="glucose-panel-heading">
                <h3>Glucose and context</h3>
                <small className="glucose-timeline-hint">
                  {summary.dense ? "Continuous readings shown as hourly medians. " : ""}
                  Hover to see what was logged around a reading.
                </small>
              </div>
              <GlucoseTimeline records={records} range={range} from={from} to={to} continuous={summary.dense} />
              <div className="glucose-legend glucose-dot-legend">
                <span style={{ "--c": glucoseColors.below } as React.CSSProperties}>Below target</span>
                <span style={{ "--c": glucoseColors.line } as React.CSSProperties}>Within target</span>
                <span style={{ "--c": glucoseColors.above } as React.CSSProperties}>Above target</span>
                <span style={{ "--c": glucoseColors.insulin } as React.CSSProperties}>Insulin: solid bolus, outlined basal</span>
              </div>
            </article>
            <GlucoseAssociationPanel associations={associations} />
          </div>
          {(profile || tagged) && (
            <div className={`glucose-secondary-grid${profile && tagged ? "" : " single"}`}>
              {profile && (
                <article className="panel">
                  <div className="glucose-panel-heading">
                    <h3>Typical day</h3>
                    <small>{`All ${summary.daysWithReadings} days overlaid by hour: median line, middle 50% and 5–95% bands.`}</small>
                  </div>
                  <GlucoseDailyPattern profile={profile} range={range} />
                </article>
              )}
              {tagged && <MealContext context={summary.mealContext} />}
            </div>
          )}
        </>
      )}
    </section>
  );
});
