# Relationship Diary — Полная спецификация приложения

**Версия:** 1.0  
**Дата:** Май 2026  
**Продакшн:** https://ourdiary.love

---

## 1. Назначение

Relationship Diary — приватное PWA-приложение для ведения совместного дневника двумя партнёрами. Каждый день оба заполняют запись о своём настроении, благодарностях, близости и мыслях. Партнёры видят записи друг друга (кроме «свободной мысли» — она личная). Приложение поощряет регулярность через push-уведомления.

---

## 2. Пользователи и роли

- Ровно **два пользователя** — партнёры. Третий аккаунт не имеет смысла в логике приложения.
- Регистрация открытая, но работоспособен только связанный с партнёром аккаунт.
- Ролей нет — оба пользователя равноправны.

---

## 3. Функциональные требования

### 3.1 Аутентификация

| Действие | Описание |
|----------|----------|
| Регистрация | Email + имя + пол + пароль. После регистрации — 6-значный код на email (действует 15 минут) |
| Верификация email | Ввод кода. При успехе — JWT-токен, вход в приложение |
| Вход | Email + пароль. Возвращает JWT |
| Защита токена | JWT хранится в `localStorage`. Срок — 7 дней. При 401 — автовыход |
| Проверка сессии | При каждом открытии приложения — запрос `/api/auth/me`. Невалидный JWT → logout |

### 3.2 Приглашение партнёра

1. В разделе «Настройки» → «Партнёр» пользователь ищет по имени или email
2. Выбирает найденного пользователя → нажимает «Пригласить»
3. Приглашённый получает email со ссылкой `https://ourdiary.love/?token=<uuid>`
4. Ссылка действует **72 часа**
5. При переходе по ссылке:
   - Если не авторизован — перенаправление на вход/регистрацию. Токен сохраняется в `sessionStorage` до завершения авторизации
   - После входа — автоматическое принятие приглашения
6. После принятия — у обоих пользователей проставляется `partnerId`
7. Повторное приглашение невозможно, если партнёр уже подключён

### 3.3 Дневниковая запись

Каждая запись привязана к конкретному дню (`YYYY-MM-DD`) и пользователю. Поля:

| Поле | Тип | Приватность |
|------|-----|-------------|
| `mood_level` | `good` / `ok` / `bad` | Видна партнёру |
| `mood_text` | Текст | Видна партнёру |
| `noticed_1/2/3` | Текст × 3 | Видна партнёру |
| `gratitude_1/2/3` | Текст × 3 | Видна партнёру |
| `closeness_text` | Текст | Видна партнёру |
| `note_to_partner` | Текст | Видна партнёру |
| `free_thought` | Текст | **Только автор** |

**Операции:**
- Создание и обновление — один эндпоинт (`POST /api/entries`). Повторное сохранение перезаписывает запись за тот же день
- Удаление — `DELETE /api/entries?date=YYYY-MM-DD`
- Получение своей + партнёрской записи за конкретную дату — `GET /api/entries?date=YYYY-MM-DD`
- `free_thought` **никогда** не отправляется клиенту при получении партнёрской записи — очищается на бэкенде

### 3.4 Навигация по датам

- Страница «Дневник» открывается на сегодняшней дате
- Стрелки ← / → позволяют листать по дням
- Переход в будущее заблокирован
- Кнопка «К сегодня» возвращает на текущую дату
- При переходе из «Дня» (DayPage) → «Дневник» открывается на выбранной дате через `location.state`

### 3.5 Календарь

- Отображает месячную сетку
- Каждый день с записью помечен точками: своя (цвет акцента пользователя) и/или партнёрская
- Клик по дню → переход на «Страницу дня»
- Навигация по месяцам: стрелки ← / →

### 3.6 Страница дня (DayPage)

- Открывается по маршруту `/day/YYYY-MM-DD` (из календаря)
- Если есть партнёр — таб-переключатель «Моя запись» / «<Имя партнёра>»
- Автоматически открывается вкладка партнёра, если своей записи нет
- В своей вкладке: кнопка «Редактировать» (→ TodayPage) или «Заполнить» если пусто
- `free_thought` видна только в своей вкладке

### 3.7 Качества партнёра

- Личный список качеств, которые пользователь ценит в партнёре
- Операции: создать, редактировать, удалить
- Список видит только сам пользователь

### 3.8 Push-уведомления

**Подписка:**
1. Пользователь нажимает «Включить» в Настройках
2. Браузер запрашивает разрешение
3. Создаётся Web Push подписка с VAPID-ключом
4. Подписка сохраняется в таблице `DiaryPush`

**Типы уведомлений:**

| Событие | Получатель | Условие |
|---------|------------|---------|
| Партнёр сохранил запись | Текущий пользователь | Идемпотентно: 1 раз в день на пару `(отправитель, получатель, дата)` |
| Напоминание заполнить дневник | Сам пользователь | Если задано время в настройках и запись за сегодня не заполнена |

**Текст уведомления о записи партнёра:**
- Заголовок: `«Она заполнила дневник 💌»` / `«Он заполнил дневник 💌»` (зависит от пола)
- Тело: `«<Имя> уже написала/написал сегодня»`

**Текст напоминания:**
- Заголовок: `«Дневник ждёт 📖»`
- Тело: `«Не забудь написать сегодня»`

### 3.9 Настройки

| Секция | Содержимое |
|--------|-----------|
| Профиль | Имя и email (только отображение) |
| Партнёр | Имя подключённого партнёра или поиск/приглашение |
| Уведомления | Включить/отключить push. Показывает статус. При `denied` — инструкция по сбросу в браузере |
| Напоминание | Выбор времени ежедневного напоминания (`HH:MM`) |
| Выход | Кнопка выхода |

---

## 4. Нефункциональные требования

### 4.1 PWA
- Устанавливается на экран как приложение (manifest.json)
- Service Worker для обработки push-событий
- Работает без интернета частично (кешируется CloudFront)

### 4.2 Тема оформления
- Женская тема: розовый акцент (`#C4778A`)
- Мужская тема: синий акцент (`#7A96CB`) — активируется при `gender === 'm'`
- Переключается через CSS-класс `body.theme-m`
- Тёплый фоновый градиент в обоих случаях

### 4.3 Производительность
- Все API-вызовы параллельные где возможно (`Promise.all`)
- Lambda cold start: ~200–400ms (ARM64, 256MB)
- CloudFront кеширует статику, инвалидируется при каждом деплое

### 4.4 Безопасность
- JWT в `Authorization: Bearer` заголовке
- Пользователь видит партнёрскую запись только если они связаны (`partnerId`)
- `free_thought` вырезается на уровне бэкенда до отправки
- Пароли хранятся как bcrypt-хэш (12 раундов)
- VAPID-ключи и JWT-секрет в SSM Parameter Store
- Invite-токены: UUID v4, TTL 72 часа, хранятся в DynamoDB с автоудалением

---

## 5. Технологический стек

### Frontend
| Технология | Версия | Назначение |
|-----------|--------|-----------|
| React | 18 | UI-фреймворк |
| Vite | 8 | Бандлер |
| React Router | v6 | Маршрутизация |
| Zustand | — | Глобальный стейт (auth + toasts) |
| Lucide React | — | Иконки |
| TypeScript | 5.x | Типизация |

### Backend
| Технология | Назначение |
|-----------|-----------|
| AWS Lambda (Node.js 22.x, ARM64) | Вычисления |
| AWS DynamoDB | База данных |
| AWS S3 | Хранение статики |
| AWS CloudFront | CDN + роутинг |
| AWS API Gateway | HTTP-эндпоинты для Lambda |
| AWS SSM | Секреты и конфиги |
| AWS EventBridge | Cron для напоминаний (каждую минуту) |
| Resend | Транзакционные email |
| web-push | Web Push уведомления |
| bcryptjs | Хеширование паролей |
| jsonwebtoken | JWT |
| TypeScript + esbuild | Компиляция Lambda |
| AWS SAM | IaC и деплой |

---

## 6. Маршруты (Frontend)

| Маршрут | Компонент | Доступ |
|---------|-----------|--------|
| `/login` | LoginPage | Публичный |
| `/register` | RegisterPage | Публичный |
| `/verify-email` | VerifyEmailPage | Публичный |
| `/today` | TodayPage | Auth |
| `/partner` | PartnerPage | Auth |
| `/calendar` | CalendarPage | Auth |
| `/day/:date` | DayPage | Auth |
| `/qualities` | QualitiesPage | Auth |
| `/settings` | SettingsPage | Auth |
| `/*` | Redirect → `/today` или `/login` | — |

---

## 7. API эндпоинты

### Auth
| Метод | Путь | Описание |
|-------|------|---------|
| POST | `/api/auth/register` | Регистрация. Отправляет код на email |
| POST | `/api/auth/verify-email` | Подтверждение email. Возвращает JWT |
| POST | `/api/auth/login` | Вход. Возвращает JWT |
| GET | `/api/auth/me` | Данные текущего пользователя + партнёра |

### Записи
| Метод | Путь | Описание |
|-------|------|---------|
| GET | `/api/entries?date=YYYY-MM-DD` | Своя + партнёрская запись за дату |
| POST | `/api/entries` | Создать/обновить запись |
| DELETE | `/api/entries?date=YYYY-MM-DD` | Удалить запись |
| GET | `/api/calendar?year=&month=` | Карта записей за месяц (month: 0-based) |

### Пользователи и партнёры
| Метод | Путь | Описание |
|-------|------|---------|
| GET | `/api/users/search?q=` | Поиск по имени/email |
| POST | `/api/partner/invite` | Отправить приглашение (`{ userId }` или `{ partnerEmail }`) |
| POST | `/api/partner/accept` | Принять приглашение (`{ token }`) |
| GET | `/api/partner/pending` | Проверить входящее приглашение |

### Push-уведомления
| Метод | Путь | Описание |
|-------|------|---------|
| GET | `/api/vapid-public-key` | VAPID public key |
| POST | `/api/subscribe` | Сохранить push-подписку |
| GET | `/api/push-settings` | Текущее время напоминания |
| POST | `/api/reminder` | Установить время напоминания (`{ time: "HH:MM" \| null }`) |
| POST | `/api/notify-partner` | Уведомить партнёра о сохранённой записи (`{ date }`) |

### Качества
| Метод | Путь | Описание |
|-------|------|---------|
| GET | `/api/qualities` | Список качеств |
| POST | `/api/qualities` | Создать (`{ text }`) |
| PATCH | `/api/qualities/:id` | Обновить (`{ text }`) |
| DELETE | `/api/qualities/:id` | Удалить |

---

## 8. DynamoDB схема

### Таблица `DiaryMain` (Single Table Design)

**Primary Key:** `PK` (String) + `SK` (String)

| Сущность | PK | SK | Атрибуты |
|----------|----|----|---------|
| Профиль пользователя | `USER#<id>` | `PROFILE` | email, name, gender, passwordHash, emailVerified, partnerId, created_at |
| Email-lookup | `EMAIL#<email>` | `USER` | userId |
| Запись дневника | `USER#<id>` | `ENTRY#<YYYY-MM-DD>` | mood_level, mood_text, noticed_1/2/3, gratitude_1/2/3, closeness_text, note_to_partner, free_thought, saved_at |
| Качество | `USER#<id>` | `QUALITY#<uuid>` | text, created_at |
| Лог уведомления | `USER#<senderId>` | `NOTIF#<recipId>#<date>#<type>` | sent_at |
| Invite-токен | `INVITE#<token>` | `META` | senderId, senderName, recipientEmail, recipientId, status, ttl |
| Код верификации | `VERIFY#<email>` | `CODE` | code, ttl |

**GSI EmailIndex:** `email` → ProjectionType: KEYS_ONLY + userId  
**TTL:** атрибут `ttl` (Unix timestamp) — для `INVITE#` и `VERIFY#`

### Таблица `DiaryPush`

**Primary Key:** `userId` (String)

| Атрибут | Описание |
|---------|---------|
| userId | ID пользователя |
| subscription | JSON-объект Web Push подписки |
| reminder_time | `"HH:MM"` или отсутствует |
| updated_at | ISO timestamp |

**GSI ReminderTimeIndex:** `reminder_time` → используется cron-функцией

---

## 9. Поток данных: уведомление партнёру

```
Пользователь сохраняет запись
    ↓
TodayPage.save() → POST /api/entries
    ↓ (параллельно, fire-and-forget)
api.notifyPartner(date)
    ↓
Lambda: notify-partner.ts
    ├── Проверяет: есть ли partnerId
    ├── Проверяет идемпотентность: NOTIF#<sender>#<recip>#<date>#entry_saved
    ├── Записывает лог в DiaryMain
    └── sendPushToUser(partnerId, payload)
            ↓
        DiaryPush → subscription
            ↓
        webpush.sendNotification() → Google FCM / Apple APNs
            ↓
        Service Worker на устройстве партнёра
            ↓
        self.registration.showNotification()
```

---

## 10. Поток данных: invite-ссылка

```
Пользователь A нажимает «Пригласить»
    ↓
POST /api/partner/invite { userId: B }
    ↓
Lambda: создаёт INVITE#<token> (TTL 72h)
    ↓
Resend отправляет email на B: "ourdiary.love/?token=<token>"
    
Пользователь B открывает ссылку
    ↓
main.tsx (до монтирования React): token → sessionStorage
    ↓
URL очищается: window.history.replaceState(...)
    ↓
React монтируется → проверка JWT
    [Нет JWT] → LoginPage → после входа:
    [Есть JWT] → App.tsx useEffect([jwt])
        ↓
    sessionStorage.getItem('invite_token')
        ↓
    POST /api/partner/accept { token }
        ↓
    TransactWrite: partnerId у A и B
        ↓
    api.me() → обновление стора
```

---

## 11. Деплой

```bash
# Только фронтенд (~30 сек)
bash scripts/deploy-frontend.sh
# 1. cd frontend && npm run build
# 2. aws s3 sync frontend/dist/ s3://diary-frontend-prod-049710942442
# 3. aws cloudfront create-invalidation --paths "/*"

# Только бэкенд (~3-5 мин)
bash scripts/deploy-backend.sh
# sam build && sam deploy

# Оба
bash scripts/deploy.sh
```

**Окружения:**
- `prod` — https://ourdiary.love (единственное окружение)
- Локальная разработка: DynamoDB Local в Docker + Express-обёртка для Lambda + Vite proxy

---

## 12. Секреты (SSM Parameter Store, eu-central-1)

| Параметр | Тип | Назначение |
|----------|-----|-----------|
| `/diary/jwt-secret` | SecureString | Подпись JWT |
| `/diary/vapid-public-key` | String | VAPID public key (публичный — String достаточно) |
| `/diary/vapid-private-key` | SecureString | VAPID private key |
| `/diary/vapid-email` | String | VAPID contact email |
| `/diary/resend-api-key` | SecureString | Ключ Resend для отправки email |

---

## 13. Известные ограничения

1. **Ровно 2 пользователя** — архитектура не рассчитана на масштабирование до N пользователей
2. **Напоминания в UTC** — `cron/reminders.ts` использует UTC-время; если пользователи в другом часовом поясе, нужно хранить timezone в профиле
3. **Один партнёр навсегда** — механизма отключения партнёра нет (только ручное обнуление в БД)
4. **Push только с HTTPS** — обязательно для Web Push; localhost работает как исключение
5. **iOS Safari** — Push работает только если приложение добавлено на экран (PWA mode)
