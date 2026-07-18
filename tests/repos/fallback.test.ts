import { afterEach, describe, expect, it, vi } from "vitest";
import { fromDbOrStatic } from "../../lib/supabase/server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public repository fallback policy", () => {
  it("uses samples when static demo mode is explicit", async () => {
    vi.stubEnv("DATA_SOURCE", "static");
    const query = vi.fn(async () => ["database"]);
    await expect(fromDbOrStatic("offers", ["sample"], query)).resolves.toEqual([
      "sample",
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps unconfigured local development convenient", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATA_SOURCE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(
      fromDbOrStatic("offers", ["sample"], async () => ["database"])
    ).resolves.toEqual(["sample"]);
  });

  it("does not show samples in an unconfigured production environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATA_SOURCE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(
      fromDbOrStatic("offers", ["sample"], async () => ["database"])
    ).resolves.toEqual([]);
  });

  it("preserves a legitimate empty database result", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATA_SOURCE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    await expect(
      fromDbOrStatic("offers", ["sample"], async () => [])
    ).resolves.toEqual([]);
  });

  it("fails closed when a production database query throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATA_SOURCE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    await expect(
      fromDbOrStatic("offers", ["sample"], async () => {
        throw new Error("database unavailable");
      })
    ).resolves.toEqual([]);
  });
});
