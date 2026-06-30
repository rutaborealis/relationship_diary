# Pipeline

- **feature:** content-encryption
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
- 2026-06-30 intake: фича заведена. Защита чувствительного контента дневника шифрованием (сейчас в DynamoDB plaintext). Ключевой открытый вопрос — at-rest (KMS/поле) vs end-to-end.
- 2026-06-30 analyze: написан 01-requirements.md. 14 FR, 12 AC (Given/When/Then). Перечислены шифруемые контентные поля и нешифруемые метаданные; сохранена модель приватности (free_thought личное, note_to_partner общее); описана стратегия миграции (ленивая on-write + идемпотентный разовый прогон). 7 допущений. 1 [BLOCKER] для PO: выбор модели угроз at-rest vs E2E (рекомендация BA — at-rest server-side/KMS envelope для v1). analyze → done, design → ready.
- 2026-06-30 PO-решение: [BLOCKER] снят — выбран **at-rest server-side (KMS envelope)**. E2E отклонён как неподходящий для PWA (мульти-устройство, сброс пароля = потеря данных, push без текста, шаринг). E2E — кандидат на отдельную будущую фичу. Архитектор проектирует at-rest server-side.
- 2026-06-30 design: написан 02-spec.md. Решение — envelope encryption (1 KMS CMK + локальный AES-256-GCM с кэшем data key), формат поля Map `{enc_v,iv,tag,ct,dk}`, маркер `enc_v` для версии/миграции. Шифрование изолировано в новой либе `backend/src/lib/crypto.ts`; затронуты entries/save (encrypt), entries/get (decrypt, free_thought партнёру не дешифруется), qualities create/update/list. Контракты API/клиент не меняются. Инфра: CMK+alias+IAM в template.yaml. Миграция: ленивая on-write + идемпотентный backfill-скрипт (прод-запуск = [NEEDS-CEO-APPROVAL]). Локальный fake-KMS режим для DynamoDB Local. 9 задач T-1..T-9. ADR 0001 создан. [NEEDS-BA] нет. design → done, build → ready.
- 2026-06-30 build: реализованы все T-1..T-9 в ветке `feat/content-encryption` (атомарные коммиты). Новая либа `backend/src/lib/crypto.ts` (envelope KMS/AES-256-GCM + кэш DEK + fake-KMS), секция `crypto` в app.config, encrypt в entries/save и qualities/create+update, decrypt в entries/get (free_thought партнёру не дешифруется) и qualities/list, KMS CMK+alias+least-privilege IAM в template.yaml (`sam validate --lint` ок), идемпотентный backfill `scripts/migrate-encrypt-content.ts`, fake-KMS env в `.env.example`. Backend typecheck зелёный; контракты API/фронт не менялись. Прогнаны handler-level integration-проверки против DynamoDB Local (21/21 PASS, AC-1..AC-12 + qualities) и тест миграции (AC-8: run1 шифрует, run2 no-op). Backfill над прод НЕ запускался — [NEEDS-CEO-APPROVAL] на DEPLOY. 2 мелких [SPEC-DEVIATION] (сигнатуры encrypt/decryptField; Retain-политика CMK) — в 03-build-notes. build → done, qa → ready.
