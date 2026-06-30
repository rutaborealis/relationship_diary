---
description: Запустить один этап BUILD — лид разработки реализует фичу.
argument-hint: <slug фичи>
---

Вызови субагента `dev-lead` через Agent tool для фичи `$ARGUMENTS` (папка `docs/features/$ARGUMENTS/`). Он реализует фичу по `02-spec.md` в `frontend/src/` и/или `backend/src/`, напишет `03-build-notes.md`, сделает коммиты, обновит `pipeline.md`. После — верни резюме и предложи `/qa $ARGUMENTS`.
