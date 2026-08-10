import type { HealthData } from "../shared/types";
import {
  bpDerived,
  bpPeriodAverage,
  bpCategorySwedish,
  bpCategoryColorsSwedish,
  format,
} from "../report";

export function BpHypertensionWarning({
  records,
}: {
  records: HealthData["records"];
}) {
  const periodAverage = bpPeriodAverage(bpDerived(records));
  if (!periodAverage) return null;
  const periodCategory = bpCategorySwedish(
    periodAverage.systolic,
    periodAverage.diastolic,
  );
  const color = bpCategoryColorsSwedish[periodCategory];
  return (
    <div className="bp-section-warning" style={{ borderColor: color }}>
      <span>Period average</span>
      <strong style={{ color }}>
        {format(periodAverage.systolic, "", 0)}/
        {format(periodAverage.diastolic, "", 0)} mmHg — {periodCategory}
      </strong>
      <small>
        Approximates the Swedish (ESC/ESH) home-monitoring diagnostic
        threshold; not a clinical diagnosis.
      </small>
    </div>
  );
}
