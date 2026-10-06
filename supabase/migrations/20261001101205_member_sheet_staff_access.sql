-- Staff-only source roster; signup enforcement is added after its rules are confirmed.
create table public.member_sheet (
  id uuid primary key default gen_random_uuid(),
  real_name text not null check (char_length(btrim(real_name)) between 1 and 80),
  birth_date date not null,
  lol_nickname text not null check (
    char_length(lol_nickname) <= 100
    and lol_nickname ~ '^[^#[:cntrl:]]+#[^#[:space:]]+$'
  ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_sheet_exact_entry_unique unique (real_name, birth_date, lol_nickname)
);
create index member_sheet_order_idx on public.member_sheet (real_name, birth_date, id);
alter table public.member_sheet enable row level security;
revoke all on public.member_sheet from anon, authenticated;
grant select on public.member_sheet to authenticated;
grant all on public.member_sheet to service_role;
create policy "Approved staff can read member sheet" on public.member_sheet
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.status = 'approved' and p.role in ('staff', 'superadmin'))
  );

-- This trigger only compares OLD/NEW. Invoker mode prevents current_user from
-- becoming its postgres owner and accidentally allowing self-promotion.
create or replace function public.protect_profile_system_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.role() = 'service_role' or current_user = 'postgres' then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
     or new.username is distinct from old.username
     or new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.created_at is distinct from old.created_at then
    raise exception '변경할 수 없는 프로필 항목입니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;

;
