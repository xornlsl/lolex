-- Run after 202610060003 on a database with the existing LOLEX schema.
-- All fixtures are rolled back. No production match is finalized by this test.
begin;
do $$
declare
  ids uuid[] := array[]::uuid[]; u uuid; mid bigint; mid2 bigint; i integer;
  positions text[] := array['TOP','JUNGLE','MID','ADC','SUPPORT'];
  games jsonb; duplicate_games jsonb; rated jsonb; result jsonb;
  roster_before jsonb; ratings_before jsonb; history_before bigint;
  champion_games bigint; champion_wins bigint;
begin
  for i in 1..10 loop
    u := gen_random_uuid(); ids := array_append(ids,u);
    insert into auth.users(id,aud,role,email,created_at,updated_at)
      values(u,'authenticated','authenticated',u||'@example.invalid',now(),now());
    insert into public.member_sheet(real_name,birth_date,lol_nickname)
      values('Riot test '||u,'2000-01-01','Riot'||u||'#TEST');
    insert into public.profiles(user_id,username,lol_nickname,real_name,birth_date,main_position,role,status)
      values(u,'riot_'||u,'Riot'||u||'#TEST','Riot test '||u,'2000-01-01',positions[(i-1)%5+1],'member','approved');
  end loop;
  insert into public.matches(status) values('matched') returning id into mid;
  for i in 1..10 loop
    insert into public.match_players(match_id,user_id,team,position,overall_rating_before,position_rating_before)
      values(mid,ids[i],case when i<=5 then 'BLUE' else 'RED' end,positions[(i-1)%5+1],1000,1000);
  end loop;
  select jsonb_agg(jsonb_build_array(user_id,team,position) order by user_id)
    into roster_before from public.match_players where match_id=mid;
  select jsonb_agg(jsonb_build_object('user_id',ids[n],'team',case when n<=5 then 'BLUE' else 'RED' end,'appearances',3))
    into rated from generate_series(1,10)n;
  select jsonb_agg(jsonb_build_object('game_number',g,'riot_match_id','KR_'||(8000000000000000000::bigint+mid*10+g),
    'winner',case when g=1 then 'BLUE' else 'RED' end,'outcome',case when g=1 then 'victory' else 'defeat' end,
    'hash',md5(mid||':riot:'||g)||md5(mid||':riot:'||g),'patch','test',
    'kda',(select jsonb_agg(jsonb_build_object('user_id',ids[n],'team',case when n<=5 then 'BLUE' else 'RED' end,
      'position',positions[(n-1)%5+1],'riotName','Riot'||ids[n]||'#TEST','champion_key','Ahri',
      'champion_name','아리','icon_version','16.19.1','kills',4,'deaths',2,'assists',6)) from generate_series(1,10)n)) order by g)
    into games from generate_series(1,3)g;

  result := public.finish_riot_series(mid,'RED',games,rated);
  if not coalesce((result->>'success')::boolean,false) then raise exception 'API save failed'; end if;
  if not exists(select 1 from public.matches where id=mid and status='finished' and winner='RED' and result_source='RIOT_API') then
    raise exception 'History status or provenance missing';
  end if;
  if (select jsonb_agg(jsonb_build_array(user_id,team,position) order by user_id) from public.match_players where match_id=mid) is distinct from roster_before then
    raise exception 'Members, teams or agreed positions changed';
  end if;
  if (select count(*) from public.replay_games where match_id=mid and riot_match_id is not null)<>3 then raise exception 'Game IDs missing'; end if;
  if (select count(*) from public.replay_participants p join public.replay_games g on g.id=p.game_id where g.match_id=mid)<>30 then raise exception 'History set records missing'; end if;
  select c.games,c.wins into champion_games,champion_wins from public.get_most_champions(array[ids[1]]) c;
  if champion_games is distinct from 3::bigint or champion_wins is distinct from 1::bigint then raise exception 'Most champions no longer counts per-set wins'; end if;
  if (select count(*) from public.player_ratings where user_id=any(ids) and games_played=1)<>10 then raise exception 'Series ratings were not applied exactly once'; end if;
  if (select count(*) from public.rating_history where match_id=mid)<>20 then raise exception 'Overall and position history missing'; end if;

  select jsonb_agg(to_jsonb(r) order by user_id) into ratings_before from public.player_ratings r where user_id=any(ids);
  select count(*) into history_before from public.rating_history where match_id=mid;
  begin
    perform public.finish_riot_series(mid,'RED',games,rated);
    raise exception 'Repeated confirmation accepted';
  exception when raise_exception then
    if sqlerrm <> 'MATCH_NOT_ACTIVE' then raise; end if;
  end;
  insert into public.matches(status) values('matched') returning id into mid2;
  insert into public.match_players(match_id,user_id,team,position,overall_rating_before,position_rating_before)
    select mid2,user_id,team,position,1000,1000 from public.match_players where match_id=mid;
  -- Different hashes force the conflict to come from the Riot ID uniqueness,
  -- after finish_replay_series has written ratings. The entire call must roll back.
  select jsonb_agg(g || jsonb_build_object('hash',md5(mid2||':'||(g->>'game_number'))||md5(mid2||':'||(g->>'game_number'))) order by (g->>'game_number')::integer)
    into duplicate_games from jsonb_array_elements(games) g;
  begin
    perform public.finish_riot_series(mid2,'RED',duplicate_games,rated);
    raise exception 'Duplicate Riot game IDs accepted';
  exception when unique_violation then null;
  end;
  if (select status from public.matches where id=mid2)<>'matched' or exists(select 1 from public.replay_games where match_id=mid2) then raise exception 'Duplicate save left partial results'; end if;
  if (select jsonb_agg(to_jsonb(r) order by user_id) from public.player_ratings r where user_id=any(ids)) is distinct from ratings_before then raise exception 'Failed save changed ratings'; end if;
  if (select count(*) from public.rating_history where match_id in (mid,mid2))<>history_before then raise exception 'Failed save left rating history'; end if;
end $$;
rollback;
select 'passed: API history, most champions, ratings, roster preservation and atomic duplicate rejection' as result;
