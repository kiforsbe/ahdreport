import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("healthAPI", {
  importExport: () => ipcRenderer.invoke("health:import"),
  exportPdf: (
    patientName: string,
    personnummer?: string,
    dateOfBirth?: string,
    sex?: string,
    rasterizeCharts = false,
    includeDetailedTables = true,
  ) =>
    ipcRenderer.invoke(
      "health:exportPdf",
      patientName,
      personnummer,
      dateOfBirth,
      sex,
      rasterizeCharts,
      includeDetailedTables,
    ),
  exportData: (format: "csv" | "xlsx", content: string) =>
    ipcRenderer.invoke("health:exportData", format, content),
});
