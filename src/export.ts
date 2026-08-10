import type { HealthData } from "./shared/types";
import { labels } from "./report";

function csvCell(value: string | number | undefined) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safeText)
    ? `"${safeText.replaceAll('"', '""')}"`
    : safeText;
}
export function exportRows(records: HealthData["records"]) {
  return records.slice().sort((a, b) => b.date.localeCompare(a.date));
}
export function createCsv(records: HealthData["records"]) {
  const rows = [
    ["Date", "Metric", "Value", "Unit", "Source", "Category"]
      .map(csvCell)
      .join(","),
  ];
  exportRows(records).forEach((record) =>
    rows.push(
      [
        record.date,
        labels[record.metric],
        record.value,
        record.unit,
        record.source,
        record.category,
      ]
        .map(csvCell)
        .join(","),
    ),
  );
  return `\uFEFF${rows.join("\r\n")}`;
}
function xmlCell(value: string | number | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
export async function createExcel(records: HealthData["records"]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const textCell = (value: string | number | undefined) =>
    `<c t="inlineStr"><is><t>${xmlCell(value)}</t></is></c>`;
  const headers = ["Date", "Metric", "Value", "Unit", "Source", "Category"];
  const rows = [
    `<row r="1">${headers.map(textCell).join("")}</row>`,
    ...exportRows(records).map(
      (record, index) =>
        `<row r="${index + 2}">${textCell(record.date)}${textCell(labels[record.metric])}<c><v>${record.value}</v></c>${textCell(record.unit)}${textCell(record.source)}${textCell(record.category)}</row>`,
    ),
  ];
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Health data" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}
