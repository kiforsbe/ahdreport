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
