export type CashbackProvider = "ShopBack" | "TopCashback" | "—";

/**
 * Brand-INSPIRED colour theme for a CSS-only logo tile. These are custom,
 * non-official colour treatments rendered purely with CSS — not copies of, or
 * downloads of, any retailer's real logo or brand assets.
 */
export interface StoreLogoTheme {
  /** CSS background (solid or gradient), applied via inline style. */
  bg: string;
  /** Text colour. */
  fg: string;
  /** Optional thin accent bar along the base of the tile. */
  accent?: string;
  /** Optional inset ring/border colour. */
  ring?: string;
}

export interface Store {
  id: string;
  name: string;
  category: string;
  /** Text/initials placeholder shown instead of an image logo */
  logo: string;
  /**
   * Path to a manually provided local logo asset in public/logos
   * (e.g. "/logos/myer.svg"). Optional — when missing or the file fails to
   * load, the component falls back to the CSS tile. Do not scrape or hotlink.
   */
  logoPath?: string;
  /** Short wordmark for the CSS logo tile, e.g. "MYER", "Coles", "JB". */
  logoText?: string;
  /** Optional tiny subtext under the wordmark. */
  logoSubtext?: string;
  /** Brand-inspired (not official) colour theme for the CSS logo tile. */
  logoTheme?: StoreLogoTheme;
  /** Best known public discount code offer, as a percentage off */
  discountPercent: number;
  discountCode: string;
  /** Sample/static expiry for the discount code deal (ISO date), or null if unknown */
  expiryDate: string | null;
  /** Best known cashback rate, as a percentage */
  cashbackPercent: number;
  cashbackProvider: CashbackProvider;
  /** Typical discounted gift card saving, as a percentage off face value */
  giftCardDiscountPercent: number;
  giftCardSource: string;
  /** Points earning opportunity, e.g. Flybuys, Everyday Rewards */
  pointsProgram: string;
  pointsRate: string;
}

export function formatExpiry(iso: string | null): string {
  if (!iso) return "Check provider for expiry";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const [y, m, d] = iso.split("-").map(Number);
  return `Expires ${d} ${months[m - 1]} ${y}`;
}

// All offers below are illustrative sample data, not live rates.
//
// Logo paths expect manually provided local assets in public/logos. Do not
// scrape or hotlink logos. Until those files exist, each store falls back to
// its CSS logo tile.
export const stores: Store[] = [
  {
    id: "myer",
    name: "Myer",
    category: "Department Store",
    logo: "MYER",
    logoPath: "/logos/myer.png",
    logoText: "MYER",
    logoTheme: { bg: "linear-gradient(135deg,#2c2c2c,#000000)", fg: "#ffffff" },
    discountPercent: 10,
    discountCode: "MYER10",
    expiryDate: "2026-06-30",
    cashbackPercent: 6,
    cashbackProvider: "ShopBack",
    giftCardDiscountPercent: 4,
    giftCardSource: "Suncorp Benefits",
    pointsProgram: "MYER one",
    pointsRate: "2 credits per $1",
  },
  {
    id: "jb-hifi",
    name: "JB Hi-Fi",
    category: "Electronics",
    logo: "JB",
    logoPath: "/logos/jb-hi-fi.png",
    logoText: "JB",
    logoTheme: {
      bg: "linear-gradient(135deg,#ffe24d,#f4c500)",
      fg: "#141414",
      accent: "#141414",
    },
    discountPercent: 5,
    discountCode: "PERKS5",
    expiryDate: "2026-07-15",
    cashbackPercent: 1.5,
    cashbackProvider: "TopCashback",
    giftCardDiscountPercent: 5,
    giftCardSource: "RACV Member Benefits",
    pointsProgram: "—",
    pointsRate: "No store program",
  },
  {
    id: "the-good-guys",
    name: "The Good Guys",
    category: "Electronics & Appliances",
    logo: "TGG",
    logoPath: "/logos/the-good-guys.svg",
    logoText: "TGG",
    logoTheme: { bg: "linear-gradient(135deg,#e64a4d,#c62526)", fg: "#ffffff" },
    discountPercent: 5,
    discountCode: "GOODGUYS5",
    expiryDate: null,
    cashbackPercent: 2,
    cashbackProvider: "ShopBack",
    giftCardDiscountPercent: 5,
    giftCardSource: "NRMA Blue",
    pointsProgram: "—",
    pointsRate: "No store program",
  },
  {
    id: "coles",
    name: "Coles",
    category: "Groceries",
    logo: "C",
    logoPath: "/logos/coles.svg",
    logoText: "Coles",
    logoTheme: { bg: "linear-gradient(135deg,#e22931,#b3151c)", fg: "#ffffff" },
    discountPercent: 0,
    discountCode: "No public codes",
    expiryDate: null,
    cashbackPercent: 0,
    cashbackProvider: "—",
    giftCardDiscountPercent: 4,
    giftCardSource: "Coles Group gift cards (RACQ)",
    pointsProgram: "Flybuys",
    pointsRate: "1 point per $1",
  },
  {
    id: "woolworths",
    name: "Woolworths",
    category: "Groceries",
    logo: "W",
    logoPath: "/logos/woolworths.webp",
    logoText: "W",
    logoTheme: {
      bg: "linear-gradient(135deg,#1fa84c,#0e7a33)",
      fg: "#ffffff",
      accent: "#9ccc3c",
    },
    discountPercent: 0,
    discountCode: "No public codes",
    expiryDate: null,
    cashbackPercent: 0,
    cashbackProvider: "—",
    giftCardDiscountPercent: 5,
    giftCardSource: "WISH gift cards (Suncorp)",
    pointsProgram: "Everyday Rewards",
    pointsRate: "1 point per $1",
  },
  {
    id: "amazon-au",
    name: "Amazon AU",
    category: "Online Marketplace",
    logo: "A",
    logoPath: "/logos/amazon-au.png",
    logoText: "A",
    logoTheme: {
      bg: "linear-gradient(135deg,#243140,#131a24)",
      fg: "#ff9f1c",
      accent: "#ff9f1c",
    },
    discountPercent: 5,
    discountCode: "Subscribe & Save",
    expiryDate: "2026-08-01",
    cashbackPercent: 4,
    cashbackProvider: "TopCashback",
    giftCardDiscountPercent: 0,
    giftCardSource: "Rarely discounted",
    pointsProgram: "—",
    pointsRate: "No store program",
  },
  {
    id: "kogan",
    name: "Kogan",
    category: "Online Marketplace",
    logo: "K",
    logoPath: "/logos/kogan.png",
    logoText: "K",
    logoTheme: { bg: "linear-gradient(135deg,#2563eb,#1e293b)", fg: "#ffffff" },
    discountPercent: 10,
    discountCode: "KOGAN10",
    expiryDate: "2026-06-21",
    cashbackPercent: 3,
    cashbackProvider: "ShopBack",
    giftCardDiscountPercent: 0,
    giftCardSource: "Not available",
    pointsProgram: "Kogan FIRST Rewards",
    pointsRate: "Member pricing",
  },
  {
    id: "chemist-warehouse",
    name: "Chemist Warehouse",
    category: "Pharmacy & Health",
    logo: "CW",
    logoPath: "/logos/chemist-warehouse.avif",
    logoText: "CW",
    logoTheme: {
      bg: "linear-gradient(135deg,#1565c0,#d32f2f)",
      fg: "#ffffff",
      accent: "#ffd400",
    },
    discountPercent: 5,
    discountCode: "CW5OFF",
    expiryDate: null,
    cashbackPercent: 4,
    cashbackProvider: "TopCashback",
    giftCardDiscountPercent: 4,
    giftCardSource: "Ultimate Health gift cards",
    pointsProgram: "Everyday Rewards",
    pointsRate: "1 point per $1",
  },
];
