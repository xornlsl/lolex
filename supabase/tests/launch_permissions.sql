begin;
do $$
declare uid uuid; st text; nick text;
begin
  foreach st in array array['approved','pending','suspended'] loop
    uid:=gen_random_uuid(); nick:='Audit'||substr(uid::text,1,8)||'#TEST';
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(uid,'authenticated','authenticated','audit-'||uid||'@example.invalid','test-only',now(),'{}','{}',now(),now());
    insert into public.member_sheet(real_name,birth_date,lol_nickname) values('Audit'||uid,'2000-01-01',nick);
    insert into public.profiles(user_id,username,lol_nickname,real_name,birth_date,main_position,sub_position,role,status,initial_internal_score)
    values(uid,'audit_'||replace(uid::text,'-',''),nick,'Audit'||uid,'2000-01-01','TOP','MID','member',st,0);
    perform set_config('audit.'||st,uid::text,true);
  end loop;
end $$;
set local role authenticated;
do $$
declare st text; tbl text;
begin
  foreach st in array array['pending','suspended'] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('audit.'||st),'role','authenticated')::text,true);
    if exists(select 1 from public.player_ratings) or exists(select 1 from public.matches)
      or exists(select 1 from public.match_queue) or exists(select 1 from public.leagues)
      or exists(select 1 from public.member_sheet) then raise exception 'Unapproved access'; end if;
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('audit.approved'),'role','authenticated')::text,true);
  if not exists(select 1 from public.player_ratings) then raise exception 'Approved read broken'; end if;
  if (select count(*) from public.profiles)<>1 or exists(select 1 from public.member_sheet) then raise exception 'Other profiles or roster leaked'; end if;
  foreach tbl in array array['profiles','matches','match_queue','player_ratings','league_registrations'] loop
    if has_table_privilege('authenticated','public.'||tbl,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Direct writes allowed: %',tbl; end if;
  end loop;
  if has_function_privilege('authenticated','public.finish_match(bigint,text)','EXECUTE')
    or has_function_privilege('authenticated','public.get_public_members()','EXECUTE') then raise exception 'Internal RPC exposed'; end if;
end $$;
set local role anon;
do $$
begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  if exists(select 1 from public.profiles) or exists(select 1 from public.player_ratings) then raise exception 'Anonymous read'; end if;
end $$;
rollback;
select 'PASS: pending/suspended denied; approved reads work; other profiles/roster hidden; writes and internal RPC denied; fixtures rolled back' as result;
