alter table public.matches
  add column if not exists result_source text,
  add column if not exists capture_outcome text,
  add column if not exists capture_uploader_team text,
  add column if not exists capture_kda jsonb;

alter table public.matches drop constraint if exists matches_result_source_check;
alter table public.matches add constraint matches_result_source_check
  check (result_source is null or result_source = 'CLIENT_SCREENSHOT');
alter table public.matches drop constraint if exists matches_capture_outcome_check;
alter table public.matches add constraint matches_capture_outcome_check
  check (capture_outcome is null or capture_outcome in ('victory','defeat'));
alter table public.matches drop constraint if exists matches_capture_uploader_team_check;
alter table public.matches add constraint matches_capture_uploader_team_check
  check (capture_uploader_team is null or capture_uploader_team in ('BLUE','RED'));

create or replace function public.finish_match_from_capture(
  p_match_id bigint,
  p_winner text,
  p_capture_outcome text,
  p_capture_uploader_team text,
  p_capture_kda jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_expected_winner text;
  v_item jsonb;
  v_result jsonb;
begin
  if p_capture_outcome not in ('victory','defeat')
     or p_capture_uploader_team not in ('BLUE','RED') then
    return jsonb_build_object('success',false,'message','캡처 승패 또는 팀 정보가 올바르지 않습니다.');
  end if;
  v_expected_winner := case when p_capture_outcome='victory' then p_capture_uploader_team
    when p_capture_uploader_team='BLUE' then 'RED' else 'BLUE' end;
  if p_winner is distinct from v_expected_winner then
    return jsonb_build_object('success',false,'message','캡처 승패와 선택한 팀으로 계산한 결과가 일치하지 않습니다.');
  end if;
  if jsonb_typeof(p_capture_kda) <> 'array' or jsonb_array_length(p_capture_kda) <> 10 then
    return jsonb_build_object('success',false,'message','참가자 10명의 K/D/A가 필요합니다.');
  end if;
  for v_item in select value from jsonb_array_elements(p_capture_kda) loop
    if jsonb_typeof(v_item->'kills') <> 'number'
       or jsonb_typeof(v_item->'deaths') <> 'number'
       or jsonb_typeof(v_item->'assists') <> 'number'
       or (v_item->>'kills')::integer < 0
       or (v_item->>'deaths')::integer < 0
       or (v_item->>'assists')::integer < 0 then
      return jsonb_build_object('success',false,'message','K/D/A 형식이 올바르지 않습니다.');
    end if;
  end loop;
  v_result := public.finish_match(p_match_id,p_winner);
  if coalesce((v_result->>'success')::boolean,false) then
    update public.matches set result_source='CLIENT_SCREENSHOT',
      capture_outcome=p_capture_outcome,
      capture_uploader_team=p_capture_uploader_team,
      capture_kda=p_capture_kda
    where id=p_match_id;
  end if;
  return v_result;
end;
$$;
revoke all on function public.finish_match_from_capture(bigint,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_match_from_capture(bigint,text,text,text,jsonb) to service_role;;
