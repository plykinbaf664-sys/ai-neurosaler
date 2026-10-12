insert into public.library_materials
  (id, slug, title, short_description, category, topic, url, position, is_active)
select
  new.id::uuid, new.slug, new.title, new.short_description, new.category, new.topic, new.url,
  coalesce((select max(position) + 1 from public.library_materials where category = new.category), 1),
  true
from (values
  (
    '00000000-0000-4000-8002-000000000104',
    'vozmozhno-vam-ne-nuzhny-novye-lidy',
    'Возможно, вам не нужны новые лиды',
    'Загрузите потерянные переписки и найдите повторяющиеся утечки продаж: забытые follow-up, сделки без следующего шага, слабую диагностику и клиентов, которых ещё можно вернуть.',
    'business',
    'sales_audit',
    'https://telegra.ph/Vozmozhno-vam-ne-nuzhny-novye-lidy-10-12'
  ),
  (
    '00000000-0000-4000-8001-000000000104',
    'ne-mozhesh-prinyat-reshenie-vot-proverennyj-sposob',
    'Не можешь принять решение? Вот проверенный способ',
    'Разберите сложное решение за 15 минут: отделите факты от страхов и предположений, найдите главный компромисс и поймите, что проверить перед выбором.',
    'life',
    'decision_making',
    'https://telegra.ph/Ne-mozhesh-prinyat-reshenie-Vot-proverennyj-sposob-10-12'
  )
) as new(id, slug, title, short_description, category, topic, url)
on conflict (category, slug) do update
set
  title = excluded.title,
  short_description = excluded.short_description,
  topic = excluded.topic,
  url = excluded.url,
  is_active = excluded.is_active;
-- Preserve the existing ID and position when this migration is repeated.
