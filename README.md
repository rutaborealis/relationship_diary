# Relationship diary

A private PWA diary for two — each partner fills in their own entry and can read each other's.

---

## Features

- **Daily entries** — mood, observations about your partner, gratitude, a moment of closeness, a private note to them, and a personal thought only you can see
- **Partner view** — read your partner's entry for any day (visible only after both have saved)
- **Calendar** — color-coded dots show who wrote on which day, with a shared streak counter
- **Qualities list** — a personal "why I love them" collection
- **Push notifications** — get notified when your partner fills their diary
- **Reminders** — a daily nudge at a time you choose, if you haven't written yet
- **PWA** — installable on mobile, works offline, full-screen

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS SPA (no framework, no bundler) |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Push | Web Push API + VAPID |
| Offline | Service Worker |

---

## Getting started

### 1. Clone and install

```bash
git clone <repo-url>
cd relationship_diary
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the contents of `supabase-setup.sql`
3. From **Settings → API**, copy your Project URL, `anon` key, and `service_role` key

### 3. Generate VAPID keys

```bash
npm run generate-vapid
```

### 4. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
VAPID_PUBLIC_KEY=BK...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=your@email.com
PORT=3000
```

### 5. Connect Supabase in the frontend

In `public/app.js`, find the `CFG` object at the top and update:

```js
DEMO: false,
SUPABASE_URL: 'https://your-project.supabase.co',
SUPABASE_KEY: 'your-anon-key',
```

### 6. Run

```bash
npm start        # production
npm run dev      # development (auto-restarts on file changes)
```

Open `http://localhost:3000`.

---

## First launch

1. **Partner 1** opens the app → enters name and gender → clicks "Create profile"
2. **Partner 2** opens the app on their device → creates the second profile
3. Both can now see and write diary entries

> On a shared device, switch between profiles via **Settings → Switch user**.

---

## Demo mode

By default, `CFG.DEMO = true` in `public/app.js`. In demo mode the app runs entirely in `localStorage` with two pre-seeded users — no Supabase setup needed. Push notifications are disabled in this mode.

---

## Deployment

The app can be deployed to [Railway](https://railway.app), [Render](https://render.com), or any VPS. Set all `.env` variables in the platform's environment settings.

HTTPS is required for push notifications — use the platform's built-in SSL or Let's Encrypt.

---

## Database schema

Five tables in Supabase (defined in `supabase-setup.sql`):

| Table | Purpose |
|---|---|
| `users` | The two partners (name, gender) |
| `entries` | Daily diary entries, unique per user + date |
| `qualities` | Each user's personal "why I love them" list |
| `push_subscriptions` | Web Push subscriptions + reminder time |
| `notification_log` | Deduplication log to prevent repeat pushes per day |

`entries.free_thought` is never exposed to the partner.

---

## Regenerate PWA icons

```bash
node generate-icons.js
```
