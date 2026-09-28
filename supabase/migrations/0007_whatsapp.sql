-- ============================================================
-- FollowUp AI CRM — Phase 4, migration 7
-- WhatsApp (Meta Cloud API, SANDBOX test number only):
-- opt-in/opt-out storage, message log, webhook event audit.
--
-- Design notes:
--  * optins.phone / webhook phones are stored NORMALIZED (digits
--    only, no "+"), e.g. 919810012345.
--  * optins.phone is globally unique: the sandbox has ONE test
--    number, so one consent state per phone is correct here.
--    (Multi-tenant production would revisit this — documented.)
--  * whatsapp_events is written by the webhook via the service
--    role (no user session exists), hence no insert policy.
-- ============================================================

do $$ begin
  create type public.optin_status as enum
    ('unknown','opted_in','opted_out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_direction as enum
    ('inbound','outbound');
exception when duplicate_object then null; end $$;

-- 1) Opt-in / opt-out consent store ------------------------------
create table if not exists public.whatsapp_optins (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  lead_id      uuid references public.leads(id) on delete set null,
  phone        text not null,               -- normalized digits
  status       public.optin_status not null default 'unknown',
  method       text,                        -- manual | keyword | inbound_message
  note         text,
  recorded_at  timestamptz not null default now(),
  unique (phone)
);
create index if not exists whatsapp_optins_ws_idx
  on public.whatsapp_optins(workspace_id);
create index if not exists whatsapp_optins_lead_idx
  on public.whatsapp_optins(lead_id);

alter table public.whatsapp_optins enable row level security;

drop policy if exists "optins_select" on public.whatsapp_optins;
create policy "optins_select" on public.whatsapp_optins
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "optins_insert" on public.whatsapp_optins;
create policy "optins_insert" on public.whatsapp_optins
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "optins_update" on public.whatsapp_optins;
create policy "optins_update" on public.whatsapp_optins
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- 2) Message log (inbound + outbound, with delivery lifecycle) ---
create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  direction     public.message_direction not null,
  body          text not null,
  status        text not null default 'pending',
    -- outbound: pending → sent → delivered → read | failed
    -- inbound:  received
  wa_message_id text,
  error         text,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists whatsapp_messages_wamid_uniq
  on public.whatsapp_messages(wa_message_id)
  where wa_message_id is not null;
create index if not exists whatsapp_messages_ws_created_idx
  on public.whatsapp_messages(workspace_id, created_at desc);
create index if not exists whatsapp_messages_lead_idx
  on public.whatsapp_messages(lead_id);

alter table public.whatsapp_messages enable row level security;

drop policy if exists "wa_messages_select" on public.whatsapp_messages;
create policy "wa_messages_select" on public.whatsapp_messages
  for select using (public.is_workspace_member(workspace_id));

-- outbound inserts happen through the signed-in user (send route);
-- inbound inserts + status updates happen via the webhook (service role).
drop policy if exists "wa_messages_insert" on public.whatsapp_messages;
create policy "wa_messages_insert" on public.whatsapp_messages
  for insert with check (public.is_workspace_member(workspace_id));

-- 3) Webhook event audit (idempotency + debugging) ----------------
create table if not exists public.whatsapp_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  wa_message_id text,
  phone         text,
  event_type    text not null,   -- received | status:sent | status:delivered | status:read | status:failed
  payload       jsonb not null default '{}'::jsonb,
  received_at   timestamptz not null default now()
);
-- dedupe key: the webhook skips events it has already stored
create unique index if not exists whatsapp_events_dedup
  on public.whatsapp_events(wa_message_id, event_type)
  where wa_message_id is not null;
create index if not exists whatsapp_events_ws_idx
  on public.whatsapp_events(workspace_id, received_at desc);

alter table public.whatsapp_events enable row level security;

drop policy if exists "wa_events_select" on public.whatsapp_events;
create policy "wa_events_select" on public.whatsapp_events
  for select using (public.is_workspace_member(workspace_id));
-- intentionally NO insert/update/delete policies: writes come from
-- the service role inside the webhook handler only.
