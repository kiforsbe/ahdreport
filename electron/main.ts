import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseAppleHealthExport } from './appleHealthParser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 1050, minHeight: 720, backgroundColor: '#f6f8fb', webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl); else mainWindow.loadFile(path.join(here, '../../dist/index.html'));
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('health:import', async () => {
  const choice = await dialog.showOpenDialog({ title: 'Import Apple Health export', filters: [{ name: 'Apple Health export', extensions: ['zip', 'xml'] }], properties: ['openFile'] });
  if (choice.canceled || !choice.filePaths[0]) return null;
  const target = choice.filePaths[0]; return parseAppleHealthExport(await readFile(target), path.basename(target));
});
function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
ipcMain.handle('health:exportPdf', async (_event, patientName?: string) => {
  if (!mainWindow) return { canceled: true };
  const target = await dialog.showSaveDialog(mainWindow, { title: 'Save health report', defaultPath: 'apple-health-report.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (target.canceled || !target.filePath) return { canceled: true };
  const originalBackground = mainWindow.getBackgroundColor();
  mainWindow.setBackgroundColor('#ffffff');
  const name = patientName?.trim();
  const printedOn = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const bandStyle = 'font-size:8px;width:100%;padding:0 12mm;display:flex;justify-content:space-between;color:#667085;font-family:sans-serif;-webkit-print-color-adjust:economy;';
  const headerTemplate = `<div style="${bandStyle}"><span>${name ? escapeHtml(name) : 'Health Atlas report'}</span><span>Printed ${escapeHtml(printedOn)}</span></div>`;
  const footerTemplate = `<div style="${bandStyle}"><span>Health Atlas — private health report</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
  try {
    const pdf = await mainWindow.webContents.printToPDF({ printBackground: false, pageSize: 'A4', displayHeaderFooter: true, headerTemplate, footerTemplate, margins: { marginType: 'custom', top: 60, bottom: 60, left: 38, right: 38 } });
    await (await import('node:fs/promises')).writeFile(target.filePath, pdf);
    return { canceled: false, path: target.filePath };
  } finally {
    mainWindow.setBackgroundColor(originalBackground);
  }
});
