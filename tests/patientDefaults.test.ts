import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadPatientDefaults,
  mergePatientDetails,
  patientDetailsFromEnvironment,
} from "../electron/patientDefaults";

describe("runtime patient defaults", () => {
  it("prefers current runtime names while accepting legacy Vite names", () => {
    expect(
      patientDetailsFromEnvironment({
        AHDREPORT_PATIENT_NAME: "Alex Example",
        VITE_DEFAULT_PATIENT_NAME: "Legacy Example",
        VITE_DEFAULT_PERSONNUMMER: "700412-1234",
      }),
    ).toEqual({
      name: "Alex Example",
      identifier: "700412-1234",
      dateOfBirth: undefined,
      sex: undefined,
    });
  });

  it("loads files dynamically and applies source precedence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ahdreport-defaults-"));
    const userDataDirectory = path.join(root, "user-data");
    const explicitFile = path.join(root, "selected.env");
    await mkdir(userDataDirectory);
    await writeFile(
      path.join(root, ".env"),
      "AHDREPORT_PATIENT_NAME=Repository Example\nAHDREPORT_DATE_OF_BIRTH=1970-04-12\n",
    );
    await writeFile(
      path.join(userDataDirectory, "patient.env"),
      "AHDREPORT_PERSONNUMMER=700412-1234\n",
    );
    await writeFile(explicitFile, "AHDREPORT_PATIENT_NAME=Selected Example\n");

    try {
      const result = await loadPatientDefaults({
        workingDirectory: root,
        userDataDirectory,
        environment: {
          AHDREPORT_PATIENT_ENV_FILE: explicitFile,
          AHDREPORT_SEX: "Unspecified",
        },
      });
      expect(result).toEqual({
        patient: {
          name: "Selected Example",
          identifier: "700412-1234",
          dateOfBirth: "1970-04-12",
          sex: "Unspecified",
        },
        warnings: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("overrides only non-empty imported fields", () => {
    expect(
      mergePatientDetails(
        {
          name: "Imported Example",
          identifier: "imported-id",
          dateOfBirth: "19900101",
          sex: "Female",
        },
        { name: "Runtime Example", identifier: "   " },
      ),
    ).toEqual({
      name: "Runtime Example",
      identifier: "imported-id",
      dateOfBirth: "19900101",
      sex: "Female",
    });
  });
});
