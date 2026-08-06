import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseAppleHealthExport } from "./appleHealthParser.js";
import {
  loadPatientDefaults,
  mergePatientDetails,
} from "./patientDefaults.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1050,
    minHeight: 720,
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(here, "../../dist/index.html"));
}
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("health:import", async () => {
  const choice = await dialog.showOpenDialog({
    title: "Import Apple Health export",
    filters: [{ name: "Apple Health export", extensions: ["zip", "xml"] }],
    properties: ["openFile"],
  });
  if (choice.canceled || !choice.filePaths[0]) return null;
  const target = choice.filePaths[0];
  const [data, defaults] = await Promise.all([
    parseAppleHealthExport(await readFile(target), path.basename(target)),
    loadPatientDefaults({
      workingDirectory: process.cwd(),
      userDataDirectory: app.getPath("userData"),
    }),
  ]);
  return {
    ...data,
    patient: mergePatientDetails(data.patient, defaults.patient),
    diagnostics: {
      ...data.diagnostics,
      warnings: [...data.diagnostics.warnings, ...defaults.warnings],
    },
  };
});
ipcMain.handle(
  "health:exportData",
  async (_event, format: "csv" | "xlsx", content: string) => {
    if (!mainWindow) return { canceled: true };
    const isExcel = format === "xlsx";
    const target = await dialog.showSaveDialog(mainWindow, {
      title: `Save ${isExcel ? "Excel" : "CSV"} export`,
      defaultPath: `ahdreport-data.${format}`,
      filters: [
        {
          name: isExcel ? "Excel workbook" : "CSV",
          extensions: [format],
        },
      ],
    });
    if (target.canceled || !target.filePath) return { canceled: true };
    const data = isExcel ? Buffer.from(content, "base64") : content;
    await (await import("node:fs/promises")).writeFile(target.filePath, data);
    return { canceled: false, path: target.filePath };
  },
);
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function formatClinicalDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
ipcMain.handle(
  "health:exportPdf",
  async (
    _event,
    patientName?: string,
    personnummer?: string,
    dateOfBirth?: string,
    sex?: string,
    rasterizeCharts = false,
  ) => {
    if (!mainWindow) return { canceled: true };
    const target = await dialog.showSaveDialog(mainWindow, {
      title: "Save health report",
      defaultPath: rasterizeCharts ? "ahdreport-compact.pdf" : "ahdreport.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (target.canceled || !target.filePath) return { canceled: true };
    const originalBackground = mainWindow.getBackgroundColor();
    mainWindow.setBackgroundColor("#ffffff");
    const name = patientName?.trim();
    const pnr = personnummer?.trim();
    const birthDate = formatClinicalDate(dateOfBirth?.trim());
    const sexLabel = sex?.trim();
    const patientSummary = [
      name,
      pnr,
      birthDate && `Born: ${birthDate}`,
      sexLabel,
    ].filter((value): value is string => !!value);
    const printedOn = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const bandStyle =
      "font-size:8px;width:100%;padding:0 12mm;display:flex;justify-content:space-between;color:#667085;font-family:sans-serif;-webkit-print-color-adjust:economy;";
    const headerTemplate = `<div style="${bandStyle}"><span>${patientSummary.length ? escapeHtml(patientSummary.join(" · ")) : "AHDReport"}</span><span>Printed: ${escapeHtml(printedOn)}</span></div>`;
    const footerTemplate = `<div style="${bandStyle}"><span></span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
    try {
      await mainWindow.webContents.executeJavaScript(
        `(async () => { if (!window.healthAtlasPrintLayout) throw new Error("Print layout bridge is unavailable"); await window.healthAtlasPrintLayout(true, ${rasterizeCharts}); return true; })()`,
      );
      mainWindow.webContents.invalidate();
      await mainWindow.webContents.capturePage();
      const pdf = await mainWindow.webContents.printToPDF({
        printBackground: false,
        pageSize: "A4",
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
      });
      await (await import("node:fs/promises")).writeFile(target.filePath, pdf);
      return { canceled: false, path: target.filePath };
    } finally {
      await mainWindow.webContents
        .executeJavaScript(
          '(async () => { await window.healthAtlasPrintLayout?.(false); return true; })()',
        )
        .catch(() => undefined);
      mainWindow.setBackgroundColor(originalBackground);
    }
  },
);
