"use client";

import { useMemo, useState } from "react";
import { Calculator, CreditCard, Gift, Percent, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculateStack, formatAUD } from "@/lib/calculateStack";
import { stores } from "@/lib/data";

interface FieldProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
}

function Field({ id, label, icon, value, onChange, prefix, suffix }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        {icon}
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={prefix ? "pl-7" : suffix ? "pr-8" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function DealStackCalculator() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [price, setPrice] = useState("500");
  const [discount, setDiscount] = useState("10");
  const [cashback, setCashback] = useState("5");
  const [giftCard, setGiftCard] = useState("4");

  const result = useMemo(
    () =>
      calculateStack({
        originalPrice: parseFloat(price) || 0,
        discountPercent: parseFloat(discount) || 0,
        cashbackPercent: parseFloat(cashback) || 0,
        giftCardDiscountPercent: parseFloat(giftCard) || 0,
      }),
    [price, discount, cashback, giftCard]
  );

  const applyStore = (id: string) => {
    const store = stores.find((s) => s.id === id);
    if (!store) return;
    setStoreId(id);
    setDiscount(String(store.discountPercent));
    setCashback(String(store.cashbackPercent));
    setGiftCard(String(store.giftCardDiscountPercent));
  };

  const breakdown = [
    { label: "Checkout price after discount", value: result.checkoutPrice },
    { label: "Gift card saving", value: -result.giftCardSaving },
    { label: "Estimated cashback", value: -result.estimatedCashback },
  ];

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Calculator className="size-5 text-primary" />
          Deal Stack Calculator
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Stack a discount code, discounted gift cards and cashback to see your
          real out-of-pocket price.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {stores.map((store) => (
            <Button
              key={store.id}
              type="button"
              size="sm"
              variant={storeId === store.id ? "default" : "outline"}
              onClick={() => applyStore(store.id)}
            >
              {store.name}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="original-price"
            label="Original price"
            icon={<Tag className="size-3.5" />}
            value={price}
            onChange={(v) => setPrice(v)}
            prefix="$"
          />
          <Field
            id="discount-percent"
            label="Discount code"
            icon={<Percent className="size-3.5" />}
            value={discount}
            onChange={(v) => {
              setDiscount(v);
              setStoreId(null);
            }}
            suffix="%"
          />
          <Field
            id="cashback-percent"
            label="Cashback rate"
            icon={<CreditCard className="size-3.5" />}
            value={cashback}
            onChange={(v) => {
              setCashback(v);
              setStoreId(null);
            }}
            suffix="%"
          />
          <Field
            id="gift-card-percent"
            label="Gift card discount"
            icon={<Gift className="size-3.5" />}
            value={giftCard}
            onChange={(v) => {
              setGiftCard(v);
              setStoreId(null);
            }}
            suffix="%"
          />
        </div>

        <div className="rounded-xl border bg-muted/40 p-4 sm:p-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Original price</span>
              <span>{formatAUD(result.originalPrice)}</span>
            </div>
            {breakdown.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span
                  className={
                    row.value < 0
                      ? "font-medium text-emerald-600 dark:text-emerald-400"
                      : "font-medium"
                  }
                >
                  {row.value < 0
                    ? `−${formatAUD(Math.abs(row.value))}`
                    : formatAUD(row.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Final effective price
              </p>
              <p className="text-3xl font-bold tracking-tight">
                {formatAUD(result.finalEffectivePrice)}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500">
                Save {formatAUD(result.totalSaving)}
              </Badge>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {result.totalSavingPercent}% off
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Cashback is an estimate paid after purchase by providers like ShopBack
          or TopCashback — your checkout price is before cashback is returned.
        </p>
      </CardContent>
    </Card>
  );
}

export default DealStackCalculator;
