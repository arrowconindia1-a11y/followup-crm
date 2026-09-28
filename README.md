# FollowUp AI CRM

Zero-cost CRM for small businesses: never miss a follow-up.
Built strictly on free tiers — **Vercel Hobby + Supabase Free + Gemini
free tier + WhatsApp sandbox + Stripe test mode**.

**Status: Phase 5 complete** — auth, workspaces & team roles, leads,
dashboard, AI Assistant, WhatsApp, invites, usage limits, test-mode
billing; verified end-to-end against a real Postgres with RLS.
Free-account signups: [`ACCOUNTS.md`](./ACCOUNTS.md) · setup:
[`SETUP.md`](./SETUP.md) · architecture: [`DESIGN.md`](./DESIGN.md).

## What's built

| Feature | Status |
|---|---|
| Email/password auth (Supabase Auth) | ✅ |
| Workspace creation + switching, membership-scoped RLS | ✅ |
| Lead CRUD (API + UI): search, status filter, pagination | ✅ |
| Dashboard shell: KPIs, pipeline, needs-follow-up, recent leads (SQL views) | ✅ |
| AI command box (Gemini Flash free tier): parse → preview → explicit apply | ✅ |
| Real tasks engine (table + API + board; mock data retired) | ✅ |
| WhatsApp (Meta sandbox only): opt-in/opt-out store, webhook + delivery status, fail-closed allowlist send | ✅ |
| Team roles (owner/admin/member/viewer) enforced in RLS + invites | ✅ |
| Usage limits: 500 AI commands & 1,000 WhatsApp sends / workspace / month | ✅ |
| Billing: Stripe **test mode** checkout + webhook (live keys rejected) | ✅ |
| CSV import / message drafts | ⏳ later phases |

## Quick start

```bash
cp .env.example .env.local   # fill in the 2 Supabase values (see SETUP.md)
npm install
npm run dev                  # http://localhost:3000
```

Then run `supabase/migrations/0001…0008` in the Supabase SQL Editor.

## Environment variables

| Name | Required |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes |
| `GEMINI_API_KEY` | Phase 2 (AI assistant) — server-side only, never `NEXT_PUBLIC_` |
| `GEMINI_MODEL` | optional (default `gemini-2.0-flash`) |
| `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` | Phase 4 — Meta sandbox test number, server-side only |
| `WHATSAPP_VERIFY_TOKEN` | Phase 4 — webhook handshake (your random string) |
| `WHATSAPP_ALLOWED_RECIPIENTS` | Phase 4 — **fail-closed** send allowlist (empty = no sends) |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 4 — webhook writes only, server-side only |
| `STRIPE_SECRET_KEY` | Phase 5 — **must start with `sk_test_`** (live keys rejected) |
| `STRIPE_PRICE_ID` | Phase 5 — recurring test price (`price_…`) |
| `STRIPE_WEBHOOK_SECRET` | Phase 5 — webhook signing secret (`whsec_…`) |

Same variables in Vercel (Production/Preview/Development). No
service-role key — Row Level Security does the authorization.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres +
Auth + RLS) · zod. Every dependency is MIT/Apache-licensed and free.

## Scripts

- `npm run dev` — dev server on `0.0.0.0:3000`
- `npm run build` — production build (also the typecheck gate)
- `npm start` — serve the production build
