---
description: Запустить один этап ANALYZE — бизнес-аналитик пишет требования.
argument-hint: <slug фичи>
---

Вызови субагента `business-analyst` через Agent tool для фичи `$ARGUMENTS` (папка `docs/features/$ARGUMENTS/`). Он прочитает `00-brief.md` и напишет `01-requirements.md`, обновит `pipeline.md`. После — верни резюме и предложи `/design $ARGUMENTS` или полный `/ship $ARGUMENTS`.
