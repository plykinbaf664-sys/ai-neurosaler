create table if not exists public.lead_materials (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  material_type text not null check (material_type in ('pdf', 'url', 'text', 'unknown')),
  source_url text,
  telegram_file_id text,
  file_name text,
  raw_text text,
  analysis text,
  status text not null default 'received' check (status in ('received', 'analyzed', 'failed')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lead_materials_lead_id_created_at_idx
  on public.lead_materials (lead_id, created_at desc);
