-- LOLEX writes go through authenticated Edge Functions; RLS remains defense in depth.
revoke execute on function public.create_initial_player_rating(), public.rls_auto_enable(), public.get_public_members()
  from public, anon, authenticated;
grant execute on function public.get_public_members() to service_role;

revoke insert, update, delete, truncate, references, trigger on
  public.profiles, public.player_ratings, public.rating_history, public.matches,
  public.match_players, public.match_queue, public.leagues, public.league_registrations,
  public.member_sheet, public.profile_aliases, public.match_player_stats,
  public.replay_games, public.replay_participants, public.test_match_roster
  from anon, authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array['leagues','player_ratings','rating_history','matches','match_players','match_queue','league_registrations'] loop
    execute format('create policy "Approved membership required" on public.%I as restrictive for select to authenticated using (exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.status=''approved''))',tbl);
  end loop;
end $$;
;
