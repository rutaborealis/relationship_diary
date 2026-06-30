# Pipeline

- **feature:** password-reset
- **created:** 2026-06-30

## Этапы
Статусы: `pending` → `ready` → `in_progress` → `done` · `blocked` · `failed`

| Этап | Роль | Статус | Артефакт |
|---|---|---|---|
| analyze | business-analyst | done    | 01-requirements.md |
| design  | architect        | done    | 02-spec.md |
| build   | dev-lead         | done    | 03-build-notes.md + frontend/ backend/ |
| qa      | qa-engineer      | ready   | 04-test-report.md |
| security| security-engineer| pending | 04b-security-review.md |
| deploy  | devops           | pending | 05-deploy.md |

## Журнал
- 2026-06-30 intake: фича заведена. Self-service сброс пароля по email (Resend), как у верификации почты. Ключевые требования безопасности: не раскрывать существование email, одноразовый код/токен с TTL, защита от перебора, инвалидация сессий после смены пароля.
- 2026-06-30 analyze (business-analyst): написан 01-requirements.md — 20 FR, 14 acceptance criteria (Given/When/Then), NFR с акцентом на безопасность (anti-enumeration, криптостойкий одноразовый код+TTL, лимит попыток+rate limiting, инвалидация сессий, аудит без секретов). 8 допущений. PO-блокеров нет. Открытые вопросы инженерные (к архитектору/безопаснику): механизм отзыва stateless-JWT после смены пароля (FR-14), нужна ли капча сверх rate limiting, информ-письмо «пароль изменён». analyze→done, design→ready.
- 2026-06-30 build (dev-lead): реализованы T-1..T-12 в ветке `feat/password-reset`. Backend: `lib/secure-code.ts` (crypto.randomInt, sha256, timing-safe), `tv`/tokenVersion в jwt+requireAuth+login+verify-email (ADR-0002), эндпоинты `request-reset` (anti-enumeration, RESPONSE_FLOOR_MS, rate-limit RESET#<email>/RL 5/час+1/60с, SHA-256 код TTL 15м) и `confirm-reset` (timing-safe, atomic capped attempts, atomic passwordHash+tokenVersion, code consume, best-effort письмо), пороги в config. Frontend: ForgotPassword/ResetPassword страницы, ссылка с LoginPage, маршруты, api.requestReset/confirmReset. Infra: 2 Lambda + POST-маршруты. 4 атомарных коммита. Проверки зелёные: tsc backend, frontend build, sam validate --lint, unit secure-code. 2 минорных [SPEC-DEVIATION] (tokenVersion via if_not_exists+1 вместо ADD для корректной инвалидации неявной v1; доп. поле lastAt в RL). Полный локальный e2e оставлен QA (DynamoDB Local не поднят, :3000 занят). build→done, qa→ready.
- 2026-06-30 design (architect): написан 02-spec.md. Решение — 6-значный криптостойкий код (crypto.randomInt, не Math.random), сущность RESET#<email>/CODE (SHA-256 хэш кода, TTL 15 мин, attempts) + RESET#<email>/RL (rate limit 5/час), без нового GSI/таблицы. Эндпоинты: POST /api/auth/request-reset (anti-enumeration + постоянное время RESPONSE_FLOOR_MS) и POST /api/auth/confirm-reset (timing-safe, лимит 5 попыток, atomic update passwordHash+tokenVersion). FR-14 — отзыв JWT через tokenVersion в профиле, проверяется в requireAuth → ADR-0002. Фронт: ForgotPasswordPage + ResetPasswordPage + ссылка с LoginPage, после сброса редирект на /login. Инфра: 2 новых Lambda (Crud+SSM). Капча отклонена для v1, FR-17 письмо включено. 12 задач T-1..T-12. [NEEDS-BA] нет. design→done, build→ready.
