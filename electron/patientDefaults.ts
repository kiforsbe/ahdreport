import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import type { PatientDetails } from "../src/shared/types.js";

type Environment = Record<string, string | undefined>;

export interface PatientDefaultsResult {
  patient?: PatientDetails;
  warnings: string[];
}

export interface PatientDefaultsOptions {
  workingDirectory: string;
  userDataDirectory: string;
  environment?: Environment;
}

const value = (
  environment: Environment,
  currentName: string,
  legacyName: string,
) =>
  environment[currentName]?.trim() || environment[legacyName]?.trim() || undefined;

export function patientDetailsFromEnvironment(
  environment: Environment,
): PatientDetails {
  return {
    name: value(
      environment,
      "AHDREPORT_PATIENT_NAME",
      "VITE_DEFAULT_PATIENT_NAME",
    ),
    identifier: value(
      environment,
      "AHDREPORT_PERSONNUMMER",
      "VITE_DEFAULT_PERSONNUMMER",
    ),
    dateOfBirth: value(
      environment,
      "AHDREPORT_DATE_OF_BIRTH",
      "VITE_DEFAULT_DATE_OF_BIRTH",
    ),
    sex: value(environment, "AHDREPORT_SEX", "VITE_DEFAULT_SEX"),
  };
}

export function mergePatientDetails(
  imported?: PatientDetails,
  defaults?: PatientDetails,
): PatientDetails | undefined {
  const merged = { ...imported };
  for (const key of [
    "name",
    "identifier",
    "dateOfBirth",
    "sex",
  ] as const) {
    const defaultValue = defaults?.[key]?.trim();
    if (defaultValue) merged[key] = defaultValue;
  }
  return Object.values(merged).some(Boolean) ? merged : undefined;
}

export async function loadPatientDefaults({
  workingDirectory,
  userDataDirectory,
  environment = process.env,
}: PatientDefaultsOptions): Promise<PatientDefaultsResult> {
  const explicitPath = environment.AHDREPORT_PATIENT_ENV_FILE?.trim();
  const candidates = [
    path.join(workingDirectory, ".env"),
    path.join(userDataDirectory, "patient.env"),
    explicitPath,
  ].filter((candidate): candidate is string => !!candidate);
  const uniqueCandidates = [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  let patient: PatientDetails | undefined;
  const warnings: string[] = [];

  for (const candidate of uniqueCandidates) {
    try {
      const parsed = parseEnv(await readFile(candidate, "utf8"));
      patient = mergePatientDetails(
        patient,
        patientDetailsFromEnvironment(parsed),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        warnings.push(
          `Patient defaults could not be read from ${path.basename(candidate)}.`,
        );
    }
  }

  patient = mergePatientDetails(
    patient,
    patientDetailsFromEnvironment(environment),
  );
  return { patient, warnings };
}
