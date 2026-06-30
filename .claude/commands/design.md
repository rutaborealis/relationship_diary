---
description: Запустить один этап DESIGN — архитектор пишет спецификацию.
argument-hint: <slug фичи>
---

Вызови субагента `architect` через Agent tool для фичи `$ARGUMENTS` (папка `docs/features/$ARGUMENTS/`). Он прочитает `01-requirements.md` и напишет `02-spec.md` (+ ADR при необходимости), обновит `pipeline.md`. После — верни резюме и предложи `/build $ARGUMENTS`.
