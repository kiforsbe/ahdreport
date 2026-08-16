import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createCsv, createExcel, exportRows } from "../src/export";
import type { HealthRecord } from "../src/shared/types";

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
});
