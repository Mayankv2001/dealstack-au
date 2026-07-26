/**
 * Coverage manifest for the test SUITES, mirroring scripts/schema-manifest.ts.
 *
 * The suite scripts name one directory each (`vitest run tests/stack`), so a
 * new `tests/<name>/` runs only if somebody remembers to add a script AND to
 * call it from the CI workflow. Nothing checked that, and it went wrong
 * exactly as you would expect: tests/text/pluralise.test.ts sat unrun from 14
 * Jul 2026 until it was noticed by hand — a passing test guarding live copy in
 * components/GiftCardsClient.tsx, silently never executed.
 *
 * Silence is the whole problem. A missing migration at least reddens the
 * schema manifest; an unreached test directory looks exactly like a directory
 * with nothing wrong in it. These two checks fail closed so the next one
 * cannot hide.
 *
 * PURE — both functions take the world as arguments (directory listing, the
 * scripts map, the workflow text) so the tests can prove they FAIL on a bad
 * input, not merely pass on today's good one.
 */

/** Directories under tests/ that no `test:*` vitest script is expected to run. */
export const SUITE_EXEMPT_DIRS: Record<string, string> = {
  // Support files (HTML captures, JSON fixtures) — no test files of its own.
  fixtures: "fixtures only, contains no test files",
  // Playwright owns browser specs and runs them via `npm run test:e2e`;
  // vitest.config.ts excludes them because loading them under Vitest invokes
  // an incompatible test runtime.
  e2e: "run by Playwright via test:e2e, excluded from vitest by design",
};

/**
 * Which `tests/…` paths a script command runs. A bare `tests` token means the
 * script runs the whole tree, which covers every directory at once — so a
 * later collapse to a single `vitest run tests` satisfies this check instead
 * of tripping it.
 */
function testPathTokens(command: string): string[] {
  return command
    .split(/\s+/)
    .filter((token) => token === "tests" || token.startsWith("tests/"));
}

/** True when `command` runs the directory `tests/<dir>`. */
function commandCoversDir(command: string, dir: string): boolean {
  return testPathTokens(command).some(
    (token) =>
      token === "tests" ||
      token === `tests/${dir}` ||
      token.startsWith(`tests/${dir}/`)
  );
}

/**
 * Directories under tests/ that no `test:*` script would run.
 *
 * @param testDirs   directory names directly under tests/ (not paths)
 * @param scripts    the package.json `scripts` map
 */
export function findUnreachableTestDirs(
  testDirs: readonly string[],
  scripts: Record<string, string>
): string[] {
  const suiteCommands = Object.entries(scripts)
    .filter(([name]) => name.startsWith("test:"))
    .map(([, command]) => command);

  return testDirs
    .filter((dir) => !(dir in SUITE_EXEMPT_DIRS))
    .filter((dir) => !suiteCommands.some((cmd) => commandCoversDir(cmd, dir)))
    .map(
      (dir) =>
        `tests/${dir} is not run by any test:* script — add one to package.json ` +
        `(e.g. "test:${dir}": "node scripts/require-node.cjs 20 && vitest run tests/${dir}"), ` +
        `call it from the quality job in .github/workflows/ci.yml, and list it in ` +
        `the CLAUDE.md commit checklist. If it is deliberately not run, register ` +
        `it in SUITE_EXEMPT_DIRS (scripts/test-suite-manifest.ts) with the reason.`
    );
}

/**
 * Suite scripts that exist but are never invoked by the CI workflow.
 *
 * A script nobody calls reproduces the original bug one step removed: the
 * directory looks covered from package.json while still never running.
 *
 * @param scripts       the package.json `scripts` map
 * @param workflowText  raw text of .github/workflows/ci.yml
 */
export function findUncalledSuiteScripts(
  scripts: Record<string, string>,
  workflowText: string
): string[] {
  return Object.keys(scripts)
    .filter((name) => name.startsWith("test:"))
    .filter((name) => !workflowText.includes(`npm run ${name}`))
    .map(
      (name) =>
        `${name} is defined in package.json but never runs in CI — add ` +
        `"npm run ${name}" to the quality job in .github/workflows/ci.yml.`
    );
}
