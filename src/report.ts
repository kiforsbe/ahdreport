import type { HealthRecord, Metric } from "./shared/types";

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
    ],
  },
  {
    title: "Sleep & activity",
    metrics: ["sleep", "steps", "activeEnergy", "exerciseTime", "distance"],
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
export function filtered(records: HealthRecord[], from: string, to: string) {
  const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  return records.filter((record) => {
    const timestamp = Date.parse(record.date);
    return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
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
// Relies on records being sorted ascending by date (guaranteed by the parser and preserved by filtered()).
export function dataSpan(
  records: HealthRecord[],
  metric: Metric,
): { earliest?: string; latest?: string } {
  const dates = records
    .filter((record) => record.metric === metric)
    .map((record) => record.date.slice(0, 10));
  return { earliest: dates[0], latest: dates.at(-1) };
}
const dayFormatter = new Intl.DateTimeFormat(undefined);
export function formatDate(isoDay: string) {
  return dayFormatter.format(new Date(`${isoDay}T00:00:00`));
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

// Change-point-merged plateau overlay: groups days-with-data into 7-day
// buckets by position (not calendar weeks), then greedily merges adjacent
// buckets whose means are close relative to their combined noise. See
// docs/design/chart_analysis.md section 1 for the algorithm rationale.
export function plateaus(
  records: HealthRecord[],
  metric: Metric,
  aggregate: "average" | "total" = "average",
): { date: string; value: number; unit: string }[] {
  const rows = daily(records, metric, aggregate).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (rows.length < 14) return [];
  const values = rows.map((r) => r.value);
  const range = Math.max(...values) - Math.min(...values);
  const noiseFloor = range * 0.02;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stdDev = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / xs.length);
  };
  const bucketSize = 7;
  const buckets: { values: number[]; startIndex: number; endIndex: number }[] =
    [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const end = Math.min(i + bucketSize, rows.length);
    buckets.push({
      values: values.slice(i, end),
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
  const unit = rows[0].unit;
  const result: { date: string; value: number; unit: string }[] = [];
  for (const segment of segments) {
    const segmentMean = mean(segment.values);
    for (let i = segment.startIndex; i <= segment.endIndex; i++) {
      result.push({ date: rows[i].date, value: segmentMean, unit });
    }
  }
  return result;
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
