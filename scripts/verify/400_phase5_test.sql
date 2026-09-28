-- Phase 5 local verification: role enforcement, invites, usage counters.
-- Run AFTER 100/200/300 (they create users A and B, workspace 'a-business').

\echo '== Owner A adds B as VIEWER (expect INSERT 0 1):'
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select id as ws_a from public.workspaces where slug = 'a-business' \gset
insert into public.workspace_members (workspace_id, user_id, role)
values (:'ws_a', '22222222-2222-2222-2222-222222222222', 'viewer');

\echo '== B (viewer): can READ leads (expect 9):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as viewer_sees from public.leads;

\echo '== B (viewer): WRITE lead must FAIL 42501:'
insert into public.leads (workspace_id, name) values (:'ws_a', 'Viewer write');

\echo '== B (viewer): invite must FAIL 42501:'
insert into public.workspace_invites (workspace_id, email, role, invited_by)
values (:'ws_a', 'x@y.z', 'member', '22222222-2222-2222-2222-222222222222');

\echo '== B (viewer): self-promote must FAIL 42501:'
update public.workspace_members set role = 'owner'
where user_id = '22222222-2222-2222-2222-222222222222';

\echo '== Owner A promotes B to member (expect UPDATE 1):'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.workspace_members set role = 'member'
where workspace_id = :'ws_a' and user_id = '22222222-2222-2222-2222-222222222222';

\echo '== B (member): can write now (expect INSERT 0 1):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.leads (workspace_id, name) values (:'ws_a', 'Member write');

\echo '== B (member): still cannot invite (42501):'
insert into public.workspace_invites (workspace_id, email, role, invited_by)
values (:'ws_a', 'x@y.z', 'member', '22222222-2222-2222-2222-222222222222');

\echo '== Owner A: bump_usage x2 (expect 1 then 2):'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.bump_usage(:'ws_a', 'ai_requests') as first_bump;
select public.bump_usage(:'ws_a', 'ai_requests') as second_bump;

\echo '== Owner A: unknown counter must FAIL:'
select public.bump_usage(:'ws_a', 'bogus_counter');

\echo '== A reads usage (expect 2):'
select ai_requests from public.usage_counters where workspace_id = :'ws_a';

\echo '== B (still a member) reads usage (expect 1 row — members may see usage):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as b_usage_rows_as_member from public.usage_counters;

\echo '== Owner A removes B (expect DELETE 1):'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
delete from public.workspace_members
where workspace_id = :'ws_a' and user_id = '22222222-2222-2222-2222-222222222222';

\echo '== Removed B: sees 0 leads AND 0 usage rows (expect 0 and 0):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as b_sees_after_removal from public.leads;
select count(*) as b_usage_after_removal from public.usage_counters;

reset role;
\echo '== phase 5 verification finished'
