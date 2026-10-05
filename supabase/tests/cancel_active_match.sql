-- Temporary fixtures only; existing matches are never modified. Everything rolls back.
begin;
select pg_advisory_xact_lock(20260929);
do $$
declare
  target_id bigint; other_id bigint; uid uuid; actor uuid; outsider uuid;
  result jsonb; before_state jsonb; after_state jsonb;
  target_users uuid[] := '{}';
  positions text[] := array['TOP','JUNGLE','MID','ADC','SUPPORT'];
  nickname text; i integer;
begin
  insert into public.matches(status) values('matched') returning id into target_id;
  insert into public.matches(status) values('matched') returning id into other_id;
  for i in 1..21 loop
    uid := gen_random_uuid();
    nickname := 'CancelTest'||i||'#'||substr(uid::text,1,4);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(uid,'authenticated','authenticated','cancel-test-'||uid||'@example.invalid','test-only',now(),'{}','{}',now(),now());
    insert into public.member_sheet(real_name,birth_date,lol_nickname)
    values('CancelTest'||uid,'2000-01-01',nickname);
    insert into public.profiles(user_id,username,lol_nickname,real_name,birth_date,main_position,sub_position,role,status,initial_internal_score)
    values(uid,'cancel_'||replace(uid::text,'-',''),nickname,'CancelTest'||uid,'2000-01-01',positions[((i-1)%5)+1],positions[(i%5)+1],'member','approved',0);
    if i<=20 then
      insert into public.match_players(match_id,user_id,team,position,overall_rating_before,position_rating_before)
      values(case when i<=10 then target_id else other_id end,uid,case when (i-1)%10<5 then 'BLUE' else 'RED' end,positions[((i-1)%5)+1],1000,1000);
    end if;
    if i<=10 then target_users:=array_append(target_users,uid); end if;
    if i=1 then actor:=uid; end if;
    if i=11 then outsider:=uid; end if;
    -- Target stale entries + one unrelated waiting user must be treated separately.
    if i<=10 or i=21 then
      insert into public.match_queue(user_id,primary_position,secondary_position)
      values(uid,positions[((i-1)%5)+1],positions[(i%5)+1]);
    end if;
  end loop;
  select jsonb_build_object(
    'matches',(select jsonb_agg(to_jsonb(m) order by id) from public.matches m where id<>target_id),
    'players',(select jsonb_agg(to_jsonb(p) order by id) from public.match_players p),
    'queue',(select jsonb_agg(to_jsonb(q) order by id) from public.match_queue q where not(user_id=any(target_users))),
    'ratings',(select jsonb_agg(to_jsonb(r) order by user_id) from public.player_ratings r),
    'history',(select jsonb_agg(to_jsonb(r) order by id) from public.rating_history r)
  ) into before_state;
  result:=public.cancel_active_match(target_id,outsider);
  if result->>'success' is distinct from 'false' then raise exception 'Nonparticipant allowed'; end if;
  result:=public.cancel_active_match(target_id,null);
  if result->>'success' is distinct from 'false' then raise exception 'Anonymous allowed'; end if;

  update public.matches set status='finished',winner='BLUE' where id=target_id;
  result:=public.cancel_active_match(target_id,actor);
  if result->>'success' is distinct from 'false' then raise exception 'Finished match allowed'; end if;
  update public.matches set status='matched',winner=null where id=target_id;

  result:=public.cancel_active_match(target_id,actor);
  if result->>'success' is distinct from 'true' then raise exception 'Cancellation failed: %',result; end if;
  if not exists(select 1 from public.matches where id=target_id and status='cancelled')
     or exists(select 1 from public.match_queue where user_id=any(target_users))
     or exists(select 1 from public.match_players p join public.matches m on m.id=p.match_id
       where p.user_id=any(target_users) and m.status in ('matched','position_discussion','in_progress')) then
    raise exception 'Target participants not released';
  end if;
  result:=public.cancel_active_match(target_id,actor);
  if result->>'success' is distinct from 'false' then raise exception 'Repeated cancellation allowed'; end if;
  select jsonb_build_object(
    'matches',(select jsonb_agg(to_jsonb(m) order by id) from public.matches m where id<>target_id),
    'players',(select jsonb_agg(to_jsonb(p) order by id) from public.match_players p),
    'queue',(select jsonb_agg(to_jsonb(q) order by id) from public.match_queue q where not(user_id=any(target_users))),
    'ratings',(select jsonb_agg(to_jsonb(r) order by user_id) from public.player_ratings r),
    'history',(select jsonb_agg(to_jsonb(r) order by id) from public.rating_history r)
  ) into after_state;
  if before_state is distinct from after_state then raise exception 'Unrelated data changed'; end if;
  if has_function_privilege('anon','public.cancel_active_match(bigint,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.cancel_active_match(bigint,uuid)','EXECUTE') then
    raise exception 'Unsafe function grants';
  end if;
end $$;
rollback;
select 'PASS: 10 released; other match, waiting user and ratings unchanged; unauthorized, finished and repeated requests rejected; fixtures rolled back' as result;
