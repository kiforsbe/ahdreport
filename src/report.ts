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
export function daily(records: HealthRecord[], metric: Metric) {
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
    value: d.total / d.count,
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
export function format(value: number, unit = "", decimals?: number) {
  const options =
    decimals === undefined
      ? { maximumFractionDigits: 1 }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return `${new Intl.NumberFormat(undefined, options).format(value)}${unit ? ` ${unit}` : ""}`;
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
