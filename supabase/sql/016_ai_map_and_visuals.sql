-- Apply after 015, before enabling AI_MAP_ENABLED / IMAGE_GENERATION_ENABLED.
alter table public.user_library_profiles add column if not exists ai_map jsonb;
alter table public.user_library_profiles add column if not exists ai_map_followup_due_at timestamptz;
create index if not exists ai_map_due_idx on public.user_library_profiles(ai_map_followup_due_at)
  where ai_map_followup_due_at is not null;

create table if not exists public.telegram_visual_assets (
  screen_key text primary key,
  file_id text,
  claim_token text not null,
  retry_at timestamptz not null
);
alter table public.telegram_visual_assets enable row level security;
revoke all on public.telegram_visual_assets from anon, authenticated;
grant all on public.telegram_visual_assets to service_role;

create or replace function public.save_ai_map(p_user_id uuid, p_expected_version text, p_state jsonb, p_due_at timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  if length(p_state::text) > 16000 or jsonb_array_length(p_state->'answers') > 5 then
    raise exception 'AI map exceeds bounded state';
  end if;
  update public.user_library_profiles set ai_map = p_state, ai_map_followup_due_at = p_due_at
  where user_id = p_user_id and (ai_map->>'version') is not distinct from p_expected_version;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.stop_ai_map_followups(p_user_id uuid)
returns void language sql security invoker set search_path = public as $$
  update public.user_library_profiles
  set ai_map = case when ai_map is null then null else
    ai_map || jsonb_build_object('stopped', true, 'version', gen_random_uuid()::text) end,
    ai_map_followup_due_at = null
  where user_id = p_user_id;
$$;

create or replace function public.claim_ai_map_followup(p_user_id uuid, p_version text, p_step integer, p_now timestamptz, p_next_due timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  -- Serialize against lead transitions. Persist the step before any Telegram send.
  perform 1 from public.leads where id = p_user_id and status in ('active', 'new')
    and audit_requested_at is null and current_stage !~ '(handoff|audit_request)' for update;
  if not found then return false; end if;
  update public.user_library_profiles set
    ai_map = jsonb_set(ai_map, '{followupStep}', to_jsonb(p_step)), ai_map_followup_due_at = p_next_due
  where user_id = p_user_id and ai_map->>'version' = p_version
    and ai_map->>'resultShownAt' is not null and coalesce((ai_map->>'stopped')::boolean, false) = false
    and reminders_enabled and ai_map_followup_due_at <= p_now
    and p_step between 1 and 4 and coalesce((ai_map->>'followupStep')::integer, 0) < p_step;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.claim_visual_asset(p_key text, p_token text, p_now timestamptz, p_retry_at timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  insert into public.telegram_visual_assets(screen_key, claim_token, retry_at) values(p_key, p_token, p_retry_at)
  on conflict (screen_key) do update set claim_token = excluded.claim_token, retry_at = excluded.retry_at
    where telegram_visual_assets.file_id is null and telegram_visual_assets.retry_at <= p_now;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.save_ai_map(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.stop_ai_map_followups(uuid) from public, anon, authenticated;
revoke all on function public.claim_ai_map_followup(uuid, text, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_visual_asset(text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.save_ai_map(uuid, text, jsonb, timestamptz) to service_role;
grant execute on function public.stop_ai_map_followups(uuid) to service_role;
grant execute on function public.claim_ai_map_followup(uuid, text, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.claim_visual_asset(text, text, timestamptz, timestamptz) to service_role;
