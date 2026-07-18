# DealStack AU

DealStack AU is an Australian deal-intelligence platform for combining curated
cashback, discounted gift cards, loyalty points and community deal signals.

## Local development

Use Node 20 or newer, then:

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` when connecting Supabase. An unconfigured
local environment uses sample data. Production only uses samples when
`DATA_SOURCE=static` is set deliberately; empty or failed Supabase reads remain
empty so unpublished or expired samples cannot reappear as live deals.

Apply the Supabase migrations before starting a connected environment. The
latest migration adds the cross-instance monitor lease used to prevent
overlapping cron runs:

```bash
supabase db push
```

## Verification

```bash
npm run lint
npm run test:stack
npm run test:monitor
npm run test:repos
npm run build
```

## Data and safety model

- Public reads use the Supabase anon key and RLS, exposing only published or
  approved records.
- Admin reads and writes use the service role only after a valid authenticated
  user is checked against the private `admins` allowlist.
- Admin Auth users must be provisioned deliberately and then added to the
  `admins` table. The public magic-link form never creates a new Auth user.
- Offer availability is calculated using the Australia/Melbourne calendar.
  Expired, future and explicitly expired/unknown offers are excluded from the
  public weekly-deals experience.
- OzBargain RSS monitoring is implemented but disabled by default. It requires
  `CRON_SECRET`, `OZB_MONITOR_ENABLED=true`, an approved compliance review and
  an enabled feed source.
- Monitor output is written only to private staging tables. Every item requires
  manual review and becomes a pending signal before it can be approved publicly.

See [docs/ozbargain-monitoring.md](docs/ozbargain-monitoring.md) for the monitor
runbook, controls and compliance checklist.
