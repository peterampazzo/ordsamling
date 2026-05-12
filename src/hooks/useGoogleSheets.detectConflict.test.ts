// Feature: cloud-sync conflict detection (pure helper)
import { describe, it, expect } from "vitest";
import { detectConflict } from "./useGoogleSheets";

describe("detectConflict", () => {
  it("returns false when there are no local changes", () => {
    expect(detectConflict(false, 1000, 500)).toBe(false);
  });

  it("returns false when remote update timestamp is unknown", () => {
    expect(detectConflict(true, null, 500)).toBe(false);
  });

  it("returns false when we have never synced (no baseline to compare against)", () => {
    expect(detectConflict(true, 1000, null)).toBe(false);
  });

  it("returns false when remote was last updated at or before our last sync", () => {
    expect(detectConflict(true, 500, 500)).toBe(false);
    expect(detectConflict(true, 400, 500)).toBe(false);
  });

  it("returns true when local is dirty and remote was updated after last sync", () => {
    expect(detectConflict(true, 1000, 500)).toBe(true);
  });
});
