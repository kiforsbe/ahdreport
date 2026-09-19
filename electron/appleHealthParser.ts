import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type {
  HealthData,
  HealthRecord,
  Metric,
  PatientDetails,
  SymptomId,
  SymptomRecord,
} from "../src/shared/types.js";

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
  HKQuantityTypeIdentifierDietaryEnergyConsumed: "dietaryEnergy",
  HKQuantityTypeIdentifierDietaryCarbohydrates: "carbs",
  HKQuantityTypeIdentifierDietarySugar: "sugar",
  HKQuantityTypeIdentifierDietaryFiber: "fiber",
  HKQuantityTypeIdentifierDietaryProtein: "protein",
  HKQuantityTypeIdentifierDietaryFatTotal: "fat",
  HKQuantityTypeIdentifierBloodGlucose: "bloodGlucose",
  HKQuantityTypeIdentifierInsulinDelivery: "insulinDelivery",
  HKQuantityTypeIdentifierBodyMassIndex: "bodyMassIndex",
  HKQuantityTypeIdentifierBodyFatPercentage: "bodyFatPercentage",
  HKQuantityTypeIdentifierWaistCircumference: "waistCircumference",
  HKQuantityTypeIdentifierLeanBodyMass: "leanBodyMass",
  HKQuantityTypeIdentifierOxygenSaturation: "oxygenSaturation",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "heartRateVariability",
  HKQuantityTypeIdentifierVO2Max: "vo2Max",
  HKQuantityTypeIdentifierWalkingHeartRateAverage: "walkingHeartRateAverage",
  HKClinicalTypeIdentifierMedicationRecord: "medication",
};
const symptomTypeMap: Record<string, SymptomId> = {
  HKCategoryTypeIdentifierAbdominalCramps: "abdominalCramps",
  HKCategoryTypeIdentifierAcne: "acne",
  HKCategoryTypeIdentifierAppetiteChanges: "appetiteChanges",
  HKCategoryTypeIdentifierBladderIncontinence: "bladderIncontinence",
  HKCategoryTypeIdentifierBloating: "bloating",
  HKCategoryTypeIdentifierBreastPain: "breastPain",
  HKCategoryTypeIdentifierChestTightnessOrPain: "chestTightnessOrPain",
  HKCategoryTypeIdentifierChills: "chills",
  HKCategoryTypeIdentifierConstipation: "constipation",
  HKCategoryTypeIdentifierCoughing: "coughing",
  HKCategoryTypeIdentifierDiarrhea: "diarrhea",
  HKCategoryTypeIdentifierDizziness: "dizziness",
  HKCategoryTypeIdentifierDrySkin: "drySkin",
  HKCategoryTypeIdentifierFainting: "fainting",
  HKCategoryTypeIdentifierFatigue: "fatigue",
  HKCategoryTypeIdentifierFever: "fever",
  HKCategoryTypeIdentifierGeneralizedBodyAche: "generalizedBodyAche",
  HKCategoryTypeIdentifierHeadache: "headache",
  HKCategoryTypeIdentifierHeartburn: "heartburn",
  HKCategoryTypeIdentifierHotFlashes: "hotFlashes",
  HKCategoryTypeIdentifierHairLoss: "hairLoss",
  HKCategoryTypeIdentifierLossOfSmell: "lossOfSmell",
  HKCategoryTypeIdentifierLossOfTaste: "lossOfTaste",
  HKCategoryTypeIdentifierLowerBackPain: "lowerBackPain",
  HKCategoryTypeIdentifierMemoryLapse: "memoryLapse",
  HKCategoryTypeIdentifierMenstrualCramps: "menstrualCramps",
  HKCategoryTypeIdentifierMoodChanges: "moodChanges",
  HKCategoryTypeIdentifierNausea: "nausea",
  HKCategoryTypeIdentifierNightSweats: "nightSweats",
  HKCategoryTypeIdentifierPelvicPain: "pelvicPain",
  HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat:
    "rapidPoundingOrFlutteringHeartbeat",
  HKCategoryTypeIdentifierRunnyNose: "runnyNose",
  HKCategoryTypeIdentifierShortnessOfBreath: "shortnessOfBreath",
  HKCategoryTypeIdentifierSinusCongestion: "sinusCongestion",
  HKCategoryTypeIdentifierSkippedHeartbeat: "skippedHeartbeat",
  HKCategoryTypeIdentifierSoreThroat: "soreThroat",
  HKCategoryTypeIdentifierSleepChanges: "sleepChanges",
  HKCategoryTypeIdentifierVaginalDryness: "vaginalDryness",
  HKCategoryTypeIdentifierVomiting: "vomiting",
  HKCategoryTypeIdentifierWheezing: "wheezing",
};

const plausibleRanges: Partial<
  Record<Metric, Partial<Record<string, [number, number]>>>
> = {
  heartRate: { "count/min": [20, 300] },
  restingHeartRate: { "count/min": [20, 300] },
  bloodPressureSystolic: { mmHg: [60, 250] },
  bloodPressureDiastolic: { mmHg: [30, 150] },
  bodyTemperature: { degC: [30, 45], degF: [86, 113] },
  weight: { kg: [20, 300], lb: [44, 660] },
  bloodGlucose: { "mmol/L": [1, 40] },
  insulinDelivery: { IU: [0, 300] },
  oxygenSaturation: { "%": [50, 100] },
  respiratoryRate: { "count/min": [4, 60] },
  heartRateVariability: { ms: [1, 300] },
  bodyMassIndex: { count: [10, 80] },
  bodyFatPercentage: { "%": [2, 75] },
  waistCircumference: { cm: [40, 200], in: [16, 80] },
  leanBodyMass: { kg: [10, 200], lb: [22, 440] },
  vo2Max: { "mL/min·kg": [5, 90] },
  walkingHeartRateAverage: { "count/min": [30, 220] },
};
function isPlausible(metric: Metric, value: number, unit: string): boolean {
  if (value < 0) return false;
  if (metric === "sleep") return value <= 24;
  const bounds = plausibleRanges[metric]?.[unit];
  return !bounds || (value >= bounds[0] && value <= bounds[1]);
}

const MG_PER_MMOL_GLUCOSE = 18.0156;
// Apple stores these as fractions (0.97) with unit "%".
const fractionPercentMetrics: Metric[] = ["oxygenSaturation", "bodyFatPercentage"];
function normalizeQuantity(
  metric: Metric,
  value: number,
  unit: string,
): { value: number; unit: string } {
  if (metric === "bloodGlucose") {
    if (unit === "mg/dL") return { value: value / MG_PER_MMOL_GLUCOSE, unit: "mmol/L" };
    // The mmol unit embeds the molar mass, e.g. "mmol<180.15588000005408>/L".
    if (/^mmol(<[\d.]+>)?\/L$/.test(unit)) return { value, unit: "mmol/L" };
  }
  if (fractionPercentMetrics.includes(metric) && unit === "%" && value <= 1)
    return { value: value * 100, unit };
  return { value, unit };
}
// Only these two metrics read MetadataEntry children; every other record
// skips the work so large exports are not slowed down.
const metadataCategories: Partial<
  Record<Metric, { key: string; values: Record<string, string> }>
> = {
  bloodGlucose: {
    key: "HKBloodGlucoseMealTime",
    values: { "1": "beforeMeal", "2": "afterMeal" },
  },
  insulinDelivery: {
    key: "HKInsulinDeliveryReason",
    values: { "1": "basal", "2": "bolus" },
  },
};
function metadataCategory(metric: Metric, raw: unknown): string | undefined {
  const spec = metadataCategories[metric];
  if (!spec) return undefined;
  const entries = (raw && typeof raw === "object"
    ? (raw as { MetadataEntry?: unknown }).MetadataEntry
    : undefined);
  const entry = nodes(entries)
    .map(attribute)
    .find((candidate) => candidate.key === spec.key);
  return entry ? spec.values[String(entry.value)] : undefined;
}

function attribute(x: unknown): Record<string, string> {
  return (x && typeof x === "object" ? x : {}) as Record<string, string>;
}
function sleepHours(start: string, end: string): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);
}
function nodes(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}
function text(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number")
    return String(value).trim() || undefined;
  const node = attribute(value);
  return typeof node["#text"] === "string" ? node["#text"].trim() || undefined : undefined;
}
function parseClinicalPatient(xml: string): PatientDetails | undefined {
  const document = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
  }).parse(xml)?.ClinicalDocument;
  const patientRole = document?.recordTarget?.patientRole;
  const patient = patientRole?.patient;
  if (!patientRole || !patient) return undefined;
  const name = attribute(patient.name);
  const fullName = [
    text(patient.name),
    ...nodes(name.prefix).map(text),
    ...nodes(name.given).map(text),
    ...nodes(name.family).map(text),
  ]
    .filter((part): part is string => !!part)
    .join(" ");
  const identifiers = nodes(patientRole.id)
    .map(attribute)
    .map((id) => id.extension)
    .filter((id): id is string => typeof id === "string" && !!id);
  const identifier =
    identifiers.find((id) => /^\d{8}[-+]?\d{4}$/.test(id)) ?? identifiers[0];
  const birthTime = attribute(patient.birthTime).value;
  const sex = attribute(patient.administrativeGenderCode).displayName ||
    attribute(patient.administrativeGenderCode).code;
  const details = {
    name: fullName || undefined,
    identifier,
    dateOfBirth: birthTime || undefined,
    sex: sex || undefined,
  };
  return Object.values(details).some(Boolean) ? details : undefined;
}
async function readClinicalPatient(
  file: JSZip.JSZipObject,
): Promise<PatientDetails | undefined> {
  return new Promise((resolve, reject) => {
    const stream = file.nodeStream() as NodeJS.ReadableStream & {
      destroy(error?: Error): void;
    };
    let source = "";
    let settled = false;
    const finish = (patient: PatientDetails | undefined) => {
      if (settled) return;
      settled = true;
      stream.destroy();
      resolve(patient);
    };
    stream.on("data", (chunk: Buffer) => {
      source += chunk.toString("utf8");
      const start = source.search(/<(?:[\w.-]+:)?recordTarget\b/i);
      const end = source.match(/<\/(?:[\w.-]+:)?recordTarget\s*>/i);
      if (start === -1 || end?.index === undefined) return;
      const fragment = source.slice(start, end.index + end[0].length);
      try {
        finish(parseClinicalPatient(`<ClinicalDocument>${fragment}</ClinicalDocument>`));
      } catch (error) {
        if (!settled) {
          settled = true;
          stream.destroy();
          reject(error);
        }
      }
    });
    stream.on("end", () => finish(undefined));
    stream.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

export async function parseAppleHealthExport(
  file: Buffer,
  fileName: string,
): Promise<HealthData> {
  let xml: string;
  let clinicalFile: JSZip.JSZipObject | undefined;
  if (fileName.toLowerCase().endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const exportFile = Object.values(zip.files).find((entry) =>
      /(^|\/)export\.xml$/i.test(entry.name),
    );
    if (!exportFile)
      throw new Error("This ZIP does not contain Apple Health export.xml.");
    xml = await exportFile.async("text");
    clinicalFile = Object.values(zip.files).find(
      (entry) =>
        !entry.dir &&
        /(^|\/)(?:export_)?(?:cda|clinical)[\w.-]*\.xml$/i.test(entry.name),
    );
  } else xml = file.toString("utf8");
  if (!xml.includes("<HealthData"))
    throw new Error("The selected file is not a valid Apple Health export.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  }).parse(xml);
  const rows = parsed?.HealthData?.Record ?? [];
  const records: HealthRecord[] = [];
  const symptoms: SymptomRecord[] = [];
  const seen = new Set<string>();
  const seenSymptoms = new Set<string>();
  let unsupported = 0;
  let implausible = 0;
  for (const raw of Array.isArray(rows) ? rows : [rows]) {
    const r = attribute(raw);
    const metric = typeMap[r.type];
    const symptom = symptomTypeMap[r.type];
    if (symptom) {
      const startTimestamp = Date.parse(r.startDate);
      const endTimestamp = Date.parse(r.endDate || r.startDate);
      if (!r.startDate || !Number.isFinite(startTimestamp)) continue;
      const start = new Date(startTimestamp).toISOString();
      const end = Number.isFinite(endTimestamp)
        ? new Date(endTimestamp).toISOString()
        : start;
      const value = r.value || "";
      const key = `${symptom}|${start}|${end}|${value}|${r.sourceName || ""}`;
      if (seenSymptoms.has(key)) continue;
      seenSymptoms.add(key);
      symptoms.push({
        symptom,
        start,
        end,
        value,
        source: r.sourceName,
      });
      continue;
    }
    if (!metric) {
      unsupported++;
      continue;
    }
    const start = r.startDate;
    const end = r.endDate || start;
    const rawValue = metric === "sleep" ? sleepHours(start, end) : Number(r.value);
    const timestamp = Date.parse(start);
    if (!start || !Number.isFinite(timestamp) || !Number.isFinite(rawValue))
      continue;
    const date = new Date(timestamp).toISOString();
    const { value, unit } = normalizeQuantity(
      metric,
      rawValue,
      metric === "sleep" ? "hr" : r.unit || "",
    );
    if (!isPlausible(metric, value, unit)) {
      implausible++;
      continue;
    }
    const key = `${metric}|${date}|${value}|${unit}|${r.sourceName || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      metric,
      date,
      value,
      unit,
      source: r.sourceName,
      category: metric === "sleep" ? r.value : metadataCategory(metric, raw),
    });
  }
  records.sort((a, b) => a.date.localeCompare(b.date));
  symptoms.sort((a, b) => a.start.localeCompare(b.start));
  const dates = [
    ...records.map((r) => r.date),
    ...symptoms.map((symptom) => symptom.start),
  ].sort();
  let patient: PatientDetails | undefined;
  let clinicalDataWarning: string | undefined;
  if (clinicalFile) {
    try {
      patient = await readClinicalPatient(clinicalFile);
    } catch {
      clinicalDataWarning = "Clinical patient data could not be read from this export.";
    }
  }
  return {
    records,
    symptoms,
    patient,
    diagnostics: {
      fileName,
      imported: records.length + symptoms.length,
      unsupported,
      implausible,
      earliest: dates[0],
      latest: dates.at(-1),
      warnings: [
        ...(records.some((r) => r.metric === "medication")
          ? []
          : ["No supported medication records were found in this export."]),
        ...(clinicalDataWarning ? [clinicalDataWarning] : []),
      ],
    },
  };
}
