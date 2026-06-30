# Заметки по реализации

> Автор: dev-lead · Вход: 02-spec.md · Ветка: `feat/content-encryption`

## Сделанные задачи
- [x] **T-1** — `backend/src/lib/crypto.ts`: envelope encrypt/decrypt, кэш DEK (encrypt: один DEK на тёплый контейнер с TTL+лимитом; decrypt: Map по wrapped-`dk`), формат `{enc_v,iv,tag,ct,dk}`, passthrough пустых/`null`/`undefined`, legacy-строка проходит насквозь, устойчивый decrypt (try/catch → `null` + лог `{event:'decrypt_failed'}` без контента/ciphertext), экспорт `encryptField`/`decryptField`/`ENCRYPTED_ENTRY_FIELDS`. Бэкенд envelope выбирается на загрузке: KMS (prod) vs локальный мастер-ключ (fake-KMS). Добавлена зависимость `@aws-sdk/client-kms` (external, рантайм Lambda; нужна локально для ts-node).
- [x] **T-2** — `backend/config/app.config.ts`: секция `crypto` (`kmsKeyId`, `localMode`, `localMasterKey`, `dataKeyTtlMs`, `dataKeyMaxUses`). `localMode` включается при `DYNAMO_ENDPOINT` или `KMS_LOCAL=1`.
- [x] **T-3** — `entries/save.ts`: каждое поле из `ENCRYPTED_ENTRY_FIELDS` прогоняется через `encryptField` перед `putItem`. Метаданные не трогаются. Пустые поля не превращаются в ciphertext. Ленивая миграция on-write (legacy → encrypted при пересохранении).
- [x] **T-4** — `entries/get.ts`: своя запись — decrypt всех контентных полей; запись партнёра — decrypt только `PARTNER_VISIBLE_FIELDS` (всё кроме `free_thought`), `free_thought` не дешифруется и по-прежнему вырезается; правило `shared===false` сохранено. Каждое поле дешифруется независимо (битое → `null`, ответ не падает).
- [x] **T-5** — `qualities/create.ts` + `update.ts`: encrypt `text` (ответ остаётся plaintext); `list.ts`: decrypt `text` (legacy проходит насквозь).
- [x] **T-6** — `calendar.ts` / `delete.ts` / `push/notify-partner.ts`: изменений нет (контент не читают). Календарь строится на `date`/`shared` (ProjectionExpression), push-payload контент записи не содержит. Подтверждено чтением кода.
- [x] **T-7** — `infra/template.yaml`: `DiaryContentKey` (`SYMMETRIC_DEFAULT`, `EnableKeyRotation`, `DeletionPolicy/UpdateReplacePolicy: Retain`, `PendingWindowInDays: 30`) + alias `alias/diary-content-${Stage}`; глобальный env `KMS_KEY_ID`. IAM по наименьшим привилегиям: `kms:GenerateDataKey` → save, qualities/create, qualities/update; `KMSDecryptPolicy` (`kms:Decrypt`) → get, qualities/list. calendar/delete/notify-partner/remove — без KMS-прав. `sam validate --lint` зелёный.
- [x] **T-8** — `scripts/migrate-encrypt-content.ts`: scan `DiaryMain` (с пагинацией), фильтр `SK begins_with ENTRY#`/`QUALITY#`, encrypt только непустых plaintext-строк, уже зашифрованные Map пропускаются (идемпотентно), `--dry-run`. Работает на DynamoDB Local (fake-KMS) и prod (`KMS_KEY_ID`).
- [x] **T-9** — fake-KMS режим в `crypto.ts` (локальный мастер-ключ через AES-256-GCM, алгоритм полей идентичен проду); `KMS_LOCAL`/`LOCAL_ENC_KEY` добавлены в `.env.example`; инструкции ниже.

## Как запустить / проверить локально

### Typecheck / build
```
cd frontend && npm run typecheck && npm run build   # фронт не затронут — проверка регресса
npx tsc -p backend/tsconfig.json --noEmit            # бэкенд
sam validate --lint                                  # из infra/ (или: cd infra && sam validate --lint)
```

### Полный локальный стек (fake-KMS, без AWS)
```
docker compose up -d
DYNAMO_ENDPOINT=http://localhost:8000 npm run setup-local-dynamo
# .env.local: DYNAMO_ENDPOINT=..., KMS_LOCAL=1, LOCAL_ENC_KEY=<стабильный ключ>, JWT_SECRET=...
npm run local
cd frontend && npm run dev
```

### Проверка «в таблице ciphertext, API отдаёт plaintext»
```
aws dynamodb get-item --endpoint-url http://localhost:8000 \
  --table-name DiaryMain-dev \
  --key '{"PK":{"S":"USER#<id>"},"SK":{"S":"ENTRY#<YYYY-MM-DD>"}}'
# free_thought/note_to_partner/… → Map {enc_v,iv,tag,ct,dk}; mood_level/shared/date → plaintext
```

### Backfill-миграция (локально)
```
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
DYNAMO_ENDPOINT=http://localhost:8000 KMS_LOCAL=1 LOCAL_ENC_KEY=<тот же ключ> \
  npx ts-node scripts/migrate-encrypt-content.ts --dry-run   # сначала dry-run
#  ... затем без --dry-run. Повторный прогон = no-op (идемпотентно).
```
> Прогон над **прод-данными** = `[NEEDS-CEO-APPROVAL]` на этапе DEPLOY. До одобрения работает ленивая on-write миграция.

### Что было проверено (handler-level integration против DynamoDB Local, fake-KMS)
Прогнан временный интеграционный скрипт (21 проверка, все зелёные; файлы удалены, не коммитятся):
AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-12 + qualities encrypt/list.
Отдельно проверена миграция (AC-8): seed 2 legacy-строк → run1 зашифровал 3 поля → run2 no-op → данные дешифруются.
Юнит-смоук `crypto.ts`: round-trip, passthrough `''/null/undefined`, legacy-строка, повреждённый `ct` → `null` (+ лог без контента), общий `dk` между полями одного сохранения.

## Переменные окружения / секреты / SSM
| Параметр | Где | Назначение |
|---|---|---|
| `KMS_KEY_ID` | env (prod) — `!Ref DiaryContentKey` из template.yaml | id/arn CMK для envelope. Инъектируется только в функции с KMS-IAM (глобальный env, остальные его не используют). |
| `KMS_LOCAL` | env (local) | `=1` форсит fake-KMS. Автоматически вкл. при `DYNAMO_ENDPOINT`. |
| `LOCAL_ENC_KEY` | env (local, **обязателен** в local-режиме) | мастер-ключ, оборачивающий DEK локально (любая строка → SHA-256 → 32 байта). Дефолтного ключа больше нет (SEC-2): без `LOCAL_ENC_KEY` крипто-либа падает на старте. Должен быть стабилен между прогонами/миграцией, иначе ранее зашифрованные локальные строки не расшифруются. |
| `STAGE` | env (уже есть, `!Ref Stage` в template.yaml) | признак прод-стейджа для fail-fast guard (SEC-1). В проде `STAGE=prod`. Новых проброса не потребовалось. |

Новых SSM-параметров не требуется: CMK создаётся в стеке, `KMS_KEY_ID` — `!Ref`, не SSM. Existing `SSMParameterReadPolicy` не трогался.

## Security-review findings (закрыто)
- `[SEC-1]` (medium) **Guard против fake-KMS в проде.** `backend/src/lib/crypto.ts`: перед выбором envelope-бэкенда — fail-fast. Если `config.app.stage === 'prod'` и при этом `localMode === true` (случайные `KMS_LOCAL`/`DYNAMO_ENDPOINT`) ИЛИ пустой `kmsKeyId` → бросается явная ошибка инициализации («production stage requires KMS — set KMS_KEY_ID, do NOT set KMS_LOCAL/DYNAMO_ENDPOINT»). Прод не может молча выбрать `localBackend()`. Использован уже существующий `STAGE` (из `config.app.stage` / `!Ref Stage`), нового env не заводил. template.yaml не менялся.
- `[SEC-2]` (low) **Убран захардкоженный dev-fallback мастер-ключ.** `localBackend()` больше не имеет `DEFAULT_DEV_KEY`; при отсутствии `LOCAL_ENC_KEY` бросает «set LOCAL_ENC_KEY for local KMS mode». В бандл публично известный ключ не попадает.

Проверено: typecheck зелёный; guard-матрица (local+key=OK; local без key=throw; prod+KMS_LOCAL=throw; prod без kmsKeyId=throw; prod+kmsKeyId=init OK, идёт в реальный KMS). Формат хранения, контракты API и приватность не затронуты.

## Отклонения от spec
- `[SPEC-DEVIATION]` Сигнатура `encryptField` расширена до `Promise<EncBlob | string | null | undefined>` (spec: `EncBlob | null | undefined`), а `decryptField` возвращает `string | null` (для `null`/`undefined` входа → `null`, а не passthrough `undefined`). Причина: честный passthrough пустой строки/legacy требует возврата исходного значения, а строгий `string | null` для decrypt проще и безопаснее (отсутствующие поля и так не попадают в объект и не дешифруются). На контракты API/формат хранения не влияет.
- `[SPEC-DEVIATION]` (мелочь) `DiaryContentKey` помечен `DeletionPolicy/UpdateReplacePolicy: Retain` + `PendingWindowInDays: 30` — прямая реализация риска «потеря CMK = потеря данных» из §7 spec/ADR. Spec явно про эти атрибуты не писал.

## Что НЕ сделано / замокано
- Backfill над прод-данными **не запускался** (по требованию — только локальная проверка). Запуск — этап DEPLOY под `[NEEDS-CEO-APPROVAL]`.
- Ротация CMK как процесс — вне scope (заложено `enc_v` + `EnableKeyRotation`).
- Постоянных unit/e2e-файлов в репозиторий не добавлял (нет тест-раннера в проекте; e2e — за QA). Интеграционные проверки выполнены временными скриптами и удалены.
- Замечание по окружению (не блокер): корневые ts-node-скрипты (`setup-local-dynamo`, `migrate-encrypt-content`) под Node 23 требуют `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'`, т.к. в корне нет tsconfig и Node трактует их как ESM. Существующая особенность репо, не связана с фичей.
