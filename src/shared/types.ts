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
  | "medication";

export interface HealthRecord {
  metric: Metric;
  date: string;
  value: number;
  unit: string;
  source?: string;
  category?: string;
}
export interface ImportDiagnostics {
  fileName: string;
  imported: number;
  unsupported: number;
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
  ): Promise<{ path?: string; canceled: boolean }>;
}

declare global {
  interface Window {
    healthAPI: HealthAPI;
  }
}
