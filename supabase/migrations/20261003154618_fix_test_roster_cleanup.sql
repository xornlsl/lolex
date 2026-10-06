create or replace function public.apply_test_match_roster() returns trigger
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
 delete from public.test_match_roster t
 using public.match_players mp
 where mp.match_id=new.id and mp.user_id=t.user_id;
 return new;
end $$;;
