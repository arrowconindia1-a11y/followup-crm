-- Phase 2 local verification: tasks table + ai_commands audit log,
-- both under workspace-membership RLS.

\echo '== User A: create a task (expect INSERT 0 1):'
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select id as ws_a from public.workspaces where slug = 'a-business' \gset
insert into public.tasks (workspace_id, created_by, title, due_at, priority)
values (:'ws_a', '11111111-1111-1111-1111-111111111111', 'Send quote', now() + interval '1 day', 'high');

\echo '== User A: log an AI command (expect INSERT 0 1):'
insert into public.ai_commands (workspace_id, user_id, raw_text, model, parsed, valid)
values (:'ws_a', '11111111-1111-1111-1111-111111111111', 'follow up tomorrow', 'gemini-2.0-flash', '{"understood":true}'::jsonb, true);

\echo '== User A: sees 1 task + 1 command (expect 1 and 1):'
select count(*) as a_tasks from public.tasks;
select count(*) as a_commands from public.ai_commands;

\echo '== User A: complete a task, completed_at set by app layer here we test status only:'
update public.tasks set status = 'completed', completed_at = now() where title = 'Send quote';
select status, completed_at is not null as has_completed_at from public.tasks where title = 'Send quote';

\echo '== User B: sees 0 tasks + 0 commands (expect 0 and 0):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as b_tasks from public.tasks;
select count(*) as b_commands from public.ai_commands;

\echo '== User B: insert task into A workspace must FAIL with 42501:'
insert into public.tasks (workspace_id, created_by, title)
values (:'ws_a', '22222222-2222-2222-2222-222222222222', 'Sneaky task');

\echo '== User B: mark A command as applied must update 0 rows:'
update public.ai_commands set applied = true where raw_text = 'follow up tomorrow';

\echo '== back to A: command still not applied (expect false):'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select applied from public.ai_commands where raw_text = 'follow up tomorrow';

reset role;
\echo '== phase 2 verification finished'
