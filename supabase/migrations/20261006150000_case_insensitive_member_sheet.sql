-- Preserve display spelling while matching both Riot ID parts without case sensitivity.
-- Existing case-only duplicates must be resolved before this unique index can be applied.
alter table public.member_sheet
  add column riot_key text generated always as (lower(btrim(lol_nickname))) stored;
create unique index member_sheet_identity_case_unique
  on public.member_sheet(real_name, birth_date, riot_key);

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
    where real_name=new.real_name and birth_date=new.birth_date and riot_key=lower(new.lol_nickname)
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
