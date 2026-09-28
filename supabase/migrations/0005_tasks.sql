-- ============================================================
-- FollowUp AI CRM — Phase 2, migration 5
-- Real tasks engine (replaces Phase 1 mock task data)
-- ============================================================

do $$ begin
  create type public.task_status as enum
    ('pending','snoozed','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum
    ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  created_by    uuid not null references public.profiles(id),
  title         text not null,
  description   text,
  due_at        timestamptz,
  status        public.task_status not null default 'pending',
  priority      public.task_priority not null default 'medium',
  snoozed_until timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tasks_ws_status_due_idx
  on public.tasks(workspace_id, status, due_at);
create index if not exists tasks_lead_idx
  on public.tasks(lead_id) where lead_id is not null;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (public.is_workspace_member(workspace_id));
