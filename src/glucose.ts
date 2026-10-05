import type { HealthRecord } from "./shared/types";
import { format, quantile } from "./report";

// ---------- target range ----------
export type GlucosePresetId = "type2" | "type1" | "pregnancy" | "reference" | "custom";
export interface GlucoseRange {
  preset: GlucosePresetId;
  low: number;
  high: number;
}
export const glucosePresets: { id: GlucosePresetId; label: string; low: number; high: number }[] = [
  { id: "type2", label: "Type 2 diabetes", low: 3.9, high: 10.0 },
  { id: "type1", label: "Type 1 diabetes", low: 3.9, high: 10.0 },
  { id: "pregnancy", label: "Pregnancy / gestational", low: 3.5, high: 7.8 },
  { id: "reference", label: "Non-diabetic male / female", low: 3.9, high: 7.8 },
  // Pre-filled with the common Swedish clinical shorthand.
  { id: "custom", label: "Custom", low: 4.0, high: 10.0 },
];
export function presetRange(id: GlucosePresetId): GlucoseRange {
  const preset = glucosePresets.find((p) => p.id === id) ?? glucosePresets[0];
  return { preset: preset.id, low: preset.low, high: preset.high };
}
export const defaultGlucoseRange = presetRange("type2");
export function glucosePresetLabel(id: GlucosePresetId) {
  return (glucosePresets.find((p) => p.id === id) ?? glucosePresets[0]).label;
}
// Returns `range` itself when the edit would make it invalid.
export function withCustomBound(
  range: GlucoseRange,
  bound: "low" | "high",
  value: number,
): GlucoseRange {
  const next: GlucoseRange = { ...range, preset: "custom", [bound]: value };
  const valid =
    Number.isFinite(value) && next.low >= 2 && next.high <= 20 && next.low < next.high;
  return valid ? next : range;
}

export type GlucoseClass = "below" | "within" | "above";
export function classifyGlucose(
  value: number,
  range: Pick<GlucoseRange, "low" | "high">,
): GlucoseClass {
  return value < range.low ? "below" : value > range.high ? "above" : "within";
}
export const glucoseColors = {
  below: "#c92a2a",
  within: "#51cf66",
  above: "#d9480f",
  line: "#4263eb",
  band: "rgba(81, 207, 102, 0.13)",
  carbs: "#f08c00",
  insulin: "#9c36b5",
  activity: "#0ca678",
  sleep: "#4c6ef5",
} as const;
// In-range readings keep the series colour; only out-of-range readings use status colours.
export function glucoseStatusColor(value: number, range: Pick<GlucoseRange, "low" | "high">) {
  const status = classifyGlucose(value, range);
  return status === "within" ? glucoseColors.line : glucoseColors[status];
}

// ---------- formatting & time ----------
export const MG_PER_MMOL = 18.0156;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const ASSOCIATION_MIN_PAIRS = 5;
const SLOT_MS = 15 * MINUTE_MS;

export function formatMmol(value: number) {
  return format(value, "", 1);
}
export function glucoseRangeText(range: Pick<GlucoseRange, "low" | "high">) {
  return `${formatMmol(range.low)}–${formatMmol(range.high)} mmol/L`;
}
// Local calendar day, matching filtered()'s local-day boundaries.
export function localDay(value: string | number) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shortDate(isoDay: string) {
  return new Date(`${isoDay}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
export function timeOfDay(value: string | number) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function daySpan(first: string, last: string) {
  const a = new Date(`${first}T12:00:00`).getTime();
  const b = new Date(`${last}T12:00:00`).getTime();
  return Math.round((b - a) / (24 * HOUR_MS)) + 1;
}
export function medianOf(values: number[]) {
  if (!values.length) return undefined;
  return quantile(values.slice().sort((a, b) => a - b), 0.5);
}
// Rounds up to the nearest even number, with a floor of 14 (the top of every
// target-range preset) so a chart never compresses in-range data to make
// room for a single high outlier.
export function niceYMax(maxValue: number): number {
  return Math.max(14, Math.ceil((maxValue + 1) / 2) * 2);
}
function populationSd(values: number[], mean: number) {
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}
export function glucoseReadings(records: HealthRecord[]) {
  return records.filter((record) => record.metric === "bloodGlucose");
}

// ---------- morning-to-morning tracking and inferred measurement context ----------
export const DEFAULT_GLUCOSE_DAY_START = 6;
export function glucoseTrackingWindow(day: string, startHour = DEFAULT_GLUCOSE_DAY_START) {
  const start = new Date(`${day}T00:00:00`);
  start.setHours(startHour);
  const end = new Date(start);
  // Advance the local date, not 24 elapsed hours (DST days have 23/25 hours).
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}
export function glucoseTrackingDay(time: string | number, startHour = DEFAULT_GLUCOSE_DAY_START) {
  const date = new Date(time);
  if (date.getHours() < startHour) date.setDate(date.getDate() - 1);
  return localDay(date.getTime());
}
export function glucoseTrackingRecords(records: HealthRecord[], from: string, to: string, startHour = DEFAULT_GLUCOSE_DAY_START) {
  const start = from ? glucoseTrackingWindow(from, startHour).start : -Infinity;
  const end = to ? glucoseTrackingWindow(to, startHour).end : Infinity;
  return records.filter(r => {
    const t = Date.parse(r.date);
    // Keep duration records which overlap the window, even if they started earlier.
    const duration = r.metric === "sleep" ? r.value * HOUR_MS : r.metric === "exerciseTime" ? r.value * MINUTE_MS : 0;
    return t < end && (duration ? t + duration > start : t >= start);
  });
}
export function glucoseMorningReading(records: HealthRecord[], day: string, _startHour = DEFAULT_GLUCOSE_DAY_START) {
  // Fasting inference is deliberately calendar-based, independent of the chart boundary.
  const first = glucoseReadings(records).filter(r => localDay(r.date) === day)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
  if (!first || new Date(first.date).getHours() >= 10 || first.category === "afterMeal") return undefined;
  return { reading: first, confirmedFasting: first.category === "fasting", assumedFasting: first.category !== "fasting" };
}
export interface GlucoseAxis {
  min: number;
  max: number;
  ticks: number[];
}
// Shared overview scale: normally 3–12, expanding only for displayed samples.
// Include calendar-first fasting markers which can precede the 06:00 window,
// but never let readings from unrelated dates stretch the selected period.
export function glucoseChartAxis(records: HealthRecord[], contextRecords = records, startHour = DEFAULT_GLUCOSE_DAY_START): GlucoseAxis {
  let lowest = 3, highest = 12;
  const include = (value: number) => {
    if (!Number.isFinite(value)) return;
    lowest = Math.min(lowest, value);
    highest = Math.max(highest, value);
  };
  const days = new Set<string>();
  for (const reading of glucoseReadings(records)) {
    include(reading.value);
    days.add(glucoseTrackingDay(reading.date, startHour));
  }
  const mornings = new Map<string, HealthRecord>();
  for (const reading of glucoseReadings(contextRecords)) {
    const day = localDay(reading.date);
    if (!days.has(day)) continue;
    const first = mornings.get(day);
    if (!first || Date.parse(reading.date) < Date.parse(first.date)) mornings.set(day, reading);
  }
  for (const [day, reading] of mornings) {
    const fasting = glucoseMorningReading([reading], day);
    if (fasting) include(fasting.reading.value);
  }
  const min = lowest < 3 ? Math.max(0, Math.floor(lowest - .25)) : 3;
  const max = highest > 12 ? Math.ceil(highest + .25) : 12;
  const step = max - min <= 12 ? 1 : max - min <= 24 ? 2 : 5;
  const ticks = [min];
  for (let tick = Math.ceil(min / step) * step; tick < max; tick += step) {
    if (tick > min) ticks.push(tick);
  }
  ticks.push(max);
  return { min, max, ticks };
}
export interface GlucoseMealPair {
  before: HealthRecord;
  after: HealthRecord;
  minutes: number;
  delta: number;
  evidence: "tags" | "carbs" | "timing";
}
export function glucoseMealPairs(records: HealthRecord[]): GlucoseMealPair[] {
  const readings = glucoseReadings(records).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const carbs = records.filter(r => r.metric === "carbs" && r.value > 0).map(r => Date.parse(r.date));
  const pairs: GlucoseMealPair[] = [];
  for (let i = 0; i < readings.length - 1; i++) {
    const before = readings[i], after = readings[i + 1];
    const start = Date.parse(before.date), end = Date.parse(after.date);
    const minutes = (end - start) / MINUTE_MS;
    if (minutes < 60 || minutes > 180 || before.category === "afterMeal" || after.category === "beforeMeal" || after.category === "fasting") continue;
    const tagged = (before.category === "beforeMeal" || before.category === "fasting") && after.category === "afterMeal";
    const logged = carbs.some(t => t >= start && t <= start + 30 * MINUTE_MS && t < end);
    pairs.push({ before, after, minutes, delta: after.value - before.value, evidence: tagged ? "tags" : logged ? "carbs" : "timing" });
  }
  return pairs;
}
export function glucoseReferenceGuides(range: GlucoseRange) {
  if (range.preset !== "reference") return [];
  // ADA 2026 laboratory screening thresholds: these are reference lines,
  // not diagnostic classifications of home measurements or ordinary meals.
  return [
    { value: 5.6, label: "Fasting: increased-risk threshold", color: "#b7791f" },
    { value: 7.0, label: "Fasting: diagnostic-test threshold", color: "#c92a2a" },
    { value: 11.1, label: "2-hour diagnostic-test threshold", color: "#a61e4d" },
  ];
}

// ---------- summary ----------
export interface MealContextStat {
  count: number;
  median?: number;
}
export interface GlucoseSummary {
  count: number;
  daysWithReadings: number;
  windowDays: number;
  coverage: number;
  dense: boolean;
  latest: HealthRecord;
  median: number;
  mean: number;
  sd: number;
  cv: number;
  split: Record<GlucoseClass, number>;
  gmi?: { percent: number; mmolPerMol: number };
  mealContext: { beforeMeal: MealContextStat; afterMeal: MealContextStat; untagged: MealContextStat };
}
export function glucoseSummary(
  records: HealthRecord[],
  range: GlucoseRange,
  from: string,
  to: string,
): GlucoseSummary | undefined {
  const readings = glucoseReadings(records);
  if (!readings.length) return undefined;
  const times = readings.map((r) => Date.parse(r.date));
  const values = readings.map((r) => r.value);
  const days = new Set(readings.map((r) => localDay(r.date)));
  const windowDays = daySpan(
    from || localDay(readings[0].date),
    to || localDay(readings.at(-1)!.date),
  );
  const coverage = new Set(times.map((t) => Math.floor(t / SLOT_MS))).size / (windowDays * 96);
  const dense = days.size >= 14 && coverage >= 0.7;
  // Continuous data: weight by time until the next reading (capped), so a
  // burst of readings does not outweigh the rest of the day.
  const weights = times.map((t, i) =>
    dense ? Math.min((times[i + 1] ?? t + 5 * MINUTE_MS) - t, SLOT_MS) : 1,
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const split: Record<GlucoseClass, number> = { below: 0, within: 0, above: 0 };
  values.forEach((v, i) => {
    split[classifyGlucose(v, range)] += weights[i] / totalWeight;
  });
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = populationSd(values, mean);
  const gmiPercent = 3.31 + 0.02392 * mean * MG_PER_MMOL;
  const stat = (vs: number[]): MealContextStat => ({ count: vs.length, median: medianOf(vs) });
  return {
    count: readings.length,
    daysWithReadings: days.size,
    windowDays,
    coverage,
    dense,
    latest: readings.at(-1)!,
    median: medianOf(values)!,
    mean,
    sd,
    cv: (sd / mean) * 100,
    split,
    gmi: dense ? { percent: gmiPercent, mmolPerMol: (gmiPercent - 2.152) / 0.09148 } : undefined,
    mealContext: {
      beforeMeal: stat(readings.filter((r) => r.category === "beforeMeal").map((r) => r.value)),
      afterMeal: stat(readings.filter((r) => r.category === "afterMeal").map((r) => r.value)),
      untagged: stat(readings.filter((r) => !r.category).map((r) => r.value)),
    },
  };
}

// ---------- context events ----------
export interface ActivitySession {
  start: number;
  end: number;
  minutes: number;
}
export function activitySessions(records: HealthRecord[]): ActivitySession[] {
  const sessions: ActivitySession[] = [];
  for (const record of records) {
    if (record.metric !== "exerciseTime") continue;
    const start = Date.parse(record.date);
    const end = start + record.value * MINUTE_MS;
    const last = sessions.at(-1);
    if (last && start - last.end <= 10 * MINUTE_MS) {
      // Count only the non-overlapping part, so duplicate sources don't add up.
      last.minutes += Math.max(0, end - Math.max(start, last.end)) / MINUTE_MS;
      last.end = Math.max(last.end, end);
    } else sessions.push({ start, end, minutes: record.value });
  }
  return sessions.filter((session) => session.minutes >= 10);
}
export interface SleepNight {
  start: number;
  end: number;
  hours: number;
  date: string;
}
export function sleepNights(records: HealthRecord[]): SleepNight[] {
  const nights: Omit<SleepNight, "date">[] = [];
  for (const record of records) {
    if (
      record.metric !== "sleep" ||
      !record.category?.startsWith("HKCategoryValueSleepAnalysisAsleep")
    )
      continue;
    const start = Date.parse(record.date);
    const end = start + record.value * HOUR_MS;
    const last = nights.at(-1);
    if (last && start - last.end <= HOUR_MS) {
      last.hours += Math.max(0, end - Math.max(start, last.end)) / HOUR_MS;
      last.end = Math.max(last.end, end);
    } else nights.push({ start, end, hours: record.value });
  }
  return nights.map((night) => ({ ...night, date: localDay(night.end) }));
}

// ---------- daily rows ----------
export interface GlucoseDay {
  date: string;
  readings: HealthRecord[];
  carbs: HealthRecord[];
  insulin: HealthRecord[];
  activity: ActivitySession[];
  count: number;
  min: number;
  max: number;
  average: number;
  standardDeviation: number;
  median: number;
  counts: Record<GlucoseClass, number>;
  beforeMealMedian?: number;
  afterMealMedian?: number;
  basal: number;
  bolus: number;
  unspecifiedInsulin: number;
}
export function glucoseDaily(records: HealthRecord[], range: GlucoseRange, startHour = 0): GlucoseDay[] {
  type Bucket = Pick<GlucoseDay, "readings" | "carbs" | "insulin" | "activity">;
  const buckets = new Map<string, Bucket>();
  const bucket = (day: string) => {
    let found = buckets.get(day);
    if (!found) {
      found = { readings: [], carbs: [], insulin: [], activity: [] };
      buckets.set(day, found);
    }
    return found;
  };
  for (const record of records) {
    if (record.metric === "bloodGlucose") bucket(glucoseTrackingDay(record.date, startHour)).readings.push(record);
    else if (record.metric === "carbs") bucket(glucoseTrackingDay(record.date, startHour)).carbs.push(record);
    else if (record.metric === "insulinDelivery") bucket(glucoseTrackingDay(record.date, startHour)).insulin.push(record);
  }
  for (const session of activitySessions(records)) bucket(glucoseTrackingDay(session.start, startHour)).activity.push(session);
  const sum = (rows: HealthRecord[]) => rows.reduce((total, row) => total + row.value, 0);
  return [...buckets]
    .filter(([, b]) => b.readings.length)
    .map(([date, b]) => {
      const values = b.readings.map((r) => r.value);
      const average = values.reduce((a, v) => a + v, 0) / values.length;
      const counts: Record<GlucoseClass, number> = { below: 0, within: 0, above: 0 };
      values.forEach((v) => counts[classifyGlucose(v, range)]++);
      return {
        date,
        ...b,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        average,
        standardDeviation: populationSd(values, average),
        median: medianOf(values)!,
        counts,
        beforeMealMedian: medianOf(b.readings.filter((r) => r.category === "beforeMeal").map((r) => r.value)),
        afterMealMedian: medianOf(b.readings.filter((r) => r.category === "afterMeal").map((r) => r.value)),
        basal: sum(b.insulin.filter((r) => r.category === "basal")),
        bolus: sum(b.insulin.filter((r) => r.category === "bolus")),
        unspecifiedInsulin: sum(b.insulin.filter((r) => !r.category)),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- typical-day profile ----------
export interface HourProfile {
  hour: number;
  count: number;
  percentiles?: { p5: number; p25: number; p50: number; p75: number; p95: number };
}
export function glucoseHourlyProfile(records: HealthRecord[]): HourProfile[] {
  const hours: number[][] = Array.from({ length: 24 }, () => []);
  for (const reading of glucoseReadings(records)) hours[new Date(reading.date).getHours()].push(reading.value);
  return hours.map((values, hour) => {
    if (!values.length) return { hour, count: 0 };
    const s = values.slice().sort((a, b) => a - b);
    return {
      hour,
      count: values.length,
      percentiles: {
        p5: quantile(s, 0.05),
        p25: quantile(s, 0.25),
        p50: quantile(s, 0.5),
        p75: quantile(s, 0.75),
        p95: quantile(s, 0.95),
      },
    };
  });
}

// ---------- associations ----------
export interface GlucoseAssociations {
  carbs: { n: number; value?: number };
  activity: { n: number; value?: number };
  sleep: { shorter: number; longer: number; splitHours?: number; value?: number };
}
export function glucoseAssociations(records: HealthRecord[]): GlucoseAssociations {
  const readings = glucoseReadings(records).map((r) => ({ t: Date.parse(r.date), v: r.value }));
  const times = readings.map((r) => r.t);
  // First index whose time is >= t.
  const lowerIndex = (t: number) => {
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // Readings with from < t <= to.
  const between = (from: number, to: number) => readings.slice(lowerIndex(from + 1), lowerIndex(to + 1));
  const lastIn = (from: number, to: number) => between(from - 1, to).at(-1);

  const carbTimes = records.filter((r) => r.metric === "carbs").map((r) => Date.parse(r.date));
  const carbDeltas: number[] = [];
  for (const t of carbTimes) {
    const base = lastIn(t - 30 * MINUTE_MS, t);
    const after = between(t, t + 2 * HOUR_MS);
    if (base && after.length) carbDeltas.push(Math.max(...after.map((r) => r.v)) - base.v);
  }

  const activityDeltas: number[] = [];
  for (const session of activitySessions(records)) {
    const base = lastIn(session.start - 30 * MINUTE_MS, session.start);
    const target = session.start + 2 * HOUR_MS;
    const near = between(target - HOUR_MS - 1, target + HOUR_MS).sort(
      (a, b) => Math.abs(a.t - target) - Math.abs(b.t - target),
    )[0];
    if (base && near) activityDeltas.push(near.v - base.v);
  }

  const nights = sleepNights(records);
  const splitHours = nights.length >= 2 ? medianOf(nights.map((n) => n.hours)) : undefined;
  const shorter: number[] = [];
  const longer: number[] = [];
  if (splitHours !== undefined)
    for (const night of nights) {
      const firstCarb = carbTimes.find((t) => t > night.end);
      const limit = Math.min(night.end + 2 * HOUR_MS, firstCarb === undefined ? Infinity : firstCarb - 1);
      const morning = between(night.end - 1, limit)[0];
      if (morning) (night.hours < splitHours ? shorter : longer).push(morning.v);
    }

  const enough = (deltas: number[]) => deltas.length >= ASSOCIATION_MIN_PAIRS;
  const shorterMedian = medianOf(shorter);
  const longerMedian = medianOf(longer);
  return {
    carbs: { n: carbDeltas.length, value: enough(carbDeltas) ? medianOf(carbDeltas) : undefined },
    activity: { n: activityDeltas.length, value: enough(activityDeltas) ? medianOf(activityDeltas) : undefined },
    sleep: {
      shorter: shorter.length,
      longer: longer.length,
      splitHours,
      value:
        shorter.length >= 3 && longer.length >= 3 && shorterMedian !== undefined && longerMedian !== undefined
          ? shorterMedian - longerMedian
          : undefined,
    },
  };
}
