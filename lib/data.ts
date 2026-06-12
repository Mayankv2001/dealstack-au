export type CashbackProvider = "ShopBack" | "TopCashback" | "—";

export interface Store {
  id: string;
  name: string;
  category: string;
  /** Text/initials placeholder shown instead of an image logo */
  logo: string;
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
export const stores: Store[] = [
  {
    id: "myer",
    name: "Myer",
    category: "Department Store",
    logo: "MYER",
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
