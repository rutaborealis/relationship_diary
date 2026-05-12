-- Couples Diary — Supabase Schema
-- Run this in the Supabase SQL Editor

create extension if not exists "uuid-ossp";

-- Partners
create table if not exists users (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  gender      text        not null check (gender in ('f', 'm')),
  created_at  timestamptz not null default now()
);

-- Daily entries
create table if not exists entries (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references users(id) on delete cascade,
  date             date        not null,
  mood_level       text        check (mood_level in ('good', 'ok', 'bad')),
  mood_text        text,
  noticed_1        text,
  noticed_2        text,
  noticed_3        text,
  gratitude_1      text,
  gratitude_2      text,
  gratitude_3      text,
  gratitude_said   text        check (gratitude_said in ('yes', 'not_yet', 'no_occasion')),
  closeness_text   text,
  note_to_partner  text,
  free_thought     text,       -- private, never exposed to partner
  saved_at         timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(user_id, date)
);

-- "За что я её/его полюбила/полюбил"
create table if not exists qualities (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references users(id) on delete cascade,
  text       text        not null,
  created_at timestamptz not null default now()
);

-- Web Push subscriptions
create table if not exists push_subscriptions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references users(id) on delete cascade,
  subscription  jsonb       not null,
  reminder_time text,       -- "HH:MM" or null
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(user_id)
);

-- Notification log (prevent duplicate sends per day)
create table if not exists notification_log (
  id           uuid        primary key default gen_random_uuid(),
  sender_id    uuid        not null references users(id),
  recipient_id uuid        not null references users(id),
  date         date        not null,
  type         text        not null,  -- 'entry_saved' | 'reminder'
  sent_at      timestamptz not null default now(),
  unique(sender_id, recipient_id, date, type)
);

-- Disable RLS for trusted private app
-- (both partners share this private instance)
alter table users              disable row level security;
alter table entries            disable row level security;
alter table qualities          disable row level security;
alter table push_subscriptions disable row level security;
alter table notification_log   disable row level security;
