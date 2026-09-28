-- ============================================================
-- FollowUp AI CRM — Phase 5, migration 8
-- Team roles enforcement, invitations, usage limits, billing columns.
-- Stripe stays in TEST mode: only ids/statuses stored here.
-- ============================================================

-- 1) Role helpers ------------------------------------------------
create or replace function public.workspace_role(p_workspace_id uuid)
returns public.member_role
language sql stable security definer set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = p_workspace_id and user_id = auth.uid();
$$;

-- writers = owner | admin | member (viewer is read-only)
create or replace function public.can_write_workspace(p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.workspace_role(p_workspace_id) in ('owner','admin','member'),
    false
  );
$$;

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.workspace_role(p_workspace_id) in ('owner','admin'),
    false
  );
$$;

-- 2) Tighten write policies: viewers become read-only -------------
drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads
  for insert with check (public.can_write_workspace(workspace_id));

drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads
  for update
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads
  for delete using (public.can_write_workspace(workspace_id));

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (public.can_write_workspace(workspace_id));

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (public.can_write_workspace(workspace_id));

drop policy if exists "ai_commands_insert" on public.ai_commands;
create policy "ai_commands_insert" on public.ai_commands
  for insert with check (public.can_write_workspace(workspace_id));

drop policy if exists "ai_commands_update" on public.ai_commands;
create policy "ai_commands_update" on public.ai_commands
  for update
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

drop policy if exists "optins_insert" on public.whatsapp_optins;
create policy "optins_insert" on public.whatsapp_optins
  for insert with check (public.can_write_workspace(workspace_id));

drop policy if exists "optins_update" on public.whatsapp_optins;
create policy "optins_update" on public.whatsapp_optins
  for update
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

drop policy if exists "wa_messages_insert" on public.whatsapp_messages;
create policy "wa_messages_insert" on public.whatsapp_messages
  for insert with check (public.can_write_workspace(workspace_id));

-- 3) Member management: owner/admin only --------------------------
drop policy if exists "members_insert_admin" on public.workspace_members;
create policy "members_insert_admin" on public.workspace_members
  for insert with check (public.is_workspace_admin(workspace_id));

drop policy if exists "members_update_admin" on public.workspace_members;
create policy "members_update_admin" on public.workspace_members
  for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "members_delete_admin" on public.workspace_members;
create policy "members_delete_admin" on public.workspace_members
  for delete using (public.is_workspace_admin(workspace_id));

-- 4) Invitations --------------------------------------------------
create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,               -- stored lowercase
  role         public.member_role not null default 'member',
  invited_by   uuid references public.profiles(id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (workspace_id, email)
);
create index if not exists workspace_invites_email_idx
  on public.workspace_invites(lower(email));

alter table public.workspace_invites enable row level security;

drop policy if exists "invites_select_member" on public.workspace_invites;
create policy "invites_select_member" on public.workspace_invites
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "invites_write_admin" on public.workspace_invites;
create policy "invites_write_admin" on public.workspace_invites
  for insert with check (public.is_workspace_admin(workspace_id));

drop policy if exists "invites_update_admin" on public.workspace_invites;
create policy "invites_update_admin" on public.workspace_invites
  for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "invites_delete_admin" on public.workspace_invites;
create policy "invites_delete_admin" on public.workspace_invites
  for delete using (public.is_workspace_admin(workspace_id));

-- 5) Billing columns (Stripe TEST-mode ids only) ------------------
alter table public.workspaces
  add column if not exists plan text not null default 'free',
  add column if not exists billing_status text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- 6) Usage counters ------------------------------------------------
create table if not exists public.usage_counters (
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  period_month   date not null,             -- first of month (UTC)
  ai_requests    int not null default 0,
  whatsapp_sends int not null default 0,
  primary key (workspace_id, period_month)
);

alter table public.usage_counters enable row level security;

drop policy if exists "usage_select" on public.usage_counters;
create policy "usage_select" on public.usage_counters
  for select using (public.is_workspace_member(workspace_id));
-- writes go through bump_usage() (security definer) only.

create or replace function public.bump_usage(
  p_workspace_id uuid,
  p_counter text,
  p_amount int default 1
)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  new_val int;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of workspace';
  end if;
  if p_counter not in ('ai_requests','whatsapp_sends') then
    raise exception 'unknown counter: %', p_counter;
  end if;
  if p_amount < 1 or p_amount > 1000 then
    raise exception 'invalid amount';
  end if;

  insert into public.usage_counters (workspace_id, period_month, ai_requests, whatsapp_sends)
  values (
    p_workspace_id,
    date_trunc('month', now())::date,
    case when p_counter = 'ai_requests'  then p_amount else 0 end,
    case when p_counter = 'whatsapp_sends' then p_amount else 0 end
  )
  on conflict (workspace_id, period_month) do update set
    ai_requests    = public.usage_counters.ai_requests
                     + case when p_counter = 'ai_requests'    then p_amount else 0 end,
    whatsapp_sends = public.usage_counters.whatsapp_sends
                     + case when p_counter = 'whatsapp_sends' then p_amount else 0 end
  returning (case when p_counter = 'ai_requests' then ai_requests else whatsapp_sends end)
    into new_val;

  return new_val;
end $$;
