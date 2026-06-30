# Pipeline

- **feature:** password-reset
- **created:** 2026-06-30

## Этапы
Статусы: `pending` → `ready` → `in_progress` → `done` · `blocked` · `failed`

| Этап | Роль | Статус | Артефакт |
|---|---|---|---|
| analyze | business-analyst | done    | 01-requirements.md |
| design  | architect        | ready   | 02-spec.md |
| build   | dev-lead         | pending | 03-build-notes.md + frontend/ backend/ |
| qa      | qa-engineer      | pending | 04-test-report.md |
| security| security-engineer| pending | 04b-security-review.md |
| deploy  | devops           | pending | 05-deploy.md |

## Журнал
- 2026-06-30 intake: фича заведена. Self-service сброс пароля по email (Resend), как у верификации почты. Ключевые требования безопасности: не раскрывать существование email, одноразовый код/токен с TTL, защита от перебора, инвалидация сессий после смены пароля.
- 2026-06-30 analyze (business-analyst): написан 01-requirements.md — 20 FR, 14 acceptance criteria (Given/When/Then), NFR с акцентом на безопасность (anti-enumeration, криптостойкий одноразовый код+TTL, лимит попыток+rate limiting, инвалидация сессий, аудит без секретов). 8 допущений. PO-блокеров нет. Открытые вопросы инженерные (к архитектору/безопаснику): механизм отзыва stateless-JWT после смены пароля (FR-14), нужна ли капча сверх rate limiting, информ-письмо «пароль изменён». analyze→done, design→ready.
