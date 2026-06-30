---
description: Запустить один этап QA — тестировщик прогоняет e2e против acceptance criteria.
argument-hint: <slug фичи>
---

Вызови субагента `qa-engineer` через Agent tool для фичи `$ARGUMENTS` (папка `docs/features/$ARGUMENTS/`). Он прогонит e2e/смоук против acceptance criteria из `01-requirements.md`, напишет `04-test-report.md` с вердиктом, обновит `pipeline.md`. Если вердикт FAIL — предложи `/build $ARGUMENTS` (вернуть дефекты лиду); если PASS — предложи `/secure $ARGUMENTS` (security-review перед деплоем).
