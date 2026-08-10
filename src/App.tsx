import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { HealthData } from "./shared/types";
import {
  MAX_PDF_TABLE_ROWS,
  MAX_TABLE_ROWS,
  activityMetrics,
  bpMetrics,
  filtered,
  labels,
  metricGroups,
  nutritionMetrics,
  walkingMetrics,
} from "./report";
import { createCsv, createExcel } from "./export";
import { PrintLayoutContext } from "./PrintLayoutContext";
import {
  PatientDetailsForm,
  type PatientProfile,
  emptyPatientProfile,
} from "./components/PatientDetailsForm";
import { DebouncedDateInput } from "./components/DebouncedDateInput";
import { OverviewCards } from "./components/OverviewCards";
import { MetricChart } from "./components/charts/MetricChart";
import { BloodPressureChart } from "./components/charts/BloodPressureChart";
import { PulsePressureChart } from "./components/charts/PulsePressureChart";
import { BpHypertensionWarning } from "./components/BpHypertensionWarning";
import { coverageNote } from "./components/TableNotes";
import { ReportTable } from "./components/tables/ReportTable";
import { VitalsReportTable } from "./components/tables/VitalsReportTable";
import { WalkingReportTable } from "./components/tables/WalkingReportTable";
import { ActivityReportTable } from "./components/tables/ActivityReportTable";
import { NutritionReportTable } from "./components/tables/NutritionReportTable";

function rangeDate(days: number, end: string) {
  const d = end ? new Date(`${end}T12:00:00`) : new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
function formatPatientDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function App() {
  const [data, setData] = useState<HealthData | null>(null);
  const [printLayout, setPrintLayout] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const patientProfile = useRef<PatientProfile>(emptyPatientProfile);
  const [notice, setNotice] = useState("");
  const records = useMemo(
    () => (data ? filtered(data.records, from, to) : []),
    [data, from, to],
  );
  const overviewRecords = useMemo(
    () => (data ? filtered(data.records, rangeDate(30, to), to) : []),
    [data, to],
  );
  const yearOverviewRecords = useMemo(
    () => (data ? filtered(data.records, rangeDate(365, to), to) : []),
    [data, to],
  );
  const allTimeOverviewRecords = useMemo(
    () => (data ? filtered(data.records, "", to) : []),
    [data, to],
  );
  useEffect(() => {
    const printWindow = window as Window & {
      healthAtlasPrintLayout?: (
        active: boolean,
        rasterizeCharts?: boolean,
      ) => Promise<void>;
    };
    printWindow.healthAtlasPrintLayout = async (active, rasterizeCharts = false) => {
      flushSync(() => setPrintLayout(active));
      await document.fonts?.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const main = document.querySelector("main");
      if (Boolean(main?.classList.contains("print-layout")) !== active)
        throw new Error("The requested PDF layout was not committed.");
      if (active && main) {
        const responsiveCharts = main.querySelectorAll(
          ".recharts-responsive-container",
        );
        const printCharts = [
          ...main.querySelectorAll<HTMLElement>(
            '[data-pdf-chart-ready="true"]',
          ),
        ];
        const incompleteCharts = printCharts.filter(
          (chart) => !chart.querySelector(".recharts-surface"),
        );
        if (
          responsiveCharts.length ||
          !printCharts.length ||
          incompleteCharts.length
        )
          throw new Error("The PDF charts have not finished updating.");
        printCharts.forEach((chart) => chart.getBoundingClientRect());
        if (rasterizeCharts) {
          await Promise.all(
            printCharts.map(async (chart) => {
              const svg = chart.querySelector<SVGSVGElement>(
                "svg.recharts-surface",
              );
              if (!svg) throw new Error("A PDF chart could not be rasterized.");
              const { width, height } = svg.getBoundingClientRect();
              const serialized = new XMLSerializer().serializeToString(svg);
              const markup = serialized.includes("xmlns=")
                ? serialized
                : serialized.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
              const source = URL.createObjectURL(
                new Blob([markup], { type: "image/svg+xml" }),
              );
              try {
                const image = await new Promise<HTMLImageElement>(
                  (resolve, reject) => {
                    const loaded = new Image();
                    loaded.onload = () => resolve(loaded);
                    loaded.onerror = () => reject(new Error("A PDF chart image could not be created."));
                    loaded.src = source;
                  },
                );
                const scale = 2;
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                const context = canvas.getContext("2d");
                if (!context) throw new Error("A PDF chart image could not be created.");
                context.fillStyle = "white";
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const raster = document.createElement("img");
                raster.src = canvas.toDataURL("image/jpeg", 0.88);
                await raster.decode();
                raster.width = Math.round(width);
                raster.height = Math.round(height);
                raster.style.display = "block";
                svg.replaceWith(raster);
              } finally {
                URL.revokeObjectURL(source);
              }
            }),
          );
        }
      }
    };
    return () => {
      delete printWindow.healthAtlasPrintLayout;
    };
  }, []);
  async function importData() {
    try {
      if (!window.healthAPI)
        throw new Error(
          "The secure desktop bridge did not load. Please restart the application.",
        );
      const result = await window.healthAPI.importExport();
      if (result) {
        setData(result);
        setFrom(result.diagnostics.earliest?.slice(0, 10) ?? "");
        setTo(result.diagnostics.latest?.slice(0, 10) ?? "");
        patientProfile.current = {
          name: result.patient?.name || "",
          personnummer: result.patient?.identifier || "",
          dateOfBirth: formatPatientDate(result.patient?.dateOfBirth) || "",
          sex: result.patient?.sex || "",
        };
        setNotice("");
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not read that export.",
      );
    }
  }
  async function pdf(rasterizeCharts = false) {
    const patient = patientProfile.current;
    const result = await window.healthAPI.exportPdf(
      patient.name,
      patient.personnummer,
      patient.dateOfBirth,
      patient.sex,
      rasterizeCharts,
    );
    if (!result.canceled)
      setNotice(`${rasterizeCharts ? "Compact " : ""}PDF saved to ${result.path}`);
  }
  async function dataExport(format: "csv" | "xlsx") {
    const content =
      format === "csv" ? createCsv(records) : await createExcel(records);
    const result = await window.healthAPI.exportData(format, content);
    if (!result.canceled)
      setNotice(`${format === "csv" ? "CSV" : "Excel"} file saved to ${result.path}`);
  }
  if (!data)
    return (
      <main className="landing">
        <div className="brand">AHDREPORT</div>
        <div className="hero">
          <p className="eyebrow">PRIVATE HEALTH REPORTING</p>
          <h1>
            Your Apple Health data,
            <br />
            made useful.
          </h1>
          <p>
            Import an Apple Health export to explore trends and create a
            detailed PDF. Your data is processed only on this computer and
            disappears when you close the app.
          </p>
          <button className="primary" onClick={importData}>
            Import Apple Health export
          </button>
          {notice && <p className="error">{notice}</p>}
          <p className="hint">
            Accepts Apple Health <code>export.zip</code> or{" "}
            <code>export.xml</code>. Nothing is uploaded.
          </p>
        </div>
      </main>
    );
  const medicationPresent = records.some((r) => r.metric === "medication");
  const hasBloodPressure = records.some((r) => bpMetrics.includes(r.metric));
  const tableRowLimit = printLayout ? MAX_PDF_TABLE_ROWS : MAX_TABLE_ROWS;
  return (
    <PrintLayoutContext.Provider value={printLayout}>
      <main className={printLayout ? "print-layout" : undefined}>
      <header>
        <div>
          <div className="brand">AHDREPORT</div>
        </div>
        <div className="header-actions">
          <button onClick={() => setData(null)}>Clear session</button>
          <div className="export-split">
            <button className="primary" onClick={() => pdf()}>
              Export PDF
            </button>
            <details className="export-options">
              <summary aria-label="More export options">▾</summary>
              <div className="export-menu" role="menu">
                <button role="menuitem" onClick={() => pdf(true)}>
                  Export compact PDF
                </button>
                <button role="menuitem" onClick={() => dataExport("csv")}>
                  Export CSV
                </button>
                <button role="menuitem" onClick={() => dataExport("xlsx")}>
                  Export Excel (.xlsx)
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>
      <section className="controls">
        <div>
          <b>Report period</b>
          <div className="presets">
            <button onClick={() => setFrom(rangeDate(7, to))}>7D</button>
            <button onClick={() => setFrom(rangeDate(30, to))}>30D</button>
            <button onClick={() => setFrom(rangeDate(90, to))}>90D</button>
            <button onClick={() => setFrom(rangeDate(365, to))}>
              Last year
            </button>
            <button
              onClick={() =>
                setFrom(
                  `${new Date(`${to || new Date().toISOString().slice(0, 10)}T12:00:00`).getFullYear()}-01-01`,
                )
              }
            >
              YTD
            </button>
            <button
              onClick={() =>
                setFrom(data.diagnostics.earliest?.slice(0, 10) ?? "")
              }
            >
              All time
            </button>
          </div>
        </div>
        <DebouncedDateInput label="From" value={from} onChange={setFrom} />
        <DebouncedDateInput label="To" value={to} onChange={setTo} />
      </section>
      <section className="print-period" aria-label="Selected report period">
        <b>Report period</b>
        <dl>
          <div>
            <dt>From</dt>
            <dd>{from || "Beginning"}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{to || "Latest record"}</dd>
          </div>
        </dl>
      </section>
      {notice && <div className="notice">{notice}</div>}
      <section className="intro">
        <p className="eyebrow">CLINICAL OVERVIEW</p>
      </section>
      <section className="patient-profile" aria-label="Patient details">
        <h2>Patient details</h2>
        <PatientDetailsForm
          key={JSON.stringify(patientProfile.current)}
          initial={patientProfile.current}
          onFieldChange={(field, value) => {
            patientProfile.current = { ...patientProfile.current, [field]: value };
          }}
        />
      </section>
      <OverviewCards records={overviewRecords} periodLabel="Last 30 days" />
      <OverviewCards
        records={yearOverviewRecords}
        periodLabel="Last year"
        collapsible
      />
      <OverviewCards
        records={allTimeOverviewRecords}
        periodLabel="All time"
        collapsible
      />
      <section className="dashboard">
        {metricGroups.map((group) => (
          <section key={group.title} className="group">
            <h2>{group.title}</h2>
            {group.title === "Vitals" && hasBloodPressure && !printLayout && (
              <BpHypertensionWarning records={records} />
            )}
            <div className="grid">
              {group.title === "Vitals" && hasBloodPressure && (
                <BloodPressureChart records={records} from={from} to={to} />
              )}{" "}
              {group.title === "Vitals" && hasBloodPressure && (
                <PulsePressureChart records={records} />
              )}{" "}
              {group.metrics
                .filter(
                  (m) =>
                    !bpMetrics.includes(m) &&
                    m !== "sugar" &&
                    records.some((r) => r.metric === m),
                )
                .map((m) => {
                  const note = coverageNote(m, records, from, to);
                  return (
                    <article className="panel" key={m}>
                      <h3>{labels[m]}</h3>
                      {!printLayout && note && (
                        <small className="table-notes">{note}</small>
                      )}
                      <MetricChart metric={m} records={records} />
                    </article>
                  );
                })}
            </div>
            {!group.metrics.some((m) =>
              records.some((r) => r.metric === m),
            ) && (
              <div className="empty">
                No supported {group.title.toLowerCase()} records were found for
                this period.
              </div>
            )}
          </section>
        ))}
      </section>
      <section className="panel medication">
        <h2>Medication</h2>
        {medicationPresent ? (
          <MetricChart metric="medication" records={records} />
        ) : (
          <p>
            Medication records are not available in this Apple Health export.
            This version does not accept manual medication entries.
          </p>
        )}
      </section>
      <section className="diagnostics">
        <b>Import diagnostics</b>
        <span>
          {data.diagnostics.unsupported.toLocaleString()} unsupported Apple
          Health record types were safely skipped.
        </span>
        <span>
          {data.diagnostics.implausible.toLocaleString()} record(s) were
          excluded as physiologically implausible.
        </span>
        {data.diagnostics.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </section>
      <section className="print-report">
        <h2>Detailed measurements</h2>
        <p>
          Report period: {from || "Beginning"} — {to}. Each table below lists up
          to {tableRowLimit.toLocaleString()} of the most recent days with data
          per metric; a note appears under any table showing fewer days than are
          available, or where a metric's own data starts later or ends earlier
          than the selected period.
        </p>
        <VitalsReportTable records={records} from={from} to={to} />
        <ActivityReportTable records={records} from={from} to={to} />
        <WalkingReportTable records={records} from={from} to={to} />
        <NutritionReportTable records={records} from={from} to={to} />
        {metricGroups
          .flatMap((g) => g.metrics)
          .filter(
            (metric) =>
              !bpMetrics.includes(metric) &&
              metric !== "heartRate" &&
              metric !== "weight" &&
              !activityMetrics.includes(metric) &&
              !walkingMetrics.includes(metric) &&
              !nutritionMetrics.includes(metric),
          )
          .map((m) => (
            <ReportTable
              key={m}
              metric={m}
              records={records}
              from={from}
              to={to}
            />
          ))}
      </section>
      </main>
    </PrintLayoutContext.Provider>
  );
}
