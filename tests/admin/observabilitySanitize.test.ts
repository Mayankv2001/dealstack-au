import { describe, expect, it } from "vitest";
import { sanitizeDiagnostic, sanitizePath } from "@/lib/observability/sanitize";

describe("observability redaction", () => {
  it("redacts tokens, emails and URL queries", () => {
    const output = sanitizeDiagnostic(
      "Bearer abc.def ghi admin@example.com https://example.com/path?token=secret#x"
    );
    expect(output).not.toContain("abc.def");
    expect(output).not.toContain("admin@example.com");
    expect(output).not.toContain("token=secret");
    expect(output).toContain("https://example.com/path");
  });

  it("strips query and fragment data from reported paths", () => {
    expect(sanitizePath("/search?q=private#result")).toBe("/search");
  });
});
