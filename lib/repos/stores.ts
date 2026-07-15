import {
  stores as staticStores,
  type Store,
  type StoreLogoTheme,
} from "@/lib/data";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import {
  fromDbOrDemo,
  toNumber,
  type DbClient,
} from "@/lib/supabase/server";
import { safeLogoPath } from "@/lib/security/urlPolicy";

/**
 * Stores repository. Supabase is authoritative when configured; static stores
 * are only for explicit demo mode or an unconfigured environment. Rows are
 * mapped from snake_case to the existing `Store` shape.
 */

interface StoreRow {
  id: string;
  name: string;
  category: string;
  logo: string;
  logo_path: string | null;
  logo_text: string | null;
  logo_subtext: string | null;
  logo_theme: StoreLogoTheme | null;
  discount_percent: number | string;
  discount_code: string;
  expiry_date: string | null;
  cashback_percent: number | string;
  cashback_provider: Store["cashbackProvider"];
  gift_card_discount_percent: number | string;
  gift_card_source: string;
  points_program: string;
  points_rate: string;
  aliases: string[] | null;
}

function mapStore(r: StoreRow): Store {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    logo: r.logo,
    logoPath: safeLogoPath(r.logo_path) ?? undefined,
    logoText: r.logo_text ?? undefined,
    logoSubtext: r.logo_subtext ?? undefined,
    logoTheme: r.logo_theme ?? undefined,
    discountPercent: toNumber(r.discount_percent),
    discountCode: r.discount_code,
    expiryDate: r.expiry_date,
    cashbackPercent: toNumber(r.cashback_percent),
    cashbackProvider: r.cashback_provider,
    giftCardDiscountPercent: toNumber(r.gift_card_discount_percent),
    giftCardSource: r.gift_card_source,
    pointsProgram: r.points_program,
    pointsRate: r.points_rate,
    aliases: r.aliases ?? [],
  };
}

async function queryStores(supabase: DbClient): Promise<Store[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as StoreRow[]).map(mapStore);
}

/** Suppress only an expired discount-code layer; other store layers stay live. */
export function guardStoreDiscount(store: Store, today: string): Store {
  if (!isPastExpiry(store.expiryDate, today)) return store;
  return {
    ...store,
    discountPercent: 0,
    discountCode: "No current public code",
    expiryDate: null,
  };
}

export async function getStores(): Promise<Store[]> {
  const stores = await fromDbOrDemo("stores", staticStores, queryStores);
  const today = todayAU();
  return stores.map((store) => guardStoreDiscount(store, today));
}
