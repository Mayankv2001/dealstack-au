import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Browser smoke tests for the flows unit tests cannot cover: real navigation,
 * hydration, and client-side interactivity on the production build. Kept
 * data-light on purpose — they assert on stores/content that exist in both
 * the static fallback and the production database.
 */

test("home: hero search live-filters the stores grid", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Plan the cheapest way to buy" }),
  ).toBeVisible();

  await page
    .getByPlaceholder("Search a store, e.g. Myer, JB Hi-Fi or Amazon")
    .first()
    .fill("jb hi-fi");

  const storesSection = page.locator("#stores");
  await expect(storesSection.getByText("JB Hi-Fi").first()).toBeVisible();
  // The interactive island is hydrated: a clear-search button appears.
  await expect(
    storesSection.getByRole("button", { name: "Clear search" }),
  ).toBeVisible();
});

test("home: saving-plan form submits with the default spend (stepMismatch regression)", async ({
  page,
}) => {
  // step={10} with min={1} used to make 500 an HTML stepMismatch, silently
  // blocking EVERY hero submission. Round spends must always submit.
  await page.goto("/");
  await page
    .getByPlaceholder("Search a store, e.g. Myer, JB Hi-Fi or Amazon")
    .first()
    .fill("Myer");
  await page.getByRole("button", { name: "Build my saving plan" }).click();
  await page.waitForURL(/\/search\?q=Myer&spend=500/);
  await expect(
    page.getByRole("heading", { name: "Your $500.00 purchase plan" }),
  ).toBeVisible();
});

test("public navigation keeps the purchase planner and core tasks easy to reach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("link", { name: "Save at a store" }),
  ).toHaveAttribute("href", "/stores");
  await expect(
    page.getByRole("link", { name: "Find discounted gift cards" }),
  ).toHaveAttribute("href", "/gift-cards");
  await expect(
    page.getByRole("link", { name: "Earn more points" }),
  ).toHaveAttribute("href", "/rewards");
  await expect(
    page.getByRole("link", { name: "Expiring opportunities" }),
  ).toHaveAttribute("href", "/deals?view=expiring");

  await page.goto("/gift-cards");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "Gift cards", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    header.getByRole("link", { name: "Plan a purchase" }),
  ).toHaveAttribute("href", "/search");

  await page.goto("/cashback");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Cashback" }),
  ).toHaveAttribute("aria-current", "page");
});

test("mobile navigation exposes labelled destinations without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();

  const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNav.getByRole("link", { name: "Deals" })).toBeVisible();
  await expect(
    mobileNav.getByRole("link", { name: "Gift cards" }),
  ).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Stores" })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Cashback" })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Points" })).toBeVisible();
  await expect(
    mobileNav.getByRole("link", { name: "Card offers" }),
  ).toBeVisible();
  await expect(
    mobileNav.getByRole("link", { name: "Build a purchase plan" }),
  ).toBeVisible();
  const quickNav = page.getByRole("navigation", {
    name: "Mobile quick navigation",
  });
  await expect(
    quickNav.getByRole("link", { name: "Plan", exact: true }),
  ).toHaveAttribute("href", "/search");
  await expect(quickNav.getByRole("link")).toHaveCount(5);
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(390);
});

test("home: sourced and custom calculator modes keep cashback timing consistent", async ({
  page,
}) => {
  await page.goto("/?stack=myer#calculator");
  const calculator = page.locator("#calculator");
  await expect(
    calculator.getByRole("tab", { name: "Use a store stack" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(calculator.getByText("$450.00").first()).toBeVisible();
  await expect(calculator.getByText("−$27.00").first()).toBeVisible();
  await expect(calculator.getByText("$423.00").first()).toBeVisible();

  await calculator.getByRole("tab", { name: "Build a custom stack" }).click();
  await expect(calculator.getByText("$405.00").first()).toBeVisible();
  await calculator.getByText("Cashback excludes gift-card payment").click();
  await expect(calculator.getByText("$423.00").first()).toBeVisible();
  await expect(
    calculator.getByText(/Gift-card saving was excluded/),
  ).toBeVisible();
});

test("home → store page shows the stack breakdown", async ({ page }) => {
  await page.goto("/");
  await page.locator("#stores").getByText("JB Hi-Fi").first().click();

  await page.waitForURL("**/stores/jb-hifi");
  await expect(
    page.getByRole("heading", { level: 1, name: "JB Hi-Fi" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Best compatible stack|Safest available option/).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        /Checked today|Checked this week|Needs recheck|Not yet checked/,
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Included in recommended plan").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Scan this store by saving layer" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Promo codes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gift cards" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cashback" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Points" })).toBeVisible();
  await expect(page.getByText("DealStack verified")).toHaveCount(0);
});

test("search: canonical product key compares retailer prices and stacks", async ({
  page,
}) => {
  await page.goto("/search?q=macbook-air-m3");

  await expect(page.getByText("Compare 2 retailers")).toBeVisible();
  await expect(page.getByText("JB Hi-Fi").first()).toBeVisible();
  await expect(page.getByText("Costco").first()).toBeVisible();
  await expect(page.getByText("Best price")).toBeVisible();
  await expect(page.getByText(/^Stack:/)).toBeVisible();
  await expect(page.getByText("$1,749.00")).toBeVisible();
});

test("decision hub: store search returns a shareable purchase plan", async ({
  page,
}) => {
  await page.goto("/search?q=myer&spend=750");
  await expect(
    page.getByRole("heading", { name: "Your $750.00 purchase plan" }),
  ).toBeVisible();
  await expect(page.getByText("Rewards kept separate")).toBeVisible();
  await expect(page).toHaveURL(/q=myer&spend=750/);
});

test("decision hub: mobile keeps the current purchase summary within reach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search?q=myer&spend=500");
  const summary = page.getByLabel("Current purchase plan summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Myer · $500.00");
  await expect(page.getByLabel("Current purchase plan summary")).toHaveCount(1);
  await expect(summary.getByRole("link", { name: "View plan" })).toHaveAttribute(
    "href",
    "#purchase-plan",
  );
});

test("deals: compact controls preserve a full-width scan-first feed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/deals?view=popular");
  await expect(
    page.getByRole("link", { name: "Popular", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Refine results" }),
  ).toBeVisible();
  await expect(page.getByText(/Popularity uses captured comment and vote counts/)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Deal filters" })).toHaveCount(0);
});

test("cashback: rate discovery explains timing and compatibility separately", async ({
  page,
}) => {
  await page.goto("/cashback");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Compare cashback without hiding the catches",
    }),
  ).toBeVisible();
  await expect(page.getByText("Source status", { exact: true })).toBeVisible();
  await expect(page.getByText("Freshness", { exact: true })).toBeVisible();
  await expect(page.getByText("Compatibility", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/never presented as money removed from the checkout price/i),
  ).toBeVisible();
});

test("decision hub: an empty search never chooses a default merchant", async ({
  page,
}) => {
  await page.goto("/search");
  await expect(
    page.getByRole("heading", { name: "Start a new purchase plan" }),
  ).toBeVisible();
  await expect(
    page.getByText(/will not choose a default merchant/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /purchase plan/i }),
  ).toHaveCount(1);
  await expect(page.getByText(/Best verified plan for/)).toHaveCount(0);
});

test("decision hub: Apple search surfaces current reviewed sellers", async ({
  page,
}) => {
  await page.goto("/search?q=Apple&spend=500");
  await expect(
    page.getByRole("heading", { name: "Current reviewed gift-card offers" }),
  ).toBeVisible();
  await expect(page.getByText("Apple").first()).toBeVisible();
  await expect(
    page.getByText(/Points are rewards, not cash/i).first(),
  ).toBeVisible();
});

test("rewards: calculator keeps points value separate from cash", async ({
  page,
}) => {
  await page.goto("/rewards/everyday-rewards");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Everyday Rewards",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Points multiplier").fill("20");
  await expect(page.getByText("10,000").first()).toBeVisible();
  await expect(page.getByText("$500.00").first()).toBeVisible();
  await expect(page.getByText("$50.00").first()).toBeVisible();
});

test("gift-card history returns to current offers", async ({ page }) => {
  await page.goto("/gift-cards/history");
  await expect(
    page.getByRole("heading", { name: "Verified offer history" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return to current offers" }).click();
  await expect(page).toHaveURL(/\/gift-cards$/);
  await expect(
    page.getByRole("heading", { name: "Gift card deals" }),
  ).toBeVisible();
});

test("gift-card correction form opens without mutating public data", async ({
  page,
}) => {
  await page.goto("/gift-cards/gc-coles-group-bonus-points");
  await page.getByRole("button", { name: "Report a problem" }).click();
  await expect(page.getByText("What looks wrong?")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit report" }),
  ).toBeVisible();
});

test("gift-card calculator hands a custom face value into the final-stack search", async ({
  page,
}) => {
  await page.goto("/gift-cards/gc-ultimate-jbhifi");
  await page.getByLabel("Custom face value ($)").fill("350");
  await expect(page.getByText("$350").first()).toBeVisible();
  const stackLink = page.getByRole("link", {
    name: "Build compatible final stack",
  });
  await expect(stackLink).toHaveAttribute("href", /spend=350/);
});

test("gift-card product directory search is URL-backed", async ({ page }) => {
  await page.goto("/gift-cards/products");
  await page.getByLabel("Search gift-card products").fill("Apple");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/gift-cards\/products\?q=Apple/);
});

test("gift-card navigation separates seller lookup from card acceptance", async ({
  page,
}) => {
  await page.goto("/gift-cards/where-to-buy?q=Apple");
  await expect(
    page.getByRole("heading", { name: "Where can I buy this gift card?" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Gift card tools" })
      .getByRole("link", { name: "Where can I buy it?" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByLabel("Search gift-card brands or sellers"),
  ).toHaveValue("Apple");
});

test("points page starts from programmes and compares immediate with later value", async ({
  page,
}) => {
  await page.goto("/rewards");
  await expect(
    page.getByRole("heading", { level: 1, name: "Points and rewards" }),
  ).toBeVisible();
  const programmes = page.getByRole("navigation", {
    name: "Points programmes",
  });
  await expect(
    programmes.getByRole("link", { name: "All programs" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(programmes.getByRole("link", { name: "Qantas" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Compare cash now with value later" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Checkout saving" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Later / estimated value" }),
  ).toBeVisible();
});

test("gift-card acceptance lookup preserves the not-recorded distinction", async ({
  page,
}) => {
  await page.goto("/gift-cards/where-to-use?q=JB+Hi-Fi");
  await expect(
    page.getByRole("heading", { name: /No recorded evidence for/ }),
  ).toBeVisible();
  await expect(
    page.getByText("This is “not recorded”, not “not accepted”."),
  ).toBeVisible();
});

test("deals: weekly pick links through to its permalink page", async ({
  page,
}) => {
  await page.goto("/deals");
  await expect(
    page.getByRole("heading", { level: 1, name: "Find a deal worth stacking" }),
  ).toBeVisible();

  // Every weekly pick title links to /deals/{slug}--{id}.
  const pickLink = page.locator('a[href*="/deals/"][href*="--"]').first();
  await expect(pickLink).toBeVisible();

  await pickLink.click();
  await page.waitForURL("**/deals/**");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("All deals")).toBeVisible();
});

test("deals: offer-family filters narrow the server-rendered results", async ({
  page,
}) => {
  await page.goto("/deals?kind=gift-card");
  await expect(
    page.getByRole("heading", { level: 1, name: "Gift cards" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/kind=gift-card/);
});

test("deals: Latest is a first-class shareable view", async ({ page }) => {
  await page.goto("/deals");
  await page
    .getByLabel("Deals sections")
    .getByRole("link", { name: "Latest" })
    .click();
  await expect(page).toHaveURL(/view=recent/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Latest" }),
  ).toBeVisible();
});

test("deals: Best verified has an honest empty state", async ({ page }) => {
  await page.goto(
    "/deals?view=top&trust=verified&q=definitely-no-verified-offer",
  );
  await expect(
    page.getByRole("heading", {
      name: "No currently verified offers are available.",
    }),
  ).toBeVisible();
});

test("deals: filters and search are shareable and clearable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "desktop filter sidebar");
  await page.goto("/deals?view=top");
  await page.locator("#desktop-merchant").selectOption("jb-hifi");
  await page.locator("#desktop-trust").selectOption("verified");
  await page.getByRole("button", { name: "Apply filters" }).first().click();
  await expect(page).toHaveURL(/merchant=jb-hifi/);
  await expect(page).toHaveURL(/trust=verified/);
  await page.getByLabel("Search public deals").fill("nothing-can-match-this");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No currently verified offers are available."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Clear search and filters" }).click();
  await expect(page).toHaveURL(/\/deals$/);
});

test("deals: spend selector recalculates stack estimates via the URL", async ({
  page,
}) => {
  await page.goto("/deals?view=stacks");
  await expect(
    page.getByRole("heading", { level: 1, name: "Best stacks" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "$250", exact: true }).click();
  await expect(page).toHaveURL(/spend=250/);
  await expect(page.getByText("on a $250.00 spend").first()).toBeVisible();
  // Descriptive, layer-derived stack titles — never a generic "weekly stack".
  await expect(page.getByText(/% off code .*at /i).first()).toBeVisible();
});

test("deals: mobile filter disclosure exposes labelled controls", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only control");
  await page.goto("/deals?kind=community");
  const summary = page.locator("summary").filter({ hasText: "Filters" });
  await summary.click();
  await expect(page.locator("#mobile-trust")).toBeVisible();
});

test("cards: sparse filters explain withheld content and preserve the URL", async ({
  page,
}) => {
  await page.goto("/cards");
  await page.getByRole("button", { name: "No annual fee" }).click();
  await expect(page).toHaveURL(/filter=no-fee/);
  await expect(
    page.getByText("No card offers match no annual fee"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page).not.toHaveURL(/filter=/);
});

test("cards: detail and comparison expose complete terms", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "comparison selection is covered once on desktop",
  );
  await page.goto("/cards");
  const compare = page.getByText("Add to comparison");
  await compare.nth(0).click();
  await compare.nth(1).click();
  await page.getByRole("link", { name: /Compare 2/ }).click();
  await expect(page).toHaveURL(/\/cards\/compare\?ids=/);
  await expect(
    page.getByRole("heading", { name: "Compare card offers" }),
  ).toBeVisible();
  await expect(page.getByText("Estimated first-year net")).toBeVisible();

  await page
    .getByRole("link", { name: /American Express/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /American Express/ }),
  ).toBeVisible();
  await expect(page.getByText("Offer structure")).toBeVisible();
  await expect(page.getByText("Report incorrect offer")).toBeVisible();
});

test("gift-cards: tabs filter the offers and are shareable via the URL", async ({
  page,
}) => {
  await page.goto("/gift-cards");
  await expect(
    page.getByRole("heading", { level: 1, name: /Gift card/i }),
  ).toBeVisible();
  await expect(page.getByText(/How we value offers/i)).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await page.getByRole("button", { name: /Filters/ }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Gift card filters" })
        .getByLabel("Confirmed current only"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close filter drawer" }).click();
  } else {
    await expect(
      page.getByLabel("Confirmed current only").first(),
    ).toBeVisible();
  }
  await expect(page.getByText("Buy from").first()).toBeVisible();
  await expect(page.getByText("Offer source").first()).toBeVisible();
  await expect(page.getByText("Card brand").first()).toBeVisible();
  await expect(page.getByText("Redeem at").first()).toBeVisible();

  // The Points tab narrows to points offers and writes tab=points to the URL.
  await page.getByRole("button", { name: "Points", exact: true }).click();
  await expect(page).toHaveURL(/tab=points/);
  await expect(
    page.getByRole("heading", { name: "Coles Group" }).first(),
  ).toBeVisible();
});

test("gift-cards: a card links through to its detail page", async ({
  page,
}) => {
  await page.goto("/gift-cards");
  await page.getByRole("link", { name: "View details" }).first().click();
  await page.waitForURL("**/gift-cards/**");
  await expect(page.getByText(/Stacking compatibility/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How to claim" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /All gift cards/i }),
  ).toBeVisible();
});

test("gift-cards: the detail page renders every structured section", async ({
  page,
}) => {
  await page.goto("/gift-cards/gc-coles-group-bonus-points");
  for (const heading of [
    "How to claim",
    "Included gift cards",
    "Where each card works",
    "Stackability analysis",
    "Worked example",
    "Terms and limits",
    "Source and trust",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  // Acceptance is never presented as guaranteed.
  await expect(
    page.getByText(/Acceptance depends on the merchant category code/i).first(),
  ).toBeVisible();
  // Two-stage stackability: acquisition and redemption are separate panels.
  await expect(
    page.getByRole("heading", { name: /Buying the card/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Spending the card/i }),
  ).toBeVisible();
  // Points offers must disclose that point values are estimates, not cash.
  await expect(page.getByText(/not cash/i).first()).toBeVisible();
  // The worked example responds to the face-value selector.
  await page.getByRole("button", { name: "$500" }).click();
  await expect(page.getByRole("button", { name: "$500" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("gift-cards: an unknown offer id is a 404, not a stale page", async ({
  page,
}) => {
  const res = await page.goto("/gift-cards/definitely-not-a-real-offer");
  expect(res?.status()).toBe(404);
});

test("admin: the gift-card review queue is behind the auth gate", async ({
  page,
}) => {
  await page.goto("/admin/gift-cards/review");
  // Must redirect to login before any review content renders.
  await page.waitForURL("**/admin/login**");
  await expect(page.locator("body")).not.toContainText(
    "Gift card review queue",
  );
});

test("footer: policy pages are linked and keyboard reachable", async ({
  page,
}) => {
  await page.goto("/");
  const privacy = page.getByRole("link", { name: "Privacy" });
  await privacy.focus();
  await expect(privacy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Editorial policy" }),
  ).toBeVisible();
});

test("security: HTML responses carry a nonce-based report-only CSP", async ({
  page,
}) => {
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy-report-only"] ?? "";
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toMatch(/'nonce-[^']+'/);
  expect(csp).not.toContain("'unsafe-inline'");
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  // JSON-LD data blocks are exempt from script-src and carry no nonce; the
  // assertion targets an executable framework script.
  const renderedNonce = await page
    .locator('script:not([type="application/ld+json"])')
    .first()
    .evaluate((script) => (script as HTMLScriptElement).nonce);
  expect(renderedNonce).toBe(nonce);
});

test("public routes do not overflow the viewport", async ({ page }) => {
  for (const path of [
    "/",
    "/deals",
    "/deals?view=popular",
    "/deals?view=top&trust=verified",
    "/cards",
    "/cashback",
    "/gift-cards",
    "/gift-cards/gc-coles-group-bonus-points",
    "/gift-cards/products",
    "/gift-cards/where-to-use",
    "/gift-cards/history",
    "/gift-cards/programmes",
    "/gift-cards/weekly",
    "/gift-cards/weekly/plan",
    "/rewards",
    "/rewards/everyday-rewards",
    "/stores",
    "/stores/myer",
    "/search",
    "/search?q=Amazon+AU&spend=500",
    "/search?q=myer",
    "/search?q=macbook-air-m3",
    "/resources",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflow, `${path} has horizontal overflow`).toBe(false);
  }
});

test("weekly gift-card hub exposes reviewed views and a controlled planner empty state", async ({
  page,
}) => {
  await page.goto("/gift-cards/weekly");
  await expect(
    page.getByRole("heading", {
      name: "This week’s supermarket gift-card offers",
    }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Weekly offer views" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Coles" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Woolworths" })).toBeVisible();
  await expect(page.getByText(/retailer catalogue or promotion page first/i)).toBeVisible();

  await page.goto("/gift-cards/weekly/plan");
  await expect(
    page.getByRole("heading", {
      name: "This weekly offer is not currently available",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to weekly offers" })).toBeVisible();
});

test("admin: protected pages bounce to the login route", async ({ page }) => {
  for (const path of ["/admin/dashboard", "/admin/gift-card-intelligence"]) {
    await page.goto(path);
    // The auth gate must redirect before any admin content renders. We assert
    // the redirect only: rendering the login form itself needs Supabase env.
    await page.waitForURL("**/admin/login**");
    await expect(page.locator("body")).not.toContainText(
      "Gift-card intelligence",
    );
  }
});

test("core decision routes have no serious automated accessibility violations", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/search?q=myer&spend=500",
    "/deals?view=popular",
    "/cashback",
    "/gift-cards",
    "/gift-cards/weekly",
    "/rewards/everyday-rewards",
  ]) {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = result.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      serious,
      `${path}: ${serious.map((violation) => `${violation.id} (${violation.nodes.length})`).join(", ")}`,
    ).toEqual([]);
  }
});
