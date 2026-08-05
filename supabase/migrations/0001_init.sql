-- Retroline Turbo — initial schema (plan §8).
-- Save, economy, leaderboards, and community tracks.
--
-- Everything lives in a dedicated `retroline` schema so it is fully isolated
-- from other games sharing this Supabase project (their tables + auth trigger
-- in `public` are never touched). Every table is protected by Row-Level
-- Security: the anon key is public, so RLS is the ONLY guard.
--
-- NOTE: REST access to this schema requires adding `retroline` to
-- Settings → API → "Exposed schemas" in the Supabase dashboard. Auth
-- (anonymous sign-in) works without it; table reads/writes (Phase 8) need it.

create schema if not exists retroline;

-- =============================================================================
-- Tables
-- =============================================================================

-- One profile per auth user. Auto-created by a trigger on auth.users (below).
create table if not exists retroline.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Single save row per user (the whole persistent player state).
create table if not exists retroline.saves (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  credits          integer not null default 0,
  owned_cars       jsonb   not null default '[]'::jsonb,
  upgrades         jsonb   not null default '{}'::jsonb,
  unlocked_stages  jsonb   not null default '[]'::jsonb,
  settings         jsonb   not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

-- One row per finished race; feeds the leaderboard view.
create table if not exists retroline.race_results (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  track_id       text not null,
  route          text,
  time_ms        integer not null,
  position       integer,
  credits_earned integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists race_results_track_time_idx
  on retroline.race_results (track_id, time_ms);

-- Community / shared tracks.
create table if not exists retroline.tracks (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  data       jsonb not null,
  is_public  boolean not null default false,
  plays      integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tracks_public_idx on retroline.tracks (is_public);

-- =============================================================================
-- Leaderboard view: best (minimum) time per track, with the holder's name.
-- security_invoker so the querying user's RLS applies to the underlying tables.
-- =============================================================================

create or replace view retroline.leaderboard_best
with (security_invoker = true) as
  select distinct on (rr.track_id)
    rr.track_id,
    rr.user_id,
    p.display_name,
    rr.route,
    rr.time_ms,
    rr.created_at
  from retroline.race_results rr
  join retroline.profiles p on p.id = rr.user_id
  order by rr.track_id, rr.time_ms asc;

-- =============================================================================
-- Auto-create a profile row whenever a new auth user is created. Uses its own
-- function + trigger name so it coexists with any existing onboarding trigger
-- other games in this project have on auth.users. Kept in the (unexposed)
-- retroline schema, not public, so it is not a callable public API endpoint.
-- =============================================================================

create or replace function retroline.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = retroline
as $$
begin
  insert into retroline.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_retroline on auth.users;
create trigger on_auth_user_created_retroline
  after insert on auth.users
  for each row execute function retroline.handle_new_user();

-- =============================================================================
-- Row-Level Security. Policies use `TO <role>` + an (select auth.uid()) check
-- (authorization, not just authentication) per Supabase best practice.
-- =============================================================================

alter table retroline.profiles     enable row level security;
alter table retroline.saves        enable row level security;
alter table retroline.race_results enable row level security;
alter table retroline.tracks       enable row level security;

-- profiles: everyone can read display names; you may only edit your own.
create policy "profiles are viewable by everyone"
  on retroline.profiles for select to anon, authenticated using (true);
create policy "users can insert their own profile"
  on retroline.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "users can update their own profile"
  on retroline.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- saves: strictly private to the owner.
create policy "users can read their own save"
  on retroline.saves for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users can insert their own save"
  on retroline.saves for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "users can update their own save"
  on retroline.saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- race_results: insert only your own; readable by all (for leaderboards).
create policy "race results are viewable by everyone"
  on retroline.race_results for select to anon, authenticated using (true);
create policy "users can insert their own race results"
  on retroline.race_results for insert to authenticated
  with check (user_id = (select auth.uid()));

-- tracks: public tracks or your own are readable; you manage only your own.
create policy "public or own tracks are viewable"
  on retroline.tracks for select to anon, authenticated
  using (is_public or author_id = (select auth.uid()));
create policy "users can insert their own tracks"
  on retroline.tracks for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "users can update their own tracks"
  on retroline.tracks for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "users can delete their own tracks"
  on retroline.tracks for delete to authenticated
  using (author_id = (select auth.uid()));

-- =============================================================================
-- Data API grants (RLS still restricts which rows are visible). Needed once
-- `retroline` is added to the project's Exposed Schemas.
-- =============================================================================

grant usage on schema retroline to anon, authenticated;
grant select, insert, update, delete on all tables in schema retroline to anon, authenticated;
alter default privileges in schema retroline
  grant select, insert, update, delete on tables to anon, authenticated;
