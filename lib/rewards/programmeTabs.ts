import { airlineProgrammes, type RewardsProgramme } from "@/lib/rewards/programmes";

/**
 * Which programme the homepage tab strip is showing.
 *
 * PURE — takes the raw query value and returns a programme, so the page never
 * has to reason about a missing, repeated or hostile `?programme=` value.
 *
 * Only AIRLINE programmes are tabbable. Supermarket programmes appear inside a
 * tab as feeders ("Earn Flybuys, transfer to Velocity"), never as a tab of
 * their own — they are where points are earned, not where they land.
 */

/** Query parameter that selects the tab. */
export const PROGRAMME_TAB_PARAM = "programme";

/**
 * Velocity leads. It currently carries 9 direct offers plus a Flybuys feeder
 * group where Qantas has one, so defaulting to Qantas would open the site on
 * its emptiest programme. This is the only line to change if that flips.
 */
export const DEFAULT_PROGRAMME_TAB_SLUG = "velocity-frequent-flyer";

/** The tabbable programmes, in display order. */
export function programmeTabs(): RewardsProgramme[] {
  return airlineProgrammes();
}

function defaultTab(): RewardsProgramme {
  const tabs = programmeTabs();
  return (
    tabs.find((tab) => tab.slug === DEFAULT_PROGRAMME_TAB_SLUG) ?? tabs[0]
  );
}

/**
 * Resolve `?programme=` to a tab. Anything unrecognised — absent, repeated,
 * a supermarket slug, junk — falls back to the default rather than erroring
 * or rendering an empty tab, so a stale or hand-edited link still shows
 * something real.
 */
export function parseProgrammeTab(
  value: string | string[] | undefined
): RewardsProgramme {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return defaultTab();
  const needle = raw.trim().toLowerCase();
  return programmeTabs().find((tab) => tab.slug === needle) ?? defaultTab();
}

/**
 * Href for a tab. The default needs no parameter, so the canonical homepage
 * URL stays clean — the same shape /gift-cards/weekly uses for its views.
 */
export function programmeTabHref(programme: RewardsProgramme): string {
  return programme.slug === defaultTab().slug
    ? "/"
    : `/?${PROGRAMME_TAB_PARAM}=${programme.slug}`;
}
