import type React from "react";
import { format, formatDate } from "../../report";
import {
  type GlucoseClass,
  type GlucoseDay,
  type GlucoseRange,
  type GlucoseSummary,
  formatMmol,
  glucoseColors,
  glucoseRangeText,
  localDay,
  timeOfDay,
} from "../../glucose";
import { GlucoseDailyChart } from "./GlucoseDailyChart";

const pct = (share: number) => `${Math.round(share * 100)}%`;
const statusLabels: [GlucoseClass, string][] = [["below", "Below"], ["within", "Within"], ["above", "Above"]];

function GlucoseRangeSplit({ split }: { split: Record<GlucoseClass, number> }) {
  return (
    <div className="glucose-range-split">
      <div className="glucose-range-split-bar" aria-hidden="true">
        {statusLabels
          .filter(([status]) => split[status] > 0)
          .map(([status]) => <i key={status} style={{ flex: split[status], background: glucoseColors[status] }} />)}
      </div>
      <div className="glucose-range-split-legend">
        {statusLabels.map(([status, label]) => (
          <span key={status} data-status={status} style={{ "--c": glucoseColors[status] } as React.CSSProperties}>
            {label} <b>{pct(split[status])}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function GlucoseSummaryCard({
  summary,
  days,
  range,
  from,
  to,
}: {
  summary: GlucoseSummary;
  days: GlucoseDay[];
  range: GlucoseRange;
  from: string;
  to: string;
}) {
  return (
    <article className="card glucose-summary-card">
      <div className="glucose-headline">
        <span>Latest reading</span>
        <strong>
          {formatMmol(summary.latest.value)}
          <em>mmol/L</em>
        </strong>
        <small>{`${formatDate(localDay(summary.latest.date))} at ${timeOfDay(summary.latest.date)}`}</small>
        <dl className="glucose-stats">
          <div><dt>Median</dt><dd>{formatMmol(summary.median)} mmol/L</dd></div>
          {summary.gmi ? (
            <>
              <div><dt>Time in range</dt><dd>{pct(summary.split.within)}</dd></div>
              <div>
                <dt>GMI (estimated A1c)</dt>
                <dd>{format(summary.gmi.percent, "", 1)}%<small>{Math.round(summary.gmi.mmolPerMol)} mmol/mol</small></dd>
              </div>
              <div><dt>Variability (CV)</dt><dd>{Math.round(summary.cv)}%</dd></div>
            </>
          ) : (
            <>
              <div><dt>Readings in range</dt><dd>{pct(summary.split.within)}</dd></div>
              <div><dt>Variability (SD)</dt><dd>{formatMmol(summary.sd)} mmol/L</dd></div>
            </>
          )}
        </dl>
      </div>
      <div>
        <div className="glucose-chart-title"><b>Daily range and median</b><span>Target {glucoseRangeText(range)}</span></div>
        <GlucoseDailyChart days={days} range={range} from={from} to={to} />
        <GlucoseRangeSplit split={summary.split} />
        <small>{summary.dense ? "Share of time, weighted by continuous readings." : "Share of recorded readings, not time in range."}</small>
      </div>
      <div className="glucose-card-footer">
        <span>{`${summary.count.toLocaleString()} readings · ${summary.daysWithReadings} of ${summary.windowDays} days`}</span>
        <span className={`glucose-density-chip ${summary.dense ? "dense" : "sparse"}`}>
          {summary.dense
            ? `Continuous data · ${pct(summary.coverage)} coverage`
            : "Spot readings · time-based metrics need ≥14 days and ≥70% coverage"}
        </span>
      </div>
    </article>
  );
}
