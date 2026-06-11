alter table public.expert_profile
  add column if not exists brand_name text,
  add column if not exists role_description text,
  add column if not exists core_positioning text,
  add column if not exists target_audience text,
  add column if not exists communication_rules text,
  add column if not exists do_not_say_rules text;

create table if not exists public.expert_offers (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profile(id) on delete cascade,
  title text not null,
  description text,
  price_text text,
  cta_text text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expert_faq (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profile(id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expert_objections (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profile(id) on delete cascade,
  objection text not null,
  response text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists expert_offers_expert_profile_id_idx
  on public.expert_offers (expert_profile_id);

create index if not exists expert_faq_expert_profile_id_idx
  on public.expert_faq (expert_profile_id);

create index if not exists expert_objections_expert_profile_id_idx
  on public.expert_objections (expert_profile_id);

drop trigger if exists set_expert_offers_updated_at on public.expert_offers;
create trigger set_expert_offers_updated_at
before update on public.expert_offers
for each row
execute function public.set_updated_at();

drop trigger if exists set_expert_faq_updated_at on public.expert_faq;
create trigger set_expert_faq_updated_at
before update on public.expert_faq
for each row
execute function public.set_updated_at();

drop trigger if exists set_expert_objections_updated_at on public.expert_objections;
create trigger set_expert_objections_updated_at
before update on public.expert_objections
for each row
execute function public.set_updated_at();
