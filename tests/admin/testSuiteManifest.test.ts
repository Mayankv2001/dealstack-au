import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUITE_EXEMPT_DIRS,
  findUncalledSuiteScripts,
  findUnreachableTestDirs,
} from "../../scripts/test-suite-manifest";

/**
 * Self-audit for the test suites themselves, alongside the schema manifest
 * next door and for the same reason: a registry maintained by hand needs
 * something that fails when it is not maintained.
 *
 * `npm run test` is now one whole-tree run, so an unreachable directory is
 * structurally impossible rather than merely detected — which could make this
 * suite look pointless. It is not. The INJECTED-INPUT cases below are the
 * point: they prove the checks still fail when the scripts are narrowed back
 * to per-directory runs, or when a script exists that CI never calls. Those
 * are the two ways the collapse could be undone, and the two ways
 * tests/text went unexecuted for twelve days. Deleting these cases would
 * remove the only thing defending the property the collapse bought.
 */

const root = process.cwd();

function testDirsOnDisk(): string[] {
  return readdirSync(join(root, "tests"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function packageScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
}

function ciWorkflowText(): string {
  return readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
}

describe("every test directory is actually run", () => {
  it("finds no unreachable directory in the real tests/ tree", () => {
    expect(findUnreachableTestDirs(testDirsOnDisk(), packageScripts())).toEqual(
      []
    );
  });

  it("fails loudly if the scripts are ever narrowed back to per-directory runs", () => {
    // The exact pre-collapse setup: scripts naming specific paths, and a
    // directory none of them mention. This is what regressing would look like.
    const narrowed = { "test:stack": "vitest run tests/stack" };
    const errors = findUnreachableTestDirs(["stack", "newthing"], narrowed);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("tests/newthing");
  });

  it("would have caught tests/text before it sat unrun for twelve days", () => {
    // The exact historical state, reconstructed: the six directory-specific
    // scripts that existed on 14 Jul 2026, and tests/text named by none.
    const scriptsAsTheyWere = {
      "test:stack": "vitest run tests/stack",
      "test:feeds": "vitest run tests/feeds",
      "test:deals": "vitest run tests/deals",
      "test:admin": "vitest run tests/admin",
      "test:giftcards": "vitest run tests/giftcards",
      "test:decision": "vitest run tests/decision",
    };
    const errors = findUnreachableTestDirs(["text"], scriptsAsTheyWere);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("tests/text");
  });

  it("recognises the whole-tree run under its bare `test` name", () => {
    // The live script is named `test`, not `test:something` — matching only
    // `test:*` would skip the one script that actually runs everything and
    // report every directory as unreachable.
    expect(
      findUnreachableTestDirs(testDirsOnDisk(), {
        test: "node scripts/require-node.cjs 20 && vitest run tests",
      })
    ).toEqual([]);
  });

  it("exempts only fixtures and e2e, each with a stated reason", () => {
    expect(Object.keys(SUITE_EXEMPT_DIRS).sort()).toEqual(["e2e", "fixtures"]);
    for (const reason of Object.values(SUITE_EXEMPT_DIRS)) {
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("keeps the exempt list honest — fixtures really holds no tests", () => {
    const fixtureTests = readdirSync(join(root, "tests", "fixtures"), {
      recursive: true,
    }) as string[];
    expect(fixtureTests.filter((f) => String(f).endsWith(".test.ts"))).toEqual(
      []
    );
  });
});

describe("every suite script is actually called by CI", () => {
  it("finds no defined-but-uncalled suite script", () => {
    expect(findUncalledSuiteScripts(packageScripts(), ciWorkflowText())).toEqual(
      []
    );
  });

  it("does not count `npm run test:e2e` as invoking `test`", () => {
    // The substring bug this check shipped with: `npm run test:e2e` contains
    // `npm run test`, so deleting the whole-tree step from CI still passed —
    // the entire suite could stop running in CI with nothing going red. Any
    // script name that prefixes another has the same hole.
    const errors = findUncalledSuiteScripts(
      { test: "vitest run tests", "test:e2e": "playwright test" },
      "      - run: npm run test:e2e\n"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("test is defined");
  });

  it("still recognises a genuine invocation at a line end or before flags", () => {
    expect(
      findUncalledSuiteScripts(
        { test: "vitest run tests" },
        "      - run: npm run test\n"
      )
    ).toEqual([]);
    expect(
      findUncalledSuiteScripts(
        { test: "vitest run tests" },
        "      - run: npm run test -- --reporter=dot\n"
      )
    ).toEqual([]);
  });

  it("fails loudly when a script exists but the workflow never runs it", () => {
    // A script nobody calls is the same bug one step removed: covered on
    // paper, still never executed.
    const errors = findUncalledSuiteScripts(
      { ...packageScripts(), "test:ghost": "vitest run tests/ghost" },
      ciWorkflowText()
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("test:ghost");
    expect(errors[0]).toContain("ci.yml");
  });
});
