# 📋 Доска команды relationship_diary

Единый обзор для PO. Источник истины по этапам каждой фичи — `docs/features/<slug>/pipeline.md`; эта доска агрегирует их для одного взгляда. Команда `/status` пересобирает её.

Этапы: `analyze → design → build → qa → security → deploy`.

---

## 💡 Идеи (ещё не заведены)
Сырые идеи. Завести в работу — `/intake <идея>` (создаст фичу и уберёт отсюда).

- _пусто_

---

## 🚧 В работе
| Фича (slug) | Этап | Статус | Следующий шаг | Ждёт PO |
|---|---|---|---|---|
| _пусто_ | | | | |

---

## ⛔ Заблокировано (нужно решение PO)
Фичи с метками `[BLOCKER]` / `[NEEDS-CEO-APPROVAL]` или проваленным QA.

- _пусто_

---

## ✅ Готово
| Фича (slug) | Завершена | Артефакты |
|---|---|---|
| password-reset | 2026-07-01 | одобрено PO и задеплоено в прод (backend + frontend), reset-эндпоинты дымово проверены; `docs/features/password-reset/` |
| content-encryption | 2026-06-30 | задеплоено в прод (KMS envelope), backfill выполнен; `docs/features/content-encryption/` |
