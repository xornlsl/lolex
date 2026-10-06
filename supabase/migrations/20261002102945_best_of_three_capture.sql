alter table public.matches
  add column if not exists capture_games jsonb,
  add column if not exists series_format text;

alter table public.matches drop constraint if exists matches_series_format_check;
alter table public.matches add constraint matches_series_format_check
  check (series_format is null or series_format='BO3');

create or replace function public.finish_match_series_from_capture(
  p_match_id bigint,
  p_winner text,
  p_capture_uploader_team text,
  p_capture_games jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_game jsonb;
  v_row jsonb;
  v_game_count integer;
  v_wins integer := 0;
  v_losses integer := 0;
  v_series_outcome text;
  v_expected_winner text;
  v_result jsonb;
begin
  if p_capture_uploader_team not in ('BLUE','RED') then
    return jsonb_build_object('success',false,'message','업로더의 팀 정보가 올바르지 않습니다.');
  end if;
  if jsonb_typeof(p_capture_games) <> 'array' then
    return jsonb_build_object('success',false,'message','경기 캡처 목록이 필요합니다.');
  end if;
  v_game_count := jsonb_array_length(p_capture_games);
  if v_game_count not in (2,3) then
    return jsonb_build_object('success',false,'message','3판 2선승 결과에는 2개 또는 3개의 경기 기록이 필요합니다.');
  end if;
  for v_game in select value from jsonb_array_elements(p_capture_games) loop
    if v_game->>'outcome'='victory' then v_wins := v_wins+1;
    elsif v_game->>'outcome'='defeat' then v_losses := v_losses+1;
    else return jsonb_build_object('success',false,'message','각 경기의 승패 정보가 올바르지 않습니다.');
    end if;
    if jsonb_typeof(v_game->'kda') <> 'array' or jsonb_array_length(v_game->'kda') <> 10 then
      return jsonb_build_object('success',false,'message','각 경기에는 참가자 10명의 K/D/A가 필요합니다.');
    end if;
    for v_row in select value from jsonb_array_elements(v_game->'kda') loop
      if jsonb_typeof(v_row->'kills') <> 'number' or jsonb_typeof(v_row->'deaths') <> 'number'
         or jsonb_typeof(v_row->'assists') <> 'number'
         or (v_row->>'kills')::integer < 0 or (v_row->>'deaths')::integer < 0 or (v_row->>'assists')::integer < 0 then
        return jsonb_build_object('success',false,'message','K/D/A 형식이 올바르지 않습니다.');
      end if;
    end loop;
  end loop;
  if (v_game_count=2 and not (v_wins=2 or v_losses=2))
     or (v_game_count=3 and not ((v_wins=2 and v_losses=1) or (v_wins=1 and v_losses=2))) then
    return jsonb_build_object('success',false,'message','3판 2선승 경기 순서와 결과가 올바르지 않습니다.');
  end if;
  v_series_outcome := case when v_wins=2 then 'victory' else 'defeat' end;
  v_expected_winner := case when v_series_outcome='victory' then p_capture_uploader_team
    when p_capture_uploader_team='BLUE' then 'RED' else 'BLUE' end;
  if p_winner is distinct from v_expected_winner then
    return jsonb_build_object('success',false,'message','시리즈 전적과 선택한 팀으로 계산한 결과가 일치하지 않습니다.');
  end if;
  v_result := public.finish_match(p_match_id,p_winner);
  if coalesce((v_result->>'success')::boolean,false) then
    update public.matches set result_source='CLIENT_SCREENSHOT',series_format='BO3',
      capture_outcome=v_series_outcome,capture_uploader_team=p_capture_uploader_team,
      capture_games=p_capture_games,capture_kda=null
    where id=p_match_id;
  end if;
  return v_result || jsonb_build_object('series_format','BO3','series_wins',v_wins,'series_losses',v_losses);
end;
$$;
revoke all on function public.finish_match_series_from_capture(bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_match_series_from_capture(bigint,text,text,jsonb) to service_role;

;
