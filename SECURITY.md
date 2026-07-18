# Security Policy

## Supported versions

DealStack AU is deployed continuously from the `main` branch. Only the latest deployed version is supported with security fixes.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Instead, report privately via one of:

- **GitHub private vulnerability reporting** — use the "Report a vulnerability" button under the repository's Security tab, or
- **Email** — mayankverma484@gmail.com with a subject line starting with `[SECURITY]`.

Include as much detail as you can: affected route or component, steps to reproduce, and potential impact.

You can expect an acknowledgement within 72 hours and a status update within 14 days. Please allow a reasonable disclosure window before sharing details publicly.

## Scope

Reports of particular interest:

- Exposure of the Supabase service-role key or other secrets to client code or public routes
- Bypasses of the admin authentication or the admin-review gates that stage external feed data
- Row Level Security (RLS) policy bypasses allowing reads/writes outside the anon-key contract
- Abuse of the secret-gated cron/monitor route (`/api/cron/*`)
- Rate-limit bypasses on admin mutations

Out of scope: vulnerabilities in third-party services (Vercel, Supabase, OzBargain), denial-of-service reports without a concrete amplification vector, and reports requiring physical access to a maintainer's device.
