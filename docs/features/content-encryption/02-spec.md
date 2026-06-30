# Техническая спецификация

> Автор: architect · Вход: 01-requirements.md
> Модель шифрования зафиксирована PO: **at-rest server-side (KMS envelope)**. E2E вне scope.

## 1. Обзор решения

Вводим прозрачный для клиента слой шифрования контента **в хранилище**. Все контентные
текстовые поля записи дня (`mood_text`, `noticed_1..5`, `gratitude_1..5`,
`closeness_text`, `note_to_partner`, `free_thought`) и текст «качеств»
(`QUALITY#<id>.text`) шифруются на сервере перед записью в DynamoDB и расшифровываются
при чтении. Шифрование — envelope encryption: один симметричный **KMS CMK** + локальный
**AES-256-GCM** с кэшированием data key, чтобы KMS не вызывался на каждое поле/чтение
(стоимость и латентность). Каждое поле хранится как DynamoDB-Map `{ enc_v, iv, tag, ct, dk }`
с маркером версии `enc_v`; legacy plaintext (строка без маркера) читается как есть и
шифруется при следующем сохранении (ленивая миграция) + разовый идемпотентный backfill.
**Контракты API и форматы клиента не меняются** — клиент шлёт и получает plaintext;
вся криптография изолирована в новой либе `backend/src/lib/crypto.ts`. Метаданные
(`PK`, `SK`, `date`, `mood_level`, `gratitude_said`, `shared`, `saved_at`, `updated_at`,
GSI-поля) остаются открытыми — на них работают календарь, выборки и приватность черновика.
Модель приватности неизменна: `note_to_partner` расшифровывается для партнёра,
`free_thought` партнёру не расшифровывается и не отдаётся вовсе.

## 2. Архитектура

**Затронутые Lambda-хендлеры (backend):**

| Хендлер | Изменение | Нужен KMS |
|---|---|---|
| `entries/save.ts` | encrypt контентных полей перед `putItem` | GenerateDataKey |
| `entries/get.ts` | decrypt своих полей полностью; партнёру — только разрешённые, `free_thought` не дешифруется | Decrypt |
| `entries/calendar.ts` | **без изменений** — читает только `date`/`shared` (FR-14) | нет |
| `entries/delete.ts` | **без изменений** | нет |
| `qualities/create.ts` | encrypt `text` | GenerateDataKey |
| `qualities/update.ts` | encrypt `text` | GenerateDataKey |
| `qualities/list.ts` | decrypt `text` | Decrypt |
| `qualities/remove.ts` | **без изменений** | нет |
| `push/notify-partner.ts` | **без изменений** — не читает контент записи, push без текста (FR-13/AC-11) | нет |

**Новый код (backend):**
- `backend/src/lib/crypto.ts` — единая либа шифрования (см. §4).
- `backend/config/app.config.ts` — секция `crypto` (key id, local mode, TTL кэша).
- `scripts/migrate-encrypt-content.ts` — идемпотентный backfill (FR-11).

**Frontend:** изменений нет. `frontend/src/types/index.ts`, `api/index.ts`, страницы —
без правок (API по-прежнему отдаёт plaintext-строки).

**Infra:** `infra/template.yaml` — KMS CMK + alias, env `KMS_KEY_ID`, IAM-права на
GenerateDataKey/Decrypt профильным функциям.

**Поток данных (save):**
```
TodayPage → api.saveEntry (plaintext JSON)
  → API GW → entries/save.ts
      → crypto.encryptField(v) для каждого контентного поля
          → [cache miss] kms:GenerateDataKey → DEK + wrappedDEK   (cache hit: reuse)
          → AES-256-GCM(DEK, plaintext) → { enc_v, iv, tag, ct, dk }
      → putItem(DiaryMain)   // метаданные — plaintext, контент — Map-ciphertext
```

**Поток данных (get own):**
```
DayPage/TodayPage → api.getEntry → entries/get.ts → getItem(DiaryMain)
  → для каждого контентного поля crypto.decryptField(v):
       string (legacy) → вернуть как есть
       Map{enc_v} → unwrapDEK(dk) [cache по dk] → kms:Decrypt(1×) → AES-GCM decrypt
  → ok({ entry: plaintext, partnerEntry: plaintext-без-free_thought })
```

## 3. Контракты данных

**HTTP-эндпоинты — без изменений.** Запрос/ответ остаются plaintext; добавленных или
изменённых путей нет. Для полноты — затронутые (поведение прежнее, данные прозрачны):

| Метод | Путь | Request | Response | Auth |
|---|---|---|---|---|
| POST | /api/entries | `{date, mood_level, mood_text, …, free_thought, shared}` (plaintext) | `{ok:true}` | JWT |
| GET | /api/entries?date= | — | `{entry, partnerEntry}` (plaintext; partner без `free_thought`) | JWT |
| GET | /api/calendar | — | `Record<date,{mine?,theirs?}>` | JWT |
| GET/POST/PATCH | /api/qualities[/{id}] | `{text}` (plaintext) | plaintext | JWT |

**DynamoDB (DiaryMain) — изменяется только представление контентных полей:**

| Сущность | PK | SK | Контентные поля (новое представление) | Метаданные (без изменений) | Приватность |
|---|---|---|---|---|---|
| Diary entry | `USER#<id>` | `ENTRY#<date>` | `mood_text`, `noticed_1..5`, `gratitude_1..5`, `closeness_text`, `note_to_partner`, `free_thought` → **Map** `{enc_v,iv,tag,ct,dk}` | `mood_level`, `gratitude_said`, `shared`, `date`, `user_id`, `saved_at`, `updated_at` | `free_thought` личное; `note_to_partner` общее |
| Quality | `USER#<id>` | `QUALITY#<id>` | `text` → **Map** `{enc_v,iv,tag,ct,dk}` | `qualityId`, `userId`, `created_at` | личное |

**Формат зашифрованного поля (Map-атрибут):**
```
{
  enc_v: 1,            // number — версия схемы (FR-8)
  iv:    "<base64>",   // 12-байтовый GCM nonce
  tag:   "<base64>",   // 16-байтовый GCM auth tag
  ct:    "<base64>",   // ciphertext
  dk:    "<base64>"    // wrapped (KMS-encrypted) data key
}
```
- Пустое/`null`/отсутствующее поле **не** превращается в Map — остаётся `null`/отсутствует (FR-4, AC-9).
- Legacy plaintext = обычная String без `enc_v` → читается как есть (FR-9, AC-6).
- Новых GSI/таблиц **не требуется**: шифруются только не-индексируемые поля; все ключи
  выборок и календаря остаются открытыми (FR-3, FR-14).

## 4. Технологии и подходы

**Где сидит шифрование — новая либа `backend/src/lib/crypto.ts`.** Публичный API:
```ts
encryptField(plain: unknown): Promise<EncBlob | null | undefined>   // null/''/undef → passthrough
decryptField(stored: unknown): Promise<string | null>              // string → legacy; Map{enc_v} → decrypt; ошибка → null
ENCRYPTED_ENTRY_FIELDS: readonly string[]   // единый источник списка контентных полей записи
```
Внутри:
- **Envelope:** `kms:GenerateDataKey` (SYMMETRIC_DEFAULT, 256-bit) → `{Plaintext, CiphertextBlob}`.
  Контент шифруется локально `crypto.createCipheriv('aes-256-gcm', DEK, iv)`; IV — 12
  случайных байт на каждое поле (никогда не переиспользуется), `tag` из `getAuthTag()`.
- **Кэш DEK (encrypt):** плейн-текст DEK кэшируется в памяти тёплого контейнера с TTL
  (по умолчанию 5 мин) и лимитом числа использований; при истечении — новый GenerateDataKey.
  Все поля одного сохранения и соседние сохранения переиспользуют один DEK → один
  wrapped `dk` на запись. Минус — дублирование `dk` по полям (≈+200 байт/поле); приемлемо
  при объёме «пара × запись/день» (см. Риски).
- **Кэш DEK (decrypt):** расшифрованные DEK кэшируются по ключу = base64(`dk`). Чтение
  записи из 14 полей с одним `dk` = 1× `kms:Decrypt` + 13 попаданий в кэш.
- **Версия `enc_v: 1`** = «KMS-envelope + AES-256-GCM». Любой будущий формат → `enc_v: 2`,
  `decryptField` ветвится по версии (ротация — вне scope первой поставки, но заложена).
- **Устойчивость к ошибке (FR-12):** `decryptField` оборачивает unwrap+decrypt в try/catch;
  при сбое логирует `{event:'decrypt_failed', enc_v}` **без контента и без ciphertext** и
  возвращает `null`. Хендлер дешифрует каждое поле независимо → битое поле не роняет ответ
  (AC-12).
- **Никакого контента в логи/ошибки/push (FR-13):** либа логирует только метаданные;
  `withErrorHandling` уже скрывает тела 5xx; notify-partner контент не читает.

**Почему расширение хендлеров, а не новые эндпоинты:** шифрование прозрачно и не меняет
контракт — это чисто слой хранения. Минимальное хирургичное изменение — мапнуть контентные
поля через `encryptField`/`decryptField` в существующих save/get/qualities.

**Локальный режим (DynamoDB Local без KMS).** `crypto.ts` выбирает бэкенд envelope при
загрузке модуля:
- **prod:** KMS (`config.crypto.kmsKeyId`).
- **local** (`process.env.DYNAMO_ENDPOINT` задан или `KMS_LOCAL=1`): «fake KMS» — DEK
  оборачивается локальным мастер-ключом (`LOCAL_ENC_KEY`, 32 байта hex/base64; дефолтный
  dev-ключ если не задан) через AES-256-GCM. Алгоритм шифрования полей идентичен проду —
  меняется только wrap/unwrap DEK. Это позволяет QA проверить «в DynamoDB Local лежит
  ciphertext, API отдаёт plaintext» полностью локально (см. §6).

**Config (`backend/config/app.config.ts`):**
```ts
crypto: {
  kmsKeyId:        process.env.KMS_KEY_ID,        // CMK id/arn (prod)
  localMode:       isLocal || process.env.KMS_LOCAL === '1',
  localMasterKey:  process.env.LOCAL_ENC_KEY,     // dev only
  dataKeyTtlMs:    5 * 60 * 1000,
  dataKeyMaxUses:  10_000,
}
```

**Infra (`infra/template.yaml`):**
- `AWS::KMS::Key` (`SYMMETRIC_DEFAULT`, `EnableKeyRotation: true`) + `AWS::KMS::Alias`
  `alias/diary-content-<stage>`.
- Глобальный env `KMS_KEY_ID: !Ref DiaryContentKey` (только функции с IAM-правами его используют).
- IAM на CMK по принципу наименьших привилегий:
  - `kms:GenerateDataKey` → save, qualities/create, qualities/update, migration.
  - `kms:Decrypt` → get, qualities/list, migration.
  - calendar, delete, notify-partner, qualities/remove — **без** KMS-прав.
  Реализуется inline `Statement` (для GenerateDataKey канонной SAM-политики нет;
  `KMSDecryptPolicy` для Decrypt).

**Оценка стоимости:** 1 CMK ≈ **$1/мес**. Запросы при envelope+кэш: единицы в день на пару
(~$0.03 / 10 000 запросов) → доли цента. Итог ≈ $1/мес на стек, в рамках ориентира < $2/мес.

## 5. План реализации

Порядок: lib → config → infra → хендлеры → миграция → локальный режим.

- **T-1.** (backend) Создать `backend/src/lib/crypto.ts`: envelope encrypt/decrypt, кэш DEK
  (оба направления), формат `{enc_v,iv,tag,ct,dk}`, passthrough пустых/legacy, устойчивый
  decrypt, экспорт `ENCRYPTED_ENTRY_FIELDS`. Бэкенд envelope: KMS vs local-master по конфигу.
  → FR-1, FR-2, FR-4, FR-8, FR-9, FR-12, FR-13 · **готово:** `encryptField(x)`→`decryptField`
  даёт `x`; `encryptField(null|'')`→passthrough; строка-legacy проходит насквозь; битый Map
  → `null` + лог без контента.
- **T-2.** (backend/config) Добавить секцию `crypto` в `app.config.ts` и проброс `KMS_KEY_ID`
  / local-полей. → поддержка T-1/T-7 · **готово:** `config.crypto.kmsKeyId` читается из env,
  local-режим включается при `DYNAMO_ENDPOINT`.
- **T-3.** (backend) `entries/save.ts`: перед `putItem` прогнать каждое поле из
  `ENCRYPTED_ENTRY_FIELDS` через `encryptField` (метаданные не трогать). → FR-1, FR-3, FR-4,
  FR-10 · **готово:** сохранённый item в DynamoDB содержит Map с `enc_v` для непустых
  контентных полей; `mood_level/shared/gratitude_said/date/saved_at` — plaintext (AC-1, AC-9, AC-10).
- **T-4.** (backend) `entries/get.ts`: для `mine` — decrypt всех контентных полей; для `theirs`
  — decrypt только разрешённых (`mood_text`, `noticed_*`, `gratitude_*`, `closeness_text`,
  `note_to_partner`), `free_thought` **не дешифровать и не отдавать**; правило `shared===false`
  сохранить. → FR-5, FR-6, FR-7, FR-9, FR-12 · **готово:** AC-2/3/4/5/6, частичный сбой одного
  поля не роняет ответ (AC-12).
- **T-5.** (backend) Qualities: `create.ts`/`update.ts` — encrypt `text`; `list.ts` — decrypt
  `text`. → FR-2 · **готово:** в DynamoDB `QUALITY#*.text` — Map с `enc_v`; `/api/qualities`
  отдаёт plaintext; повторное редактирование перешифровывает.
- **T-6.** (backend) Подтвердить отсутствие изменений и регрессий в `calendar.ts`, `delete.ts`,
  `notify-partner.ts` (контент не читается, push без текста). → FR-13, FR-14 · **готово:**
  календарь строится на `date`/`shared` без дешифрования (AC-10); payload push без контента (AC-11).
- **T-7.** (infra) `infra/template.yaml`: KMS CMK + alias `alias/diary-content-${Stage}`,
  `EnableKeyRotation`, env `KMS_KEY_ID`, IAM GenerateDataKey/Decrypt профильным функциям. → FR-1/FR-2
  enablement · **готово:** `sam validate` ок; save получает GenerateDataKey, get/list — Decrypt,
  у calendar/delete/notify-partner KMS-прав нет.
- **T-8.** (migration) `scripts/migrate-encrypt-content.ts`: scan `DiaryMain`, фильтр
  `SK begins_with ENTRY#`/`QUALITY#`, для каждого plaintext-контентного поля — encrypt; Map с
  `enc_v` пропускать; писать назад. Идемпотентно, поддержка local и prod (env `KMS_KEY_ID`). → FR-11
  · **готово:** AC-8 на DynamoDB Local — все контентные поля становятся ciphertext, повторный
  прогон не портит зашифрованные. **Запуск над прод-данными = `[NEEDS-CEO-APPROVAL]` на этапе DEPLOY.**
- **T-9.** (dev/test) Локальный режим: «fake KMS» в `crypto.ts`, переменные `KMS_LOCAL`/
  `LOCAL_ENC_KEY` в `.env.local`-примере, обновить заметки локальной разработки. → тестируемость
  · **готово:** полный e2e (save→DynamoDB Local→get) проходит без реального KMS, в таблице ciphertext.

## 6. Тестируемость

**Наблюдаемость/мокаемость:**
- `crypto.ts` — единственная точка криптографии; в local-режиме работает без AWS (fake KMS),
  поэтому весь стек тестируется на `DynamoDB Local + npm run local + Vite`.
- Точки проверки: «сырое» значение в DynamoDB (Map с `enc_v`) vs plaintext в ответе API.

**Юнит/смоук (crypto.ts):** round-trip `encrypt→decrypt`; passthrough `null/''`; legacy-строка
проходит без изменений; повреждённый `ct`/`tag` → `decryptField` возвращает `null` и логирует
без контента.

**E2E (локальный стек):**
1. `docker compose up -d` → `npm run setup-local-dynamo` → `npm run local` (с `KMS_LOCAL=1`,
   `LOCAL_ENC_KEY`) → `cd frontend && npm run dev`.
2. AC-1/AC-9/AC-10: сохранить запись с `free_thought` и пустым `mood_text`; прочитать item
   напрямую из DynamoDB Local (`aws dynamodb get-item --endpoint-url http://localhost:8000`):
   `free_thought` — Map c `enc_v`, не читается как текст; пустое `mood_text` — отсутствует/`null`;
   `mood_level/shared/date` — plaintext.
3. AC-2: открыть свою запись через UI/`/api/entries` — все поля, включая `free_thought`, plaintext.
4. AC-3/AC-4/AC-5: вторым пользователем открыть день партнёра — `note_to_partner` расшифрован;
   `free_thought` отсутствует; `shared===false` запись не отдаётся.
5. AC-6/AC-7: вручную вставить legacy-item (plaintext-строки без `enc_v`) → открывается корректно;
   пересохранить → в таблице становится ciphertext.
6. AC-8: прогнать `migrate-encrypt-content.ts` дважды → все контентные поля ciphertext,
   второй прогон не меняет уже зашифрованные.
7. AC-11: при сохранении проверить payload notify-partner (лог/перехват) — нет контента записи.
8. AC-12: подменить `ct` одного поля на мусор → `/api/entries` возвращает остальные поля, это
   поле `null`, в логе `decrypt_failed` без контента.

**Playwright против :5173** — сценарии приватности (партнёр видит `note_to_partner`, не видит
`free_thought`) поверх UI, как существующие e2e.

## 7. Риски и trade-offs

- **Дублирование wrapped-DEK по полям** (≈+200 байт/поле, ~+2.5 КБ на запись из 14 полей) →
  при текущем объёме (пара, запись/день) ничтожно (лимит item 400 КБ). Митигация при росте —
  перейти на item-level один `enc_dk` (потребует `enc_v: 2`); заложено версионированием.
- **Сбой/недоступность KMS на чтении** → запись не дешифруется. Митигация: кэш DEK снижает
  частоту вызовов; FR-12 деградирует по полю, ответ не падает целиком; алерт по `decrypt_failed`.
- **Потеря/отключение CMK** = потеря доступа к данным. Митигация: `EnableKeyRotation`, запрет
  удаления ключа (политика), CMK в том же регионе/стеке; не планировать schedule-deletion.
- **Backfill над прод-данными — изменение прод-данных** → помечено `[NEEDS-CEO-APPROVAL]` на
  этапе DEPLOY; до одобрения работает только ленивая on-write миграция (новые/пересохранённые
  записи). Скрипт идемпотентен и проверяется на DynamoDB Local заранее.
- **Гонка при ротации DEK-кэша** в конкурентных инвокациях — безвредна: каждый контейнер
  держит свой DEK; разные `dk` в разных полях допустимы (decrypt по `dk` каждого поля).
- **Инсайдер с доступом к рантайму + KMS** — вне модели угроз v1 (домен E2E), зафиксировано в
  ADR и требованиях (§6, §8 requirements). Не блокер.
- Противоречий в требованиях, требующих `[NEEDS-BA]`, не выявлено: модель приватности, набор
  полей и метаданных, стратегия миграции внутренне согласованы.

## 8. Архитектурные решения (ADR)

- `docs/adr/0001-content-encryption-at-rest-kms-envelope.md` — выбор KMS envelope encryption
  at-rest, формат `{enc_v,iv,tag,ct,dk}`, кэширование DEK, отклонение E2E и DynamoDB-native-only.
