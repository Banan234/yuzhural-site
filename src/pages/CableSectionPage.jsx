import { SearchableSiteSelect as SiteSelect } from '../components/ui/SiteSelect';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import ReportActions from '../components/services/ReportActions';
import {
  DIRECT_BURIAL_GAPS,
  SOIL_FACTORS,
  SECTION_INSULATIONS,
  SECTION_LOAD_MODES,
  SECTION_METHODS,
  SECTION_SOURCES,
  calculateCableSection,
  getSectionCircuitOptions,
  getSectionTemperatureFactors,
  isGroundMethod,
} from '../../shared/cableSection';
const DEFAULT = {
  phases: '3',
  loadMode: 'power',
  load: '10',
  efficiencyPercent: '',
  voltage: '400',
  cosPhi: '0.9',
  length: '30',
  material: 'copper',
  insulation: 'pvc',
  method: 'B2',
  temperature: '30',
  circuits: '1',
  soilResistivity: '2.5',
  directBurialGap: '',
  maxDropPercent: '3',
  upstreamDropPercent: '0',
  breaker: '',
};
const fmt = (value) =>
  Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
export default function CableSectionPage() {
  const [input, setInput] = useState(DEFAULT);
  const result = calculateCableSection(input);
  const ground = isGroundMethod(input.method);
  const motor = input.loadMode === 'motor';
  const loadMode = SECTION_LOAD_MODES[input.loadMode];
  const groupedDirectBurial = input.method === 'D2' && Number(input.circuits) > 1;
  const temperatures = getSectionTemperatureFactors(
    input.method,
    input.insulation
  );
  function change(key, value) {
    setInput((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'phases' ? { voltage: value === '1' ? '230' : '400' } : {}),
      ...(key === 'method'
        ? { temperature: isGroundMethod(value) ? '20' : '30', circuits: '1' }
        : {}),
    }));
  }
  const valid = Object.keys(result.errors).length === 0;
  const text = valid
    ? `Предварительный расчёт сечения кабеля\nСеть: ${input.phases === '1' ? 'однофазная' : 'симметричная трёхфазная'}; ${input.voltage} В; cos φ ${input.cosPhi}.\nНагрузка: ${input.load} ${loadMode.unit}${motor ? ` при КПД ${input.efficiencyPercent}%` : ''}; расчётный ток ${fmt(result.current)} А.\nДлина от источника до нагрузки: ${input.length} м. Материал: ${input.material === 'copper' ? 'медь' : 'алюминий'}.\nИзоляция жил: ${SECTION_INSULATIONS[input.insulation]}. Прокладка: ${SECTION_METHODS[input.method]}. Температура среды: ${input.temperature} °C; цепей: ${input.circuits}.${ground ? ` Грунт: ${input.soilResistivity} К·м/Вт.` : ''}${groupedDirectBurial ? ` Зазор: ${DIRECT_BURIAL_GAPS[input.directBurialGap]}. Глубина: 0,7 м.` : ''}\nКоэффициенты: температура ${result.temperatureFactor}, группа ${result.groupingFactor}, грунт ${result.soilFactor}.\nНоминал защиты: ${input.breaker || 'не задан'} А. Допуск падения: ${input.maxDropPercent}%; до линии: ${input.upstreamDropPercent}%.\n${result.selected ? `Минимальное сечение в модели: ${result.selected.section} мм². Допустимый ток с поправками ${fmt(result.selected.ampacity)} А. Падение на линии ${fmt(result.selected.dropVolts)} В (${fmt(result.selected.dropPercent)}%); суммарно ${fmt(result.selected.totalDropPercent)}%.` : 'В пределах 120 мм² подходящего сечения нет. Нужен отдельный расчёт.'}\n\nДопустимый ток: ГОСТ Р 50571.5.52-2011, таблицы В.52.2–В.52.5, В.52.14–В.52.18. Ток нагрузки и падение напряжения: справочник Schneider Electric. Не проверены КЗ, отключение защиты, PE/N, пусковые токи, гармоники, солнечный нагрев и реальные параметры изделия. R при 90 °C; X=0.08 Ω/км. Требуется проверка проектировщиком.\nИсточники:\n${Object.values(SECTION_SOURCES).join('\n')}`
    : '';
  function number(key, label, attributes = {}) {
    return (
      <label key={key}>
        {label}
        <input
          type="text"
          inputMode="decimal"
          value={input[key]}
          onChange={(e) => change(key, e.target.value)}
          aria-invalid={result.errors[key] ? true : undefined}
          aria-describedby={
            result.errors[key] ? `section-${key}-error` : undefined
          }
          {...attributes}
        />
        {result.errors[key] && (
          <span id={`section-${key}-error`} className="field-error">
            {result.errors[key]}
          </span>
        )}
      </label>
    );
  }
  return (
    <ServiceLayout serviceKey="section">
      <aside className="service-notice">
        <strong>Предварительный подбор для заявки.</strong> Поддерживаются
        многожильные кабели с изоляцией ПВХ, СПЭ или ЭПР. Диапазон для меди
        1,5–120 мм², для алюминия 16–120 мм². Итоговый выбор проверяет
        проектировщик по нормам проекта и документации изделия.
      </aside>
      <div className="section-calculator">
        <section className="service-panel">
          <h2>Нагрузка и линия</h2>
          <div className="service-fields">
            <label>
              Сеть
              <SiteSelect
                value={input.phases}
                onChange={(e) => change('phases', e.target.value)}
              >
                <option value="1">Однофазная, 2 нагруженные жилы</option>
                <option value="3">Трёхфазная, 3 нагруженные жилы</option>
              </SiteSelect>
            </label>
            <label>
              Нагрузка задана
              <SiteSelect
                value={input.loadMode}
                onChange={(e) => change('loadMode', e.target.value)}
              >
                {Object.entries(SECTION_LOAD_MODES).map(([value, { option }]) => (
                  <option key={value} value={value}>{option}</option>
                ))}
              </SiteSelect>
            </label>
            {number('load', loadMode.label)}
            {number(
              'voltage',
              input.phases === '1' ? 'Фаза–нейтраль, В' : 'Между фазами, В'
            )}
            {number('cosPhi', 'Коэффициент мощности cos φ', {
              min: 0.1,
              max: 1,
              step: 0.01,
            })}
            {motor && number('efficiencyPercent', 'КПД двигателя, %', { placeholder: 'По паспорту двигателя' })}
            {number('length', 'Длина до нагрузки в одну сторону, м', {
              min: 0.1,
              max: 10000,
            })}
            <label>
              Материал жилы
              <SiteSelect
                value={input.material}
                onChange={(e) => change('material', e.target.value)}
              >
                <option value="copper">Медь</option>
                <option value="aluminium">Алюминий</option>
              </SiteSelect>
            </label>
            <label>
              Изоляция жил
              <SiteSelect
                value={input.insulation}
                onChange={(e) => change('insulation', e.target.value)}
              >
                {Object.entries(SECTION_INSULATIONS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SiteSelect>
            </label>
            <label>
              Способ прокладки
              <SiteSelect
                value={input.method}
                onChange={(e) => change('method', e.target.value)}
              >
                {Object.entries(SECTION_METHODS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SiteSelect>
            </label>
            <label>
              {ground ? 'Температура грунта, °C' : 'Температура воздуха, °C'}
              <SiteSelect
                value={input.temperature}
                onChange={(e) => change('temperature', e.target.value)}
                aria-invalid={result.errors.temperature ? true : undefined}
                aria-describedby={
                  result.errors.temperature ? 'section-temperature-error' : undefined
                }
              >
                {result.errors.temperature && (
                  <option value={input.temperature} disabled>
                    {input.temperature} · вне диапазона
                  </option>
                )}
                {Object.keys(temperatures).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </SiteSelect>
              {result.errors.temperature && (
                <span id="section-temperature-error" className="field-error">
                  {result.errors.temperature}
                </span>
              )}
            </label>
            <label>
              Цепей в группе
              <SiteSelect
                value={input.circuits}
                onChange={(e) => change('circuits', e.target.value)}
              >
                {getSectionCircuitOptions(input.method).map((count) => (
                  <option key={count}>{count}</option>
                ))}
              </SiteSelect>
            </label>
            {groupedDirectBurial && (
              <label>
                Зазор между кабелями
                <SiteSelect
                  value={input.directBurialGap}
                  onChange={(e) => change('directBurialGap', e.target.value)}
                  aria-invalid={result.errors.directBurialGap ? true : undefined}
                  aria-describedby={result.errors.directBurialGap ? 'section-gap-error' : undefined}
                >
                  {Object.entries(DIRECT_BURIAL_GAPS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SiteSelect>
                {result.errors.directBurialGap && (
                  <span id="section-gap-error" className="field-error">
                    {result.errors.directBurialGap}
                  </span>
                )}
              </label>
            )}
            {ground && (
              <label>
                Тепловое сопротивление грунта, К·м/Вт
                <SiteSelect
                  value={input.soilResistivity}
                  onChange={(e) => change('soilResistivity', e.target.value)}
                  aria-invalid={result.errors.soilResistivity ? true : undefined}
                  aria-describedby={result.errors.soilResistivity ? 'section-soil-error' : undefined}
                >
                  {Object.keys(SOIL_FACTORS)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </SiteSelect>
                {result.errors.soilResistivity && (
                  <span id="section-soil-error" className="field-error">
                    {result.errors.soilResistivity}
                  </span>
                )}
              </label>
            )}
            {number('maxDropPercent', 'Допустимое суммарное падение, %', {
              min: 0.1,
              max: 10,
            })}
            {number('upstreamDropPercent', 'Падение до начала этой линии, %', {
              min: 0,
              max: 10,
            })}
            {number('breaker', 'Номинал защиты, А (если выбран)', {
              min: 1,
              max: 1000,
            })}
          </div>
          <p className="service-muted">
            В группе учитываются однотипные, одинаково нагруженные кабели.
            Для способа C они лежат одним слоем.
          </p>
          {input.loadMode === 'apparent' && (
            <p className="service-muted">
              При вводе кВА коэффициент мощности учитывается при расчёте
              падения напряжения.
            </p>
          )}
          {ground && (
            <p className="service-muted">
              {groupedDirectBurial
                ? 'Групповая прокладка D2 рассчитана для глубины 0,7 м и однородного грунта с удельным тепловым сопротивлением 2,5 К·м/Вт.'
                : 'Для одной цепи в однородном грунте базовая глубина составляет 0,7 м. Поправки на сопротивление грунта применимы до 0,8 м.'}
              {input.method === 'D2' &&
                ' Проверьте по документации изготовителя, что кабель допускает прямую прокладку в грунте.'}
            </p>
          )}
          {input.insulation === 'xlpeEpr' && (
            <p className="service-muted">
              Для режима 90 °C проверьте допустимую температуру кабеля и
              подключаемого оборудования.
            </p>
          )}
        </section>
        <section className="service-panel" aria-live="polite">
          <h2>Результат</h2>
          {valid ? (
            <>
              <p>
                Ток нагрузки: <strong>{fmt(result.current)} А</strong>
              </p>
              {result.selected ? (
                <>
                  <div className="section-result">
                    <strong>{fmt(result.selected.section)} мм²</strong>
                    <span>Минимальное сечение в выбранной модели</span>
                  </div>
                  <dl className="section-result-details">
                    <div>
                      <dt>Допустимый ток с поправками</dt>
                      <dd>{fmt(result.selected.ampacity)} А</dd>
                    </div>
                    <div>
                      <dt>Падение на этой линии</dt>
                      <dd>
                        {fmt(result.selected.dropVolts)} В ·{' '}
                        {fmt(result.selected.dropPercent)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Суммарное падение</dt>
                      <dd>{fmt(result.selected.totalDropPercent)}%</dd>
                    </div>
                    <div>
                      <dt>Поправки: температура × группа × грунт</dt>
                      <dd>
                        {result.temperatureFactor} × {result.groupingFactor} ×{' '}
                        {result.soilFactor}
                      </dd>
                    </div>
                  </dl>
                  <p className="service-muted">
                    Выбор по току нагрузки
                    {input.breaker ? ' и номиналу заданной защиты' : ''} и
                    допустимому падению напряжения. Нужна отдельная проверка КЗ,
                    защиты и требований проекта.
                  </p>
                  <Link
                    className="button-secondary"
                    to={`/catalog/silovoy-kabel/?${new URLSearchParams({ material: input.material === 'copper' ? 'медь' : 'алюминий', section: String(result.selected.section) })}`}
                  >
                    Посмотреть сечение в каталоге →
                  </Link>
                </>
              ) : (
                <p className="service-notice">
                  В пределах таблицы до 120 мм² подходящего сечения нет.
                  Передайте параметры для отдельного расчёта.
                </p>
              )}
            </>
          ) : (
            <p role="status">
              Проверьте отмеченные поля, чтобы получить результат.
            </p>
          )}
          <ReportActions
            title="Предварительный расчёт сечения кабеля"
            text={text}
            disabled={!valid}
            requestLabel="Передать параметры для проверки"
          />
        </section>
      </div>
      <section className="service-panel section-methodology">
        <h2>Как подобрать сечение кабеля</h2>
        <p className="section-methodology__intro">
          Калькулятор выбирает наименьшее сечение, которое проходит проверку по
          току и суммарному падению напряжения. Модель рассчитана на
          многожильные кабели с изоляцией ПВХ, СПЭ или ЭПР в сетях 50 Гц.
        </p>
        <section className="section-methodology__steps">
          <h3>Что ввести в калькулятор</h3>
          <ol>
            <li>
              <strong>Нагрузка</strong>
              <p>Укажите ток, активную или полную мощность, число фаз, напряжение
                и cos φ. Для двигателя можно указать мощность на валу и КПД
                по паспорту.</p>
            </li>
            <li>
              <strong>Условия прокладки</strong>
              <p>Выберите материал жил, тип изоляции и способ прокладки. Задайте
                температуру среды, число цепей либо параметры грунта.</p>
            </li>
            <li>
              <strong>Длина и допуск</strong>
              <p>Введите длину участка до нагрузки и общий допуск проекта. Из него
                калькулятор вычитает падение на предыдущих участках.</p>
            </li>
          </ol>
        </section>
        <section className="section-methodology__calculation">
          <h3>Как калькулятор считает сечение</h3>
          <div className="section-methodology__grid">
            <div className="section-methodology__card">
              <h4>Ток нагрузки</h4>
              <dl className="section-methodology__formulas">
                <dt>Однофазная сеть</dt>
                <dd>
                  <math display="block">
                    <mi>I</mi><mo>=</mo>
                    <mfrac>
                      <mi>P</mi>
                      <mrow><mi>U</mi><mo>·</mo><mi>cos</mi><mi>φ</mi></mrow>
                    </mfrac>
                  </math>
                </dd>
                <dt>Симметричная трёхфазная сеть</dt>
                <dd>
                  <math display="block">
                    <mi>I</mi><mo>=</mo>
                    <mfrac>
                      <mi>P</mi>
                      <mrow><msqrt><mn>3</mn></msqrt><mo>·</mo><mi>U</mi><mo>·</mo><mi>cos</mi><mi>φ</mi></mrow>
                    </mfrac>
                  </math>
                </dd>
              </dl>
              <p>
                P — активная потребляемая мощность в ваттах. U — фазное напряжение
                в однофазной сети и линейное в трёхфазной, в вольтах. Если ток уже
                известен, калькулятор использует введённое значение в амперах.
              </p>
              <p>
                Мощность на валу делится на КПД, чтобы получить потребляемую
                мощность. Для полной мощности S в ВА ток равен S / U в
                однофазной сети и S / (√3 · U) в трёхфазной.
              </p>
            </div>
            <div className="section-methodology__card">
              <h4>Допустимый ток кабеля</h4>
              <div className="section-methodology__formula">
                <math display="block">
                  <msub><mi>I</mi><mtext>доп</mtext></msub><mo>=</mo>
                  <msub><mi>I</mi><mtext>табл</mtext></msub><mo>·</mo>
                  <msub><mi>k</mi><mtext>темп</mtext></msub><mo>·</mo>
                  <msub><mi>k</mi><mtext>гр</mtext></msub><mo>·</mo>
                  <msub><mi>k</mi><mtext>грунт</mtext></msub>
                </math>
              </div>
              <p>
                Базовый ток берётся из таблиц для материала жил, изоляции,
                способа прокладки и числа нагруженных жил. Поправки учитывают температуру, группировку
                кабелей и, при прокладке в земле, тепловое сопротивление грунта.
              </p>
              <p>
                Допустимый ток должен быть не ниже тока нагрузки и заданного
                номинала защиты.
              </p>
            </div>
            <div className="section-methodology__card">
              <h4>Падение напряжения</h4>
              <dl className="section-methodology__formulas">
                <dt>Однофазная сеть</dt>
                <dd>
                  <math display="block">
                    <mi>Δ</mi><mi>U</mi><mo>=</mo><mn>2</mn><mi>I</mi>
                    <mrow>
                      <mo>(</mo><mi>R</mi><mi>cos</mi><mi>φ</mi>
                      <mo>+</mo><mi>X</mi><mi>sin</mi><mi>φ</mi><mo>)</mo>
                    </mrow>
                    <mi>L</mi>
                  </math>
                </dd>
                <dt>Симметричная трёхфазная сеть</dt>
                <dd>
                  <math display="block">
                    <mi>Δ</mi><mi>U</mi><mo>=</mo><msqrt><mn>3</mn></msqrt><mi>I</mi>
                    <mrow>
                      <mo>(</mo><mi>R</mi><mi>cos</mi><mi>φ</mi>
                      <mo>+</mo><mi>X</mi><mi>sin</mi><mi>φ</mi><mo>)</mo>
                    </mrow>
                    <mi>L</mi>
                  </math>
                </dd>
              </dl>
              <p>
                L — длина линии в км. R = 23,7 / S для меди и 37,6 / S для
                алюминия, где S — сечение в мм². R и X выражены в Ом/км.
                Для R приняты значения при 90 °C с запасом для ПВХ 70 °C.
                X принято равным 0,08 Ом/км.
              </p>
              <p>К падению на линии (ΔU / U × 100%) прибавляется падение до её начала.</p>
            </div>
          </div>
        </section>
        <div className="section-methodology__example">
          <h3>Пример расчёта линии на 100 м</h3>
          <p>
            Три фазы, 400 В, 10 кВт, cos φ = 0,9. Медный кабель с изоляцией ПВХ в трубе
            на стене (B2), две цепи в группе, воздух 40 °C. Суммарный допуск
            3%, из него 1% уже приходится на участок до начала линии.
          </p>
          <p>
            Ток нагрузки составляет <strong>16,04 А</strong>.
            Коэффициенты температуры и группировки дают 0,87 × 0,80 = 0,696.
            Из общего допуска на саму линию остаётся 2%. Ниже три варианта
            из расчёта.
          </p>
          <dl className="section-methodology__comparison">
            <div>
              <dt>2,5 мм²</dt>
              <dd><strong>Недостаточно по току</strong><span>13,92 А после поправок</span></dd>
            </div>
            <div>
              <dt>6 мм²</dt>
              <dd><strong>Падение выше допуска</strong><span>23,66 А · 3,49% суммарно (2,49% на линии)</span></dd>
            </div>
            <div className="section-methodology__comparison-match">
              <dt>10 мм²</dt>
              <dd><strong>Минимальное подходящее</strong><span>32,02 А · 2,51% суммарно (1,51% на линии)</span></dd>
            </div>
          </dl>
        </div>
        <div className="section-methodology__notes">
          <section>
            <h3>Как читать результат</h3>
            <p>Таблица ниже показывает, какое условие ограничивает выбор.
              Если сечение проходит по току, но падение выше допуска, проверьте
              длину линии и потери до её начала.</p>
          </section>
          <section>
            <h3>Границы расчёта</h3>
            <p>Калькулятор не проверяет ток КЗ, время отключения защиты, сечения
              PE и N, пуск двигателя, гармоники, солнечный нагрев, параллельные
              линии и частичное высыхание грунта.</p>
          </section>
        </div>
        <p className="service-muted">
          Допустимые токи и коэффициенты приведены в приложении В, таблицы
          В.52.2–В.52.5 и В.52.14–В.52.18.{' '}
          <a href={SECTION_SOURCES.standard}>ГОСТ Р 50571.5.52-2011</a>
        </p>
        <details className="section-methodology__check">
          <summary>Проверка по всем сечениям</summary>
          {valid ? (
            <div className="service-table-wrap">
              <table className="service-table">
                <thead>
                  <tr>
                    <th>Сечение, мм²</th>
                    <th>Ток с поправками, А</th>
                    <th>Падение всего, %</th>
                    <th>Проверка</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.section}>
                      <td>{fmt(row.section)}</td>
                      <td>{fmt(row.ampacity)}</td>
                      <td>{fmt(row.totalDropPercent)}</td>
                      <td>
                        {row.fits
                          ? 'Проходит в модели'
                          : !row.currentFits && !row.dropFits
                            ? 'Ток и падение'
                            : !row.currentFits
                              ? 'Ток'
                              : 'Падение'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Проверьте параметры ввода, чтобы увидеть результаты по сечениям.</p>
          )}
        </details>
      </section>
    </ServiceLayout>
  );
}
