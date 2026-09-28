-- ============================================================
-- FollowUp AI CRM — Phase 1, migration 4 of 4 (optional)
-- Demo data seeder — powers the "Load sample leads" button in
-- the app. Runs as the signed-in user (security invoker), so
-- RLS still applies; refuses to double-seed.
-- ============================================================

create or replace function public.seed_demo_data(p_workspace_id uuid)
returns int
language plpgsql security invoker set search_path = public
as $$
declare
  n int := 0;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of workspace';
  end if;

  if exists (select 1 from public.leads where workspace_id = p_workspace_id) then
    raise exception 'workspace already has leads — clear them first';
  end if;

  insert into public.leads
    (workspace_id, name, phone, email, company, source, status, notes,
     next_follow_up_at, created_at)
  values
    (p_workspace_id, 'Rahul Sharma',   '+919810000001', 'rahul@example.com',  'Sharma Interiors', 'referral',   'qualified',     'Interested in modular kitchen quote.',        now() - interval '2 days',  now() - interval '9 days'),
    (p_workspace_id, 'Priya Nair',     '+919810000002', 'priya@example.com',  'Nair & Co',        'instagram',  'contacted',     'Asked about pricing on Instagram DMs.',       now() + interval '4 hours', now() - interval '6 days'),
    (p_workspace_id, 'Amit Verma',     '+919810000003', 'amit@example.com',   'Verma Builders',   'website',    'proposal_sent', 'Proposal sent for full home interiors.',      now() + interval '1 day',   now() - interval '12 days'),
    (p_workspace_id, 'Sneha Kulkarni', '+919810000004', 'sneha@example.com',  null,               'csv_import', 'new',           'Imported from old spreadsheet.',              now() + interval '3 days',  now() - interval '2 days'),
    (p_workspace_id, 'Vikram Singh',   '+919810000005', 'vikram@example.com', 'Singh Estates',    'referral',   'won',           'Signed annual maintenance contract.',         null,                       now() - interval '20 days'),
    (p_workspace_id, 'Anita Desai',    '+919810000006', 'anita@example.com',  'Desai Clinic',     'website',    'contacted',     'Wants warranty terms in writing.',            now() + interval '2 days',  now() - interval '4 days'),
    (p_workspace_id, 'Farhan Ali',     '+919810000007', 'farhan@example.com', null,               'walk-in',    'lost',          'Went with a competitor on price.',            null,                       now() - interval '30 days'),
    (p_workspace_id, 'Meera Iyer',     '+919810000008', 'meera@example.com',  'Iyer Textiles',    'instagram',  'new',           'Replied to festive offer story.',             now() - interval '1 day',   now() - interval '1 day');

  get diagnostics n = row_count;
  return n;
end $$;
