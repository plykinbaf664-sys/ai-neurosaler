create table if not exists public.runtime_settings (
  id integer primary key check (id = 1),
  entry_flow_mode text not null check (entry_flow_mode in ('quiz', 'gift')),
  gift_followups_enabled boolean not null,
  updated_at timestamptz not null default timezone('utc', now())
);

revoke all on public.runtime_settings from anon, authenticated;
grant select, insert, update on public.runtime_settings to service_role;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_runtime_settings_updated_at') then
    create trigger set_runtime_settings_updated_at
    before update on public.runtime_settings
    for each row execute function public.set_updated_at();
  end if;
end
$$;
