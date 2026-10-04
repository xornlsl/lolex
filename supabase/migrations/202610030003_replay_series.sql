create table public.replay_games (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  game_number integer not null check(game_number between 1 and 3),
  file_hash text not null unique check(file_hash ~ '^[a-f0-9]{64}$'),
  winner text not null check(winner in ('BLUE','RED')),
  patch text not null,
  unique(match_id,game_number)
);
create table public.replay_participants (
  game_id bigint not null references public.replay_games(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id),
  team text not null check(team in ('BLUE','RED')),
  position text not null check(position in ('TOP','JUNGLE','MID','ADC','SUPPORT')),
  played_riot_id text not null,
  champion_key text not null,
  champion_name text not null,
  icon_version text not null,
  kills integer not null check(kills between 0 and 999),
  deaths integer not null check(deaths between 0 and 999),
  assists integer not null check(assists between 0 and 999),
  primary key(game_id,user_id),
  unique(game_id,team,position)
);
create index replay_participants_user_idx on public.replay_participants(user_id);
alter table public.replay_games enable row level security;
alter table public.replay_participants enable row level security;
revoke all on public.replay_games,public.replay_participants from anon,authenticated;
grant all on public.replay_games,public.replay_participants to service_role;
grant usage,select on sequence public.replay_games_id_seq to service_role;
alter table public.matches drop constraint matches_result_source_check;
alter table public.matches add constraint matches_result_source_check check(result_source is null or result_source in ('CLIENT_SCREENSHOT','REPLAY_REVIEW'));

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
revoke all on function public.finish_replay_series(bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_replay_series(bigint,text,jsonb,jsonb) to service_role;

create or replace function public.get_most_champions(p_user_ids uuid[])
returns table(user_id uuid,champion_key text,champion_name text,icon_url text,games bigint,wins bigint,losses bigint,avg_kills numeric,avg_deaths numeric,avg_assists numeric,kda numeric,win_rate numeric)
language sql stable security definer set search_path='' as $$
with records as (
  select p.user_id,p.champion_key,p.champion_name,p.icon_version,p.kills,p.deaths,p.assists,p.team=g.winner won
  from public.replay_participants p join public.replay_games g on g.id=p.game_id
  join public.matches m on m.id=g.match_id where m.status='finished' and p.user_id=any(p_user_ids)
  union all
  select mp.user_id,s.champion_key,s.champion_name,s.icon_version,s.kills,s.deaths,s.assists,mp.team=m.winner
  from public.match_player_stats s join public.match_players mp on mp.id=s.match_player_id
  join public.matches m on m.id=mp.match_id
  where m.status='finished' and mp.user_id=any(p_user_ids)
    and not exists(select 1 from public.replay_games g where g.match_id=m.id)
), totals as (
  select r.user_id,r.champion_key,max(r.champion_name) champion_name,max(r.icon_version) icon_version,
    count(*) games,count(*) filter(where won) wins,
    round(avg(kills),1) avg_kills,round(avg(deaths),1) avg_deaths,round(avg(assists),1) avg_assists,
    round(sum(kills+assists)::numeric/nullif(sum(deaths),0),2) kda
  from records r group by r.user_id,r.champion_key
), ranked as (
  select *,row_number() over(partition by t.user_id order by t.games desc,t.wins desc,t.champion_key) rank from totals t
)
select r.user_id,r.champion_key,r.champion_name,
  'https://ddragon.leagueoflegends.com/cdn/'||r.icon_version||'/img/champion/'||r.champion_key||'.png',
  r.games,r.wins,r.games-r.wins,r.avg_kills,r.avg_deaths,r.avg_assists,r.kda,round(r.wins::numeric/r.games*100)
from ranked r where rank<=3 order by r.user_id,rank;
$$;
