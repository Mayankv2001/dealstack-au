import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fromDbOrDemo,
  resolveDataSourceMode,
  STATIC_PREVIEW_ACK,
  type DataSourceEnv,
  type DbClient,
} from "@/lib/supabase/server";

/**
 * Fail-closed data-source selection. Production runtimes must never silently
 * serve demo/fixture offers: static mode needs the explicit acknowledgement
 * sentence, missing Supabase configuration throws, and unsupported
 * DATA_SOURCE values are rejected rather than guessed. Dev, tests and the
 * `next build` phase keep the explicit static/demo behaviour. No test here
 * touches real credentials.
 */

const env = (overrides: Partial<DataSourceEnv>): DataSourceEnv => ({
  nodeEnv: "development",
  dataSource: undefined,
  staticPreviewAck: undefined,
  isBuildPhase: false,
  ...overrides,
});

const DEMO = [{ id: "demo" }];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveDataSourceMode", () => {
  it("production + unset DATA_SOURCE → database mode", () => {
    expect(
      resolveDataSourceMode(env({ nodeEnv: "production" })),
    ).toBe("database");
  });

  it("production runtime + DATA_SOURCE=static without the ack → fails closed", () => {
    expect(() =>
      resolveDataSourceMode(env({ nodeEnv: "production", dataSource: "static" })),
    ).toThrow(/not authorised in a production runtime/);
  });

  it("production runtime + static with the exact ack sentence → static preview", () => {
    expect(
      resolveDataSourceMode(
        env({
          nodeEnv: "production",
          dataSource: "static",
          staticPreviewAck: STATIC_PREVIEW_ACK,
        }),
      ),
    ).toBe("static");
  });

  it("a wrong or partial ack value never authorises static production", () => {
    for (const ack of ["yes", "true", "serve-demo-data", `${STATIC_PREVIEW_ACK} `]) {
      expect(() =>
        resolveDataSourceMode(
          env({ nodeEnv: "production", dataSource: "static", staticPreviewAck: ack }),
        ),
      ).toThrow(/not authorised/);
    }
  });

  it("development and test static modes stay available without any ack", () => {
    expect(
      resolveDataSourceMode(env({ nodeEnv: "development", dataSource: "static" })),
    ).toBe("static");
    expect(
      resolveDataSourceMode(env({ nodeEnv: "test", dataSource: "static" })),
    ).toBe("static");
  });

  it("the `next build` phase may use static without the runtime ack", () => {
    expect(
      resolveDataSourceMode(
        env({ nodeEnv: "production", dataSource: "static", isBuildPhase: true }),
      ),
    ).toBe("static");
  });

  it("a misspelled DATA_SOURCE fails closed instead of selecting a mode", () => {
    for (const raw of ["statc", "Static ", "demo", "db", "fixtures"]) {
      expect(() => resolveDataSourceMode(env({ dataSource: raw }))).toThrow(
        /Unsupported DATA_SOURCE/,
      );
    }
  });

  it("blank/whitespace DATA_SOURCE means database mode", () => {
    expect(resolveDataSourceMode(env({ dataSource: "  " }))).toBe("database");
  });

  it("error messages name variables only — never credential values", () => {
    try {
      resolveDataSourceMode(
        env({ nodeEnv: "production", dataSource: "static", staticPreviewAck: "s3cret-value" }),
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(String(error)).not.toContain("s3cret-value");
    }
  });
});

describe("fromDbOrDemo production boundary", () => {
  it("production runtime + missing Supabase configuration → throws, never demo data", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("DATA_SOURCE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(
      fromDbOrDemo("test-table", DEMO, async () => [{ id: "db" }]),
    ).rejects.toThrow(/Refusing to serve demo data in a production runtime/);
  });

  it("production runtime + unacknowledged DATA_SOURCE=static → throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("DATA_SOURCE", "static");
    vi.stubEnv("DATA_SOURCE_STATIC_PREVIEW_ACK", "");
    await expect(
      fromDbOrDemo("test-table", DEMO, async () => [{ id: "db" }]),
    ).rejects.toThrow(/not authorised in a production runtime/);
  });

  it("production runtime + exact ack → serves demo data (explicit preview)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("DATA_SOURCE", "static");
    vi.stubEnv("DATA_SOURCE_STATIC_PREVIEW_ACK", STATIC_PREVIEW_ACK);
    await expect(
      fromDbOrDemo("test-table", DEMO, async () => [{ id: "db" }]),
    ).resolves.toEqual(DEMO);
  });

  it("dev/test with absent Supabase env keeps the demo fallback", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATA_SOURCE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(
      fromDbOrDemo("test-table", DEMO, async () => [{ id: "db" }]),
    ).resolves.toEqual(DEMO);
  });

  it("a configured database that errors returns [] — demo data never resurrects", async () => {
    const failing = {} as DbClient;
    await expect(
      fromDbOrDemo(
        "test-table",
        DEMO,
        async () => {
          throw new Error("boom");
        },
        { staticMode: false, client: failing },
      ),
    ).resolves.toEqual([]);
  });

  it("a configured database returning zero rows stays empty", async () => {
    const clientStub = {} as DbClient;
    await expect(
      fromDbOrDemo("test-table", DEMO, async () => [], {
        staticMode: false,
        client: clientStub,
      }),
    ).resolves.toEqual([]);
  });
});
