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
