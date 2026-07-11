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
    page.getByRole("heading", { name: "Stack every saving before you shop" })
  ).toBeVisible();

  await page.getByPlaceholder("Search stores or products…").fill("jb hi-fi");

  const storesSection = page.locator("#stores");
  await expect(storesSection.getByText("JB Hi-Fi").first()).toBeVisible();
  // The interactive island is hydrated: a clear-search button appears.
  await expect(
    storesSection.getByRole("button", { name: "Clear search" })
  ).toBeVisible();
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

test("deals: weekly pick links through to its permalink page", async ({
  page,
}) => {
  await page.goto("/deals");
  await expect(
    page.getByRole("heading", { level: 1, name: /Weekly\s+Deals/ })
  ).toBeVisible();

  // Every weekly pick title links to /deals/{slug}--{id}.
  const pickLink = page.locator('a[href*="/deals/"][href*="--"]').first();
  await expect(pickLink).toBeVisible();
  const title = (await pickLink.textContent())?.trim() ?? "";

  await pickLink.click();
  await page.waitForURL("**/deals/**");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("All weekly deals")).toBeVisible();
});

test("deals: filter chips narrow the visible sections", async ({ page }) => {
  await page.goto("/deals");
  await page.getByRole("button", { name: "Gift cards", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Weekly gift card offers" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Points boosts" })
  ).toHaveCount(0);
  await expect(page).toHaveURL(/view=gift-cards/);

  await page.goBack();
  await expect(page).not.toHaveURL(/view=gift-cards/);
});

test("deals: store and confidence filters are shareable", async ({ page }) => {
  await page.goto("/deals");
  await page.getByRole("combobox", { name: "Store" }).selectOption("jb-hifi");
  await page.getByRole("combobox", { name: "Confidence" }).selectOption("confirmed");
  await expect(page).toHaveURL(/store=jb-hifi/);
  await expect(page).toHaveURL(/confidence=confirmed/);
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
  for (const path of ["/", "/deals", "/cards", "/stores", "/search?q=myer", "/resources"]) {
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
