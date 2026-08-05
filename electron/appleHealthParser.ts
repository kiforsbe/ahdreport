import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type {
  HealthData,
  HealthRecord,
  Metric,
  PatientDetails,
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
  HKClinicalTypeIdentifierMedicationRecord: "medication",
};

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
    patient,
    diagnostics: {
      fileName,
      imported: records.length,
      unsupported,
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
