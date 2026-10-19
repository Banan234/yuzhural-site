# Практический dry-run каталожных иллюстраций

| Показатель | Значение |
|---|---:|
| Всего товаров | 5708 |
| AUTO_APPROVED | 1877 |
| REUSE | 119 visualKey / 570 товаров / 119 PNG |
| MISSING, готово | 446 visualKey / 1307 товаров |
| NEEDS_REVIEW | 3831 |
| Уникальных visualKey | 3424 |
| NEEDS_REVIEW раньше | 5404 |
| Уменьшение | 1573 |

Автоматические семейства: H05V-K, H07V-K, NYM, NYY, АВББШВ, АВБШВ, АВВГ, АВВГ-П, АКВВГ, ВББШВ, ВБШВ, ВВГ, ВВГ-П, КВББШВ, КВБШВ, КВВГ, КВВГЭ, КВКБШВ, КГ, КГВВ, ПБП, ПВ1, ПВ3, ПВС, ППГ, ППГЭ, ПУВ, ПУГВ, СИП-4, ШВВП.

## Почему стало меньше блокировок

У известных семейств появились централизованные правила типовой конструкции и явные каталоговые defaults. Палитра и стандарт однопроволочной иллюстрации — визуальные соглашения, а не фактические характеристики конкретной партии. Неизвестные заполнитель, точные материалы и диаметр не блокируют рисунок. Явные противоречия, число жил, геометрия, отсутствие оболочки, броня/экран и специальные конструкции продолжают блокировать. Старые утверждённые картинки сопоставляются без требования новых некритических metadata.

## Добавленные familyVisualRules

- vvg: ВВГ; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- vvg-p: ВВГ-П; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- avvg: АВВГ; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- avvg-p: АВВГ-П; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- kvvg: КВВГ; control; 1–61 жил; {"conductorShape":"circular","outerJacket":"black"}
- kvvge: КВВГЭ; control; 1–61 жил; {"conductorShape":"circular","outerJacket":"black"}
- vbshv: ВБШВ; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- vbbshv: ВББШВ; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- avbshv: АВБШВ; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- avbbshv: АВББШВ; power; 1–5 жил; {"conductorShape":"circular","conductorConstruction":"solid","outerJacket":"black"}
- kg: КГ; power; 1–5 жил; {"conductorShape":"circular","outerJacket":"black"}
- pvs: ПВС; power; 1–5 жил; {"conductorShape":"circular","outerJacket":"white"}
- shvvp: ШВВП; power; 1–5 жил; {"conductorShape":"circular","outerJacket":"black"}
- pugv: ПУГВ; single-wire; 1–1 жил; {"conductorShape":"circular"}
- puv: ПУВ; single-wire; 1–1 жил; {"conductorShape":"circular"}
- pv1: ПВ1; single-wire; 1–1 жил; {"conductorShape":"circular"}
- pv3: ПВ3; single-wire; 1–1 жил; {"conductorShape":"circular"}
- h07v-k: H07V-K; single-wire; 1–1 жил; {"conductorShape":"circular"}
- sip-4: СИП-4; sip-black; 2–4 жил; {"conductorShape":"circular"}
- vvgng-a-ls: extends vvg
- kgvv: КГВВ; power; 1–5 жил; {"outerJacket":"black"}
- h05v-k: H05V-K; single-wire; 1–1 жил; {}
- kvbshv: КВБШВ; control; 2–61 жил; {"outerJacket":"black"}
- kvbbshv: КВББШВ; control; 2–61 жил; {"outerJacket":"black"}
- kvkbshv: КВКБШВ; control; 2–61 жил; {"outerJacket":"black"}
- nym: NYM; power; 1–61 жил; {"conductorConstruction":"solid","conductorShape":"circular","outerJacket":"grey"}
- nyy: NYY; power; 1–61 жил; {"conductorConstruction":"solid","conductorShape":"circular","outerJacket":"black"}
- akvvg: АКВВГ; control; 2–37 жил; {"conductorConstruction":"solid","conductorShape":"circular","outerJacket":"black"}
- ppg: ППГ; power; 1–5 жил; {"conductorConstruction":"solid","conductorShape":"circular","outerJacket":"black"}
- ppge: ППГЭ; power; 1–5 жил; {"conductorConstruction":"solid","conductorShape":"circular","outerJacket":"black"}
- pbp: ПБП; power; 1–5 жил; {"conductorConstruction":"solid","conductorShape":"circular","outerJacket":"black"}

## 20 примеров AUTO_APPROVED из разных семейств

| Пример товара | familyId | Жилы | Конструкция / геометрия | Статус | SKU в группе | visualKey |
|---|---|---:|---|---|---:|---|
| АВВГ 3х4+1х 2.5 | avvg | 4 | solid / round | REUSE | 28 | avvg__4c__solid__round__4core-brown-black-grey-yellow-green__p-b14bd71a5cde934d |
| КГ 3х2.5+1х1.5 | kg | 4 | stranded / round | REUSE | 19 | kg__4c__stranded__round__4core-brown-black-grey-yellow-green__p-c63dc84b713bf477 |
| ПУГВ 0.5 бел | pugv | 1 | stranded / round | MISSING | 18 | pugv__1c__stranded__round__1core-white__p-158003053538284a |
| ВВГ 4 х 1 нг(А)LS | vvgng-a-ls | 4 | solid / round | REUSE | 14 | vvgng-a-ls__4c__solid__round__4core-brown-black-grey-yellow-green__p-efab82e5a582c255 |
| ПВС 2х 0.75+1х0.75 | pvs | 3 | stranded / round | REUSE | 12 | pvs__3c__stranded__round__3core-brown-blue-yellow-green__p-f426943bb179b11b |
| ВбШВ 4х2.5 нг(А)LS | vbshvng-a-ls | 4 | solid / round | MISSING | 12 | vbshvng-a-ls__4c__solid__round__4core-brown-black-grey-yellow-green__p-b5afecbd49f1a632 |
| АВБбШв 3х240+1х120 | avbbshv | 4 | solid / round | MISSING | 11 | avbbshv__4c__solid__round__4core-brown-black-grey-yellow-green__p-50bc39b2d2e9114d |
| АВБШВ  3х 120+1х70 | avbshv | 4 | solid / round | MISSING | 10 | avbshv__4c__solid__round__4core-brown-black-grey-yellow-green__p-42b3b32fd3bdc1b9 |
| КГВВ  1х6 нг(А)LS | kgvvng-a-ls | 1 | stranded / round | MISSING | 10 | kgvvng-a-ls__1c__stranded__round__1core-brown__p-29aa123557a0ad22 |
| ПВ3 0.5 белый | pv3 | 1 | stranded / round | MISSING | 10 | pv3__1c__stranded__round__1core-white__p-ed37889a8603c39e |
| ППГ 5х4 нг(А)FRHF | ppgng-a-frhf | 5 | solid / round | MISSING | 9 | ppgng-a-frhf__5c__solid__round__5core-brown-black-grey-blue-yellow-green__p-0d6cc498354f796a |
| КВВГ  4х 0.75 э нг(А)LS | kvvgeng-a-ls | 4 | solid / round | MISSING | 8 | kvvgeng-a-ls__4c__solid__round__4core-black-brown-blue-yellow-green__p-948d5c297ffa969d |
| СИП-4 4х 16 | sip-4 | 4 | stranded / twisted-bundle | MISSING | 8 | sip-4__4c__stranded__twisted-bundle__4core-black-black-black-black__p-35a9ef805227b5ad |
| ВБбШВ 4х2.5 | vbbshv | 4 | solid / round | MISSING | 8 | vbbshv__4c__solid__round__4core-brown-black-grey-yellow-green__p-a84e82721473c44a |
| КВВГ  7х 0.75 нг(А)LS | kvvgng-a-ls | 7 | solid / round | MISSING | 7 | kvvgng-a-ls__7c__solid__round__7core-control-black__p-5ddfe9e44500c0ff |
| NYМ 3х1.5 | nym | 3 | solid / round | MISSING | 7 | nym__3c__solid__round__3core-brown-blue-yellow-green__p-c40f1f51d25e3cd8 |
| ПУВ  0.75 бел | puv | 1 | solid / round | MISSING | 7 | puv__1c__solid__round__1core-white__p-d1b0aa014c231694 |
| ПВ1  0.75 синий | pv1 | 1 | solid / round | MISSING | 7 | pv1__1c__solid__round__1core-blue__p-26bbc8fd614a894f |
| ВВГ  2х1.5 п нг(А)LS | vvg-png-a-ls | 2 | solid / flat | REUSE | 7 | vvg-png-a-ls__2c__solid__flat__2core-brown-blue__p-54d072ba8b53a84c |
| H07V-K 1х 2.5 голубой | h07v-k | 1 | stranded / round | MISSING | 6 | h07v-k__1c__stranded__round__1core-blue__p-e94ed24db79d0bfa |

## 20 оставшихся NEEDS_REVIEW

| SKU | Название | Причины |
|---|---|---|
| YU-0000017 | АВбШв  3х240-6 | Не разобраны модификаторы: 6 |
| YU-0000048 | АВБШВв 5х6 нг(А)LS | Не подтверждено семейство: АВБШВВ |
| YU-0000058 | АПБ 1,8 х 4,0/1,92 | Требуется отдельная конструкция: doubleInsulationThickness |
| YU-0000069 | NYY 3х16-J RM Class 2 | Не разобраны модификаторы: J, RM, Class, 2 |
| YU-0006778 | АВБбШ  3х150 нг(А) 6кВ | Не подтверждено семейство: АВББШ |
| YU-0000103 | АВБбШв 3х 35 - 6 | Не разобраны модификаторы: 6 |
| YU-0000125 | АВВГ  3х2.5 з | Не разобраны модификаторы: З |
| YU-0007146 | АППГ  4х240 нг(А)FRHF | Не определено: geometry |
| YU-0000227 | АсВВГ  1х 70 нг(А)LS | Не определено: geometry |
| YU-0000234 | АсКГ  4х 70 хл | Не подтверждено семейство: АСКГ |
| YU-0000235 | АсКГН  1х 35 | Не подтверждено семейство: АСКГН |
| YU-0000236 | АКВББШв 5х 6 | Не определено: geometry |
| YU-0000238 | АКВВГ  4х 2.5 э | Экран есть, но нет правила его видимого исполнения |
| YU-0007034 | АПвВГ нг(А)LS 4х120-1 | Не разобраны модификаторы: 1 |
| YU-0000372 | АПвзБбШп 4х150-1 | Не подтверждено семейство: АПВЗББШП |
| YU-0000373 | АПвКаПг 3х95/70-10 | Требуется отдельная конструкция: screenCrossSection |
| YU-0007173 | АПвКВ нг(А)хл 3х120/25-10 | Требуется отдельная конструкция: screenCrossSection |
| YU-0000375 | АПвП 3х120/50-10 нг(А)HF | Требуется отдельная конструкция: screenCrossSection |
| YU-0000244 | АПвПг  1х150/70-10 | Требуется отдельная конструкция: screenCrossSection |
| YU-0000254 | АПвПу 1х 70/16- 6 | Требуется отдельная конструкция: screenCrossSection |

## Без изменений

- Image API requests: 0.
- Generated: 0.
- Bindings changed: 0.
- 815 защищённых файлов: SHA-256 unchanged.
- Текущий стиль, prompt builder, масштаб, PNG и manifest сохранены.
- Статусы REUSE/MISSING — только предложения dry-run; ничего не назначено.
