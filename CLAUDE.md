# Choir Competition Travel Planner — App

A personal web app (phone and desktop) for planning my trips to international choral competitions: budget, savings, payments, deadlines, competition candidates, and later flights and itinerary. One user: me.

It is the frontend for an existing planning system that currently lives as Markdown files in a claude.ai Project. **Until Phase 6 is done, those Project files remain the source of truth.** This app must never become a second, drifting copy of the truth.

## How I want to work

I'm a developer in the making. This project is for learning and for my portfolio.

- Explain what you're doing and why, briefly, especially for new concepts (React server components, SQL, RLS, migrations, testing).
- Work in small steps. Propose a plan before larger changes, and wait for my OK.
- When a task is a good learning exercise, offer to let me write it myself, with hints.
- One focused commit per meaningful step, with a clear message (Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Don't add libraries without saying why.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind CSS, deployed on Vercel (Hobby, free)
- Supabase: Postgres, Auth, Row Level Security (free plan)
- Charts: Recharts. Validation: Zod. Tests: Vitest. CI: GitHub Actions
- Supabase CLI for migrations (`supabase/migrations/`)
- Later: Supabase MCP server for Claude, scoped to this project, read-only by default
- No paid services. No Claude API unless I explicitly decide to add it.

## Privacy and security (non-negotiable)

- My real financial data and personal details NEVER go into the repo. Real data lives only in Supabase.
- The repo seeds the database with **fake demo data** only (`supabase/seed.sql`).
- Secrets only in `.env.local` (gitignored). Never commit keys. Only the Supabase publishable key (`sb_publishable_…`, formerly anon) may reach the browser; the secret key (`sb_secret_…`, formerly service-role) never does.
- Every table has RLS enabled. Policy: only my authenticated user can read or write.
- Free Supabase has no automatic backups: provide an "export my data" feature early.

## Domain rules the app must enforce

These come from the planning system. Encode them in the schema and in tested functions in `src/lib/domain/`, not just in UI text.

**Information states.** Every amount, date, or fact carries one: `confirmed`, `estimate`, `assumption`, `decision`, `pending`, `historical`, `conflicting`. Values never change state silently. A `confirmed` value requires a source.

**Sources.** A source has provider, tier (1 official, 2 operational/booking engine, 3 aggregator, 4 secondary, 5 community, 6 model estimate), URL, observation date, and applicable period. Never invent sources.

**Hard constraints (apply before cost):**
1. No itinerary may stop in the United States or Canada (connections, technical/refueling stops, same-flight-number stops; US territories such as Puerto Rico count as US). Overflight is fine. Every other country is acceptable; their transit requirements are not evaluated.
2. Be at the destination (landing plus onward travel) before the first required festival activity, and leave only after the final festival day.
3. No non-refundable competition-related commitment before the choir is officially accepted, unless I explicitly accept the risk.
4. The fare must allow my baggage: one checked suitcase, ~23 kg.

**Descriptive only, never ranking or scoring criteria:** flight duration, number of connections, which cities/airports a route connects through, other countries' transit requirements.

**Costs.**
- Effective Flight Cost = fare + required baggage + mandatory fees.
- Total Itinerary Cost = Effective Flight Cost + unavoidable route-caused costs (ground transport, forced extra nights).
- Total trip cost = all budget categories. Each expense belongs to exactly one category, counted once:
  A Competition · B International transport · C Accommodation · D Local/intercity transport · E Food · F Activities · G Connectivity · H Insurance · I Pre-trip · J Contingency.
- Every budget line has Minimum / Target / Conservative values. Target is the planning reference; Conservative is the financial-safety test.
- Keep the original currency of every expense. Base currency is USD. Conversions record the rate and its date.

**Savings.** The app tells me the **required** monthly saving (target and conservative): remaining amount ÷ remaining months, per deadline. It never asks for or plans around my "savings capacity". If I record money already set aside, it recalculates what's left.

**Payment timing matters as much as cost.** Track for each obligation: total, paid now, due later, due date, cancellation deadline, timing type (paid now, due on date, pay before arrival, pay at property, unknown, optional).

**Scope boundaries.**
- The app plans MY trip. It does not track or evaluate the choir's composition, categories, eligibility, or participation decisions. The choir director chooses the competition.
- No airport, hub, or airline is pre-selected or ranked in advance.
- Every change to plan data is recorded in an audit log (what, when, previous value, new value, reason).

## Build plan

Each phase ends with something working, committed, and pushed.

0. ✅ **Setup** — Next.js scaffold, this file, GitHub repo, Vercel deploy of the starter page.
1. **Auth** — Supabase project linked; magic-link login for my email only; protected app shell; mobile-first layout.
   - Uses Supabase's default Magic Link email template (PKCE `?code=` flow via `/auth/callback`): links must be opened in the same browser that requested them. Built-in email sender is rate-limited (~2/hour).
   - Optional later upgrade: free custom SMTP (e.g. Resend) + Magic Link template using `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` for cross-device links. `/auth/callback` already handles `token_hash`, so only the template changes.
2. **Data model** — Migrations for: trips, competitions, sources, budget_lines, payments, savings_entries, fx_rates, decisions, open_items, change_log. Enums for information states and budget categories. RLS on everything. Fake seed data.
3. **Read-only dashboard** — Required monthly saving, trip cost range, payment timeline, deadlines and open items; scenario and target/conservative toggles; charts.
4. **Rules as code** — Tested pure functions: savings requirement, US/Canada stop check, cost roll-ups, currency conversion.
5. **My inputs** — Record money set aside, mark payments done, edit budget lines with information state and source; audit log writes; data export.
6. **Claude bridge** — Supabase MCP (project-scoped) so research sessions can update data; migrate real numbers from the Project files; the Project's budget file then points to the database.
7. **Reports and polish** — Printable budget summary, payment calendar, README with screenshots and the story of the project.

## Current phase

Phase 1 — Auth.
