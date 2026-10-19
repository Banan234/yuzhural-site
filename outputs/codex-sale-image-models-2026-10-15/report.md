# Сравнение моделей codex.sale — 15.10.2026

Выполнены ровно четыре генерации с отдельным ключом codex.sale: один запрос на модель, без повторов. Победитель не выбран. Изображения сохранены в исходном виде, без нормализации и без привязки к товарам.

Запрошенный размер: 1536x1024. Качество: high. Фон: transparent. Для всех использован [один prompt](/Users/Shared/yuzhural-site/outputs/codex-sale-image-models-2026-10-15/prompt.txt), SHA-256: `35207c1e18aa86c1edcbc9d587ea7cd714bb9d77ce9cf8fe04c7fb273d979c43`.

| Model | HTTP | Фактическое разрешение | Размер файла, байт | Alpha | Прозрачность |
| --- | ---: | --- | ---: | --- | --- |
| gpt-image-2.5-sunburst | 200 | 1536×1024 | 1 104 970 | есть | есть |
| gpt-image-2.5-flare | 200 | 1536×1024 | 1 258 843 | есть | есть |
| gpt-image-2 | 200 | 1536×1024 | 1 163 202 | есть | есть |
| gpt-image-1.5 | 200 | 1536×1024 | 1 108 822 | есть | есть |

## gpt-image-2.5-sunburst

![gpt-image-2.5-sunburst](/Users/Shared/yuzhural-site/outputs/codex-sale-image-models-2026-10-15/test-sunburst.png)

## gpt-image-2.5-flare

![gpt-image-2.5-flare](/Users/Shared/yuzhural-site/outputs/codex-sale-image-models-2026-10-15/test-flare.png)

## gpt-image-2

![gpt-image-2](/Users/Shared/yuzhural-site/outputs/codex-sale-image-models-2026-10-15/test-image-2.png)

## gpt-image-1.5

![gpt-image-1.5](/Users/Shared/yuzhural-site/outputs/codex-sale-image-models-2026-10-15/test-image-1.5.png)

## Pipeline

- Настройки берутся из `.env`: `IMAGE_API_BASE_URL`, `IMAGE_API_KEY`, `IMAGE_MODEL`.
- Авторизация текущего Codex/ChatGPT не используется; ключ отсутствует в исходниках и отчётах.
- JSON POST `/images/generations`, одна картинка на визуальную группу; каталог не запускался.
- Фактический размер PNG может отличаться от запрошенного. Проверяются PNG/CRC, размеры > 0, непустой файл и alpha при transparent.
- Опциональный локальный canvas contain сохраняет пропорции; выключен, исходные тестовые PNG не изменены.
- Качество фона, отступы и заполненность записываются как предупреждения для просмотра.
- Тесты: 78 файлов / 1068 тестов — успешно.
- Контрольные суммы каталога, существующего товарного PNG, metadata и реестра привязок до/после совпали.

[Полный JSON-отчёт](/Users/Shared/yuzhural-site/outputs/codex-sale-image-models-2026-10-15/report.json).
