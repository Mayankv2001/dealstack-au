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
 * This reads the REAL tests/ directory, package.json and CI workflow, so
 * adding tests/<name>/ without a script — or a script the workflow never
 * calls — fails `npm run test:admin` instead of passing silently forever.
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

  it("fails loudly when a new directory has no script — the bug that hid tests/text", () => {
    // A CONTROLLED directory list, not the real tree: asserting an exact
    // count against disk breaks the moment anyone adds a directory, which is
    // precisely the failure this suite exists to make legible.
    const errors = findUnreachableTestDirs(["stack", "newthing"], packageScripts());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("tests/newthing");
    expect(errors[0]).toContain("test:newthing");
  });

  it("would have caught tests/text before it sat unrun for twelve days", () => {
    // The exact historical state: the directory on disk, no script naming it.
    const scriptsWithoutText = Object.fromEntries(
      Object.entries(packageScripts()).filter(([name]) => name !== "test:text")
    );
    const errors = findUnreachableTestDirs(["text"], scriptsWithoutText);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("tests/text");
  });

  it("treats a single whole-tree run as covering every directory", () => {
    // So collapsing the per-directory scripts into one `vitest run tests`
    // satisfies this check rather than tripping it.
    expect(
      findUnreachableTestDirs(testDirsOnDisk(), {
        "test:all": "vitest run tests",
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
