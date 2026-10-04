create or replace function public.finish_match_series_with_players(
  p_match_id bigint,
  p_winner text,
  p_capture_uploader_team text,
  p_capture_games jsonb,
  p_series_players jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_player jsonb;
  v_position text;
  v_result jsonb;
  v_status text;
  v_game_count integer;
  v_wins integer;
  v_losses integer;
  v_expected_winner text;
begin
  select status into v_status from public.matches where id=p_match_id for update;
  if v_status is null then return jsonb_build_object('success',false,'message','경기를 찾을 수 없습니다.'); end if;
  if v_status not in ('matched','in_progress') then return jsonb_build_object('success',false,'message','현재 결과를 처리할 수 없는 경기 상태입니다.'); end if;
  if (select count(*) from public.match_players where match_id=p_match_id)<>10 then
    return jsonb_build_object('success',false,'message','기존 매칭 참가자가 정확히 10명이 아닙니다.');
  end if;
  if p_capture_uploader_team not in ('BLUE','RED') or jsonb_typeof(p_capture_games)<>'array' then
    return jsonb_build_object('success',false,'message','캡처 또는 팀 정보가 올바르지 않습니다.');
  end if;
  v_game_count:=jsonb_array_length(p_capture_games);
  select count(*) filter(where x->>'outcome'='victory'),count(*) filter(where x->>'outcome'='defeat')
    into v_wins,v_losses from jsonb_array_elements(p_capture_games) x;
  if (v_game_count=2 and not(v_wins=2 or v_losses=2))
     or (v_game_count=3 and not((v_wins=2 and v_losses=1) or (v_wins=1 and v_losses=2))) then
    return jsonb_build_object('success',false,'message','3판 2선승 경기 결과가 올바르지 않습니다.');
  end if;
  v_expected_winner:=case when v_wins=2 then p_capture_uploader_team when p_capture_uploader_team='BLUE' then 'RED' else 'BLUE' end;
  if p_winner is distinct from v_expected_winner then return jsonb_build_object('success',false,'message','시리즈 승리팀이 일치하지 않습니다.'); end if;
  if jsonb_typeof(p_series_players)<>'array' or jsonb_array_length(p_series_players)<>10 then
    return jsonb_build_object('success',false,'message','2경기 이상 출전한 최종 참가자가 정확히 10명이어야 합니다.');
  end if;
  create temporary table if not exists series_eligible_players(
    user_id uuid primary key,team text not null,appearances integer not null
  ) on commit drop;
  truncate series_eligible_players;
  begin
    insert into series_eligible_players(user_id,team,appearances)
    select (x->>'user_id')::uuid,x->>'team',(x->>'appearances')::integer
    from jsonb_array_elements(p_series_players) x;
  exception when others then
    return jsonb_build_object('success',false,'message','최종 참가자 정보 형식이 올바르지 않습니다.');
  end;
  if exists(select 1 from series_eligible_players where team not in ('BLUE','RED') or appearances<2 or appearances>3)
     or (select count(*) from series_eligible_players where team='BLUE')<>5
     or (select count(*) from series_eligible_players where team='RED')<>5 then
    return jsonb_build_object('success',false,'message','최종 참가자의 팀 또는 출전 횟수가 올바르지 않습니다.');
  end if;
  update public.match_players mp
  set team=null
  where mp.match_id=p_match_id
    and exists(select 1 from series_eligible_players e where e.user_id=mp.user_id);

  update public.match_players mp
  set team=e.team
  from series_eligible_players e
  where mp.match_id=p_match_id and mp.user_id=e.user_id;

  if exists(
    select 1 from public.match_players mp
    join series_eligible_players e on e.user_id=mp.user_id
    where mp.match_id=p_match_id
    group by e.team,mp.position
    having count(*)>1
  ) then
    return jsonb_build_object('success',false,'message','실제 팀 기준으로 같은 포지션이 중복되었습니다. 참가자 순서와 팀 선택을 확인해주세요.');
  end if;
  if exists(select 1 from series_eligible_players e left join public.profiles p on p.user_id=e.user_id and p.status='approved' where p.user_id is null) then
    return jsonb_build_object('success',false,'message','승인되지 않은 교체 참가자가 포함되어 있습니다.');
  end if;

  create temporary table if not exists series_missing_positions(team text,position text,primary key(team,position)) on commit drop;
  create temporary table if not exists series_replacements(user_id uuid primary key,team text,position text) on commit drop;
  truncate series_missing_positions;
  truncate series_replacements;
  insert into series_missing_positions(team,position)
  select mp.team,mp.position from public.match_players mp
  where mp.match_id=p_match_id and not exists(select 1 from series_eligible_players e where e.user_id=mp.user_id);

  for v_player in select jsonb_build_object('user_id',e.user_id,'team',e.team)
    from series_eligible_players e
    where not exists(select 1 from public.match_players mp where mp.match_id=p_match_id and mp.user_id=e.user_id)
    order by e.team,e.user_id
  loop
    select sm.position into v_position from series_missing_positions sm
    join public.profiles p on p.user_id=(v_player->>'user_id')::uuid
    where sm.team=v_player->>'team' and sm.position=p.main_position limit 1;
    if v_position is null then
      select position into v_position from series_missing_positions where team=v_player->>'team' order by position limit 1;
    end if;
    if v_position is null then return jsonb_build_object('success',false,'message','교체 선수의 포지션을 연결하지 못했습니다.'); end if;
    insert into series_replacements values((v_player->>'user_id')::uuid,v_player->>'team',v_position);
    delete from series_missing_positions where team=v_player->>'team' and position=v_position;
  end loop;
  if exists(select 1 from series_missing_positions) then
    return jsonb_build_object('success',false,'message','교체 전후 참가자 수가 일치하지 않습니다.');
  end if;

  delete from public.match_players mp where mp.match_id=p_match_id
    and not exists(select 1 from series_eligible_players e where e.user_id=mp.user_id);
  insert into public.match_players(match_id,user_id,team,position,requested_primary_position,requested_secondary_position,overall_rating_before,position_rating_before)
  select p_match_id,r.user_id,r.team,r.position,p.main_position,p.sub_position,pr.overall_rating,
    case r.position when 'TOP' then pr.top_rating when 'JUNGLE' then pr.jungle_rating when 'MID' then pr.mid_rating when 'ADC' then pr.adc_rating else pr.support_rating end
  from series_replacements r join public.profiles p on p.user_id=r.user_id join public.player_ratings pr on pr.user_id=r.user_id;

  v_result:=public.finish_match_series_from_capture(p_match_id,p_winner,p_capture_uploader_team,p_capture_games);
  return v_result || jsonb_build_object('rated_player_count',10,'substitution_count',(select count(*) from series_replacements));
end;
$$;
revoke all on function public.finish_match_series_with_players(bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_match_series_with_players(bigint,text,text,jsonb,jsonb) to service_role;




