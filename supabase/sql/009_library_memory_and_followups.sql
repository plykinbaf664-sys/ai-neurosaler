update public.library_materials
set
  short_description = 'Быстрая практика, чтобы выгрузить мысли из головы, снизить внутренний шум и вернуть ясность за несколько минут.',
  topic = 'productivity / ai-practice',
  url = 'https://telegra.ph/Vygruzi-golovu-za-7-min-08-25',
  position = 1,
  is_active = true
where category = 'life' and slug = 'vygruzi-golovu-za-7-min';

insert into public.library_materials
  (id, slug, title, short_description, category, topic, url, position, is_active)
values
  (
    '00000000-0000-4000-8001-000000000103',
    '300-otzyvov-za-5-minut',
    '300 отзывов за 5 минут',
    'Показывает, как быстро собрать массив отзывов и вытащить из них повторяющиеся боли, желания и идеи для решений с помощью AI.',
    'life',
    'productivity / ai-practice / research',
    'https://telegra.ph/300-otzyvov-za-5-minut-08-28',
    2,
    true
  ),
  (
    '00000000-0000-4000-8002-000000000100',
    'chto-komanda-poobeshchala-i-zabyla',
    'Что команда пообещала и забыла',
    'Материал про то, как теряются договорённости в команде, почему задачи забываются и как AI может помочь держать фокус, ответственность и контроль без ручного микроменеджмента.',
    'business',
    'team / management / operations',
    'https://telegra.ph/CHto-komanda-poobeshchala-i-zabyla-08-28',
    1,
    true
  )
on conflict (category, slug) do update
set
  title = excluded.title,
  short_description = excluded.short_description,
  topic = excluded.topic,
  url = excluded.url,
  position = excluded.position,
  is_active = excluded.is_active;

update public.library_materials
set is_active = false
where
  (category = 'life' and slug in ('ai-life-start', 'ai-life-focus'))
  or
  (category = 'business' and slug in ('ai-business-start', 'business-routine-automation'));

create table if not exists public.user_library_profiles (
  user_id uuid primary key references public.leads(id) on delete cascade,
  selected_categories jsonb not null default '[]'::jsonb,
  opened_topics jsonb not null default '[]'::jsonb,
  completed_topics jsonb not null default '[]'::jsonb,
  last_route text check (last_route in ('marketing', 'life', 'business')),
  last_category text check (last_category in ('life', 'business')),
  last_material_slug text,
  last_material_title text,
  last_material_status text check (last_material_status in ('opened', 'completed')),
  completed_count integer not null default 0,
  engagement_score integer not null default 0,
  last_followup_type text,
  last_user_intent text,
  last_interaction_at timestamptz not null default timezone('utc', now()),
  last_followup_sent_at timestamptz,
  next_followup_due_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_library_profiles_followup_due_idx
  on public.user_library_profiles (next_followup_due_at)
  where next_followup_due_at is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_user_library_profiles_updated_at') then
    create trigger set_user_library_profiles_updated_at
    before update on public.user_library_profiles
    for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('user', 'welcome', 'gift', 'qual_question', 'gift_followup', 'library_followup', 'ai_reply'));
