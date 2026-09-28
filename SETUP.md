# Setup Guide — Phases 1–2 (100% free tier)

Everything here runs on **Supabase Free** + **Vercel Hobby** + the **Gemini
API free tier**. No **service-role key** is used — every query runs as the
signed-in user through Postgres Row Level Security.

## The exact env variable names

| Variable | Where it comes from | Needed |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API Keys → *Project URL* | local **and** Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → *anon / public key* | local **and** Vercel |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key (free) | **Phase 2** (AI assistant) — local **and** Vercel |
| `GEMINI_MODEL` | optional — defaults to `gemini-2.0-flash` | only if you need another free model |

> `GEMINI_API_KEY` is deliberately **server-side only** (no `NEXT_PUBLIC_`
> prefix), so it never reaches the browser.

---

## 1. Prerequisites

- Node.js 18.18+ (`node -v`)
- Free accounts: [supabase.com](https://supabase.com), [vercel.com](https://vercel.com)
- A GitHub account only if you deploy via Git import

## 2. Create the Supabase project (free)

1. Go to **supabase.com → Dashboard → New project**.
2. Organization: **Free plan** (no card needed).
3. Name: `followup-crm`. Set a strong DB password (the app never needs it — store it in your password manager).
4. Region: pick the closest (e.g. **South Asia (Mumbai)**).
5. Wait ~2 minutes for provisioning.

## 3. Run the database migrations

Open **SQL Editor** (left sidebar) → **New query**, then paste and **Run** each
file from `supabase/migrations/` **in this order**:

1. `0001_core_auth_workspaces.sql` — profiles, workspaces, membership, RLS
2. `0002_leads.sql` — leads table + RLS
3. `0003_dashboard_views.sql` — dashboard metrics views
4. `0004_seed_demo_data.sql` — optional; powers the “Load 8 sample leads” button
5. `0005_tasks.sql` — **Phase 2**: real tasks table + RLS
6. `0006_ai_commands.sql` — **Phase 2**: AI command audit log (inert rows)

Each run should end with **“Success. No rows returned”**.

## 4. Make sign-up instant for testing

**Authentication → Sign In / Providers → Email** → turn **OFF** “Confirm email”.
(Sign-ups now get a session immediately. Turn it back **ON** before real users.)

## 5. Copy your keys

**Project Settings → API Keys** (older UIs: *API*):

- **Project URL** → value for `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → value for `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 6. Run locally

```bash
cd followup-crm
cp .env.example .env.local      # then edit the two values
npm install
npm run dev
```

Open **http://localhost:3000** → Sign up → create a workspace → dashboard.
Try the **“Load 8 sample leads”** button on an empty Leads page.

> If you see the amber “Supabase is not connected yet” screen, the values in
> `.env.local` aren’t being picked up — check for typos and **restart** the dev
> server after editing env files.

## 7. Deploy to Vercel (Hobby — free)

**Option A — Git import (recommended):**

1. Push this folder to a GitHub repository.
2. vercel.com → **Add New… → Project** → import the repo (Next.js is auto-detected).
3. Under **Environment Variables**, add both variables above for
   *Production*, *Preview* and *Development*.
4. **Deploy** → live at `https://<your-app>.vercel.app`.

**Option B — Vercel CLI:**

```bash
npm i -g vercel
vercel                                   # log in + link the project
vercel env add NEXT_PUBLIC_SUPABASE_URL      # paste value (repeat per environment)
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

> Env vars are baked in at build time — after changing them, redeploy
> (`vercel --prod` or push a commit).

## 8. Smoke-test checklist

- [ ] Sign up → redirected to workspace creation
- [ ] Create workspace → dashboard renders (zeros + empty states)
- [ ] Leads → “Load 8 sample leads” → table fills, KPIs update
- [ ] Search + status filter work; pagination footer correct
- [ ] Add a lead with a follow-up time → appears under “Needs follow-up”
- [ ] Change status inline in the table → badge/value persists after reload
- [ ] Edit + delete a lead from its detail page
- [ ] Sign out → `/dashboard` bounces to `/login`
- [ ] Second account cannot see the first account's leads (RLS)

**Phase 2 — AI Assistant** (needs `GEMINI_API_KEY` set + restart/redeploy):

- [ ] `/assistant` → “Follow up with Rahul Sharma tomorrow 5pm” → parsed preview shows a task with the right due time (IST)
- [ ] **Approve & apply** → task appears on `/tasks` with Rahul linked; command history shows “applied”
- [ ] “Mark Priya Nair as qualified” → preview → apply → her status badge changes on `/leads`
- [ ] A command about a non-existent lead → red “no lead found” block, apply disabled
- [ ] Two leads with similar names → “Which lead?” picker must be answered before apply
- [ ] Without `GEMINI_API_KEY`: clear “key missing” error, no crash
- [ ] Nothing is ever written without the explicit Approve click

## 9. What is mocked / deferred

- **Tasks are real as of Phase 2** (migrations 0005–0006) — the Phase 1 mock
  board was replaced by the real `tasks` table + API.
- **CSV import, message drafts, WhatsApp** — later phases per `DESIGN.md`.
- AI free-tier guards baked in: 6 commands/min + 150/day per workspace
  (server-side), 4 s client cooldown, 429 backoff on the Gemini call,
  8.5 s abort to stay inside Vercel's 10 s function timeout.

## 10. Free-tier notes

- Supabase Free **pauses the project after ~7 days of inactivity** — open the
  Supabase dashboard to wake it (this is expected in dev).
- 500 MB database limit is nowhere near for Phases 1–2.
- Vercel Hobby: 100 GB bandwidth/mo, 10 s function timeout — APIs are
  batched/paginated and the Gemini call aborts at 8.5 s to stay inside.
- Gemini free tier serves **Flash models only** (Pro was removed from the
  free tier in April 2026); limits are live-adjusted by Google, so the app
  treats 429s as normal and backs off.

## 11. Phase 4 — WhatsApp sandbox setup

> **Sandbox only.** This phase must never touch a real Business-verified
> number: the send path is hard-restricted to `WHATSAPP_ALLOWED_RECIPIENTS`
> (fail-closed — empty list = sending disabled entirely).

1. **Meta app**: [developers.facebook.com](https://developers.facebook.com) →
   My Apps → Create app → *Business* → add the **WhatsApp** product.
2. **Test number**: WhatsApp → API Setup gives you a free test number
   (90-day validity) and a temporary token. For a token that doesn't expire
   in 60 minutes, create a **system user** in Business Settings and generate
   a token with `whatsapp_business_messaging` + `whatsapp_business_management`.
3. **Verify recipients**: in API Setup → “To” field → *Add phone number* —
   verify up to **5** numbers via OTP. These are the ONLY numbers the app
   can message; put them in `WHATSAPP_ALLOWED_RECIPIENTS` (comma-separated).
4. **Env vars** (server-side only):
   ```
   WHATSAPP_TOKEN=<system user token>
   WHATSAPP_PHONE_NUMBER_ID=<Phone number ID from API Setup>
   WHATSAPP_VERIFY_TOKEN=<any random string you choose>
   WHATSAPP_ALLOWED_RECIPIENTS=+9198xxxxxxx,+9198yyyyyyy
   SUPABASE_SERVICE_ROLE_KEY=<service_role key — webhook writes only>
   ```
5. **Webhook**: WhatsApp → Configuration → Callback URL =
   `https://<your-app>.vercel.app/api/whatsapp/webhook`, Verify token = the
   same `WHATSAPP_VERIFY_TOKEN` value → *Verify and save* → subscribe to the
   **messages** field. (Local dev needs a public URL — deploy to Vercel first;
   the handshake works from the deployed URL.)
6. Run migration **`0007_whatsapp.sql`** in the SQL Editor.

**Phase 4 smoke test:**

- [ ] `/whatsapp` panel shows all four config checks green
- [ ] Mark a lead (with an allowlisted phone) opted-in → send a message → it
      arrives on the test phone; status walks `sent → delivered → read` in the panel
- [ ] Reply from the test phone → inbound message appears in the panel timeline
- [ ] Reply **STOP** → consent flips to *Opted out*; further sends are blocked
      with `NO_OPT_IN`
- [ ] Reply **START** → consent restored
- [ ] Send to a lead whose phone is NOT allowlisted → blocked with
      `RECIPIENT_NOT_ALLOWLISTED` (this is the sandbox guarantee working)

## 12. Phase 5 — Team roles, usage limits, Stripe (test mode only)

Exact free-account signup steps for every service (Supabase, Vercel,
Google AI Studio, Meta, Stripe) live in **`ACCOUNTS.md`** in the repo
root — read that first if you haven't created accounts yet.

First run migration **`0008_teams_billing_usage.sql`** (role-gated RLS,
`workspace_invites`, `usage_counters` + `bump_usage()`, billing columns).

**Roles** — `owner` / `admin` / `member` / `viewer`, enforced **in Postgres
RLS** (`can_write_workspace()` / `is_workspace_admin()` helpers), not just
the UI:

| capability | owner | admin | member | viewer |
| --- | :-: | :-: | :-: | :-: |
| read leads/tasks/usage | ✓ | ✓ | ✓ | ✓ |
| create/edit/delete leads & tasks, send WhatsApp | ✓ | ✓ | ✓ | ✗ (42501) |
| invite / change roles / remove members | ✓ | ✓ | ✗ | ✗ |
| manage billing | ✓ | ✓ | ✗ | ✗ |

A workspace always keeps at least one owner (API guard: `LAST_OWNER` 409).

**Inviting a teammate** (Settings → Team):
1. Owner/admin enters email + role → an invite row is stored and Supabase
   Auth sends the email (built-in free SMTP; if delivery fails the invite
   still stands).
2. The teammate signs up/logs in and opens **/settings** — pending invites
   addressed to their email are accepted automatically (service-role
   membership insert, matched on email).

**Usage limits** (free plan, per workspace, resets on the 1st UTC):
- AI commands: **500/month** (`ai_requests`, bumped on each successful
  Gemini call; over limit → HTTP 429 `USAGE_LIMIT`).
- WhatsApp sends: **1,000/month** (mirrors Meta's 1,000 free service
  conversations/month).
- Counters live in `usage_counters`; the only writer is the
  `bump_usage()` RPC (membership-checked). See them under **Settings → Usage**.

**Stripe — TEST mode only.** `src/lib/billing.ts` hard-rejects any
`STRIPE_SECRET_KEY` that doesn't start with `sk_test_`, so live billing is
impossible by construction. You need (details: `ACCOUNTS.md` §5):

```
STRIPE_SECRET_KEY=sk_test_…
STRIPE_PRICE_ID=price_…        # one recurring test price
STRIPE_WEBHOOK_SECRET=whsec_…
```

Local webhook testing (Stripe CLI is free):

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET
```

Checkout (Settings → Billing → Upgrade) opens Stripe-hosted **test**
checkout (card `4242 4242 4242 4242`); the webhook flips the workspace to
`plan: pro` / `billing_status: active_test`. No real money moves.

**Phase 5 smoke test — run it yourself:**

```bash
node scripts/smoke-phase5.mjs --email you@x.com --password secret123
# optional: --email2 teammate@x.com --password2 secret123  (viewer read-only test)
# optional: --base http://localhost:3000                   (health-check dev server)
```

Expected final line: `SMOKE TEST PASSED ✅`. Manual checks:

- [ ] Settings → Team shows you as `owner`
- [ ] Invite a second address → they sign up → auto-joined via /settings
- [ ] As `viewer` they can read but every write fails with a row-level-security error
- [ ] Settings → Usage bars show this month's counters
- [ ] Upgrade → test checkout → back at `/settings?billing=success` →
      status becomes `active_test` (webhook must be reachable)
