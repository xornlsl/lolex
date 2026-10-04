create table public.match_player_stats (
  match_player_id bigint primary key references public.match_players(id) on delete cascade,
  played_riot_id text not null,
  champion_key text not null check(champion_key ~ '^[A-Za-z0-9]+$'),
  champion_name text not null check(char_length(champion_name) between 1 and 80),
  icon_version text not null check(icon_version ~ '^\d+\.\d+\.\d+$'),
  kills integer not null check(kills >= 0),
  deaths integer not null check(deaths >= 0),
  assists integer not null check(assists >= 0),
  created_at timestamptz not null default now()
);
alter table public.match_player_stats enable row level security;
revoke all on public.match_player_stats from anon, authenticated;
grant select on public.match_player_stats to authenticated;
grant all on public.match_player_stats to service_role;
create policy "Approved members read confirmed champion stats" on public.match_player_stats for select to authenticated using (
  exists(select 1 from public.profiles where user_id=(select auth.uid()) and status='approved')
  and exists(select 1 from public.match_players mp join public.matches m on m.id=mp.match_id where mp.id=match_player_id and m.status='finished')
);
create or replace function public.get_most_champions(p_user_ids uuid[])
returns table(user_id uuid,champion_key text,champion_name text,icon_url text,games bigint,wins bigint,losses bigint,avg_kills numeric,avg_deaths numeric,avg_assists numeric,kda numeric,win_rate numeric)
language sql stable security definer set search_path='' as $$
  with totals as (
    select mp.user_id,s.champion_key,max(s.champion_name) as champion_name,
      (array_agg(s.icon_version order by s.created_at desc))[1] as icon_version,
      count(*) as games,count(*) filter(where mp.team=m.winner) as wins,
      sum(s.kills) as kills,sum(s.deaths) as deaths,sum(s.assists) as assists,
      round(avg(s.kills),1) as avg_kills,round(avg(s.deaths),1) as avg_deaths,round(avg(s.assists),1) as avg_assists
    from public.match_player_stats s
    join public.match_players mp on mp.id=s.match_player_id
    join public.matches m on m.id=mp.match_id
    where mp.user_id=any(p_user_ids) and m.status='finished' and m.winner in ('BLUE','RED') and mp.team in ('BLUE','RED')
    group by mp.user_id,s.champion_key
  ), ranked as (
    select *,row_number() over(partition by user_id order by games desc,wins desc,champion_key) as rank from totals
  )
  select user_id,champion_key,champion_name,
    'https://ddragon.leagueoflegends.com/cdn/' || icon_version || '/img/champion/' || champion_key || '.png',
    games,wins,games-wins,avg_kills,avg_deaths,avg_assists,
    round((kills+assists)::numeric/nullif(deaths,0),2),round(wins::numeric/games*100)
  from ranked where rank<=3 order by user_id,rank;
$$;
revoke all on function public.get_most_champions(uuid[]) from public,anon,authenticated;
grant execute on function public.get_most_champions(uuid[]) to service_role;
