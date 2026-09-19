import type { HealthRecord, Metric, SymptomId, SymptomRecord } from "./shared/types";

export const labels: Record<Metric, string> = {
  weight: "Weight",
  heartRate: "Heart rate",
  restingHeartRate: "Resting heart rate",
  bloodPressureSystolic: "Blood pressure (systolic)",
  bloodPressureDiastolic: "Blood pressure (diastolic)",
  bodyTemperature: "Body temperature",
  steps: "Steps",
  activeEnergy: "Active energy",
  exerciseTime: "Exercise time",
  distance: "Walking / running distance",
  sleep: "Sleep",
  walkingSpeed: "Walking speed",
  stepLength: "Step length",
  walkingAsymmetry: "Walking asymmetry",
  doubleSupport: "Double support",
  stairAscentSpeed: "Stair ascent speed",
  stairDescentSpeed: "Stair descent speed",
  sixMinuteWalk: "Six-minute walk",
  dietaryEnergy: "Dietary energy",
  carbs: "Carbohydrates",
  sugar: "Sugar",
  fiber: "Fiber",
  protein: "Protein",
  fat: "Fat",
  bloodGlucose: "Blood glucose",
  insulinDelivery: "Insulin delivery",
  bodyMassIndex: "Body mass index",
  bodyFatPercentage: "Body fat",
  waistCircumference: "Waist circumference",
  leanBodyMass: "Lean body mass",
  oxygenSaturation: "Blood oxygen",
  respiratoryRate: "Respiratory rate",
  heartRateVariability: "Heart rate variability",
  vo2Max: "Cardio fitness (VO₂ max)",
  walkingHeartRateAverage: "Walking heart rate average",
  medication: "Medication",
};
export const decimalsByMetric: Record<Metric, number> = {
  weight: 1,
  heartRate: 0,
  restingHeartRate: 0,
  bloodPressureSystolic: 0,
  bloodPressureDiastolic: 0,
  bodyTemperature: 1,
  steps: 0,
  activeEnergy: 0,
  exerciseTime: 0,
  distance: 2,
  sleep: 1,
  walkingSpeed: 2,
  stepLength: 2,
  walkingAsymmetry: 1,
  doubleSupport: 1,
  stairAscentSpeed: 2,
  stairDescentSpeed: 2,
  sixMinuteWalk: 1,
  dietaryEnergy: 0,
  carbs: 1,
  sugar: 1,
  fiber: 1,
  protein: 1,
  fat: 1,
  bloodGlucose: 1,
  insulinDelivery: 1,
  bodyMassIndex: 1,
  bodyFatPercentage: 1,
  waistCircumference: 0,
  leanBodyMass: 1,
  oxygenSaturation: 0,
  respiratoryRate: 1,
  heartRateVariability: 0,
  vo2Max: 1,
  walkingHeartRateAverage: 0,
  medication: 0,
};
// Distinct per-metric shades so adjacent columns in the same table (e.g. Vitals: diastolic/systolic/heart rate/weight) are easy to tell apart at a glance.
export const colorsByMetric: Record<Metric, string> = {
  bloodPressureDiastolic: "#4263eb",
  bloodPressureSystolic: "#e8590c",
  heartRate: "#e64980",
  weight: "#0ca678",
  walkingSpeed: "#7048e8",
  stepLength: "#f08c00",
  walkingAsymmetry: "#1098ad",
  doubleSupport: "#9c36b5",
  steps: "#2f9e44",
  distance: "#1098ad",
  activeEnergy: "#e03131",
  sleep: "#7048e8",
  restingHeartRate: "#e64980",
  bodyTemperature: "#f08c00",
  exerciseTime: "#9c36b5",
  stairAscentSpeed: "#0ca678",
  stairDescentSpeed: "#4263eb",
  sixMinuteWalk: "#e8590c",
  dietaryEnergy: "#e03131",
  carbs: "#f08c00",
  sugar: "#e64980",
  fiber: "#2f9e44",
  protein: "#4263eb",
  fat: "#9c36b5",
  bloodGlucose: "#4263eb",
  insulinDelivery: "#9c36b5",
  bodyMassIndex: "#0ca678",
  bodyFatPercentage: "#f08c00",
  waistCircumference: "#7048e8",
  leanBodyMass: "#1098ad",
  oxygenSaturation: "#1098ad",
  respiratoryRate: "#0ca678",
  heartRateVariability: "#e64980",
  vo2Max: "#e03131",
  walkingHeartRateAverage: "#e64980",
  medication: "#e03131",
};
export const metricGroups: { title: string; metrics: Metric[] }[] = [
  {
    title: "Vitals",
    metrics: [
      "weight",
      "heartRate",
      "restingHeartRate",
      "bloodPressureSystolic",
      "bloodPressureDiastolic",
      "bodyTemperature",
      "bodyMassIndex",
      "bodyFatPercentage",
      "waistCircumference",
      "leanBodyMass",
      "heartRateVariability",
      "oxygenSaturation",
      "respiratoryRate",
    ],
  },
  {
    title: "Sleep & activity",
    metrics: ["sleep", "steps", "activeEnergy", "exerciseTime", "distance", "vo2Max", "walkingHeartRateAverage"],
  },
  {
    title: "Mobility",
    metrics: [
      "walkingSpeed",
      "stepLength",
      "walkingAsymmetry",
      "doubleSupport",
      "stairAscentSpeed",
      "stairDescentSpeed",
      "sixMinuteWalk",
    ],
  },
  {
    title: "Nutrition",
    metrics: ["dietaryEnergy", "carbs", "sugar", "fiber", "protein", "fat"],
  },
];
export const symptomLabels: Record<SymptomId, string> = {
  abdominalCramps: "Abdominal cramps",
  acne: "Acne",
  appetiteChanges: "Appetite changes",
  bladderIncontinence: "Bladder incontinence",
  bloating: "Bloating",
  breastPain: "Breast pain",
  chestTightnessOrPain: "Chest tightness or pain",
  chills: "Chills",
  constipation: "Constipation",
  coughing: "Coughing",
  diarrhea: "Diarrhea",
  dizziness: "Dizziness",
  drySkin: "Dry skin",
  fainting: "Fainting",
  fatigue: "Fatigue",
  fever: "Fever",
  generalizedBodyAche: "Generalized body ache",
  headache: "Headache",
  heartburn: "Heartburn",
  hotFlashes: "Hot flashes",
  hairLoss: "Hair loss",
  lossOfSmell: "Loss of smell",
  lossOfTaste: "Loss of taste",
  lowerBackPain: "Lower back pain",
  memoryLapse: "Memory lapse",
  menstrualCramps: "Menstrual cramps",
  moodChanges: "Mood changes",
  nausea: "Nausea",
  nightSweats: "Night sweats",
  pelvicPain: "Pelvic pain",
  rapidPoundingOrFlutteringHeartbeat: "Rapid, pounding, or fluttering heartbeat",
  runnyNose: "Runny nose",
  shortnessOfBreath: "Shortness of breath",
  sinusCongestion: "Sinus congestion",
  skippedHeartbeat: "Skipped heartbeat",
  soreThroat: "Sore throat",
  sleepChanges: "Sleep changes",
  vaginalDryness: "Vaginal dryness",
  vomiting: "Vomiting",
  wheezing: "Wheezing",
};
export function symptomLabel(symptom: SymptomId) {
  return symptomLabels[symptom];
}
export interface RecordRange {
  start: number;
  end: number; // exclusive
}
function toUtcInstant(day: string, endOfDay: boolean): string | undefined {
  const time = endOfDay ? "23:59:59.999" : "00:00:00";
  const date = new Date(`${day}T${time}`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
// First index i such that records[i].date >= iso.
function lowerBound(records: readonly HealthRecord[], iso: string): number {
  let lo = 0;
  let hi = records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].date < iso) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
// First index i such that records[i].date > iso (i.e. count of dates <= iso).
function upperBound(records: readonly HealthRecord[], iso: string): number {
  let lo = 0;
  let hi = records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].date <= iso) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
// Binary lower/upper bound over a globally ascending-sorted record array
// (invariant established by the parser; see electron/appleHealthParser.ts).
// `from`/`to` are local-time day boundaries, matching the UI's date
// inputs; they are converted here to their equivalent UTC ISO instant —
// exactly what `new Date(...).getTime()` (i.e. `Date.parse`) already does —
// before comparing against `record.date`, which is always a UTC ISO string
// produced by `Date.prototype.toISOString()`. Do not compare the raw local
// boundary strings against record.date directly.
export function recordRange(
  records: readonly HealthRecord[],
  from: string,
  to: string,
): RecordRange {
  if (!records.length) return { start: 0, end: 0 };
  let start = 0;
  if (from) {
    const startIso = toUtcInstant(from, false);
    if (startIso === undefined) return { start: 0, end: 0 };
    start = lowerBound(records, startIso);
  }
  let end = records.length;
  if (to) {
    const endIso = toUtcInstant(to, true);
    if (endIso === undefined) return { start: 0, end: 0 };
    end = upperBound(records, endIso);
  }
  // Normalize an empty result to the canonical {0, 0} (rather than e.g.
  // {n, n} when the query window falls entirely after the data), matching
  // what a linear scan naturally produces and what callers expect an
  // "empty range" to look like.
  if (end <= start) return { start: 0, end: 0 };
  return { start, end };
}
export function filtered(records: HealthRecord[], from: string, to: string) {
  const { start, end } = recordRange(records, from, to);
  return records.slice(start, end);
}
function symptomDay(value: string) {
  return value.slice(0, 10);
}
function datesBetween(start: string, end: string) {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (!Number.isFinite(current.getTime()) || !Number.isFinite(last.getTime())) return dates;
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}
export function filteredSymptoms(
  symptoms: SymptomRecord[],
  from: string,
  to: string,
) {
  return symptoms.filter((symptom) => {
    const start = symptomDay(symptom.start);
    const end = symptomDay(symptom.end);
    return (!from || end >= from) && (!to || start <= to);
  });
}
export function symptomEpisodes(symptoms: SymptomRecord[]) {
  return symptoms
    .map((symptom) => ({
      ...symptom,
      durationHours: Math.max(
        0,
        (Date.parse(symptom.end) - Date.parse(symptom.start)) / 3_600_000,
      ),
      key: `${symptom.symptom}|${symptom.start}|${symptom.end}`,
    }))
    .sort((a, b) => b.start.localeCompare(a.start));
}
export function symptomDays(
  symptoms: SymptomRecord[],
  from: string,
  to: string,
) {
  const days = new Map<string, { symptoms: Set<SymptomId>; episodeCount: number }>();
  filteredSymptoms(symptoms, from, to).forEach((symptom) => {
    const start = symptomDay(symptom.start);
    const end = symptomDay(symptom.end);
    datesBetween(start, end).forEach((date) => {
      if ((from && date < from) || (to && date > to)) return;
      const day = days.get(date) ?? { symptoms: new Set<SymptomId>(), episodeCount: 0 };
      day.symptoms.add(symptom.symptom);
      day.episodeCount++;
      days.set(date, day);
    });
  });
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      symptoms: [...day.symptoms].sort(),
      episodeCount: day.episodeCount,
    }));
}
function medianValues(values: number[]) {
  if (!values.length) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function symptomSummary(symptoms: SymptomRecord[]) {
  const episodes = symptomEpisodes(symptoms);
  const days = symptomDays(symptoms, "", "");
  const bySymptom = [...new Set(symptoms.map((symptom) => symptom.symptom))]
    .map((symptom) => {
      const rows = episodes.filter((row) => row.symptom === symptom);
      const symptomDayCount = new Set(
        symptomDays(rows, "", "").map((row) => row.date),
      ).size;
      return {
        symptom,
        episodes: rows.length,
        days: symptomDayCount,
        durationHours: medianValues(rows.map((row) => row.durationHours)) ?? 0,
      };
    })
    .sort((a, b) => b.episodes - a.episodes || a.symptom.localeCompare(b.symptom));
  return {
    episodeCount: episodes.length,
    symptomCount: bySymptom.length,
    symptomDays: days.length,
    medianDurationHours: medianValues(episodes.map((row) => row.durationHours)),
    bySymptom,
  };
}
const symptomAssociationMetrics: Metric[] = [
  "heartRate",
  "restingHeartRate",
  "bloodPressureSystolic",
  "bloodPressureDiastolic",
  "bodyTemperature",
  "sleep",
  "steps",
];
export function symptomAssociations(
  symptoms: SymptomRecord[],
  records: HealthRecord[],
) {
  const symptomDateSet = new Set(symptomDays(symptoms, "", "").map((day) => day.date));
  return symptomAssociationMetrics.map((metric) => {
    const rows = daily(records, metric);
    const symptomRows = rows.filter((row) => symptomDateSet.has(row.date));
    const otherRows = rows.filter((row) => !symptomDateSet.has(row.date));
    const symptomMedian = medianValues(symptomRows.map((row) => row.value));
    const otherMedian = medianValues(otherRows.map((row) => row.value));
    const enough = symptomRows.length >= 3 && otherRows.length >= 3;
    return {
      metric,
      label: labels[metric],
      symptomDays: symptomRows.length,
      otherDays: otherRows.length,
      symptomMedian: enough ? symptomMedian : undefined,
      otherMedian: enough ? otherMedian : undefined,
      difference:
        enough && symptomMedian !== undefined && otherMedian !== undefined
          ? symptomMedian - otherMedian
          : undefined,
      unit: rows[0]?.unit,
    };
  });
}
export function latest(records: HealthRecord[], metric: Metric) {
  return records
    .filter((record) => record.metric === metric)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
}
export function median(records: HealthRecord[], metric: Metric) {
  const values = records
    .filter((record) => record.metric === metric)
    .map((record) => record.value)
    .sort((a, b) => a - b);
  if (!values.length) return undefined;
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}
export function change(records: HealthRecord[], metric: Metric) {
  const values = records
    .filter((record) => record.metric === metric)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (values.length < 2) return undefined;
  return values.at(-1)!.value - values[0].value;
}
export function daily(
  records: HealthRecord[],
  metric: Metric,
  aggregate: "average" | "total" = "average",
) {
  const map = new Map<string, { total: number; count: number; unit: string }>();
  records
    .filter((r) => r.metric === metric)
    .forEach((r) => {
      const day = r.date.slice(0, 10);
      const current = map.get(day) ?? { total: 0, count: 0, unit: r.unit };
      current.total += r.value;
      current.count++;
      map.set(day, current);
    });
  return [...map].map(([date, d]) => ({
    date,
    value: aggregate === "total" ? d.total : d.total / d.count,
    unit: d.unit,
  }));
}
export const interpolatedColor = "#8a94a6";

// Fills every calendar day between the first and last day that actually has
// data with a linearly-interpolated value (interpolated: true), so charts
// plot real calendar spacing instead of squeezing sparse readings together,
// and can render interpolated stretches distinctly from real data. Never
// extrapolates before the first or after the last real day.
export function denseDaily(
  rows: { date: string; value: number; unit: string }[],
): { date: string; value: number; unit: string; interpolated: boolean }[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const unit = sorted[0].unit;
  const dayMs = 24 * 60 * 60 * 1000;
  const startTime = new Date(`${sorted[0].date}T12:00:00`).getTime();
  const endTime = new Date(`${sorted.at(-1)!.date}T12:00:00`).getTime();
  const totalDays = Math.round((endTime - startTime) / dayMs) + 1;
  const byIndex = new Map<number, number>();
  sorted.forEach((row) => {
    const index = Math.round(
      (new Date(`${row.date}T12:00:00`).getTime() - startTime) / dayMs,
    );
    byIndex.set(index, row.value);
  });
  const dateAt = (index: number) =>
    new Date(startTime + index * dayMs).toISOString().slice(0, 10);
  const result: { date: string; value: number; unit: string; interpolated: boolean }[] =
    [];
  let lastKnownIndex = 0;
  for (let i = 0; i < totalDays; i++) {
    const known = byIndex.get(i);
    if (known !== undefined) {
      result.push({ date: dateAt(i), value: known, unit, interpolated: false });
      lastKnownIndex = i;
      continue;
    }
    let next = i + 1;
    while (!byIndex.has(next)) next++;
    const from = byIndex.get(lastKnownIndex)!;
    const to = byIndex.get(next)!;
    const t = (i - lastKnownIndex) / (next - lastKnownIndex);
    result.push({
      date: dateAt(i),
      value: from + (to - from) * t,
      unit,
      interpolated: true,
    });
  }
  return result;
}

// Returns every calendar day between the first and last given date
// (inclusive), so range/min-max charts can plot true gaps for missing days
// instead of squeezing sparse readings together. Unlike denseDaily, this
// never fabricates a value for the missing days — interpolating a min/max
// range isn't meaningful, so callers leave those days' bars undefined.
export function denseDateRange(dates: string[]): string[] {
  if (!dates.length) return [];
  const sorted = [...new Set(dates)].sort((a, b) => a.localeCompare(b));
  const dayMs = 24 * 60 * 60 * 1000;
  const startTime = new Date(`${sorted[0]}T12:00:00`).getTime();
  const endTime = new Date(`${sorted.at(-1)!}T12:00:00`).getTime();
  const totalDays = Math.round((endTime - startTime) / dayMs) + 1;
  return Array.from({ length: totalDays }, (_, i) =>
    new Date(startTime + i * dayMs).toISOString().slice(0, 10),
  );
}

export function dailyTotals(records: HealthRecord[], metric: Metric) {
  const map = new Map<string, { total: number; unit: string }>();
  records
    .filter((record) => record.metric === metric)
    .forEach((record) => {
      const day = record.date.slice(0, 10);
      const current = map.get(day) ?? { total: 0, unit: record.unit };
      current.total += record.value;
      map.set(day, current);
    });
  return [...map]
    .map(([date, value]) => ({ date, ...value }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export interface DailyStats {
  date: string;
  values: number[];
  unit: string;
  min: number;
  max: number;
  average: number;
  standardDeviation: number;
}
export function dailyStats(
  records: HealthRecord[],
  metric: Metric,
): DailyStats[] {
  const groups = new Map<string, HealthRecord[]>();
  records
    .filter((record) => record.metric === metric)
    .forEach((record) => {
      const day = record.date.slice(0, 10);
      groups.set(day, [...(groups.get(day) ?? []), record]);
    });
  return [...groups]
    .map(([date, rows]) => {
      const values = rows
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((row) => row.value);
      const average =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const standardDeviation = Math.sqrt(
        values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
          values.length,
      );
      return {
        date,
        values,
        unit: rows[0].unit,
        min: Math.min(...values),
        max: Math.max(...values),
        average,
        standardDeviation,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
// Bounded by the number of distinct decimals configurations actually used
// (decimalsByMetric's values plus the "auto" default) — not by render count.
const numberFormatters = new Map<string, Intl.NumberFormat>();
function numberFormatterFor(decimals?: number) {
  const key = decimals === undefined ? "auto" : String(decimals);
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    const options: Intl.NumberFormatOptions =
      decimals === undefined
        ? { maximumFractionDigits: 1 }
        : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    formatter = new Intl.NumberFormat(undefined, options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}
export function format(value: number, unit = "", decimals?: number) {
  return `${numberFormatterFor(decimals).format(value)}${unit ? ` ${unit}` : ""}`;
}
export interface RangeMetadata {
  presentMetrics: Set<Metric>;
  spanByMetric: Map<Metric, { earliest: string; latest: string }>;
}
// Single traversal of a selected-range record array. Relies on records
// being sorted ascending by date (guaranteed by the parser, see
// electron/appleHealthParser.ts, and preserved by filtered()/recordRange()),
// so a metric's first occurrence is its earliest date and every later
// occurrence safely extends `latest`.
export function rangeMetadata(records: readonly HealthRecord[]): RangeMetadata {
  const presentMetrics = new Set<Metric>();
  const spanByMetric = new Map<Metric, { earliest: string; latest: string }>();
  for (const record of records) {
    presentMetrics.add(record.metric);
    const day = record.date.slice(0, 10);
    const span = spanByMetric.get(record.metric);
    if (span) span.latest = day;
    else spanByMetric.set(record.metric, { earliest: day, latest: day });
  }
  return { presentMetrics, spanByMetric };
}
const dayFormatter = new Intl.DateTimeFormat(undefined);
export function formatDate(isoDay: string) {
  const date = new Date(`${isoDay}T00:00:00`);
  return Number.isFinite(date.getTime())
    ? dayFormatter.format(date)
    : "Invalid Date";
}

// Tukey fences (1.5x IQR) — flags a day as statistically unusual without
// excluding it; distinct from the parser's physiological-plausibility filter,
// which excludes data before it ever reaches this function.
export function outlierDates(
  rows: { date: string; value: number }[],
): Set<string> {
  if (!rows.length) return new Set();
  const sorted = rows.map((r) => r.value).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1 || 1;
  const lower = q1 - iqr * 1.5;
  const upper = q3 + iqr * 1.5;
  return new Set(
    rows.filter((r) => r.value < lower || r.value > upper).map((r) => r.date),
  );
}

// Change-point-merged plateau overlay: groups days-with-data into
// position-based buckets (not calendar weeks), then greedily merges
// adjacent buckets whose means are close relative to their combined
// noise. See docs/design/chart_analysis.md section 1 for the algorithm
// rationale. Takes raw {date,value,unit} rows directly, for series that
// aren't a stored Metric (e.g. pulse pressure, mean arterial pressure).
export function plateauSegments(
  dailyRows: { date: string; value: number; unit: string }[],
): { date: string; value: number; unit: string }[] {
  const rows = [...dailyRows].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return [];
  const values = rows.map((r) => r.value);
  const range = Math.max(...values) - Math.min(...values);
  const noiseFloor = range * 0.02;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stdDev = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / xs.length);
  };
  // Bucket size (the minimum plateau length) scales with the data's own
  // date span, so a long report doesn't fragment into dozens of noisy
  // weekly segments: aim for roughly the same number of buckets (~13,
  // matching the original fixed 7-day bucket at a 90-day span) regardless
  // of how long the period is. Spans of ~90 days or less keep the
  // original 7-day minimum.
  const spanDays =
    (new Date(rows.at(-1)!.date).getTime() - new Date(rows[0].date).getTime()) /
      86_400_000 +
    1;
  const bucketSize = Math.max(7, Math.round(spanDays / 13));

  // Group real readings into calendar-contiguous runs, breaking wherever
  // two consecutive real readings are more than a bucket's worth of days
  // apart — that stretch has too little data to say anything about, and a
  // plateau segment never bridges it. Within a run, small gaps are filled
  // in via the same linear interpolation the charts draw (denseDaily), so
  // a run's length — and the minimum-length check below — is judged by the
  // calendar days it actually spans rather than by how many raw readings
  // happen to fall inside it: sparse-but-regular readings over a long span
  // should still read as a plateau, not get dropped for being undersampled.
  type Row = { date: string; value: number; unit: string };
  const realRuns: Row[][] = [[rows[0]]];
  for (let i = 1; i < rows.length; i++) {
    const gapDays =
      (new Date(rows[i].date).getTime() - new Date(rows[i - 1].date).getTime()) /
      86_400_000;
    if (gapDays > bucketSize) realRuns.push([]);
    realRuns.at(-1)!.push(rows[i]);
  }

  const unit = rows[0].unit;
  const result: Row[] = [];
  for (const realRun of realRuns) {
    const run = denseDaily(realRun);
    if (run.length < 14) continue;
    const runValues = run.map((r) => r.value);
    const buckets: { values: number[]; startIndex: number; endIndex: number }[] =
      [];
    for (let i = 0; i < run.length; i += bucketSize) {
      const end = Math.min(i + bucketSize, run.length);
      buckets.push({
        values: runValues.slice(i, end),
        startIndex: i,
        endIndex: end - 1,
      });
    }
    const segments: { values: number[]; startIndex: number; endIndex: number }[] =
      [{ ...buckets[0] }];
    for (let i = 1; i < buckets.length; i++) {
      const bucket = buckets[i];
      const current = segments.at(-1)!;
      const currentMean = mean(current.values);
      const bucketMean = mean(bucket.values);
      const pooledSD = (stdDev(current.values) + stdDev(bucket.values)) / 2;
      const threshold = 0.75 * Math.max(pooledSD, noiseFloor);
      if (Math.abs(bucketMean - currentMean) <= threshold) {
        current.values = current.values.concat(bucket.values);
        current.endIndex = bucket.endIndex;
      } else {
        segments.push({ ...bucket });
      }
    }
    for (const segment of segments) {
      const segmentMean = mean(segment.values);
      for (let i = segment.startIndex; i <= segment.endIndex; i++) {
        result.push({ date: run[i].date, value: segmentMean, unit });
      }
    }
  }
  return result;
}

export function plateaus(
  records: HealthRecord[],
  metric: Metric,
  aggregate: "average" | "total" = "average",
): { date: string; value: number; unit: string }[] {
  return plateauSegments(daily(records, metric, aggregate));
}

// Picks the middle date of each plateau segment for a callout label,
// relying on plateauSegments() reusing the exact same segmentMean number
// across every date in a segment to detect segment boundaries.
export function calloutsFromPlateauRows(
  rows: { date: string; value: number; unit: string }[],
): { date: string; value: number; unit: string }[] {
  const callouts: { date: string; value: number; unit: string }[] = [];
  let segmentStart = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i].value !== rows[segmentStart].value) {
      callouts.push(rows[segmentStart + Math.floor((i - segmentStart) / 2)]);
      segmentStart = i;
    }
  }
  return callouts;
}

export function plateauCallouts(
  records: HealthRecord[],
  metric: Metric,
  aggregate: "average" | "total" = "average",
): { date: string; value: number; unit: string }[] {
  return calloutsFromPlateauRows(plateaus(records, metric, aggregate));
}

export interface BpDerivedDay {
  date: string;
  unit: string; // "mmHg"
  systolic: number;
  diastolic: number;
  pulsePressure: number; // systolic − diastolic
  map: number; // diastolic + pulsePressure / 3
}
export function bpDerived(records: HealthRecord[]): BpDerivedDay[] {
  const systolic = new Map(
    dailyStats(records, "bloodPressureSystolic").map((d) => [d.date, d]),
  );
  const diastolic = new Map(
    dailyStats(records, "bloodPressureDiastolic").map((d) => [d.date, d]),
  );
  return [...systolic.keys()]
    .filter((date) => diastolic.has(date))
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const s = systolic.get(date)!;
      const d = diastolic.get(date)!;
      const pulsePressure = s.average - d.average;
      return {
        date,
        unit: s.unit,
        systolic: s.average,
        diastolic: d.average,
        pulsePressure,
        map: d.average + pulsePressure / 3,
      };
    });
}
export function bpPeriodAverage(
  days: { systolic: number; diastolic: number }[],
): { systolic: number; diastolic: number } | undefined {
  if (!days.length) return undefined;
  return {
    systolic: days.reduce((sum, d) => sum + d.systolic, 0) / days.length,
    diastolic: days.reduce((sum, d) => sum + d.diastolic, 0) / days.length,
  };
}

export type BpScheme = "swedish" | "aha";

export type SwedishBpCategory =
  | "Optimal"
  | "Normal"
  | "High normal"
  | "Grade 1 hypertension"
  | "Grade 2 hypertension"
  | "Grade 3 hypertension";
export function bpCategorySwedish(
  systolic: number,
  diastolic: number,
): SwedishBpCategory {
  if (systolic >= 180 || diastolic >= 110) return "Grade 3 hypertension";
  if (systolic >= 160 || diastolic >= 100) return "Grade 2 hypertension";
  if (systolic >= 140 || diastolic >= 90) return "Grade 1 hypertension";
  if (systolic >= 130 || diastolic >= 85) return "High normal";
  if (systolic >= 120 || diastolic >= 80) return "Normal";
  return "Optimal";
}
export const bpCategoryColorsSwedish: Record<SwedishBpCategory, string> = {
  Optimal: "#2f9e44",
  Normal: "#66a80f",
  "High normal": "#f59f00",
  "Grade 1 hypertension": "#e8590c",
  "Grade 2 hypertension": "#e03131",
  "Grade 3 hypertension": "#862e2e",
};
export const bpCategoryOrderSwedish: SwedishBpCategory[] = [
  "Optimal",
  "Normal",
  "High normal",
  "Grade 1 hypertension",
  "Grade 2 hypertension",
  "Grade 3 hypertension",
];

export type AhaBpCategory =
  | "Normal"
  | "Elevated"
  | "Stage 1"
  | "Stage 2"
  | "Crisis";
export function bpCategoryAha(
  systolic: number,
  diastolic: number,
): AhaBpCategory {
  if (systolic > 180 || diastolic > 120) return "Crisis";
  if (systolic >= 140 || diastolic >= 90) return "Stage 2";
  if (systolic >= 130 || diastolic >= 80) return "Stage 1";
  if (systolic >= 120 && diastolic < 80) return "Elevated";
  return "Normal";
}
export const bpCategoryColorsAha: Record<AhaBpCategory, string> = {
  Normal: "#2f9e44",
  Elevated: "#f59f00",
  "Stage 1": "#e8590c",
  "Stage 2": "#e03131",
  Crisis: "#862e2e",
};
export const bpCategoryOrderAha: AhaBpCategory[] = [
  "Normal",
  "Elevated",
  "Stage 1",
  "Stage 2",
  "Crisis",
];

// Longest run of consecutive covered days (by position, not calendar) at or
// above `floor`'s severity rank in `order`; undefined below a 3-day minimum.
export function longestElevatedRun<T extends string>(
  days: { date: string; category: T }[],
  order: T[],
  floor: T,
): { start: string; end: string; length: number } | undefined {
  const floorRank = order.indexOf(floor);
  let best: { start: string; end: string; length: number } | undefined;
  let runStart = -1;
  for (let i = 0; i <= days.length; i++) {
    const qualifies =
      i < days.length && order.indexOf(days[i].category) >= floorRank;
    if (qualifies) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const length = i - runStart;
      if (length >= 3 && (!best || length > best.length)) {
        best = { start: days[runStart].date, end: days[i - 1].date, length };
      }
      runStart = -1;
    }
  }
  return best;
}

export const highlights: Metric[] = [
  "weight",
  "heartRate",
  "steps",
  "sleep",
  "dietaryEnergy",
];
export const bpMetrics: Metric[] = [
  "bloodPressureSystolic",
  "bloodPressureDiastolic",
];
export const bodyCompositionMetrics: Metric[] = [
  "bodyMassIndex",
  "bodyFatPercentage",
  "leanBodyMass",
];
export const walkingMetrics: Metric[] = [
  "walkingSpeed",
  "stepLength",
  "walkingAsymmetry",
  "doubleSupport",
];
export const activityMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  "sleep",
];
export const nutritionMetrics: Metric[] = [
  "dietaryEnergy",
  "carbs",
  "sugar",
  "fiber",
  "protein",
  "fat",
];
export const totalsMetrics: Metric[] = [
  "steps",
  "distance",
  "activeEnergy",
  ...nutritionMetrics,
];
export const plateauMetrics: Metric[] = [
  "steps",
  "activeEnergy",
  "distance",
  "exerciseTime",
  "dietaryEnergy",
  "fiber",
  "protein",
  "fat",
  "weight",
  "sleep",
  "restingHeartRate",
  "bodyTemperature",
  "bodyMassIndex",
  "bodyFatPercentage",
  "waistCircumference",
  "leanBodyMass",
  "heartRateVariability",
  "oxygenSaturation",
  "respiratoryRate",
];

export function quantile(sorted: number[], p: number) {
  const i = p * (sorted.length - 1);
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
// Scales the shared axis to Tukey's fences (1.5x IQR) so a rare bad reading can't flatten every other day's bar; never widens beyond the true observed range.
export function boundsOf(values: number[]) {
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
export function columnBounds(days: (DailyStats | undefined)[]) {
  return boundsOf(
    days.filter((day): day is DailyStats => !!day).flatMap((day) => day.values),
  );
}
export function totalBounds(totals: (number | undefined)[]) {
  return boundsOf(totals.filter((v): v is number => v !== undefined));
}

export const MAX_TABLE_ROWS = 365;
export const MAX_PDF_TABLE_ROWS = 365;
