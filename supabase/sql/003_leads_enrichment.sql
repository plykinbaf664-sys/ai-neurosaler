alter table public.leads
  add column if not exists matched_offer text,
  add column if not exists last_user_message text,
  add column if not exists warmth_level text not null default 'cold';
