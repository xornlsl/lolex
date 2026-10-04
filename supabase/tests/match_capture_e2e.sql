create or replace function public.run_lolex_match_capture_e2e_test()
returns jsonb language plpgsql set search_path='' as $$
declare
  v_users uuid[] := array[]::uuid[];
  v_positions text[] := array['TOP','JUNGLE','MID','ADC','SUPPORT'];
  v_id uuid;
  v_match_result jsonb;
  v_finish_result jsonb;
  v_match_id bigint;
  v_stats_before integer;
  v_result jsonb;
  i integer;
begin
  begin
    for i in 1..10 loop
      v_id := gen_random_uuid();
      v_users := array_append(v_users,v_id);
      insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(v_id,'authenticated','authenticated','lolex-e2e-'||v_id||'@example.invalid','test-only',now(),'{}','{}',now(),now());
      insert into public.member_sheet(real_name,birth_date,lol_nickname)
      values('E2E테스트'||v_id,'2000-01-01','E2E'||i||'#TEST');
      insert into public.profiles(user_id,username,lol_nickname,real_name,birth_date,main_position,sub_position,role,status,initial_internal_score)
      values(v_id,'e2e_'||replace(v_id::text,'-',''),'E2E'||i||'#TEST','E2E테스트'||v_id,'2000-01-01',
        v_positions[((i-1)%5)+1],v_positions[(i%5)+1],'member','approved',i-1);
      insert into public.match_queue(user_id,primary_position,secondary_position,joined_at)
      values(v_id,v_positions[((i-1)%5)+1],v_positions[(i%5)+1],now()+(i||' milliseconds')::interval);
    end loop;

    v_match_result := public.run_auto_matchmaking();
    v_match_id := (v_match_result->>'match_id')::bigint;
    if v_match_result->>'status' <> 'matched' then raise exception '자동 매칭 실패: %',v_match_result; end if;
    if (select count(*) from public.match_players where match_id=v_match_id) <> 10 then raise exception '참가자 수 오류'; end if;
    if exists(select 1 from (select team,count(*) c from public.match_players where match_id=v_match_id group by team) x where c<>5) then raise exception '팀 인원 오류'; end if;
    if exists(select 1 from (select team,position,count(*) c from public.match_players where match_id=v_match_id group by team,position) x where c<>1) then raise exception '포지션 배정 오류'; end if;

    v_finish_result := public.finish_match_from_capture(v_match_id,'BLUE','victory','BLUE',
      (select jsonb_agg(jsonb_build_object('kills',n,'deaths',n%5,'assists',10-n) order by n) from generate_series(1,10) n));
    if not coalesce((v_finish_result->>'success')::boolean,false) then raise exception '결과 확정 실패: %',v_finish_result; end if;
    if (select count(*) from public.player_ratings where user_id=any(v_users) and games_played=1) <> 10 then raise exception '전적 반영 실패'; end if;
    if (select sum(wins) from public.player_ratings where user_id=any(v_users)) <> 5 then raise exception '승리 반영 실패'; end if;
    if (select sum(losses) from public.player_ratings where user_id=any(v_users)) <> 5 then raise exception '패배 반영 실패'; end if;
    if (select count(*) from public.rating_history where match_id=v_match_id) <> 20 then raise exception '레이팅 이력 반영 실패'; end if;
    if not exists(select 1 from public.matches where id=v_match_id and status='finished' and winner='BLUE' and result_source='CLIENT_SCREENSHOT') then raise exception '캡처 결과 저장 실패'; end if;

    select count(*) into v_stats_before from public.match_player_stats s join public.match_players mp on mp.id=s.match_player_id where mp.match_id=v_match_id;
    insert into public.match_player_stats(match_player_id,played_riot_id,champion_key,champion_name,icon_version,kills,deaths,assists)
    select mp.id,p.lol_nickname,
      case when row_number() over(order by mp.id)<=4 then 'Ahri' else 'Garen' end,
      case when row_number() over(order by mp.id)<=4 then '아리' else '가렌' end,
      '16.19.1',row_number() over(order by mp.id),2,5
    from public.match_players mp join public.profiles p on p.user_id=mp.user_id where mp.match_id=v_match_id;
    if (select count(*) from public.match_player_stats s join public.match_players mp on mp.id=s.match_player_id where mp.match_id=v_match_id) <> 10 then raise exception '챔피언 기록 저장 실패'; end if;
    if not exists(select 1 from public.get_most_champions(array[v_users[1]]) where games=1) then raise exception '모스트 챔피언 집계 실패'; end if;

    v_result := jsonb_build_object(
      'matchmaking',true,'players',10,'blue_players',5,'red_players',5,
      'capture_result',true,'winner','BLUE','rating_updates',10,'rating_history_rows',20,
      'match_history_players',10,'most_champions',true,
      'stats_written_by_current_upload',v_stats_before,
      'rolled_back',true
    );
    raise exception using errcode='P0002',message='rollback test data';
  exception when sqlstate 'P0002' then
    return v_result;
  end;
end;
$$;
