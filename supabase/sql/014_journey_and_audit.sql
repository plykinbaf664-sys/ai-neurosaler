-- Additive migration. Apply before deploying the matching bot version.
alter table public.leads add column if not exists audit_request text;
alter table public.leads add column if not exists audit_requested_at timestamptz;
alter table public.user_library_profiles add column if not exists journey_goal text;
alter table public.user_library_profiles add column if not exists recommended_material_ids jsonb not null default '[]'::jsonb;
alter table public.user_library_profiles add column if not exists active_days integer not null default 0;
alter table public.user_library_profiles add column if not exists last_active_date date;
alter table public.user_library_profiles add column if not exists reminders_enabled boolean not null default true;

-- One compact counter per user, no heartbeat log or activity history.
create or replace function public.record_user_activity(p_user_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare today date := (clock_timestamp() at time zone 'UTC')::date;
begin
  insert into public.user_library_profiles (user_id, active_days, last_active_date, last_interaction_at)
  values (p_user_id, 1, today, clock_timestamp())
  on conflict (user_id) do update set
    active_days = user_library_profiles.active_days + case when user_library_profiles.last_active_date is distinct from today then 1 else 0 end,
    last_active_date = today,
    last_interaction_at = clock_timestamp();
end;
$$;

-- Existing event table also serves as the durable award ledger.
create or replace function public.grant_user_reward(p_user_id uuid, p_key text, p_metadata jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.leads where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  if exists (select 1 from public.user_events where user_id = p_user_id and event_name = 'reward_unlocked' and category = p_key) then return false; end if;
  insert into public.user_events(user_id, event_name, category, metadata)
  values (p_user_id, 'reward_unlocked', p_key, p_metadata);
  return true;
end;
$$;

-- Claim before sending: overlapping cron runs cannot send twice.
create or replace function public.claim_library_followup(p_user_id uuid, p_due_at timestamptz, p_now timestamptz, p_last_interaction_at timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  update public.user_library_profiles set next_followup_due_at = null, last_followup_sent_at = p_now
  where user_id = p_user_id and last_interaction_at = p_last_interaction_at and reminders_enabled and next_followup_due_at = p_due_at and next_followup_due_at <= p_now
    and (last_followup_sent_at is null or last_followup_sent_at <= p_now - interval '24 hours');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.record_user_activity(uuid) from public, anon, authenticated;
revoke all on function public.grant_user_reward(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_library_followup(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.record_user_activity(uuid) to service_role;
grant execute on function public.grant_user_reward(uuid, text, jsonb) to service_role;
grant execute on function public.claim_library_followup(uuid, timestamptz, timestamptz, timestamptz) to service_role;

-- Old open links must never undo a completion, including concurrent requests.
create or replace function public.preserve_library_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'completed' then new.status := 'completed'; end if;
  return new;
end;
$$;
drop trigger if exists preserve_library_completion on public.library_progress;
create trigger preserve_library_completion before update on public.library_progress
for each row execute function public.preserve_library_completion();

create or replace function public.complete_library_material(p_user_id uuid, p_material_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare material public.library_materials%rowtype; changed uuid;
begin
  select * into material from public.library_materials where id = p_material_id and is_active;
  if not found then raise exception 'Active material not found'; end if;
  insert into public.library_progress(user_id, material_id, status) values (p_user_id, p_material_id, 'completed')
  on conflict (user_id, material_id) do update set status = 'completed'
  where library_progress.status <> 'completed' returning id into changed;
  if changed is not null then
    insert into public.user_events(user_id, event_name, material_id, category, metadata)
    values(p_user_id, 'material_completed', p_material_id, material.category,
      jsonb_build_object('topic', material.topic, 'slug', material.slug, 'title', material.title, 'route', material.category, 'status', 'completed'));
  end if;
end;
$$;
revoke all on function public.complete_library_material(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_library_material(uuid, uuid) to service_role;
