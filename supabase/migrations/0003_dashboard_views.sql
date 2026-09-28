-- ============================================================
-- FollowUp AI CRM — Phase 1, migration 3 of 4
-- Dashboard metrics view (SQL views instead of a BI tool)
-- security_invoker = RLS is applied to whoever queries the view
-- (requires Postgres 15+, which Supabase Free runs).
-- ============================================================

create or replace view public.v_dashboard_metrics
with (security_invoker = true)
as
select
  l.workspace_id,
  count(*)::int                                                                as total_leads,
  count(*) filter (where l.status = 'new')::int                                as new_leads,
  count(*) filter (where l.status = 'contacted')::int                          as contacted,
  count(*) filter (where l.status = 'qualified')::int                          as qualified,
  count(*) filter (where l.status = 'proposal_sent')::int                      as proposals,
  count(*) filter (where l.status = 'won')::int                                as won,
  count(*) filter (where l.status = 'lost')::int                               as lost,
  count(*) filter (where l.created_at > now() - interval '7 days')::int        as leads_7d,
  count(*) filter (where l.next_follow_up_at::date = current_date)::int        as followups_today,
  count(*) filter (where l.next_follow_up_at < now()
                     and l.status not in ('won','lost','dead'))::int           as followups_overdue,
  count(*) filter (where l.status = 'won'
                     and l.updated_at >= date_trunc('month', now()))::int      as won_this_month
from public.leads l
group by l.workspace_id;

-- Convenience view: leads needing follow-up (due or overdue)
create or replace view public.v_followups_due
with (security_invoker = true)
as
select
  l.workspace_id,
  l.id,
  l.name,
  l.phone,
  l.status,
  l.next_follow_up_at,
  (l.next_follow_up_at < now()) as is_overdue
from public.leads l
where l.next_follow_up_at is not null
  and l.status not in ('won','lost','dead')
  and l.next_follow_up_at < (current_date + 1)::timestamptz + interval '1 day'
order by l.next_follow_up_at;
