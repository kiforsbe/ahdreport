import { format } from "../../report";
import { ASSOCIATION_MIN_PAIRS, type GlucoseAssociations, formatMmol } from "../../glucose";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatMmol(Math.abs(v))} mmol/L`;

function Row({ title, value, detail, fallback }: { title: string; value?: number; detail: string; fallback: string }) {
  return (
    <div className="glucose-assoc-row">
      <div className="glucose-assoc-title">
        <b>{title}</b>
        {value === undefined ? <span className="na">—</span> : <span>{signed(value)}</span>}
      </div>
      <small>{value === undefined ? fallback : detail}</small>
    </div>
  );
}

export function GlucoseAssociationPanel({ associations: a }: { associations: GlucoseAssociations }) {
  return (
    <article className="panel glucose-association-panel">
      <div className="glucose-panel-heading">
        <h3>Observed associations</h3>
        <small>Readings paired with nearby events in this period.</small>
      </div>
      <Row
        title="After logged carbohydrates"
        value={a.carbs.value}
        detail={`Median rise to the highest reading within 2 h · ${a.carbs.n} paired meals`}
        fallback={`Not enough paired meals for a comparison (${a.carbs.n} of ${ASSOCIATION_MIN_PAIRS})`}
      />
      <Row
        title="After logged activity"
        value={a.activity.value}
        detail={`Median change about 2 h after starting · ${a.activity.n} sessions`}
        fallback={`Not enough paired sessions for a comparison (${a.activity.n} of ${ASSOCIATION_MIN_PAIRS})`}
      />
      <Row
        title="After shorter nights"
        value={a.sleep.value}
        detail={`First morning reading after nights under ${format(a.sleep.splitHours ?? 0, "", 1)} h, compared with longer nights · ${a.sleep.shorter} and ${a.sleep.longer} nights`}
        fallback="Not enough mornings with a reading for a comparison"
      />
      <p className="glucose-note">
        Descriptive comparison only. It does not establish cause, and it is not guidance on medication or insulin doses.
      </p>
    </article>
  );
}
