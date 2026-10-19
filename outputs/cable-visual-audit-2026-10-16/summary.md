# Классификация визуальных конструкций — полный dry-run

- Всего товаров: 5708
- Распознано полностью: 304
- Needs review (классификация): 5404
- Семейство распознано: 4111
- Уникальных familyId: 1664 (из них подтверждённых: 544)
- Уникальных visualProfile / visualKey: 3601 / 3601
- Профилей без незакрытых вопросов: 72
- Существующих утверждённых изображений: 119
- Статусы изображений по SKU: {"REUSE":0,"MISSING":304,"NEEDS_REVIEW":5404}
- Confidence: {"high":0,"medium":304,"low":5404}
- API requests: 0; images generated: 0; bindings changed: 0.
- Целостность 815 защищённых файлов: PASS.

## Как читать

Профили с неизвестными значениями — кандидаты для проверки. Их нельзя генерировать или назначать автоматически. Число familyId включает нераспознанные исходные марки, это не число подтверждённых конструкций.

REUSE означает подтверждённое соответствие профиля и имеющегося изображения. MISSING — полный профиль без подходящей картинки. NEEDS_REVIEW — неоднозначная конструкция либо недостаточное описание существующей картинки. Существующая иллюстрация не доказывает наличие PE/N или тип жилы у SKU.

Предыдущий визуальный стандарт, PNG, prompt builder и привязки сохранены. Новая классификация пока является отдельным аудитом; прежние планы генерации не являются утверждением этих групп.

## Причины ручной проверки (пересекаются)

- unknown_coreColors: 5401
- unknown_outerJacket: 5334
- unknown_filler: 5204
- unknown_conductorShape: 4793
- unknown_conductorConstruction: 4687
- unknown_hasOuterJacket: 4026
- unknown_geometry: 4017
- unknown_productType: 3696
- unknown_insulation: 3573
- unknown_armor: 3329
- unknown_conductorMaterial: 3192
- unknown_shield: 2837
- unknown_family: 1597
- special_configuration: 1558
- shield_detail_unknown: 1397
- unverified_modifier: 796
- armor_detail_unknown: 596
- unverified_family_suffix: 424
- missing_section: 316
- missing_cores: 303
- auxiliary_role_unknown: 113
- special_structure: 98
- family_conflict: 9
- parsing_warning: 3

## Файлы

- report.html — поиск, фильтры, таблица всех товаров, состав каждой группы и существующие изображения.
- products.csv — полная таблица.
- audit.json — полный отчёт, доказательства, причины, контрольные суммы.
- needs-review.json — все SKU с вопросами классификации или сопоставления.
- groups.json — все группы и входящие товары.
- existing-images.json — соответствие прежних изображений новым профилям-кандидатам.
