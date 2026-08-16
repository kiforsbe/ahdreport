import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseAppleHealthExport } from "../electron/appleHealthParser";

const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" value="70.2" startDate="2026-01-02 08:00:00 +0000" endDate="2026-01-02 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" value="70.2" startDate="2026-01-02 08:00:00 +0000" endDate="2026-01-02 08:00:00 +0000"/><Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-01-02 22:00:00 +0000" endDate="2026-01-03 06:00:00 +0000"/><Record type="Unknown" value="2" startDate="2026-01-03 06:00:00 +0000"/></HealthData>`;
describe("Apple Health parser", () => {
  it("maps supported records, computes sleep, and ignores exact duplicates", async () => {
    const result = await parseAppleHealthExport(Buffer.from(xml), "export.xml");
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      metric: "weight",
      value: 70.2,
      unit: "kg",
    });
    expect(result.records[1]).toMatchObject({
      metric: "sleep",
      value: 8,
      unit: "hr",
    });
    expect(result.diagnostics.unsupported).toBe(1);
  });
  it("rejects non-Apple XML", async () =>
    await expect(
      parseAppleHealthExport(Buffer.from("<xml/>"), "export.xml"),
    ).rejects.toThrow("not a valid Apple Health export"));
});

describe("clinical data in Apple Health ZIP exports", () => {
  it("extracts patient details from a clinical XML file", async () => {
    const zip = new JSZip();
    zip.file("apple_health_export/export.xml", xml);
    zip.file(
      "apple_health_export/clinical_data.xml",
      '<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3"><recordTarget><patientRole><id root="1.2.3" extension="internal-id"/><id root="1.2.3" extension="199001011234"/><patient><name><given>Ada</given><family>Lovelace</family></name><administrativeGenderCode code="F" displayName="Female"/><birthTime value="19900101"/></patient></patientRole></recordTarget></ClinicalDocument>',
    );
    const file = await zip.generateAsync({ type: "nodebuffer" });
    const result = await parseAppleHealthExport(file, "export.zip");
    expect(result.patient).toEqual({
      name: "Ada Lovelace",
      identifier: "199001011234",
      dateOfBirth: "19900101",
      sex: "Female",
    });
  });
  it("reads Apple Health inline patient names when no identifier is supplied", async () => {
    const zip = new JSZip();
    zip.file("export.xml", xml);
    zip.file(
      "export_cda.xml",
      '<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3"><recordTarget><patientRole><id root="2.16.840.1.113883.4.6" nullFlavor="NA"/><patient><name use="CL">Alex Example</name><administrativeGenderCode code="M" displayName="Male"/><birthTime value="19700412"/></patient></patientRole></recordTarget></ClinicalDocument>',
    );
    const file = await zip.generateAsync({ type: "nodebuffer" });
    const result = await parseAppleHealthExport(file, "export.zip");
    expect(result.patient).toEqual({
      name: "Alex Example",
      identifier: undefined,
      dateOfBirth: "19700412",
      sex: "Male",
    });
  });
});

describe("nutrition records", () => {
  const nutritionXml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierDietaryEnergyConsumed" sourceName="MyFitnessPal" unit="kcal" value="650" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryCarbohydrates" sourceName="MyFitnessPal" unit="g" value="80" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietarySugar" sourceName="MyFitnessPal" unit="g" value="20" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryFiber" sourceName="MyFitnessPal" unit="g" value="8" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryProtein" sourceName="MyFitnessPal" unit="g" value="25" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierDietaryFatTotal" sourceName="MyFitnessPal" unit="g" value="22" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/></HealthData>`;
  it("maps all six dietary identifiers to nutrition metrics", async () => {
    const result = await parseAppleHealthExport(
      Buffer.from(nutritionXml),
      "export.xml",
    );
    expect(result.diagnostics.unsupported).toBe(0);
    expect(result.records).toEqual([
      expect.objectContaining({ metric: "dietaryEnergy", value: 650, unit: "kcal" }),
      expect.objectContaining({ metric: "carbs", value: 80, unit: "g" }),
      expect.objectContaining({ metric: "sugar", value: 20, unit: "g" }),
      expect.objectContaining({ metric: "fiber", value: 8, unit: "g" }),
      expect.objectContaining({ metric: "protein", value: 25, unit: "g" }),
      expect.objectContaining({ metric: "fat", value: 22, unit: "g" }),
    ]);
  });
});

describe("record ordering", () => {
  it("returns records sorted ascending by date even when input timestamps are out of order", async () => {
    const unorderedXml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" value="72.0" startDate="2026-01-05 08:00:00 +0000" endDate="2026-01-05 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" value="70.0" startDate="2026-01-01 08:00:00 +0000" endDate="2026-01-01 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" value="71.0" startDate="2026-01-03 08:00:00 +0000" endDate="2026-01-03 08:00:00 +0000"/></HealthData>`;
    const result = await parseAppleHealthExport(
      Buffer.from(unorderedXml),
      "export.xml",
    );
    const dates = result.records.map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
    expect(result.records.map((r) => r.value)).toEqual([70.0, 71.0, 72.0]);
  });
});

describe("physiological plausibility filtering", () => {
  it("excludes implausible vitals readings and counts them in diagnostics", async () => {
    const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="999" startDate="2026-01-06 08:00:00 +0000" endDate="2026-01-06 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="62" startDate="2026-01-06 09:00:00 +0000" endDate="2026-01-06 09:00:00 +0000"/></HealthData>`;
    const result = await parseAppleHealthExport(
      Buffer.from(xml),
      "export.xml",
    );
    expect(result.records).toEqual([
      expect.objectContaining({
        metric: "heartRate",
        value: 62,
        unit: "count/min",
      }),
    ]);
    expect(result.diagnostics.implausible).toBe(1);
    expect(result.diagnostics.warnings).not.toContain(
      "1 record(s) were excluded as physiologically implausible.",
    );
  });
  it("keeps boundary-plausible readings", async () => {
    const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="20" startDate="2026-01-06 08:00:00 +0000" endDate="2026-01-06 08:00:00 +0000"/><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="300" startDate="2026-01-06 09:00:00 +0000" endDate="2026-01-06 09:00:00 +0000"/></HealthData>`;
    const result = await parseAppleHealthExport(
      Buffer.from(xml),
      "export.xml",
    );
    expect(result.records).toHaveLength(2);
    expect(result.diagnostics.implausible).toBe(0);
  });
  it("rejects negative values for any metric", async () => {
    const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" value="-5" startDate="2026-01-06 08:00:00 +0000" endDate="2026-01-06 08:00:00 +0000"/></HealthData>`;
    const result = await parseAppleHealthExport(
      Buffer.from(xml),
      "export.xml",
    );
    expect(result.records).toHaveLength(0);
    expect(result.diagnostics.implausible).toBe(1);
  });
});
