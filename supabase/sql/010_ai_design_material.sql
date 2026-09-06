insert into public.library_materials
  (id, slug, title, short_description, category, topic, url, position, is_active)
values
  (
    '00000000-0000-4000-8002-000000000103',
    'kak-delat-ai-dizajn-kotoryj-ne-vyglyadit-kak-ai',
    'Как делать AI-дизайн, который не выглядит как AI',
    'Практический гайд: как собрать собственный визуальный стиль, создавать карусели и рекламные креативы с AI и сократить расходы на рутинный дизайн.',
    'business',
    'ai_design',
    'https://telegra.ph/Kak-delat-AI-dizajn-kotoryj-ne-vyglyadit-kak-AI-09-06',
    2,
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
