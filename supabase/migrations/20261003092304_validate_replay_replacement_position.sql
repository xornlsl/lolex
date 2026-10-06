create or replace function public.finish_replay_series(p_match_id bigint,p_winner text,p_games jsonb,p_players jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g jsonb; gid bigint; result jsonb;
begin
  perform 1 from public.matches where id=p_match_id and status in ('matched','in_progress') for update;
  if not found then raise exception 'MATCH_NOT_ACTIVE'; end if;
  -- The service endpoint validates the submitted series; any failure rolls back
  -- participant reassignment, ratings, and set statistics together.
  result := public.finish_match_series_with_players(p_match_id,p_winner,'BLUE',p_games,p_players);
  if not coalesce((result->>'success')::boolean,false) then raise exception 'SERIES_REJECTED: %',result->>'message'; end if;
  if exists(
    select 1 from public.match_players mp
    join jsonb_array_elements(p_games->0->'kda') r on (r->>'user_id')::uuid=mp.user_id
    where mp.match_id=p_match_id and mp.position is distinct from r->>'position'
  ) or exists(
    select 1 from public.match_players mp
    join jsonb_array_elements(p_games->1->'kda') r on (r->>'user_id')::uuid=mp.user_id
    where mp.match_id=p_match_id and mp.position is distinct from r->>'position'
  ) then raise exception 'REPLACEMENT_POSITION_MISMATCH'; end if;
  for g in select value from jsonb_array_elements(p_games) loop
    insert into public.replay_games(match_id,game_number,file_hash,winner,patch)
    values(p_match_id,(g->>'game_number')::integer,g->>'hash',g->>'winner',g->>'patch') returning id into gid;
    insert into public.replay_participants(game_id,user_id,team,position,played_riot_id,champion_key,champion_name,icon_version,kills,deaths,assists)
    select gid,(r->>'user_id')::uuid,r->>'team',r->>'position',r->>'riotName',r->>'champion_key',r->>'champion_name',r->>'icon_version',
      (r->>'kills')::integer,(r->>'deaths')::integer,(r->>'assists')::integer
    from jsonb_array_elements(g->'kda') r;
  end loop;
  update public.matches set result_source='REPLAY_REVIEW' where id=p_match_id;
  return result;
end; $$;
;
