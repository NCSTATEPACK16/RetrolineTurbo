-- Retroline Turbo — initial schema (plan §8).
-- Save, economy, leaderboards, and community tracks. Every table is protected
-- by Row-Level Security: the anon key is public, so RLS is the ONLY guard.

-- =============================================================================
-- Tables
-- =============================================================================

-- One profile per auth user. Auto-created by a trigger on auth.users (below).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Single save row per user (the whole persistent player state).
create table if not exists public.saves (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  credits          integer not null default 0,
  owned_cars       jsonb   not null default '[]'::jsonb,
  upgrades         jsonb   not null default '{}'::jsonb,
  unlocked_stages  jsonb   not null default '[]'::jsonb,
  settings         jsonb   not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

-- One row per finished race; feeds the leaderboard view.
create table if not exists public.race_results (
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
  on public.race_results (track_id, time_ms);

-- Community / shared tracks.
create table if not exists public.tracks (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  data       jsonb not null,
  is_public  boolean not null default false,
  plays      integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tracks_public_idx on public.tracks (is_public);

-- =============================================================================
-- Leaderboard view: best (minimum) time per track, with the holder's name.
-- security_invoker so the querying user's RLS applies to the underlying tables.
-- =============================================================================

create or replace view public.leaderboard_best
with (security_invoker = true) as
  select distinct on (rr.track_id)
    rr.track_id,
    rr.user_id,
    p.display_name,
    rr.route,
    rr.time_ms,
    rr.created_at
  from public.race_results rr
  join public.profiles p on p.id = rr.user_id
  order by rr.track_id, rr.time_ms asc;

-- =============================================================================
-- Auto-create a profile row whenever a new auth user is created.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row-Level Security
-- =============================================================================

alter table public.profiles     enable row level security;
alter table public.saves        enable row level security;
alter table public.race_results enable row level security;
alter table public.tracks       enable row level security;

-- profiles: everyone can read display names; you may only edit your own.
create policy "profiles are viewable by everyone"
  on public.profiles for select using (true);
create policy "users can insert their own profile"
  on public.profiles for insert with check (id = auth.uid());
create policy "users can update their own profile"
  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- saves: strictly private to the owner.
create policy "users can read their own save"
  on public.saves for select using (user_id = auth.uid());
create policy "users can insert their own save"
  on public.saves for insert with check (user_id = auth.uid());
create policy "users can update their own save"
  on public.saves for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- race_results: insert only your own; readable by all (for leaderboards).
create policy "race results are viewable by everyone"
  on public.race_results for select using (true);
create policy "users can insert their own race results"
  on public.race_results for insert with check (user_id = auth.uid());

-- tracks: public tracks or your own are readable; you manage only your own.
create policy "public or own tracks are viewable"
  on public.tracks for select using (is_public or author_id = auth.uid());
create policy "users can insert their own tracks"
  on public.tracks for insert with check (author_id = auth.uid());
create policy "users can update their own tracks"
  on public.tracks for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "users can delete their own tracks"
  on public.tracks for delete using (author_id = auth.uid());
