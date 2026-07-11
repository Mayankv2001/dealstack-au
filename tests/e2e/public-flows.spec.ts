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
