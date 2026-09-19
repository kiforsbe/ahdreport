import { useContext } from "react";
import { PrintLayoutContext } from "../../PrintLayoutContext";
import {
  type GlucosePresetId,
  type GlucoseRange,
  formatMmol,
  glucosePresetLabel,
  glucosePresets,
  glucoseRangeText,
  presetRange,
  withCustomBound,
} from "../../glucose";

export function GlucoseRangeControl({ range, onChange }: { range: GlucoseRange; onChange: (range: GlucoseRange) => void }) {
  const printLayout = useContext(PrintLayoutContext);
  if (printLayout)
    return <p className="glucose-range-print">{`Target range: ${glucosePresetLabel(range.preset)}, ${glucoseRangeText(range)}`}</p>;
  // Uncontrolled inputs commit on blur/Enter; `key` resets a rejected draft to the current value.
  const commit = (bound: "low" | "high", text: string) => {
    const next = withCustomBound(range, bound, Number(text));
    if (next !== range) onChange(next);
  };
  const boundInput = (bound: "low" | "high", label: string) => (
    <input
      key={`${bound}-${range[bound]}`}
      type="number"
      step="0.1"
      min="2"
      max="20"
      aria-label={label}
      defaultValue={range[bound]}
      onBlur={(event) => commit(bound, event.currentTarget.value)}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  );
  return (
    <div className="glucose-range-control">
      <label htmlFor="glucose-range-preset">Target range</label>
      <select
        id="glucose-range-preset"
        value={range.preset}
        onChange={(event) => onChange(presetRange(event.currentTarget.value as GlucosePresetId))}
      >
        {glucosePresets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.id === "custom" ? preset.label : `${preset.label} · ${formatMmol(preset.low)}–${formatMmol(preset.high)}`}
          </option>
        ))}
      </select>
      {range.preset === "custom" && (
        <>
          {boundInput("low", "Lower target (mmol/L)")}
          <span>–</span>
          {boundInput("high", "Upper target (mmol/L)")}
          <span>mmol/L</span>
        </>
      )}
    </div>
  );
}
