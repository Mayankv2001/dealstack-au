This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Data Sources & Compliance

Deal data is **manually entered and curated** by admins; the public site reads
from Supabase (with a static sample fallback) and never makes external source
requests on a user's behalf.

OzBargain monitoring is **built but gated and OFF by default**. A single
secret-gated cron route (`GET /api/cron/monitor-feeds`) is the only path allowed
to fetch, and only when `OZB_MONITOR_ENABLED=true`, an approved compliance review
is on file, and at least one `feed_sources` row is enabled. It stages
`feed_items` for **mandatory admin review** and never auto-publishes anything.

**Scheduling:** Vercel Cron runs the route **once daily** on the Hobby plan
(`vercel.json`, kept daily so deploys stay valid). For more frequent polling, an
**optional external scheduler** (e.g. cron-job.org) can call the same
secret-gated route every 3 hours with `Authorization: Bearer ${CRON_SECRET}` —
both paths obey the same gates. See the safety, compliance, review and
scheduling rules in [docs/ozbargain-monitoring.md](docs/ozbargain-monitoring.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
