import { stores as staticStores, type Store, type StoreLogoTheme } from "@/lib/data";
import {
  fromDbOrStatic,
  toNumber,
  type DbClient,
} from "@/lib/supabase/server";

/**
 * Stores repository. Reads from Supabase when configured, otherwise returns the
 * static `stores` array. Rows are mapped from snake_case back to the existing
 * `Store` shape so callers are unaffected by the data source.
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
}

function mapStore(r: StoreRow): Store {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    logo: r.logo,
    logoPath: r.logo_path ?? undefined,
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

export function getStores(): Promise<Store[]> {
  return fromDbOrStatic("stores", staticStores, queryStores);
}
