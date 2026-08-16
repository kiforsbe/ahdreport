import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const css = readFileSync(join(__dirname, "../src/styles.css"), "utf8");

describe("off-screen containment CSS", () => {
  it("applies content-visibility: auto with a placeholder size to panels and report sections", () => {
    expect(css).toMatch(/\.panel\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:/s);
    expect(css).toMatch(/\.report-section\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:/s);
  });
  it("disables containment via the synchronous .print-layout class override", () => {
    expect(css).toMatch(/\.print-layout \.panel,\s*\.print-layout \.report-section\s*\{[^}]*content-visibility:\s*visible/s);
  });
  it("disables containment inside @media print for both selectors", () => {
    const printBlockMatch = css.match(/@media print\s*\{([\s\S]*)\n\}\s*$/);
    expect(printBlockMatch).not.toBeNull();
    const printBlock = printBlockMatch![1];
    expect(printBlock).toMatch(/\.panel\s*\{[^}]*content-visibility:\s*visible/s);
    expect(printBlock).toMatch(/\.report-section\s*\{[^}]*content-visibility:\s*visible/s);
  });
});
