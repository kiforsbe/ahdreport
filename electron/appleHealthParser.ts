import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { HealthData, HealthRecord, Metric } from "../src/shared/types.js";

const typeMap: Record<string, Metric> = {
  HKQuantityTypeIdentifierBodyMass: "weight",
  HKQuantityTypeIdentifierHeartRate: "heartRate",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
  HKQuantityTypeIdentifierBloodPressureSystolic: "bloodPressureSystolic",
  HKQuantityTypeIdentifierBloodPressureDiastolic: "bloodPressureDiastolic",
  HKQuantityTypeIdentifierBodyTemperature: "bodyTemperature",
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergy",
  HKQuantityTypeIdentifierAppleExerciseTime: "exerciseTime",
  HKQuantityTypeIdentifierDistanceWalkingRunning: "distance",
  HKCategoryTypeIdentifierSleepAnalysis: "sleep",
  HKQuantityTypeIdentifierWalkingSpeed: "walkingSpeed",
  HKQuantityTypeIdentifierWalkingStepLength: "stepLength",
  HKQuantityTypeIdentifierWalkingAsymmetryPercentage: "walkingAsymmetry",
  HKQuantityTypeIdentifierWalkingDoubleSupportPercentage: "doubleSupport",
  HKQuantityTypeIdentifierStairAscentSpeed: "stairAscentSpeed",
  HKQuantityTypeIdentifierStairDescentSpeed: "stairDescentSpeed",
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: "sixMinuteWalk",
  HKClinicalTypeIdentifierMedicationRecord: "medication",
};

function attribute(x: unknown): Record<string, string> {
  return (x && typeof x === "object" ? x : {}) as Record<string, string>;
}
function sleepHours(start: string, end: string): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);
}

export async function parseAppleHealthExport(
  file: Buffer,
  fileName: string,
): Promise<HealthData> {
  let xml: string;
  if (fileName.toLowerCase().endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const exportFile = Object.values(zip.files).find((entry) =>
      /(^|\/)export\.xml$/i.test(entry.name),
    );
    if (!exportFile)
      throw new Error("This ZIP does not contain Apple Health export.xml.");
    xml = await exportFile.async("text");
  } else xml = file.toString("utf8");
  if (!xml.includes("<HealthData"))
    throw new Error("The selected file is not a valid Apple Health export.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  }).parse(xml);
  const rows = parsed?.HealthData?.Record ?? [];
  const records: HealthRecord[] = [];
  const seen = new Set<string>();
  let unsupported = 0;
  for (const raw of Array.isArray(rows) ? rows : [rows]) {
    const r = attribute(raw);
    const metric = typeMap[r.type];
    if (!metric) {
      unsupported++;
      continue;
    }
    const start = r.startDate;
    const end = r.endDate || start;
    const value = metric === "sleep" ? sleepHours(start, end) : Number(r.value);
    const timestamp = Date.parse(start);
    if (!start || !Number.isFinite(timestamp) || !Number.isFinite(value))
      continue;
    const date = new Date(timestamp).toISOString();
    const unit = metric === "sleep" ? "hr" : r.unit || "";
    const key = `${metric}|${date}|${value}|${unit}|${r.sourceName || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      metric,
      date,
      value,
      unit,
      source: r.sourceName,
      category: metric === "sleep" ? r.value : undefined,
    });
  }
  records.sort((a, b) => a.date.localeCompare(b.date));
  const dates = records.map((r) => r.date);
  return {
    records,
    diagnostics: {
      fileName,
      imported: records.length,
      unsupported,
      earliest: dates[0],
      latest: dates.at(-1),
      warnings: records.some((r) => r.metric === "medication")
        ? []
        : ["No supported medication records were found in this export."],
    },
  };
}
