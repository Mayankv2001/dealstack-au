-- DealStack AU — product grouping for signals
--
-- product_group is an admin-assigned key that links signals for the SAME
-- product across different retailers (e.g. "airpods-pro-3"). The public search
-- uses it to render one product with a retailer price-comparison instead of N
-- separate cards. NULL = ungrouped (renders standalone, unchanged). Deliberately
-- admin-set, not auto-derived from freeform titles: a wrong public merge is
-- worse than no merge in a trust-first product.

alter table public.ozbargain_signals
  add column if not exists product_group text;

-- Partial index: only grouped rows are ever queried by this key.
create index if not exists idx_ozbargain_signals_product_group
  on public.ozbargain_signals (product_group)
  where product_group is not null;
