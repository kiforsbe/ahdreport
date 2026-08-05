import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('healthAPI', {
  importExport: () => ipcRenderer.invoke('health:import'),
  exportPdf: (patientName: string) => ipcRenderer.invoke('health:exportPdf', patientName)
});
