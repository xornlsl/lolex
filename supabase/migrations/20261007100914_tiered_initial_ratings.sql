create or replace function public.initial_rating_for_internal_score(p_score integer)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_score = 0 then 1000
    when p_score between 1 and 15 then 1200
    when p_score between 16 and 25 then 1500
    when p_score between 26 and 35 then 1800
    when p_score between 36 and 50 then 2000
  end
$$;

revoke all on function public.initial_rating_for_internal_score(integer) from public, anon, authenticated;
grant execute on function public.initial_rating_for_internal_score(integer) to service_role;

create or replace function public.create_initial_player_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare initial_rating integer := public.initial_rating_for_internal_score(new.initial_internal_score);
begin
  insert into public.player_ratings(
    user_id, overall_rating, top_rating, jungle_rating, mid_rating, adc_rating, support_rating,
    games_played, wins, losses
  ) values (
    new.user_id, initial_rating, initial_rating, initial_rating, initial_rating, initial_rating, initial_rating,
    0, 0, 0
  ) on conflict(user_id) do nothing;
  return new;
end;
$$;

-- Move every current rating to its new tier while retaining the exact rating
-- delta earned or lost since signup. Example: score 20, old 1200 + one win 20
-- becomes new 1500 + 20 = 1520. Historical match rows remain unchanged.
with rating_bases as (
  select
    p.user_id,
    1000 + p.initial_internal_score * 10 as old_base,
    public.initial_rating_for_internal_score(p.initial_internal_score) as new_base
  from public.profiles p
)
update public.player_ratings r
set
  overall_rating = b.new_base + (r.overall_rating - b.old_base),
  top_rating = b.new_base + (r.top_rating - b.old_base),
  jungle_rating = b.new_base + (r.jungle_rating - b.old_base),
  mid_rating = b.new_base + (r.mid_rating - b.old_base),
  adc_rating = b.new_base + (r.adc_rating - b.old_base),
  support_rating = b.new_base + (r.support_rating - b.old_base),
  updated_at = now()
from rating_bases b
where b.user_id = r.user_id;

-- Preserve the same deltas in any match snapshot that is still active when the
-- migration runs, so future rating changes use the new scale consistently.
with rating_bases as (
  select
    p.user_id,
    1000 + p.initial_internal_score * 10 as old_base,
    public.initial_rating_for_internal_score(p.initial_internal_score) as new_base
  from public.profiles p
)
update public.match_players mp
set
  overall_rating_before = b.new_base + (mp.overall_rating_before - b.old_base),
  position_rating_before = b.new_base + (mp.position_rating_before - b.old_base)
from rating_bases b, public.matches m
where b.user_id = mp.user_id
  and m.id = mp.match_id
  and m.status in ('position_discussion', 'matched', 'in_progress');
