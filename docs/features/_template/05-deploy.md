# Развёртывание

> Автор: devops · Вход: 03-build-notes.md, 04-test-report.md

## Что и куда развёрнуто
<Frontend (S3+CloudFront) / Backend (SAM-стек) / оба. Способ деплоя.>

## Артефакты деплоя
- <изменения infra/template.yaml / scripts/deploy*.sh / сборка frontend/dist>

## Секреты / SSM-параметры
| Параметр | Назначение | Где хранится |
|---|---|---|
| <...> | <...> | SSM Parameter Store |

## Наблюдаемость
<CloudWatch-логи Lambda, ошибки хендлеров, доставка push — что мониторить после релиза.>

## Откат
<Как откатить: предыдущий sam deploy / откат сборки фронта + инвалидация CloudFront.>

## Требует подтверждения PO
- `[NEEDS-CEO-APPROVAL]` <боевой деплой в прод (ourdiary.love) / изменение прод-данных DynamoDB / необратимое>
