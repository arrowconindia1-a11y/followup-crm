# Free Account Setup — exact steps, before you need them

Create these four accounts first. Everything FollowUp AI CRM needs runs on
their free tiers (companion doc §2/§19). No credit card is required anywhere.

---

## 1) Supabase — database + auth + storage (Free plan)

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub (or email).
2. **New project**:
   - Organization: the default (your account) is fine.
   - **Name**: e.g. `followup-crm`.
   - **Database password**: generate a strong one — store it in your password
     manager. (The app never uses it directly; you need it for SQL tools.)
   - **Region**: pick the one closest to your customers (e.g. Mumbai
     `ap-south-1` for India).
   - Plan: **Free**.
3. Wait ~1–2 minutes for provisioning, then collect:
   - **Project Settings → API**:
     - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
     - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server-only secret — never ship to the browser**)
4. **Authentication → Providers → Email**: keep Email enabled; **turn OFF
   "Confirm email"** for smooth testing (turn back on before launch).
5. **SQL Editor → New query**: paste and run the contents of
   `supabase/migrations/0001` … `0008`, **in order**, one file at a time.
   Each must finish with "Success. No rows returned".

Free-plan limits to know: 500 MB database, 50,000 monthly active users,
projects pause after ~7 days of inactivity (one click to resume).

## 2) Vercel — hosting (Hobby plan)

1. Go to **https://vercel.com** → **Sign Up** → continue with the same GitHub account.
2. Hobby plan is selected by default (free; non-commercial use).
3. Push this repo to GitHub:
   - GitHub → **New repository** (private is fine) → push `followup-crm/`.
4. Vercel → **Add New → Project** → import that repo →
   Framework preset: **Next.js** (auto-detected) → **Deploy**.
5. **Settings → Environment Variables**: copy every key from `.env.example`
   with real values (apply to Production *and* Preview). Redeploy after.
6. Your app is live at `https://<project>.vercel.app`. Use that URL for
   the Meta webhook (`https://<project>.vercel.app/api/whatsapp/webhook`).

Free-plan limits: 100 GB bandwidth/mo, serverless functions up to 10 s
(fine for our routes), 100 GB-hours compute — far above what this app uses.

## 3) Google AI Studio — Gemini API key (free tier)

1. Go to **https://aistudio.google.com** → sign in with a Google account.
2. **Get API key** → **Create API key** in a new or existing project.
   Copy it → `GEMINI_API_KEY`.
3. The app defaults to `GEMINI_MODEL=gemini-2.0-flash` (Flash/Flash-Lite are
   the free-tier models in 2026; Pro requires billing).
4. Free tier ≈ 5–15 requests/min and ~1,000–1,500 requests/day — the app
   already enforces 6/min + 150/day per workspace plus a 500/month counter,
   so you stay under it by design.

## 4) Meta for Developers — WhatsApp Cloud API sandbox (free)

1. Go to **https://developers.facebook.com** → log in with Facebook.
2. **My Apps → Create App** → type **Business** → fill name (e.g.
   "FollowUp CRM") → create.
3. Add product: **WhatsApp** → **Set up** → you get a **test business
   portfolio** with a free sandbox test number (valid 90 days).
4. Copy:
   - **Temporary access token** (or better: create a **System User** token
     under Business Settings — temp tokens expire in ~60 min) → `WHATSAPP_TOKEN`
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
5. **To → recipient phone numbers**: add up to 5 verified test numbers.
   Put the same numbers (E.164, comma-separated) in `WHATSAPP_ALLOWED_RECIPIENTS`.
   The app refuses to message anyone else (fail-closed).
6. **Configuration → Webhook**: callback URL
   `https://<your-vercel-app>.vercel.app/api/whatsapp/webhook`,
   verify token = the value you set in `WHATSAPP_VERIFY_TOKEN`. Subscribe to
   `messages` and `message_status` fields.

Detailed walk-through with screenshots-equivalent detail: `SETUP.md` §11.

## 5) Stripe — TEST mode only (Phase 5)

1. Go to **https://dashboard.stripe.com/register** → email + password. No card needed.
2. Stay in **Test mode** (toggle top-right; keys start with `sk_test_`).
   The app **rejects any key that doesn't start with `sk_test_`** — live
   billing is deliberately impossible until you decide to launch.
3. **Developers → API keys** → Secret key → `STRIPE_SECRET_KEY`.
4. **Product catalogue → Add product**: name "FollowUp Pro", recurring
   price e.g. ₹999/mo (test). Copy the price id (`price_…`) → `STRIPE_PRICE_ID`.
5. **Developers → Webhooks → Add endpoint**:
   `https://<your-vercel-app>.vercel.app/api/billing/webhook`,
   events: `checkout.session.completed`, `customer.subscription.deleted`.
   Copy the signing secret (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
   Local testing alternative: Stripe CLI (`brew install stripe/stripe-cli/stripe`,
   then `stripe listen --forward-to localhost:3000/api/billing/webhook`).
6. Test checkout card: `4242 4242 4242 4242`, any future date, any CVC.

---

## Order of operations

1. Supabase (DB + auth + migrations 0001–0008)
2. Google AI Studio key → `.env.local` → AI Assistant works locally
3. `npm run dev`, sign up, create workspace → core CRM usable
4. Meta sandbox → WhatsApp panel works (§11)
5. Vercel deploy → public URL → set the Meta webhook to it
6. Stripe test keys → Settings → Billing checkout works (§12)
