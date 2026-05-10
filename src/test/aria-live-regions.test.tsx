// Feature: wcag-3-accessibility, Property 12

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RouteAnnouncer } from "@/components/RouteAnnouncer";
import { CloudSyncIndicator } from "@/components/CloudSyncIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Property 12: aria-live regions pre-exist content injection
 * Validates: Requirements 8.6
 *
 * aria-live regions must be present in the DOM before any content is injected
 * into them. Screen readers only announce changes to regions they have already
 * observed; a region added at the same time as its content will be silently
 * ignored by most AT.
 */

describe("Property 12 — aria-live regions pre-exist content injection", () => {
  // Task 5.3: RouteAnnouncer
  it("RouteAnnouncer renders the aria-live div before any navigation occurs", () => {
    const { container } = render(
      <MemoryRouter>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    const liveRegion = container.querySelector('[aria-live]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.getAttribute("aria-live")).toBe("polite");
  });

  // Task 8.2: CloudSyncIndicator
  it("CloudSyncIndicator renders the aria-live span before any status prop changes", () => {
    const { container } = render(
      <TooltipProvider>
        <CloudSyncIndicator
          status="idle"
          lastSyncAt={null}
          onClick={() => {}}
        />
      </TooltipProvider>
    );

    const liveRegion = container.querySelector('[aria-live]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.getAttribute("aria-live")).toBe("polite");
    expect(liveRegion?.tagName.toLowerCase()).toBe("span");
  });
});
