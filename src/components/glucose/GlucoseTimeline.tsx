import { memo, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { HealthRecord } from "../../shared/types";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import { formatMmol, glucoseColors, shortDate, timeOfDay, type GlucoseRange, type GlucoseAxis } from "../../glucose";
import { glucoseHeatmapBand, glucoseHeatmapLegend, glucoseHeatmapModel, heatmapTextColor, HEATMAP_SCHEMES, type GlucoseHourCell, type HeatmapChoice, type HeatmapScheme } from "../../glucoseHeatmap";

const TOP = 24, HOUR_HEIGHT = 12, RIGHT = 2, LANE_HEIGHT = 27;
const LANES = ["Carbohydrates", "Insulin", "Activity", "Sleep"];
const UNITS = ["g", "IU", "min", "h"];
const LANE_COLORS = [glucoseColors.carbs, glucoseColors.insulin, glucoseColors.activity, glucoseColors.sleep];
const hourLabel = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00${hour >= 24 ? " +1" : ""}`;
const fillFor = (value: number, range?: GlucoseRange) => `var(--heatmap-band-${glucoseHeatmapBand(value, range)})`;

function CellMark({ cell, x, y, width, height, bandRange }: { cell?: GlucoseHourCell; x: number; y: number; width: number; height: number; bandRange?: GlucoseRange }) {
  return <>
    <rect className="glucose-hour-fill" x={x} y={y} width={width} height={height} fill={cell ? fillFor(cell.mean, bandRange) : "var(--heatmap-empty)"} />
    {cell?.above && <rect className="glucose-hour-above" x={x} y={y} width={width} height={2} fill={`var(--heatmap-band-${bandRange ? 6 : 7})`} />}
    {cell?.below && <rect className="glucose-hour-below" x={x} y={y + height - 2} width={width} height={2} fill="var(--heatmap-band-0)" />}
  </>;
}

export const GlucoseTimeline = memo(function GlucoseTimeline({ records, contextRecords = records, range, from, to }: {
  records: HealthRecord[]; contextRecords?: HealthRecord[]; range: GlucoseRange;
  from: string; to: string; continuous: boolean; axis?: GlucoseAxis;
}) {
  const printLayout = useContext(PrintLayoutContext);
  const model = useMemo(() => glucoseHeatmapModel(records, contextRecords, range, from, to), [records, contextRecords, range, from, to]);
  const [choice, setChoice] = useState<HeatmapChoice>("distinct-light");
  const [selected, setSelected] = useState<{ date: string; hour: number }>();
  const [popup, setPopup] = useState<{ left: number; top: number }>();
  const [width, setWidth] = useState(760);
  const host = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const measureWidth = useCallback(() => {
    const w = host.current?.querySelector(".glucose-heatmap-explorer")?.getBoundingClientRect().width;
    if (w !== undefined && w > 150) setWidth(w);
  }, []);
  // Refresh retained geometry before paint as well as on observer notifications.
  useLayoutEffect(measureWidth);
  useEffect(() => {
    const element = host.current?.querySelector<HTMLDivElement>(".glucose-heatmap-explorer"); if (!element) return;
    const observer = new ResizeObserver(measureWidth); observer.observe(element);
    return () => observer.disconnect();
  }, [!!model, measureWidth]);
  if (!model) return null;
  const [family, chosenTheme] = choice.split("-") as [HeatmapScheme, "light" | "dark"];
  const variant = printLayout ? "light" : chosenTheme, scheme = HEATMAP_SCHEMES[family];
  const bandRange = family === "target" ? range : undefined;
  const legendBands = glucoseHeatmapLegend(bandRange).reverse();
  const variables: Record<string, string> = {};
  scheme.light.forEach((value, i) => {
    variables[`--heatmap-band-${i}`] = scheme[variant][i];
    variables[`--heatmap-text-${i}`] = heatmapTextColor(scheme[variant][i]);
    variables[`--heatmap-print-band-${i}`] = value;
    variables[`--heatmap-print-text-${i}`] = heatmapTextColor(value);
  });
  const { days, hourEnd } = model;
  const left = 104;
  // Screen columns stay at least two pixels wide. Print fits every column to paper.
  // Match SVG viewport pixels to its coordinates so resizing cannot centre it away from the HTML legend.
  const chartWidth = printLayout ? width : Math.max(width, left + days.length * 2 + RIGHT);
  const plotWidth = chartWidth - left - RIGHT, dayWidth = plotWidth / days.length;
  const plotBottom = TOP + (hourEnd - 6) * HOUR_HEIGHT;
  const laneTop = plotBottom + 38, height = laneTop + 5 * LANE_HEIGHT + 8;
  const x = (index: number) => left + index * dayWidth;
  const y = (hour: number) => TOP + (hourEnd - hour) * HOUR_HEIGHT;
  const firstIndex = days.findIndex(d => d.cells.size);
  const requestedIndex = selected ? days.findIndex(d => d.date === selected.date) : -1;
  const activeIndex = requestedIndex >= 0 ? requestedIndex : Math.max(0, firstIndex);
  const day = days[activeIndex];
  const activeHour = Math.max(6, Math.min(hourEnd - 1, requestedIndex >= 0 ? selected!.hour : Math.min(...day.cells.keys())));
  const cell = day.cells.get(activeHour);
  const describeCell = (date: string, c: GlucoseHourCell) => `${shortDate(date)} · ${hourLabel(c.hour)}–${hourLabel(c.hour + 1)} · Mean ${formatMmol(c.mean)} mmol/L · ${c.readings.length} ${c.readings.length === 1 ? "reading" : "readings"} · min–max ${formatMmol(c.min)}–${formatMmol(c.max)}`;
  const positionPopup = (clientX: number, clientY: number) => {
    const box = host.current!.getBoundingClientRect(), available = box.width || width;
    const popupWidth = Math.min(300, available - 16);
    setPopup({ left: Math.max(8, Math.min(available - popupWidth - 8, clientX - box.left + 12)), top: Math.max(0, clientY - box.top + 12) });
  };
  const showCellPopup = (index: number, hour: number) => {
    const box = host.current!.querySelector("svg")!.getBoundingClientRect();
    positionPopup(box.left + (x(index) + dayWidth / 2) / chartWidth * box.width, box.top + (y(hour + 1) + HOUR_HEIGHT / 2) / height * box.height);
  };
  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect(); if (!box.width || !box.height) return;
    const px = (event.clientX - box.left) / box.width * chartWidth, py = (event.clientY - box.top) / box.height * height;
    const index = Math.max(0, Math.min(days.length - 1, Math.floor((px - left) / dayWidth)));
    const hour = Math.max(6, Math.min(hourEnd - 1, Math.floor(hourEnd - (py - TOP) / HOUR_HEIGHT)));
    if (popup && selected?.date === days[index].date && selected.hour === hour) return;
    setSelected(previous => previous?.date === days[index].date && previous.hour === hour ? previous : { date: days[index].date, hour });
    positionPopup(event.clientX, event.clientY);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { setPopup(undefined); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : Math.max(0, Math.min(days.length - 1, activeIndex + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0)));
    const hour = Math.max(6, Math.min(hourEnd - 1, activeHour + (event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0)));
    setSelected({ date: days[index].date, hour });
    const explorer = event.currentTarget;
    if (explorer.clientWidth) {
      if (index === 0) explorer.scrollLeft = 0;
      else if (x(index) < explorer.scrollLeft) explorer.scrollLeft = x(index);
      else if (x(index + 1) > explorer.scrollLeft + explorer.clientWidth) explorer.scrollLeft = x(index + 1) - explorer.clientWidth;
    }
    showCellPopup(index, hour);
  };
  const maxTotals = LANES.map((_, lane) => Math.max(1, ...days.map(d => d.totals[lane] ?? 0)));
  const tickCount = width < 430 ? 4 : 7;
  const dateTicks = [...new Set(Array.from({ length: Math.min(tickCount, days.length) }, (_, i) => Math.round(i * (days.length - 1) / Math.max(1, Math.min(tickCount, days.length) - 1))))];
  const hourTicks = Array.from({ length: Math.floor((hourEnd - 6) / 2) + 1 }, (_, i) => 6 + i * 2);
  if (hourTicks.at(-1) !== hourEnd) { hourTicks.pop(); hourTicks.push(hourEnd); }
  return <div ref={host} className="glucose-chart-wrap glucose-heatmap" data-scheme={family} data-palette-variant={variant} style={variables as CSSProperties}>
    <div className="glucose-heatmap-heading">
      <h3>Glucose and context</h3>
      {!printLayout && <select className="glucose-heatmap-selector" aria-label="Heatmap colour scheme" value={choice} onChange={event => { setChoice(event.target.value as HeatmapChoice); setPopup(undefined); }}>
        {(Object.keys(HEATMAP_SCHEMES) as HeatmapScheme[]).flatMap(key => (["light", "dark"] as const).map(mode =>
          <option key={`${key}-${mode}`} value={`${key}-${mode}`}>{HEATMAP_SCHEMES[key].name} · {mode === "light" ? "light palette" : "dark palette"}</option>))}
      </select>}
    </div>
    <div className="glucose-heatmap-body">
    <div className="glucose-heatmap-explorer" style={{ width: "100%" }} role="group" aria-label="Explore hourly glucose with arrow keys: left/right for dates, up/down for hours" aria-describedby={popup && !printLayout ? popupId : undefined} tabIndex={printLayout ? -1 : 0} onKeyDown={printLayout ? undefined : onKey} onFocus={printLayout ? undefined : () => showCellPopup(activeIndex, activeHour)} onBlur={() => setPopup(undefined)}>
    <div className="glucose-heatmap-canvas" style={{ width: printLayout ? "100%" : chartWidth }}>
      <aside className="glucose-heatmap-legend" aria-label="Hourly mean colour legend" style={{ left: 0, width: bandRange ? 48 : 42 }}>
        <small style={{ height: TOP }}>mmol/L</small>
        <div style={{ height: plotBottom - TOP, gridTemplateRows: `repeat(${legendBands.length}, minmax(0, 1fr))` }}>{legendBands.map(({ index, label }) =>
          <span key={index} style={{ background: `var(--heatmap-band-${index})`, color: `var(--heatmap-text-${index})`, fontSize: bandRange ? 9 : undefined }}>{label}</span>
        )}</div>
      </aside>
      <svg viewBox={`0 0 ${chartWidth} ${height}`} style={{ height, width: printLayout ? "100%" : chartWidth }} role="img" aria-label="Hourly glucose heatmap with fasting and daily carbohydrate, insulin, activity and sleep lanes" data-days={days.length} data-hour-end={hourEnd}>
        <desc>Dates horizontally, hours ascending from 06:00 at the bottom. Each occupied cell is the mean of recorded samples in that hour. Empty hours and missing days are blank, not interpolated. Repeated daylight-saving clock hours share a cell.</desc>
        <text className="glucose-heatmap-label" x={left} y={13}>Time of day ↑</text>
        {Array.from({ length: hourEnd - 6 }, (_, i) => i + 6).map(hour => <g key={hour}>
          <rect x={left} y={y(hour + 1)} width={plotWidth} height={HOUR_HEIGHT} fill={hour % 2 ? "var(--heatmap-paper)" : "var(--heatmap-empty)"} />
          <line x1={left} x2={chartWidth - RIGHT} y1={y(hour)} y2={y(hour)} stroke="var(--heatmap-rule)" />
        </g>)}
        {hourTicks.map(hour => <text className="glucose-hour-axis" key={hour} x={left - 8} y={y(hour) + 4} textAnchor="end">{hourLabel(hour)}</text>)}
        {days.map((d, i) => [...d.cells.values()].map(c => <g key={`${d.date}-${c.hour}`} className="glucose-hour-cell" data-day={d.date} data-hour={c.hour} data-mean={c.mean} aria-label={describeCell(d.date, c)}>
          <title>{describeCell(d.date, c)}</title>
          <CellMark cell={c} bandRange={bandRange} x={printLayout ? x(i) : Math.round(x(i))} y={y(c.hour + 1) + 1} width={printLayout ? dayWidth : Math.round(x(i + 1)) - Math.round(x(i))} height={HOUR_HEIGHT - 1} />
        </g>))}
        <rect x={left} y={TOP} width={plotWidth} height={plotBottom - TOP} fill="none" stroke="var(--heatmap-rule)" />
        {dateTicks.map(i => <text key={i} x={i === days.length - 1 && i > 0 ? x(i + 1) : x(i)} y={plotBottom + 19} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}>{shortDate(days[i].date)}</text>)}
        <text x={0} y={laneTop + 15}>Fasting</text>
        {days.map((d, i) => d.fasting && <g className="glucose-fasting-marker" key={d.date} aria-label={`${shortDate(d.date)} · ${d.fasting.confirmedFasting ? "Tagged" : "Assumed"} fasting ${formatMmol(d.fasting.reading.value)} at ${timeOfDay(d.fasting.reading.date)}`}>
          <title>{`${shortDate(d.date)} · ${d.fasting.confirmedFasting ? "Tagged" : "Assumed"} fasting ${formatMmol(d.fasting.reading.value)} at ${timeOfDay(d.fasting.reading.date)}`}</title>
          <rect x={printLayout ? x(i) : Math.round(x(i))} y={laneTop + 6} width={printLayout ? dayWidth : Math.round(x(i + 1)) - Math.round(x(i))} height={9} fill={fillFor(d.fasting.reading.value, bandRange)} />
        </g>)}
        {LANES.map((name, k) => <g key={name}>
          <text x={0} y={laneTop + (k + 1) * LANE_HEIGHT + 18}>{name}</text>
          <line x1={left} x2={chartWidth - RIGHT} y1={laneTop + (k + 2) * LANE_HEIGHT - 3} y2={laneTop + (k + 2) * LANE_HEIGHT - 3} stroke="var(--heatmap-rule)" />
          {days.map((d, i) => {
            const total = d.totals[k]; if (total === undefined) return null;
            const h = total / maxTotals[k] * 15;
            return <rect className="glucose-context-bar" key={d.date} x={x(i)} y={laneTop + (k + 2) * LANE_HEIGHT - 4 - h} width={dayWidth} height={h} fill={LANE_COLORS[k]}><title>{`${shortDate(d.date)} · ${name} ${formatMmol(total)} ${UNITS[k]}`}</title></rect>;
          })}
        </g>)}
        {!printLayout && <>
          {popup && <rect className="glucose-hour-selection" x={x(activeIndex)} y={y(activeHour + 1)} width={dayWidth} height={HOUR_HEIGHT} fill="none" stroke="var(--heatmap-ink)" />}
          <rect className="glucose-chart-hit" aria-hidden="true" x={left} y={TOP} width={plotWidth} height={plotBottom - TOP} fill="transparent" onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setPopup(undefined)} />
        </>}
      </svg>
    </div>
    </div>
    </div>
    {!printLayout && chartWidth > width && <small className="glucose-heatmap-help">Scroll horizontally to see all {days.length} days.</small>}
    <small className="glucose-heatmap-contract">Mean of recorded samples, not continuous hourly coverage. Blank = no readings. Top/bottom caps = any sample above/below the selected target.</small>
    {!printLayout && popup && <div className="glucose-heatmap-tooltip" id={popupId} role="status" style={popup}>
        <b>{`${shortDate(day.date)} · ${hourLabel(activeHour)}–${hourLabel(activeHour + 1)}`}</b>
        <span>{cell ? `Mean ${formatMmol(cell.mean)} mmol/L · ${cell.readings.length} ${cell.readings.length === 1 ? "reading" : "readings"} · min–max ${formatMmol(cell.min)}–${formatMmol(cell.max)}${cell.below || cell.above ? " · contains out-of-target sample" : ""}` : "No readings in this hour"}</span>
        {day.fasting && <span>{`${day.fasting.confirmedFasting ? "Tagged" : "Assumed"} fasting ${formatMmol(day.fasting.reading.value)} at ${timeOfDay(day.fasting.reading.date)}`}</span>}
        {day.totals.some(v => v !== undefined) && <span>{day.totals.map((v, k) => v === undefined ? null : `${LANES[k]} ${formatMmol(v)} ${UNITS[k]}`).filter(Boolean).join(" · ")}</span>}
    </div>}
  </div>;
});
