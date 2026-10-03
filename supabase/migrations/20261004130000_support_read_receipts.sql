-- Allow a support participant to mark incoming messages as read.
-- Sender ownership is still required for message creation; read_at is the only
-- field this policy is intended to change from the client.

create policy "support messages mark read"
on public.support_messages for update to authenticated
using (
  exists (
    select 1
    from public.support_conversations c
    where c.id = conversation_id
      and (c.user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
  )
)
with check (
  exists (
    select 1
    from public.support_conversations c
    where c.id = conversation_id
      and (c.user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
  )
);
