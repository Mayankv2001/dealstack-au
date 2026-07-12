import { expect, test } from "@playwright/test";

/**
 * Browser smoke tests for the flows unit tests cannot cover: real navigation,
 * hydration, and client-side interactivity on the production build. Kept
 * data-light on purpose — they assert on stores/content that exist in both
 * the static fallback and the production database.
 */

test("home: hero search live-filters the stores grid", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "See every saving you can stack before you buy" })
  ).toBeVisible();

  await page.getByPlaceholder("Search a store, e.g. Myer, JB Hi-Fi or Amazon").first().fill("jb hi-fi");

  const storesSection = page.locator("#stores");
  await expect(storesSection.getByText("JB Hi-Fi").first()).toBeVisible();
  // The interactive island is hydrated: a clear-search button appears.
  await expect(
    storesSection.getByRole("button", { name: "Clear search" })
  ).toBeVisible();
});

test("home: sourced and custom calculator modes keep cashback timing consistent", async ({ page }) => {
  await page.goto("/?stack=myer#calculator");
  const calculator = page.locator("#calculator");
  await expect(calculator.getByRole("tab", { name: "Use a store stack" })).toHaveAttribute("aria-selected", "true");
  await expect(calculator.getByText("$450.00").first()).toBeVisible();
  await expect(calculator.getByText("−$27.00").first()).toBeVisible();
  await expect(calculator.getByText("$423.00").first()).toBeVisible();

  await calculator.getByRole("tab", { name: "Build a custom stack" }).click();
  await expect(calculator.getByText("$405.00").first()).toBeVisible();
  await calculator.getByText("Cashback excludes gift-card payment").click();
  await expect(calculator.getByText("$423.00").first()).toBeVisible();
  await expect(calculator.getByText(/Gift-card saving was excluded/)).toBeVisible();
});

test("home → store page shows the stack breakdown", async ({ page }) => {
  await page.goto("/");
  await page.locator("#stores").getByText("JB Hi-Fi").first().click();

  await page.waitForURL("**/stores/jb-hifi");
  await expect(
    page.getByRole("heading", { level: 1, name: "JB Hi-Fi" })
  ).toBeVisible();
  await expect(page.getByText("Best stack estimate").first()).toBeVisible();
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

test("deals: weekly pick links through to its permalink page", async ({
  page,
}) => {
  await page.goto("/deals");
  await expect(
    page.getByRole("heading", { level: 1, name: "Find a deal worth stacking" })
  ).toBeVisible();

  // Every weekly pick title links to /deals/{slug}--{id}.
  const pickLink = page.locator('a[href*="/deals/"][href*="--"]').first();
  await expect(pickLink).toBeVisible();

  await pickLink.click();
  await page.waitForURL("**/deals/**");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("All deals")).toBeVisible();
});

test("deals: URL-backed views narrow the server-rendered results", async ({ page }) => {
  await page.goto("/deals");
  await page.getByRole("link", { name: "Gift cards", exact: true }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Gift cards" })
  ).toBeVisible();
  await expect(page).toHaveURL(/view=gift-cards/);

  await page.goBack();
  await expect(page).not.toHaveURL(/view=gift-cards/);
});

test("deals: filters and search are shareable and clearable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "desktop filter sidebar");
  await page.goto("/deals?view=top");
  await page.locator("#desktop-merchant").selectOption("jb-hifi");
  await page.locator("#desktop-trust").selectOption("verified");
  await page.getByRole("button", { name: "Apply filters" }).first().click();
  await expect(page).toHaveURL(/merchant=jb-hifi/);
  await expect(page).toHaveURL(/trust=verified/);
  await page.getByLabel("Search public deals").fill("nothing-can-match-this");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No deals match those choices")).toBeVisible();
  await page.getByRole("link", { name: "Clear search and filters" }).click();
  await expect(page).toHaveURL(/\/deals$/);
});

test("deals: spend selector recalculates stack estimates via the URL", async ({ page }) => {
  await page.goto("/deals?view=stacks");
  await expect(page.getByRole("heading", { level: 1, name: "Best stacks" })).toBeVisible();
  await page.getByRole("link", { name: "$250", exact: true }).click();
  await expect(page).toHaveURL(/spend=250/);
  await expect(page.getByText("on a $250.00 spend").first()).toBeVisible();
  // Descriptive, layer-derived stack titles — never a generic "weekly stack".
  await expect(page.getByText(/% off code .*at /i).first()).toBeVisible();
});

test("deals: mobile filter disclosure exposes labelled controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only control");
  await page.goto("/deals?view=community");
  const summary = page.locator("summary").filter({ hasText: "Filters" });
  await summary.click();
  await expect(page.locator("#mobile-trust")).toBeVisible();
});

test("cards: sparse filters explain withheld content and preserve the URL", async ({ page }) => {
  await page.goto("/cards");
  await page.getByRole("button", { name: "No annual fee" }).click();
  await expect(page).toHaveURL(/filter=no-fee/);
  await expect(page.getByText("No card offers match no annual fee")).toBeVisible();
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page).not.toHaveURL(/filter=/);
});

test("cards: detail and comparison expose complete terms", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "comparison selection is covered once on desktop");
  await page.goto("/cards");
  const compare = page.getByText("Add to comparison");
  await compare.nth(0).click();
  await compare.nth(1).click();
  await page.getByRole("link", { name: /Compare 2/ }).click();
  await expect(page).toHaveURL(/\/cards\/compare\?ids=/);
  await expect(page.getByRole("heading", { name: "Compare card offers" })).toBeVisible();
  await expect(page.getByText("Estimated first-year net")).toBeVisible();

  await page.getByRole("link", { name: /American Express/ }).first().click();
  await expect(page.getByRole("heading", { name: /American Express/ })).toBeVisible();
  await expect(page.getByText("Offer structure")).toBeVisible();
  await expect(page.getByText("Report incorrect offer")).toBeVisible();
});

test("footer: policy pages are linked and keyboard reachable", async ({ page }) => {
  await page.goto("/");
  const privacy = page.getByRole("link", { name: "Privacy" });
  await privacy.focus();
  await expect(privacy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editorial policy" })).toBeVisible();
});

test("security: HTML responses carry a nonce-based report-only CSP", async ({ page }) => {
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy-report-only"] ?? "";
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toMatch(/'nonce-[^']+'/);
  expect(csp).not.toContain("'unsafe-inline'");
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  const renderedNonce = await page.locator("script").first().evaluate(
    (script) => (script as HTMLScriptElement).nonce
  );
  expect(renderedNonce).toBe(nonce);
});

test("public routes do not overflow the viewport", async ({ page }) => {
  for (const path of [
    "/",
    "/deals",
    "/cards",
    "/stores",
    "/search?q=myer",
    "/search?q=macbook-air-m3",
    "/resources",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow, `${path} has horizontal overflow`).toBe(false);
  }
});

test("admin: protected pages bounce to the login route", async ({ page }) => {
  await page.goto("/admin/dashboard");
  // The auth gate must redirect before any admin content renders. We assert
  // the redirect only: rendering the login form itself needs Supabase env,
  // which the env-less CI run deliberately does not have (the page 500s
  // there, which is fine — the protected content never appeared).
  await page.waitForURL("**/admin/login**");
  await expect(page.locator("body")).not.toContainText("Signals queue");
});
