-- All test identities and records are rolled back automatically.
begin;
do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
  name_a text:='검증-'||a; name_c text:='검증-'||c; name_d text:='검증-'||d;
  riot_a text:='검증-'||a||'#KR1'; riot_b text:='검증-'||b||'#KR1'; riot_c text:='검증-'||c||'#KR1'; alias_a text:='부계-'||a||'#KR1';
  sa uuid; sb uuid; sc uuid; sd uuid; blocked boolean; mid bigint; mpid bigint; result record;
begin
  insert into auth.users(id) values(a),(b),(c),(d);
  insert into public.member_sheet(real_name,birth_date,lol_nickname) values(name_a,'2000-01-01',riot_a) returning id into sa;
  insert into public.member_sheet(real_name,birth_date,lol_nickname) values(name_a,'2001-01-01',riot_b) returning id into sb;
  insert into public.profiles(user_id,username,real_name,birth_date,lol_nickname,main_position,initial_internal_score)
    values(a,a::text,name_a,'2000-01-01',riot_a,'TOP',32),(b,b::text,name_a,'2001-01-01',riot_b,'MID',0);
  if exists(select 1 from public.player_ratings where user_id=a and
      (overall_rating<>1320 or top_rating<>1320 or jungle_rating<>1320 or mid_rating<>1320 or adc_rating<>1320 or support_rating<>1320)) then
    raise exception 'Score 32 did not initialize all six ratings to 1320';
  end if;
  if not exists(select 1 from public.player_ratings where user_id=b and overall_rating=1000 and support_rating=1000) then raise exception 'Score zero failed'; end if;

  blocked:=false;
  begin
    insert into public.profiles(user_id,username,real_name,birth_date,lol_nickname,main_position) values(d,d::text,name_d,'2000-01-01','미등록#TEST','TOP');
  exception when raise_exception then blocked:=sqlerrm='시트 명단의 정보와 일치하지 않습니다. 관리자에게 확인해주세요.'; end;
  if not blocked then raise exception 'Unknown identity was accepted'; end if;

  update public.profiles set status='approved' where user_id=a;
  blocked:=false;
  begin update public.profiles set status='approved' where user_id=b;
  exception when raise_exception then blocked:=sqlerrm='이미 가입된 정보가 있습니다.'; end;
  if not blocked then raise exception 'Same-name approval was accepted'; end if;
  blocked:=false;
  begin insert into public.profiles(user_id,username,real_name,birth_date,lol_nickname,main_position) values(d,d::text,name_a,'2001-01-01',riot_b,'TOP');
  exception when raise_exception then blocked:=sqlerrm='이미 가입된 정보가 있습니다.'; end;
  if not blocked then raise exception 'Same-name signup was accepted'; end if;

  insert into public.profile_aliases(user_id,lol_nickname) values(a,alias_a);
  blocked:=false;
  begin insert into public.profile_aliases(user_id,lol_nickname) values(a,lower(alias_a));
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Duplicate alias was accepted'; end if;
  blocked:=false;
  begin insert into public.profile_aliases(user_id,lol_nickname) values(a,riot_a);
  exception when raise_exception then blocked:=sqlerrm='이미 등록된 롤 계정입니다.'; end;
  if not blocked then raise exception 'Primary Riot ID was accepted as an alias'; end if;

  insert into public.member_sheet(real_name,birth_date,lol_nickname) values(name_c,'2000-01-01',alias_a) returning id into sc;
  blocked:=false;
  begin insert into public.profiles(user_id,username,real_name,birth_date,lol_nickname,main_position) values(c,c::text,name_c,'2000-01-01',alias_a,'TOP');
  exception when raise_exception then blocked:=sqlerrm='이미 등록된 롤 계정입니다.'; end;
  if not blocked then raise exception 'Alias was reused to create another account'; end if;
  update public.member_sheet set lol_nickname=riot_c where id=sc;
  insert into public.profiles(user_id,username,real_name,birth_date,lol_nickname,main_position,initial_internal_score)
    values(c,c::text,name_c,'2000-01-01',riot_c,'TOP',50);
  if not exists(select 1 from public.player_ratings where user_id=c and overall_rating=1500 and top_rating=1500 and jungle_rating=1500 and mid_rating=1500 and adc_rating=1500 and support_rating=1500) then raise exception 'Score 50 failed'; end if;
  insert into public.member_sheet(real_name,birth_date,lol_nickname) values(name_d,'2000-01-01',d::text||'#KR1') returning id into sd;
  blocked:=false;
  begin insert into public.profiles(user_id,username,real_name,birth_date,lol_nickname,main_position,initial_internal_score)
    values(d,d::text,name_d,'2000-01-01',d::text||'#KR1','TOP',51);
  exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Score above 50 accepted'; end if;

  delete from public.member_sheet where id=sa;
  if not exists(select 1 from public.profiles where user_id=a and member_sheet_id is null and status='approved') then raise exception 'Roster deletion changed existing account'; end if;

  for i in 1..6 loop
    insert into public.matches(status,winner) values(case when i=6 then 'matched' else 'finished' end,case when i=2 then 'RED' else 'BLUE' end) returning id into mid;
    insert into public.match_players(match_id,user_id,team,position,overall_rating_before,position_rating_before)
      values(mid,a,'BLUE','TOP',1320,1320) returning id into mpid;
    insert into public.match_player_stats(match_player_id,played_riot_id,champion_key,champion_name,icon_version,kills,deaths,assists)
      values(mpid,case when i=2 then alias_a else riot_a end,
        case when i in(1,2,6) then 'Ahri' when i=3 then 'Garen' when i=4 then 'Lux' else 'Zed' end,
        case when i in(1,2,6) then '아리' when i=3 then '가렌' when i=4 then '럭스' else '제드' end,
        '15.1.1',case when i=1 then 4 else 6 end,case when i=1 then 2 else 3 end,case when i=1 then 6 else 4 end);
  end loop;
  select * into result from public.get_most_champions(array[a]) where champion_key='Ahri';
  if result.games<>2 or result.wins<>1 or result.losses<>1 or result.kda<>4 or result.avg_kills<>5 or result.avg_deaths<>2.5 or result.avg_assists<>5 or result.win_rate<>50 then raise exception 'Combined champion statistics incorrect'; end if;
  if (select count(*) from public.get_most_champions(array[a]))<>3 then raise exception 'Most champions should return only top three'; end if;
end $$;
rollback;
