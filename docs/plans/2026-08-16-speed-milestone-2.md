# Milestone 2: Defer and Contain Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop paying render/computation cost for report content the user (or the PDF pipeline) hasn't actually asked to see yet, without changing any currently-visible output, exported content, or the existing print-layout/PDF-readiness protocol.

**Architecture:** A single small, reusable controlled-disclosure component (`LazyDisclosure`) replaces the raw `<details>` elements already used for the 365-day/all-time overview cards and adds a new one around the always-mounted "Detailed measurements" tables, deferring both mounting and the expensive per-metric derivation functions (`daily`/`dailyStats`/`median`/`latest`) until each section is actually opened. `content-visibility`/`contain-intrinsic-size` is layered on top as a CSS-only containment pass over already-mounted panels and report sections, explicitly disabled under print so Chromium's PDF pipeline never omits off-screen content. `React.memo` is then applied to the chart/table leaf components, which already receive referentially-stable props from Milestone 1's `useMemo` work, so unrelated state (`notice`) stops re-rendering unchanged report content.

**Tech Stack:** React 19, TypeScript 5.7 (strict), Vite 6 / `@vitejs/plugin-react`, Vitest 4, `fast-check` (existing) plus newly-added `jsdom` (DOM environment), `@testing-library/react` and `@testing-library/jest-dom` (component rendering/assertions) — all exercised through `vitest run`, never a real browser.

**Spec:** docs/plans/speed_plan.md (§5.1–5.4; §5.5 explicitly deferred, see note below)

## Deferred: §5.5 Virtualization decision gate

§5.5 is a conditional measurement-driven decision gate, not an implementation task: it only triggers "if expansion or scrolling still misses the agreed target" after lazy mounting (§5.2) and containment (§5.3) have shipped. No agreed numeric target exists anywhere in this repository today, and no real-usage or profiling data exists yet for the post-Milestone-1 state, let alone the post-Milestone-2 state this gate is meant to evaluate. Building virtualization or pagination now would be solving a problem that hasn't been measured, and the spec itself lists it as the last-resort option ("prefer the least complex solution... 1. lazy mounting plus containment; 2. pagination; 3. ... virtualization"). This plan implements options 1 (lazy mounting, Tasks 3–4) and effectively 1½ (containment, Task 5) and stops there. Revisit §5.5 after this milestone ships and real usage — or a later milestone's profiling pass — shows detailed-report expansion or scrolling is still a measured problem against an explicitly agreed target.

## Global Constraints

From speed_plan.md §2, "Repository and privacy constraints" (verbatim):
- Keep processing local.
- Use only deterministic synthetic data in committed fixtures and benchmarks.
- Preserve sandboxing, context isolation, and the narrow preload API.
- Do not add arbitrary renderer filesystem access.
- Preserve exact raw data for tables and CSV/XLSX export.
- Maintain compatibility with standalone XML and Apple Health ZIP input.

From speed_plan.md §2, "Rendering" (verbatim, directly governs this milestone):
> PDF preparation deliberately switches to a fixed-width chart tree and waits for chart readiness. Any lazy-mounting or containment work must preserve this synchronization.

Standing constraint for this milestone (not in the spec, established separately as confirmed working practice for this repo): **do not drive the app in a real browser to verify UI changes.** Verification is `tsc` (type checking) + `vitest` only — no Playwright or other browser automation. Every acceptance criterion that fundamentally requires real browser layout/paint (scroll jump behavior, browser "find," actual `content-visibility` paint-skipping, visual PDF appearance) gets the underlying code change plus whatever *can* be verified with `tsc`+`vitest`+jsdom/RTL, and an explicit "Manual verification (not automated)" line — never a fabricated automated test that doesn't actually verify the real thing.

No `CLAUDE.md` exists in this repository, so no additional project-level instructions apply beyond the above.

## Corrections to plan-drafting research (confirmed against current code before this plan was finalized)

1. There is no existing `tsc` verification step that actually covers `src/**/*.tsx` or `tests/`. `npm run build` runs `vite build` (esbuild transpilation only, no type-checking) then `tsc -p tsconfig.electron.json`, whose `include` is `["electron", "src/shared"]` only. Task 1 adds a real `typecheck` script and extends `tsconfig.json`'s `include` to cover `tests/` too.
2. `MAX_TABLE_ROWS` and `MAX_PDF_TABLE_ROWS` are both `365` (`src/report.ts:630-631`) — unrelated pre-existing doc drift in `docs/ARCHITECTURE.md`, noted so this plan doesn't repeat the wrong number, no action needed here.
3. §5.4's stated precondition ("after derived models have stable object identities") is already satisfied: `records`, `metadata`, `from`, `to` are already `useMemo`'d in `App.tsx` since Milestone 1. Task 6 can wrap components directly, no stabilization work needed first.
4. All ten chart/table components read `PrintLayoutContext` via `useContext` internally, not as a prop — `React.memo`'s shallow prop comparison does not suppress React's context-driven re-renders, so memoizing cannot break "print-layout changes still update all affected content." Verified directly: `MetricChart.tsx:41` reads `useContext(PrintLayoutContext)` and conditionally renders `<div data-pdf-chart-ready="true">` at line 104 when `printLayout` is true.
5. **Resolved a real conflict between §5.1 and §5.2.** §5.1 says the disclosure's default should *retain* mounted content after first opening. §5.2 requires the closed viewer DOM to contain **zero** detailed table rows or cell SVGs. If the shared disclosure defaulted to "retain," the very first PDF export (which force-opens the detailed report) would permanently mount the tables from then on, even after visually re-closing — violating §5.2 forever after the first export. Task 4 explicitly passes `keepMounted={false}` for the Detailed Measurements usage only; Task 3 keeps the component's `keepMounted: true` default for the overview cards, per §5.1's instruction.
6. Verified CSS target locations directly in `src/styles.css`: the base `.panel { padding: 18px; min-width: 0; }` rule is at lines 302-305, and `.report-section { break-inside: avoid; margin: 28px 0; }` is at lines 367-370 — both match. However, `@media print` (opens line 413) **already contains its own `.panel { break-inside: avoid; }` rule at lines 494-496 and `.report-section { page-break-inside: avoid; }` at lines 506-508** — Task 5 below merges the containment-disabling declarations into these *existing* rules rather than adding duplicate `.panel`/`.report-section` blocks inside the same media query. The existing dual-mechanism print pattern (`.print-layout .grid` at line 295-297, mirrored by `@media print { .grid {...} }` at line 491-493) uses a bare `.print-layout` descendant selector with no element prefix — Task 5 follows that exact convention (`.print-layout .panel`, not `main.print-layout .panel`).

---

### Task 1: Add jsdom and React Testing Library to the test setup

This task has no dependents that need a specific API shape beyond "tests can render React components and assert on jsdom output" — but every later task's tests depend on it existing and actually working, including the specific claim that jsdom's native `<details>`/`<summary>` toggle behavior works, since Tasks 2–4 build controlled disclosures on top of it.

**Files:**
- Modify: `vite.config.ts`, `tsconfig.json`, `package.json`
- Create: `tests/setupTests.ts`, `tests/lazyDisclosureFoundation.test.tsx`

**Interfaces: Produces**
- `vite.config.ts` now has a `test: { environment: 'jsdom', setupFiles: ['./tests/setupTests.ts'] }` block.
- `package.json` script: `"typecheck": "tsc -p tsconfig.json --noEmit"` — **this is the exact command every later task's "tsc verification" step should run.**
- `tsconfig.json`'s `include` now covers `["src", "tests"]`.
- Confirmed working: `render`, `screen`, `fireEvent` from `@testing-library/react`; jest-dom matchers available on `expect(...)` inside any `.test.tsx` file under `tests/`.

Steps:

- [ ] 1. Run `npm view jsdom version`, `npm view @testing-library/react version`, `npm view @testing-library/jest-dom version` to confirm current versions resolve and are compatible with React 19 and `vitest@^4.1.10`.
- [ ] 2. Run `npm install --save-dev jsdom @testing-library/react @testing-library/jest-dom`.
- [ ] 3. Edit `vite.config.ts` to add a `test` block:
  ```ts
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  export default defineConfig({
    plugins: [react()],
    base: './',
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setupTests.ts'],
    },
  });
  ```
- [ ] 4. Create `tests/setupTests.ts`:
  ```ts
  import '@testing-library/jest-dom/vitest';
  import { afterEach } from 'vitest';
  import { cleanup } from '@testing-library/react';

  afterEach(() => {
    cleanup();
  });
  ```
- [ ] 5. Edit `tsconfig.json`'s `include` array to add `"tests"`:
  ```json
  "include": ["src", "tests"]
  ```
- [ ] 6. Add a `typecheck` script to `package.json`'s `"scripts"` block, alongside the existing `test` script:
  ```json
  "typecheck": "tsc -p tsconfig.json --noEmit",
  ```
- [ ] 7. Create `tests/lazyDisclosureFoundation.test.tsx` — a smoke test establishing jsdom actually supports native `<details>`/`<summary>` interactive toggling (Tasks 2–4 depend on this being true, not assumed):
  ```tsx
  import { describe, expect, it, vi } from "vitest";
  import { fireEvent, render, screen, waitFor } from "@testing-library/react";

  describe("jsdom native <details> support", () => {
    it("toggles open on summary click and fires a toggle event", async () => {
      const onToggle = vi.fn();
      render(
        <details onToggle={(event) => onToggle(event.currentTarget.open)}>
          <summary>Show more</summary>
          <p>Hidden content</p>
        </details>,
      );
      const details = screen.getByText("Hidden content").closest("details")!;
      expect(details.open).toBe(false);
      fireEvent.click(screen.getByText("Show more"));
      expect(details.open).toBe(true);
      // jsdom queues the native "toggle" event (and thus React's onToggle
      // handler) on a task rather than dispatching it synchronously with
      // the click, even though `open` itself flips synchronously above.
      await waitFor(() => expect(onToggle).toHaveBeenCalledWith(true));
    });
  });
  ```
- [ ] 8. Run `npx tsc -p tsconfig.json --noEmit` and `npx vitest run tests/lazyDisclosureFoundation.test.tsx` and confirm both pass with zero errors/failures. If jsdom's `<details>` toggle support turns out incomplete for the installed version, this is the point to discover it and adapt (e.g. manually dispatching a `toggle` event in later tests) before Task 2 is built on a false assumption — report back as DONE_WITH_CONCERNS if so, don't silently work around it.
- [ ] 9. Run the full existing suite (`npm test`) to confirm the new `test` block and `include` change haven't broken any existing test file.
- [ ] 10. Commit: `git commit -m "Add jsdom and React Testing Library for component-level tests"`.

---

### Task 2: `LazyDisclosure` — a reusable controlled disclosure component

Standalone, independently testable component with no dependency on `App.tsx` or `OverviewCards.tsx`. Tasks 3 and 4 both consume it.

**Timing note (established by Task 1's implementation, see the ledger's Task 1 entry):** jsdom 30
dispatches the native `<details>` `toggle` event — and therefore React's `onToggle` handler, which
drives `LazyDisclosure`'s lazy-mount state — on a queued task, not synchronously within the click's
event tick. `details.open` itself flips synchronously, but anything gated on `onToggle` does not.
Every test below that expects an `onToggle`-driven side effect (mounting/unmounting `children()`)
after `fireEvent.click(...)` uses the `clickAndFlush` helper and an `async` test body instead of a
bare synchronous `fireEvent.click` + assertion. When a test performs multiple sequential toggles,
flush after each one — do not fire several clicks back-to-back unflushed, since the queued native
toggle event's ordering under rapid unflushed clicks is unverified.

**Files:**
- Create: `src/components/LazyDisclosure.tsx`, `tests/lazyDisclosure.test.tsx`

**Interfaces: Produces**
```ts
export interface LazyDisclosureProps {
  summary: ReactNode;
  children: () => ReactNode;
  className?: string;
  summaryClassName?: string;
  open?: boolean;
  defaultOpen?: boolean;
  keepMounted?: boolean; // default true
  onToggle?: (open: boolean) => void;
}
export function LazyDisclosure(props: LazyDisclosureProps): JSX.Element;
```

Steps:

- [ ] 1. Create `src/components/LazyDisclosure.tsx`:
  ```tsx
  import { useState, type ReactNode } from "react";

  export interface LazyDisclosureProps {
    /** Rendered inside the native <summary> element. */
    summary: ReactNode;
    /** Invoked only when the section should be rendered — this is what defers computation. */
    children: () => ReactNode;
    className?: string;
    summaryClassName?: string;
    /** Controlled open state. Omit for uncontrolled (internal) state. */
    open?: boolean;
    /** Initial state when uncontrolled. Default false. */
    defaultOpen?: boolean;
    /**
     * Whether rendered content stays mounted (just visually collapsed by the
     * native <details> UA stylesheet) after the first time it opens, so
     * re-opening is instant. Default true. Callers that need the closed DOM
     * to contain zero descendant nodes even after a prior open (e.g. a
     * force-opened print pass) MUST pass false explicitly — see Task 4.
     */
    keepMounted?: boolean;
    onToggle?: (open: boolean) => void;
  }

  export function LazyDisclosure({
    summary,
    children,
    className,
    summaryClassName,
    open: openProp,
    defaultOpen = false,
    keepMounted = true,
    onToggle,
  }: LazyDisclosureProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
    const [hasOpened, setHasOpened] = useState(defaultOpen);
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : uncontrolledOpen;
    const shouldRender = open || (keepMounted && hasOpened);
    return (
      <details
        className={className}
        open={open}
        onToggle={(event) => {
          const next = event.currentTarget.open;
          if (next) setHasOpened(true);
          // Guard: a forced (controlled) open — e.g. print-layout forcing this
          // disclosure open regardless of what the user had it set to — still
          // fires a native "toggle" event in current Chromium/jsdom. We must
          // NOT let that overwrite the user's own uncontrolled preference, or
          // the disclosure would stay stuck open after print restores.
          if (!isControlled) setUncontrolledOpen(next);
          onToggle?.(next);
        }}
      >
        <summary className={summaryClassName}>{summary}</summary>
        {shouldRender ? children() : null}
      </details>
    );
  }
  ```
- [ ] 2. Create `tests/lazyDisclosure.test.tsx` covering:
  1. Uncontrolled: closed by default; clicking the summary opens it and calls `children()` for the first time (assert via a `vi.fn()` render-prop spy that it was called 0 times before click, 1 time after).
  2. `keepMounted` default (`true`): open → close → re-open does not call the children spy a second time (still mounted, just visually collapsed); content is still present in the DOM while closed (`details.open === false` but the spy-rendered node is still queryable, proving the "instant re-toggle" default).
  3. `keepMounted={false}`: open → close → re-open calls the children spy again each time it opens, and while closed, `screen.queryByText(...)` for content rendered by the spy returns `null` (nothing in the DOM).
  4. Controlled forced-open guard: render with `open={true}` (simulating a forced/print state) with no prior user interaction, then re-render with `open={undefined}` (print ending) — assert the disclosure reports `open === false` again (i.e. the forced toggle event did not clobber the uncontrolled fallback state). Simulate the browser firing a native `toggle` event during the forced-open render via `fireEvent(details, new Event('toggle'))` to reproduce the exact race this guard protects against.
  5. Accessibility/keyboard equivalence: assert the rendered root is a real `<details>` element (`tagName === 'DETAILS'`) with a real `<summary>` child and no custom `role`/`tabIndex`/`onKeyDown` overrides — i.e. this is verifiably just native `<details>` semantics, not a reimplementation, so keyboard/screen-reader behavior is equivalent by construction rather than by a jsdom accessibility assertion (jsdom does not implement a full accessibility tree, so this is the correct/only thing `tsc`+`vitest` can actually verify here).

  Full test file:
  ```tsx
  import { describe, expect, it, vi } from "vitest";
  import { fireEvent, render, screen } from "@testing-library/react";
  import { LazyDisclosure } from "../src/components/LazyDisclosure";

  /**
   * jsdom dispatches the native <details> "toggle" event (and thus React's
   * onToggle handler) on a queued task, not synchronously within the click's
   * event tick, even though details.open itself flips synchronously. Flush
   * one tick after any click whose effect depends on onToggle having run.
   */
  async function clickAndFlush(element: HTMLElement) {
    fireEvent.click(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  describe("LazyDisclosure", () => {
    it("does not render children until opened (uncontrolled)", async () => {
      const renderChildren = vi.fn(() => <p>Content</p>);
      render(<LazyDisclosure summary="Show">{renderChildren}</LazyDisclosure>);
      expect(renderChildren).not.toHaveBeenCalled();
      await clickAndFlush(screen.getByText("Show"));
      expect(renderChildren).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("keeps content mounted after closing when keepMounted defaults to true", async () => {
      const renderChildren = vi.fn(() => <p>Content</p>);
      render(<LazyDisclosure summary="Show">{renderChildren}</LazyDisclosure>);
      const summary = screen.getByText("Show");
      await clickAndFlush(summary); // open
      await clickAndFlush(summary); // close
      expect(renderChildren).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Content")).toBeInTheDocument();
      const details = summary.closest("details")!;
      expect(details.open).toBe(false);
      await clickAndFlush(summary); // re-open
      expect(renderChildren).toHaveBeenCalledTimes(1);
    });

    it("unmounts content on close and recomputes on re-open when keepMounted is false", async () => {
      const renderChildren = vi.fn(() => <p>Content</p>);
      render(
        <LazyDisclosure summary="Show" keepMounted={false}>
          {renderChildren}
        </LazyDisclosure>,
      );
      const summary = screen.getByText("Show");
      await clickAndFlush(summary); // open
      expect(renderChildren).toHaveBeenCalledTimes(1);
      await clickAndFlush(summary); // close
      expect(screen.queryByText("Content")).toBeNull();
      await clickAndFlush(summary); // re-open
      expect(renderChildren).toHaveBeenCalledTimes(2);
    });

    it("does not let a forced controlled open leak into uncontrolled state afterward", async () => {
      const renderChildren = vi.fn(() => <p>Content</p>);
      const { rerender } = render(
        <LazyDisclosure summary="Show" open={true}>
          {renderChildren}
        </LazyDisclosure>,
      );
      const details = screen.getByText("Show").closest("details")!;
      fireEvent(details, new Event("toggle"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      rerender(<LazyDisclosure summary="Show">{renderChildren}</LazyDisclosure>);
      expect(details.open).toBe(false);
    });

    it("renders native <details>/<summary> with no custom interaction handling", () => {
      render(<LazyDisclosure summary="Show">{() => <p>Content</p>}</LazyDisclosure>);
      const details = screen.getByText("Show").closest("details")!;
      expect(details.tagName).toBe("DETAILS");
      expect(details.getAttribute("role")).toBeNull();
      expect(details.getAttribute("tabindex")).toBeNull();
      const summary = screen.getByText("Show");
      expect(summary.tagName).toBe("SUMMARY");
    });
  });
  ```
- [ ] 3. Run `npm run typecheck` and `npx vitest run tests/lazyDisclosure.test.tsx`; confirm all pass.
- [ ] 4. Commit: `git commit -m "Add LazyDisclosure, a controlled disclosure that defers mounting until opened"`.

**Manual verification (not automated):** a human should tab to each disclosure summary once wired into the app (Tasks 3-4) and confirm Enter/Space toggles it and screen-reader software announces "expanded"/"collapsed" the same way it does for the pre-existing native `<details>` (e.g. the header export-options menu) — this is inherent in using a real `<details>`/`<summary>` pair, but worth a spot check.

---

### Task 3: Apply `LazyDisclosure` to the 365-day and all-time overview cards (§5.1)

Depends on Task 2. Does not touch the 30-day section (spec: "this milestone does not change it").

**Files:**
- Modify: `src/components/OverviewCards.tsx`
- Create: `tests/overviewCardsLazy.test.tsx`
- Modify: `docs/ARCHITECTURE.md` (§7, one-line note)

**Interfaces:**
- Consumes: `LazyDisclosure` from Task 2.
- Produces: `OverviewCards` component signature is unchanged (`{ records, periodLabel, collapsible? }`); its collapsible path is now backed by `LazyDisclosure` with `keepMounted` at its `true` default.

Steps:

- [ ] 1. Edit `src/components/OverviewCards.tsx` to import `LazyDisclosure` and wrap the existing per-metric computation in a function, only calling it eagerly for the non-collapsible (30-day) path:
  ```tsx
  import type { HealthData } from "../shared/types";
  import {
    boundsOf,
    change,
    decimalsByMetric,
    format,
    highlights,
    labels,
    latest,
    median,
  } from "../report";
  import { LazyDisclosure } from "./LazyDisclosure";

  export function OverviewCards({
    records,
    periodLabel,
    collapsible = false,
  }: {
    records: HealthData["records"];
    periodLabel: string;
    collapsible?: boolean;
  }) {
    const renderCards = () => (
      <div className="cards">
        {highlights.map((metric) => {
          const item = latest(records, metric);
          const values = records
            .filter((record) => record.metric === metric)
            .map((record) => record.value);
          const value =
            metric === "weight" ? item?.value : median(records, metric);
          const delta = metric === "weight" ? change(records, metric) : undefined;
          const range = values.length
            ? metric === "heartRate"
              ? boundsOf(values)
              : { min: Math.min(...values), max: Math.max(...values) }
            : undefined;
          return (
            <article className="card" key={metric}>
              <span>{labels[metric]}</span>
              <strong>
                {value === undefined || !item ? "—" : format(value, item.unit)}
              </strong>
              <small>
                {value === undefined || !item
                  ? "No records"
                  : metric === "weight"
                    ? delta === undefined
                      ? `Latest: ${new Date(item.date).toLocaleDateString()}`
                      : `Δ ${delta >= 0 ? "+" : "−"}${format(Math.abs(delta), item.unit)}`
                    : metric === "heartRate"
                      ? `Median · Sustained min ${format(range!.min, "", decimalsByMetric[metric])} · max ${format(range!.max, "", decimalsByMetric[metric])}`
                      : `Median · Min ${format(range!.min, "", decimalsByMetric[metric])} · Max ${format(range!.max, "", decimalsByMetric[metric])}`}
              </small>
            </article>
          );
        })}
      </div>
    );
    if (collapsible)
      return (
        <LazyDisclosure
          className="overview-card-section"
          summary={periodLabel}
          summaryClassName="cards-period"
        >
          {renderCards}
        </LazyDisclosure>
      );
    return (
      <section className="overview-card-section">
        <p className="cards-period">{periodLabel}</p>
        {renderCards()}
      </section>
    );
  }
  ```
  Note: `LazyDisclosure`'s default `keepMounted: true` is intentionally left unset (uses the default) here, per §5.1's explicit instruction: "the default should retain them to make repeated toggling instant."
- [ ] 2. Create `tests/overviewCardsLazy.test.tsx`. Uses the same `clickAndFlush` timing helper
  established in Task 2 (jsdom's native `<details>` `toggle` event, which `LazyDisclosure`'s
  mount state depends on, fires on a queued task rather than synchronously with the click):
  ```tsx
  import { describe, expect, it, vi, afterEach } from "vitest";
  import { fireEvent, render, screen } from "@testing-library/react";
  import * as report from "../src/report";
  import { OverviewCards } from "../src/components/OverviewCards";
  import type { HealthRecord } from "../src/shared/types";

  async function clickAndFlush(element: HTMLElement) {
    fireEvent.click(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const recordsA: HealthRecord[] = [
    { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
    { metric: "heartRate", date: "2026-01-01T09:00:00.000Z", value: 60, unit: "bpm" },
  ];
  const recordsB: HealthRecord[] = [
    { metric: "weight", date: "2026-02-01T09:00:00.000Z", value: 80, unit: "kg" },
    { metric: "heartRate", date: "2026-02-01T09:00:00.000Z", value: 70, unit: "bpm" },
  ];

  describe("OverviewCards lazy collapsed sections", () => {
    afterEach(() => vi.restoreAllMocks());

    it("computes only the always-open 30-day section on initial render", () => {
      const latestSpy = vi.spyOn(report, "latest");
      render(
        <>
          <OverviewCards records={recordsA} periodLabel="Last 30 days" />
          <OverviewCards records={recordsA} periodLabel="Last year" collapsible />
          <OverviewCards records={recordsA} periodLabel="All time" collapsible />
        </>,
      );
      expect(latestSpy.mock.calls.length).toBe(report.highlights.length);
    });

    it("computes a collapsed section's cards exactly once, on first open", async () => {
      const latestSpy = vi.spyOn(report, "latest");
      render(<OverviewCards records={recordsA} periodLabel="Last year" collapsible />);
      const before = latestSpy.mock.calls.length;
      await clickAndFlush(screen.getByText("Last year"));
      expect(latestSpy.mock.calls.length).toBe(before + report.highlights.length);
      expect(screen.getByText(report.labels.weight)).toBeInTheDocument();
    });

    it("does not recompute on repeated toggling (instant re-open)", async () => {
      const latestSpy = vi.spyOn(report, "latest");
      render(<OverviewCards records={recordsA} periodLabel="Last year" collapsible />);
      const summary = screen.getByText("Last year");
      await clickAndFlush(summary); // open
      const afterFirstOpen = latestSpy.mock.calls.length;
      await clickAndFlush(summary); // close
      await clickAndFlush(summary); // re-open
      expect(latestSpy.mock.calls.length).toBe(afterFirstOpen);
    });

    it("updates an already-opened section's values when the records prop changes", async () => {
      const { rerender } = render(
        <OverviewCards records={recordsA} periodLabel="Last year" collapsible />,
      );
      await clickAndFlush(screen.getByText("Last year"));
      expect(screen.getByText(/70/)).toBeInTheDocument();
      rerender(<OverviewCards records={recordsB} periodLabel="Last year" collapsible />);
      expect(screen.getByText(/80/)).toBeInTheDocument();
    });

    it("renders a native <details>/<summary> pair for collapsible sections", () => {
      render(<OverviewCards records={recordsA} periodLabel="Last year" collapsible />);
      const details = screen.getByText("Last year").closest("details")!;
      expect(details.tagName).toBe("DETAILS");
    });
  });
  ```
- [ ] 3. Run `npm run typecheck` and `npx vitest run tests/overviewCardsLazy.test.tsx`; confirm all pass.
- [ ] 4. Update `docs/ARCHITECTURE.md` §7's sentence about last-year/all-time summaries being present in collapsed `<details>` sections, adding a one-line note that their card values are now computed lazily on first open. Do not rewrite the surrounding paragraph.
- [ ] 5. Commit: `git commit -m "Defer 365-day/all-time overview card computation until their disclosure opens"`.

**Design decision (documented per spec instruction to "explicitly define whether closed summaries are part of the PDF"):** closed 365-day/all-time overview disclosures are **not** forced open during print layout, and their card values are simply absent from PDF output when the user left them collapsed — identical to current behavior, since a closed native `<details>` already contributed nothing to print output before this milestone. This differs deliberately from the Detailed Measurements section (Task 4), which the spec requires to always be present in the PDF regardless of viewer state.

---

### Task 4: Lazy "Detailed measurements" disclosure, coordinated with `healthAtlasPrintLayout` (§5.2)

Depends on Task 2. This is the highest-risk task because it must not regress the existing, already-working PDF pipeline (`electron/main.ts:134-156` calling `window.healthAtlasPrintLayout`, defined in `src/App.tsx:70-156`).

**Files:**
- Modify: `src/App.tsx` (the `<section className="print-report">` block, currently around lines 398-432)
- Modify: `src/styles.css` (hide the new toggle control in print)
- Create: `tests/detailedReportLazy.test.tsx`
- Modify: `docs/ARCHITECTURE.md` (§8, §9.2 — one-line notes each)

**Interfaces:**
- Consumes: `LazyDisclosure` from Task 2.
- Produces: no new exported functions/types (all consumers are internal to `App.tsx`). New CSS selector `.detailed-report-toggle`.

Steps:

- [ ] 1. Edit `src/App.tsx`: import `LazyDisclosure`, then replace the always-mounted tables inside `<section className="print-report">` with a `LazyDisclosure` wrapping only the tables — the heading and intro paragraph stay always-mounted:
  ```tsx
  <section className="print-report">
    <h2>Detailed measurements</h2>
    <p>
      Report period: {from || "Beginning"} — {to}. Each table below lists up
      to {tableRowLimit.toLocaleString()} of the most recent days with data
      per metric; a note appears under any table showing fewer days than are
      available, or where a metric's own data starts later or ends earlier
      than the selected period.
    </p>
    {/*
      open={printLayout || undefined} forces this section open whenever
      printLayout is true; when printLayout is false it falls back
      (undefined) to LazyDisclosure's own uncontrolled state, i.e. whatever
      the user had it set to. Because setPrintLayout inside
      healthAtlasPrintLayout is wrapped in flushSync (see the useEffect
      above), this force-open commits synchronously in the same pass,
      satisfying the print-layout protocol's steps 1 ("set print layout
      synchronously") and 2 ("ensure detailed tables and fixed-size charts
      are committed") as a single atomic state update — no additional
      coordination code is needed in the healthAtlasPrintLayout bridge
      itself.

      keepMounted={false} is required here (unlike OverviewCards' lazy
      sections) — without it, the first PDF export would permanently mount
      these tables in the viewer DOM from then on, even after visually
      re-closing, because LazyDisclosure's "keepMounted: true" default
      never re-checks whether the current open state came from a forced
      controlled prop or genuine user interaction.

      No explicit "restore previous viewer disclosure state" code is
      needed: because the forced-open value is derived from printLayout
      rather than stored as a separate flag, and LazyDisclosure's
      controlled-open guard prevents the forced toggle from overwriting the
      user's own uncontrolled preference, the disclosure automatically
      reverts to exactly what it was once printLayout goes back to false —
      which electron/main.ts's existing `finally` block already guarantees
      happens even if PDF generation throws or the save dialog is
      canceled.
    */}
    <LazyDisclosure
      className="detailed-report-disclosure"
      summary="Show detailed measurements"
      summaryClassName="detailed-report-toggle"
      open={printLayout || undefined}
      keepMounted={false}
    >
      {() => (
        <>
          <VitalsReportTable records={records} from={from} to={to} metadata={metadata} />
          <ActivityReportTable records={records} from={from} to={to} metadata={metadata} />
          <WalkingReportTable records={records} from={from} to={to} metadata={metadata} />
          <NutritionReportTable records={records} from={from} to={to} metadata={metadata} />
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
                metadata={metadata}
              />
            ))}
        </>
      )}
    </LazyDisclosure>
  </section>
  ```
- [ ] 2. Add print CSS to `src/styles.css` so the new toggle control (which has no equivalent in the pre-Milestone-2 output) doesn't appear in the PDF, inside the existing `@media print { ... }` block's action-hiding rule (around line 422-426):
  ```diff
     .header-actions,
     .controls,
  -  .notice {
  +  .notice,
  +  .detailed-report-toggle {
       display: none;
     }
  ```
- [ ] 3. Create `tests/detailedReportLazy.test.tsx`. Build a small harness component mirroring the `print-report` section's structure (rather than rendering all of `App`, which needs a full `data`/Electron-bridge setup out of scope for this task) — use a minimal fixture with one supported metric so `VitalsReportTable` has real rows to assert on:
  Uses the same `clickAndFlush` timing helper established in Task 2 (jsdom's native `<details>`
  `toggle` event, which `LazyDisclosure`'s mount state depends on, fires on a queued task rather
  than synchronously with the click):
  ```tsx
  import { describe, expect, it, vi, afterEach } from "vitest";
  import { fireEvent, render, screen } from "@testing-library/react";
  import { LazyDisclosure } from "../src/components/LazyDisclosure";
  import { VitalsReportTable } from "../src/components/tables/VitalsReportTable";
  import { rangeMetadata } from "../src/report";
  import type { HealthRecord } from "../src/shared/types";

  async function clickAndFlush(element: HTMLElement) {
    fireEvent.click(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const records: HealthRecord[] = [
    { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
    { metric: "weight", date: "2026-01-02T09:00:00.000Z", value: 71, unit: "kg" },
  ];
  const metadata = rangeMetadata(records);

  function DetailedReportHarness({ printLayout }: { printLayout: boolean }) {
    return (
      <LazyDisclosure
        summary="Show detailed measurements"
        summaryClassName="detailed-report-toggle"
        open={printLayout || undefined}
        keepMounted={false}
      >
        {() => (
          <VitalsReportTable records={records} from="" to="" metadata={metadata} />
        )}
      </LazyDisclosure>
    );
  }

  describe("Detailed measurements lazy disclosure", () => {
    afterEach(() => vi.restoreAllMocks());

    it("has no table rows or SVGs in the closed viewer DOM", () => {
      const { container } = render(<DetailedReportHarness printLayout={false} />);
      expect(screen.queryAllByRole("row").length).toBe(0);
      expect(container.querySelectorAll("svg").length).toBe(0);
    });

    it("renders the existing table content once opened", async () => {
      render(<DetailedReportHarness printLayout={false} />);
      await clickAndFlush(screen.getByText("Show detailed measurements"));
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1); // header + data rows
    });

    it("mounts full content when printLayout is forced true, regardless of prior viewer state", () => {
      const { rerender } = render(<DetailedReportHarness printLayout={false} />);
      expect(screen.queryAllByRole("row").length).toBe(0);
      rerender(<DetailedReportHarness printLayout={true} />);
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });

    it("returns to a zero-row closed DOM after printLayout reverts to false, when never opened by the user", () => {
      const { rerender } = render(<DetailedReportHarness printLayout={false} />);
      rerender(<DetailedReportHarness printLayout={true} />);
      rerender(<DetailedReportHarness printLayout={false} />);
      expect(screen.queryAllByRole("row").length).toBe(0);
    });

    it("restores the user's own open choice after a print cycle, not just the closed default", async () => {
      const { rerender } = render(<DetailedReportHarness printLayout={false} />);
      await clickAndFlush(screen.getByText("Show detailed measurements")); // user opens it
      rerender(<DetailedReportHarness printLayout={true} />); // print forces open
      rerender(<DetailedReportHarness printLayout={false} />); // print ends
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });

    it("does not move focus when content mounts, on user open or forced print-open", async () => {
      const { rerender } = render(<DetailedReportHarness printLayout={false} />);
      const summary = screen.getByText("Show detailed measurements");
      summary.focus();
      await clickAndFlush(summary);
      expect(document.activeElement).toBe(summary);
      rerender(<DetailedReportHarness printLayout={true} />);
      expect(document.activeElement).toBe(summary);
    });
  });
  ```
- [ ] 4. Run `npm run typecheck` and `npx vitest run tests/detailedReportLazy.test.tsx`; confirm all pass.
- [ ] 5. Run the full existing suite (`npm test`) to confirm no regression in `tests/report.test.ts`/`tests/export.test.ts`.
- [ ] 6. Update `docs/ARCHITECTURE.md` §8 ("The detailed section is part of the same React document and is available in both viewer and PDF modes") to note it is now lazily mounted in viewer mode and force-mounted during print preparation; update the §9.2 sequence description's "flushSync print state" step to note this now also commits the detailed report's mount state in the same pass. One line each, do not rewrite surrounding text.
- [ ] 7. Commit: `git commit -m "Lazily mount the detailed measurements tables, force-open during print"`.

**Manual verification (not automated):** generate a real PDF (standard and compact) from the running Electron app with a synthetic export and confirm the detailed tables appear identically to pre-Milestone-2 output regardless of whether "Show detailed measurements" was left open or closed in the viewer beforehand — jsdom cannot execute Electron's `printToPDF`/Chromium print pipeline, so this is inherently a manual/visual check per the project's existing "Manual visual checks" test-plan category (speed_plan.md §11).

---

### Task 5: Off-screen containment for dashboard panels and report sections (§5.3)

CSS-only — no component changes needed, since `.panel` (chart cards) and `.report-section` (each detailed table, from Task 4's now-lazily-mounted tree) already exist as classNames on the relevant elements today.

**Files:**
- Modify: `src/styles.css`
- Create: `tests/containmentStyles.test.ts`

**Interfaces:** No new TS interfaces. CSS additions to the existing `.panel`, `.report-section` rules and their existing `@media print` counterparts in `src/styles.css`.

Steps:

- [ ] 1. Edit `src/styles.css`: add containment to the existing base `.panel` rule (lines 302-305) and `.report-section` rule (lines 367-370):
  ```diff
   .panel {
     padding: 18px;
     min-width: 0;
  +  content-visibility: auto;
  +  contain-intrinsic-size: auto 320px;
   }
  ```
  ```diff
   .report-section {
     break-inside: avoid;
     margin: 28px 0;
  +  content-visibility: auto;
  +  contain-intrinsic-size: auto 420px;
   }
  ```
- [ ] 2. Add the synchronous class-based override, matching the existing dual-mechanism pattern used for `.print-layout .grid` (lines 295-297) — a bare `.print-layout` descendant selector, not `main.print-layout`. Insert this new rule immediately after the existing `.print-layout .grid` rule:
  ```diff
   .print-layout .grid {
     grid-template-columns: 1fr;
   }
  +.print-layout .panel,
  +.print-layout .report-section {
  +  content-visibility: visible;
  +  contain-intrinsic-size: none;
  +}
  ```
- [ ] 3. Merge the `@media print` override into the **existing** `.panel` and `.report-section` rules already inside that media query (lines 494-496 and 506-508) — do NOT add new duplicate `.panel {}`/`.report-section {}` blocks inside `@media print`:
  ```diff
     .panel {
       break-inside: avoid;
  +    content-visibility: visible;
  +    contain-intrinsic-size: none;
     }
  ```
  ```diff
     .report-section {
       page-break-inside: avoid;
  +    content-visibility: visible;
  +    contain-intrinsic-size: none;
     }
  ```
- [ ] 4. Create `tests/containmentStyles.test.ts` — a plain (no jsdom/RTL needed) source-level regression test reading `src/styles.css` and asserting via string/regex matching that containment is applied and disabled in print:
  ```ts
  import { describe, expect, it } from "vitest";
  import { readFileSync } from "node:fs";

  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

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
  ```
  If `@media print`'s closing brace detection regex above doesn't match this file's exact formatting, adjust it to reliably capture the media query block — the intent (assert containment is disabled somewhere inside the real `@media print` block for both selectors) is what's load-bearing, not the exact regex.
- [ ] 5. Run `npm run typecheck` (sanity check, no TS changes expected) and `npx vitest run tests/containmentStyles.test.ts`.
- [ ] 6. Commit: `git commit -m "Add off-screen containment to panels and report sections, disabled in print"`.

**Manual verification (not automated):** jsdom does not implement `content-visibility` paint-skipping, scroll-driven layout, browser "find in page," or accessibility-tree pruning behavior, so none of the following can be verified by `tsc`/`vitest` and must be spot-checked in the running Electron app or a real Chromium window:
- scrolling the dashboard and the (now lazily-mounted, per Task 4) detailed report has no large layout jumps as panels/sections enter and leave the viewport;
- Ctrl+F "find in page" still locates text inside off-screen `.panel`/`.report-section` elements;
- both PDF modes (vector and compact/rasterized) still contain every printable panel/section, confirming the `.print-layout`/`@media print` overrides actually take effect in Chromium's print pipeline (not just present as CSS text, which is all the automated test above can confirm);
- **(added after the final whole-branch review, since it compounds specifically with Task 4)** `.report-section`'s `contain-intrinsic-size: auto 420px` placeholder is far smaller than a detailed table's real rendered height (some run to hundreds of rows). Because Task 4 now unmounts these sections on close, the *first* open after a fresh mount reserves ~420px per section and then jumps to real height as each one scrolls into view — a bigger, more frequent scroll-position disruption than the always-mounted pre-milestone layout ever produced. Watch specifically for this on first-open of the detailed report with a long date range; if it's disruptive in practice, raise the placeholder substantially or drop `content-visibility` from `.report-section` specifically (keeping it on `.panel`) as a follow-up;
- **(added after the final whole-branch review)** `.panel` wraps `MetricChart`/`BloodPressureChart`/`PulsePressureChart`, all of which use Recharts' `ResponsiveContainer` (which sizes itself via `ResizeObserver` against its parent's layout box). A `content-visibility: auto` subtree that hasn't yet been revealed has no layout box to observe, so confirm these charts render at full size immediately on scroll-into-view rather than painting empty/zero-size until a resize fires — this is the most likely screen-mode visual regression from this task and needs an explicit look, not just an assumption that `content-visibility: auto`'s reveal behavior "just works" with a ResizeObserver-driven library.

---

### Task 6: Wrap chart and table sections in `React.memo` (§5.4)

Independent of Tasks 3–5 (only depends on the codebase's existing stable-prop-identity guarantee from Milestone 1), but sequenced last since it's easiest to review once the DOM shapes it wraps (Tasks 3–4) have settled.

**Files:**
- Modify: `src/components/charts/MetricChart.tsx`, `BloodPressureChart.tsx`, `PulsePressureChart.tsx`, `CarbsChart.tsx`, `RangeMetricChart.tsx`, `src/components/tables/ReportTable.tsx`, `VitalsReportTable.tsx`, `ActivityReportTable.tsx`, `WalkingReportTable.tsx`, `NutritionReportTable.tsx`
- Create: `tests/componentMemoization.test.tsx`

**Interfaces:** `MetricChart`, `BloodPressureChart`, `PulsePressureChart`, `CarbsChart`, `RangeMetricChart`, `ReportTable`, `VitalsReportTable`, `ActivityReportTable`, `WalkingReportTable`, `NutritionReportTable` are now `React.memo`-wrapped `const` exports instead of plain `function` exports. Call signatures and prop types are unchanged for every consumer (no changes needed in `App.tsx` from this task).

Steps:

- [ ] 1. Apply the identical mechanical transformation to all ten files listed above: change the file's `react` import to include `memo`, change `export function X({` to `export const X = memo(function X({`, and change the file's final closing `}` (that closes the component function) to `});`.

  Confirmed current first-line import and export-line for each file (verify these still match before editing — re-check by name/content, not blind line-number replacement, since earlier milestones may have shifted exact lines):
  | File | Import line 1 | Export line |
  |---|---|---|
  | `src/components/charts/MetricChart.tsx` | `import { useContext } from "react";` | `export function MetricChart({` |
  | `src/components/charts/BloodPressureChart.tsx` | `import { useContext } from "react";` | `export function BloodPressureChart({` |
  | `src/components/charts/PulsePressureChart.tsx` | `import { useContext } from "react";` | `export function PulsePressureChart({ records }: { records: HealthData["records"] }) {` |
  | `src/components/charts/CarbsChart.tsx` | `import { useContext } from "react";` | `export function CarbsChart({ records }: { records: HealthData["records"] }) {` |
  | `src/components/charts/RangeMetricChart.tsx` | `import { useContext } from "react";` | `export function RangeMetricChart({` |
  | `src/components/tables/ReportTable.tsx` | `import { useContext } from "react";` | `export function ReportTable({` |
  | `src/components/tables/VitalsReportTable.tsx` | `import { useContext } from "react";` | `export function VitalsReportTable({` |
  | `src/components/tables/ActivityReportTable.tsx` | `import { useContext } from "react";` | `export function ActivityReportTable({` |
  | `src/components/tables/WalkingReportTable.tsx` | `import { useContext } from "react";` | `export function WalkingReportTable({` |
  | `src/components/tables/NutritionReportTable.tsx` | `import { useContext } from "react";` | `export function NutritionReportTable({` |

  Example full transformation (`MetricChart.tsx`), showing the exact pattern to replicate in the other nine files:
  ```diff
  -import { useContext } from "react";
  +import { memo, useContext } from "react";
   import {
     Area,
     ...
   } from "recharts";
   ...
  -export function MetricChart({
  +export const MetricChart = memo(function MetricChart({
     metric,
     records,
   }: {
     metric: Metric;
     records: HealthData["records"];
   }) {
     ...
     return (
       <>
         <ResponsiveContainer key={`${metric}-screen`} width="100%" height={210}>
           {chart()}
         </ResponsiveContainer>
       </>
     );
  -}
  +});
  ```
  Deliberately **not** passing a custom `arePropsEqual` comparator anywhere — spec: "Avoid premature custom equality functions." Default shallow comparison is correct because `metric`/`from`/`to` are primitives and `records`/`metadata` are already referentially stable (Milestone 1's `useMemo`s).
- [ ] 2. Create `tests/componentMemoization.test.tsx`:
  ```tsx
  import { describe, expect, it, vi, afterEach } from "vitest";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { useState, type ReactNode } from "react";
  import * as report from "../src/report";
  import { MetricChart } from "../src/components/charts/MetricChart";
  import { ReportTable } from "../src/components/tables/ReportTable";
  import { PrintLayoutContext } from "../src/PrintLayoutContext";
  import { rangeMetadata } from "../src/report";
  import type { HealthRecord } from "../src/shared/types";

  const records: HealthRecord[] = [
    { metric: "weight", date: "2026-01-01T09:00:00.000Z", value: 70, unit: "kg" },
    { metric: "weight", date: "2026-01-02T09:00:00.000Z", value: 71, unit: "kg" },
  ];

  function NoticeHarness({ children }: { children: ReactNode }) {
    const [notice, setNotice] = useState("");
    return (
      <div>
        <button onClick={() => setNotice("unrelated update")}>trigger</button>
        {notice && <p>{notice}</p>}
        {children}
      </div>
    );
  }

  describe("chart/table memoization", () => {
    afterEach(() => vi.restoreAllMocks());

    it("MetricChart does not recompute daily() when only unrelated notice state changes", () => {
      const dailySpy = vi.spyOn(report, "daily");
      render(
        <NoticeHarness>
          <MetricChart metric="weight" records={records} />
        </NoticeHarness>,
      );
      const callsAfterMount = dailySpy.mock.calls.length;
      fireEvent.click(screen.getByText("trigger"));
      expect(dailySpy.mock.calls.length).toBe(callsAfterMount);
    });

    it("MetricChart does recompute when its records prop actually changes", () => {
      const dailySpy = vi.spyOn(report, "daily");
      const { rerender } = render(<MetricChart metric="weight" records={records} />);
      const callsAfterMount = dailySpy.mock.calls.length;
      const updatedRecords: HealthRecord[] = [
        ...records,
        { metric: "weight", date: "2026-01-03T09:00:00.000Z", value: 72, unit: "kg" },
      ];
      rerender(<MetricChart metric="weight" records={updatedRecords} />);
      expect(dailySpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it("MetricChart still updates when print-layout context changes, despite memo", () => {
      const { rerender, container } = render(
        <PrintLayoutContext.Provider value={false}>
          <MetricChart metric="weight" records={records} />
        </PrintLayoutContext.Provider>,
      );
      expect(container.querySelector('[data-pdf-chart-ready="true"]')).toBeNull();
      rerender(
        <PrintLayoutContext.Provider value={true}>
          <MetricChart metric="weight" records={records} />
        </PrintLayoutContext.Provider>,
      );
      expect(container.querySelector('[data-pdf-chart-ready="true"]')).not.toBeNull();
    });

    it("ReportTable does not recompute dailyStats() when only unrelated notice state changes", () => {
      const statsSpy = vi.spyOn(report, "dailyStats");
      const metadata = rangeMetadata(records);
      render(
        <NoticeHarness>
          <ReportTable metric="weight" records={records} from="" to="" metadata={metadata} />
        </NoticeHarness>,
      );
      const callsAfterMount = statsSpy.mock.calls.length;
      fireEvent.click(screen.getByText("trigger"));
      expect(statsSpy.mock.calls.length).toBe(callsAfterMount);
    });
  });
  ```
- [ ] 3. Run `npm run typecheck` and `npx vitest run tests/componentMemoization.test.tsx`; confirm all pass.
- [ ] 4. Run the full suite (`npm test`) to confirm memoizing these components didn't change any existing DOM-visible behavior asserted by Tasks 3–5's tests.
- [ ] 5. Commit: `git commit -m "Wrap chart and table components in React.memo"`.

**Manual verification (not automated):** React DevTools Profiler confirmation that unchanged chart/table rows genuinely skip *committing* (not just skip a spy call) when only `notice` changes — the `vi.spyOn` tests above are a strong proxy (if the derivation function wasn't called, React didn't re-run the component body), but actual commit-skipping as shown in a Profiler flame graph is a real-browser-tool observation outside `tsc`/`vitest`'s reach.
