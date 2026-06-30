# Развёртывание — content-encryption

> Автор: devops · Вход: 02-spec.md, 03-build-notes.md, 04-test-report.md, 04b-security-review.md, ADR 0001
> Дата: 2026-06-30 · Ветка: `feat/content-encryption`
> Статус: **ПОДГОТОВЛЕНО, ждёт `[NEEDS-CEO-APPROVAL]`** (боевой деплой не выполнялся)

## Вердикт готовности
QA = **PASS** (12/12 AC) · Security = **PASS-WITH-NOTES** (medium/low SEC-1/SEC-2 закрыты harden-фиксом в коде; SEC-3/SEC-4 — остаточные low, не блокеры). Деплой разрешён.

Все readiness-проверки прогнаны локально и зелёные:

| Проверка | Команда | Результат |
|---|---|---|
| SAM-шаблон валиден | `cd infra && sam validate --lint` | `is a valid SAM Template` |
| Бэкенд typecheck | `npx tsc -p backend/tsconfig.json --noEmit` | exit 0 |
| Фронт-сборка (регресс; фронт фичей не менялся) | `cd frontend && npm run build` | built OK, 1771 modules |
| Сборка Lambda (esbuild + crypto.ts + KMS external) | `sam build` | Build Succeeded |
| Скан секретов в файлах фичи | `git grep` по crypto.ts/app.config.ts/migrate | нет хардкод-секретов |

## Что и куда развёртывается
**Объём — ТОЛЬКО backend + infra.** Фронтенд этой фичей не затрагивается (контракты API неизменны, клиент шлёт/получает plaintext) — `deploy-frontend.sh` запускать НЕ нужно.

- Стек: `relationship-diary` (eu-central-1), `infra/template.yaml`.
- Способ: `bash scripts/deploy-backend.sh` = `sam build` + `sam deploy` (samconfig: `Stage` по умолчанию = `prod`).
- Создаётся новый ресурс **KMS CMK** `DiaryContentKey` + alias `alias/diary-content-prod`, плюс IAM-права на `kms:GenerateDataKey` / `kms:Decrypt` профильным функциям. Глобальный env `KMS_KEY_ID` инжектится во все функции, но используется только теми, у кого есть KMS-IAM.

## ⚠️ Обязательный pre-gate: чистое рабочее дерево
В рабочем дереве ветки обнаружены **незакоммиченные правки, НЕ относящиеся к этой фиче** (другая работа по push/UI):

```
backend/src/functions/entries/calendar.ts       (M)  ← не часть content-encryption
backend/src/functions/push/notify-partner.ts    (M)  ← не часть content-encryption
backend/src/lib/webpush.ts                       (M)  ← не часть content-encryption
frontend/src/...                                 (M)  ← не часть content-encryption
```

`sam build` собирает из рабочего дерева, поэтому **деплой из текущего грязного дерева протащит в прод непроверенные/непрошедшие QA изменения**. Перед деплоем дерево обязано быть чистым на ревьюнутом коммите фичи:

```bash
# вариант А — временно убрать постороннее (вернуть потом git stash pop)
git stash push -- backend/src/functions/entries/calendar.ts \
  backend/src/functions/push/notify-partner.ts backend/src/lib/webpush.ts \
  frontend/src
git status --short        # должно остаться чисто по backend/ (кроме коммитов фичи)

# вариант Б — деплой из чистого checkout ревьюнутого HEAD ветки feat/content-encryption
```
Без этого шага деплой не запускать.

## Секреты / SSM-параметры
**Новых SSM-параметров фича не вводит.** CMK создаётся в стеке, `KMS_KEY_ID` приходит через `!Ref DiaryContentKey` (CloudFormation), не через SSM. Существующие параметры не трогаются.

| Параметр / env | Значение в прод | Где задаётся | Назначение |
|---|---|---|---|
| `KMS_KEY_ID` | `!Ref DiaryContentKey` (id CMK) | `infra/template.yaml` Globals | id ключа для envelope-шифрования |
| `STAGE` | `prod` (`!Ref Stage`, default) | template.yaml Globals | прод-стейдж для fail-fast guard (SEC-1) |
| `KMS_LOCAL` | **НЕ задавать** | — | local fake-KMS; в проде запрещён |
| `DYNAMO_ENDPOINT` | **НЕ задавать** | — | DynamoDB Local; в проде запрещён |
| `LOCAL_ENC_KEY` | **НЕ задавать** | — | dev-only мастер-ключ |
| `/diary/*` (jwt, vapid, resend) | без изменений | SSM Parameter Store | существующие, не трогаются |

**Fail-fast guard (by design):** `backend/src/lib/crypto.ts` при загрузке модуля бросает ошибку, если `STAGE=prod` И (`KMS_LOCAL`/`DYNAMO_ENDPOINT` заданы ИЛИ пустой `KMS_KEY_ID`). Это защита от молчаливого шифрования прод-данных локальным ключом. Если по ошибке в прод-окружение попадёт `KMS_LOCAL`/`DYNAMO_ENDPOINT` — упадёт cold start функций save/get/qualities (НЕ деградация, а явный отказ — это правильно). Прод-`template.yaml` этих переменных не задаёт, так что в штатном деплое guard молчит.

## РАНБУК ДЕПЛОЯ (для PO)

### Шаг 0 — pre-gate (см. выше)
Убедиться, что рабочее дерево чистое на ревьюнутом коммите фичи; `sam validate --lint` зелёный; AWS-креды на аккаунт `049710942442`, регион `eu-central-1`.

### Шаг 1 — `[NEEDS-CEO-APPROVAL]` деплой стека (создаёт CMK + включает шифрование)
**Зелёная кнопка:**
```bash
bash scripts/deploy-backend.sh        # sam build + sam deploy (стек relationship-diary, Stage=prod)
```
Что произойдёт:
- Создастся CMK `DiaryContentKey` (Retain, ротация вкл., PendingWindow 30 дн.) + alias `alias/diary-content-prod`.
- Функции save / qualities-create / qualities-update получат `kms:GenerateDataKey`; get / qualities-list — `kms:Decrypt`.
- **Шифрование включается лениво:** с этого момента каждое новое сохранение записи/качества и каждое пересохранение существующей пишет ciphertext-Map `{enc_v,iv,tag,ct,dk}`. Старые plaintext-записи читаются как есть (legacy passthrough) и шифруются при следующем сохранении (on-write миграция).
- Существующие plaintext-данные сами по себе НЕ перешифровываются на этом шаге — для разового полного backfill см. Шаг 2.

Это безопасный, обратимый шаг **до первого зашифрованного сохранения** (см. «Откат»).

### Шаг 2 — `[NEEDS-CEO-APPROVAL]` backfill существующих plaintext-записей (изменение прод-данных DynamoDB)
Опционально, но рекомендуется, чтобы зашифровать «спящие» старые записи, которые пользователи могут больше не пересохранять. Идемпотентно: уже зашифрованные поля пропускаются.

**Сначала dry-run (без записи):**
```bash
export AWS_REGION=eu-central-1
export STAGE=prod
export KMS_KEY_ID=$(aws kms describe-key --key-id alias/diary-content-prod \
  --region eu-central-1 --query 'KeyMetadata.Arn' --output text)
# НЕ экспортировать DYNAMO_ENDPOINT / KMS_LOCAL (иначе fail-fast guard остановит скрипт)

TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  npx ts-node scripts/migrate-encrypt-content.ts --dry-run
# смотрим в выводе: would update USER#.../ENTRY#... [поля]; scanned=.. itemsUpdated=.. fieldsEncrypted=..
```
**Затем боевой прогон (тот же env, без `--dry-run`):**
```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
  npx ts-node scripts/migrate-encrypt-content.ts
# повторный прогон = no-op (itemsUpdated=0) — идемпотентно
```
Скрипт сканирует `DiaryMain-prod`, шифрует только непустые plaintext-строки в `ENTRY#*` (ENCRYPTED_ENTRY_FIELDS) и `QUALITY#*.text`. Требуемые права у оператора: `dynamodb:Scan`/`UpdateItem` на `DiaryMain-prod` + `kms:GenerateDataKey` на CMK (покрыто админ-ролью аккаунта).

> Примечание (SEC-4, low): `migrate-encrypt-content.ts:87` логирует весь объект ошибки SDK. На этом этапе значения уже ciphertext, plaintext-утечки не ожидается, но при боевом прогоне внимательно смотреть на любые ошибки. Это не блокер.

### Порядок и зависимости
Шаг 1 строго раньше Шага 2 (backfill требует CMK и тех же либ, что и рантайм). Шаг 2 можно отложить на любой срок — до него работает ленивая on-write миграция.

## Наблюдаемость (что мониторить после релиза)
Логи CloudWatch по лог-группам `/aws/lambda/diary-entries-*-prod`, `/aws/lambda/diary-qualities-*-prod`:

- **`{event:'decrypt_failed', reason:'crypto_error'|'unknown_version', enc_v}`** — сбой расшифровки поля. Единичные — допустимая деградация (поле вернётся `null`, ответ не падает, AC-12). Всплеск = проблема с KMS/ключом или порча данных → разобраться. Контента/ciphertext в логе нет (FR-13).
- **KMS throttling / `AccessDenied`** — в ошибках `GenerateDataKey`/`Decrypt`. AccessDenied = расхождение IAM↔CMK; throttling (маловероятен при DEK-кэше) = поднять при росте нагрузки. Метрики KMS в CloudWatch namespace `AWS/KMS`.
- **Cold-start fail-fast** — ошибка инициализации `content-encryption misconfiguration: production stage requires KMS...` в логах save/get/qualities = в прод просочились `KMS_LOCAL`/`DYNAMO_ENDPOINT` или пустой `KMS_KEY_ID`. Откатить конфиг env немедленно.
- **5xx на `/api/entries` (save)** — encrypt-сбой при сохранении пробрасывается в 5xx и plaintext НЕ сохраняется (by design, без частичной записи).

**Проверка после релиза (smoke):**
1. Создать/пересохранить запись через UI (ourdiary.love) и через `/api/entries`.
2. Прочитать сырой item из прод-таблицы и убедиться в ciphertext-at-rest:
   ```bash
   aws dynamodb get-item --region eu-central-1 --table-name DiaryMain-prod \
     --key '{"PK":{"S":"USER#<id>"},"SK":{"S":"ENTRY#<YYYY-MM-DD>"}}'
   # free_thought/note_to_partner/... → Map {enc_v,iv,tag,ct,dk}; mood_level/shared/date → plaintext
   ```
3. Через `/api/entries` тот же день отдаёт корректный plaintext (round-trip). Партнёр видит `note_to_partner`, не видит `free_thought`.

## Откат
**До первого зашифрованного сохранения** (сразу после Шага 1, если никто не сохранял):
- Откатить стек на предыдущую версию: задеплоить предыдущий коммит (`git checkout main && bash scripts/deploy-backend.sh`) или CloudFormation rollback. CMK останется (Retain) — это нормально, висит пустой ~$1/мес.

**После того как появились зашифрованные записи (лениво или backfill) — ⚠️ КРИТИЧНО:**
- Откат кода Lambda на дофичевую версию (без `crypto.ts`) сделает зашифрованные записи **нечитаемыми**: старый `get.ts` вернёт сырой EncBlob-Map вместо текста, `qualities/list` — тоже. То есть код-откат **небезопасен** после начала шифрования. Безопасный путь — оставаться на версии с шифрованием; чинить вперёд (forward-fix), а не назад.
- **CMK НЕ удалять и НЕ планировать удаление.** `DeletionPolicy/UpdateReplacePolicy: Retain` защищает от удаления при операциях со стеком, но ручное `schedule-key-deletion` / `disable-key` = **безвозвратная потеря всех зашифрованных данных пары**. Запрещено без отдельного решения PO.
- Ротация ключа (`EnableKeyRotation: true`) безопасна — AWS хранит старые версии материала, старый ciphertext читается.

## Оценка стоимости
- **CMK:** $1/мес за ключ (eu-central-1). Ротация ключа — бесплатно.
- **Запросы KMS:** $0.03 / 10 000 вызовов `GenerateDataKey`/`Decrypt`. Благодаря кэшу DEK (TTL 5 мин, ≤10k использований на тёплый контейнер) — единицы вызовов в день на пару → доли цента/мес.
- **Backfill:** разовый, на пару — десятки записей, копейки.
- **Итог:** ≈ **$1/мес** на стек (в пределах ориентира spec < $2/мес). Хранение растёт на ~+200 байт/поле (wrapped DEK) — при объёме «пара × запись/день» ничтожно (лимит item 400 КБ).

## Сводка `[NEEDS-CEO-APPROVAL]` (зелёные кнопки)
1. **Деплой стека (Шаг 1)** — влияет на живой прод ourdiary.love, создаёт CMK, включает шифрование:
   ```bash
   bash scripts/deploy-backend.sh
   ```
2. **Backfill прод-данных (Шаг 2)** — мутирует DiaryMain-prod (сначала всегда `--dry-run`):
   ```bash
   export AWS_REGION=eu-central-1 STAGE=prod
   export KMS_KEY_ID=$(aws kms describe-key --key-id alias/diary-content-prod --region eu-central-1 --query 'KeyMetadata.Arn' --output text)
   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' npx ts-node scripts/migrate-encrypt-content.ts --dry-run
   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' npx ts-node scripts/migrate-encrypt-content.ts
   ```

Предусловие к обоим: чистое рабочее дерево (Шаг 0). Фронт не деплоим.
