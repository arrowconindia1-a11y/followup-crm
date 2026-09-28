# FollowUp AI CRM — Zero-Cost Build Design Pack (pre-code, for approval)

**Status:** DESIGN ONLY — no code written yet. Awaiting approval to start Phase 1.
**Spec source:** `uploads/FollowUp_AI_CRM_Zero_Cost_Build_Plan.pdf` (companion doc, fully parsed).

---

## 0. Source documents & one important gap

| Document | Status |
|---|---|
| Zero-Cost Build Plan (companion) | ✅ Received & fully parsed (3 pages) |
| Original FollowUp AI CRM Requirements Pack (contains Section 11 schema, Section 12 API contract) | ❌ **Not in the workspace — did not arrive with the upload** |

Consequence: the companion doc only *reproduces* Section 16's phase table and summarizes Sections 4/10/13. It does **not** contain the Section 11 schema or Section 12 API contract. So the schema (§4 below) and API contract (§5 below) are **proposed designs inferred from the companion's module list** (leads, tasks, AI commands, drafts, templates, conversations, WhatsApp compliance, workspaces, roles, usage limits, billing). They are internally consistent and cover every module the companion names — but table/field/endpoint names may differ from the original pack. When you upload the pack, I will diff mine against Sections 11/12 and reconcile before any code depends on them.

---

## 1. Confirmed zero-cost stack (per companion §2, verified against live 2026 limits)

| Layer | Choice | Cost | Verified limit (2026) |
|---|---|---|---|
| Frontend + backend | Next.js (App Router, TS) on **Vercel Hobby** | $0 | 100 GB bw/mo, 10 s function timeout, cron ≤ 1 run/day |
| DB / Auth / Storage | **Supabase Free** (Postgres + Auth + RLS + Storage) | $0 | 500 MB DB, 1 GB storage, auto-pause after 7 days idle |
| Scheduler | **Supabase pg_cron** (+ pg_net to call our API); Vercel Cron NOT used (daily-only cap) | $0 | pg_cron included in free Postgres; runs in UTC |
| AI | **Google Gemini API free tier**, Flash model, structured JSON output, server-side key only | $0 | Free tier = Flash / Flash-Lite only since Apr 2026; ~5–15 RPM, ~1,000–1,500 req/day → app handles 429 with backoff; model name is env-configurable |
| WhatsApp | **Meta Cloud API direct** (no Twilio/Gupshup), sandbox test number | $0 | Test number free (90-day validity, up to 5 whitelisted recipient numbers, temporary tokens expire in 60 min → use a system user token); 1,000 free service conversations/mo once live |
| CSV import | **Client-side Papaparse** → validated batches hit the API | $0 | Keeps heavy parsing off the 10 s serverless budget |
| Billing (Phase 5) | **Stripe test mode** | $0 | Test mode free & unlimited; live mode only at first paying customer |
| Domain | `yourapp.vercel.app` subdomain | $0 | Custom domain deferred |
| Monitoring | Vercel logs + Supabase logs + `activity_log` / `whatsapp_events` tables | $0 | No paid observability |

**No paid service, SDK, or SaaS dependency anywhere in Phases 1–6.** See ledger in §2.

---

## 2. Dependency & cost ledger (every runtime dependency, all free)

| Dependency | License/cost | Free alternative considered |
|---|---|---|
| `next`, `react` | MIT, free | Vite SPA + separate API — rejected: two deploy targets |
| `@supabase/supabase-js` | MIT, free | Raw REST/PostgREST — rejected: loses typed client + auth helpers |
| `@google/generative-ai` (or plain `fetch` to REST) | Apache-2.0, free | Groq free tier (Llama/Mixtral) — kept as documented fallback via env flag, per companion §3.2 |
| `zod` | MIT, free | Hand-rolled validation — rejected: error-prone |
| `papaparse` | MIT, free | Server-side CSV parsing — rejected: burns 10 s function budget + server compute (companion mandates client-side) |
| `tailwindcss` | MIT, free | Plain CSS — fine either way, zero cost difference |
| `recharts` (dashboard charts, Phase 1) | MIT, free | Hand-rolled SVG charts — kept as fallback |
| `stripe` / `@stripe/stripe-js` (Phase 5 only, **test mode**) | MIT, free in test | Skip Stripe entirely — rejected: companion §3.1 says keep it in test mode |

If anything outside this list is ever needed, I will stop and ask first, per your instruction.

---

## 3. Folder structure

```
followup-crm/
├── DESIGN.md                      ← this document
├── README.md
├── package.json
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json                    ← optional daily Vercel Cron entry (off by default; pg_cron is primary)
├── .env.example                   ← all env vars documented, zero secrets
├── supabase/
│   └── migrations/                ← run in order via Supabase SQL editor
│       ├── 0001_extensions_enums.sql      (pg_cron, pg_net, pgcrypto; all enum types)
│       ├── 0002_core_tables.sql           (Phase 1: profiles, leads, tasks, activity_log, triggers, indexes)
│       ├── 0003_rls_policies.sql          (owner-scoped RLS, security_invoker views)
│       ├── 0004_seed_sample_data.sql      (sample leads/tasks for dashboard)
│       ├── 0005_dashboard_views.sql       (SQL views for metrics — no BI tool)
│       ├── 0006_ai_commands.sql           (Phase 2)
│       ├── 0007_messaging.sql             (Phase 3: templates, conversations, messages)
│       ├── 0008_whatsapp.sql              (Phase 4: optins, settings, templates, events)
│       ├── 0009_pg_cron_jobs.sql          (overdue scan, daily digest, event pruning)
│       └── 0010_workspaces_billing.sql    (Phase 5: workspaces, members, usage, Stripe test)
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (auth)/signup/page.tsx
│   │   ├── (dashboard)/layout.tsx         ← sidebar nav, auth guard
│   │   ├── (dashboard)/page.tsx           ← dashboard (KPIs, today's follow-ups, overdue)
│   │   ├── (dashboard)/leads/page.tsx         ← table + filters
│   │   ├── (dashboard)/leads/new/page.tsx
│   │   ├── (dashboard)/leads/[id]/page.tsx    ← detail + tasks + timeline
│   │   ├── (dashboard)/tasks/page.tsx
│   │   ├── (dashboard)/import/page.tsx        ← CSV drag-drop → Papaparse → map → preview → commit
│   │   ├── (dashboard)/assistant/page.tsx     ← Phase 2: NL command box + approval preview
│   │   ├── (dashboard)/conversations/page.tsx            ← Phase 3
│   │   ├── (dashboard)/conversations/[id]/page.tsx       ← Phase 3: timeline + draft composer
│   │   ├── (dashboard)/templates/page.tsx                ← Phase 3
│   │   ├── (dashboard)/settings/whatsapp/page.tsx        ← Phase 4
│   │   ├── (dashboard)/settings/workspace/page.tsx       ← Phase 5
│   │   └── api/
│   │       ├── leads/route.ts                 (GET list, POST create)
│   │       ├── leads/[id]/route.ts            (GET, PATCH, DELETE)
│   │       ├── leads/import/route.ts          (POST batches)
│   │       ├── leads/[id]/optout/route.ts     (POST)
│   │       ├── tasks/route.ts                 (GET, POST)
│   │       ├── tasks/[id]/route.ts            (PATCH complete/snooze/reschedule)
│   │       ├── dashboard/metrics/route.ts     (GET, reads SQL views)
│   │       ├── ai/command/route.ts            (POST NL → parsed JSON preview)
│   │       ├── ai/command/[id]/apply/route.ts (POST apply approved command)
│   │       ├── ai/command/route.ts            (GET history)
│   │       ├── ai/draft/route.ts              (POST message draft)
│   │       ├── templates/route.ts             (GET, POST)
│   │       ├── templates/[id]/route.ts        (PATCH, DELETE)
│   │       ├── conversations/route.ts         (GET)
│   │       ├── conversations/[id]/messages/route.ts (GET, POST)
│   │       ├── messages/[id]/approve/route.ts (POST approve/reject)
│   │       ├── messages/[id]/send/route.ts    (POST — real send in Phase 4)
│   │       ├── whatsapp/webhook/route.ts      (GET verify, POST events)
│   │       ├── whatsapp/send/route.ts         (POST direct send)
│   │       ├── whatsapp/templates/route.ts    (GET sync from Meta)
│   │       ├── workspaces/route.ts            (Phase 5)
│   │       ├── workspaces/[id]/members/route.ts
│   │       ├── usage/route.ts
│   │       ├── billing/checkout/route.ts      (Stripe test)
│   │       ├── billing/webhook/route.ts
│   │       └── cron/[job]/route.ts            (Bearer CRON_SECRET; called by pg_cron via pg_net)
│   ├── components/
│   │   ├── ui/            (button, input, table, modal, toast, badge…)
│   │   ├── leads/         (lead-form, lead-table, lead-drawer, status-pill)
│   │   ├── tasks/         (task-list, task-row, snooze-menu)
│   │   ├── import/        (csv-dropzone, column-mapper, preview-table)
│   │   ├── assistant/     (command-box, parsed-preview, approve-actions)
│   │   ├── messaging/     (timeline, draft-composer, approval-banner)
│   │   └── dashboard/     (kpi-card, followups-today, pipeline-bars)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts      (browser client)
│   │   │   ├── server.ts      (cookie-based server client)
│   │   │   ├── admin.ts       (service-role — webhook/cron only, never in pages)
│   │   │   └── middleware.ts  (session refresh + route guard)
│   │   ├── gemini.ts          (Flash call, JSON schema mode, 429 backoff, token meter)
│   │   ├── ai/prompts.ts      (command-parser + draft prompts, compliance rules)
│   │   ├── ai/schema.ts       (zod schema for structured AI output)
│   │   ├── whatsapp.ts        (Cloud API client: send, templates, media)
│   │   ├── csv.ts             (Papaparse wrapper, column mapping, client validation)
│   │   ├── validate.ts        (shared zod schemas: LeadInput, TaskInput…)
│   │   ├── compliance.ts      (price/discount/warranty/delivery/legal/payment detectors)
│   │   └── throttle.ts        (client-side RPM guard for AI calls)
│   └── types/
│       └── database.ts        (generated from Supabase schema)
└── scripts/
    └── seed.ts                (local sample-data seeder, mirrors migration 0004)
```

---

## 4. Database schema — PROPOSED (reconcile against Section 11 when the pack arrives)

All tables: `uuid` PKs via `gen_random_uuid()`, `created_at`/`updated_at timestamptz`, RLS **enabled on every table**.
Phase 1 RLS rule: `owner_id = auth.uid()`. Phase 5 migrates ownership to `workspace_id` + `is_workspace_member()` helper.

### Enums (migration 0001)

```sql
create type lead_status     as enum ('new','contacted','qualified','proposal_sent','won','lost','dead');
create type task_status     as enum ('pending','snoozed','completed','cancelled');
create type task_priority   as enum ('low','medium','high','urgent');
create type channel_type    as enum ('whatsapp','email','sms','call','manual');
create type message_direction as enum ('inbound','outbound');
create type message_status  as enum ('draft','pending_approval','approved','rejected','sending','sent','delivered','read','failed');
create type optin_status    as enum ('unknown','opted_in','opted_out');
create type member_role     as enum ('owner','admin','member','viewer');
```

### Phase 1 — core (migration 0002)

```sql
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- trigger on auth.users insert → auto-create profile row

create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id),
  name              text not null,
  phone             text,                        -- E.164 preferred (+91…)
  email             text,
  company           text,
  source            text,                        -- website/referral/instagram/csv_import/manual
  status            lead_status not null default 'new',
  notes             text,
  custom_fields     jsonb not null default '{}'::jsonb,
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index leads_owner_phone_uniq on public.leads(owner_id, phone) where phone is not null;
create index leads_owner_status_followup_idx on public.leads(owner_id, status, next_follow_up_at);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads(id) on delete set null,
  created_by    uuid not null references public.profiles(id),
  title         text not null,
  description   text,
  due_at        timestamptz not null,
  status        task_status not null default 'pending',
  priority      task_priority not null default 'medium',
  snoozed_until timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tasks_owner_status_due_idx on public.tasks(created_by, status, due_at);
create index tasks_lead_idx on public.tasks(lead_id) where lead_id is not null;

create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id),
  entity_type text not null,                     -- 'lead' | 'task' | 'message' | …
  entity_id   uuid,
  action      text not null,                     -- 'created' | 'updated' | 'completed' | …
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
```

### Phase 1 — dashboard views (migration 0005; SQL views, no BI tool)

```sql
create view public.v_dashboard_metrics with (security_invoker = true) as
  select l.owner_id,
         count(*)                                              as total_leads,
         count(*) filter (where l.status = 'new')              as new_leads,
         count(*) filter (where l.status = 'contacted')        as contacted,
         count(*) filter (where l.status = 'qualified')        as qualified,
         count(*) filter (where l.status = 'proposal_sent')    as proposals,
         count(*) filter (where l.status = 'won')              as won,
         count(*) filter (where l.status = 'lost')             as lost,
         count(*) filter (where l.created_at > now() - interval '7 days') as leads_7d,
         count(*) filter (where l.next_follow_up_at::date = current_date) as followups_today,
         count(*) filter (where l.next_follow_up_at < now()
                            and l.status not in ('won','lost','dead'))    as followups_overdue
  from public.leads l group by l.owner_id;

create view public.v_overdue_tasks with (security_invoker = true) as
  select * from public.tasks
  where status = 'pending' and due_at < now();
```

### Phase 2 — AI assistant (migration 0006)

```sql
create table public.ai_commands (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id),
  raw_text          text not null,
  model             text not null,               -- e.g. 'gemini-2.0-flash' (env-configurable)
  parsed            jsonb,                       -- structured output (never auto-applied)
  valid             boolean not null default false,
  validation_errors jsonb,
  applied           boolean not null default false,
  applied_at        timestamptz,
  latency_ms        int,
  tokens_used       jsonb,
  created_at        timestamptz not null default now()
);
```

### Phase 3 — messaging drafts (migration 0007)

```sql
create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id),
  name       text not null,
  category   text,                               -- reminder / quote / festive / reactivation
  body       text not null,                      -- supports {{lead_name}} style variables
  variables  text[] not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  channel         channel_type not null default 'whatsapp',
  status          text not null default 'open',  -- open | closed
  started_at      timestamptz not null default now(),
  last_message_at timestamptz
);
create index conversations_lead_idx on public.conversations(lead_id);

create table public.messages (
  id                      uuid primary key default gen_random_uuid(),
  conversation_id         uuid not null references public.conversations(id) on delete cascade,
  lead_id                 uuid not null references public.leads(id) on delete cascade,
  direction               message_direction not null,
  body                    text not null,
  status                  message_status not null default 'draft',
  template_id             uuid references public.message_templates(id),
  ai_generated            boolean not null default false,
  requires_human_approval boolean not null default false,
  compliance_flags        jsonb not null default '[]'::jsonb,  -- ['price','discount','warranty','delivery','legal','payment']
  approved_by             uuid references public.profiles(id),
  approved_at             timestamptz,
  external_id             text,                    -- provider message id (wamid in Phase 4)
  sent_at                 timestamptz,
  delivered_at            timestamptz,
  read_at                 timestamptz,
  error                   text,
  created_at              timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);
```

> Compliance rule (companion §3.3, unchanged from original Section 13): any outbound message whose draft touches **price / discount / warranty / delivery / legal / payment commitments** gets `requires_human_approval = true` and cannot transition to `sent` without an `approved` step. Enforced in the DB (CHECK constraint on status transition via trigger) **and** in the API.

### Phase 4 — WhatsApp (migration 0008)

```sql
create table public.whatsapp_optins (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  phone       text not null,
  status      optin_status not null default 'unknown',
  method      text,                -- keyword | form | manual | imported_consent
  note        text,
  recorded_at timestamptz not null default now(),
  unique (lead_id, phone)
);

create table public.whatsapp_settings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid unique not null references public.profiles(id),
  waba_id          text,
  phone_number_id  text,
  verify_token     text,           -- webhook handshake token (random, per user)
  is_test_number   boolean not null default true,
  updated_at       timestamptz not null default now()
);

create table public.whatsapp_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id),
  name        text not null,
  language    text not null default 'en',
  category    text,
  body        text,
  meta_status text,                -- Meta approval state (sandbox: pre-approved test templates)
  meta        jsonb,
  unique (owner_id, name, language)
);

create table public.whatsapp_events (
  id            bigint generated always as identity primary key,
  lead_id       uuid,
  message_id    uuid,
  wa_message_id text,
  event_type    text not null,     -- received | sent | delivered | read | failed
  payload       jsonb not null,
  received_at   timestamptz not null default now()
);
create index whatsapp_events_wamid_idx on public.whatsapp_events(wa_message_id);
-- pruned to 90 days by pg_cron to protect the 500 MB budget
```

### Phase 5 — SaaS foundation (migration 0010)

```sql
create table public.workspaces (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text unique not null,
  plan                  text not null default 'free',
  stripe_customer_id    text,          -- Stripe TEST mode ids only until launch
  stripe_subscription_id text,
  billing_status        text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  role         member_role not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.usage_counters (
  workspace_id           uuid references public.workspaces(id) on delete cascade,
  period_month           date not null,
  ai_requests            int not null default 0,
  whatsapp_conversations int not null default 0,
  storage_bytes          bigint not null default 0,
  primary key (workspace_id, period_month)
);

-- Migration also: ALTER leads/tasks/messages/… ADD workspace_id; backfill each
-- user's existing rows into a personal workspace; swap RLS policies from
-- owner_id = auth.uid() to is_workspace_member(workspace_id).
```

### Scheduling — pg_cron (migration 0009; primary scheduler, per your instruction)

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- every 30 min: flag overdue tasks/follow-ups (sub-daily → must be pg_cron, Vercel Hobby cron is daily-only)
select cron.schedule('followup-overdue-scan', '*/30 * * * *',
  $$ select net.http_post(
       url := 'https://<your-app>.vercel.app/api/cron/overdue-scan',
       headers := '{"Authorization":"Bearer <CRON_SECRET>"}'::jsonb,
       timeout_milliseconds := 9000) $$);

-- daily 03:30 UTC (= 09:00 IST): digest of today's follow-ups
select cron.schedule('daily-digest', '30 3 * * *',
  $$ select net.http_post(
       url := 'https://<your-app>.vercel.app/api/cron/daily-digest',
       headers := '{"Authorization":"Bearer <CRON_SECRET>"}'::jsonb,
       timeout_milliseconds := 9000) $$);

-- weekly: prune old webhook payloads (500 MB guard)
select cron.schedule('prune-whatsapp-events', '0 3 * * 0',
  $$ delete from public.whatsapp_events where received_at < now() - interval '90 days' $$);
```

---

## 5. API contract — PROPOSED (reconcile against Section 12 when the pack arrives)

**Conventions**
- Base: same-origin Next.js route handlers under `/api` (no separate server).
- Auth: Supabase JWT via middleware. Unauthenticated → `401`. Only `/api/whatsapp/webhook` (Meta handshake) and `/api/cron/*` (Bearer `CRON_SECRET`) skip user auth; `/api/billing/webhook` uses Stripe signature.
- Envelope: success `{"data": …}` (lists add `"meta": {"total", "page", "limit"}`); error `{"error": {"code": "UPPER_SNAKE", "message": "human readable"}}`.
- All bodies validated with zod; unknown fields rejected.
- AI endpoints: server-side Gemini only; client throttled to ≤ 1 req/4 s; on `429` → exponential backoff + friendly "AI is busy, retrying" (free-tier RPM guard).

### Phase 1 — leads, tasks, import, dashboard

| Method & path | Request | Response |
|---|---|---|
| `POST /api/leads` | `{name, phone?, email?, company?, source?, notes?, custom_fields?, next_follow_up_at?}` | `201 {data: Lead}` |
| `GET /api/leads?status=&search=&source=&page=&limit=&sort=` | query filters | `{data: Lead[], meta}` |
| `GET /api/leads/:id` | — | `{data: {lead, tasks[], recent_messages[]}}` |
| `PATCH /api/leads/:id` | partial Lead fields (incl. `status`, `next_follow_up_at`) | `{data: Lead}` |
| `DELETE /api/leads/:id` | — | `204` |
| `POST /api/leads/import` | `{rows: LeadRow[], mode: "preview"\|"commit"}` — rows already parsed **client-side by Papaparse**, batched ≤ 100/request | preview: `{data: {valid: n, invalid: [{row, errors}], duplicates: [{row, existing_lead_id}]}}`; commit: `{data: {inserted, skipped_duplicates, errors[]}}` |
| `GET /api/tasks?status=&due=overdue\|today\|week&lead_id=` | — | `{data: Task[], meta}` |
| `POST /api/tasks` | `{lead_id?, title, description?, due_at, priority?}` | `201 {data: Task}` |
| `PATCH /api/tasks/:id` | `{status?, due_at?, snoozed_until?, priority?}` (complete sets `completed_at`) | `{data: Task}` |
| `GET /api/dashboard/metrics` | — | `{data: {leads_by_status{}, followups_today, followups_overdue, tasks_overdue[], leads_7d}}` (reads SQL views) |

### Phase 2 — AI command box (never auto-applies)

| Method & path | Request | Response |
|---|---|---|
| `POST /api/ai/command` | `{text}` e.g. *"follow up with Rahul Sharma tomorrow 5pm, he asked for a quote"* | `{data: {command_id, parsed: {intents:[{type:"create_task", fields:{…}}, {type:"update_lead", …}]}, valid, errors[], preview: {tasks_to_create:[], lead_updates:[]}}}` — parsed via Gemini structured JSON output, validated with zod |
| `POST /api/ai/command/:id/apply` | — (user approved the preview in UI) | `{data: {applied: [{entity, id, action}]}}`; sets `applied=true` |
| `GET /api/ai/commands?limit=` | — | `{data: AiCommand[], meta}` (history + audit) |

### Phase 3 — drafts, templates, conversations

| Method & path | Request | Response |
|---|---|---|
| `GET/POST /api/templates` | POST: `{name, category?, body, variables?}` | `{data: Template}` |
| `PATCH/DELETE /api/templates/:id` | partial / — | `{data: Template}` / `204` |
| `POST /api/ai/draft` | `{lead_id, template_id?, tone?, instructions?}` | `{data: {draft, compliance_flags[], requires_human_approval}}` — flags auto-set from compliance detectors |
| `GET /api/conversations?lead_id=&status=` | — | `{data: Conversation[], meta}` |
| `GET /api/conversations/:id/messages?limit=` | — | `{data: Message[], meta}` (timeline) |
| `POST /api/conversations/:id/messages` | `{body, template_id?, ai_generated?}` → outbound message saved as `draft` (or `pending_approval` if flagged) | `201 {data: Message}` |
| `POST /api/messages/:id/approve` | `{decision: "approve"\|"reject", note?}` | `{data: Message}` — required before send when `requires_human_approval` |
| `POST /api/messages/:id/send` | — | Phase 3: marks `sent` only via manual copy-paste confirmation flow; Phase 4: real Cloud API send |

### Phase 4 — WhatsApp (sandbox)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/whatsapp/webhook?hub.mode=&hub.verify_token=&hub.challenge=` | Meta verification handshake | echoes `hub.challenge` when token matches user's `verify_token` |
| `POST /api/whatsapp/webhook` | Meta event payload | `200` fast-ack; async-updates `messages` statuses (`sent/delivered/read/failed`), inserts inbound messages into timelines, logs to `whatsapp_events` (idempotent on `wa_message_id`); `STOP` keyword → `opted_out` |
| `POST /api/messages/:id/send` | — | Sends approved outbound via Cloud API **only if** lead's opt-in = `opted_in`; stores `wamid` as `external_id`; else `403 {error:{code:"NO_OPT_IN"}}` |
| `POST /api/leads/:id/optout` | `{note?}` | `{data: OptIn}` |
| `GET /api/whatsapp/templates` | — | `{data: WhatsAppTemplate[]}` (synced from Meta) |

### Phase 5 — SaaS

| Method & path | Notes |
|---|---|
| `GET/POST /api/workspaces`, `GET/PATCH /api/workspaces/:id` | create/join workspaces, slug uniqueness |
| `POST /api/workspaces/:id/members` `{email, role}` · `PATCH/DELETE …/members/:userId` | invites via Supabase Auth admin (service role, server-only) |
| `GET /api/usage` | usage counters vs free-tier ceilings (AI reqs, WA conversations, storage) |
| `POST /api/billing/checkout` · `POST /api/billing/webhook` | **Stripe test mode only**; live keys are a launch-time decision, not now |

### Cron endpoints (pg_cron → pg_net → Vercel)

| Method & path | Behavior |
|---|---|
| `POST /api/cron/overdue-scan` | Bearer `CRON_SECRET`; marks/collects overdue tasks & follow-ups, refreshes counters |
| `POST /api/cron/daily-digest` | Bearer `CRON_SECRET`; builds "today's follow-ups" digest data (in-app notification row for MVP; email later) |

---

## 6. Phase-by-phase implementation plan (maps 1:1 to Section 16 as reproduced in companion §3.4)

### Phase 1 — Prototype — **$0**
*Deliverables (Section 16): screens, lead database, manual tasks, dashboard, sample data.*
1. Repo scaffold: Next.js + TS + Tailwind, Vercel Hobby deploy target, `.env.example`.
2. Supabase project (Free): run migrations 0001–0005 (extensions, core tables, RLS, seed, views).
3. Auth: email/password signup/login + `profiles` trigger + route-guard middleware.
4. Screens: dashboard (KPI cards from `v_dashboard_metrics`, today's follow-ups, overdue tasks, pipeline bars), leads table + filters + detail drawer, lead create/edit, tasks list with complete/snooze, settings shell.
5. CSV import: drag-drop → Papaparse → column mapping → client validation preview → batched commit.
6. Sample data seed (migration 0004) + pg_cron setup (0009) pointed at the deployed URL.
**Exit criteria:** login → import a CSV → see leads/tasks/dashboard live on Vercel; RLS verified with a second test account; zero external paid calls anywhere.

### Phase 2 — AI assistant — **$0 (Gemini free tier)**
*Deliverables: NL command parser, JSON validation, task preview, approval.*
1. `lib/gemini.ts`: Flash call, `responseMimeType: application/json` + response schema, retry/backoff on 429, latency+token metering into `ai_commands`.
2. Command parser prompt + zod validation of structured output; multi-intent support (create task + update lead + set follow-up).
3. `/assistant` UI: command box → parsed preview cards → **explicit Approve/Reject** → apply endpoint (transactional).
4. Command history/audit view; client throttle (≤1 req/4 s) and daily usage meter against ~1,000–1,500 req/day ceiling.
**Exit criteria:** "follow up with X tomorrow 5pm" produces a valid preview, applies only after approval, invalid input yields readable errors; no Gemini call ever auto-writes to the DB.

### Phase 3 — Messaging drafts — **$0**
*Deliverables: AI message drafts, templates, conversation timeline.*
1. Templates CRUD with `{{variable}}` substitution; 4–5 starter templates.
2. `/api/ai/draft` with tone options; compliance detectors flag price/discount/warranty/delivery/legal/payment → `requires_human_approval`.
3. Conversations + timeline UI (inbound/outbound bubbles, statuses); draft composer with AI assist + approve/reject banner.
4. DB trigger enforcing "no `sent` without approval when flagged".
**Exit criteria:** draft generated for a lead, flagged drafts blocked from send without approval, timeline persists; all on free tier.

### Phase 4 — WhatsApp integration — **$0 in dev/sandbox** (billed only past 1,000 conversations/mo after go-live)
*Deliverables: official API, opt-in, webhooks, delivery status, approved templates.*
1. Meta app + sandbox test number; store `waba_id`, `phone_number_id` in `whatsapp_settings` (system user token, not the 60-min temporary one).
2. Webhook: GET handshake + POST events on Vercel URL (no ngrok needed); idempotent processing; status updates `sent→delivered→read`; failures surfaced on the message.
3. Opt-in enforcement: no outbound to a lead without `opted_in`; `STOP` keyword → `opted_out`; opt-in audit rows.
4. Template messages (sandbox pre-approved); real send path behind approval gate from Phase 3.
5. Whitelist up to 5 test recipient numbers (sandbox constraint) for end-to-end testing.
**Exit criteria:** send an approved template to a whitelisted test number, see delivered/read ticks update in the timeline; STOP → opt-out blocks further sends. Real business-number verification & template approval deliberately deferred to go-live.

### Phase 5 — SaaS foundation — **$0 (Stripe test mode)**
*Deliverables: workspaces, team roles, usage limits, billing, onboarding.*
1. Migration 0010: workspaces/members/usage; backfill personal workspaces; RLS switch to membership-based.
2. Roles (`owner/admin/member/viewer`) enforced in RLS + API; invite flow.
3. Usage counters (AI requests, WA conversations, storage) with soft-limit warnings before free-tier ceilings (companion §19 triggers).
4. Stripe **test-mode** checkout + webhook; onboarding wizard (workspace → import CSV → first follow-up).
**Exit criteria:** two users share a workspace with correct role permissions; usage page shows counters; test checkout completes end-to-end.

### Phase 6 — Pilot — **$0 unless WhatsApp volume exceeds the free tier**
*Deliverables: own historical leads + 2–5 external businesses; measure missed follow-ups and response rate.*
1. Import real historical leads; 2–5 pilot businesses onboarded on free plan.
2. Measurement views: follow-up completion rate, missed follow-ups (before/after), reply/response rate, time-to-first-response; weekly digest.
3. Watch-list per companion §19: Supabase 500 MB / Vercel bandwidth / Gemini RPM / 1,000 WA conversations — surfaced in `/usage`, decision triggers documented, no surprise bills.
**Exit criteria:** 4+ weeks of pilot data with measurable missed-follow-up reduction; upgrade-trigger dashboard reviewed before any spend decision.

---

## 7. Free-tier guardrails baked into the design

| Guardrail | Mechanism |
|---|---|
| Gemini ~5–15 RPM, ~1,000–1,500 req/day (2026 free tier = Flash/Flash-Lite only) | Client throttle, server 429 backoff, daily counter in `usage_counters`, model name env-configurable (`GEMINI_MODEL`) |
| Vercel 10 s function timeout | CSV import batched ≤100 rows; webhook fast-acks then processes; Gemini calls kept small (compact prompts, JSON mode) |
| Vercel Hobby cron = 1 run/day | All scheduling via **pg_cron** (30-min scans allowed); Vercel Cron unused |
| Supabase 500 MB DB | `whatsapp_events` pruned weekly to 90 days; indexes tuned; no media blobs in DB (Supabase Storage 1 GB for images) |
| Supabase pauses after 7 days idle | Fine for dev; documented as a launch-time Pro trigger (companion §19) |
| WhatsApp sandbox: 60-min temporary tokens, 90-day test number, 5 whitelisted recipients | Use system user token; test plan uses whitelisted numbers only; go-live checklist for real number |
| No paid AI keys | Gemini free tier only; **no GPT-4/Claude key anywhere**; Groq free tier documented as fallback in `lib/gemini.ts` provider switch |

## 8. What I'll need from you at Phase 1 kickoff (all free signups)

1. Supabase Free project → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only)
2. Google AI Studio API key (free) → `GEMINI_API_KEY` (only needed at Phase 2)
3. Vercel Hobby account for deploy (I can develop fully locally first and give you the deploy command)
4. Phase 4: Meta developer app + test number credentials → `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
5. A `CRON_SECRET` string you generate (any random value)

---

---

## 9. Phase 1 — as built (2026-09-27)

Phase 1 approved and implemented with two scope adjustments requested by the owner:

| Adjustment | Detail |
|---|---|
| **Workspaces pulled forward** from Phase 5 into Phase 1 | `workspaces` + `workspace_members` ship now; leads are workspace-scoped from day one, so the Phase 5 migration is only usage/billing columns — no painful backfill. RLS is membership-based (`is_workspace_member`) from the start. |
| **Tasks are mock data** | `/tasks` page ships the UX on sample data; the real `tasks` table/CRUD arrive with Phase 1.5/2. Dashboard task cards are labeled "mock". |
| **No service-role key in Phase 1** | Only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; RLS does all authorization. |

Shipped: migrations 0001–0004 · Supabase Auth (email/password) · onboarding workspace creation (`create_workspace` RPC) · lead CRUD (zod-validated route handlers, `{data}`/`{error}` envelope) · dashboard (KPIs, pipeline, needs-follow-up, recent — from `v_dashboard_metrics` + `v_followups_due` views) · demo seeder RPC · middleware session guard.

Verified: `next build` green (15 routes + middleware, typecheck clean) · all 4 migrations executed on Postgres 17 with a Supabase shim · RLS isolation, triggers, RPCs, unique-phone guard, and view security proven by `scripts/verify/100_rls_test.sql` (User B sees 0 rows of User A; cross-workspace insert blocked with 42501).

## 10. Phase 2 — as built (2026-09-27)

AI command box shipped on the **Gemini API free tier** (Flash; plain REST via
`fetch` — no SDK added). Note: the original requirements pack (with the
Section 8 JSON contract) was never uploaded; the contract implemented is the
one documented in §5 above, isolated in `src/lib/ai/schema.ts` (+ prompt in
`src/lib/ai/prompts.ts`) so reconciling with Section 8 is a one-file diff.

Enforcement chain (owner requirement: *never let the AI execute directly*):

1. `POST /api/ai/command` → Gemini structured-JSON output → **zod parse +
   business validation** (`businessValidate`) → stored **inert** in
   `ai_commands` (audit row) → preview returned with server-side lead
   resolution (exact → prefix → ambiguous/not-found).
2. `POST /api/ai/command/:id/apply` (separate authenticated request) →
   **re-fetches and re-validates** the stored JSON, re-resolves every lead,
   refuses on any unresolved/blocked intent, then executes all-or-nothing
   through RLS-scoped writes and marks the row `applied` with per-intent
   results.
3. `GEMINI_API_KEY` server-only (never `NEXT_PUBLIC_`); free-tier guards:
   6 cmds/min + 150/day per workspace (DB-counted), 4 s client cooldown,
   one 429 retry with backoff, 8.5 s abort (Vercel 10 s timeout).

Also shipped in this slice: real `tasks` table + API + board (migrations
0005–0006; mock task data retired) since create_task is the assistant's
primary intent.

Fixed en route: Phase 1 PATCH schemas used zod `.transform()` on optional
keys, which materialized absent keys as `null` and would have wiped
untouched columns on partial updates (e.g. inline status change). Update
schemas now pass keys through untouched; `""` explicitly clears a field via
`normalizePatch()`. Covered by `scripts/verify/validate-contract.ts`
(14 checks, all passing) alongside the DB suites.

## 11. Phase 4 — as built (2026-09-27, sandbox only)

WhatsApp integration shipped **against the Meta sandbox test number only**
(owner directive: no real Business-verified number). Phase 3 (drafts/
templates) was skipped by owner decision, so this is the lean slice:
opt-in/opt-out storage, webhook handling, guarded text send, panel UI.

Safety model (three independent gates, all proven by tests):

1. **Fail-closed allowlist** — `WHATSAPP_ALLOWED_RECIPIENTS`; empty list ⇒
   sending disabled entirely, so even pasted production credentials cannot
   reach a real number (`isRecipientAllowed`, unit-tested).
2. **Consent gate** — sends require an `opted_in` row in `whatsapp_optins`;
   inbound STOP → opted_out (blocks sends), START → re-opt-in; a normal
   message from an opted-out number never re-enables sending.
3. **Credentials server-side only** — env vars; the panel endpoint returns
   booleans/counts, never secrets.

Webhook: GET handshake echoes `hub.challenge` (verified live: correct
token → 200 challenge, wrong token → 403); POST acks 200 immediately and
processes via Next `after()` with the service-role client (the one new
server-only secret: `SUPABASE_SERVICE_ROLE_KEY`). Idempotency via
`(wa_message_id, event_type)` unique index — duplicate deliveries are
skipped (proven in SQL suite). Status callbacks walk
`sent → delivered → read | failed` on `whatsapp_messages`.

Simplification documented for production: consent is **global per phone**
(sandbox = one test number); multi-tenant production would scope it per
workspace. Real business-number verification + template approval remain
deliberately deferred to go-live, per companion §3.3.

## 12. Phase 5 — as built (2026-09-28: team roles, usage limits, Stripe test)

**Roles enforced in Postgres, not the UI.** Migration `0008` adds
`workspace_role()`, `can_write_workspace()` (owner/admin/member) and
`is_workspace_admin()` security-definer helpers; every INSERT/UPDATE/DELETE
policy on `leads`, `tasks`, `ai_commands`, `whatsapp_optins`,
`whatsapp_messages` was re-issued to require `can_write_workspace`, so a
`viewer` gets a hard `42501` from the database even if the UI regresses
(proven in `scripts/verify/400_phase5_test.sql`). Member CRUD on
`workspace_members` + `workspace_invites` requires `is_workspace_admin`.
Last-owner protection is an API guard (`LAST_OWNER` 409) — the DB check
needs a count that RLS policies can't express portably.

**Invites.** `workspace_invites(workspace_id, email unique-per-workspace,
role, accepted_at)`; owner/admin invites via
`POST /api/workspaces/:id/members` (best-effort Supabase Auth
`inviteUserByEmail` — free SMTP; the invite row stands even if mail fails).
Acceptance: signed-in user hits `/settings`, client POSTs
`/api/invites/accept`, service role matches pending invites on the
account's email and inserts membership (the accepter isn't a member yet,
so RLS would block a direct insert).

**Usage limits.** `usage_counters(workspace_id, period_month)` PK'd per
month; the only writer is `bump_usage()` (security definer, membership-
checked, counter whitelist). Free ceilings `{ai_requests: 500,
whatsapp_sends: 1000}` checked before the Gemini call / Cloud API send,
over-limit → `429 USAGE_LIMIT`; counters bump only on success. Limits
deliberately sit below the platform free tiers (Gemini ~1,000–1,500/day,
Meta 1,000 conversations/mo) so the workspace can never push the project
into a paid band.

**Stripe — test mode by construction.** `src/lib/billing.ts` refuses any
key not starting `sk_test_`. Checkout = subscription-mode
`checkout.sessions.create` with `workspace_id` metadata; webhook
(`billing/webhook`, raw `req.text()` + `constructEvent`) flips
`plan/billing_status` (`active_test`/`canceled_test`) via service role.
Only ids + status are stored; the `stripe` SDK (MIT, free) was added after
announcing it — the raw-fetch alternative was rejected because
hand-rolling Stripe's webhook HMAC verification is not worth the risk.

**Workspace scoping audit (rule #1).** All ~50 query sites carry an
explicit `workspace_id` filter or sit behind RLS that supplies it.
Declared exceptions: (a) webhook inbound lead lookup by phone — workspace
is unknown until the lead is found; service-role, select-limited,
documented; (b) `whatsapp_optins` writes from the webhook are
global-per-phone (Phase-4 simplification, same production note as §11);
(c) `profiles`/`workspaces` list queries are keyed by `auth.uid()` /
membership RLS by design. Fixed during the audit: `whatsapp/send`'s
opt-in lookup now filters `workspace_id eq lead's OR is null` instead of
phone alone.

**User-runnable verification.** `scripts/smoke-phase5.mjs` (node +
supabase-js already in deps; stubs `globalThis.WebSocket` for Node 20) —
auth → create_workspace → lead insert → bump_usage 1→2 → bogus-counter
reject → optional two-account viewer read-only proof → membership
removal blackout. Usage: `node scripts/smoke-phase5.mjs --email you@x.com
--password secret123 [--email2 … --password2 …] [--base http://localhost:3000]`.

*If the original requirements pack turns up, §4/§5 (and the AI contract vs
Section 8) get reconciled before Phase 3 starts.*
