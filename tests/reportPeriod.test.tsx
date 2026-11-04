import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { HealthData } from "../src/shared/types";

const data: HealthData = {
  records: [],
  symptoms: [],
  diagnostics: {
    fileName: "synthetic.xml", imported: 0, unsupported: 0, implausible: 0,
    earliest: "2025-01-01T12:00:00Z", latest: "2026-11-04T12:00:00Z", warnings: [],
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("switches from last year to 180 inclusive days and keeps the selected dates", async () => {
  window.healthAPI = {
    importExport: vi.fn().mockResolvedValue(data),
    exportPdf: vi.fn(), exportData: vi.fn(),
  };
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Import Apple Health export" }));
  await screen.findByRole("button", { name: "180D" });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Last year" }));
  expect(screen.getByLabelText("From")).toHaveValue("2025-11-05");
  fireEvent.click(screen.getByRole("button", { name: "180D" }));
  expect(screen.getByLabelText("From")).toHaveValue("2026-05-09");
  expect(screen.getByLabelText("To")).toHaveValue("2026-11-04");
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(screen.getByLabelText("From")).toHaveValue("2026-05-09");
});
