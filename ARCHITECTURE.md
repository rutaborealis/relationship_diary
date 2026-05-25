# Relationship Diary — Как это устроено

Этот документ объясняет **что** происходит внутри приложения, **почему** именно так, и **как** данные движутся между частями системы.

---

## Общая картина

```
Браузер (React PWA)
       │
       │ HTTPS
       ▼
   CloudFront
   ┌─────────────────────────────┐
   │  /api/*  → API Gateway      │
   │           → Lambda          │
   │                             │
   │  /*      → S3 bucket        │
   │           (статика)         │
   └─────────────────────────────┘
```

Одна точка входа — `ourdiary.love`. CloudFront смотрит на путь: если `/api/` — отправляет в Lambda, всё остальное — отдаёт статику из S3. Клиент не знает, что за доменом два разных бэкенда.

---

## Как хранятся данные

### Один стол вместо нескольких (Single Table Design)

В DynamoDB у нас одна таблица `DiaryMain` для всего: пользователей, записей, качеств, инвайтов, логов уведомлений. Это не случайность — DynamoDB плохо работает с JOIN, поэтому всё хранится вместе, а структура отражается в ключах.

Каждая запись имеет `PK` (partition key) и `SK` (sort key). По `PK` всегда можно получить все данные одного пользователя одним запросом:

```
PK=USER#abc123   SK=PROFILE         → профиль пользователя
PK=USER#abc123   SK=ENTRY#2026-05-18 → запись дневника за день
PK=USER#abc123   SK=ENTRY#2026-05-17 → запись за предыдущий день
PK=USER#abc123   SK=QUALITY#uuid1   → качество партнёра
PK=USER#abc123   SK=NOTIF#xyz#date#type → лог отправленного пуша
```

Для поиска пользователя по email добавлен отдельный индекс — GSI EmailIndex. Email пользователя хранится отдельной строкой:
```
PK=EMAIL#user@gmail.com   SK=USER   → { userId: "abc123" }
```

Когда кто-то вводит email при поиске партнёра — мы сначала идём в эту строку, получаем `userId`, потом берём профиль. Два обращения вместо сканирования всей таблицы.

### Вторая таблица — только для пушей

`DiaryPush` отдельная, потому что у неё другой паттерн доступа: нужно находить всех пользователей с конкретным временем напоминания. Для этого есть GSI ReminderTimeIndex, где `reminder_time` — это ключ. Cron-функция раз в минуту делает `Query` по текущему `HH:MM` и получает список пользователей для напоминания.

```
DiaryPush:
userId (PK)  │  subscription (JSON)  │  reminder_time
─────────────┼───────────────────────┼──────────────
abc123       │  { endpoint, keys }   │  21:30
xyz789       │  { endpoint, keys }   │  20:00
```

---

## Авторизация: JWT без базы сессий

Мы не храним сессии. Вместо этого — JWT-токен, который живёт в `localStorage` браузера.

**Как работает:**

1. Пользователь логинится → бэкенд проверяет пароль (bcrypt), создаёт токен: `{ userId, email }`, подписанный секретом из SSM, срок жизни 7 дней
2. Токен уходит в `localStorage` через Zustand-стор
3. Каждый API-запрос несёт `Authorization: Bearer <token>` в заголовке
4. Lambda-функция через `requireAuth()` проверяет подпись → достаёт `userId`
5. Если токен просрочен или невалиден → `401` → фронтенд делает `logout()` и редиректит на `/login`

Секрет JWT лежит в AWS SSM Parameter Store. Lambda читает его при первом вызове и кеширует в памяти инстанса. Это значит что смена секрета «ломает» все существующие токены — инструмент для экстренного разлогина всех пользователей.

**При открытии приложения:**

```
App.tsx монтируется
    ↓
есть JWT в localStorage?
    Нет → /login
    Да  → GET /api/auth/me
            401 → logout() → /login
            200 → обновить стор (user + partner)
```

`/api/auth/me` возвращает актуальные данные, в том числе `partnerId` — если партнёр был принят пока вкладка была закрыта, при следующем открытии мы это увидим.

---

## Как партнёры соединяются

Самое хитрое место в приложении. Проблема: пользователь A отправляет инвайт пользователю B по email. B открывает ссылку, но в этот момент может быть не авторизован. Нужно сохранить токен через редиректы на страницу логина.

**Решение — sessionStorage в момент до монтирования React:**

```ts
// main.tsx — выполняется ДО того как React вообще начнёт рендерить
const token = new URLSearchParams(window.location.search).get('token');
if (token) {
  sessionStorage.setItem('invite_token', token);
  window.history.replaceState({}, '', window.location.pathname); // убрать ?token= из URL
}
```

Это важно: если сохранять токен внутри компонента React, то `<Navigate to="/login">` отработает раньше и URL изменится — токен потеряется. `sessionStorage` же сохраняется через навигацию браузера в пределах вкладки.

**Полный поток:**

```
B открывает ourdiary.love/?token=abc
    ↓
main.tsx: token → sessionStorage["invite_token"]
URL очищается → ourdiary.love/
    ↓
React монтируется
    ↓
нет JWT → redirect /login
    ↓
B входит (или регистрируется)
    ↓
App.tsx useEffect([jwt]) срабатывает
    ↓
читает sessionStorage["invite_token"]
    ↓
POST /api/partner/accept { token: "abc" }
    ↓
Lambda:
  - читает INVITE#abc → senderId=A, recipientId=B
  - TransactWrite: USER#A PROFILE.partnerId = B, USER#B PROFILE.partnerId = A
    ↓
обновляем стор: setPartner(...)
```

`TransactWrite` — атомарная операция DynamoDB: либо оба пользователя обновляются, либо ни один. Это страховка от ситуации «A привязан к B, но B не привязан к A».

---

## Как работает запись дневника

**Сохранение:**

```
TodayPage.save()
    ↓
POST /api/entries { date, mood_level, mood_text, ... }
    ↓
Lambda: putItem(MAIN, { PK: USER#userId, SK: ENTRY#date, ...fields })
    ↓ (параллельно, fire-and-forget)
api.notifyPartner(date) — не ждём результата
```

`putItem` в DynamoDB — это upsert: перезаписывает всю запись целиком. Поэтому при редактировании нужно передавать все поля, даже незаполненные (иначе они сотрутся). Фронтенд всегда передаёт весь объект `entry`.

**Получение своей + партнёрской записи:**

```
GET /api/entries?date=2026-05-18
    ↓
Lambda:
  1. requireAuth → userId
  2. getItem(USER#userId, PROFILE) → достать partnerId
  3. Promise.all([
       getItem(USER#userId, ENTRY#date),      // своя
       getItem(USER#partnerId, ENTRY#date),   // партнёрская
     ])
  4. sanitize(partnerEntry) — удалить free_thought
    ↓
{ entry: {...}, partnerEntry: {...без free_thought...} }
```

`free_thought` обнуляется на сервере — клиент физически не может его получить для партнёра, даже если будет делать прямые запросы к API.

**Почему калькуляция «есть запись или нет» на фронтенде:**

Сервер возвращает объект `entry` всегда (даже если записи нет — приходит `null`). Фронтенд сам проверяет `isEntryEmpty()` — смотрит что все текстовые поля пустые. Это нужно потому что DynamoDB не имеет понятия «пустая запись» — либо строка есть, либо нет.

---

## Календарь: почему sparse map

Для календаря нам нужно знать за каждый день месяца: есть ли запись у меня, у партнёра. Можно было бы вернуть 31 объект, но большинство дней пустые. Поэтому сервер возвращает только дни с записями:

```json
{
  "2026-05-01": { "mine": true },
  "2026-05-15": { "mine": true, "theirs": true },
  "2026-05-18": { "theirs": true }
}
```

Фронтенд получает этот объект и строит сетку через `buildGrid()` — добавляет пустые ячейки для выравнивания (понедельник = первый столбец) и заполняет 28–31 день месяца, обращаясь к объекту по дате.

**Нюанс с месяцами:** бэкенд принимает месяц в формате 0-based (январь = 0), как принято в JavaScript `Date`. Фронтенд отображает 1-based (январь = 1). При вызове API фронтенд делает `month - 1`.

---

## Push-уведомления: цепочка от сохранения до звонка

Технология Web Push строится на трёх участниках: наш сервер, push-сервис браузера (Google FCM, Apple APNs), и браузер пользователя.

**VAPID** — это пара ключей, которая доказывает браузеру что именно наш сервер имеет право слать пуши именно этому пользователю. Публичный ключ знает браузер (получает при подписке), приватный — только наш сервер.

**Подписка пользователя:**

```
Пользователь нажимает «Включить»
    ↓
Notification.requestPermission() → диалог браузера
    ↓
GET /api/vapid-public-key → "BOXTaQ1L..."
    ↓
navigator.serviceWorker.ready → регистрация SW
    ↓
pushManager.subscribe({ applicationServerKey: vapidKey })
    ↓
Браузер идёт к Google FCM/Apple APNs
Получает объект подписки: { endpoint, keys: { p256dh, auth } }
    ↓
POST /api/subscribe { subscription: {...} }
    ↓
DiaryPush[userId].subscription = объект
```

После этого у нас есть всё чтобы слать пуши этому пользователю.

**Отправка пуша партнёру:**

```
POST /api/notify-partner { date }
    ↓
Lambda:
  1. Проверить: есть ли partnerId
  2. Проверить идемпотентность:
     getItem(NOTIF#senderId#partnerId#date#entry_saved)
     Если есть → return (уже отправляли сегодня)
  3. Записать лог: putItem(NOTIF#...)
  4. sendPushToUser(partnerId):
     a. DiaryPush[partnerId].subscription
     b. webpush.sendNotification(subscription, payload)
        → HTTP к endpoint партнёра (Google FCM или Apple APNs)
  5. Если 410/404 от FCM → подписка устарела, удалить из DiaryPush
```

**На устройстве партнёра:**

```
FCM доставляет пуш → браузер будит Service Worker
    ↓
sw.js: self.addEventListener('push', ...)
    ↓
self.registration.showNotification(title, { body, icon, ... })
    ↓
Пользователь видит уведомление
Клик → открывает ourdiary.love
```

**Почему идемпотентность:** без неё каждый раз когда партнёр редактирует и сохраняет запись (может быть 5-10 раз за день) — прилетало бы 5-10 уведомлений. Одного «написал сегодня» достаточно.

**Напоминания (cron):**

EventBridge запускает Lambda каждую минуту. Lambda берёт текущее UTC-время в формате `HH:MM` и делает `Query` по GSI ReminderTimeIndex. Для каждого найденного пользователя:

1. Проверяет: есть ли запись за сегодня → если есть, пропускает
2. Проверяет идемпотентность напоминания за сегодня → если уже слал, пропускает
3. Отправляет пуш «Дневник ждёт 📖»

---

## Как фронтенд управляет состоянием

Zustand — два стора:

**AuthStore** — персистится в `localStorage`:
```ts
{ jwt, user, partner }
```
Сохраняется между сессиями. При logout — очищается.

**UIStore** — живёт только в памяти:
```ts
{ toasts[] }
```
Тосты появляются и пропадают через 4 секунды.

Каждый компонент читает стор напрямую — никакого prop drilling. API-вызовы делаются внутри компонентов (не в сторе), результаты сохраняются в локальный `useState`.

---

## Структура Lambda-функций

Каждая Lambda — отдельный файл с одним `handler`. SAM собирает каждый файл esbuild'ом в отдельный бандл. Внешние `@aws-sdk/*` не включаются в бандл — они уже есть в Lambda runtime.

Все обработчики оборачиваются в `withErrorHandling()`:

```ts
export function withErrorHandling(fn: Handler): Handler {
  return async (event) => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) {
        return { statusCode: err.statusCode, body: JSON.stringify({ error: err.message }) };
      }
      console.error(err);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
    }
  };
}
```

`requireAuth()` читает `Authorization: Bearer` заголовок, верифицирует JWT и возвращает `{ userId }`. Если токен невалиден — бросает `HttpError(401)`, который `withErrorHandling` превращает в 401-ответ.

---

## Что происходит при деплое

**Фронтенд:**
1. `tsc -b` — проверка типов (падает если ошибки)
2. `vite build` — бандл с хешами в именах (`index-AbCdEf.js`)
3. `aws s3 sync frontend/dist/ s3://bucket` — загружает новые файлы, удаляет старые
4. `aws cloudfront create-invalidation --paths "/*"` — сбрасывает кеш CDN

Хеши в именах бандлов означают: старый `index-AbCdEf.js` и новый `index-XyZ123.js` живут рядом пока не придёт `s3 sync`. Браузеры, у которых закеширован старый `index.html`, будут пытаться загрузить старый бандл — его уже не будет, сломается. CloudFront invalidation решает это: новый `index.html` сразу видят все.

**Бэкенд:**
1. `sam build` — компилирует каждую Lambda esbuild'ом в `.aws-sam/`
2. `sam deploy` — загружает артефакты в S3, обновляет CloudFormation стек
3. Lambda-инстансы заменяются — in-memory кеш SSM обнуляется

Бэкенд деплоится несколько минут. В этот момент возможны кратковременные 502 — Lambda обновляется.
