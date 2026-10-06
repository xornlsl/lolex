-- Service-only, one-use roster for an explicitly requested test match.
create table public.test_match_roster (
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 team text not null check(team in ('BLUE','RED')),
 position text not null check(position in ('TOP','JUNGLE','MID','ADC','SUPPORT')),
 expires_at timestamptz not null default now() + interval '7 days',
 unique(team,position)
);
alter table public.test_match_roster enable row level security;
revoke all on public.test_match_roster from public, anon, authenticated;
grant all on public.test_match_roster to service_role;
create function public.apply_test_match_roster() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.status <> 'matched' or old.status <> 'position_discussion' then return new; end if;
 perform pg_advisory_xact_lock(20260929);
 if (select count(*) from public.test_match_roster where expires_at > now()) <> 10
 or (select count(*) from public.match_players where match_id=new.id) <> 10
 or exists(select 1 from public.match_players mp where mp.match_id=new.id and not exists(
 select 1 from public.test_match_roster t where t.user_id=mp.user_id and t.position=mp.position and t.expires_at>now()))
 then return new; end if;
 -- Clear both sides first to avoid transient unique(team, position) conflicts.
 update public.match_players set team=null where match_id=new.id;
 update public.match_players mp set team=t.team
 from public.test_match_roster t where mp.match_id=new.id and mp.user_id=t.user_id;
 delete from public.test_match_roster;
 return new;
end $$;
revoke all on function public.apply_test_match_roster() from public, anon, authenticated;
create trigger apply_requested_test_roster after update of status on public.matches
for each row execute function public.apply_test_match_roster();
;
