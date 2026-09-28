-- ============================================================
-- CROSS-WORKSPACE SECURITY TEST — paste into YOUR Supabase SQL Editor
-- Requires: migrations 0001–0008 already run.
-- Creates two throwaway accounts + two workspaces, attacks one from
-- the other, verifies nothing leaks, then cleans everything up.
-- Every check states its expected result; anything different = a hole.
-- ============================================================

-- ── Pre-clean: makes this script safely re-runnable ──
delete from public.workspaces where slug in ('sectest-a-business', 'sectest-b-business');
delete from public.profiles
where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
delete from auth.users
where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');

-- ── Setup: two throwaway accounts ──
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sectest-a@yourdomain.dev', '{"full_name":"SecTest A"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'sectest-b@yourdomain.dev', '{"full_name":"SecTest B"}'::jsonb);

\echo '== SETUP: each account creates its OWN workspace =='
set role authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.create_workspace('SecTest A Business', 'sectest-a-business') as ws_a \gset

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select public.create_workspace('SecTest B Business', 'sectest-b-business') as ws_b \gset

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.leads (workspace_id, name, phone, status) values
  (:'ws_a', 'SecA Lead 1', '+919777000001', 'new'),
  (:'ws_a', 'SecA Lead 2', '+919777000002', 'contacted');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
insert into public.leads (workspace_id, name, phone, status) values
  (:'ws_b', 'SecB Lead 1', '+919777000011', 'new'),
  (:'ws_b', 'SecB Lead 2', '+919777000012', 'won');

select id as b_lead from public.leads where name = 'SecB Lead 1' \gset

-- ── Attacks by A against B ──
\echo ''
\echo '== ATTACKS BY A against B''s data =='
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

\echo '== A1. A lists leads (expect 2 — A''s own only):'
select count(*) as a_sees_total from public.leads;

\echo '== A2. A fetches B''s lead by id (expect 0):'
select count(*) as a_fetches_b_lead from public.leads where id = :'b_lead';

\echo '== A3. A edits B''s lead (expect UPDATE 0):'
update public.leads set name = 'HACKED BY A', status = 'won' where id = :'b_lead';

\echo '== A4. A deletes B''s lead (expect DELETE 0):'
delete from public.leads where id = :'b_lead';

\echo '== A5. A plants a lead in B''s workspace (expect ERROR 42501):'
insert into public.leads (workspace_id, name, phone) values (:'ws_b', 'Planted by A', '+919777000099');

\echo '== A6. A self-invites into B''s workspace (expect ERROR 42501):'
insert into public.workspace_members (workspace_id, user_id, role)
values (:'ws_b', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner');

-- ── Mirror: B against A ──
\echo ''
\echo '== MIRROR: B against A''s data =='
select id as a_lead from public.leads where name = 'SecA Lead 1' \gset
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);

\echo '== B1. B lists leads (expect 2 — B''s own only):'
select count(*) as b_sees_total from public.leads;

\echo '== B2. B edits A''s lead (expect UPDATE 0):'
update public.leads set name = 'HACKED BY B' where id = :'a_lead';

\echo '== B3. B plants a lead in A''s workspace (expect ERROR 42501):'
insert into public.leads (workspace_id, name, phone) values (:'ws_a', 'Planted by B', '+919777000098');

-- ── Integrity ──
\echo ''
\echo '== INTEGRITY: nothing tampered (expect 0):'
select count(*) as tampered_rows from public.leads
where name like '%HACKED%' or name like '%Planted%';

reset role;

-- ── Cleanup: remove every trace of the test ──
delete from public.workspaces
where slug in ('sectest-a-business', 'sectest-b-business');
-- ^ cascades: leads, members, invites, usage_counters
delete from public.profiles
where id in ('aaaaaaaa-0000-0000-0000-000000000001',
             'bbbbbbbb-0000-0000-0000-000000000002');
delete from auth.users
where id in ('aaaaaaaa-0000-0000-0000-000000000001',
             'bbbbbbbb-0000-0000-0000-000000000002');

\echo '== leftover test rows (expect 0):'
select
  (select count(*) from auth.users  where id::text like 'aaaaaaaa%' or id::text like 'bbbbbbbb%')
+ (select count(*) from public.workspaces where slug like 'sectest-%') as leftover;

\echo '== CROSS-WORKSPACE SECURITY TEST FINISHED =='
