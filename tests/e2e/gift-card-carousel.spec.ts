import { expect, test, type Page } from "@playwright/test";
import { addDaysToIsoDate, todayAU } from "../../lib/offers/expiry";

/**
 * GCDB acceptance-fixture carousel + detail-page validation.
 *
 * The static demo dataset (DATA_SOURCE=static) contains exactly nine
 * displayable gift-card offers: six active samples, the two GCDB fixtures
 * (12943 — 1,000 Flybuys points on TCN cards at Coles; 12944 — 10x Everyday
 * Rewards on Restaurant/Cafe Choice + Ultimate at Woolworths) and one
 * later-starting upcoming sample, plus one EXPIRED sample that must never
 * render. Fixture dates are anchored relative to today (start +2 / end +8
 * days), so the expected labels are computed here with the same helpers the
 * app uses — the assertions never depend on the machine's absolute clock.
 */

const ID_12943 = "gc-gcdb-12943-coles-tcn-flybuys";
const ID_12944 = "gc-gcdb-12944-woolworths-everyday-rewards-10x";
const EXPIRED_ID = "gc-fixture-expired-sample";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "YYYY-MM-DD" → "22 Jul 2026", matching the app's formatDateAU. */
function formatAU(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const startDateAU = () => formatAU(addDaysToIsoDate(todayAU(), 2));
const expiryDateAU = () => formatAU(addDaysToIsoDate(todayAU(), 8));

function marquee(page: Page) {
  return page.getByRole("region", { name: "This week's gift-card offers" });
}

function slideLinks(page: Page) {
  return marquee(page).getByRole("link", { name: "See this offer" });
}

test("home: nine unique slides, no duplicates, expired fixture excluded", async ({
  page,
}) => {
  await page.goto("/");
  await expect(marquee(page)).toBeVisible();
  const hrefs = await slideLinks(page).evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(hrefs).toHaveLength(9);
  expect(new Set(hrefs).size).toBe(9);
  expect(hrefs).toContain(`/gift-cards/${ID_12943}`);
  expect(hrefs).toContain(`/gift-cards/${ID_12944}`);
  expect(hrefs).not.toContain(`/gift-cards/${EXPIRED_ID}`);
  await expect(page.getByText("Expired Sample Card")).toHaveCount(0);
});

test("home: desktop shows three cards per page and slide three carries 12943 + 12944", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only layout assertion");
  await page.goto("/");
  const region = marquee(page);
  await expect(region.getByText("1 / 3")).toBeVisible();

  // Exactly three cards fit the track viewport on the first page.
  const track = region.getByRole("group", { name: /Offers, page/ });
  const trackBox = (await track.boundingBox())!;
  const cardBoxes = await slideLinks(page).evaluateAll((links) =>
    links.map((link) => {
      const card = link.closest("article")!.getBoundingClientRect();
      return { left: card.left, right: card.right };
    }),
  );
  const visibleOnFirstPage = cardBoxes.filter(
    (box) =>
      box.left >= trackBox.x - 1 &&
      box.right <= trackBox.x + trackBox.width + 1,
  );
  expect(visibleOnFirstPage).toHaveLength(3);

  // Page 1 shows ACTIVE offers with honest end-date labels, never "Starts".
  await expect(region.getByText(/^Ends /).first()).toBeVisible();

  // Navigate to slide three; both GCDB fixtures are there.
  const next = region.getByRole("button", { name: "Next offers" }).first();
  await next.click();
  await expect(region.getByText("2 / 3")).toBeVisible();
  await next.click();
  await expect(region.getByText("3 / 3")).toBeVisible();
  await expect(next).toBeDisabled();

  const card12943 = region
    .locator("article")
    .filter({ has: page.locator(`a[href="/gift-cards/${ID_12943}"]`) });
  const card12944 = region
    .locator("article")
    .filter({ has: page.locator(`a[href="/gift-cards/${ID_12944}"]`) });
  await expect(card12943).toBeInViewport();
  await expect(card12944).toBeInViewport();

  // Upcoming labels are explicit and computed from controlled fixture dates.
  await expect(
    card12943.getByText(`Starts ${startDateAU()}`, { exact: false }),
  ).toBeVisible();
  await expect(
    card12944.getByText(`Starts ${startDateAU()}`, { exact: false }),
  ).toBeVisible();
  await expect(card12943.getByText("1,000 POINTS")).toBeVisible();
  await expect(card12944.getByText("10× POINTS")).toBeVisible();
  // Points are disclosed as rewards, never as checkout cash — and an
  // upcoming card must carry no active-sounding urgency chip.
  await expect(card12943.getByText(/rewards, not cash/)).toBeVisible();
  await expect(card12943.getByText(/^Ends in /)).toHaveCount(0);
});

test("home: a final partial page works at the two-up breakpoint", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "viewport-resize assertion");
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/");
  const region = marquee(page);
  // 9 slides at 2 per view → 5 pages; the last page holds a single card.
  await expect(region.getByText("1 / 5")).toBeVisible();
  const next = region.getByRole("button", { name: "Next offers" }).first();
  for (let i = 2; i <= 5; i += 1) {
    await next.click();
    await expect(region.getByText(`${i} / 5`)).toBeVisible();
  }
  await expect(next).toBeDisabled();
  const lastCard = region
    .locator("article")
    .filter({ has: page.locator('a[href^="/gift-cards/gc-fixture-upcoming"]') });
  await expect(lastCard).toBeInViewport();
});

test("home: mobile paging reaches every offer including both GCDB fixtures", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile-only reachability assertion");
  await page.goto("/");
  const region = marquee(page);
  await expect(region.getByText("1 / 9")).toBeVisible();
  const next = region.getByRole("button", { name: "Next offers" }).first();
  for (let i = 2; i <= 9; i += 1) {
    await next.click();
    await expect(region.getByText(`${i} / 9`)).toBeVisible();
  }
  await expect(next).toBeDisabled();
  const card12944 = region
    .locator("article")
    .filter({ has: page.locator(`a[href="/gift-cards/${ID_12944}"]`) });
  await expect(card12944).toBeInViewport();
});

test("home: carousel count and the /gift-cards listing use the same eligible set", async ({
  page,
}) => {
  await page.goto("/");
  const allOffersLink = marquee(page).getByRole("link", {
    name: /All \d+ reviewed offers/,
  });
  const label = (await allOffersLink.textContent()) ?? "";
  const liveCount = Number(label.match(/All (\d+) reviewed offers/)?.[1]);
  expect(liveCount).toBe(9);

  await page.goto("/gift-cards");
  await expect(page.getByRole("link", { name: "View details" })).toHaveCount(
    liveCount,
  );
  // The two GCDB fixtures are listed; the expired fixture is not.
  await expect(
    page.locator(`a[href="/gift-cards/${ID_12943}"]`).first(),
  ).toBeVisible();
  await expect(
    page.locator(`a[href="/gift-cards/${ID_12944}"]`).first(),
  ).toBeVisible();
  await expect(page.locator(`a[href="/gift-cards/${EXPIRED_ID}"]`)).toHaveCount(
    0,
  );
});

test("gift-cards/12943 detail: points, five-card limit, denominations, eftpos fees, dates", async ({
  page,
}) => {
  await page.goto(`/gift-cards/${ID_12943}`);

  // Headline facts: fixed points award, programme, seller.
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /1,000 Flybuys points on .* at Coles/,
    }),
  ).toBeVisible();
  // Upcoming is explicit — computed from the controlled fixture dates.
  await expect(
    page.getByText(`Upcoming — starts ${startDateAU()}`),
  ).toBeVisible();
  await expect(page.getByText(/This promotion has not started/)).toBeVisible();
  // Correct start and expiry dates.
  await expect(page.getByText(startDateAU()).first()).toBeVisible();
  await expect(page.getByText(expiryDateAU()).first()).toBeVisible();

  // Value line keeps the points award separate from checkout payment.
  await expect(
    page.getByText(/1,000 Flybuys points per eligible card/).first(),
  ).toBeVisible();
  await expect(page.getByText(/not cash/i).first()).toBeVisible();

  // Five-card account limit as a structured term.
  await expect(
    page.getByText("5 eligible gift cards in total per customer/account"),
  ).toBeVisible();

  // Included TCN products with their individual denominations.
  for (const product of [
    "TCN Party",
    "TCN Teen",
    "TCN Her",
    "TCN Restaurant",
    "TCN Eftpos",
  ]) {
    await expect(page.getByText(product).first()).toBeVisible();
  }

  // Eftpos purchase fees and the fee-aware net-benefit table.
  const table = page.getByRole("table");
  await expect(table.getByText("$5.95")).toBeVisible();
  await expect(table.getByText("$7.95")).toBeVisible();
  await expect(table.getByText("(net cost)").first()).toBeVisible();
  // The fee-free $25 card ranks first with a positive net estimate.
  const firstRow = table.locator("tbody tr").first();
  await expect(firstRow.getByText("TCN Party")).toBeVisible();
  await expect(firstRow.getByText("$25").first()).toBeVisible();
});

test("gift-cards/12944 detail: 10x points, card families, distinct per-day limits, dates", async ({
  page,
}) => {
  await page.goto(`/gift-cards/${ID_12944}`);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /10× Everyday Rewards points on .* at Woolworths/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`Upcoming — starts ${startDateAU()}`),
  ).toBeVisible();
  await expect(page.getByText(startDateAU()).first()).toBeVisible();
  await expect(page.getByText(expiryDateAU()).first()).toBeVisible();

  // Included card families.
  for (const family of ["Restaurant Choice", "Cafe Choice", "Ultimate"]) {
    await expect(page.getByText(family).first()).toBeVisible();
  }

  // Separate fixed-value and variable-load daily limits — never merged.
  await expect(page.getByText("Fixed-value cards")).toBeVisible();
  await expect(page.getByText("Limit 5 per day")).toBeVisible();
  await expect(page.getByText("Variable-load cards")).toBeVisible();
  await expect(page.getByText("Limit 2 per day")).toBeVisible();

  // Points remain separate from checkout cash.
  await expect(page.getByText(/not cash/i).first()).toBeVisible();
});

test("home: both GCDB carousel links open their detail pages", async ({
  page,
}) => {
  await page.goto("/");
  const region = marquee(page);
  const link12943 = region.locator(`a[href="/gift-cards/${ID_12943}"]`);
  await link12943.scrollIntoViewIfNeeded();
  await link12943.click();
  await page.waitForURL(`**/gift-cards/${ID_12943}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /1,000 Flybuys points/ }),
  ).toBeVisible();

  await page.goto("/");
  const link12944 = region.locator(`a[href="/gift-cards/${ID_12944}"]`);
  await link12944.scrollIntoViewIfNeeded();
  await link12944.click();
  await page.waitForURL(`**/gift-cards/${ID_12944}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /10× Everyday Rewards points/ }),
  ).toBeVisible();
});
