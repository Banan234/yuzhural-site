import { useState } from 'react';
import { Link } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import ReportActions from '../components/services/ReportActions';
import {
  AIR_TEMPERATURE_FACTORS,
  GROUND_TEMPERATURE_FACTORS,
  SOIL_FACTORS,
  SECTION_METHODS,
  SECTION_SOURCES,
  calculateCableSection,
} from '../../shared/cableSection';
const DEFAULT = {
  phases: '3',
  loadMode: 'power',
  load: '10',
  voltage: '400',
  cosPhi: '0.9',
  length: '30',
  material: 'copper',
  method: 'B2',
  temperature: '30',
  circuits: '1',
  soilResistivity: '2.5',
  maxDropPercent: '3',
  upstreamDropPercent: '0',
  breaker: '',
};
const fmt = (value) =>
  Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
export default function CableSectionPage() {
  const [input, setInput] = useState(DEFAULT);
  const result = calculateCableSection(input);
  const ground = input.method === 'D1';
  function change(key, value) {
    setInput((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'phases' ? { voltage: value === '1' ? '230' : '400' } : {}),
      ...(key === 'method'
        ? { temperature: value === 'D1' ? '20' : '30', circuits: '1' }
        : {}),
    }));
  }
  const valid = Object.keys(result.errors).length === 0;
  const text = valid
    ? `Предварительный расчёт сечения PVC 70°C\nСеть: ${input.phases === '1' ? 'однофазная' : 'симметричная трёхфазная'}; ${input.voltage} В; cos φ ${input.cosPhi}.\nНагрузка: ${input.load} ${input.loadMode === 'power' ? 'кВт активной электрической мощности' : 'А'}; расчётный ток ${fmt(result.current)} А.\nДлина от источника до нагрузки: ${input.length} м. Материал: ${input.material === 'copper' ? 'медь' : 'алюминий'}.\nПрокладка: ${SECTION_METHODS[input.method]}. Температура среды: ${input.temperature} °C; цепей: ${input.circuits}.${ground ? ` Грунт: ${input.soilResistivity} К·м/Вт.` : ''}\nКоэффициенты: температура ${result.temperatureFactor}, группа ${result.groupingFactor}, грунт ${result.soilFactor}.\nНоминал защиты: ${input.breaker || 'не задан'} А. Допуск падения: ${input.maxDropPercent}%; до линии: ${input.upstreamDropPercent}%.\n${result.selected ? `Минимальное сечение в модели: ${result.selected.section} мм². Допустимый ток с поправками ${fmt(result.selected.ampacity)} А. Падение на линии ${fmt(result.selected.dropVolts)} В (${fmt(result.selected.dropPercent)}%); суммарно ${fmt(result.selected.totalDropPercent)}%.` : 'В пределах 120 мм² подходящего сечения нет. Нужен отдельный расчёт.'}\n\nМетодика: таблицы Schneider Electric / IEC 60364-5-52. Не проверены КЗ, отключение защиты, PE/N, пусковые токи, гармоники, солнечный нагрев и реальные параметры изделия. R при 90°C с запасом для PVC 70°C; X=0.08 Ω/км. Требуется проверка проектировщиком.\nИсточники:\n${Object.values(SECTION_SOURCES).join('\n')}`
    : '';
  function number(key, label, attributes = {}) {
    return (
      <label key={key}>
        {label}
        <input
          type="number"
          step="any"
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
        многожильные кабели с изоляцией PVC (ПВХ) 70°C: медь 1,5–120 мм²,
        алюминий 16–120 мм². Итоговый выбор проверяет проектировщик по нормам
        проекта и документации изделия.
      </aside>
      <div className="section-calculator">
        <section className="service-panel">
          <h2>Нагрузка и линия</h2>
          <div className="service-fields">
            <label>
              Сеть
              <select
                value={input.phases}
                onChange={(e) => change('phases', e.target.value)}
              >
                <option value="1">Однофазная, 2 нагруженные жилы</option>
                <option value="3">Трёхфазная, 3 нагруженные жилы</option>
              </select>
            </label>
            <label>
              Нагрузка задана
              <select
                value={input.loadMode}
                onChange={(e) => change('loadMode', e.target.value)}
              >
                <option value="power">
                  Активной электрической мощностью, кВт
                </option>
                <option value="current">Током, А</option>
              </select>
            </label>
            {number(
              'load',
              input.loadMode === 'power'
                ? 'Активная электрическая мощность, кВт'
                : 'Ток нагрузки, А',
              { min: 0.01 }
            )}
            {number(
              'voltage',
              input.phases === '1' ? 'Фаза–нейтраль, В' : 'Между фазами, В'
            )}
            {number('cosPhi', 'Коэффициент мощности cos φ', {
              min: 0.1,
              max: 1,
              step: 0.01,
            })}
            {number('length', 'Длина до нагрузки в одну сторону, м', {
              min: 0.1,
              max: 10000,
            })}
            <label>
              Материал жилы
              <select
                value={input.material}
                onChange={(e) => change('material', e.target.value)}
              >
                <option value="copper">Медь</option>
                <option value="aluminium">Алюминий</option>
              </select>
            </label>
            <label>
              Способ прокладки
              <select
                value={input.method}
                onChange={(e) => change('method', e.target.value)}
              >
                {Object.entries(SECTION_METHODS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ground ? 'Температура грунта, °C' : 'Температура воздуха, °C'}
              <select
                value={input.temperature}
                onChange={(e) => change('temperature', e.target.value)}
              >
                {Object.keys(
                  ground ? GROUND_TEMPERATURE_FACTORS : AIR_TEMPERATURE_FACTORS
                ).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Цепей в группе
              <select
                value={input.circuits}
                onChange={(e) => change('circuits', e.target.value)}
              >
                {Array.from({ length: ground ? 1 : 9 }, (_, i) => (
                  <option key={i + 1}>{i + 1}</option>
                ))}
              </select>
            </label>
            {ground && (
              <label>
                Тепловое сопротивление грунта, К·м/Вт
                <select
                  value={input.soilResistivity}
                  onChange={(e) => change('soilResistivity', e.target.value)}
                >
                  {Object.keys(SOIL_FACTORS)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
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
            Мощность — потребляемая электрическая, без коэффициента спроса. Для
            двигателя по мощности на валу сначала учтите КПД. Для C группа
            располагается одним слоем на стене/неперфорированном лотке; для B2
            кабели соприкасаются в группе. Для D1 — отдельная труба до глубины
            0,8 м, однородный грунт.
          </p>
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
      <section className="service-panel">
        <h2>Методика и границы расчёта</h2>
        <p>
          Сеть переменного тока 50 Гц, симметричная нагрузка для трёх фаз.
          Проверяются допустимый длительный ток и падение напряжения. Изоляция
          ПВХ 70°C. Не рассчитаны токи КЗ, время отключения защиты, сечения
          PE/N, пуск двигателя, гармоники, солнечный нагрев, параллельные линии
          и частичное высыхание грунта.
        </p>
        <p>
          Ток: I = P / (U × cos φ) для одной фазы; I = P / (√3 × U × cos φ) для
          трёх. Допустимый ток: Iтабл × kтемп × kгруппы × kгрунта. Падение: ΔU =
          2 × I × (R × cos φ + X × sin φ) × L или √3 вместо 2 для трёх фаз, L в
          км. R = 23,7 / S для меди и 37,6 / S для алюминия, Ω/км; значения при
          90°C дают запас для ПВХ 70°C. X = 0,08 Ω/км.
        </p>
        <ul className="service-source-list">
          {Object.entries(SECTION_SOURCES).map(([key, url]) => (
            <li key={key}>
              <a href={url} target="_blank" rel="noreferrer">
                {key === 'ampacity'
                  ? 'Допустимый ток и поправочные коэффициенты — G12–G16, G20'
                  : key === 'twoLoaded'
                    ? 'Таблицы для двух нагруженных жил — G21 и G23'
                    : 'Формулы падения напряжения — G29'}{' '}
                ↗
              </a>
            </li>
          ))}
        </ul>
        <details>
          <summary>Проверка по всем сечениям</summary>
          {valid && (
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
          )}
        </details>
      </section>
    </ServiceLayout>
  );
}
