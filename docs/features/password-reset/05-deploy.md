# План развёртывания — password-reset

> Автор: devops · Вход: 02-spec.md, 03-build-notes.md, 04-test-report.md (PASS 14/14), 04b-security-review.md (PASS-WITH-NOTES), ADR-0002
> Ветка: `feat/password-reset` · Дата: 2026-06-30
> Статус: **ПОДГОТОВЛЕНО — ждёт одобрения PO (боевой деплой не выполнялся)**

## 1. Вердикт готовности

Все readiness-проверки **зелёные** (выполнены локально, без обращения к проду):

| Проверка | Команда | Результат |
|---|---|---|
| Типизация backend | `npx tsc -p backend/tsconfig.json --noEmit` | OK (без ошибок) |
| Сборка frontend | `cd frontend && npm run build` (`tsc -b && vite build`) | OK — JS 285 КБ (gzip 88 КБ), CSS 19 КБ |
| Валидация SAM | `sam validate --lint --template infra/template.yaml --region eu-central-1` | valid |
| Сборка SAM | `sam build` | Build Succeeded; обе новые функции (`AuthRequestResetFunction`, `AuthConfirmResetFunction`) собраны в `.aws-sam/build/` |

QA = PASS (14/14 AC), Security = PASS-WITH-NOTES (SEC-01 закрыт, 0 critical/high/medium, 6 low/info accepted). Блокеров деплоя нет.

## 2. Объём деплоя: **backend + frontend (оба)**

Фича меняет обе стороны → нужны **оба** скрипта.

**Backend (`deploy-backend.sh` → `sam build` + `sam deploy`):**
- Новые Lambda + маршруты API Gateway: `AuthRequestResetFunction` (`POST /api/auth/request-reset`), `AuthConfirmResetFunction` (`POST /api/auth/confirm-reset`) — `infra/template.yaml:286-324`.
- Изменения в общих библиотеках, влияющие на **все** аутентифицированные функции: `lib/auth-middleware.ts` (доп. `GetItem` профиля + сверка `tv`), `lib/jwt.ts` (поле `tv` в payload), `login.ts`/`verify-email.ts` (кладут `tv`), `lib/secure-code.ts` (новый), `config/app.config.ts` (пороги reset). SAM пересоберёт и перевыложит затронутые функции.

**Frontend (`deploy-frontend.sh` → build + S3 sync + CloudFront invalidation):**
- Новые страницы `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`; ссылка «Забыли пароль?» на `LoginPage.tsx`; публичные маршруты `/forgot-password`, `/reset-password` в `App.tsx`; `api.requestReset`/`api.confirmReset`; проброс `pendingEmail` в store.

> Скрипт-комбайн `deploy.sh` вызывает оба, но порядок важен — см. §5.

## 3. Секреты / SSM-параметры

**Новых SSM-параметров и секретов фича НЕ вводит.** Подтверждено по коду:
- `request-reset` (письмо с кодом) и `confirm-reset` (письмо «пароль изменён») шлют через `lib/ses.ts`, который читает существующий **`/diary/resend-api-key`** (`ses.ts:9`).
- JWT (`tv`) подписывается/проверяется существующим **`/diary/jwt-secret`** (`lib/jwt.ts`, `config.jwt.ssmParamSecret`).
- Никаких хардкод-секретов в коде/коммитах. Пороги/TTL вынесены в `config.auth` (не секреты).

Опциональная проверка наличия параметров в проде перед деплоем (read-only, значения не выводятся):
```bash
aws ssm get-parameters --names /diary/resend-api-key /diary/jwt-secret \
  --region eu-central-1 --query 'Parameters[].Name' --output text
# ожидаем обе строки
```

IAM новых Lambda — по конвенции проекта (`DynamoDBCrudPolicy` + `SSMParameterReadPolicy diary/*`); это шире необходимого ([SEC-05], low/info, accepted) — на деплой не влияет, сужение оставлено как тех-долг.

## 4. Совместимость сессий при tokenVersion (критично: без массового логаута)

**Действующие сессии при деплое НЕ разлогиниваются.** Проверено по коду:

- Существующие JWT, выданные до релиза, **не содержат `tv`**. В `auth-middleware.ts:18` отсутствие трактуется как `1`: `(payload.tv ?? 1)`.
- Профили существующих пользователей **не имеют атрибута `tokenVersion`** — в той же строке `((profile.tokenVersion as number | undefined) ?? 1)` тоже даёт `1`.
- `1 === 1` → проверка проходит → **старые токены остаются валидными** до обычного истечения (7 дней).
- Первая реальная инкрементация — только при успешном `confirm-reset`: `SET tokenVersion = if_not_exists(tokenVersion, :one) + :one` переводит неявную v1 → **v2**, и только тогда конкретный старый токен этого пользователя получает 401 (требуемый «logout на всех устройствах» — AC-11). См. ADR-0002 §4 «Миграция не нужна».
- Подтверждено QA (AC-11: старый токен `tv:1` до сброса → `/me` 200; после сброса → 401) и регрессией register→verify→login.

**Вывод для ранбука:** миграция данных DynamoDB **не требуется**; деплой безопасен для двух активных пользователей — принудительного логаута не будет.

## 5. Ранбук деплоя для PO

**Предусловие (лессон проекта):** `deploy-backend.sh`/`deploy-frontend.sh` собирают артефакты **из текущего рабочего дерева** (`sam build` от `infra/template.yaml`, `vite build` от `frontend/src`). Деплоить нужно **из закоммиченного и влитого в `main` состояния**, не из feature-ветки. Сейчас `feat/password-reset` **НЕ влита в main** (6 коммитов впереди `origin/main`, плюс незакоммиченные доки). Перед деплоем — слить ветку и убедиться, что рабочее дерево чистое.

**Порядок: backend → frontend.** Обоснование:
1. Новые эндпоинты (`/api/auth/request-reset`, `/confirm-reset`) должны существовать ДО того, как новый фронт начнёт на них ходить — иначе свежий фронт получит 404/5xx на запрос сброса.
2. Backend обратносовместим со **старым** фронтом (старый фронт не знает о новых страницах; `tv`-проверка пропускает старые токены — §4). Поэтому короткое окно «новый backend + старый frontend» безопасно.
3. Frontend выкатывается вторым — после него фронт со ссылкой «Забыли пароль?» уже имеет рабочие эндпоинты.

### Шаг 0 — подготовка `[NEEDS-CEO-APPROVAL]`
```bash
# слить фичу в main (PR-merge или fast-forward) и переключиться на main
git checkout main && git pull
git merge --no-ff feat/password-reset      # или смерджить PR через GitHub
git status                                 # должно быть clean — это ревизия, прошедшая QA/Security
```

### Шаг 1 — backend `[NEEDS-CEO-APPROVAL]`
```bash
bash scripts/deploy-backend.sh
# = sam build && sam deploy (стек relationship-diary, eu-central-1, samconfig.toml)
```
Проверка после шага 1 (эндпоинты живы, контракт anti-enumeration):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ourdiary.love/api/auth/request-reset \
  -H 'Content-Type: application/json' -d '{"email":"nobody@example.com"}'
# ожидаем 200 (нейтральный ответ для любого email)
```

### Шаг 2 — frontend `[NEEDS-CEO-APPROVAL]`
```bash
bash scripts/deploy-frontend.sh
# build + S3 sync (diary-frontend-prod-049710942442) + CloudFront invalidation /* (E1RZUG10DIC91S)
```
Инвалидация CloudFront `/*` встроена в скрипт (`deploy-frontend.sh:32-36`). `index.html`/`sw.js`/`manifest.json`/`version.json` выкладываются с `no-cache` — пользователи получат новую версию при ближайшей ревалидации.

### Шаг 3 — Smoke-проверка в проде (после обоих шагов)
1. https://ourdiary.love/login → видна ссылка **«Забыли пароль?»** (AC-14).
2. Перейти → ввести **реальный** email одного из аккаунтов → нейтральный тост, переход на `/reset-password`. Письмо с 6-значным кодом приходит на почту (Resend, прод `localMode=false`).
3. Ввести код + новый пароль (дважды) → редирект `/login` с success-тостом.
4. Войти **новым** паролем → успех; **старым** → отказ.
5. Если на втором устройстве оставалась активная сессия того же аккаунта — после сброса её запрос даёт 401 и авто-logout (AC-11, tokenVersion).
6. Убедиться, что у **второго** (не сбрасывавшего) пользователя сессия осталась живой — подтверждение §4.

> Тест-сброс делать на аккаунте, пароль которого известен/восстановим (это живые данные пары).

## 6. Наблюдаемость (что мониторить после релиза)

CloudWatch Logs / Metrics, eu-central-1:

| Сигнал | Где | Норма / тревога |
|---|---|---|
| Ошибки `request-reset` | `/aws/lambda/diary-auth-request-reset-prod`, Errors | ≈ 0. Всплеск 5xx → проблема Resend/SSM/Dynamo |
| Ошибки `confirm-reset` | `/aws/lambda/diary-auth-confirm-reset-prod`, Errors | 5xx ≈ 0. Прочие (не лимит) ошибки `UpdateItem` пробрасываются в 500 — ловить здесь |
| Всплеск отказов кода | логи `confirm-reset` — частые `INVALID_CODE`/400 | редкие — норма; массовые → возможный перебор/проблема доставки писем |
| Доставка Resend | Resend dashboard (bounce/delivery) + ошибки `ses.ts` в обоих log group | письма «код сброса» и «пароль изменён» доставляются; письмо best-effort — сбой не роняет сброс, но логируется |
| 401 от tokenVersion | Errors/логи **всех** аутентифицированных функций (`auth-me`, entries, push…) | ожидаемы только после реального сброса. Массовые 401 без сбросов → регрессия `tv`-логики (откат) |
| Латентность `request-reset` | Duration | ~600 мс floor + cold start. Аномально высокая → разбор (timing-leak SEC-03) |
| Доп. `GetItem` профиля | Duration аутентифицированных функций (ADR-0002) | единицы мс; для 2 юзеров незаметно |

Секреты в логах отсутствуют (AC-13): код/пароль/`passwordHash`/`codeHash` не логируются; плейн-код печатается только в `localMode` (в проде выключен).

## 7. Откат (rollback)

**Backend** — откат на предыдущий релиз стека:
- Вариант А (быстрый, CloudFormation): откат стека `relationship-diary` к предыдущему успешному состоянию через консоль/`aws cloudformation`.
- Вариант Б (из git): вернуть `main` на пред-релизную ревизию и пере-деплоить:
```bash
git checkout main && git reset --hard <pre-release-rev>   # или git revert merge-commit
bash scripts/deploy-backend.sh
```
- **tokenVersion обратно совместим:** даже после отката backend уже изменённые профили (`tokenVersion=2`) и токены без `tv` остаются корректными — старый код игнорирует `tv`. Пользователь, успевший сбросить пароль, продолжит входить новым паролём. Необратимых изменений данных нет.

**Frontend** — перевыложить предыдущую сборку (из пред-релизной ревизии `main`):
```bash
git checkout main && git reset --hard <pre-release-rev>
bash scripts/deploy-frontend.sh   # пересоберёт старый фронт + инвалидация /*
```
- Новые маршруты `/forgot-password`/`/reset-password` исчезнут со старым фронтом; backend-эндпоинты при этом могут оставаться (безвредны — без UI на них не ходят).

**Порядок отката** — обратный деплою: сначала frontend (убрать UI новых эндпоинтов), затем backend при необходимости. Для частичных проблем обычно достаточно отката одной стороны.

## 8. Что требует одобрения PO — `[NEEDS-CEO-APPROVAL]`

Готовые команды (НЕ выполнены — живые пользователи-пара):

1. **Слияние ветки в `main`** (предусловие — деплой собирает из рабочего дерева):
   `git checkout main && git pull && git merge --no-ff feat/password-reset`
2. **Боевой backend-деплой:** `bash scripts/deploy-backend.sh`
3. **Боевой frontend-деплой:** `bash scripts/deploy-frontend.sh`
   (или оба сразу: `bash scripts/deploy.sh`)

Изменений прод-данных DynamoDB, ротации секретов, правок CloudFront/домена — НЕ требуется.

## 9. Зафиксированный тех-долг (не блокирует деплой)

- [SEC-03] остаточный timing-leak при медленном Resend (accepted).
- [SEC-04] `verifyToken` без `algorithms:['HS256']` (best-practice).
- [SEC-05] IAM новых Lambda шире нужного (`SSMParameterReadPolicy diary/*`) — сузить до `/diary/resend-api-key`.
- [SEC-06] тайминг наличия активного кода в `confirm-reset`.
- [SEC-07] долг `Math.random`/плейн-код в `register`/`verify-email` (вне scope).
- [SEC-08] неатомарный rate-limit (`request-reset` RL и confirm RLC) — defence-in-depth поверх жёсткого per-code cap=5.
