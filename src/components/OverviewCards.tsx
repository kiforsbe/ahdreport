import type { HealthData } from "../shared/types";
import {
  boundsOf,
  change,
  decimalsByMetric,
  format,
  highlights,
  labels,
  latest,
  median,
} from "../report";
import { type GlucoseRange, formatMmol, glucoseSummary } from "../glucose";
import { LazyDisclosure } from "./LazyDisclosure";

export function OverviewCards({
  records,
  periodLabel,
  collapsible = false,
  glucose,
}: {
  records: HealthData["records"];
  periodLabel: string;
  collapsible?: boolean;
  glucose?: { range: GlucoseRange; from: string; to: string };
}) {
  const renderCards = () => (
    <div className={glucose ? "cards cards-6" : "cards"}>
      {highlights.map((metric) => {
        const item = latest(records, metric);
        const values = records
          .filter((record) => record.metric === metric)
          .map((record) => record.value);
        const value =
          metric === "weight" ? item?.value : median(records, metric);
        const delta = metric === "weight" ? change(records, metric) : undefined;
        const range = values.length
          ? metric === "heartRate"
            ? boundsOf(values)
            : { min: Math.min(...values), max: Math.max(...values) }
          : undefined;
        return (
          <article className="card" key={metric}>
            <span>{labels[metric]}</span>
            <strong>
              {value === undefined || !item ? "—" : format(value, item.unit)}
            </strong>
            <small>
              {value === undefined || !item
                ? "No records"
                : metric === "weight"
                  ? delta === undefined
                    ? `Latest: ${new Date(item.date).toLocaleDateString()}`
                    : `Δ ${delta >= 0 ? "+" : "−"}${format(Math.abs(delta), item.unit)}`
                  : metric === "heartRate"
                    ? `Median · Sustained min ${format(range!.min, "", decimalsByMetric[metric])} · max ${format(range!.max, "", decimalsByMetric[metric])}`
                    : `Median · Min ${format(range!.min, "", decimalsByMetric[metric])} · Max ${format(range!.max, "", decimalsByMetric[metric])}`}
            </small>
          </article>
        );
      })}
      {glucose && <GlucoseOverviewCard records={records} {...glucose} />}
    </div>
  );
  if (collapsible)
    return (
      <LazyDisclosure
        className="overview-card-section"
        summary={periodLabel}
        summaryClassName="cards-period"
      >
        {renderCards}
      </LazyDisclosure>
    );
  return (
    <section className="overview-card-section">
      <p className="cards-period">{periodLabel}</p>
      {renderCards()}
    </section>
  );
}

// Does not call report.latest(): tests/overviewCardsLazy.test.tsx counts those calls per highlight.
function GlucoseOverviewCard({
  records,
  range,
  from,
  to,
}: {
  records: HealthData["records"];
  range: GlucoseRange;
  from: string;
  to: string;
}) {
  const summary = glucoseSummary(records, range, from, to);
  const bounds = `${formatMmol(range.low)}–${formatMmol(range.high)}`;
  return (
    <article className="card">
      <span>Blood glucose</span>
      <strong>{summary ? `${formatMmol(summary.median)} mmol/L` : "—"}</strong>
      <small>
        {summary
          ? `Median · ${Math.round(summary.split.within * 100)}% of ${summary.dense ? "time" : "readings"} in ${bounds}`
          : "No records"}
      </small>
    </article>
  );
}
