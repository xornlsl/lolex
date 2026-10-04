create or replace function public.run_lolex_series_substitution_test()
returns jsonb language plpgsql set search_path = '' as $$
declare
  u uuid; i integer; positions text[] := array['TOP','JUNGLE','MID','ADC','SUPPORT'];
  matchmaking_result jsonb; finish_result jsonb; match_id_value bigint;
  removed_user uuid; replacement_user uuid; removed_team text; removed_position text;
  games jsonb; eligible_players jsonb; test_result jsonb;
begin
 begin
  for i in 1..10 loop
   u := gen_random_uuid();
   insert into auth.users(id,aud,role,email,created_at,updated_at)
    values(u,'authenticated','authenticated','series-'||u||'@example.invalid',now(),now());
   insert into public.member_sheet(real_name,birth_date,lol_nickname)
    values('Series Test '||i||' '||u,'2000-01-01','Series'||i||'#TEST');
   insert into public.profiles(user_id,username,lol_nickname,real_name,birth_date,main_position,sub_position,role,status,initial_internal_score)
    values(u,'series_'||replace(u::text,'-',''),'Series'||i||'#TEST','Series Test '||i||' '||u,'2000-01-01',positions[((i-1)%5)+1],positions[(i%5)+1],'member','approved',0);
   insert into public.match_queue(user_id,primary_position,secondary_position,joined_at)
    values(u,positions[((i-1)%5)+1],positions[(i%5)+1],now()+(i||' ms')::interval);
  end loop;

  matchmaking_result := public.run_auto_matchmaking();
  match_id_value := (matchmaking_result->>'match_id')::bigint;
  select user_id,team,position into removed_user,removed_team,removed_position
   from public.match_players where match_id=match_id_value order by id limit 1;

  replacement_user := gen_random_uuid();
  insert into auth.users(id,aud,role,email,created_at,updated_at)
   values(replacement_user,'authenticated','authenticated','sub-'||replacement_user||'@example.invalid',now(),now());
  insert into public.member_sheet(real_name,birth_date,lol_nickname)
   values('Replacement Test '||replacement_user,'2000-01-01','Replacement#TEST');
  insert into public.profiles(user_id,username,lol_nickname,real_name,birth_date,main_position,role,status,initial_internal_score)
   values(replacement_user,'sub_'||replace(replacement_user::text,'-',''),'Replacement#TEST','Replacement Test '||replacement_user,'2000-01-01',removed_position,'member','approved',0);

  select jsonb_agg(jsonb_build_object('user_id',r.user_id,'team',r.team,'appearances',case when r.user_id=replacement_user then 2 else 3 end))
   into eligible_players from (
    select mp.user_id,mp.team from public.match_players mp where mp.match_id=match_id_value and mp.user_id<>removed_user
    union all select replacement_user,removed_team
   ) r;
  select jsonb_agg(jsonb_build_object('game_number',g,'outcome',case when g=1 then 'victory' else 'defeat' end,
    'kda',(select jsonb_agg(jsonb_build_object('kills',n,'deaths',2,'assists',5)) from generate_series(1,10)n)) order by g)
   into games from generate_series(1,3)g;

  finish_result := public.finish_match_series_with_players(match_id_value,
   case when removed_team='BLUE' then 'RED' else 'BLUE' end,removed_team,games,eligible_players);
  if not coalesce((finish_result->>'success')::boolean,false) then raise exception 'series completion failed: %',finish_result; end if;
  if (select games_played from public.player_ratings where user_id=removed_user)<>0 then raise exception 'one-game player received a series result'; end if;
  if (select games_played from public.player_ratings where user_id=replacement_user)<>1 then raise exception 'two-game replacement did not receive a series result'; end if;
  if exists(select 1 from public.match_players where match_id=match_id_value and user_id=removed_user) then raise exception 'one-game player remained in roster'; end if;
  if not exists(select 1 from public.match_players where match_id=match_id_value and user_id=replacement_user and position=removed_position and team=removed_team) then raise exception 'replacement inheritance failed'; end if;

  test_result := jsonb_build_object('success',true,'series','1-2','rated_players',10,'one_game_player_games',0,
   'replacement_games',1,'replacement_position',removed_position,'substitution_count',finish_result->'substitution_count','rolled_back',true);
  raise exception using errcode='P0002',message='rollback';
 exception when sqlstate 'P0002' then return test_result; end;
end; $$;
