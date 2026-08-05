import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("healthAPI", {
  importExport: () => ipcRenderer.invoke("health:import"),
  exportPdf: (
    patientName: string,
    personnummer?: string,
    dateOfBirth?: string,
    sex?: string,
  ) =>
    ipcRenderer.invoke(
      "health:exportPdf",
      patientName,
      personnummer,
      dateOfBirth,
      sex,
    ),
});
