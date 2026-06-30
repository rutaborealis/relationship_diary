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

- **password-reset** — конвейер пройден (QA PASS 14/14, SECURITY PASS-WITH-NOTES; SEC-01 HIGH найден и исправлен в круге 1). Деплой подготовлен до «зелёной кнопки» в ветке `feat/password-reset` (7 коммитов), боевой выкат не выполнялся. Ждёт `[NEEDS-CEO-APPROVAL]`: (1) мерж `feat/password-reset` → `main`; (2) `bash scripts/deploy-backend.sh`; (3) `bash scripts/deploy-frontend.sh`. Совместимо с активными сессиями (tokenVersion). Артефакты: `docs/features/password-reset/05-deploy.md`.

---

## ✅ Готово
| Фича (slug) | Завершена | Артефакты |
|---|---|---|
| content-encryption | 2026-06-30 | задеплоено в прод (KMS envelope), backfill выполнен; `docs/features/content-encryption/` |
