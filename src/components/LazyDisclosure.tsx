import { useMemo, useState, type ReactNode } from "react";

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
  // Memoized on [shouldRender, children]: toggling this disclosure's own
  // open state re-renders it without the parent re-rendering, so `children`
  // keeps the same reference and this bails out (no recompute). A real
  // parent-driven data change produces a new `children` closure, which does
  // invalidate the cache and re-render the content.
  const content = useMemo(
    () => (shouldRender ? children() : null),
    [shouldRender, children],
  );
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
      {content}
    </details>
  );
}
