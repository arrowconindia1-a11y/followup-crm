-- ============================================================
-- FollowUp AI CRM — Phase 2, migration 6
-- AI command audit log. Rows are INERT: the parsed JSON is never
-- executed directly — it must pass server-side validation and an
-- explicit user apply step (which re-validates) before any write.
-- ============================================================

create table if not exists public.ai_commands (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid not null references public.profiles(id),
  raw_text          text not null,
  model             text not null,
  parsed            jsonb,
  valid             boolean not null default false,
  validation_errors jsonb not null default '[]'::jsonb,
  applied           boolean not null default false,
  applied_at        timestamptz,
  applied_results   jsonb,
  latency_ms        int,
  tokens_used       jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists ai_commands_ws_created_idx
  on public.ai_commands(workspace_id, created_at desc);

alter table public.ai_commands enable row level security;

drop policy if exists "ai_commands_select" on public.ai_commands;
create policy "ai_commands_select" on public.ai_commands
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "ai_commands_insert" on public.ai_commands;
create policy "ai_commands_insert" on public.ai_commands
  for insert with check (public.is_workspace_member(workspace_id));

-- update needed to mark applied; workspace-scoped like everything else
drop policy if exists "ai_commands_update" on public.ai_commands;
create policy "ai_commands_update" on public.ai_commands
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
