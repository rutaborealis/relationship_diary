---
description: Запустить один этап SECURITY — инженер по безопасности проводит security-review.
argument-hint: <slug фичи>
---

Вызови субагента `security-engineer` через Agent tool для фичи `$ARGUMENTS` (папка `docs/features/$ARGUMENTS/`). Он проведёт security-review реализованного кода против модели угроз проекта (IDOR/авторизация, приватность полей, JWT, инвайты, push/VAPID, валидация, утечки секретов), напишет `04b-security-review.md` с вердиктом и обновит `pipeline.md`. Если вердикт FAIL — предложи `/build $ARGUMENTS` (вернуть находки `[SEC]` лиду); если PASS — предложи `/deploy $ARGUMENTS`.
