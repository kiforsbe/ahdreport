import type { HealthRecord } from "./shared/types";
import { activitySessions, glucoseMorningReading, glucoseReadings, glucoseTrackingDay, glucoseTrackingRecords, localDay, sleepNights, type GlucoseRange } from "./glucose";

export interface GlucoseHourCell {
  hour: number; readings: HealthRecord[]; mean: number; min: number; max: number; below: boolean; above: boolean;
}
export interface GlucoseHeatmapDay {
  date: string; cells: Map<number, GlucoseHourCell>;
  fasting?: ReturnType<typeof glucoseMorningReading>;
  totals: (number | undefined)[];
}
/** Local clock-hour bins, deliberately not elapsed hours on DST days. */
export function glucoseHeatmapModel(records: HealthRecord[], contextRecords: HealthRecord[], range: GlucoseRange, from: string, to: string) {
  const selected = glucoseTrackingRecords(records, from, to);
  const readings = glucoseReadings(selected).filter(r => Number.isFinite(r.value) && r.value > 0 && Number.isFinite(Date.parse(r.date)));
  if (!readings.length) return undefined;
  const dates = readings.map(r => glucoseTrackingDay(r.date)).sort();
  const first = from || dates[0], last = to || dates.at(-1)!;
  const days: GlucoseHeatmapDay[] = [];
  const cursor = new Date(`${first}T12:00:00`);
  while (localDay(cursor.getTime()) <= last) {
    days.push({ date: localDay(cursor.getTime()), cells: new Map(), totals: Array(4).fill(undefined) });
    cursor.setDate(cursor.getDate() + 1);
  }
  const byDate = new Map(days.map(d => [d.date, d]));
  let hourEnd = 22;
  for (const r of readings) {
    const day = byDate.get(glucoseTrackingDay(r.date)); if (!day) continue;
    const clock = new Date(r.date).getHours(), hour = clock < 6 ? clock + 24 : clock;
    let cell = day.cells.get(hour);
    if (!cell) {
      cell = { hour, readings: [], mean: 0, min: Infinity, max: -Infinity, below: false, above: false };
      day.cells.set(hour, cell);
    }
    cell.readings.push(r); cell.mean += r.value;
    cell.min = Math.min(cell.min, r.value); cell.max = Math.max(cell.max, r.value);
    cell.below ||= r.value < range.low; cell.above ||= r.value > range.high;
    // A sample at 22:00 belongs in 22:00–23:00: never clip an occupied hour.
    hourEnd = Math.max(hourEnd, hour + 1);
  }
  const mornings = new Map<string, HealthRecord[]>();
  for (const r of glucoseReadings(contextRecords)) {
    const date = localDay(r.date); if (!byDate.has(date)) continue;
    const group = mornings.get(date) ?? []; group.push(r); mornings.set(date, group);
  }
  for (const day of days) {
    for (const cell of day.cells.values()) cell.mean /= cell.readings.length;
    day.fasting = glucoseMorningReading(mornings.get(day.date) ?? [], day.date);
  }
  const add = (date: string, lane: number, value: number) => {
    const day = byDate.get(date);
    if (day && Number.isFinite(value)) day.totals[lane] = (day.totals[lane] ?? 0) + value;
  };
  for (const r of selected) {
    if (r.metric === "carbs") add(glucoseTrackingDay(r.date), 0, r.value);
    if (r.metric === "insulinDelivery") add(glucoseTrackingDay(r.date), 1, r.value);
  }
  for (const session of activitySessions(selected)) add(glucoseTrackingDay(session.start), 2, session.minutes);
  // Sleep belongs to its wake date; build complete nights before date filtering.
  for (const night of sleepNights(contextRecords)) add(night.date, 3, night.hours);
  return { days, hourEnd };
}
export const HEATMAP_BAND_LABELS = ["<3.9", "3.9–5", "5–6", "6–7", "7–8", "8–9", "9–10", ">10"];
// Reference-weighted visual anchor, not a diagnostic threshold or a personal target.
// Clip the anchor to custom bounds, then split each remaining tail into two shades.
const targetHeatmapEdges = (range: GlucoseRange) => {
  const clamp = (value: number) => Math.max(range.low, Math.min(range.high, value));
  const lightLow = clamp(5), lightHigh = clamp(6);
  return [range.low, (range.low + lightLow) / 2, lightLow, lightHigh, (lightHigh + range.high) / 2, range.high];
};

export function glucoseHeatmapLegend(range?: GlucoseRange) {
  if (!range) return HEATMAP_BAND_LABELS.map((label, index) => ({ label, index }));
  const edges = targetHeatmapEdges(range);
  const labelValue = (value: number) => Number(value.toPrecision(12));
  return [
    { index: 0, label: `<${range.low}` },
    ...edges.slice(0, -1).flatMap((low, i) => low < edges[i + 1]
      ? [{ index: i + 1, label: `${labelValue(low)}–${labelValue(edges[i + 1])}` }] : []),
    { index: 6, label: `>${range.high}` },
  ];
}

export function glucoseHeatmapBandLabels(range?: GlucoseRange) {
  return glucoseHeatmapLegend(range).map(band => band.label);
}

// Existing palettes retain absolute bands; the target palette follows selected bounds.
export function glucoseHeatmapBand(value: number, range?: GlucoseRange) {
  if (range) {
    if (value < range.low) return 0;
    if (value > range.high) return 6;
    const edges = targetHeatmapEdges(range);
    for (let i = 1; i <= 5; i++) {
      if (edges[i - 1] < edges[i] && (value < edges[i] || edges[i] === range.high)) return i;
    }
  }
  return value < 3.9 ? 0 : value < 5 ? 1 : value < 6 ? 2 : value < 7 ? 3 : value < 8 ? 4 : value < 9 ? 5 : value <= 10 ? 6 : 7;
}
export const HEATMAP_SCHEMES = {
  distinct: { name: "Distinct bands",
    light: ["#5e2d79", "#2158a8", "#58cfe3", "#19784e", "#f0d743", "#aa5816", "#e88ab4", "#ae302d"],
    dark: ["#6a3687", "#2e65b5", "#75ddef", "#21815a", "#f5df63", "#b05c1b", "#ef9bc3", "#bd3a35"] },
  cool: { name: "Cool-to-warm",
    light: ["#8756aa", "#355f9f", "#34a2c2", "#35aa83", "#a4c34c", "#efcd55", "#ef9f45", "#bf4b35"],
    dark: ["#8a59ad", "#426cab", "#54bbd5", "#55c29b", "#bfd66d", "#f4d879", "#f6b360", "#b84c38"] },
  blue: { name: "Blue scale",
    light: ["#b32662", "#c1d9f5", "#8bb6e5", "#5b92ce", "#3674b5", "#225790", "#183d6a", "#a65c05"],
    dark: ["#f2a0bd", "#b8d5ff", "#8ab5ee", "#6599d8", "#4680ba", "#285d99", "#1d4679", "#ffc16e"] },
  target: { name: "Target-relative",
    light: ["#c62828", "#005c59", "#259e97", "#a1e6d6", "#259e97", "#005c59", "#c62828"],
    dark: ["#f15b64", "#087b75", "#31bfb2", "#b5f3de", "#31bfb2", "#087b75", "#f15b64"] },
};
export type HeatmapScheme = keyof typeof HEATMAP_SCHEMES;
export type HeatmapChoice = `${HeatmapScheme}-${"light" | "dark"}`;
export function heatmapTextColor(fill: string) {
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const level = luminance(fill);
  return (1.05 / (level + .05)) >= ((level + .05) / .05) ? "#ffffff" : "#000000";
}
