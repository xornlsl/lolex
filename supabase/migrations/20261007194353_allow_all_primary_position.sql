alter table public.match_queue
  drop constraint match_queue_primary_position_check;

alter table public.match_queue
  add constraint match_queue_primary_position_check
  check (primary_position in ('ALL', 'TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'));

alter table public.match_players
  drop constraint match_players_requested_primary_position_check;

alter table public.match_players
  add constraint match_players_requested_primary_position_check
  check (
    requested_primary_position is null
    or requested_primary_position in ('ALL', 'TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT')
  );

create or replace function public.auto_assign_match_positions(p_match_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_count integer;
  v_assignment_count integer;
  v_secondary_count integer;
begin
  select count(*)
  into v_player_count
  from public.match_players
  where match_id = p_match_id;

  if v_player_count <> 10 then
    return jsonb_build_object(
      'success', false,
      'assignable', false,
      'message', '매치 참가자가 정확히 10명이 아닙니다.'
    );
  end if;

  if exists (
    select 1
    from public.match_players
    where match_id = p_match_id
      and (
        requested_primary_position is null
        or requested_secondary_position is null
      )
  ) then
    return jsonb_build_object(
      'success', false,
      'assignable', false,
      'message', '일부 참가자의 신청 포지션 정보가 없습니다.'
    );
  end if;

  create temporary table if not exists best_position_assignment (
    user_id uuid primary key,
    assigned_position text not null,
    used_secondary boolean not null
  ) on commit drop;

  truncate best_position_assignment;

  insert into best_position_assignment(user_id, assigned_position, used_secondary)
  with recursive players as (
    select
      mp.user_id,
      mp.requested_primary_position,
      mp.requested_secondary_position,
      row_number() over (order by mp.user_id)::integer as player_index
    from public.match_players mp
    where mp.match_id = p_match_id
  ),
  assignments as (
    select
      0 as player_index,
      array[]::uuid[] as user_ids,
      array[]::text[] as assigned_positions,
      0 as top_count,
      0 as jungle_count,
      0 as mid_count,
      0 as adc_count,
      0 as support_count,
      0 as secondary_count

    union all

    select
      p.player_index,
      a.user_ids || p.user_id,
      a.assigned_positions || choice.position,
      a.top_count + (choice.position = 'TOP')::integer,
      a.jungle_count + (choice.position = 'JUNGLE')::integer,
      a.mid_count + (choice.position = 'MID')::integer,
      a.adc_count + (choice.position = 'ADC')::integer,
      a.support_count + (choice.position = 'SUPPORT')::integer,
      a.secondary_count + (
        p.requested_primary_position <> 'ALL'
        and choice.position = p.requested_secondary_position
      )::integer
    from assignments a
    join players p on p.player_index = a.player_index + 1
    cross join lateral unnest(
      case
        when p.requested_primary_position = 'ALL'
          then array['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']::text[]
        else array[p.requested_primary_position, p.requested_secondary_position]::text[]
      end
    ) with ordinality as choice(position, preference_order)
    where case choice.position
      when 'TOP' then a.top_count < 2
      when 'JUNGLE' then a.jungle_count < 2
      when 'MID' then a.mid_count < 2
      when 'ADC' then a.adc_count < 2
      when 'SUPPORT' then a.support_count < 2
      else false
    end
  ),
  best as (
    select *
    from assignments
    where player_index = 10
      and top_count = 2
      and jungle_count = 2
      and mid_count = 2
      and adc_count = 2
      and support_count = 2
    order by secondary_count, assigned_positions::text
    limit 1
  )
  select
    best.user_ids[i],
    best.assigned_positions[i],
    best.assigned_positions[i] <> 'ALL'
      and p.requested_primary_position <> 'ALL'
      and best.assigned_positions[i] = p.requested_secondary_position
  from best
  cross join lateral generate_subscripts(best.user_ids, 1) as i
  join players p on p.user_id = best.user_ids[i];

  select count(*), count(*) filter (where used_secondary)
  into v_assignment_count, v_secondary_count
  from best_position_assignment;

  if v_assignment_count <> 10 then
    update public.match_players
    set team = null, position = null
    where match_id = p_match_id;

    update public.matches
    set status = 'position_discussion'
    where id = p_match_id;

    return jsonb_build_object(
      'success', true,
      'assignable', false,
      'status', 'position_discussion',
      'message', '포지션 협의가 필요합니다.'
    );
  end if;

  update public.match_players mp
  set position = a.assigned_position
  from best_position_assignment a
  where mp.match_id = p_match_id
    and mp.user_id = a.user_id;

  update public.match_players
  set team = null
  where match_id = p_match_id;

  return jsonb_build_object(
    'success', true,
    'assignable', true,
    'secondary_assignments', v_secondary_count,
    'message', '자동 포지션 배정이 가능합니다.'
  );
end;
$$;
