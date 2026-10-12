-- Serialize spins for a user across webhook workers; reuse existing analytics.
create or replace function public.claim_prediction_ball_spin(p_user_id uuid, p_result text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  spin_time timestamptz;
begin
  perform 1 from public.leads where id = p_user_id for update;
  if not found then
    raise exception 'Unknown prediction ball user';
  end if;

  spin_time := clock_timestamp();
  if exists (
    select 1 from public.user_events
    where user_id = p_user_id and event_name = 'prediction_ball_spun'
      and created_at > spin_time - interval '24 hours'
  ) then
    return false;
  end if;

  insert into public.user_events (user_id, event_name, metadata, created_at)
  values (p_user_id, 'prediction_ball_spun', jsonb_build_object('result', p_result), spin_time);
  return true;
end;
$$;

revoke all on function public.claim_prediction_ball_spin(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_prediction_ball_spin(uuid, text) to service_role;
