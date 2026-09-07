import { describe, it, expect } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("returns fallback for null", () => {
    expect(safeRedirect(null)).toBe("/dashboard");
  });

  it("rejects protocol-relative URL", () => {
    expect(safeRedirect("//evil.com")).toBe("/dashboard");
  });

  it("rejects absolute URL", () => {
    expect(safeRedirect("https://evil.com/dashboard")).toBe("/dashboard");
  });

  it("rejects backslash-prefixed URL", () => {
    expect(safeRedirect("/\\evil.com")).toBe("/dashboard");
  });

  it("accepts internal path", () => {
    expect(safeRedirect("/sessions/abc")).toBe("/sessions/abc");
  });

  it("rejects unknown prefix", () => {
    expect(safeRedirect("/wat")).toBe("/dashboard");
  });

  it("preserves query string", () => {
    expect(safeRedirect("/dashboard?tab=sessions")).toBe("/dashboard?tab=sessions");
  });
});
