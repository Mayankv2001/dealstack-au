import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Run against a production build:
 *
 *   npm run build && npm run test:e2e
 *
 * The webServer block starts `next start` on a dedicated port. In CI there is
 * no Supabase env, so every page serves the deterministic static-fallback
 * data; locally the tests only assert on content that exists in both static
 * and DB modes (e.g. JB Hi-Fi), so they pass either way.
 */

const PORT = 3210;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    // `next start` is a production RUNTIME, so serving static demo data
    // requires the explicit acknowledgement sentence (see
    // resolveDataSourceMode in lib/supabase/server.ts) — this is the
    // intentional, authorised static test configuration.
    command: `DATA_SOURCE=static DATA_SOURCE_STATIC_PREVIEW_ACK=serve-demo-data-not-production PORT=${PORT} npm run start`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
