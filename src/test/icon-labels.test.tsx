// Feature: wcag-3-accessibility, Property 13

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CloudSyncIndicator } from "@/components/CloudSyncIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Property 13: Icon-only interactive elements have accessible labels
 * Validates: Requirements 6.3
 *
 * When an icon is the sole content of an Interactive_Element (icon-only button
 * or link), the Interactive_Element SHALL have a non-empty `aria-label`
 * attribute that describes its action.
 *
 * Strategy: render each component known to contain icon-only buttons, then
 * query all buttons and links whose only child is an SVG (no visible text
 * node), and assert each has a non-empty aria-label.
 */

/** Returns true if the element's only meaningful content is an SVG icon. */
function isIconOnly(el: Element): boolean {
  const children = Array.from(el.childNodes).filter(
    (n) => !(n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === ""),
  );
  if (children.length === 0) return false;
  return children.every(
    (n) =>
      n.nodeType === Node.ELEMENT_NODE &&
      (n as Element).tagName.toLowerCase() === "svg",
  );
}

/** Finds all icon-only buttons and links inside a container. */
function findIconOnlyInteractives(container: HTMLElement): Element[] {
  const candidates = Array.from(
    container.querySelectorAll("button, a[href], [role='button'], [role='link']"),
  );
  return candidates.filter(isIconOnly);
}

// ---------------------------------------------------------------------------
// CloudSyncIndicator — icon-only sync button
// ---------------------------------------------------------------------------

describe("Property 13 — CloudSyncIndicator icon-only button has aria-label", () => {
  const STATUSES = ["idle", "syncing", "dirty", "error"] as const;

  it.each(STATUSES)(
    "status='%s': the icon-only button has a non-empty aria-label",
    (status) => {
      const { container } = render(
        <TooltipProvider>
          <CloudSyncIndicator
            status={status}
            lastSyncAt={null}
            onClick={() => {}}
          />
        </TooltipProvider>,
      );

      const iconOnlyButtons = findIconOnlyInteractives(
        container as HTMLElement,
      );

      // There should be at least one icon-only button in this component
      expect(iconOnlyButtons.length).toBeGreaterThan(0);

      // Every icon-only button must have a non-empty aria-label
      for (const btn of iconOnlyButtons) {
        const label = btn.getAttribute("aria-label");
        expect(label, `Button missing aria-label: ${btn.outerHTML}`).toBeTruthy();
        expect(
          label?.trim().length,
          `Button has empty aria-label: ${btn.outerHTML}`,
        ).toBeGreaterThan(0);
      }
    },
  );

  it("aria-label updates to reflect the current status text", () => {
    const { container, rerender } = render(
      <TooltipProvider>
        <CloudSyncIndicator status="idle" lastSyncAt={null} onClick={() => {}} />
      </TooltipProvider>,
    );

    const getLabel = () => {
      const btn = container.querySelector("button");
      return btn?.getAttribute("aria-label") ?? "";
    };

    const idleLabel = getLabel();
    expect(idleLabel).toBeTruthy();

    rerender(
      <TooltipProvider>
        <CloudSyncIndicator
          status="syncing"
          lastSyncAt={null}
          onClick={() => {}}
        />
      </TooltipProvider>,
    );

    const syncingLabel = getLabel();
    expect(syncingLabel).toBeTruthy();
    // The label should change when status changes
    expect(syncingLabel).not.toBe(idleLabel);
  });
});
