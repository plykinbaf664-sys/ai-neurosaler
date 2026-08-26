do $$
begin
  if not exists (
    select 1
    from public.library_materials
    where category = 'life' and slug = 'vygruzi-golovu-za-7-min'
  ) then
    update public.library_materials
    set position = position + 1
    where category = 'life' and position >= 1;
  end if;
end
$$;

insert into public.library_materials
  (id, slug, title, short_description, category, topic, url, position, is_active)
values
  (
    '00000000-0000-4000-8001-000000000100',
    'vygruzi-golovu-za-7-min',
    'Выгрузи голову за 7 минут',
    'Быстрая практика, чтобы выгрузить мысли из головы и вернуть ясность.',
    'life',
    'productivity / mental unload',
    'https://telegra.ph/Vygruzi-golovu-za-7-min-08-25',
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
where category = 'life'
  and slug in ('ai-life-start', 'ai-life-focus');
