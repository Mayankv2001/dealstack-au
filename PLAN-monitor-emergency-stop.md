# PLAN-monitor-emergency-stop — One-click disable all feed sources from admin

> **Rank: 5 of 5.** Monitoring is deliberately gated and cautious, but the fastest immediate stop today still requires either a Vercel env change/redeploy or visiting every feed source and toggling it manually. `/admin/monitor` explains this, but it has no action. Add a reviewed, audited "Disable all feed sources" control for the case where an enabled feed starts erroring, a compliance concern appears, or the external scheduler is still firing.

## Goal

Add an admin-only emergency stop action on `/admin/monitor` that disables every currently enabled feed source immediately, writes an audit entry, revalidates monitor/admin pages, and never deletes staged feed items or changes public offers.

This does not change `OZB_MONITOR_ENABLED`; it makes the DB-level source allowlist empty so future cron/manual runs fetch nothing.

## Exact Files To Touch

| File | Change |
|---|---|
| `lib/admin/repos/feedSources.ts` | Add service-role function to disable all enabled feed sources and return affected count |
| `app/admin/(protected)/monitor/actions.ts` | New Server Action: require admin, rate-limit, disable all, audit, revalidate |
| `app/admin/(protected)/monitor/page.tsx` | Add an `ActionButton` in "How to stop monitoring" when enabled sources > 0 |
| `tests/admin/feedSourcesEmergencyStop.test.ts` | New pure/unit-ish tests for action/repo helper shape if feasible; otherwise test a pure result mapper |
| `docs/production-readiness.md` | Update emergency rollback section to mention the one-click stop |
| `docs/ozbargain-monitoring.md` | Update stop/rollback instructions to mention the admin control |

## Implementation Order

1. Read:
   - `lib/admin/repos/feedSources.ts`
   - `app/admin/(protected)/monitor/page.tsx`
   - `components/admin/ActionButton.tsx`
   - `app/admin/(protected)/cleanup/actions.ts` for the audited/rate-limited action pattern.
2. In `lib/admin/repos/feedSources.ts`, add:
   - `disableAllFeedSources(): Promise<number>`
   - Use service-role client.
   - Update `feed_sources` where `is_enabled = true` to `{ is_enabled: false }`.
   - Return the number of rows updated using `.select("id")` after the update.
   - Do not touch `feed_items`, `feed_fetch_log`, or `ozbargain_signals`.
3. Add `app/admin/(protected)/monitor/actions.ts`:
   - `"use server"`
   - `requireAdmin()`
   - `checkAdminRateLimit`
   - call `disableAllFeedSources`
   - `logAudit({ action: "monitor-disable-all-feeds", tableName: "feed_sources", rowId: null, diff: { disabledCount } })`
   - `revalidatePath("/admin/monitor")`, `/admin/signals/sources`, `/admin/dashboard`
   - Return `AdminActionResult`.
4. In `monitor/page.tsx`:
   - Import `ActionButton` and the action.
   - In "How to stop monitoring", add a button under Option 2 only when `status.feedSourcesEnabled > 0`.
   - Confirm text must say it disables all feed sources and does not delete staged items or change public data.
   - Show any action error inline via `ActionButton`.
5. Update docs with one sentence in each runbook; do not rewrite the whole docs.
6. Add tests where practical:
   - If mocking Supabase admin is already established, test row-count behaviour.
   - If not, at minimum test any pure helper you introduce and rely on lint/build for Server Action wiring.

## Edge Cases A Weaker Model Would Miss

1. **Do not flip `OZB_MONITOR_ENABLED`.** That is a deployment env var. This action only disables DB feed sources for immediate effect without redeploy.
2. **Do not delete staged data.** `feed_items` remain for audit/review. The action only changes `feed_sources.is_enabled`.
3. **Audit even when zero rows are changed.** A zero-row click is still an operator action and useful for history.
4. **Rate-limit the emergency action.** This is still a mutation and must use the same admin mutation budget.
5. **Do not expose a fetch/run button.** The monitor page stays read-only with respect to external requests; this action only disables internal DB rows.
6. **Revalidate source-management pages.** Otherwise `/admin/signals/sources` can show stale enabled toggles after the emergency stop.

## Acceptance Criteria

- [ ] `/admin/monitor` shows "Disable all feed sources" when at least one source is enabled.
- [ ] Clicking it requires confirmation and then all enabled feed sources become disabled.
- [ ] The action writes an audit row with action `monitor-disable-all-feeds` and the disabled count.
- [ ] No rows in `feed_items`, `feed_fetch_log`, `ozbargain_signals`, or offer tables are modified.
- [ ] `/admin/monitor`, `/admin/signals/sources`, and `/admin/dashboard` show the new disabled state after the action.
- [ ] `npm run test:admin`, `npm run lint`, and `npm run build` pass.

