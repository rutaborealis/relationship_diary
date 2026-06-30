# Отчёт о тестировании

> Автор: qa-engineer · Вход: 01-requirements.md, 02-spec.md, 03-build-notes.md · Ветка: `feat/content-encryption`
> Дата: 2026-06-30

## Вердикт: **PASS**

Все 12 acceptance criteria закрыты. Шифрование контента at-rest подтверждено на полном
локальном стеке (DynamoDB Local + fake-KMS): в таблице лежит ciphertext-Map `{enc_v,iv,tag,ct,dk}`,
API отдаёт корректный plaintext (round-trip). Модель приватности не нарушена: партнёр получает
расшифрованный `note_to_partner`, поле `free_thought` партнёру не дешифруется и отсутствует в ответе.
Дефектов уровня blocker/major/minor не обнаружено. Несколько нефункциональных наблюдений ниже (не блокеры).

- AC PASS: **12 / 12**
- AC FAIL: **0**
- Регрессии (фронт/контракты): не обнаружены.

## Окружение прогона

- Backend typecheck: `npx tsc -p backend/tsconfig.json --noEmit` → exit 0.
- Frontend регресс: `cd frontend && npm run build` (`tsc -b && vite build`) → built OK, 1771 modules.
- Infra: `sam validate --lint` (из `infra/`) → "is a valid SAM Template".
- Локальный стек: `docker compose up -d` (DynamoDB Local :8000) → `setup-local-dynamo` → `npm run local` (:3000) с `KMS_LOCAL=1`, `LOCAL_ENC_KEY=change-me-local-dev-enc-key`, `JWT_SECRET=change-me-local-dev-secret`.
- Тестовые данные: 2 спаренных пользователя (Alice `qa-user-a` gender=f, Bob `qa-user-b` gender=m, `partnerId` друг на друга), JWT подписаны проектной либой `backend/src/lib/jwt.ts`.
- Реальный AWS KMS и реальная доставка Web Push **не дёргались** (по заданию) — см. «Не протестировано».

## Матрица: сценарий → AC → результат → доказательство

| AC | FR | Сценарий | Результат | Доказательство |
|---|---|---|---|---|
| AC-1 | FR-1, FR-8 | Сохранить запись с `free_thought`; прочитать item напрямую в DynamoDB | **PASS** | `free_thought` → Map `{enc_v:1, iv, tag, ct, dk}`, plaintext "my secret private thought" нигде не читается (raw get-item) |
| AC-2 | FR-5 | Владелец (Alice) открывает свою запись через `/api/entries` | **PASS** | Ответ: `free_thought:"my secret private thought"`, все контентные поля plaintext |
| AC-3 | FR-6 | Партнёр (Bob) открывает день Alice, `shared:true` | **PASS** | `partnerEntry.note_to_partner:"love you Bob"` — расшифрован |
| AC-4 | FR-6 | Партнёр запрашивает запись с `free_thought` | **PASS** | В `partnerEntry` ключ `free_thought` **отсутствует** целиком (не `null`, нет в JSON) |
| AC-5 | FR-7 | Партнёр запрашивает черновик `shared:false` | **PASS** | `partnerEntry:null` для draft 2026-06-29 |
| AC-6 | FR-9 | Владелец открывает legacy plaintext-запись (без `enc_v`) | **PASS** | Вставлен legacy item (строки) → `/api/entries` отдаёт plaintext-контент корректно |
| AC-7 | FR-10 | Пересохранение legacy-записи (ленивая миграция on-write) | **PASS** | После POST raw `free_thought`/`mood_text` стали Map `{enc_v:1,...}` |
| AC-8 | FR-11 | Backfill-скрипт: legacy + уже зашифрованные, повторный прогон | **PASS** | run1: `itemsUpdated=2 fieldsEncrypted=3`; run2: `itemsUpdated=0 fieldsEncrypted=0`; данные дешифруются после миграции |
| AC-9 | FR-4 | `mood_text` пустой → не должен стать ciphertext | **PASS** | raw `mood_text` = `{"S":""}` (plaintext пустая строка, не Map); чтение возвращает `""` |
| AC-10 | FR-3, FR-14 | Метаданные остаются открытыми | **PASS** | raw: `mood_level{N:4}`, `shared{BOOL:true}`, `gratitude_said{BOOL:true}`, `date`, `saved_at`, `updated_at` — plaintext; календарь строится на них |
| AC-11 | FR-13 | Push-payload партнёру не содержит контента | **PASS** (code review) | `notify-partner.ts` строит title/body из имени+пола отправителя, контент записи не читает; payload без полей записи |
| AC-12 | FR-12 | Одно поле не дешифруется → остальные ок | **PASS** | После порчи `free_thought.ct` ответ: `free_thought:null`, все прочие поля целы; лог `{event:'decrypt_failed',reason:'crypto_error',enc_v:1}` без контента |

### Дополнительно (вне нумерации AC, в scope FR-2)

| Проверка | FR | Результат | Доказательство |
|---|---|---|---|
| Qualities create → ciphertext at rest | FR-2 | **PASS** | raw `QUALITY#.text` = Map `{enc_v:1,...}` |
| Qualities list → plaintext | FR-2 | **PASS** | `/api/qualities` отдаёт `"patient and kind"` |
| Qualities update → перешифровка | FR-2 | **PASS** | После PATCH list отдаёт новый текст, raw `text.M.enc_v=1` |
| Calendar без дешифрования | FR-14 | **PASS** | `/api/calendar` отдаёт `{date:{mine/theirs}}`, ProjectionExpression только `date`/`shared` |
| IAM least-privilege (infra) | FR-1/FR-2 | **PASS** | get/qualities-list → `KMSDecryptPolicy`; save/qualities-create/update → `kms:GenerateDataKey`; calendar/delete/notify-partner/remove — без KMS-прав |

## Проверка приватности (личное vs общее) — отдельный фокус

| Правило | Проверка | Результат |
|---|---|---|
| `free_thought` — личное, не покидает контур автора | Bob читает запись Alice (`shared:true`) → `free_thought` отсутствует в JSON | **PASS** |
| `note_to_partner` — общее, дешифруется партнёру | Bob видит `"love you Bob"` | **PASS** |
| `free_thought` партнёру не **дешифруется** (а не просто вырезается) | В `entries/get.ts` `PARTNER_VISIBLE_FIELDS = ENCRYPTED_ENTRY_FIELDS.filter(f!=='free_thought')`; партнёрская ветка дешифрует только эти поля, `free_thought` затем `undefined` | **PASS** (код + e2e) |
| `shared===false` → запись партнёра не отдаётся целиком | `partnerEntry:null` для draft | **PASS** |
| Владелец видит своё `free_thought` | Alice читает своё → `free_thought` plaintext | **PASS** |

## Ciphertext-at-rest vs plaintext-API (ключевое доказательство)

Сырой item Alice (`USER#qa-user-a` / `ENTRY#2026-06-30`) из DynamoDB Local:
- Контентные поля (`free_thought`, `noticed_1`, `gratitude_1`, `closeness_text`, `note_to_partner`) — Map `{enc_v:1, iv, tag, ct, dk}`, читаемого текста нет.
- Все поля одной записи разделяют один `dk` (envelope DEK reuse), IV у каждого поля свой.
- Метаданные (`mood_level`, `shared`, `gratitude_said`, `date`, `saved_at`, `updated_at`, `user_id`) — открытые.
- Тот же запрос через `/api/entries` отдаёт полный plaintext (round-trip совпадает с тем, что сохраняли).

## Дефекты

Блокирующих/major/minor дефектов не выявлено.

## Наблюдения (не блокеры, для сведения security/devops)

- `[OBS]` (info) Wrapped data key `dk` переиспользуется (DEK-кэш encrypt-стороны) между полями, записями **и разными пользователями** в пределах тёплого контейнера (TTL 5 мин / 10k использований). Это соответствует spec §4 и ADR (envelope + кэш DEK ради цены/латентности); GCM-nonce (`iv`) свежий на каждое поле, переиспользования nonce нет. В at-rest модели угроз приемлемо (DEK всегда обёрнут KMS/мастер-ключом, дешифрование требует KMS). Отмечаю для security-review как осознанный trade-off.
- `[OBS]` (info, env-ограничение) `/api/notify-partner` локально возвращает 500: `webpush` тянет VAPID-ключи из SSM, которого нет в локальном стеке (`UnrecognizedClientException` в `ssm.ts`). Это не дефект фичи шифрования; тело ошибки — generic `Internal server error` без утечки контента (FR-13 соблюдён). Содержимое payload (без контента записи) проверено по коду.
- `[OBS]` (info) Пустой `mood_text` хранится как plaintext-строка `""` (а не удаляется из item). Соответствует FR-4 («пустая строка/null сохраняют семантику отсутствия»), не ciphertext — AC-9 закрыт.

## Не протестировано (с причиной)

- **Реальный AWS KMS (prod envelope):** по заданию не дёргается; проверено в эквивалентном fake-KMS режиме (алгоритм полей идентичен проду, отличается только wrap/unwrap DEK). Требует прод-ключа/IAM — этап DEPLOY.
- **Реальная доставка Web Push:** требует VAPID-ключей в SSM; локально недоступно. Проверено только построение payload по коду (AC-11). Доставка — за integration/prod.
- **Backfill над прод-данными:** только локальный прогон (AC-8). Прод-запуск гейтится `[NEEDS-CEO-APPROVAL]` на DEPLOY.
- **Playwright UI e2e:** приватность проверена на уровне API-контракта (источник истины для FR-6); отдельный UI-прогон не выполнялся — поведение полностью детерминируется ответом `/api/entries`, который протестирован напрямую.

## Артефакты

- Сырые дампы DynamoDB, ответы API и логи — в выводах QA-прогонов.
- Временные тест-файлы (`scripts/qa-seed.ts`, корневые `.env`/`.env.local`) созданы для прогона и удалены после; в коммит не входят.
