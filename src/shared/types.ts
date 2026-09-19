export type Metric =
  | "weight"
  | "heartRate"
  | "restingHeartRate"
  | "bloodPressureSystolic"
  | "bloodPressureDiastolic"
  | "bodyTemperature"
  | "steps"
  | "activeEnergy"
  | "exerciseTime"
  | "distance"
  | "sleep"
  | "walkingSpeed"
  | "stepLength"
  | "walkingAsymmetry"
  | "doubleSupport"
  | "stairAscentSpeed"
  | "stairDescentSpeed"
  | "sixMinuteWalk"
  | "dietaryEnergy"
  | "carbs"
  | "sugar"
  | "fiber"
  | "protein"
  | "fat"
  | "bloodGlucose"
  | "insulinDelivery"
  | "bodyMassIndex"
  | "bodyFatPercentage"
  | "waistCircumference"
  | "leanBodyMass"
  | "oxygenSaturation"
  | "respiratoryRate"
  | "heartRateVariability"
  | "vo2Max"
  | "walkingHeartRateAverage"
  | "medication";

export type SymptomId =
  | "abdominalCramps"
  | "acne"
  | "appetiteChanges"
  | "bladderIncontinence"
  | "bloating"
  | "breastPain"
  | "chestTightnessOrPain"
  | "chills"
  | "constipation"
  | "coughing"
  | "diarrhea"
  | "dizziness"
  | "drySkin"
  | "fainting"
  | "fatigue"
  | "fever"
  | "generalizedBodyAche"
  | "headache"
  | "heartburn"
  | "hotFlashes"
  | "hairLoss"
  | "lossOfSmell"
  | "lossOfTaste"
  | "lowerBackPain"
  | "memoryLapse"
  | "menstrualCramps"
  | "moodChanges"
  | "nausea"
  | "nightSweats"
  | "pelvicPain"
  | "rapidPoundingOrFlutteringHeartbeat"
  | "runnyNose"
  | "shortnessOfBreath"
  | "sinusCongestion"
  | "skippedHeartbeat"
  | "soreThroat"
  | "sleepChanges"
  | "vaginalDryness"
  | "vomiting"
  | "wheezing";

export interface HealthRecord {
  metric: Metric;
  date: string;
  value: number;
  unit: string;
  source?: string;
  category?: string;
}
export interface SymptomRecord {
  symptom: SymptomId;
  start: string;
  end: string;
  value: string;
  source?: string;
}
export interface ImportDiagnostics {
  fileName: string;
  imported: number;
  unsupported: number;
  implausible: number;
  earliest?: string;
  latest?: string;
  warnings: string[];
}
export interface PatientDetails {
  name?: string;
  identifier?: string;
  dateOfBirth?: string;
  sex?: string;
}
export interface HealthData {
  records: HealthRecord[];
  symptoms: SymptomRecord[];
  diagnostics: ImportDiagnostics;
  patient?: PatientDetails;
}
export interface HealthAPI {
  importExport(): Promise<HealthData | null>;
  exportPdf(
    patientName: string,
    personnummer?: string,
    dateOfBirth?: string,
    sex?: string,
    rasterizeCharts?: boolean,
    includeDetailedTables?: boolean,
  ): Promise<{ path?: string; canceled: boolean }>;
  exportData(
    format: "csv" | "xlsx",
    content: string,
  ): Promise<{ path?: string; canceled: boolean }>;
}

declare global {
  interface Window {
    healthAPI: HealthAPI;
  }
}
