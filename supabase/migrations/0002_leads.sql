-- ============================================================
-- FollowUp AI CRM — Phase 1, migration 2 of 4
-- Leads table, indexes, triggers, RLS
-- ============================================================

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  name              text not null,
  phone             text,
  email             text,
  company           text,
  source            text,
  status            public.lead_status not null default 'new',
  notes             text,
  custom_fields     jsonb not null default '{}'::jsonb,
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One phone per workspace (partial: only when a phone exists)
create unique index if not exists leads_ws_phone_uniq
  on public.leads(workspace_id, phone)
  where phone is not null and phone <> '';

create index if not exists leads_ws_status_followup_idx
  on public.leads(workspace_id, status, next_follow_up_at);

create index if not exists leads_ws_created_idx
  on public.leads(workspace_id, created_at desc);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- RLS: everything scoped to workspace membership
alter table public.leads enable row level security;

drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads
  for delete using (public.is_workspace_member(workspace_id));
