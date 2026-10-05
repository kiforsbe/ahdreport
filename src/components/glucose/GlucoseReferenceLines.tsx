import { type GlucoseRange, formatMmol, glucoseReferenceGuides } from "../../glucose";

export function GlucoseReferenceLines({ range, left, right, y, labels = true }: {
  range: GlucoseRange; left: number; right: number;
  y: (value: number) => number; labels?: boolean;
}) {
  return <g className="glucose-reference-guides">
    {glucoseReferenceGuides(range).map(guide => <g key={guide.value}>
      <line className="glucose-reference-line" data-value={guide.value} x1={left} x2={right}
        y1={y(guide.value)} y2={y(guide.value)} stroke={guide.color} strokeDasharray="5 4" strokeOpacity=".8">
        <title>{`${guide.label}: ${formatMmol(guide.value)} mmol/L`}</title>
      </line>
      {labels && <text x={right - 4} y={y(guide.value) - 4} textAnchor="end" fontSize="9" fill={guide.color}>
        {`${guide.value === 11.1 ? "2h test" : "Fasting"} ${formatMmol(guide.value)}`}
      </text>}
    </g>)}
  </g>;
}

export function GlucoseReferenceNote({ range }: { range: GlucoseRange }) {
  const guides = glucoseReferenceGuides(range);
  if (!guides.length) return null;
  return <div className="glucose-reference-note">
    <div className="glucose-reference-legend">
      {guides.map(g => <span key={g.value} style={{ color: g.color }}>{`${g.label} ${formatMmol(g.value)} mmol/L`}</span>)}
    </div>
    <small>
      Adult male/female reference band: 3.9–7.8 mmol/L; fasting reference below 5.6.
      Diagnostic-test lines refer to laboratory fasting (at least 8 hours) or a 2-hour 75 g glucose-tolerance test. Home readings and inferred meal pairs do not establish a diagnosis.
      {" "}<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/" target="_blank" rel="noreferrer">ADA reference</a>
    </small>
  </div>;
}
