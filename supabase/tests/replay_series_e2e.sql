begin;
do $$
declare
  ids uuid[] := array[]::uuid[]; u uuid; mid bigint; mid2 bigint; i integer;
  positions text[] := array['TOP','JUNGLE','MID','ADC','SUPPORT'];
  games jsonb; rated jsonb; result jsonb; count_games bigint; count_wins bigint;
begin
  for i in 1..11 loop
    u := gen_random_uuid(); ids := array_append(ids,u);
    insert into auth.users(id,aud,role,email,created_at,updated_at) values(u,'authenticated','authenticated',u||'@example.invalid',now(),now());
    insert into public.member_sheet(real_name,birth_date,lol_nickname) values('Replay '||u,'2000-01-01','Replay'||u||'#TEST');
    insert into public.profiles(user_id,username,lol_nickname,real_name,birth_date,main_position,role,status)
      values(u,'replay_'||u,'Replay'||u||'#TEST','Replay '||u,'2000-01-01',positions[(i-1)%5+1],'member','approved');
  end loop;
  insert into public.matches(status) values('matched') returning id into mid;
  for i in 1..10 loop
    insert into public.match_players(match_id,user_id,team,position,overall_rating_before,position_rating_before)
    values(mid,ids[i],case when i<=5 then 'BLUE' else 'RED' end,positions[(i-1)%5+1],1000,1000);
  end loop;
  -- The first blue TOP appears once; substitute appears twice.
  select jsonb_agg(jsonb_build_object('user_id',case when n=1 then ids[11] else ids[n] end,
    'team',case when n<=5 then 'BLUE' else 'RED' end,'appearances',case when n=1 then 2 else 3 end))
    into rated from generate_series(1,10)n;
  select jsonb_agg(jsonb_build_object('game_number',g,'winner',case when g=1 then 'BLUE' else 'RED' end,
    'outcome',case when g=1 then 'victory' else 'defeat' end,'hash',md5(mid||':'||g)||md5(mid||':'||g),'patch','test',
    'kda',(select jsonb_agg(jsonb_build_object('user_id',case when n=1 and g>1 then ids[11] else ids[n] end,
      'team',case when n<=5 then 'BLUE' else 'RED' end,'position',positions[(n-1)%5+1],
      'riotName','Replay','champion_key','Ahri','champion_name','아리','icon_version','16.19.1','kills',4,'deaths',2,'assists',6)) from generate_series(1,10)n)))
    into games from generate_series(1,3)g;
  result := public.finish_replay_series(mid,'RED',games,rated);
  if (select count(*) from public.replay_participants p join public.replay_games g on g.id=p.game_id where g.match_id=mid)<>30 then raise exception 'missing participants'; end if;
  if (select games_played from public.player_ratings where user_id=ids[1])<>0 then raise exception 'one set player rated'; end if;
  if (select games_played from public.player_ratings where user_id=ids[11])<>1 then raise exception 'substitute not rated'; end if;
  select c.games,c.wins into count_games,count_wins from public.get_most_champions(array[ids[1]]) c;
  if count_games is distinct from 1::bigint or count_wins is distinct from 1::bigint then raise exception 'one set champion record lost'; end if;
  select c.games,c.wins into count_games,count_wins from public.get_most_champions(array[ids[2]]) c;
  if count_games is distinct from 3::bigint or count_wins is distinct from 1::bigint then raise exception 'champions used series win instead of set win'; end if;
  begin
    perform public.finish_replay_series(mid,'RED',games,rated);
    raise exception 'duplicate was accepted';
  exception when raise_exception then
    if SQLERRM <> 'MATCH_NOT_ACTIVE' then raise; end if;
  end;
  insert into public.matches(status) values('matched') returning id into mid2;
  insert into public.match_players(match_id,user_id,team,position,overall_rating_before,position_rating_before)
    select mid2,user_id,team,position,1000,1000 from public.match_players where match_id=mid;
  begin
    perform public.finish_replay_series(mid2,'RED',games,rated);
    raise exception 'duplicate hash accepted';
  exception when unique_violation then null;
  end;
  if (select status from public.matches where id=mid2)<>'matched' then raise exception 'failed save did not rollback'; end if;
  if (select games_played from public.player_ratings where user_id=ids[2])<>1 then raise exception 'failed save changed ratings'; end if;
end $$;
rollback;
select 'passed: 30 set records, substitution, champion set wins, duplicate rejection, atomic rollback; no test data retained' as result;
