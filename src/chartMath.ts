export const DEFAULT_COLLAPSE_THRESHOLD_PX = 15;
export const DEFAULT_GRID_TICK_COUNT = 5;
export const DEFAULT_GRID_MINOR_DIVISIONS = 5;
export const DEFAULT_GRID_COLOR = "#dbe5fb";
export const DEFAULT_SHADE_COLOR = "#4263eb";
// Rounds a raw step (range / targetCount) up to a "nice" 1/2/5 x 10^n value, the way chart axes pick tick spacing.
export function niceStep(range: number, targetCount: number) {
  if (range <= 0) return 1;
  const roughStep = range / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceResidual =
    residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return niceResidual * magnitude;
}
export function ticksAtStep(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step)
    ticks.push(v);
  return ticks;
}
export function niceTicks(min: number, max: number, targetCount: number): number[] {
  if (!(max > min)) return [];
  return ticksAtStep(min, max, niceStep(max - min, targetCount));
}
// Lifts a chart's y-axis floor off zero when every value sits well above it, so a
// tightly clustered series (e.g. weight, heart rate) isn't squashed into a thin band
// at the top. Falls back to zero whenever the data itself reaches zero or below,
// since zero is meaningful there and there is no "common threshold" to lift off of.
export function niceAxisMin(
  min: number,
  max: number,
  targetCount = DEFAULT_GRID_TICK_COUNT,
) {
  if (!(max > min) || min <= 0) return 0;
  const step = niceStep(max - min, targetCount);
  return Math.max(0, Math.floor(min / step) * step);
}
