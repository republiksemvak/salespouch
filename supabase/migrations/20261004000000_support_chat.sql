create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index support_messages_conversation_created_idx
  on public.support_messages(conversation_id, created_at);

create index support_conversations_updated_idx
  on public.support_conversations(updated_at desc);

grant select, insert, update on public.support_conversations to authenticated;
grant select, insert, update on public.support_messages to authenticated;
grant all on public.support_conversations to service_role;
grant all on public.support_messages to service_role;

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

create policy "support own conversation read"
on public.support_conversations for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create policy "support own conversation create"
on public.support_conversations for insert to authenticated
with check (user_id = auth.uid());

create policy "support own conversation update"
on public.support_conversations for update to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create policy "support messages read"
on public.support_messages for select to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or exists (
    select 1 from public.support_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);

create policy "support messages create"
on public.support_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and (
    public.has_role(auth.uid(),'admin')
    or exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
);

create policy "support messages update read"
on public.support_messages for update to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or sender_id = auth.uid()
)
with check (
  public.has_role(auth.uid(),'admin')
  or sender_id = auth.uid()
);

alter table public.support_conversations replica identity full;
alter table public.support_messages replica identity full;
alter publication supabase_realtime add table public.support_conversations;
alter publication supabase_realtime add table public.support_messages;
