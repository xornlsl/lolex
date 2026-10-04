-- All fixture changes are rolled back. Requires existing approved roles.
begin;
select set_config('lolex.test.member', (select user_id::text from public.profiles where role='member' and status='approved' limit 1), true);
select set_config('lolex.test.staff', (select user_id::text from public.profiles where role='staff' and status='approved' limit 1), true);
select set_config('lolex.test.superadmin', (select user_id::text from public.profiles where role='superadmin' and status='approved' limit 1), true);
insert into public.member_sheet(real_name,birth_date,lol_nickname)
values ('권한확인용-롤백','2000-02-29','권한확인용-롤백#TEST');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('lolex.test.member'))::text,true);
select set_config('request.jwt.claim.sub',current_setting('lolex.test.member'),true);
do $$ declare blocked boolean := false; begin
  if exists(select 1 from public.member_sheet) then raise exception 'MEMBER roster read was not blocked'; end if;
  begin
    insert into public.member_sheet(real_name,birth_date,lol_nickname) values ('차단확인','2000-01-01','차단확인#TEST');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'MEMBER roster write was not blocked'; end if;
  blocked := false;
  begin
    update public.profiles set role='superadmin' where user_id=auth.uid();
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'MEMBER self-promotion was not blocked'; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('lolex.test.staff'))::text,true);
select set_config('request.jwt.claim.sub',current_setting('lolex.test.staff'),true);
do $$ begin
  if not exists(select 1 from public.member_sheet where lol_nickname='권한확인용-롤백#TEST') then raise exception 'STAFF roster read failed'; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('lolex.test.superadmin'))::text,true);
select set_config('request.jwt.claim.sub',current_setting('lolex.test.superadmin'),true);
do $$ begin
  if not exists(select 1 from public.member_sheet where lol_nickname='권한확인용-롤백#TEST') then raise exception 'SUPERADMIN roster read failed'; end if;
end $$;

reset role;
set local role anon;
do $$ declare blocked boolean := false; begin
  begin perform 1 from public.member_sheet;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous roster read was not blocked'; end if;
end $$;
rollback;
