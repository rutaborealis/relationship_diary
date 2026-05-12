# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start           # production server
npm run dev         # server with auto-restart on file changes (node --watch)
npm run generate-vapid   # generate VAPID keys for push notifications
node generate-icons.js   # regenerate PWA icons from favicon.svg
```

No build step, no bundler, no tests, no linter configured.

## Architecture

This is a **couples relationship diary** — a PWA for exactly 2 users. It is a vanilla JS SPA served by an Express static server.

### Two operating modes

`CFG.DEMO` in `public/app.js` controls which backend is used:

- **`DEMO: true`** (default) — uses an in-memory localStorage database (`LocalDB`/`QueryBuilder`). No Supabase needed. Push notifications are disabled. Demo users "Рута" and "Женя" are auto-seeded.
- **`DEMO: false`** — uses a real Supabase instance. Requires filling `CFG.SUPABASE_URL` and `CFG.SUPABASE_KEY` in `public/app.js`, plus `.env` for the server.

### Files

- **`server.js`** — Express server. Serves `public/` as static files. Three API routes:
  - `GET /api/vapid-public-key` — returns VAPID public key to the frontend
  - `POST /api/subscribe` — saves/updates a push subscription in Supabase
  - `POST /api/notify-partner` — sends a push to the partner when a diary entry is saved (idempotent per day via `notification_log`)
  - Cron job (every minute): sends reminder pushes to users who set a `reminder_time` and haven't filled their entry today

- **`public/app.js`** — entire frontend in one IIFE. Key sections:
  - `CFG` — config constants (DEMO flag, Supabase credentials, mood levels, Russian month/day names, `DB_VERSION`)
  - `QueryBuilder` / `createLocalDb()` — localStorage-backed DB that mirrors the Supabase JS client API (`.from().select().eq().upsert()` etc.)
  - `S` — global mutable state (current user, partner, active view, current date, form data)
  - `render()` / `navigate(view)` — re-renders the entire view on every navigation
  - View functions: `renderToday`, `renderPartner`, `renderCalendar`, `renderQualities`, `renderSettings`
  - Push helpers: `enablePush`, `disablePush`, `notifyPartner`

- **`supabase-setup.sql`** — full DB schema: `users`, `entries`, `qualities`, `push_subscriptions`, `notification_log`. RLS is disabled (private app).

- **`public/sw.js`** — service worker for PWA caching and push notification display.

### Key design decisions

**LocalDB mirrors Supabase API exactly** so `app.js` calls `S.db.from('entries').select(...)` identically regardless of mode. The `QueryBuilder` class implements `.eq()`, `.in()`, `.gte()`, `.lte()`, `.order()`, `.insert()`, `.upsert()`, `.update()`, `.delete()`, `.maybeSingle()`, `.single()`.

**`DB_VERSION` in `CFG`** — bump this string whenever the localStorage schema changes to force-clear all local data on the user's next page load.

**`entries.free_thought`** is intentionally private — the partner view (`renderPartner`) never displays it.

**`entries.note_to_partner`** is readable by the partner in `renderPartner`.

**User identity** is persisted as `localStorage['diary_user_id']`. Gender determines the color theme (`theme-m` CSS class on `<body>` for male users).

**The app supports exactly 2 users.** `loadPartner()` finds the one user whose `id !== S.userId`. The setup flow gates the second user's creation until the first exists.

**Push notification idempotency** — `notification_log` prevents duplicate pushes per `(sender_id, recipient_id, date, type)`.

### Switching to real Supabase

1. Run `supabase-setup.sql` in Supabase SQL Editor
2. Generate VAPID keys: `npm run generate-vapid`
3. Fill `.env` (copy from `.env.example`)
4. In `public/app.js`, set `CFG.DEMO = false` and fill `CFG.SUPABASE_URL` / `CFG.SUPABASE_KEY`
