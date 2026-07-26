/**
 * Coverage manifest for the test SUITES, mirroring scripts/schema-manifest.ts.
 *
 * History: the suite scripts used to name one directory each (`vitest run
 * tests/stack`), so a new `tests/<name>/` ran only if somebody remembered to
 * add a script AND call it from CI. Nothing checked that, and it went wrong
 * exactly as you would expect — tests/text/pluralise.test.ts sat unrun from 14
 * Jul 2026 until it was noticed by hand, a passing test guarding live copy in
 * components/GiftCardsClient.tsx.
 *
 * `npm run test` is now ONE whole-tree run, which makes an unreachable
 * directory structurally impossible rather than merely detectable — a new
 * directory is picked up with no registration step at all. These checks stay
 * because that property is worth defending: re-narrowing the scripts to
 * per-directory runs, or adding a script CI never calls, brings the original
 * bug straight back. They are the regression guard on the collapse.
 *
 * Silence is the whole problem. A missing migration at least reddens the
 * schema manifest; an unreached test directory looks exactly like a directory
 * with nothing wrong in it.
 *
 * PURE — both functions take the world as arguments (directory listing, the
 * scripts map, the workflow text) so the tests can prove they FAIL on a bad
 * input, not merely pass on today's good one.
 */

/**
 * Scripts that run tests: `test` (the whole-tree run) plus any `test:*`.
 * Matching only `test:*` would skip the very script that now does the work.
 */
function isSuiteScript(name: string): boolean {
  return name === "test" || name.startsWith("test:");
}

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
    .filter(([name]) => isSuiteScript(name))
    .map(([, command]) => command);

  return testDirs
    .filter((dir) => !(dir in SUITE_EXEMPT_DIRS))
    .filter((dir) => !suiteCommands.some((cmd) => commandCoversDir(cmd, dir)))
    .map(
      (dir) =>
        `tests/${dir} is not run by any test script. The "test" script should be ` +
        `a whole-tree run ("vitest run tests") that picks up new directories ` +
        `automatically — if you are seeing this, something narrowed it to ` +
        `specific paths, which is the setup that once left tests/text ` +
        `unexecuted for twelve days. Restore the whole-tree run, or add a ` +
        `script covering tests/${dir} AND call it from the quality job in ` +
        `.github/workflows/ci.yml. If the directory is deliberately not run, ` +
        `register it in SUITE_EXEMPT_DIRS (scripts/test-suite-manifest.ts) ` +
        `with the reason.`
    );
}

/**
 * Does the workflow invoke exactly this script?
 *
 * A plain substring test is WRONG here and was: `npm run test:e2e` contains
 * `npm run test`, so the whole-tree run counted as invoked even after its step
 * was deleted from the workflow — the check silently passed while the entire
 * suite stopped running in CI. Any script name that prefixes another has the
 * same hole, so the match must end at a real boundary.
 */
function workflowInvokes(workflowText: string, script: string): boolean {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`npm run ${escaped}(?![\\w:.-])`).test(workflowText);
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
    .filter(isSuiteScript)
    .filter((name) => !workflowInvokes(workflowText, name))
    .map(
      (name) =>
        `${name} is defined in package.json but never runs in CI — add ` +
        `"npm run ${name}" to the quality job in .github/workflows/ci.yml.`
    );
}
