import { bench, describe } from "vitest";
import { recordRange } from "../src/report";
import type { HealthRecord } from "../src/shared/types";

const N = 1_000_000;
const records: HealthRecord[] = Array.from({ length: N }, (_, i) => ({
  metric: "weight",
  date: new Date(1_700_000_000_000 + i * 1000).toISOString(),
  value: i % 100,
  unit: "kg",
}));
const ranges: [string, string][] = [
  ["", ""],
  ["2023-11-14", "2023-11-14"],
  ["2023-12-01", "2024-01-01"],
  ["2050-01-01", "2050-01-02"],
];

describe("recordRange on 1,000,000 records", () => {
  for (const [from, to] of ranges) {
    bench(`from=${from || "(none)"} to=${to || "(none)"}`, () => {
      recordRange(records, from, to);
    });
  }
});
