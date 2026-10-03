alter table public.support_messages
  add column if not exists read_at timestamptz;

create index if not exists support_messages_unread_idx
  on public.support_messages(conversation_id, read_at);

create or replace function public.mark_support_messages_read(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.support_messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and read_at is null
    and sender_id <> auth.uid();
end;
$$;

grant execute on function public.mark_support_messages_read(uuid) to authenticated;
