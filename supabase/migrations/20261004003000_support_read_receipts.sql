-- Allow each participant to mark messages they received as read.
drop policy if exists "support messages update read" on public.support_messages;

create policy "support messages update read"
on public.support_messages for update to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or exists (
    select 1 from public.support_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
)
with check (
  public.has_role(auth.uid(),'admin')
  or exists (
    select 1 from public.support_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);
