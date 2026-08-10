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

export function OverviewCards({
  records,
  periodLabel,
  collapsible = false,
}: {
  records: HealthData["records"];
  periodLabel: string;
  collapsible?: boolean;
}) {
  const cards = (
    <div className="cards">
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
    </div>
  );
  if (collapsible)
    return (
      <details className="overview-card-section">
        <summary className="cards-period">{periodLabel}</summary>
        {cards}
      </details>
    );
  return (
    <section className="overview-card-section">
      <p className="cards-period">{periodLabel}</p>
      {cards}
    </section>
  );
}
