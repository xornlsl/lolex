ALTER TABLE public.league_registrations ADD CONSTRAINT league_registrations_league_user_unique UNIQUE (league_id,user_id);;
