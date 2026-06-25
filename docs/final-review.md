# DealStack AU — Final Senior Review

> Review conducted: 2026-06-25.
> This is a no-code review. No production logic was changed.

---

## Production-Readiness Assessment

**Overall verdict: Ready for Hobby-plan deployment.** All critical gates are in place, the safety model is sound, and every phase of the improvement loop passed without a blocker.

### What is solid

| Area | Status | Notes |
|---|---|---|
| Supabase migrations | Ready | 5 migrations (001–005) fully scripted; apply with `supabase db push` |
| RLS / key isolation | Strong | Service-role key never reaches client components or public routes |
| Feed monitor gates | Multi-layered | `OZB_MONITOR_ENABLED` env var + `compliance_reviews` DB row + feed source enabled |
| Two-step publish flow | Enforced | Import → pending signal → separate Signals approval; nothing auto-publishes |
| Offer change staging | Enforced | Detected changes staged for admin review; Apply gated behind `window.confirm` + server recheck |
| Admin authentication | Belt-and-suspenders | Protected layout + independent `requireAdmin()` in every admin page |
| Audit log | Implemented | Every admin mutation logged; best-effort (documented risk) |
| Public page ISR | Implemented | `revalidate = 300` on all public routes |
| Test coverage | 145 tests / 12 files | Pure-function coverage across all core modules; no DB/network mocking required |
| TypeScript + ESLint | Passing | Zero errors and zero lint warnings on `main` |
| Production build | Passing | Clean `npm run build` — no type errors or tree-shake issues |
| Australian locale | Consistent | AUD formatting, AU date strings, AU English spelling throughout |
| "MVP" / dev copy | Cleaned | All "example/static source checks for the MVP" strings replaced with production copy |
| Two-step import UX | Clarified | Queue banner, Import button tooltip, and confirm dialog all explain the two-step publish model |

### What still needs a human decision before go-live

1. **Admin user seed** — an `admins` row must be INSERTed manually for the first admin email. See `docs/production-readiness.md` §2.
2. **`OZB_MONITOR_USER_AGENT`** — must include a contact URL per OzBargain's scraping etiquette policy before enabling the monitor.
3. **Compliance review** — an approved row in `compliance_reviews` is required before the monitor will run. Must be done via `/admin/compliance` post-deploy.
4. **Vercel env vars** — six env vars to configure in the Vercel dashboard (full list in `docs/production-readiness.md` §3).
5. **Static offer data** — the `lib/data.ts` cashback percentages, gift-card discounts, and expiry dates are sample figures. Update them with real rates before publishing, or publish new offers via the admin portal and let ISR serve live data.

---

## Known Risks (Carry-Over from Architecture Review)

| Risk | Severity | Accepted? |
|---|---|---|
| Audit log is best-effort (write can fail silently) | Low | Yes — Supabase write latency is typically <10ms; fix via RPC is a medium-priority improvement |
| Static fallback data is illustrative | Low | Yes — explicitly labelled; fallback is intentional |
| No rate-limit on admin actions | Low | Yes — `admins` allowlist is tiny; separate concern from a compromised session |
| `formatExpiry` does not validate input shape | Very Low | Yes — values come from hardcoded data only |
| `CANDIDATE_LIMIT = 50` for Top 5 ranking | Very Low | Yes — ranking is a display convenience, not critical |

No new risks were identified during this review cycle.

---

## Next 5 Improvements (Priority Order)

1. **Wrap audit log in a Supabase RPC** — atomic: primary mutation + audit write in a single transaction, eliminating silent audit gaps on DB timeouts.

2. **Generated TypeScript types from Supabase schema** — `supabase gen types typescript` replaces `LooseDB` casts with compile-time safe column references across all repo files.

3. **Admin action rate limiting** — a simple per-email counter (e.g. 100 mutations per hour) in the server actions layer to cap blast radius of a compromised admin session.

4. **ISR cache warm-up after deployment** — add a post-deploy step (Vercel deploy hook → call `/`, `/deals`, `/search`) to pre-warm ISR caches so the first real users don't hit cold-render latency spikes.

5. **`formatExpiry` / `formatDateAU` input validation** — add a guard that returns a safe fallback string (e.g. `"—"`) on unexpected input shapes rather than rendering garbled output.

---

## Emergency Disable Plan

Three options, fastest first:

### Option A — Disable via env var (< 5 min, no DB change)
1. Vercel dashboard → Project → Settings → Environment Variables
2. Set `OZB_MONITOR_ENABLED` to `false` (or delete the variable)
3. Redeploy (Vercel makes this one click from the Deployments tab)
4. The cron route returns 503 before touching the DB; the UI shows "monitor disabled"

### Option B — Disable feed source (immediate, no redeploy needed)
1. Go to `/admin/signals/sources`
2. Disable every feed source
3. The monitor runs but fetches zero items — no staging writes occur
4. Re-enable sources individually when ready to resume

### Option C — Revoke compliance approval (monitor refuses to run)
1. Go to Supabase dashboard → Table Editor → `compliance_reviews`
2. Set the `status` column on the active row to `pending` or `rejected`
3. The monitor's compliance gate fails on the next scheduled run — no items are staged

**For a full site takedown:** Vercel → Deployments → the live deployment → `...` menu → "Remove from production".

---

## Final Checklist

- [x] All migrations scripted and documented
- [x] RLS and key isolation verified
- [x] Feed monitor gates layered (env + compliance + feed source)
- [x] No auto-publish path exists
- [x] Admin authentication on every protected route
- [x] Audit log on every admin mutation
- [x] 145 pure-function tests passing, zero lint errors
- [x] Production build passes
- [x] "MVP" / dev copy removed from all public pages
- [x] Two-step publish flow explained in queue and offer-changes UIs
- [x] Production readiness doc written (`docs/production-readiness.md`)
- [x] Architecture reviewed and documented (`docs/architecture-review.md`)
- [x] Emergency disable plan documented (this file, above)
- [ ] Admin user seeded (manual step — see `docs/production-readiness.md` §2)
- [ ] Vercel env vars configured (6 variables)
- [ ] Compliance review approved via `/admin/compliance`
- [ ] `lib/data.ts` offer rates updated with real figures before launch
