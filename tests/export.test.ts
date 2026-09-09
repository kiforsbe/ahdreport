import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createCsv, createExcel, exportRows } from "../src/export";
import type { HealthRecord, SymptomRecord } from "../src/shared/types";

const ascending: HealthRecord[] = [
  { metric: "steps", date: "2026-01-01T08:00:00.000Z", value: 100, unit: "count" },
  { metric: "steps", date: "2026-01-02T08:00:00.000Z", value: 200, unit: "count" },
  { metric: "steps", date: "2026-01-02T08:00:00.000Z", value: 201, unit: "count" },
  { metric: "steps", date: "2026-01-03T08:00:00.000Z", value: 300, unit: "count" },
];

describe("exportRows", () => {
  it("orders records newest first without mutating the input array", () => {
    const rows = exportRows(ascending);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-01-03T08:00:00.000Z",
      "2026-01-02T08:00:00.000Z",
      "2026-01-02T08:00:00.000Z",
      "2026-01-01T08:00:00.000Z",
    ]);
    expect(ascending[0].date).toBe("2026-01-01T08:00:00.000Z");
  });
  it("resolves equal timestamps deterministically (reverse of input order)", () => {
    const rows = exportRows(ascending);
    expect(rows[1].value).toBe(201);
    expect(rows[2].value).toBe(200);
  });
});

describe("createCsv", () => {
  it("exports the newest record first and the oldest record last", () => {
    const csv = createCsv(ascending);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[1]).toContain("2026-01-03");
    expect(lines.at(-1)).toContain("2026-01-01");
  });

  it("includes symptom events as typed rows", () => {
    const symptoms: SymptomRecord[] = [
      {
        symptom: "headache",
        start: "2026-01-02T08:00:00.000Z",
        end: "2026-01-02T12:00:00.000Z",
        value: "HKCategoryValueSeverityModerate",
        source: "Health",
      },
    ];
    const csv = createCsv(ascending, symptoms).replace(/^﻿/, "");
    expect(csv.split("\r\n")[0]).toContain("Record type");
    expect(csv).toContain("symptom");
    expect(csv).toContain("Headache");
    expect(csv).toContain("4.0");
  });
});

describe("createExcel", () => {
  it("writes the newest record to the first data row and the oldest to the last", async () => {
    const base64 = await createExcel(ascending);
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const firstDataRow = sheet.match(/<row r="2">([\s\S]*?)<\/row>/)?.[1] ?? "";
    const lastRowNumber = ascending.length + 1;
    const lastDataRow =
      sheet.match(new RegExp(`<row r="${lastRowNumber}">([\\s\\S]*?)</row>`))?.[1] ?? "";
    expect(firstDataRow).toContain("2026-01-03");
    expect(lastDataRow).toContain("2026-01-01");
  });

  it("writes symptom events to a dedicated Symptoms worksheet", async () => {
    const symptoms: SymptomRecord[] = [
      {
        symptom: "dizziness",
        start: "2026-01-02T08:00:00.000Z",
        end: "2026-01-02T08:30:00.000Z",
        value: "HKCategoryValuePresencePresent",
        source: "Watch",
      },
    ];
    const base64 = await createExcel(ascending, symptoms);
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    const symptomsSheet = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(workbook).toContain('name="Symptoms"');
    expect(symptomsSheet).toContain("Dizziness");
    expect(symptomsSheet).toContain("0.5");
  });
});
