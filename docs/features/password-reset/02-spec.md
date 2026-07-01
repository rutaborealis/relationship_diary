# Техническая спецификация

> Автор: architect · Вход: 01-requirements.md

## 1. Обзор решения

Self-service сброс пароля по email через **6-значный криптостойкий одноразовый код** (как verify-email), доставляемый Resend. Два публичных эндпоинта: `POST /api/auth/request-reset` (anti-enumeration: всегда одинаковый ответ и постоянное время) и `POST /api/auth/confirm-reset` (код + новый пароль). Код хранится в `DiaryMain` как сущность `RESET#<email>/CODE` с TTL, счётчиком попыток и SHA-256-хэшем кода; rate limiting — в соседней `RESET#<email>/RL`. Инвалидация ранее выданных stateless-JWT (FR-14) решается через поле `tokenVersion` в профиле, которое инкрементится при смене пароля и проверяется в `requireAuth` (см. ADR-0002). На фронте — две новые страницы (`ForgotPasswordPage`, `ResetPasswordPage`) и ссылка «Забыли пароль?» с `LoginPage`. После успешного сброса — редирект на логин (не авто-вход), что даёт чистую семантику «вышли со всех устройств».

## 2. Архитектура

**Frontend (новое):**
- `pages/auth/ForgotPasswordPage.tsx` — ввод email → `api.requestReset` → переход на `/reset-password`.
- `pages/auth/ResetPasswordPage.tsx` — ввод кода + новый пароль + подтверждение → `api.confirmReset` → редирект `/login` c success-toast.
- `LoginPage.tsx` — добавить ссылку `<Link to="/forgot-password">Забыли пароль?</Link>`.
- `App.tsx` — два публичных маршрута `/forgot-password`, `/reset-password`.
- `store/index.ts` — переиспользуем `pendingEmail` для проброса email между двумя экранами (как verify-email).
- `api/index.ts` — `requestReset`, `confirmReset`.

**Backend (новое):**
- `functions/auth/request-reset.ts` — Lambda: нормализует email, резолвит юзера, генерирует код, пишет `RESET#<email>/CODE`, шлёт письмо. Anti-enumeration + постоянное время.
- `functions/auth/confirm-reset.ts` — Lambda: валидирует код (TTL, попытки, timing-safe), обновляет `passwordHash`, инкрементит `tokenVersion`, удаляет код, шлёт инфо-письмо (FR-17).
- `lib/secure-code.ts` (новое) — `generateNumericCode(len)` на `crypto.randomInt`, `sha256(s)`, `timingSafeEqualHex(a,b)`.
- `lib/auth-middleware.ts` (изменение) — `requireAuth` дочитывает профиль и сверяет `tokenVersion` из JWT с профилем (ADR-0002).
- `lib/jwt.ts` (изменение) — payload расширяется полем `tv` (tokenVersion).

**Поток данных (запрос сброса):**
```
ForgotPasswordPage → api.requestReset(email)
  → POST /api/auth/request-reset (CloudFront → API GW → Lambda request-reset)
    → EMAIL#<email>/USER (lookup) → USER#<id>/PROFILE (emailVerified?)
    → put RESET#<email>/CODE {codeHash, ttl, attempts:0, userId}
    → проверка/обновление RESET#<email>/RL (rate limit)
    → sendEmail (Resend)  [только если user существует и verified]
  ← 200 { message: "Если такой email зарегистрирован..." }  (всегда, постоянное время)
```

**Поток данных (подтверждение):**
```
ResetPasswordPage → api.confirmReset(email, code, newPassword)
  → POST /api/auth/confirm-reset (Lambda confirm-reset)
    → get RESET#<email>/CODE → TTL? attempts<5? timingSafeEqual(codeHash)?
       неверно → ADD attempts 1 (atomic), при attempts>=5 → delete
    → bcrypt.hash(newPassword) → UpdateItem USER#<id>/PROFILE
         SET passwordHash, ADD tokenVersion 1   (атомарно)
    → delete RESET#<email>/CODE
    → sendEmail "пароль изменён" (FR-17)
  ← 200 { message: "Пароль изменён" }
ResetPasswordPage → navigate('/login')   (старые JWT теперь невалидны — ADR-0002)
```

## 3. Контракты данных

**HTTP-эндпоинты:**

| Метод | Путь | Request | Response | Auth |
|---|---|---|---|---|
| POST | /api/auth/request-reset | `{ email }` | `200 { message: "Если такой email зарегистрирован, мы отправили инструкции." }` — **всегда**, для любого email | нет |
| POST | /api/auth/confirm-reset | `{ email, code, newPassword }` | `200 { message: "Пароль изменён. Войдите с новым паролем." }` | нет |

**Коды ошибок `confirm-reset`** (намеренно неспецифичны — не раскрывают существование аккаунта сверх факта получения письма):
- `400 { error: "Missing required fields" }` — отсутствует email/code/newPassword.
- `400 { error: "Password must be at least 8 characters" }` — нарушение политики (FR-10).
- `400 { error: "Неверный или истёкший код" }` — нет записи / истёк TTL / неверный код / исчерпан лимит попыток. Один обобщённый текст на все случаи (FR-9, AC-7, AC-8).

`request-reset` практически не возвращает ошибок наружу (даже rate-limit → нейтральный 200, AC-10); 400 только при отсутствующем `email` в теле.

**DynamoDB (DiaryMain):**

| Сущность | PK | SK | Атрибуты | Приватность |
|---|---|---|---|---|
| Код сброса | `RESET#<email>` | `CODE` | `codeHash` (SHA-256 hex), `ttl` (epoch s, +15 мин), `attempts` (number, старт 0), `userId`, `created_at` | секрет (не шарится; не логируется) |
| Rate-limit | `RESET#<email>` | `RL` | `count` (number), `windowStart` (epoch s), `ttl` (epoch s, окно +1 ч) | служебное |
| User profile *(изменение)* | `USER#<id>` | `PROFILE` | **+`tokenVersion`** (number, default 1) | личное |

- Хранится **SHA-256-хэш** кода, не сам код — defense-in-depth (плейн-секрет не лежит в БД/дампах/логах, помогает AC-13). Сравнение — `timingSafeEqual` по хэшам.
- TTL на `CODE`/`RL` — нативный DynamoDB TTL (атрибут `ttl`), как у `VERIFY#`/`INVITE#`. Авто-уборка истёкших записей.
- Lookup только по PK/SK — **новый GSI не нужен**.
- `userId` кладётся в `CODE` при запросе → `confirm-reset` не делает повторный `EMAIL#`-lookup и не зависит от изменений профиля.

## 4. Технологии и подходы

**Код, а не ссылка-токен (FR-4, A1).** Берём 6-значный числовой код — единый UX и канал с verify-email, простой ввод `inputMode="numeric"` на телефоне, не требует обработки deep-link в `main.tsx`/`App.tsx`. Ссылка-токен (FR-20) рассмотрена и отклонена как лишняя сложность для PWA при равной безопасности (энтропия достигается длиной/крипто-генерацией кода; здесь — короткий TTL + лимит попыток + rate limit вместо длинного токена).

**Криптостойкая генерация (FR-4, A4).** `crypto.randomInt(0, 1_000_000)` с `padStart(6,'0')` в новом `lib/secure-code.ts`. Никакого `Math.random` (текущий register.ts/verify-email — это нарушение; замена там вне scope, фиксируется как наблюдение для безопасника, A4). 6 цифр = 10^6 пространство; при лимите 5 попыток и TTL 15 мин подбор статистически невозможен.

**Одноразовость и «один активный код» (FR-5, FR-13).** `request-reset` делает `putItem` на `RESET#<email>/CODE` — перезапись стирает прежний код и сбрасывает `attempts` в 0. `confirm-reset` при успехе делает `deleteItem` — повторное использование невозможно (AC-6, AC-9).

**Лимит попыток (FR-9).** При неверном коде — атомарный `UpdateCommand` `ADD attempts :1` с `ConditionExpression attempts < :max` (max=5). При нарушении условия (исчерпан лимит) — `deleteItem` кода и обобщённая ошибка. Счётчик живёт на самой записи кода, поэтому новый код (перезапись) обнуляет его.

**Timing-safe сравнение (FR-8).** `crypto.timingSafeEqual(Buffer.from(storedHash,'hex'), Buffer.from(sha256(inputCode),'hex'))` — буферы равной длины (32 байта), безопасно.

**Anti-enumeration + постоянное время (FR-2, AC-2, AC-3, A8).** `request-reset` всегда возвращает один и тот же 200 с нейтральным текстом. Постоянное время достигается так:
1. Никаких ранних `return`/`throw` по веткам «нет юзера»/«не verified».
2. Отправка письма — **не на критическом пути ответа**: выполняется только для существующего verified-юзера, но через паттерн «сделать работу до фиксированного дедлайна». Конкретно — общий бюджет ответа фиксируется константой (`RESPONSE_FLOOR_MS`, напр. 600 мс): в конце handler `await sleep(max(0, floor - elapsed))`. Письмо отправляется внутри бюджета; для несуществующего email его не шлём, но тот же `sleep` добивает до floor. Floor выбран с запасом над типичной задержкой Resend, чтобы ветки были неотличимы и при этом UX оставался приемлемым (NFR §6).
3. Rate-limit и «не verified» тоже возвращают нейтральный 200 (AC-10).

**Rate limiting (FR-6, AC-10).** Скользящее окно на `RESET#<email>/RL`: при запросе читаем запись; если `windowStart` старше 1 ч — сбрасываем (`count=1`, `windowStart=now`); иначе `count++`. Порог: **5 запросов / час** на email и **не чаще 1 раза в 60 с** (минимальный интервал — по `windowStart`/последней метке). Превышение → пропускаем отправку письма, но возвращаем тот же нейтральный 200 (анти-энумерация сохраняется). Ключ — email (клиентский IP в Lambda за CloudFront ненадёжен и легко обходится; email-ключ напрямую закрывает email-флуд и защиту канала Resend — главную цель FR-6). Капча — не требуется для v1 (открытый вопрос BA закрыт: rate limit достаточно).

**Инвалидация stateless-JWT (FR-14) → ADR-0002.** Добавляем `tokenVersion` в профиль. JWT несёт `tv`. `requireAuth` дочитывает профиль и сверяет `tv` JWT == `profile.tokenVersion`; несовпадение → 401 (`api/index.ts` уже делает авто-logout на 401 — AC-11 закрывается автоматически). `confirm-reset` инкрементит `tokenVersion` (`ADD tokenVersion :1`) в той же `UpdateItem`, что и `passwordHash` → все ранее выданные токены мгновенно протухают. Цена — один `GetItem` профиля на каждый аутентифицированный запрос; для приложения на 2 пользователей это пренебрежимо (детальный разбор и альтернативы — в ADR).

**Влияние на login/me.** `login.ts` и `verify-email.ts` обязаны класть актуальный `tv` в `signToken` (читают/создают профиль — данные под рукой). Бэкфилл: профили без `tokenVersion` трактуются как `tv=1` (отсутствие атрибута == 1) и в `requireAuth`, и при подписи — миграция данных не требуется.

**Авто-вход vs редирект (FR-15, A6).** Выбран **редирект на `/login`** после успешного сброса: проще, безопаснее (свежий вход новым паролем), и логически согласуется с «вышли со всех устройств». Авто-вход (выдать новый токен с новым `tv`) — допустимая альтернатива, но добавляет связность; оставлен как опция, не для v1.

**Инфра.** Два новых `AWS::Serverless::Function` по образцу `AuthVerifyEmailFunction`:
- `AuthRequestResetFunction` → `DynamoDBCrudPolicy(DiaryMainTable)` + `SSMParameterReadPolicy(diary/*)` (SSM нужен для Resend-ключа), путь `/api/auth/request-reset` POST.
- `AuthConfirmResetFunction` → те же политики (Crud — пишет profile, удаляет код), путь `/api/auth/confirm-reset` POST.
- `AuthLoginFunction` сейчас имеет `DynamoDBReadPolicy` — остаётся read (login только читает). Все хендлеры под `requireAuth` уже имеют ≥ read к `DiaryMain`, поэтому доп. чтение профиля в middleware не требует изменений IAM.
- Новый GSI/таблица не нужны.

## 5. План реализации

**Backend**
- **T-1.** (backend) `lib/secure-code.ts`: `generateNumericCode(len=6)` на `crypto.randomInt`, `sha256(str)→hex`, `timingSafeEqualHex(a,b)`. → FR-4, FR-8 · готово: юнит-проверка — 1000 генераций дают только 6-значные строки, сравнение не падает на разной длине.
- **T-2.** (backend) `lib/jwt.ts`: расширить `JwtPayload`/`signToken` полем `tv` (number, опционально, default 1); `verifyToken` возвращает `tv`. → FR-14 · готово: токен содержит `tv`, существующие вызовы компилируются.
- **T-3.** (backend) `lib/auth-middleware.ts`: `requireAuth` после verify дочитывает `USER#<id>/PROFILE`, при `(payload.tv ?? 1) !== (profile.tokenVersion ?? 1)` → `HttpError(401)`; профиль отсутствует → 401. → FR-14, AC-11 · готово: запрос со «старым» tv получает 401.
- **T-4.** (backend) `functions/auth/request-reset.ts`: нормализация email, lookup `EMAIL#`+`PROFILE`, проверка `emailVerified`, rate-limit (`RESET#<email>/RL`), генерация+`putItem` кода (`RESET#<email>/CODE`, SHA-256, TTL 15 мин, attempts 0, userId), отправка письма с кодом (RU, стиль verify-email), постоянное время через `RESPONSE_FLOOR_MS`. Всегда нейтральный 200. → FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-16 · готово: для существующего verified email письмо уходит; для несуществующего/не-verified — нет; ответ и тайминг идентичны.
- **T-5.** (backend) `functions/auth/confirm-reset.ts`: валидация полей и политики пароля (≥8), `getItem` кода, проверки TTL/attempts/timing-safe, атомарный `UpdateItem` (`passwordHash` + `ADD tokenVersion 1`), `deleteItem` кода, инкремент attempts при ошибке с `ConditionExpression attempts<5` и удалением при исчерпании, инфо-письмо «пароль изменён» (FR-17). → FR-7, FR-8, FR-9, FR-10, FR-12, FR-13, FR-14, FR-17 · готово: верный код меняет пароль и инвалидирует токены; неверный наращивает счётчик; 5-я ошибка убивает код; повтор/истёкший/использованный код отклонён.
- **T-6.** (backend) `login.ts` и `verify-email.ts`: класть `tv: profile.tokenVersion ?? 1` (для verify — `1`) в `signToken`. → FR-14 · готово: свежие логины несут актуальный `tv`, не ловят ложный 401.
- **T-7.** (backend) Конфиг: в `config.auth` добавить `resetCodeLength` (6), `resetCodeTtlMin` (15), `resetMaxAttempts` (5), `resetRateLimitPerHour` (5), `resetResponseFloorMs` (600). → FR-4, FR-6, FR-9 · готово: пороги вынесены в конфиг, не хардкод.

**Frontend**
- **T-8.** (frontend) `api/index.ts`: `requestReset({email})→{message}`, `confirmReset({email,code,newPassword})→{message}`. → FR-1, FR-7 · готово: вызовы типизированы, идут на новые пути.
- **T-9.** (frontend) `ForgotPasswordPage.tsx`: форма email, `setPendingEmail`, вызов `requestReset`, нейтральный toast, переход `/reset-password`. Стиль `LoginPage`/`VerifyEmailPage`. → FR-18, FR-19 · готово: экран рендерится, отправляет запрос, ведёт на след. шаг.
- **T-10.** (frontend) `ResetPasswordPage.tsx`: поля код (`inputMode=numeric`, maxLength 6), новый пароль, подтверждение; клиентская проверка совпадения и длины ≥8 (FR-11), вызов `confirmReset`, при успехе toast + `navigate('/login')`. Если нет `pendingEmail` → редирект на `/forgot-password`. → FR-10, FR-11, FR-15, FR-19 · готово: несовпадение/короткий пароль блокируются на клиенте; успех ведёт на логин.
- **T-11.** (frontend) `LoginPage.tsx`: ссылка «Забыли пароль?» → `/forgot-password`. `App.tsx`: маршруты `/forgot-password`, `/reset-password` (публичные). → FR-18 · готово: ссылка видна на логине и открывает флоу (AC-14).

**Infra**
- **T-12.** (infra) `template.yaml`: `AuthRequestResetFunction` и `AuthConfirmResetFunction` (по образцу verify-email; `DynamoDBCrudPolicy` + `SSMParameterReadPolicy`; пути POST). → FR-1, FR-7 · готово: `sam build` проходит, эндпоинты доступны через API GW.

## 6. Тестируемость

- **Локальный стек:** DynamoDB Local (`docker compose up -d` + `npm run setup-local-dynamo`) + `npm run local` (:3000) + Vite (:5173). `config.ses.localMode` включается при `DYNAMO_ENDPOINT` → письма **не уходят**, а печатаются в консоль (`lib/ses.ts`) — код сброса виден в логе `npm run local` (мок Resend «из коробки», секрет в проде в логи не попадает — FR-16/AC-13).
- **Наблюдаемые точки:** код берётся из консольного лога локального сервера; запись `RESET#<email>/CODE` инспектируется в DynamoDB Local; `tokenVersion` в `USER#<id>/PROFILE` до/после сброса.
- **e2e (Playwright против :5173 или ручной прогон):**
  - AC-1/AC-2/AC-3: запрос для verified / несуществующего / не-verified email → одинаковый текст ответа; письмо в логе только для verified. Тайминг: замерить время ответа всех трёх — разброс в пределах джиттера вокруг `RESPONSE_FLOOR_MS`.
  - AC-4/AC-5: верный код + новый пароль → вход новым паролем ок, старым — 401.
  - AC-6/AC-7/AC-9: повтор использованного / истёкшего (ускорить — выставить `ttl` в прошлое в DynamoDB Local) / перезатёртого кода → отклонён.
  - AC-8: 5 неверных вводов → код мёртв, нужен новый.
  - AC-11: получить JWT, сбросить пароль, дернуть `/api/auth/me` старым JWT → 401.
  - AC-12: пароль <8 или несовпадение подтверждения → блок на клиенте, без запроса; прямой POST с коротким паролем → 400 на сервере.
  - AC-13: греп логов на код/пароль/passwordHash → отсутствуют.
  - AC-14: на `/login` видна ссылка, ведёт во флоу.
- **Регрессии (метрика «без регрессий»):** прогнать register → verify → login после изменения `requireAuth`/`signToken` — `tv` не ломает существующие сессии (профили без атрибута == `tv 1`).

## 7. Риски и trade-offs

- **Доп. `GetItem` профиля на каждый аутентифицированный запрос** (из-за tokenVersion) → +латентность/стоимость. Митигация: приложение на 2 пользователей, объём ничтожен; альтернативы (`passwordChangedAt` vs `iat`; деградация до проверки только на чувствительных путях) разобраны в ADR-0002. Обратимо.
- **Постоянное время (`RESPONSE_FLOOR_MS`) vs UX.** Слишком большой floor → медленный ответ легитимному юзеру; слишком малый → различимы ветки (задержка Resend «торчит»). Митигация: floor с запасом над p95 Resend (стартово 600 мс), вынесен в конфиг, подбирается по факту. Холодный старт Lambda даёт джиттер на обеих ветках одинаково.
- **Rate-limit по email, не по IP.** За CloudFront client IP в Lambda ненадёжен. Email-ключ закрывает главную цель (email-флуд, защита канала Resend), но не распределённый перебор разных email. Для перебора кода это не критично (лимит попыток на код + крипто-код + TTL). Капча отложена (закрытый вопрос BA). Принято для v1.
- **Хранение SHA-256 кода без соли.** 6-значный код — малое пространство, но запись живёт ≤15 мин, под TTL, и хэш не утекает наружу (FR-16); цель хранения хэша — не пускать плейн-секрет в дамп/лог, а не противостоять офлайн-перебору (от него защищает TTL+лимит попыток). Принято.
- **Math.random в register/verify-email остаётся (A4).** Вне scope; зафиксировано как наблюдение для security-engineer — verify-email-код стоит перевести на `lib/secure-code.ts` отдельной задачей.
- **Приватность партнёра (A7).** Флоу не читает/не пишет контент записей, партнёр не уведомляется; разграничение `free_thought`/`note_to_partner` не затрагивается. Риск отсутствует.
- **FR-17 «пароль изменён» письмо** включено в v1 (T-5) — дёшево, повышает доверие; при сбое отправки не должно ронять успешный сброс (отправка best-effort, ошибка только логируется).

Блокирующих/нереализуемых требований нет — `[NEEDS-BA]` не требуется.

## 8. Архитектурные решения (ADR)

- [ADR-0002 — Инвалидация stateless-JWT после смены пароля через tokenVersion](../../adr/0002-jwt-invalidation-token-version.md)
