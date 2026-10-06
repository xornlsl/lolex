-- Apply before deploying the cancellation endpoint and frontend.
-- Only the service endpoint can supply the verified caller ID.
create or replace function public.cancel_active_match(p_match_id bigint, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  perform pg_advisory_xact_lock(20260929);
  select status into v_status from public.matches where id=p_match_id for update;
  if not found then
    return jsonb_build_object('success',false,'error','이미 해제되었거나 찾을 수 없는 매칭입니다.');
  end if;
  if not exists(select 1 from public.profiles where user_id=p_actor_id and status='approved')
     or not exists(select 1 from public.match_players where match_id=p_match_id and user_id=p_actor_id) then
    return jsonb_build_object('success',false,'error','이 매칭의 참가자만 취소할 수 있습니다.');
  end if;
  if v_status not in ('position_discussion','matched','in_progress')
     or exists(select 1 from public.rating_history where match_id=p_match_id)
     or exists(select 1 from public.replay_games where match_id=p_match_id) then
    return jsonb_build_object('success',false,'error','결과가 저장되었거나 종료된 경기는 취소할 수 없습니다.');
  end if;
  -- If data is inconsistent, fail without touching participants shared with
  -- another active match. Never release somebody else's active assignment.
  if exists(
    select 1 from public.match_players target
    join public.match_players other on other.user_id=target.user_id and other.match_id<>p_match_id
    join public.matches m on m.id=other.match_id
    where target.match_id=p_match_id and m.status in ('position_discussion','matched','in_progress')
  ) then
    return jsonb_build_object('success',false,'error','다른 진행 중인 경기와 참가자가 중복되어 취소할 수 없습니다. 관리자에게 문의해주세요.');
  end if;
  -- Remove stale queue entries so cancellation never requeues players.
  delete from public.match_queue q using public.match_players mp
    where mp.match_id=p_match_id and mp.user_id=q.user_id;
  update public.matches set status='cancelled',finished_at=now() where id=p_match_id;
  return jsonb_build_object('success',true,'match_id',p_match_id);
end;
$$;
revoke all on function public.cancel_active_match(bigint,uuid) from public,anon,authenticated;
grant execute on function public.cancel_active_match(bigint,uuid) to service_role;

;
