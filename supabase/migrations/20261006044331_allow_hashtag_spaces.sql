alter table public.member_sheet drop constraint member_sheet_lol_nickname_check;
alter table public.member_sheet add constraint member_sheet_lol_nickname_check check (
  char_length(lol_nickname) <= 100
  and lol_nickname ~ '^[^#[:cntrl:]]+#([^#[:space:]]| )+$'
  and length(btrim(split_part(lol_nickname, '#', 1))) > 0
  and length(btrim(split_part(lol_nickname, '#', 2))) > 0
);

alter table public.profile_aliases drop constraint profile_aliases_lol_nickname_check;
alter table public.profile_aliases add constraint profile_aliases_lol_nickname_check check (
  char_length(lol_nickname) <= 100
  and lol_nickname ~ '^[^#[:cntrl:]]+#([^#[:space:]]| )+$'
  and length(btrim(split_part(lol_nickname, '#', 1))) > 0
  and length(btrim(split_part(lol_nickname, '#', 2))) > 0
);;
