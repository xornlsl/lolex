alter table public.profiles
  add column initial_internal_score integer not null default 0 check (initial_internal_score between 0 and 50),
  add column member_sheet_id uuid references public.member_sheet(id) on delete set null;
create unique index profiles_sheet_claim_unique on public.profiles(member_sheet_id) where member_sheet_id is not null;
create index profiles_name_lookup on public.profiles(real_name);
create index profiles_riot_lookup on public.profiles(lower(btrim(lol_nickname)));

create table public.profile_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  lol_nickname text not null check (char_length(lol_nickname) <= 100 and lol_nickname ~ '^[^#[:cntrl:]]+#[^#[:space:]]+$'),
  riot_key text generated always as (lower(btrim(lol_nickname))) stored unique,
  created_at timestamptz not null default now()
);
create index profile_aliases_user_idx on public.profile_aliases(user_id);
alter table public.profile_aliases enable row level security;
revoke all on public.profile_aliases from anon, authenticated;
grant select on public.profile_aliases to authenticated;
grant all on public.profile_aliases to service_role;
create policy "Approved users can read aliases" on public.profile_aliases for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.status='approved')
);

create or replace function public.check_alias_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.lol_nickname := btrim(new.lol_nickname);
  perform pg_advisory_xact_lock(hashtextextended('riot:' || lower(new.lol_nickname), 0));
  if not exists(select 1 from public.profiles where user_id=new.user_id and status='approved') then
    raise exception '승인된 회원만 부계정을 추가할 수 있습니다.' using errcode='P0001';
  end if;
  if exists(select 1 from public.profiles where lower(btrim(lol_nickname))=lower(new.lol_nickname)) then
    raise exception '이미 등록된 롤 계정입니다.' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger check_alias_owner_before_insert before insert on public.profile_aliases
for each row execute function public.check_alias_owner();

create or replace function public.enforce_member_signup()
returns trigger language plpgsql security definer set search_path='' as $$
declare sheet_id uuid;
begin
  new.real_name := btrim(new.real_name);
  new.lol_nickname := btrim(new.lol_nickname);
  perform pg_advisory_xact_lock(hashtextextended('member-name:' || new.real_name, 0));
  if exists(select 1 from public.profiles where btrim(real_name)=new.real_name and status='approved') then
    raise exception '이미 가입된 정보가 있습니다.' using errcode='P0001';
  end if;
  select id into sheet_id from public.member_sheet
    where real_name=new.real_name and birth_date=new.birth_date and lol_nickname=new.lol_nickname
    for update;
  if sheet_id is null then
    raise exception '시트 명단의 정보와 일치하지 않습니다. 관리자에게 확인해주세요.' using errcode='P0001';
  end if;
  if exists(select 1 from public.profiles where member_sheet_id=sheet_id) then
    raise exception '이미 가입 신청 중인 정보입니다. 승인 결과를 기다려주세요.' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('riot:' || lower(new.lol_nickname), 0));
  if exists(select 1 from public.profiles where lower(btrim(lol_nickname))=lower(new.lol_nickname))
     or exists(select 1 from public.profile_aliases where riot_key=lower(new.lol_nickname)) then
    raise exception '이미 등록된 롤 계정입니다.' using errcode='P0001';
  end if;
  new.member_sheet_id := sheet_id;
  return new;
end;
$$;
create trigger enforce_member_signup_before_insert before insert on public.profiles
for each row execute function public.enforce_member_signup();

create or replace function public.prevent_duplicate_member_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='approved' and (old.status is distinct from new.status or old.real_name is distinct from new.real_name) then
    perform pg_advisory_xact_lock(hashtextextended('member-name:' || btrim(new.real_name), 0));
    if exists(select 1 from public.profiles where user_id<>new.user_id and btrim(real_name)=btrim(new.real_name) and status='approved') then
      raise exception '이미 가입된 정보가 있습니다.' using errcode='P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger prevent_duplicate_member_approval before update on public.profiles
for each row execute function public.prevent_duplicate_member_approval();

create or replace function public.create_initial_player_rating()
returns trigger language plpgsql security definer set search_path='' as $$
declare initial_rating integer := 1000 + new.initial_internal_score * 10;
begin
  insert into public.player_ratings(user_id,overall_rating,top_rating,jungle_rating,mid_rating,adc_rating,support_rating,games_played,wins,losses)
  values(new.user_id,initial_rating,initial_rating,initial_rating,initial_rating,initial_rating,initial_rating,0,0,0)
  on conflict(user_id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_system_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.role()='service_role' or current_user='postgres' then return new; end if;
  if new.user_id is distinct from old.user_id or new.username is distinct from old.username
     or new.role is distinct from old.role or new.status is distinct from old.status
     or new.created_at is distinct from old.created_at or new.real_name is distinct from old.real_name
     or new.birth_date is distinct from old.birth_date or new.lol_nickname is distinct from old.lol_nickname
     or new.member_sheet_id is distinct from old.member_sheet_id
     or new.initial_internal_score is distinct from old.initial_internal_score then
    raise exception '변경할 수 없는 프로필 항목입니다.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.check_alias_owner(), public.enforce_member_signup(), public.prevent_duplicate_member_approval() from public,anon,authenticated;

;
