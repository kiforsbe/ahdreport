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
    // jsdom (v30) flips the `open` property synchronously as part of the
    // default action for the click, but it queues the native `toggle`
    // event -- and therefore React's onToggle handler -- as a separate
    // task, so it does NOT fire within the same synchronous tick as the
    // click. Assert `open` synchronously, but await the callback.
    // See task-1-report.md for the precise finding.
    expect(details.open).toBe(true);
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(true));
  });
});
