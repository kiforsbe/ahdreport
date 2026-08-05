import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthData, Metric } from "./shared/types";
import {
  colorsByMetric,
  daily,
  dailyStats,
  dailyTotals,
  dataSpan,
  decimalsByMetric,
  filtered,
  format,
  labels,
  latest,
  metricGroups,
  change,
  median,
} from "./report";

const highlights: Metric[] = ["weight", "heartRate", "steps", "sleep"];
const bpMetrics: Metric[] = ["bloodPressureSystolic", "bloodPressureDiastolic"];
const walkingMetrics: Metric[] = [
  "walkingSpeed",
  "stepLength",
  "walkingAsymmetry",
  "doubleSupport",
];
const activityMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  "sleep",
];
const MAX_TABLE_ROWS = 365;
const PrintLayoutContext = createContext(false);
type PatientProfile = {
  name: string;
  personnummer: string;
  dateOfBirth: string;
  sex: string;
};
const emptyPatientProfile: PatientProfile = {
  name: "",
  personnummer: "",
  dateOfBirth: "",
  sex: "",
};
function rangeDate(days: number, end: string) {
  const d = end ? new Date(`${end}T12:00:00`) : new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
function formatDate(isoDay: string) {
  return new Date(`${isoDay}T00:00:00`).toLocaleDateString();
}
function formatPatientDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
function PatientDetailsForm({
  initial,
  onFieldChange,
}: {
  initial: PatientProfile;
  onFieldChange: (field: keyof PatientProfile, value: string) => void;
}) {
  const [fields, setFields] = useState(initial);
  const update = (field: keyof PatientProfile, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    onFieldChange(field, value);
  };
  return (
    <>
      <div className="patient-fields">
      <label>
        <span>Name</span>
        <input
          type="text"
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </label>
      <label>
        <span>Personnummer</span>
        <input
          type="text"
          value={fields.personnummer}
          onChange={(e) => update("personnummer", e.target.value)}
        />
      </label>
      <label>
        <span>Date of birth</span>
        <input
          type="date"
          value={fields.dateOfBirth}
          onChange={(e) => update("dateOfBirth", e.target.value)}
        />
      </label>
      <label>
        <span>Sex</span>
        <input
          type="text"
          value={fields.sex}
          onChange={(e) => update("sex", e.target.value)}
        />
      </label>
      </div>
      <dl className="patient-export-details">
      {[
        ["Name", fields.name],
        ["Personnummer", fields.personnummer],
        ["Date of birth", fields.dateOfBirth],
        ["Sex", fields.sex],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
      </dl>
    </>
  );
}
function DebouncedDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, onChange, value]);
  return (
    <label>
      {label}
      <input
        type="date"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
}
function unitLabel(unit: string) {
  return unit ? ` (${unit})` : "";
}
function truncationNote(shown: number, total: number) {
  return total > shown
    ? `Showing the most recent ${shown.toLocaleString()} of ${total.toLocaleString()} days with data.`
    : null;
}
function coverageNote(
  metric: Metric,
  records: HealthData["records"],
  from: string,
  to: string,
) {
  const { earliest, latest } = dataSpan(records, metric);
  if (!earliest || !latest) return null;
  if (!(from && earliest > from) && !(to && latest < to)) return null;
  return `Data available ${formatDate(earliest)} – ${formatDate(latest)}, narrower than the selected period.`;
}
function TableNotes({ notes }: { notes: (string | null)[] }) {
  const visible = notes.filter((n): n is string => !!n);
  if (!visible.length) return null;
  return (
    <div className="table-notes">
      {visible.map((note) => (
        <small key={note}>{note}</small>
      ))}
    </div>
  );
}
function quantile(sorted: number[], p: number) {
  const i = p * (sorted.length - 1);
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
// Scales the shared axis to Tukey's fences (1.5x IQR) so a rare bad reading can't flatten every other day's bar; never widens beyond the true observed range.
function boundsOf(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return { min: 0, max: 1 };
  const actualMin = sorted[0],
    actualMax = sorted.at(-1)!;
  const q1 = quantile(sorted, 0.25),
    q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1 || 1;
  return {
    min: Math.max(actualMin, q1 - iqr * 1.5),
    max: Math.min(actualMax, q3 + iqr * 1.5),
  };
}
function columnBounds(
  days: (ReturnType<typeof dailyStats>[number] | undefined)[],
) {
  return boundsOf(
    days
      .filter((day): day is ReturnType<typeof dailyStats>[number] => !!day)
      .flatMap((day) => day.values),
  );
}
function totalBounds(totals: (number | undefined)[]) {
  return boundsOf(totals.filter((v): v is number => v !== undefined));
}
function OverviewCards({
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
function MetricChart({
  metric,
  records,
}: {
  metric: Metric;
  records: HealthData["records"];
}) {
  const printLayout = useContext(PrintLayoutContext);
  const rows = daily(records, metric);
  if (!rows.length)
    return (
      <div className="empty small">
        No {labels[metric].toLowerCase()} records in this period.
      </div>
    );
  const chart = (width?: number, height?: number) => (
    <AreaChart data={rows} width={width} height={height}>
        <defs>
          <linearGradient id={`fill-${metric}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4263eb" stopOpacity=".32" />
            <stop offset="100%" stopColor="#4263eb" stopOpacity=".02" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e7eaf0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
        <YAxis tick={{ fontSize: 11 }} width={45} />
        <Tooltip formatter={(value) => format(Number(value), rows[0].unit)} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#4263eb"
          strokeWidth={2.5}
          fill={`url(#fill-${metric})`}
          isAnimationActive={!printLayout}
        />
    </AreaChart>
  );
  if (printLayout)
    return <div data-pdf-chart-ready="true">{chart(680, 260)}</div>;
  return (
    <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
      {chart()}
    </ResponsiveContainer>
  );
}
function bpRangeBarShape(
  color: string,
  lowKey: string,
  highKey: string,
  avgKey: string,
) {
  return (props: any) => {
    const { x, y, width, height, payload } = props;
    const low = payload[lowKey],
      high = payload[highKey],
      average = payload[avgKey];
    if (low === undefined) return <g />;
    const barHeight = Math.max(height, 3);
    const barWidth = Math.max(width, 4);
    const xAdj = x - (barWidth - width) / 2;
    const yAdj = y - (barHeight - height) / 2;
    const avgY =
      high > low
        ? yAdj + barHeight * ((high - average) / (high - low))
        : yAdj + barHeight / 2;
    return (
      <g>
        <rect
          x={xAdj}
          y={yAdj}
          width={barWidth}
          height={barHeight}
          rx={Math.min(4, width / 2)}
          fill={color}
          fillOpacity={0.55}
        />
        <line
          x1={xAdj}
          x2={xAdj + barWidth}
          y1={avgY}
          y2={avgY}
          stroke={color}
          strokeWidth={2}
        />
      </g>
    );
  };
}
function BpTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const range = (low?: number, high?: number, average?: number) =>
    low === undefined || average === undefined
      ? "—"
      : low === high
        ? format(average, "mmHg")
        : `${format(low, "mmHg")}–${format(high!, "mmHg")} (avg ${format(average, "mmHg")})`;
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e4e8ef",
        borderRadius: 8,
        padding: "8px 11px",
        fontSize: 12,
      }}
    >
      <b>{new Date(`${label}T00:00:00`).toLocaleDateString()}</b>
      <div style={{ color: "#e8590c", marginTop: 4 }}>
        Systolic: {range(row.sLow, row.sHigh, row.sAvg)}
      </div>
      <div style={{ color: "#4263eb" }}>
        Diastolic: {range(row.dLow, row.dHigh, row.dAvg)}
      </div>
    </div>
  );
}
function BloodPressureChart({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const sNote = coverageNote("bloodPressureSystolic", records, from, to);
  const dNote = coverageNote("bloodPressureDiastolic", records, from, to);
  const byDate = new Map<
    string,
    {
      date: string;
      sLow?: number;
      sHigh?: number;
      sAvg?: number;
      sBase?: number;
      sRange?: number;
      dLow?: number;
      dHigh?: number;
      dAvg?: number;
      dBase?: number;
      dRange?: number;
    }
  >();
  dailyStats(records, "bloodPressureSystolic").forEach((day) =>
    byDate.set(day.date, {
      ...(byDate.get(day.date) ?? { date: day.date }),
      sLow: day.min,
      sHigh: day.max,
      sAvg: day.average,
      sBase: day.min,
      sRange: day.max - day.min,
    }),
  );
  dailyStats(records, "bloodPressureDiastolic").forEach((day) =>
    byDate.set(day.date, {
      ...(byDate.get(day.date) ?? { date: day.date }),
      dLow: day.min,
      dHigh: day.max,
      dAvg: day.average,
      dBase: day.min,
      dRange: day.max - day.min,
    }),
  );
  const rows = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const avg = (key: "sAvg" | "dAvg") => {
    const values = rows
      .map((r) => r[key])
      .filter((v): v is number => v !== undefined);
    return values.reduce((a, v) => a + v, 0) / values.length;
  };
  const chart = (width?: number, height?: number) => (
    <ComposedChart
      data={rows}
      barGap={2}
      barCategoryGap="28%"
      width={width}
      height={height}
    >
      <CartesianGrid vertical={false} stroke="#e7eaf0" />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
      <YAxis tick={{ fontSize: 11 }} width={45} />
      <Tooltip content={<BpTooltip />} />
      <Bar
        dataKey="sBase"
        stackId="s"
        fill="transparent"
        isAnimationActive={false}
      />
      <Bar
        dataKey="sRange"
        stackId="s"
        shape={bpRangeBarShape("#e8590c", "sLow", "sHigh", "sAvg")}
        isAnimationActive={false}
      />
      <Bar
        dataKey="dBase"
        stackId="d"
        fill="transparent"
        isAnimationActive={false}
      />
      <Bar
        dataKey="dRange"
        stackId="d"
        shape={bpRangeBarShape("#4263eb", "dLow", "dHigh", "dAvg")}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
  return (
    <article className="panel">
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h3>Blood pressure</h3>
        <small>
          <b>{format(avg("sAvg"), "mmHg")}</b> systolic avg. ·{" "}
          <b>{format(avg("dAvg"), "mmHg")}</b> diastolic avg.
        </small>
      </div>
      {!printLayout && (sNote || dNote) && (
        <div className="table-notes">
          {sNote && <small>Systolic — {sNote}</small>}
          {dNote && <small>Diastolic — {dNote}</small>}
        </div>
      )}
      {printLayout ? (
        <div data-pdf-chart-ready="true">{chart(680, 260)}</div>
      ) : (
        <ResponsiveContainer
          key="blood-pressure-screen"
          width="100%"
          height={210}
        >
          {chart()}
        </ResponsiveContainer>
      )}
      {!printLayout && (
        <div className="bp-legend">
          <small style={{ color: "#e8590c" }}>
            ▮ Systolic (range, avg tick)
          </small>
          <small style={{ color: "#4263eb", marginLeft: 14 }}>
            ▮ Diastolic (range, avg tick)
          </small>
        </div>
      )}
    </article>
  );
}
function DayTrace({ values }: { values: number[] }) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const points = values
    .map(
      (value, index) =>
        `${values.length === 1 ? 50 : (index / (values.length - 1)) * 100},${24 - ((value - low) / range) * 20}`,
    )
    .join(" ");
  return (
    <svg
      width="100"
      height="26"
      viewBox="0 0 100 26"
      aria-label="Measurements across the day"
    >
      <line x1="0" y1="24" x2="100" y2="24" stroke="#d9dfeb" />
      <polyline
        points={points}
        fill="none"
        stroke="#4263eb"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
const DEFAULT_COLLAPSE_THRESHOLD_PX = 15;
const DEFAULT_GRID_TICK_COUNT = 5;
const DEFAULT_GRID_MINOR_DIVISIONS = 5;
const DEFAULT_GRID_COLOR = "#dbe5fb";
const DEFAULT_SHADE_COLOR = "#4263eb";
// Rounds a raw step (range / targetCount) up to a "nice" 1/2/5 x 10^n value, the way chart axes pick tick spacing.
function niceStep(range: number, targetCount: number) {
  if (range <= 0) return 1;
  const roughStep = range / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceResidual =
    residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return niceResidual * magnitude;
}
function ticksAtStep(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step)
    ticks.push(v);
  return ticks;
}
function niceTicks(min: number, max: number, targetCount: number): number[] {
  if (!(max > min)) return [];
  return ticksAtStep(min, max, niceStep(max - min, targetCount));
}
function DailyDistribution({
  min,
  max,
  average,
  standardDeviation,
  unit,
  single,
  decimals,
  columnMin,
  columnMax,
  collapseThresholdPx = DEFAULT_COLLAPSE_THRESHOLD_PX,
  gridTickCount = DEFAULT_GRID_TICK_COUNT,
  gridColor = DEFAULT_GRID_COLOR,
  gridMinorDivisions = DEFAULT_GRID_MINOR_DIVISIONS,
  color = DEFAULT_SHADE_COLOR,
}: {
  min: number;
  max: number;
  average: number;
  standardDeviation: number;
  unit: string;
  single: boolean;
  decimals?: number;
  columnMin: number;
  columnMax: number;
  collapseThresholdPx?: number;
  gridTickCount?: number;
  gridColor?: string;
  gridMinorDivisions?: number;
  color?: string;
}) {
  const span = columnMax - columnMin || 1;
  const scaleMin = columnMin - span * 0.15;
  const scaleMax = columnMax + span * 0.15;
  const x = (value: number) =>
    8 + ((value - scaleMin) / (scaleMax - scaleMin)) * 144;
  const inRange = (gx: number) => gx > 9 && gx < 151;
  const step = niceStep(scaleMax - scaleMin, gridTickCount);
  const majorTicks = ticksAtStep(scaleMin, scaleMax, step);
  const minorTicks = ticksAtStep(
    scaleMin,
    scaleMax,
    step / gridMinorDivisions,
  ).filter((v) => !majorTicks.some((m) => Math.abs(m - v) < step * 1e-6));
  const grid = (
    <>
      {minorTicks
        .map(x)
        .filter(inRange)
        .map((gx) => (
          <line
            key={`minor-${gx}`}
            x1={gx}
            x2={gx}
            y1="8"
            y2="20"
            stroke={gridColor}
            strokeWidth="1"
            opacity=".6"
          />
        ))}
      {majorTicks
        .map(x)
        .filter(inRange)
        .map((gx) => (
          <line
            key={`major-${gx}`}
            x1={gx}
            x2={gx}
            y1="1"
            y2="27"
            stroke={gridColor}
            strokeWidth="1"
          />
        ))}
    </>
  );
  const avgLabel = (
    <text
      x={x(average)}
      y="6"
      fontSize="8"
      fontWeight="700"
      textAnchor="middle"
      fill="#17213a"
    >
      {format(average, "", decimals)}
    </text>
  );
  if (single)
    return (
      <svg
        width="195"
        height="28"
        viewBox="0 0 195 28"
        aria-label={`Single measurement ${format(average, unit, decimals)}`}
      >
        {grid}
        {avgLabel}
        <circle cx={x(average)} cy="12" r="4" fill={color} />
      </svg>
    );
  const deviationStart = x(Math.max(min, average - standardDeviation));
  const deviationEnd = x(Math.min(max, average + standardDeviation));
  const sigmaLabel = (
    <text x={x(average)} y="24" fontSize="7" textAnchor="middle" fill="#94a3b8">
      σ {format(standardDeviation, "", decimals)}
    </text>
  );
  if (x(max) - x(min) < collapseThresholdPx)
    return (
      <svg
        width="195"
        height="28"
        viewBox="0 0 195 28"
        aria-label={`Average ${format(average, unit, decimals)}, values tightly clustered, standard deviation ${format(standardDeviation, unit, decimals)}`}
      >
        {grid}
        {avgLabel}
        <circle cx={x(average)} cy="12" r="4" fill={color} />
        {sigmaLabel}
      </svg>
    );
  return (
    <svg
      width="195"
      height="28"
      viewBox="0 0 195 28"
      aria-label={`Low ${format(min, unit, decimals)}, average ${format(average, unit, decimals)}, high ${format(max, unit, decimals)}, standard deviation ${format(standardDeviation, unit, decimals)}`}
    >
      {grid}
      <line
        x1={x(min)}
        x2={x(max)}
        y1="12"
        y2="12"
        stroke={color}
        strokeOpacity=".55"
        strokeWidth="2"
      />
      <rect
        x={deviationStart}
        y="7"
        width={Math.max(2, deviationEnd - deviationStart)}
        height="10"
        rx="5"
        fill={color}
        fillOpacity=".3"
      />
      <line
        x1={x(min)}
        x2={x(min)}
        y1="7"
        y2="17"
        stroke={color}
        strokeOpacity=".55"
      />
      <line
        x1={x(max)}
        x2={x(max)}
        y1="7"
        y2="17"
        stroke={color}
        strokeOpacity=".55"
      />
      <circle cx={x(average)} cy="12" r="4" fill={color} />
      {avgLabel}
      {sigmaLabel}
      <text x={x(min)} y="27" fontSize="8" textAnchor="start" fill="#667085">
        {format(min, "", decimals)}
      </text>
      <text x={x(max)} y="27" fontSize="8" textAnchor="end" fill="#667085">
        {format(max, "", decimals)}
      </text>
    </svg>
  );
}
function DailyTotalBar({
  value,
  columnMax,
  unit,
  decimals,
  gridTickCount = DEFAULT_GRID_TICK_COUNT,
  gridColor = DEFAULT_GRID_COLOR,
  gridMinorDivisions = DEFAULT_GRID_MINOR_DIVISIONS,
  color = DEFAULT_SHADE_COLOR,
}: {
  value: number;
  columnMax: number;
  unit: string;
  decimals?: number;
  gridTickCount?: number;
  gridColor?: string;
  gridMinorDivisions?: number;
  color?: string;
}) {
  const clipId = useId();
  const max = columnMax || 1;
  const x = (v: number) => 8 + (Math.max(0, Math.min(v, max)) / max) * 144;
  const labelX = 146;
  const labelFill = x(value) >= labelX - 4 ? "#ffffff" : "#17213a";
  const inRange = (gx: number) => gx > 9 && gx < 151;
  const step = niceStep(max, gridTickCount);
  const majorTicks = ticksAtStep(0, max, step);
  const minorTicks = ticksAtStep(0, max, step / gridMinorDivisions).filter(
    (v) => !majorTicks.some((m) => Math.abs(m - v) < step * 1e-6),
  );
  const grid = (
    <>
      {minorTicks
        .map(x)
        .filter(inRange)
        .map((gx) => (
          <line
            key={`minor-${gx}`}
            x1={gx}
            x2={gx}
            y1="8"
            y2="20"
            stroke={gridColor}
            strokeWidth="1"
            opacity=".6"
          />
        ))}
      {majorTicks
        .map(x)
        .filter(inRange)
        .map((gx) => (
          <line
            key={`major-${gx}`}
            x1={gx}
            x2={gx}
            y1="1"
            y2="27"
            stroke={gridColor}
            strokeWidth="1"
          />
        ))}
    </>
  );
  return (
    <svg
      width="195"
      height="28"
      viewBox="0 0 195 28"
      aria-label={`${format(value, unit, decimals)} of up to ${format(max, unit, decimals)} for this column`}
    >
      {grid}
      <defs>
        <clipPath id={clipId}>
          <rect x="8" y="8" width="144" height="12" rx="6" />
        </clipPath>
      </defs>
      <rect
        x="8"
        y="8"
        width="144"
        height="12"
        rx="6"
        fill={color}
        fillOpacity=".18"
      />
      <rect
        x="8"
        y="8"
        width={x(value) - 8}
        height="12"
        fill={color}
        clipPath={`url(#${clipId})`}
      />
      <text x={labelX} y="17" fontSize="9" textAnchor="end" fill={labelFill}>
        {format(value, "", decimals)}
      </text>
    </svg>
  );
}
function ReportTable({
  metric,
  records,
  from,
  to,
}: {
  metric: Metric;
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const allDays = dailyStats(records, metric);
  const days = allDays.slice(0, MAX_TABLE_ROWS);
  if (!days.length) return null;
  const bounds = columnBounds(days);
  const unit = days[0].unit;
  return (
    <section className="report-section">
      <h3>{labels[metric]}</h3>
      <TableNotes
        notes={[
          truncationNote(days.length, allDays.length),
          coverageNote(metric, records, from, to),
        ]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Daily distribution{unitLabel(unit)}</th>
            <th>1-day trace</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{new Date(`${day.date}T00:00:00`).toLocaleDateString()}</td>
              <td>
                <DailyDistribution
                  min={day.min}
                  max={day.max}
                  average={day.average}
                  standardDeviation={day.standardDeviation}
                  unit={day.unit}
                  single={day.values.length === 1}
                  decimals={decimalsByMetric[metric]}
                  columnMin={bounds.min}
                  columnMax={bounds.max}
                  color={colorsByMetric[metric]}
                />
              </td>
              <td>
                {day.values.length > 1 ? (
                  <DayTrace values={day.values} />
                ) : (
                  <small>Single reading</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function VitalsReportTable({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const systolic = new Map(
    dailyStats(records, "bloodPressureSystolic").map((day) => [day.date, day]),
  );
  const diastolic = new Map(
    dailyStats(records, "bloodPressureDiastolic").map((day) => [day.date, day]),
  );
  const heartRate = new Map(
    dailyStats(records, "heartRate").map((day) => [day.date, day]),
  );
  const weight = new Map(
    dailyStats(records, "weight").map((day) => [day.date, day]),
  );
  const allDates = [
    ...new Set([
      ...systolic.keys(),
      ...diastolic.keys(),
      ...heartRate.keys(),
      ...weight.keys(),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(0, MAX_TABLE_ROWS);
  if (!dates.length) return null;
  const diastolicBounds = columnBounds(
    dates.map((date) => diastolic.get(date)),
  );
  const systolicBounds = columnBounds(dates.map((date) => systolic.get(date)));
  const heartRateBounds = columnBounds(
    dates.map((date) => heartRate.get(date)),
  );
  const weightBounds = columnBounds(dates.map((date) => weight.get(date)));
  const unitOf = (map: Map<string, ReturnType<typeof dailyStats>[number]>) =>
    map.values().next().value?.unit ?? "";
  const cell = (
    day: ReturnType<typeof dailyStats>[number] | undefined,
    metric: Metric,
    bounds: { min: number; max: number },
  ) =>
    day ? (
      <DailyDistribution
        min={day.min}
        max={day.max}
        average={day.average}
        standardDeviation={day.standardDeviation}
        unit={day.unit}
        single={day.values.length === 1}
        decimals={decimalsByMetric[metric]}
        columnMin={bounds.min}
        columnMax={bounds.max}
        color={colorsByMetric[metric]}
      />
    ) : (
      <small>—</small>
    );
  const columnNotes = (
    [
      "bloodPressureDiastolic",
      "bloodPressureSystolic",
      "heartRate",
      "weight",
    ] as Metric[]
  ).map((metric) => {
    const note = coverageNote(metric, records, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Vitals</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Diastolic{unitLabel(unitOf(diastolic))}</th>
            <th>Systolic{unitLabel(unitOf(systolic))}</th>
            <th>Heart rate{unitLabel(unitOf(heartRate))}</th>
            <th>Weight{unitLabel(unitOf(weight))}</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date}>
              <td>{new Date(`${date}T00:00:00`).toLocaleDateString()}</td>
              <td>
                {cell(
                  diastolic.get(date),
                  "bloodPressureDiastolic",
                  diastolicBounds,
                )}
              </td>
              <td>
                {cell(
                  systolic.get(date),
                  "bloodPressureSystolic",
                  systolicBounds,
                )}
              </td>
              <td>{cell(heartRate.get(date), "heartRate", heartRateBounds)}</td>
              <td>{cell(weight.get(date), "weight", weightBounds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function WalkingReportTable({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const byMetric = new Map(
    walkingMetrics.map((metric) => [
      metric,
      new Map(dailyStats(records, metric).map((day) => [day.date, day])),
    ]),
  );
  const allDates = [
    ...new Set(
      walkingMetrics.flatMap((metric) => [...byMetric.get(metric)!.keys()]),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(0, MAX_TABLE_ROWS);
  if (!dates.length) return null;
  const boundsByMetric = new Map(
    walkingMetrics.map((metric) => [
      metric,
      columnBounds(dates.map((date) => byMetric.get(metric)!.get(date))),
    ]),
  );
  const unitFor = (metric: Metric) =>
    byMetric.get(metric)!.values().next().value?.unit ?? "";
  const columnNotes = walkingMetrics.map((metric) => {
    const note = coverageNote(metric, records, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Walking data</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {walkingMetrics.map((metric) => (
              <th key={metric}>
                {labels[metric]}
                {unitLabel(unitFor(metric))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date}>
              <td>{new Date(`${date}T00:00:00`).toLocaleDateString()}</td>
              {walkingMetrics.map((metric) => {
                const day = byMetric.get(metric)!.get(date);
                const bounds = boundsByMetric.get(metric)!;
                return (
                  <td key={metric}>
                    {day ? (
                      <DailyDistribution
                        min={day.min}
                        max={day.max}
                        average={day.average}
                        standardDeviation={day.standardDeviation}
                        unit={day.unit}
                        single={day.values.length === 1}
                        decimals={decimalsByMetric[metric]}
                        columnMin={bounds.min}
                        columnMax={bounds.max}
                        color={colorsByMetric[metric]}
                      />
                    ) : (
                      <small>—</small>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function ActivityReportTable({
  records,
  from,
  to,
}: {
  records: HealthData["records"];
  from: string;
  to: string;
}) {
  const totalsByMetric = new Map(
    activityMetrics.map((metric) => [
      metric,
      new Map(dailyTotals(records, metric).map((day) => [day.date, day])),
    ]),
  );
  const allDates = [
    ...new Set(
      activityMetrics.flatMap((metric) => [
        ...totalsByMetric.get(metric)!.keys(),
      ]),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const dates = allDates.slice(0, MAX_TABLE_ROWS);
  if (!dates.length) return null;
  const boundsByMetric = new Map(
    activityMetrics.map((metric) => [
      metric,
      totalBounds(
        dates.map((date) => totalsByMetric.get(metric)!.get(date)?.total),
      ),
    ]),
  );
  const unitFor = (metric: Metric) =>
    totalsByMetric.get(metric)!.values().next().value?.unit ?? "";
  const columnNotes = activityMetrics.map((metric) => {
    const note = coverageNote(metric, records, from, to);
    return note ? `${labels[metric]} — ${note}` : null;
  });
  return (
    <section className="report-section">
      <h3>Daily activity</h3>
      <TableNotes
        notes={[truncationNote(dates.length, allDates.length), ...columnNotes]}
      />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {activityMetrics.map((metric) => (
              <th key={metric}>
                {labels[metric]}
                {unitLabel(unitFor(metric))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => (
            <tr key={date}>
              <td>{new Date(`${date}T00:00:00`).toLocaleDateString()}</td>
              {activityMetrics.map((metric) => {
                const day = totalsByMetric.get(metric)!.get(date);
                const bounds = boundsByMetric.get(metric)!;
                return (
                  <td key={metric}>
                    {day ? (
                      <DailyTotalBar
                        value={day.total}
                        columnMax={bounds.max}
                        unit={day.unit}
                        decimals={decimalsByMetric[metric]}
                        color={colorsByMetric[metric]}
                      />
                    ) : (
                      <small>—</small>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
export function App() {
  const [data, setData] = useState<HealthData | null>(null);
  const [printLayout, setPrintLayout] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const patientProfile = useRef<PatientProfile>(emptyPatientProfile);
  const [notice, setNotice] = useState("");
  const records = useMemo(
    () => (data ? filtered(data.records, from, to) : []),
    [data, from, to],
  );
  const overviewRecords = useMemo(
    () => (data ? filtered(data.records, rangeDate(30, to), to) : []),
    [data, to],
  );
  const yearOverviewRecords = useMemo(
    () => (data ? filtered(data.records, rangeDate(365, to), to) : []),
    [data, to],
  );
  const allTimeOverviewRecords = useMemo(
    () => (data ? filtered(data.records, "", to) : []),
    [data, to],
  );
  useEffect(() => {
    const printWindow = window as Window & {
      healthAtlasPrintLayout?: (active: boolean) => Promise<void>;
    };
    printWindow.healthAtlasPrintLayout = async (active) => {
      flushSync(() => setPrintLayout(active));
      await document.fonts?.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const main = document.querySelector("main");
      if (Boolean(main?.classList.contains("print-layout")) !== active)
        throw new Error("The requested PDF layout was not committed.");
      if (active && main) {
        const responsiveCharts = main.querySelectorAll(
          ".recharts-responsive-container",
        );
        const printCharts = [
          ...main.querySelectorAll<HTMLElement>(
            '[data-pdf-chart-ready="true"]',
          ),
        ];
        const incompleteCharts = printCharts.filter(
          (chart) => !chart.querySelector(".recharts-surface"),
        );
        if (
          responsiveCharts.length ||
          !printCharts.length ||
          incompleteCharts.length
        )
          throw new Error("The PDF charts have not finished updating.");
        printCharts.forEach((chart) => chart.getBoundingClientRect());
      }
    };
    return () => {
      delete printWindow.healthAtlasPrintLayout;
    };
  }, []);
  async function importData() {
    try {
      if (!window.healthAPI)
        throw new Error(
          "The secure desktop bridge did not load. Please restart the application.",
        );
      const result = await window.healthAPI.importExport();
      if (result) {
        setData(result);
        setFrom(result.diagnostics.earliest?.slice(0, 10) ?? "");
        setTo(result.diagnostics.latest?.slice(0, 10) ?? "");
        patientProfile.current = {
          name: result.patient?.name || "",
          personnummer: result.patient?.identifier || "",
          dateOfBirth: formatPatientDate(result.patient?.dateOfBirth) || "",
          sex: result.patient?.sex || "",
        };
        setNotice("");
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not read that export.",
      );
    }
  }
  async function pdf() {
    const patient = patientProfile.current;
    const result = await window.healthAPI.exportPdf(
      patient.name,
      patient.personnummer,
      patient.dateOfBirth,
      patient.sex,
    );
    if (!result.canceled) setNotice(`PDF saved to ${result.path}`);
  }
  if (!data)
    return (
      <main className="landing">
        <div className="brand">AHDREPORT</div>
        <div className="hero">
          <p className="eyebrow">PRIVATE HEALTH REPORTING</p>
          <h1>
            Your Apple Health data,
            <br />
            made useful.
          </h1>
          <p>
            Import an Apple Health export to explore trends and create a
            detailed PDF. Your data is processed only on this computer and
            disappears when you close the app.
          </p>
          <button className="primary" onClick={importData}>
            Import Apple Health export
          </button>
          {notice && <p className="error">{notice}</p>}
          <p className="hint">
            Accepts Apple Health <code>export.zip</code> or{" "}
            <code>export.xml</code>. Nothing is uploaded.
          </p>
        </div>
      </main>
    );
  const medicationPresent = records.some((r) => r.metric === "medication");
  const hasBloodPressure = records.some((r) => bpMetrics.includes(r.metric));
  return (
    <PrintLayoutContext.Provider value={printLayout}>
      <main className={printLayout ? "print-layout" : undefined}>
      <header>
        <div>
          <div className="brand">AHDREPORT</div>
        </div>
        <div className="header-actions">
          <button onClick={() => setData(null)}>Clear session</button>
          <button className="primary" onClick={pdf}>
            Export detailed PDF
          </button>
        </div>
      </header>
      <section className="controls">
        <div>
          <b>Report period</b>
          <div className="presets">
            <button onClick={() => setFrom(rangeDate(7, to))}>7D</button>
            <button onClick={() => setFrom(rangeDate(30, to))}>30D</button>
            <button onClick={() => setFrom(rangeDate(90, to))}>90D</button>
            <button onClick={() => setFrom(rangeDate(365, to))}>
              Last year
            </button>
            <button
              onClick={() =>
                setFrom(
                  `${new Date(`${to || new Date().toISOString().slice(0, 10)}T12:00:00`).getFullYear()}-01-01`,
                )
              }
            >
              YTD
            </button>
            <button
              onClick={() =>
                setFrom(data.diagnostics.earliest?.slice(0, 10) ?? "")
              }
            >
              All time
            </button>
          </div>
        </div>
        <DebouncedDateInput label="From" value={from} onChange={setFrom} />
        <DebouncedDateInput label="To" value={to} onChange={setTo} />
      </section>
      <section className="print-period" aria-label="Selected report period">
        <b>Report period</b>
        <dl>
          <div>
            <dt>From</dt>
            <dd>{from || "Beginning"}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{to || "Latest record"}</dd>
          </div>
        </dl>
      </section>
      {notice && <div className="notice">{notice}</div>}
      <section className="intro">
        <p className="eyebrow">CLINICAL OVERVIEW</p>
      </section>
      <section className="patient-profile" aria-label="Patient details">
        <h2>Patient details</h2>
        <PatientDetailsForm
          key={JSON.stringify(patientProfile.current)}
          initial={patientProfile.current}
          onFieldChange={(field, value) => {
            patientProfile.current = { ...patientProfile.current, [field]: value };
          }}
        />
      </section>
      <OverviewCards records={overviewRecords} periodLabel="Last 30 days" />
      <OverviewCards
        records={yearOverviewRecords}
        periodLabel="Last year"
        collapsible
      />
      <OverviewCards
        records={allTimeOverviewRecords}
        periodLabel="All time"
        collapsible
      />
      <section className="dashboard">
        {metricGroups.map((group) => (
          <section key={group.title} className="group">
            <h2>{group.title}</h2>
            <div className="grid">
              {group.title === "Vitals" && hasBloodPressure && (
                <BloodPressureChart records={records} from={from} to={to} />
              )}{" "}
              {group.metrics
                .filter(
                  (m) =>
                    !bpMetrics.includes(m) &&
                    records.some((r) => r.metric === m),
                )
                .map((m) => {
                  const note = coverageNote(m, records, from, to);
                  return (
                    <article className="panel" key={m}>
                      <h3>{labels[m]}</h3>
                      {!printLayout && note && (
                        <small className="table-notes">{note}</small>
                      )}
                      <MetricChart metric={m} records={records} />
                    </article>
                  );
                })}
            </div>
            {!group.metrics.some((m) =>
              records.some((r) => r.metric === m),
            ) && (
              <div className="empty">
                No supported {group.title.toLowerCase()} records were found for
                this period.
              </div>
            )}
          </section>
        ))}
      </section>
      <section className="panel medication">
        <h2>Medication</h2>
        {medicationPresent ? (
          <MetricChart metric="medication" records={records} />
        ) : (
          <p>
            Medication records are not available in this Apple Health export.
            This version does not accept manual medication entries.
          </p>
        )}
      </section>
      <section className="diagnostics">
        <b>Import diagnostics</b>
        <span>
          {data.diagnostics.unsupported.toLocaleString()} unsupported Apple
          Health record types were safely skipped.
        </span>
        {data.diagnostics.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </section>
      <section className="print-report">
        <h2>Detailed measurements</h2>
        <p>
          Report period: {from || "Beginning"} — {to}. Each table below lists up
          to {MAX_TABLE_ROWS.toLocaleString()} of the most recent days with data
          per metric; a note appears under any table showing fewer days than are
          available, or where a metric's own data starts later or ends earlier
          than the selected period.
        </p>
        <VitalsReportTable records={records} from={from} to={to} />
        <ActivityReportTable records={records} from={from} to={to} />
        <WalkingReportTable records={records} from={from} to={to} />
        {metricGroups
          .flatMap((g) => g.metrics)
          .filter(
            (metric) =>
              !bpMetrics.includes(metric) &&
              metric !== "heartRate" &&
              metric !== "weight" &&
              !activityMetrics.includes(metric) &&
              !walkingMetrics.includes(metric),
          )
          .map((m) => (
            <ReportTable
              key={m}
              metric={m}
              records={records}
              from={from}
              to={to}
            />
          ))}
      </section>
      </main>
    </PrintLayoutContext.Provider>
  );
}
