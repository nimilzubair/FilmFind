-- FilmFind Supabase schema
-- Run this in the Supabase SQL editor.
-- Email validation is enforced by Supabase Auth + email confirmation.
create extension if not exists pgcrypto;

-- User profile data linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  selected_genre text,
  preferred_genres text[] not null default '{}'::text[],
  selected_content_filter text not null default 'all',
  selected_media_type text not null default 'all',
  onboarding_completed boolean not null default true,
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_format_check
    check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

alter table if exists public.profiles
  add column if not exists selected_content_filter text not null default 'all';

alter table if exists public.profiles
  add column if not exists selected_media_type text not null default 'all';

alter table if exists public.profiles
  add column if not exists preferred_genres text[] not null default '{}'::text[];

alter table if exists public.profiles
  add column if not exists onboarding_completed boolean not null default true;

update public.profiles
set preferred_genres = coalesce(preferred_genres, '{}'::text[])
where preferred_genres is null;

-- Movies the user rates for personalization
create table if not exists public.user_movie_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id bigint not null,
  movie_title text not null,
  genres text[] not null default '{}'::text[],
  rating numeric(2,1) not null check (rating >= 0 and rating <= 5),
  feedback_type text not null default 'rating' check (feedback_type in ('rating', 'like', 'dislike')),
  is_liked boolean not null default false,
  is_disliked boolean not null default false,
  selected_genre text,
  source text not null default 'manual',
  interaction_context jsonb not null default '{}'::jsonb,
  notes text,
  watched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_movie_ratings_feedback_consistency check (
    (
      feedback_type = 'like'
      and is_liked = true
      and is_disliked = false
      and rating >= 4
    )
    or (
      feedback_type = 'dislike'
      and is_liked = false
      and is_disliked = true
      and rating <= 2
    )
    or (
      feedback_type = 'rating'
      and is_liked = false
      and is_disliked = false
    )
  ),
  unique(user_id, movie_id)
);

alter table if exists public.user_movie_ratings
  add column if not exists feedback_type text not null default 'rating';

alter table if exists public.user_movie_ratings
  add column if not exists is_liked boolean not null default false;

alter table if exists public.user_movie_ratings
  add column if not exists is_disliked boolean not null default false;

alter table if exists public.user_movie_ratings
  add column if not exists source text not null default 'manual';

alter table if exists public.user_movie_ratings
  add column if not exists interaction_context jsonb not null default '{}'::jsonb;

alter table if exists public.user_movie_ratings
  add column if not exists notes text;

alter table if exists public.user_movie_ratings
  add column if not exists watched_at timestamptz;

update public.user_movie_ratings
set
  feedback_type = case
    when rating >= 4 then 'like'
    when rating <= 2 then 'dislike'
    else 'rating'
  end,
  is_liked = rating >= 4,
  is_disliked = rating <= 2
where feedback_type = 'rating'
  and is_liked = false
  and is_disliked = false;

alter table if exists public.user_movie_ratings
  drop constraint if exists user_movie_ratings_feedback_consistency;

alter table if exists public.user_movie_ratings
  add constraint user_movie_ratings_feedback_consistency check (
    (
      feedback_type = 'like'
      and is_liked = true
      and is_disliked = false
      and rating >= 4
    )
    or (
      feedback_type = 'dislike'
      and is_liked = false
      and is_disliked = true
      and rating <= 2
    )
    or (
      feedback_type = 'rating'
      and is_liked = false
      and is_disliked = false
    )
  );

create index if not exists idx_user_movie_ratings_user_id on public.user_movie_ratings(user_id);
create index if not exists idx_user_movie_ratings_movie_id on public.user_movie_ratings(movie_id);
create index if not exists idx_user_movie_ratings_rating on public.user_movie_ratings(rating);
create index if not exists idx_user_movie_ratings_feedback_type on public.user_movie_ratings(feedback_type);
create index if not exists idx_user_movie_ratings_is_liked on public.user_movie_ratings(is_liked);
create index if not exists idx_user_movie_ratings_is_disliked on public.user_movie_ratings(is_disliked);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keep timestamps fresh
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_movie_ratings_updated_at on public.user_movie_ratings;
create trigger trg_user_movie_ratings_updated_at
before update on public.user_movie_ratings
for each row execute function public.set_updated_at();

-- Create/update profile when a Supabase user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    selected_genre,
    preferred_genres,
    selected_content_filter,
    selected_media_type,
    onboarding_completed,
    email_verified
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    null,
    '{}'::text[],
    'all',
    'all',
    false,
    case when new.email_confirmed_at is not null then true else false end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      selected_genre = coalesce(public.profiles.selected_genre, excluded.selected_genre),
      preferred_genres = coalesce(public.profiles.preferred_genres, excluded.preferred_genres),
      selected_content_filter = coalesce(public.profiles.selected_content_filter, excluded.selected_content_filter),
      selected_media_type = coalesce(public.profiles.selected_media_type, excluded.selected_media_type),
      onboarding_completed = coalesce(public.profiles.onboarding_completed, excluded.onboarding_completed),
      email_verified = excluded.email_verified,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Keep email verification state in sync
create or replace function public.handle_user_email_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email_verified = case when new.email_confirmed_at is not null then true else false end,
      email = new.email,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified
after update of email_confirmed_at, email on auth.users
for each row execute procedure public.handle_user_email_verification();

-- Row level security
alter table public.profiles enable row level security;
alter table public.user_movie_ratings enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Insert own profile" on public.profiles;
create policy "Insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Read own ratings" on public.user_movie_ratings;
create policy "Read own ratings"
on public.user_movie_ratings
for select
using (auth.uid() = user_id);

drop policy if exists "Insert own ratings" on public.user_movie_ratings;
create policy "Insert own ratings"
on public.user_movie_ratings
for insert
with check (auth.uid() = user_id);

drop policy if exists "Update own ratings" on public.user_movie_ratings;
create policy "Update own ratings"
on public.user_movie_ratings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Delete own ratings" on public.user_movie_ratings;
create policy "Delete own ratings"
on public.user_movie_ratings
for delete
using (auth.uid() = user_id);
