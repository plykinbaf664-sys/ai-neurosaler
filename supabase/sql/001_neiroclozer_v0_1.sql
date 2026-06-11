create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.expert_profile (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default false,
  expert_name text not null,
  welcome_message text not null,
  gift_message text not null,
  gift_type text not null default 'link' check (gift_type in ('link')),
  gift_url text not null,
  first_qual_question text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid references public.expert_profile(id) on delete set null,
  telegram_user_id bigint not null unique,
  telegram_chat_id bigint not null,
  telegram_username text,
  first_name text,
  last_name text,
  source text not null default 'telegram',
  status text not null default 'active',
  current_stage text not null default 'awaiting_first_answer',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  expert_profile_id uuid references public.expert_profile(id) on delete set null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  channel text not null default 'telegram' check (channel in ('telegram')),
  telegram_message_id bigint,
  text text not null,
  message_type text not null check (message_type in ('user', 'welcome', 'gift', 'qual_question')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists leads_expert_profile_id_idx
  on public.leads (expert_profile_id);

create index if not exists messages_lead_id_idx
  on public.messages (lead_id, created_at desc);

create index if not exists messages_expert_profile_id_idx
  on public.messages (expert_profile_id);

drop trigger if exists set_expert_profile_updated_at on public.expert_profile;
create trigger set_expert_profile_updated_at
before update on public.expert_profile
for each row
execute function public.set_updated_at();

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();
