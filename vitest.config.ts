import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest config — test infrastructure only (no app/runtime impact).
 *
 * Resolves the `@/…` path alias (same mapping as tsconfig.json) so tests can
 * import modules that use it at runtime, e.g. the stack engine. The monitor
 * tests don't rely on the alias (those modules use relative / type-only
 * imports), so this is purely additive and leaves `test:monitor` unchanged.
 */

const rootDir = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

export default defineConfig({
  resolve: {
    // Regex form so only "@/…" matches — never scoped packages like "@supabase/…".
    alias: [{ find: /^@\//, replacement: `${rootDir}/` }],
  },
});
