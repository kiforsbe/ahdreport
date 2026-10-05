import { type GlucoseRange, type GlucoseReferenceMode, formatMmol, glucoseReferenceGuides } from "../../glucose";

export function GlucoseReferenceLines({ range, mode = "fasting", left, right, y, labels = true }: {
  range: GlucoseRange; mode?: GlucoseReferenceMode; left: number; right: number;
  y: (value: number) => number; labels?: boolean;
}) {
  return <g className="glucose-reference-guides">
    {glucoseReferenceGuides(range, mode).map(guide => <g key={guide.value}>
      <line className="glucose-reference-line" data-value={guide.value} x1={left} x2={right}
        y1={y(guide.value)} y2={y(guide.value)} stroke={guide.color} strokeDasharray="5 4" strokeOpacity=".8">
        <title>{`${guide.label}: ${formatMmol(guide.value)} mmol/L`}</title>
      </line>
      {labels && <text x={right - 4} y={y(guide.value) - 4} textAnchor="end" fontSize="9" fill={guide.color}>
        {`${mode === "fasting" ? "Fasting" : "2h OGTT"} ${formatMmol(guide.value)}`}
      </text>}
    </g>)}
  </g>;
}

export function GlucoseReferenceNote({ range, mode = "fasting" }: { range: GlucoseRange; mode?: GlucoseReferenceMode }) {
  const guides = glucoseReferenceGuides(range, mode);
  if (!guides.length) return null;
  return <div className="glucose-reference-note">
    <div className="glucose-reference-legend">
      {guides.map(g => <span key={g.value} style={{ color: g.color }}>{`${g.label} ${formatMmol(g.value)} mmol/L`}</span>)}
    </div>
    <small>
      Non-diabetic reference band: 3.9–7.8 mmol/L. Fasting reference: below 5.6 mmol/L.
      {mode === "twoHour" ? " Two-hour lines refer to a laboratory 75 g glucose-tolerance test, not an ordinary meal or every 1–3 hour reading." : " Fasting laboratory thresholds require at least 8 hours without caloric intake; the morning label alone does not confirm this."}
      {" "}<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/" target="_blank" rel="noreferrer">ADA reference</a>
    </small>
  </div>;
}
