-- Phase 4 local verification: opt-in store, message log, webhook
-- event audit + idempotency index, all under RLS.

\echo '== User A: record an opt-in (expect INSERT 0 1):'
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select id as ws_a from public.workspaces where slug = 'a-business' \gset
insert into public.whatsapp_optins (workspace_id, phone, status, method)
values (:'ws_a', '919810000001', 'opted_in', 'manual');

\echo '== User A: log an outbound message (expect INSERT 0 1):'
insert into public.whatsapp_messages (workspace_id, direction, body, status, wa_message_id)
values (:'ws_a', 'outbound', 'Hello from the sandbox', 'sent', 'wamid.TEST001');

\echo '== duplicate phone opt-in must FAIL with 23505 (global consent state):'
insert into public.whatsapp_optins (workspace_id, phone, status, method)
values (:'ws_a', '919810000001', 'opted_out', 'manual');

\echo '== User B: sees 0 optins + 0 messages (expect 0 and 0):'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as b_optins from public.whatsapp_optins;
select count(*) as b_messages from public.whatsapp_messages;

\echo '== User B: insert optin into A workspace must FAIL with 42501:'
insert into public.whatsapp_optins (workspace_id, phone, status, method)
values (:'ws_a', '919999999999', 'opted_in', 'manual');

reset role;

\echo '== Service role (postgres): webhook stores an event:'
insert into public.whatsapp_events (workspace_id, wa_message_id, phone, event_type, payload)
select id, 'wamid.TEST001', '919810000001', 'status:delivered', '{}'::jsonb
from public.workspaces where slug = 'a-business';

\echo '== Service role: duplicate (wamid,event_type) must FAIL with 23505 (idempotency):'
insert into public.whatsapp_events (workspace_id, wa_message_id, phone, event_type, payload)
select id, 'wamid.TEST001', '919810000001', 'status:delivered', '{}'::jsonb
from public.workspaces where slug = 'a-business';

\echo '== User A: can read own events (expect 1) but nothing beyond:'
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select count(*) as a_events from public.whatsapp_events;

\echo '== User A: cannot insert events directly (no insert policy → 42501):'
insert into public.whatsapp_events (wa_message_id, event_type) values ('wamid.HACK', 'received');

reset role;
\echo '== phase 4 verification finished'
