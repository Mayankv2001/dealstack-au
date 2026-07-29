import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRAMME_TAB_SLUG,
  parseProgrammeTab,
  programmeTabHref,
  programmeTabs,
} from "@/lib/rewards/programmeTabs";

/**
 * The homepage tab strip resolves from a URL parameter, so its input is
 * whatever a link, a bookmark or a hand-edited address bar supplies. Every
 * case below is one of those, and none may render an empty tab.
 */

describe("which programmes are tabbable", () => {
  it("offers exactly the airline programmes, in display order", () => {
    expect(programmeTabs().map((p) => p.shortName)).toEqual([
      "Qantas",
      "Velocity",
    ]);
  });

  it("never offers a supermarket programme as a tab", () => {
    // Flybuys and Everyday Rewards appear INSIDE a tab as feeders — they are
    // where points are earned, not where they land.
    expect(programmeTabs().every((p) => p.tier === "airline")).toBe(true);
  });
});

describe("resolving ?programme=", () => {
  it("defaults when the parameter is absent", () => {
    expect(parseProgrammeTab(undefined).slug).toBe(DEFAULT_PROGRAMME_TAB_SLUG);
  });

  it("defaults on an empty or whitespace value", () => {
    expect(parseProgrammeTab("").slug).toBe(DEFAULT_PROGRAMME_TAB_SLUG);
  });

  it("selects a valid non-default programme", () => {
    expect(parseProgrammeTab("qantas-frequent-flyer").shortName).toBe("Qantas");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(parseProgrammeTab("  QANTAS-FREQUENT-FLYER  ").shortName).toBe(
      "Qantas",
    );
  });

  it("falls back rather than erroring on an unknown slug", () => {
    expect(parseProgrammeTab("not-a-programme").slug).toBe(
      DEFAULT_PROGRAMME_TAB_SLUG,
    );
  });

  it("falls back on a supermarket slug — those are not tabs", () => {
    expect(parseProgrammeTab("flybuys").slug).toBe(DEFAULT_PROGRAMME_TAB_SLUG);
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(parseProgrammeTab(["qantas-frequent-flyer", "flybuys"]).shortName).toBe(
      "Qantas",
    );
  });
});

describe("tab hrefs", () => {
  it("keeps the canonical homepage URL clean for the default tab", () => {
    const [, velocity] = programmeTabs();
    expect(velocity.slug).toBe(DEFAULT_PROGRAMME_TAB_SLUG);
    expect(programmeTabHref(velocity)).toBe("/");
  });

  it("parameterises every other tab", () => {
    const [qantas] = programmeTabs();
    expect(programmeTabHref(qantas)).toBe("/?programme=qantas-frequent-flyer");
  });

  it("round-trips: every tab's href resolves back to that tab", () => {
    for (const tab of programmeTabs()) {
      const href = programmeTabHref(tab);
      const value = new URL(href, "https://example.com").searchParams.get(
        "programme",
      );
      expect(parseProgrammeTab(value ?? undefined).slug).toBe(tab.slug);
    }
  });
});
