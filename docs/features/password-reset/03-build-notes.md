# Заметки по реализации

> Автор: dev-lead · Вход: 02-spec.md

## Сделанные задачи
- [x] **T-1** — `backend/src/lib/secure-code.ts`: `generateNumericCode(len=6)` на `crypto.randomInt`, `sha256(str)→hex`, `timingSafeEqualHex(a,b)` (false без утечки таймингом при разной длине). Smoke: 1000 генераций → все 6-значные, 1000 distinct; сравнение корректно.
- [x] **T-2** — `backend/src/lib/jwt.ts`: `JwtPayload` расширен опциональным `tv` (tokenVersion). `signToken` принимает его, `verifyToken` отдаёт. Отсутствие == 1.
- [x] **T-3** — `backend/src/lib/auth-middleware.ts`: `requireAuth` после verify дочитывает `USER#<id>/PROFILE`; нет профиля или `(payload.tv ?? 1) !== (profile.tokenVersion ?? 1)` → `HttpError(401)`.
- [x] **T-4** — `backend/src/functions/auth/request-reset.ts`: нормализация email, lookup `EMAIL#`+`PROFILE`, проверка `emailVerified`, rate-limit `RESET#<email>/RL` (5/час + не чаще 1/60с, скользящее окно), генерация+`putItem` `RESET#<email>/CODE` (SHA-256, TTL 15 мин, attempts 0, userId), письмо с кодом (RU). Всегда нейтральный 200; постоянное время через `resetResponseFloorMs`; внутренние ошибки глотаются/логируются без секретов.
- [x] **T-5** — `backend/src/functions/auth/confirm-reset.ts`: валидация полей + пароль ≥8, `getItem` кода, TTL, **атомарный условный инкремент-гейт ДО сравнения** (см. фикс SEC-01/BUG-1 ниже), timing-safe сравнение хэшей, атомарный `SET passwordHash, tokenVersion = if_not_exists(tokenVersion,:1)+:1`, `deleteItem` кода, best-effort письмо «пароль изменён». Один обобщённый текст ошибки `Неверный или истёкший код`. Email-keyed rate-limit `RESET#<email>/RLC`.
- [x] **T-6** — `login.ts` кладёт `tv: profile.tokenVersion ?? 1`; `verify-email.ts` — `tv: 1`.
- [x] **T-7** — `backend/config/app.config.ts`: `resetCodeLength` 6, `resetCodeTtlMin` 15, `resetMaxAttempts` 5, `resetRateLimitPerHour` 5, `resetResponseFloorMs` 600, `resetConfirmRateLimitPerHour` 20 (добавлен при фиксе SEC-01).
- [x] **T-8** — `frontend/src/api/index.ts`: `requestReset({email})`, `confirmReset({email,code,newPassword})`.
- [x] **T-9** — `frontend/src/pages/auth/ForgotPasswordPage.tsx`: email → `requestReset`, нейтральный toast, `setPendingEmail`, переход `/reset-password`.
- [x] **T-10** — `frontend/src/pages/auth/ResetPasswordPage.tsx`: код (`inputMode=numeric`, maxLength 6) + новый пароль + подтверждение; клиентская проверка длины ≥8 и совпадения; успех → toast + `navigate('/login')`; нет `pendingEmail` → редирект `/forgot-password`.
- [x] **T-11** — `LoginPage.tsx`: ссылка «Забыли пароль?» → `/forgot-password`. `App.tsx`: публичные маршруты `/forgot-password`, `/reset-password`.
- [x] **T-12** — `infra/template.yaml`: `AuthRequestResetFunction` + `AuthConfirmResetFunction` (DynamoDBCrudPolicy + SSMParameterReadPolicy, POST-маршруты). `sam validate --lint` — OK.

Также: оба новых маршрута добавлены в `scripts/local-server.ts` для локального прогона.

## Самопроверка
- `npx tsc -p backend/tsconfig.json --noEmit` — без ошибок.
- `cd frontend && npm run build` (`tsc -b && vite build`) — без ошибок. (Скрипта `typecheck` нет — фронт проверяется через `build`.)
- `sam validate --lint --template infra/template.yaml` — valid.
- Unit smoke `lib/secure-code.ts` — пройден.

## Как запустить / проверить локально
```bash
# фронт (типизация + сборка)
cd frontend && npm run build

# бэк локально (мок Resend: письма печатаются в консоль npm run local)
docker compose up -d                 # DynamoDB Local на :8000
npm run setup-local-dynamo           # создать таблицы
npm run local                        # Express-обёртка на :3000  (внимание: порт 3000 может быть занят, см. PORT)
cd frontend && npm run dev           # Vite :5173 (proxy /api → :3000)
```
Локальный e2e-сценарий:
1. Зарегистрировать+verify пользователя (код verify печатается в лог `npm run local`).
2. `/forgot-password` → ввести email → в логе появится «Код для сброса пароля: NNNNNN».
3. `/reset-password` → код + новый пароль (дважды) → редирект `/login`.
4. Войти новым паролем — ок; старым — 401. Старый JWT на `/api/auth/me` → 401 (tokenVersion).

Запуск TS-скриптов в этом окружении (Node 23) — через CJS-хук:
```bash
TS_NODE_SKIP_PROJECT=1 TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","esModuleInterop":true,"resolveJsonModule":true,"target":"es2020","moduleResolution":"node"}' node -r ts-node/register <script>
```

## Переменные окружения / секреты / SSM
| Параметр | Назначение | Где взять |
|---|---|---|
| `/diary/resend-api-key` (SSM SecureString) | API-ключ Resend для писем сброса/уведомления | как у verify-email — уже существует |
| `JWT_SECRET` / `/diary/jwt-secret` | подпись/проверка JWT (теперь несёт `tv`) | существует |
| `RESEND_API_KEY` (local `.env.local`) | локально не нужен — `localMode` печатает письма в консоль | — |

Новых SSM-параметров и секретов фича не вводит. Пороги/TTL — в `config.auth` (не хардкод).

## Фикс по результатам QA/SECURITY (SEC-01 HIGH / BUG-1 off-by-one)
Ревью вернуло FAIL: лимит попыток в `confirm-reset` обходился. Исправлено точечно (только `confirm-reset.ts` + один порог в config):
- **SEC-01 (обход конкуренцией):** сравнение кода больше НЕ выполняется до/независимо от инкремента. Теперь сначала идёт атомарный `UpdateItem ADD attempts :1 ConditionExpression attempts < :max` на `RESET#<email>/CODE`; timing-safe сравнение выполняется ТОЛЬКО при успешном инкременте. Каждое сравнение атомарно потребляет персистентную попытку → при любой конкуренции число сравнений ограничено `:max` (5), а не конкуррентностью Lambda. Success-path проходит тот же гейт (успешная догадка тоже тратит попытку).
- **BUG-1 (off-by-one):** `attempts` стартует 0, условие `attempts < 5` пропускает инкременты при 0,1,2,3,4 = ровно 5 сравнений; 6-я попытка видит `attempts == 5` → `ConditionalCheckFailedException` → код удаляется (инвалидация, AC-8). `ConditionalCheckFailedException` отличается по `err.name`; прочие ошибки пробрасываются (не глотаются как лимит).
- **Confirm rate-limit:** добавлен `RESET#<email>/RLC` (скользящее окно 1ч) с порогом `config.auth.resetConfirmRateLimitPerHour` (=20). Ограничивает суммарные попытки на email, в т.ч. через пересоздание кодов (новый код обнуляет per-code `attempts`). Превышение → нейтральный `INVALID_CODE` без раскрытия аккаунта.
- Контракты API, anti-enumeration, timing-safe сравнение и tokenVersion-логика не менялись.
- **Проверено локально (DynamoDB Local, прямой вызов хендлера):** (A) ровно 5 неверных → 6-я отклонена + код удалён; (B) верный код после 5 неверных отклонён, пароль не сменён; (C) 40 параллельных неверных — пароль не сменён, attempts ≤ 5 (код инвалидирован); (D) верный код меняет пароль, бампит tokenVersion (→2), удаляет код; (E) RL блокирует валидный запрос ровно на 21-м. 15/15 PASS. `npx tsc -p backend/tsconfig.json --noEmit` — зелёный.

## Отклонения от spec
- `[SPEC-DEVIATION]` (минор) В `confirm-reset` инкремент `tokenVersion` сделан как `SET tokenVersion = if_not_exists(tokenVersion, :one) + :one`, а не `ADD tokenVersion :1` (как в spec/ADR). Причина: для профиля без атрибута `ADD :1` даёт результат `1`, а ранее выданные токены с неявным `tv == 1` тогда НЕ инвалидировались бы (AC-11 не закрыт). `if_not_exists(...,1)+1` переводит неявную v1 → v2 и реально отзывает все старые токены. Контракт и эффект соответствуют ADR-0002; различается только выражение апдейта.
- `[SPEC-DEVIATION]` (минор) В `RESET#<email>/RL` добавлено поле `lastAt` (epoch s) сверх перечисленных в таблице spec (`count`,`windowStart`,`ttl`) — нужно для лимита «не чаще 1/60с». Служебное, наружу не отдаётся.
- Фронт: скрипт `frontend npm run typecheck` отсутствует в `package.json` (в CLAUDE.md упомянут) — проверка идёт через `npm run build` (`tsc -b`).

## Что НЕ сделано / замокано
- Полный локальный e2e не прогонялся в этой сессии: DynamoDB Local не поднят, а порт `:3000` занят (grafana). Прогон оставлен QA. Статические проверки (tsc backend, frontend build, sam validate, unit secure-code) — зелёные.
- `Math.random` в `register.ts`/`verify-email.ts` намеренно не трогался (вне scope, A4 — наблюдение для security-engineer).
- Авто-вход после сброса не делается — выбран редирект на `/login` (per spec §4 «Авто-вход vs редирект»).
- Капча на `request-reset` не добавлялась (отложено для v1).
