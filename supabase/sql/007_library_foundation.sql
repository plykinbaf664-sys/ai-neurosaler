create table if not exists public.library_materials (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  short_description text not null,
  category text not null,
  topic text not null,
  url text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists library_materials_category_slug_uidx
  on public.library_materials (category, slug);

create index if not exists library_materials_category_position_idx
  on public.library_materials (category, is_active, position);

create table if not exists public.library_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.leads(id) on delete cascade,
  material_id uuid not null references public.library_materials(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'opened', 'completed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists library_progress_user_material_uidx
  on public.library_progress (user_id, material_id);

create index if not exists library_progress_user_status_idx
  on public.library_progress (user_id, status);

create table if not exists public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.leads(id) on delete cascade,
  event_name text not null,
  material_id uuid references public.library_materials(id) on delete set null,
  category text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_events_user_created_at_idx
  on public.user_events (user_id, created_at desc);

create index if not exists user_events_name_category_idx
  on public.user_events (event_name, category, created_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_library_materials_updated_at') then
    create trigger set_library_materials_updated_at
    before update on public.library_materials
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_library_progress_updated_at') then
    create trigger set_library_progress_updated_at
    before update on public.library_progress
    for each row execute function public.set_updated_at();
  end if;
end
$$;

insert into public.library_materials
  (id, slug, title, short_description, category, topic, url, position, is_active)
values
  (
    '00000000-0000-4000-8001-000000000101',
    'ai-life-start',
    'AI для повседневных задач',
    'Короткий старт: где AI может экономить время в обычной жизни.',
    'life',
    'productivity',
    '/library/life/ai-life-start',
    1,
    true
  ),
  (
    '00000000-0000-4000-8001-000000000102',
    'ai-life-focus',
    'Фокус и личная продуктивность',
    'Как использовать AI для планирования, фокуса и личных заметок.',
    'life',
    'productivity',
    '/library/life/ai-life-focus',
    2,
    true
  ),
  (
    '00000000-0000-4000-8002-000000000101',
    'ai-business-start',
    'AI в бизнес-процессах',
    'Карта первых процессов, где AI может дать измеримый эффект.',
    'business',
    'automation',
    '/library/business/ai-business-start',
    1,
    true
  ),
  (
    '00000000-0000-4000-8002-000000000102',
    'business-routine-automation',
    'Автоматизация бизнес-рутины',
    'Как находить повторяющиеся задачи и готовить их к автоматизации.',
    'business',
    'automation',
    '/library/business/business-routine-automation',
    2,
    true
  )
on conflict (category, slug) do nothing;
