-- Local-verification: exercises triggers, RPCs, RLS isolation, views,
-- the demo seeder and the unique-phone guard on vanilla Postgres.
-- Expected results are annotated with "== expect …" comments.

-- Roles (mimic Supabase's `authenticated` role; drop first so this
-- script is re-runnable on the same cluster)
drop role if exists authenticated;
create role authenticated nologin;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Two fake users — fires handle_new_user() trigger → profile rows
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev', '{"full_name":"User A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev', '{"full_name":"User B"}'::jsonb);

\echo '== profiles created by trigger (expect 2):'
select count(*) as profiles from public.profiles;

\echo '== User A: create_workspace via RPC (expect a uuid):'
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.create_workspace('A Business', 'a-business') as ws_a \gset

\echo '== User A: seed demo data into the empty workspace (expect 8):'
select public.seed_demo_data(:'ws_a') as seeded;

\echo '== User A: insert one more lead (expect INSERT 0 1):'
insert into public.leads (workspace_id, name, phone)
values (:'ws_a', 'A Lead', '+919800000000');

\echo '== User A: sees 9 leads (expect 9):'
select count(*) as a_sees_leads from public.leads;

\echo '== User B: sees 0 workspaces + 0 leads (expect 0 and 0):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as b_sees_workspaces from public.workspaces;
select count(*) as b_sees_leads from public.leads;

\echo '== User B: insert into A workspace must FAIL with 42501 RLS violation:'
insert into public.leads (workspace_id, name) values (:'ws_a', 'Sneaky');

\echo '== User B: seed_demo_data into A workspace must FAIL (not a member):'
select public.seed_demo_data(:'ws_a');

\echo '== back to User A: dashboard metrics (expect total 9, overdue 2, won 1):'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select total_leads, new_leads, followups_today, followups_overdue, won_this_month
from public.v_dashboard_metrics where workspace_id = :'ws_a';

\echo '== User A: follow-ups view rows (expect > 0):'
select count(*) as followup_rows from public.v_followups_due where workspace_id = :'ws_a';

\echo '== User A: duplicate phone must FAIL with 23505 unique violation:'
insert into public.leads (workspace_id, name, phone)
values (:'ws_a', 'Dup Lead', '+919810000001');

\echo '== User A: re-seed must FAIL (already has leads):'
select public.seed_demo_data(:'ws_a');

\echo '== User B: metrics view returns 0 rows for B (expect 0):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as b_metrics_rows from public.v_dashboard_metrics;

reset role;
\echo '== verification script finished'
