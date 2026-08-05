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
ipcMain.handle('health:exportPdf', async () => {
  if (!mainWindow) return { canceled: true };
  const target = await dialog.showSaveDialog(mainWindow, { title: 'Save health report', defaultPath: 'apple-health-report.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (target.canceled || !target.filePath) return { canceled: true };
  const pdf = await mainWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
  await (await import('node:fs/promises')).writeFile(target.filePath, pdf);
  return { canceled: false, path: target.filePath };
});
