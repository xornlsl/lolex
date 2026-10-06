-- API results use the same set records, most-champion query and series ratings
-- as replay uploads. A unique Riot match ID prevents reuse across LOLEX matches.
alter table public.replay_games
  add column riot_match_id text unique check (riot_match_id ~ '^KR_[1-9][0-9]{0,19}$');

alter table public.matches drop constraint matches_result_source_check;
alter table public.matches add constraint matches_result_source_check
  check (result_source is null or result_source in ('CLIENT_SCREENSHOT','REPLAY_REVIEW','RIOT_API'));

create or replace function public.finish_riot_series(p_match_id bigint,p_winner text,p_games jsonb,p_players jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; updated_games integer;
begin
  if jsonb_typeof(p_games) is distinct from 'array' then raise exception 'INVALID_RIOT_GAMES'; end if;
  if jsonb_array_length(p_games) not in (2,3)
    or exists(select 1 from jsonb_array_elements(p_games) g where coalesce(g->>'riot_match_id','') !~ '^KR_[1-9][0-9]{0,19}$')
    or (select count(distinct g->>'riot_match_id') from jsonb_array_elements(p_games) g) <> jsonb_array_length(p_games)
  then raise exception 'INVALID_RIOT_GAMES'; end if;

  result := public.finish_replay_series(p_match_id,p_winner,p_games,p_players);
  -- A conflict here rolls back the entire call, including the earlier rating
  -- updates and match status. Never split these writes into separate requests.
  update public.replay_games r set riot_match_id=g->>'riot_match_id'
  from jsonb_array_elements(p_games) g
  where r.match_id=p_match_id and r.game_number=(g->>'game_number')::integer;
  get diagnostics updated_games = row_count;
  if updated_games <> jsonb_array_length(p_games) then raise exception 'INVALID_RIOT_GAME_NUMBERS'; end if;
  update public.matches set result_source='RIOT_API' where id=p_match_id;
  return result;
end; $$;
revoke all on function public.finish_riot_series(bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_riot_series(bigint,text,jsonb,jsonb) to service_role;
