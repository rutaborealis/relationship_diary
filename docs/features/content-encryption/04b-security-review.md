# Security-review

> Автор: security-engineer · Вход: 01-requirements.md, 02-spec.md, 03-build-notes.md, ADR 0001, код ветки `feat/content-encryption`
> Дата: 2026-06-30

## Вердикт: PASS-WITH-NOTES

Нет находок `critical`/`high`. Криптография реализована корректно (AES-256-GCM, уникальный IV на каждое шифрование, проверяемый auth tag, envelope с KMS-обёрткой DEK), модель приватности полей сохранена (`free_thought` ни в одном code path не дешифруется и не отдаётся партнёру), IDOR отсутствует (userId только из проверенного JWT), IAM по наименьшим привилегиям на конкретный CMK, CMK защищён `Retain`+`PendingWindowInDays:30`. Зафиксированы 4 находки `medium`/`low` (defense-in-depth и метаданные) — деплой не блокируют, но рекомендуются к фиксу.

## Чек-лист модели угроз
| # | Угроза | Результат | Доказательство |
|---|---|---|---|
| 1 | Криптография корректна (AES-256-GCM, уникальный IV, проверка tag, длина ключа) | PASS | `crypto.ts:186` свежий `randomBytes(12)` IV на каждое поле; `:187-188` GCM; `:218-223` `setAuthTag`+`final()` верифицирует tag; DEK `AES_256`/32 байта (`:75`, `:103`). DEK переиспользуется ≤10000 раз с 96-битным случайным IV — коллизия пренебрежима. |
| 2 | Envelope: data key не утекает в plaintext в хранилище/логи | PASS | Хранится только `dk` = wrapped DEK (`crypto.ts:195`, формат `{enc_v,iv,tag,ct,dk}`); plaintext DEK живёт только в памяти тёплого контейнера (`:131`,`:147`), в DynamoDB/логи/ответы не пишется. |
| 3 | Управление ключами (id/ключ из env, не хардкод; local-режим не активируется в проде) | PASS-WITH-NOTES | `kmsKeyId` из `process.env.KMS_KEY_ID` (`app.config.ts:56`), `localMasterKey` из env (`:60`). Local-режим в прод-`template.yaml` не включается (env не задаётся). Но нет жёсткого guard'а `STAGE=prod ⇒ localMode=false` и есть хардкод dev-ключа-фолбэка → SEC-01/SEC-02. |
| 4 | IAM least-privilege на конкретный CMK | PASS | `template.yaml:408-409`,`494-495`,`518-519` `kms:GenerateDataKey` на `!GetAtt DiaryContentKey.Arn` (не `*`); `:385`,`:471` `KMSDecryptPolicy` с `KeyId`; calendar/delete/notify-partner/remove — без KMS-прав. |
| 5 | CMK защищён от удаления | PASS | `template.yaml:103-104` `DeletionPolicy/UpdateReplacePolicy: Retain`; `:110` `PendingWindowInDays: 30`; `:109` `EnableKeyRotation: true`. |
| 6 | Приватность `free_thought` (не дешифруется и не отдаётся партнёру) | PASS | `get.ts:9` `PARTNER_VISIBLE_FIELDS` исключает `free_thought`; `:51` `free_thought: undefined` для партнёра; `:54` дешифруются только partner-visible. Сырой EncBlob `free_thought` наружу не уходит. |
| 7 | `note_to_partner` дешифруется только при верной связи; `shared===false` скрыт | PASS | Партнёр берётся из `me.partnerId` собственного профиля (`get.ts:34-35`), не из запроса; `:51` `shared===false ⇒ null`; calendar `:43-45` тоже скрывает чужой черновик. |
| 8 | Авторизация / IDOR (userId из JWT, не из запроса) | PASS | `requireAuth` → `verifyToken` (`auth-middleware.ts:5-9`); во всех затронутых хендлерах `PK=USER#${userId}` из JWT (`save.ts:23`, `get.ts:30-33`, `qualities create:18/update:15/list:12`, `delete.ts:11`). Чужой id подменить нельзя. |
| 9 | Утечки plaintext/DEK в логи, ошибки, бандл | PASS | `decryptField` логирует только `{event,reason,enc_v}` без контента/ciphertext (`crypto.ts:212,227`); `withErrorHandling` отдаёт 5xx как `Internal server error` (`errors.ts:24`); `notify-partner.ts:31-37` push без контента записи. |
| 10 | Миграция идемпотентна, без порчи/логирования plaintext, не авто-запуск | PASS | `migrate-encrypt-content.ts:36-38` шифрует только непустые строки, Map пропускает (идемпотентно); `:71` логирует PK/SK+имена полей, не значения; отдельный скрипт, прод-запуск под `[NEEDS-CEO-APPROVAL]`. |
| 11 | Деградация при недоступности KMS / битом поле без потери приватности | PASS | decrypt-сбой → `null`+лог, ответ не падает (`crypto.ts:216-229`, `get.ts:18-23` per-field); encrypt-сбой при save пробрасывается в 5xx — plaintext НЕ сохраняется (`save.ts:40`). |
| 12 | Календарь/push/delete не читают и не дешифруют контент | PASS | `calendar.ts:27-35` ProjectionExpression только `date`/`shared`; `delete.ts` ключ; `notify-partner.ts` контент не читает. |

> Пункты сквозной модели угроз проекта вне диффа фичи (JWT-подпись/срок и секрет из SSM, хэш пароля, перебор кода верификации, TTL/одноразовость инвайтов, VAPID-ключи в SSM, XSS во фронте) этой фичей не затрагиваются — `frontend/` и auth/partners/push-хендлеры в ветке не менялись. Регрессий не внесено; их полный аудит — вне scope данного review (см. «Не проверено»).

## Находки

- `[SEC]` severity:**medium** — Нет жёсткого guard'а против активации fake-KMS в проде.
  `config.crypto.localMode = isLocal || process.env.KMS_LOCAL === '1'` (`backend/config/app.config.ts:58`, `:2`), а выбор бэкенда — `config.crypto.localMode ? localBackend() : kmsBackend()` (`backend/src/lib/crypto.ts:122`). Защита от прод-активации только косвенная: прод-`template.yaml` не задаёт `KMS_LOCAL`/`DYNAMO_ENDPOINT`. Если любой из них окажется в прод-окружении (ошибка деплоя, отладочная переменная, ручной запуск миграции с `DYNAMO_ENDPOINT`), весь контент «зашифруется» локальным мастер-ключом вместо KMS, без алерта. Требование (модель угроз §2) явно требует, чтобы local-режим «НЕ мог случайно активироваться в проде».
  Рекомендация: добавить fail-fast при загрузке модуля — если `stage==='prod'` (или `!localMode`-ожидаемо), а `localMode===true` или `kmsKeyId` пуст → бросать ошибку; запретить выбор `localBackend()` при `STAGE=prod`.

- `[SEC]` severity:**low** — Хардкод dev-мастер-ключа в исходнике и бандле.
  `const DEFAULT_DEV_KEY = 'diary-local-dev-master-key-do-not-use-in-prod'` (`backend/src/lib/crypto.ts:96`) используется как фолбэк, если `LOCAL_ENC_KEY` не задан. Строка попадает в esbuild-бандл всех Lambda (crypto.ts импортируется в т.ч. функциями без KMS). Сам по себе в проде не применяется (KMS-бэкенд), но в связке с SEC-01 даёт «шифрование публично известным ключом». Не секрет прод-уровня, но крипто-ключ в репозитории/бандле.
  Рекомендация: убрать фолбэк-ключ; в local-режиме требовать явный `LOCAL_ENC_KEY` и падать при его отсутствии, а не подставлять предсказуемый ключ.

- `[SEC]` severity:**low** — Длина ciphertext раскрывает точную длину plaintext каждого поля.
  GCM без паддинга: `ct` ровно равен длине открытого текста (`backend/src/lib/crypto.ts:188`). Дамп таблицы не даёт содержимого, но раскрывает точную длину `free_thought`/`note_to_partner` и т.п. — метаданные, частично чувствительные для дневника. Вне целевой модели угроз v1 (защита от пассивного раскрытия содержимого), но фиксирую как остаточный риск.
  Рекомендация (опционально, кандидат на `enc_v:2`): паддинг до бакетов длины перед шифрованием, если метаданные длины посчитают чувствительными.

- `[SEC]` severity:**low** — Top-level `console.error(err)` в миграции может вывести объект ошибки SDK.
  `migrate-encrypt-content.ts:87` логирует весь `err`. На этом этапе значения уже ciphertext (encrypt прошёл), plaintext в ошибке не ожидается, но объект ошибки `updateItem`/SDK может содержать атрибуты записи (ciphertext) и ключи. Plaintext-утечки не выявлено; помечаю как «требует внимания при прод-прогоне».
  Рекомендация: логировать только `err.name`/`err.message` без сериализации payload элемента.

## Не проверено
- **JWT (подпись/`alg:none`/слабый секрет, срок), хэш пароля, перебор кода верификации, инвайты (TTL/одноразовость/чужой accept), VAPID-ключи в SSM, XSS/`dangerouslySetInnerHTML` во фронте** — эти области данной фичей не изменялись (нет правок в `frontend/`, `auth/`, `partners/`, `push/subscribe|settings|vapid-key`), поэтому полный аудит вне scope этого review; подтверждено только отсутствие новых регрессий в затронутых файлах.
- **Реальный прод-KMS round-trip и IAM в рантайме** — проверено по коду/`template.yaml`; живой запрос к AWS/KMS не выполнялся (нет прод-доступа), поведение подтверждено логикой `kmsBackend()` и политиками least-privilege.
- **CORS `AllowOrigin: '*'` + `Authorization`** (`template.yaml:25`, `errors.ts:15`) — пре-существующая конфигурация, не относится к фиче; т.к. используется Bearer-токен (не cookie), риск ограничен, но рекомендуется отдельно сузить origin вне рамок этого review.
- **Прод-backfill** не запускался (по требованию) — корректность идемпотентности подтверждена чтением кода и (по 03-build-notes) на DynamoDB Local; прод-прогон под `[NEEDS-CEO-APPROVAL]`.
