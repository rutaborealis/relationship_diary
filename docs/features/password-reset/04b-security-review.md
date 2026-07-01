# Security review — password-reset

> Автор: security-engineer · Вход: 01-requirements.md, 02-spec.md, 03-build-notes.md, ADR-0002, код · Ветка: `feat/password-reset`

## Вердикт (прогон 2, повторный после фикса): **PASS-WITH-NOTES**

[SEC-01] HIGH **закрыт**. В `confirm-reset.ts` сравнение кода теперь жёстко зашторено атомарным условным инкрементом: каждое timing-safe сравнение выполняется ТОЛЬКО после успешного `UpdateItem ADD attempts :one ConditionExpression attempts < :max`. DynamoDB сериализует условные апдейты на одном item, поэтому при любой конкуренции инкремент проходит максимум 5 раз (attempts 0→1→…→4→5), и ровно 5 сравнений достижимо на один код; 6-й запрос ловит `ConditionalCheckFailedException` → код удаляется. Off-by-one устранён (граница ровно 5). Success-path проходит тот же гейт (верная догадка после исчерпания лимита отвергается). Добавлен per-email confirm rate-limit `RESET#<email>/RLC` (20/час, нейтральный ответ). Прочие ошибки `UpdateItem` пробрасываются (не глотаются как лимит). Критических/high находок нет → блок деплоя снят.

Остаточные находки: **0 critical · 0 high · 0 medium · 6 low/info** (SEC-03..08, ни одна не блокирует; зафиксированы как риск/долг).

### Доказательство закрытия [SEC-01] (`confirm-reset.ts`)
- **Порядок операций — гейт перед сравнением:** rate-limit `allowConfirm` (`:59`) → `getItem` кода (`:61`) → TTL (`:64-68`) → **атомарный инкремент-гейт** (`:76-92`) → timing-safe сравнение **только после** успешного инкремента (`:96-97`) → success-path (`:102-111`). Сравнение на `:96` структурно недостижимо без успешного `UpdateCommand` на `:77-83` (любой путь в `catch` завершается `throw`).
- **Атомарность и граница 5:** `UpdateExpression: 'ADD attempts :one'` + `ConditionExpression: 'attempts < :max'`, `:max = config.auth.resetMaxAttempts = 5` (`app.config.ts:48`). `attempts` инициализируется `0` в `request-reset.ts:70`, поэтому условие проходит при attempts ∈ {0,1,2,3,4} = ровно 5 успешных инкрементов → ровно 5 сравнений на код. Условные апдейты DynamoDB на одном ключе сериализуются → N параллельных запросов не дают >5 сравнений (в отличие от прежней схемы, где сравнение шло до/в обход инкремента).
- **Обработка исключений:** только `err.name === 'ConditionalCheckFailedException'` (`:87`) трактуется как лимит → `deleteItem` + `INVALID_CODE`; иные ошибки `throw err` (`:91`) → 500 через `withErrorHandling`, не маскируются под лимит и не открывают обход.
- **Confirm RL без enumeration:** `allowConfirm` (`:23-47`) выполняется ДО lookup кода и при превышении отдаёт тот же `INVALID_CODE` (`:59`), что и все прочие сбои → состояние аккаунта/кода не раскрывается. Порог в config (`resetConfirmRateLimitPerHour=20`, `app.config.ts:52`), окно 1ч, TTL. RL read-then-write неатомарен (как request-reset RL) — допускает незначительное превышение 20/ч под гонкой, но это defence-in-depth поверх жёсткого per-code cap=5; SEC-01 не переоткрывает (расширение SEC-08, low).
- **Итоговая стойкость к перебору:** на код ≤5 догадок (жёстко); новый код требует `request-reset` (письмо жертве, RL 5/ч); confirm RL ≤20/ч. Против пространства 10^6 — статистический подбор нереалистичен. Отрицательная метрика FR-9 («0 успешных переборов в пределах лимита») выполняется.

---

## Вердикт (прогон 1): **FAIL** (исторический; устранён в прогоне 2)

Была находка **HIGH** ([SEC-01]): лимит попыток ввода кода (FR-9 — ядро защиты от перебора) обходился конкурентными запросами, потому что сравнение кода не «зашторено» счётчиком попыток, а у `confirm-reset` не было собственного rate-limit. Это подрывало заявленную метрику «0 успешных переборов кода в пределах лимита попыток».

Находок (прогон 1): **0 critical · 1 high · 0 medium · 6 low/info.**

## Чек-лист модели угроз

| # | Угроза | Результат | Доказательство |
|---|---|---|---|
| 1 | Anti-enumeration: ответ (existing/нет/не-verified/throttled) | PASS | `request-reset.ts:9,93-105` всегда `200`+`NEUTRAL_MESSAGE`; `confirm-reset.ts:12,24-49` единый `INVALID_CODE` (включая несуществующий email → `getItem`=null) |
| 1 | Anti-enumeration: тайминг (RESPONSE_FLOOR_MS) | PASS-with-note | floor 600мс добивает ветки (`request-reset.ts:99-103`); остаточная утечка при `sendEmail`>floor → [SEC-03] |
| 2 | Код: криптостойкость (`crypto.randomInt`, не `Math.random`) | PASS | `secure-code.ts:10-13` |
| 2 | Код: хранение хэша, не плейн | PASS | `request-reset.ts:68` `sha256(code)` |
| 2 | Код: TTL / одноразовость / перезапись старого | PASS | TTL 15м `request-reset.ts:61`; `deleteItem` `confirm-reset.ts:64`; overwrite обнуляет attempts |
| 2 | Код: timing-safe сравнение | PASS | `secure-code.ts:24-29`, `confirm-reset.ts:33` |
| 3 | Лимит попыток (атомарность, нельзя обойти гонкой) | **PASS** (прогон 2) | `confirm-reset.ts:76-97` — сравнение зашторено атомарным `ADD attempts :one ConditionExpression attempts < :max`; ровно 5 сравнений на код при любой конкуренции; [SEC-01] закрыт |
| 3 | Rate-limit запросов | PASS-with-note | `request-reset.ts:21-48` 5/час+1/60с по email; +confirm RL `RESET#<email>/RLC` 20/ч (`confirm-reset.ts:23-47`); неатомарность RL (low, расширение [SEC-08]) |
| 4 | Инвалидация JWT (FR-14/ADR-0002) | PASS | `auth-middleware.ts:16-20` сверка `tv`; `confirm-reset.ts:59` `if_not_exists(...)+1` (v1→v2 реально отзывает); `login.ts:25`/`verify-email.ts:66` кладут `tv`; регрессии нет |
| 5 | Смена пароля: bcrypt rounds=12, политика на сервере | PASS | `confirm-reset.ts:18,55`, `app.config.ts:44` |
| 5 | Инъекции в DynamoDB-выражения / IDOR | PASS | статичные `UpdateExpression`+placeholders; `userId` из серверной записи CODE, не из тела |
| 6 | Секреты и утечки (код/логи/бандл/ответы) | PASS | код/пароль/хэш не логируются (`request-reset.ts:96`, `confirm-reset.ts:75`); плейн-код только `localMode` (`ses.ts:23-29`) |
| 7 | IAM / least-privilege новых Lambda | PASS-with-note | `template.yaml:300-302,320-322` по конвенции, но шире нужного → [SEC-05] |
| 8 | Публичные эндпоинты без JWT (request/confirm-reset) | PASS | by design (FR-1/FR-7); данных аккаунта наружу не отдают |
| — | Известный долг: `Math.random` в register/verify-email | NOTE | `register.ts:20-22`, `verify-email.ts:18` → [SEC-07] (вне scope, A4) |

## Находки

### [SEC] high — ЗАКРЫТО (прогон 2) — лимит попыток кода обходился конкурентными запросами; у `confirm-reset` не было rate-limit  ·  [SEC-01]
> **Статус: RESOLVED** в прогоне 2. Доказательство закрытия — см. блок «Доказательство закрытия [SEC-01]» в начале документа (`confirm-reset.ts:76-97`, граница ровно 5, атомарный гейт перед сравнением, confirm RL). Ниже — исходное описание находки (исторически).
- **Где:** `backend/src/functions/auth/confirm-reset.ts:23-50` (исходная редакция до фикса)
- **Доказательство:** поток на каждый запрос — (1) `getItem` кода → (2) TTL → (3) `match = timingSafeEqualHex(...)` → (4) только при `!match` атомарный `ADD attempts ConditionExpression attempts < :max`. Сравнение кода (шаг 3) **не зависит** от счётчика: счётчик ограничивает число персистентных инкрементов, но НЕ число выполняемых сравнений. N параллельных `confirm-reset` для одного кода в окне TTL (15 мин) все читают запись и сверяют догадку до того, как 6-й неудачный `ADD` удалит код; N ограничен лишь конкурентностью Lambda (~1000 по умолчанию), а не значением 5. Собственного rate-limit у `confirm-reset` нет (RL только в `request-reset`). Пространство кода — 10^6. Связка «5 кодов/час → каждый код = ~сотни параллельных догадок» делает статистический подбор реальным за дни → захват чужого аккаунта; нарушается отрицательная метрика требований «0 успешных переборов в пределах лимита».
  - Дополнительно (тот же путь): *off-by-one* — код удаляется лишь на 6-м запросе (фактически 6 догадок, не 5); *success-path игнорирует счётчик* — при `match` пароль меняется без проверки `attempts`, т.е. верная догадка проходит и после исчерпания лимита.
  - Митигирующие факторы (честно): новый код требует `request-reset` → письмо ЖЕРТВЕ (5/час), атака шумная; полный подбор медленный. Поэтому high, не critical. Но контроль FR-9 концептуально не выполняет задачу.
- **Рекомендация:** ограничивать число *сравнений*, а не инкрементов. Сначала атомарный `UpdateCommand ADD attempts :one ConditionExpression attempts < :max` (`ReturnValues: UPDATED_NEW`), и сравнивать код ТОЛЬКО если инкремент прошёл (иначе сразу `INVALID_CODE`+delete) → максимум 5 сравнений на код при любой конкурентности. Дополнительно — короткий per-email rate-limit на `confirm-reset`; success-path тоже отвергать при исчерпанном лимите.

### [SEC] low — остаточная тайминговая утечка anti-enumeration при медленном Resend  ·  [SEC-03]
- **Где:** `backend/src/functions/auth/request-reset.ts:75-80,99-103`
- **Доказательство:** floor 600мс не ограничивает длительность `sendEmail`; если отправка превышает floor, ветка существующего verified-email отвечает медленнее несуществующей → утечка существования аккаунта по таймингу. Принято в spec (риск §7), но остаётся.
- **Рекомендация (необяз.):** выносить отправку письма с критического пути (async/очередь) либо `Promise.race` с дедлайном; floor подбирать выше p99 Resend.

### [SEC] low — `verifyToken` не фиксирует список алгоритмов  ·  [SEC-04]
- **Где:** `backend/src/lib/jwt.ts:29`
- **Доказательство:** `jwt.verify(token, secret, { issuer })` без `algorithms: ['HS256']`. Риск низкий (симметричный секрет; `alg:none` современный `jsonwebtoken` отвергает), но best-practice — пиннить алгоритм.
- **Рекомендация:** добавить `algorithms: ['HS256']`.

### [SEC] low/info — шире необходимого IAM на новых Lambda  ·  [SEC-05]
- **Где:** `infra/template.yaml:300-302,320-322`
- **Доказательство:** `SSMParameterReadPolicy: diary/*` даёт reset-функциям чтение `jwt-secret` и приватных VAPID-ключей, хотя нужен только `/diary/resend-api-key`; `DynamoDBCrudPolicy` — на всю таблицу. Соответствует конвенции проекта (поэтому info).
- **Рекомендация:** сузить SSM новых функций до `/diary/resend-api-key`.

### [SEC] low — `confirm-reset` по таймингу раскрывает наличие активного кода  ·  [SEC-06]
- **Где:** `backend/src/functions/auth/confirm-reset.ts:23-50`
- **Доказательство:** путь «нет записи» (быстрый null) короче пути «код есть» (compare + `UpdateCommand`); раскрывает наличие активного reset-кода для email (не существование аккаунта). Минор.

### [SEC] low/info — известный долг: слабые коды в register/verify-email (вне scope, A4)  ·  [SEC-07]
- **Где:** `backend/src/functions/auth/register.ts:20-22`, `verify-email.ts:18`
- **Доказательство:** `register` — `Math.random()` для кода; `verify-email` — нестойкое `!==`, плейн-код, без лимита попыток/RL — слабее, чем reset.
- **Рекомендация:** отдельной задачей перевести verify-email на `lib/secure-code.ts` (хэш + timing-safe + лимит).

### [SEC] low — неатомарный rate-limit `request-reset` (read-then-write)  ·  [SEC-08]
- **Где:** `backend/src/functions/auth/request-reset.ts:21-48`
- **Доказательство:** `getItem` RL → `putItem` RL без условия/атомарного инкремента; конкурентные запросы могут слегка превысить 5/час. Best-effort anti-flood, влияние минимально.

## Статус находок (прогон 2)

| ID | Severity | Статус | Примечание |
|---|---|---|---|
| SEC-01 | high | **RESOLVED** | атомарный инкремент-гейт перед сравнением + confirm RL; граница ровно 5 |
| SEC-03 | low | OPEN (accepted) | остаточный timing-leak при медленном Resend; принято spec, фикс необязателен |
| SEC-04 | low | OPEN (accepted) | `verifyToken` без `algorithms:['HS256']`; best-practice, не блокер |
| SEC-05 | low/info | OPEN (accepted) | шире-нужного IAM SSM `diary/*` на reset-Lambda; по конвенции проекта |
| SEC-06 | low | OPEN (accepted) | тайминг наличия активного кода (не существования аккаунта); confirm без floor |
| SEC-07 | low/info | OPEN (вне scope) | долг Math.random/плейн-код в register/verify-email; отдельная задача |
| SEC-08 | low | OPEN (accepted) | неатомарный RL `request-reset`; новый confirm RL `RESET#<email>/RLC` имеет тот же read-then-write паттерн — defence-in-depth поверх жёсткого per-code cap=5, SEC-01 не переоткрывает |

Ни одна остаточная находка не блокирует деплой (нет critical/high/medium).

## Не проверено
- Динамический прогон не выполнялся (DynamoDB Local не поднят, `:3000` занят — как у dev-lead). Находки доказаны статически; PoC брутфорса по [SEC-01] не запускался.
- Реальная конкурентность Lambda в аккаунте и латентность Resend в проде не измерялись — оценки в [SEC-01]/[SEC-03] по дефолтным лимитам AWS и типовым задержкам.
- Точное число сравнений, успевающих до `deleteItem` под высокой конкурентностью, — оценка сверху; требует нагрузочного теста.
- Реальная SSM/IAM-конфигурация в проде не инспектировалась (только `template.yaml`).
