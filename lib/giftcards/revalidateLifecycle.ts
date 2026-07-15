import { revalidatePath } from "next/cache";

/** Public surfaces whose cached projections include canonical gift-card state. */
const PUBLIC_PATHS = [
  "/",
  "/deals",
  "/search",
  "/stores",
  "/gift-cards",
  "/gift-cards/weekly",
  "/gift-cards/weekly/plan",
  "/gift-cards/history",
  "/gift-cards/products",
  "/gift-cards/programmes",
  "/gift-cards/where-to-use",
  "/rewards",
] as const;

const DYNAMIC_PAGE_PATHS = [
  "/gift-cards/[id]",
  "/gift-cards/products/[slug]",
  "/stores/[slug]",
  "/rewards/[slug]",
] as const;

/**
 * Route-handler cache invalidation shared by the dedicated lifecycle route and
 * reconciliation's lazy lifecycle handoff. Dynamic patterns require the page
 * type in this Next version; concrete store slugs are additionally invalidated
 * so an affected store refreshes without waiting for a pattern visit.
 */
export function revalidateGiftCardLifecyclePaths(
  storeIds: readonly string[],
): void {
  for (const path of PUBLIC_PATHS) revalidatePath(path);
  for (const path of DYNAMIC_PAGE_PATHS) revalidatePath(path, "page");
  for (const storeId of new Set(storeIds)) {
    if (/^[a-z0-9][a-z0-9-]{0,99}$/.test(storeId)) {
      revalidatePath(`/stores/${storeId}`);
    }
  }
}
