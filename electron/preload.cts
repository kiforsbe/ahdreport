import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('healthAPI', {
  importExport: () => ipcRenderer.invoke('health:import'),
  exportPdf: () => ipcRenderer.invoke('health:exportPdf')
});
