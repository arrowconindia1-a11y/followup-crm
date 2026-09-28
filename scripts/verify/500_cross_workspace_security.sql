-- ============================================================
-- CROSS-WORKSPACE SECURITY TEST (final audit)
-- Two accounts, each with their OWN workspace. Proves Account A
-- cannot SEE, EDIT, DELETE, or PLANT data in Account B's
-- workspace — and vice versa. Enforcement is in Postgres RLS.
--
-- Every line below states its expected result. A result that
-- differs means a security hole.
-- ============================================================

-- Test scaffolding (mimics Supabase's `authenticated` role)
drop role if exists authenticated;
create role authenticated nologin;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Two accounts (the signup trigger creates their profiles)
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'account-a@test.dev', '{"full_name":"Account A"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'account-b@test.dev', '{"full_name":"Account B"}'::jsonb)
on conflict do nothing;

\echo ''
\echo '== SETUP: each account creates its OWN workspace =='
set role authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.create_workspace('Acme Sales', 'acme-sales') as ws_a \gset

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select public.create_workspace('Beta Traders', 'beta-traders') as ws_b \gset

-- Each account seeds 3 leads in its own workspace
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.leads (workspace_id, name, phone, status) values
  (:'ws_a', 'Acme Lead 1', '+919000000001', 'new'),
  (:'ws_a', 'Acme Lead 2', '+919000000002', 'contacted'),
  (:'ws_a', 'Acme Lead 3', '+919000000003', 'qualified');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
insert into public.leads (workspace_id, name, phone, status) values
  (:'ws_b', 'Beta Lead 1', '+919000000011', 'new'),
  (:'ws_b', 'Beta Lead 2', '+919000000012', 'contacted'),
  (:'ws_b', 'Beta Lead 3', '+919000000013', 'won');

select id as b_lead from public.leads where name = 'Beta Lead 1' \gset

-- ════════════════════════════════════════════════════════════
\echo ''
\echo '== ATTACKS BY ACCOUNT A against B''s data =='
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

\echo '== A1. A lists all leads (expect 3 — only Acme, never Beta):'
select count(*) as a_sees_total from public.leads;

\echo '== A2. A fetches one of B''s leads by id (expect 0 rows):'
select count(*) as a_fetches_b_lead from public.leads where id = :'b_lead';

\echo '== A3. A tries to EDIT B''s lead (expect UPDATE 0 — row invisible):'
update public.leads set name = 'HACKED BY A', status = 'won' where id = :'b_lead';

\echo '== A4. A tries to DELETE B''s lead (expect DELETE 0):'
delete from public.leads where id = :'b_lead';

\echo '== A5. A tries to PLANT a lead in B''s workspace (expect ERROR 42501):'
insert into public.leads (workspace_id, name, phone) values (:'ws_b', 'Planted by A', '+919000000099');

\echo '== A6. A tries to RENAME B''s workspace (expect UPDATE 0):'
update public.workspaces set name = 'Hacked' where id = :'ws_b';

\echo '== A7. A tries to SELF-INVITE into B''s workspace (expect ERROR 42501):'
insert into public.workspace_members (workspace_id, user_id, role)
values (:'ws_b', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner');

-- ════════════════════════════════════════════════════════════
\echo ''
\echo '== MIRROR: attacks by ACCOUNT B against A''s data =='
-- Grab one of A's lead ids while still acting as A (B could never
-- look it up — that invisibility is itself proven in B1 below).
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select id as a_lead from public.leads where name = 'Acme Lead 1' \gset

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);

\echo '== B1. B lists all leads (expect 3 — only Beta, never Acme):'
select count(*) as b_sees_total from public.leads;

\echo '== B2. B tries to EDIT A''s lead (expect UPDATE 0):'
update public.leads set name = 'HACKED BY B' where id = :'a_lead';

\echo '== B3. B tries to DELETE A''s lead (expect DELETE 0):'
delete from public.leads where id = :'a_lead';

\echo '== B4. B tries to PLANT a lead in A''s workspace (expect ERROR 42501):'
insert into public.leads (workspace_id, name, phone) values (:'ws_a', 'Planted by B', '+919000000098');

-- ════════════════════════════════════════════════════════════
\echo ''
\echo '== INTEGRITY AFTER ATTACKS =='
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
\echo '== B''s leads untouched (expect 3 rows, names intact, no HACKED):'
select count(*) as b_leads_after from public.leads;
select count(*) as b_tampered from public.leads where name like '%HACKED%' or name like '%Planted%';

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
\echo '== A''s leads untouched (expect 3 rows, none tampered):'
select count(*) as a_leads_after from public.leads;
select count(*) as a_tampered from public.leads where name like '%HACKED%' or name like '%Planted%';

\echo '== B''s workspace name untouched (expect "Beta Traders"):'
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select name as ws_b_name from public.workspaces where id = :'ws_b';

\echo '== A has NO membership in B''s workspace (expect 0):'
select count(*) as a_membership_in_b from public.workspace_members
where workspace_id = :'ws_b' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

reset role;
\echo ''
\echo '== CROSS-WORKSPACE SECURITY TEST FINISHED =='
