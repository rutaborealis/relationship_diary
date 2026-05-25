# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend
cd frontend && npm run dev       # Vite dev server (proxies /api → localhost:3000)
cd frontend && npm run build     # TypeScript check + Vite build → frontend/dist/
cd frontend && npm run typecheck # tsc --noEmit

# Backend
npm run local                    # Express wrapper for Lambda handlers (ts-node)
npm run setup-local-dynamo       # Create tables in DynamoDB Local (Docker)

# Deploy
bash scripts/deploy-frontend.sh  # build frontend + sync S3 + invalidate CloudFront
bash scripts/deploy-backend.sh   # sam build + sam deploy
bash scripts/deploy.sh           # both frontend + backend

# Infra
npm run generate-vapid           # generate new VAPID key pair
```

## Project structure

```
relationship_diary/
├── frontend/                    # React + Vite PWA
│   ├── src/
│   │   ├── api/index.ts         # All API calls (single request() helper)
│   │   ├── store/index.ts       # Zustand stores (auth + UI toasts)
│   │   ├── types/index.ts       # Shared TypeScript interfaces
│   │   ├── pages/
│   │   │   ├── auth/            # LoginPage, RegisterPage, VerifyEmailPage
│   │   │   └── app/             # TodayPage, PartnerPage, CalendarPage,
│   │   │                        #   DayPage, QualitiesPage, SettingsPage
│   │   ├── components/
│   │   │   ├── layout/          # PageLayout, BottomNav
│   │   │   └── ui/              # Textarea, Input, Loader, Toast
│   │   ├── index.css            # All styles (CSS variables, no Tailwind utilities)
│   │   ├── App.tsx              # React Router, JWT validation, invite token flow
│   │   └── main.tsx             # SW registration, invite token capture
│   └── public/
│       └── sw.js                # Service worker (push only — no caching)
├── backend/
│   ├── src/
│   │   ├── functions/           # One file per Lambda handler
│   │   │   ├── auth/            # register, verify-email, login, me
│   │   │   ├── entries/         # get, save, delete, calendar
│   │   │   ├── users/           # search
│   │   │   ├── partners/        # invite, accept, pending
│   │   │   ├── push/            # vapid-key, subscribe, settings, reminder, notify-partner
│   │   │   └── cron/            # reminders (EventBridge every minute)
│   │   └── lib/                 # dynamo, auth-middleware, errors, jwt, ses, ssm, webpush
│   └── config/app.config.ts     # Centralised config (table names, JWT, SES, VAPID params)
├── infra/
│   └── template.yaml            # AWS SAM — all Lambda + DynamoDB + S3 + CloudFront
└── scripts/
    ├── deploy.sh / deploy-frontend.sh / deploy-backend.sh
    ├── local-server.ts          # Express wrapper that calls Lambda handlers directly
    └── setup-local-dynamo.ts    # Creates DynamoDB Local tables for dev
```

## Architecture

**Couples diary PWA** — private app for exactly 2 users.

**Frontend:** React 18 + Vite + React Router v6. Zustand for state (jwt, user, partner persisted to `localStorage`). CSS custom variables — no Tailwind utility classes.

**Backend:** AWS Lambda (Node.js 22.x, ARM64). TypeScript → esbuild (via SAM `BuildMethod: esbuild`). No bundled `@aws-sdk/*` (provided by Lambda runtime).

**Storage:** DynamoDB Single Table Design (`DiaryMain`). Separate `DiaryPush` table for push subscriptions + reminder times.

**Delivery:** S3 (static) + CloudFront (CDN). CloudFront path `/api/*` → API Gateway → Lambda. All other paths → S3 bucket.

**Email:** Resend (not AWS SES). Lambda → `ses.ts` lib which calls Resend API.

**Push:** Web Push (VAPID). VAPID keys in SSM Parameter Store. `notify-partner` is idempotent per `(sender, recipient, date, type)`.

## DynamoDB schema (DiaryMain table)

| Entity | PK | SK | Key attributes |
|--------|----|----|----------------|
| User profile | `USER#<id>` | `PROFILE` | email, name, gender, passwordHash, emailVerified, partnerId |
| Email lookup | `EMAIL#<email>` | `USER` | userId |
| Diary entry | `USER#<id>` | `ENTRY#<YYYY-MM-DD>` | mood_level, mood_text, noticed_1/2/3, gratitude_1/2/3, closeness_text, note_to_partner, free_thought |
| Quality | `USER#<id>` | `QUALITY#<id>` | text, created_at |
| Notification log | `USER#<senderId>` | `NOTIF#<recipId>#<date>#<type>` | sent_at |
| Partner invite | `INVITE#<token>` | `META` | senderId, recipientEmail, status — TTL 72h |
| Email verify code | `VERIFY#<email>` | `CODE` | code — TTL 15 min |

**GSI EmailIndex** on `email` field → used for user search by email.

**DiaryPush table:** PK = `userId`. Fields: `subscription` (JSON object), `reminder_time` (HH:MM string).  
**GSI ReminderTimeIndex:** PK = `reminder_time` → used by cron to find users to remind.

## Key design decisions

**`entries.free_thought`** is private — `DayPage` and `PartnerPage` never show it when viewing partner's entry. Only visible in own entry view.

**`entries.note_to_partner`** is shared — partner sees it in read-only view.

**Auth flow:**
1. Register → 6-digit email code (Resend) → verify → JWT
2. JWT stored in Zustand (localStorage). On mount `App.tsx` calls `/api/auth/me` to validate.
3. `401` → auto-logout.

**Partner invite flow:**
- Inviter: search by name/email → click invite → backend sends email with `?token=X` link
- Invitee opens link → token saved to `sessionStorage` in `main.tsx` (before React mounts, before any auth redirect)
- After login: `App.tsx` `useEffect([jwt])` reads token from `sessionStorage`, calls `acceptInvite`

**Calendar → DayPage:** Clicking a day cell in `CalendarPage` navigates to `/day/YYYY-MM-DD`. `DayPage` loads both own entry and partner entry for that date. Tab switcher: "Моя запись" / partner name. "Редактировать" button navigates to `/today` with `state: { date }`.

**TodayPage date navigation:** reads initial date from `location.state?.date` (set by DayPage) or defaults to today. Prev/next arrows; "К сегодня" button for past dates.

**Push notifications:**
- VAPID public key: retrieved from `/api/vapid-public-key` (SSM backed)
- Subscription created via `navigator.serviceWorker.ready` + `pushManager.subscribe({ applicationServerKey: key })` — key passed as URL-base64 string directly (not converted to Uint8Array)
- After successful save in `TodayPage`, `api.notifyPartner(date)` is called fire-and-forget
- Idempotent: one notification per day per sender/recipient pair

**Gender theme:** `body.className = user.gender === 'm' ? 'theme-m' : ''`. CSS variables differ: female = pink accent (`--accent-a`), male = blue accent (`--accent-b`). Set in `App.tsx`.

**Qualities:** backend returns array directly (not `{ qualities: [] }`). Items have `id` field (not `qualityId`).

**Calendar:** backend returns `Record<string, { mine?: boolean; theirs?: boolean }>` sparse map (0-based month). Frontend sends `month - 1` to API, builds full grid in `buildGrid()`.

## SSM parameters (production)

```
/diary/jwt-secret          SecureString
/diary/vapid-public-key    SecureString
/diary/vapid-private-key   SecureString
/diary/vapid-email         String
/diary/resend-api-key      SecureString
```

## Local development

```bash
docker compose up -d          # DynamoDB Local on :8000
npm run setup-local-dynamo    # create tables
npm run local                 # Express wrapper on :3000
cd frontend && npm run dev    # Vite on :5173 (proxies /api → :3000)
```

Set `frontend/.env.local` to `VITE_API_BASE=` (empty) to use Vite proxy.  
Set `.env.local` (root) with `DYNAMO_ENDPOINT`, `JWT_SECRET`, `RESEND_API_KEY`, etc.

## Production URLs

- App: https://ourdiary.love (CloudFront)
- API: https://ourdiary.love/api/* → API Gateway (eu-central-1)
- S3 bucket: `diary-frontend-prod-049710942442`
- CloudFront distribution: `E1RZUG10DIC91S`
- SAM stack: `relationship-diary` (eu-central-1)
