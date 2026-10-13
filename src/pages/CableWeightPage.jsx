import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import ReportActions from '../components/services/ReportActions';
import {
  CABLE_MASS_ENTRIES,
  CABLE_MASS_SOURCES,
  calculateCableMass,
  calculateMassWithDrums,
  getCableMassRows,
  getCableDiameterRange,
  normalizeCableConfiguration,
} from '../lib/cableMass';
import {
  CABLE_DRUMS,
  CABLE_DRUM_SOURCE,
  getCableDrum,
} from '../lib/cableDrums';
import { catalogSearchUrl, serviceUrl } from '../lib/cableServices';
import { useCableCalculationItems } from '../hooks/useCableCalculationItems';

const FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const MARKS = [...new Set(CABLE_MASS_ENTRIES.map((row) => row.mark))].sort(
  (a, b) => a.localeCompare(b, 'ru')
);
const range = (min, max) =>
  Math.abs(min - max) < 1e-9
    ? FORMAT.format(min)
    : `${FORMAT.format(min)}–${FORMAT.format(max)}`;
function configurations(mark) {
  return [
    ...new Map(
      CABLE_MASS_ENTRIES.filter((row) => row.mark === mark).map((row) => [
        normalizeCableConfiguration(row.configuration),
        row.configuration,
      ])
    ).values(),
  ].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}
function voltages(mark, configuration) {
  return [
    ...new Set(
      CABLE_MASS_ENTRIES.filter(
        (row) =>
          row.mark === mark &&
          normalizeCableConfiguration(row.configuration) ===
            normalizeCableConfiguration(configuration)
      ).map((row) => row.voltageKv)
    ),
  ].sort((a, b) => (a ?? -1) - (b ?? -1));
}
function sourceHref(row) {
  return (
    row.sourceUrl ||
    `${CABLE_MASS_SOURCES[row.sourceId].url}${row.sourcePage ? `#page=${row.sourcePage}` : ''}`
  );
}
function csvCell(value) {
  const text = String(value ?? '');
  return `"${(/^[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}

export default function CableWeightPage() {
  const [params] = useSearchParams();
  const requested = params.get('designation') || '';
  const initialMark =
    MARKS.find(
      (value) =>
        value.toUpperCase() === (params.get('mark') || '').toUpperCase()
    ) || (requested || params.has('mark') ? '' : 'ВВГнг(А)-LS');
  const [mark, setMark] = useState(initialMark);
  const [configuration, setConfiguration] = useState(
    () =>
      configurations(initialMark).find(
        (value) =>
          normalizeCableConfiguration(value) ===
          normalizeCableConfiguration(params.get('configuration'))
      ) ||
      configurations(initialMark)[0] ||
      ''
  );
  const [voltageKv, setVoltageKv] = useState(
    () => voltages(initialMark, configuration)[0] ?? null
  );
  const [length, setLength] = useState(params.get('length') || '100');
  const [sourceId, setSourceId] = useState('');
  const [includeDrums, setIncludeDrums] = useState(false);
  const [drumMaterial, setDrumMaterial] = useState('');
  const [drumNumber, setDrumNumber] = useState('');
  const [drumWeight, setDrumWeight] = useState('');
  const [drumCount, setDrumCount] = useState('1');
  const { items, setItems, storageError } = useCableCalculationItems();
  const [notice, setNotice] = useState('');
  const queryKey = params.toString();
  useEffect(() => {
    const nextParams = new URLSearchParams(queryKey);
    const nextMark =
      MARKS.find(
        (value) =>
          value.toUpperCase() === (nextParams.get('mark') || '').toUpperCase()
      ) ||
      (nextParams.has('designation') || nextParams.has('mark')
        ? ''
        : 'ВВГнг(А)-LS');
    const nextConfiguration =
      configurations(nextMark).find(
        (value) =>
          normalizeCableConfiguration(value) ===
          normalizeCableConfiguration(nextParams.get('configuration'))
      ) ||
      configurations(nextMark)[0] ||
      '';
    setMark(nextMark);
    setConfiguration(nextConfiguration);
    setVoltageKv(voltages(nextMark, nextConfiguration)[0] ?? null);
    setLength(nextParams.get('length') || '100');
    setSourceId('');
  }, [queryKey]);
  const allRows = useMemo(
    () => getCableMassRows({ mark, configuration, voltageKv }),
    [mark, configuration, voltageKv]
  );
  const sourceIds = [...new Set(allRows.map((row) => row.sourceId))];
  const rows = sourceId
    ? allRows.filter((row) => row.sourceId === sourceId)
    : allRows;
  const mass = calculateCableMass(rows, length);
  const diameter = getCableDiameterRange(rows);
  const drumOptions = CABLE_DRUMS.filter(
    (drum) => drum.material === drumMaterial
  ).sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }));
  const selectedDrum = getCableDrum(drumMaterial, drumNumber);
  const shipment = includeDrums
    ? calculateMassWithDrums(
        mass,
        drumMaterial === 'custom' ? drumWeight : selectedDrum?.massKg,
        drumCount
      )
    : mass;
  const valid = Boolean(shipment);
  const sources = [
    ...new Set(
      rows.map(
        (row) =>
          `${CABLE_MASS_SOURCES[row.sourceId].publisher}: ${sourceHref(row)}`
      )
    ),
  ];
  const current = valid
    ? {
        mark,
        configuration,
        voltageKv,
        length: Number(String(length).replace(',', '.')),
        minKg: shipment.minKg,
        maxKg: shipment.maxKg,
        cableMinKg: mass.minKg,
        cableMaxKg: mass.maxKg,
        diameter,
        drumsKg: shipment.drumsKg || 0,
        sources,
        drumDescription: includeDrums
          ? `${drumMaterial === 'custom' ? 'Фактическая масса тары' : `${drumMaterial === 'wood' ? 'Деревянный' : 'Металлический'} барабан №${drumNumber}`}, ${drumCount} шт.; ${shipment.drumsKg} кг${drumMaterial !== 'custom' ? `; ${CABLE_DRUM_SOURCE.url}` : ''}`
          : 'Без тары',
      }
    : null;
  const reportItems = items.length ? items : current ? [current] : [];
  const total = reportItems.reduce(
    (sum, item) => ({
      minKg: sum.minKg + item.minKg,
      maxKg: sum.maxKg + item.maxKg,
    }),
    { minKg: 0, maxKg: 0 }
  );
  const report =
    reportItems
      .map(
        (item, index) =>
          `${index + 1}. ${item.mark} ${item.configuration}; ${item.voltageKv === null ? 'напряжение в таблице не указано' : `${item.voltageKv} кВ`}; ${item.length} м\nКабель: ${range(item.cableMinKg, item.cableMaxKg)} кг; тара: ${item.drumsKg} кг; итого: ${range(item.minKg, item.maxKg)} кг\nДиаметр: ${item.diameter ? range(item.diameter.minMm, item.diameter.maxMm) + ' мм' : 'нет данных'}\n${item.drumDescription}\n${item.sources.join('\n')}`
      )
      .join('\n\n') +
    `\n\nОбщая расчётная масса: ${range(total.minKg, total.maxKg)} кг. Масса упаковки не включена. Значения из таблиц не подтверждают фактическую массу складской партии.`;
  const csv = [
    [
      'Марка',
      'Конструкция',
      'Напряжение, кВ',
      'Длина, м',
      'Масса минимум, кг',
      'Масса максимум, кг',
      'Тара, кг',
      'Диаметр минимум, мм',
      'Диаметр максимум, мм',
      'Источники',
    ],
    ...reportItems.map((item) => [
      item.mark,
      item.configuration,
      item.voltageKv,
      item.length,
      item.minKg,
      item.maxKg,
      item.drumsKg,
      item.diameter?.minMm,
      item.diameter?.maxMm,
      item.sources.join(' | '),
    ]),
  ]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n');
  function changeMark(value) {
    const next = configurations(value)[0] || '';
    setMark(value);
    setConfiguration(next);
    setVoltageKv(voltages(value, next)[0] ?? null);
    setSourceId('');
  }
  function changeConfiguration(value) {
    setConfiguration(value);
    setVoltageKv(voltages(mark, value)[0] ?? null);
    setSourceId('');
  }
  function add() {
    if (!current) return;
    if (items.length >= 30) {
      setNotice('В одном расчёте можно сохранить до 30 позиций.');
      return;
    }
    setItems((previous) => [
      ...previous,
      { ...current, id: crypto.randomUUID() },
    ]);
    setNotice('Позиция добавлена. Общая масса показана в списке ниже.');
  }
  return (
    <ServiceLayout serviceKey="weight">
      {requested && (
        <aside className="service-note">
          <strong>Из карточки товара: {requested}.</strong> Выберите точное
          исполнение в справочнике. Изготовитель, конструкция и напряжение
          должны совпадать с документацией изделия.
        </aside>
      )}
      <div
        className="service-two-columns"
        style={requested ? { marginTop: 24 } : undefined}
      >
        <section className="service-panel">
          <h2>Параметры кабеля</h2>
          <div className="service-fields">
            <label>
              Марка
              <select
                value={mark}
                onChange={(event) => changeMark(event.target.value)}
              >
                <option value="">Выберите марку</option>
                {MARKS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Конструкция кабеля
              <select
                value={configuration}
                disabled={!mark}
                onChange={(event) => changeConfiguration(event.target.value)}
              >
                {!mark && <option value="">Сначала выберите марку</option>}
                {configurations(mark).map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('.', ',')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Напряжение
              <select
                value={voltageKv ?? ''}
                disabled={!mark}
                onChange={(event) => {
                  setVoltageKv(
                    event.target.value === ''
                      ? null
                      : Number(event.target.value)
                  );
                  setSourceId('');
                }}
              >
                {voltages(mark, configuration).map((value) => (
                  <option key={value ?? 'null'} value={value ?? ''}>
                    {value === null
                      ? 'В таблице не указано'
                      : `${FORMAT.format(value)} кВ`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Длина, м
              <input
                type="text"
                inputMode="decimal"
                value={length}
                onChange={(event) => setLength(event.target.value)}
                aria-invalid={mark ? !mass : undefined}
              />
              <small>Больше нуля; можно использовать запятую.</small>
            </label>
            <label className="service-fields__wide">
              Данные изготовителя
              <select
                value={sourceId}
                disabled={!allRows.length}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">Все источники — показать диапазон</option>
                {sourceIds.map((id) => (
                  <option value={id} key={id}>
                    {CABLE_MASS_SOURCES[id].publisher}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!includeDrums ? (
            <div className="services-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setIncludeDrums(true)}
              >
                + Добавить барабан
              </button>
            </div>
          ) : (
            <div className="service-package">
              <div className="service-package__heading">
                <h3>Масса тары</h3>
                <button type="button" onClick={() => setIncludeDrums(false)}>
                  Убрать барабан
                </button>
              </div>
              <div className="service-fields">
                <label>
                  Материал барабана
                  <select
                    value={drumMaterial}
                    onChange={(event) => {
                      setDrumMaterial(event.target.value);
                      setDrumNumber('');
                    }}
                  >
                    <option value="">Выберите материал</option>
                    <option value="wood">Деревянный</option>
                    <option value="metal">Металлический</option>
                    <option value="custom">Другая тара — указать массу</option>
                  </select>
                </label>
                {drumMaterial === 'custom' ? (
                  <label>
                    Масса одного барабана, кг
                    <input
                      inputMode="decimal"
                      value={drumWeight}
                      onChange={(event) => setDrumWeight(event.target.value)}
                    />
                  </label>
                ) : (
                  <label>
                    Номер барабана
                    <select
                      disabled={!drumMaterial}
                      value={drumNumber}
                      onChange={(event) => setDrumNumber(event.target.value)}
                    >
                      <option value="">Выберите номер</option>
                      {drumOptions.map((drum) => (
                        <option value={drum.number} key={drum.number}>
                          №{drum.number} — {drum.massKg} кг
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Количество барабанов
                  <input
                    inputMode="numeric"
                    value={drumCount}
                    onChange={(event) => setDrumCount(event.target.value)}
                  />
                </label>
              </div>
              {drumMaterial !== 'custom' && (
                <p className="service-muted">
                  Справочная масса тары:{' '}
                  <a
                    href={CABLE_DRUM_SOURCE.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {CABLE_DRUM_SOURCE.publisher}
                  </a>
                  . Фактическая масса может отличаться.
                </p>
              )}
            </div>
          )}
        </section>
        <section
          className="service-panel service-panel--result"
          aria-label="Результаты расчёта"
        >
          <h2>Результат для позиции</h2>
          <div aria-live="polite" aria-atomic="true">
            <div className="service-result-block">
              <div className="service-result-label">Масса кабеля</div>
              {mass ? (
                <div className="service-result-number">
                  {range(mass.minKg, mass.maxKg)} <small>кг</small>
                </div>
              ) : (
                <p>Выберите марку и укажите положительную длину.</p>
              )}
            </div>
            {includeDrums && (
              <div className="service-result-block">
                <div className="service-result-label">Итого с барабанами</div>
                {shipment ? (
                  <div className="service-result-number">
                    {range(shipment.minKg, shipment.maxKg)} <small>кг</small>
                  </div>
                ) : (
                  <p>
                    Выберите тару, положительную массу и целое количество
                    барабанов.
                  </p>
                )}
              </div>
            )}
            <div className="service-result-block">
              <div className="service-result-label">Наружный диаметр</div>
              {diameter ? (
                <div className="service-result-number">
                  {range(diameter.minMm, diameter.maxMm)} <small>мм</small>
                </div>
              ) : (
                <p>Выберите точную конструкцию кабеля.</p>
              )}
            </div>
          </div>
          <p className="service-muted">
            Диапазон отражает различия таблиц. Это справочные значения, упаковка
            не включена.
          </p>
          <div className="services-actions">
            <button
              type="button"
              className="button-primary"
              disabled={!valid}
              onClick={add}
            >
              Добавить позицию в расчёт
            </button>
            {mark && (
              <Link className="button-secondary" to={catalogSearchUrl(mark)}>
                Найти в каталоге
              </Link>
            )}
          </div>
          <p className="service-status" role="status">
            {notice}
          </p>
          {diameter && (
            <div className="service-chips">
              <Link
                to={serviceUrl('drum', { diameterMm: diameter.maxMm, mark })}
              >
                Оценить длину на барабане →
              </Link>
            </div>
          )}
        </section>
      </div>
      {items.length > 0 && (
        <section className="service-panel" style={{ marginTop: 24 }}>
          <h2>Сохранённые позиции: {items.length}</h2>
          <p className="service-muted">
            Расчёт сохраняется в этой вкладке при переходах и обновлении
            страницы. Табличные значения зафиксированы на момент добавления
            позиции.
          </p>
          <div className="service-table-wrap">
            <table className="service-table">
              <thead>
                <tr>
                  <th>Кабель</th>
                  <th>Длина</th>
                  <th>С тарой</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.mark} {item.configuration}
                      <br />
                      <small>
                        {item.voltageKv === null
                          ? 'Напряжение в таблице не указано'
                          : `${item.voltageKv} кВ`}
                      </small>
                    </td>
                    <td>{FORMAT.format(item.length)} м</td>
                    <td>{range(item.minKg, item.maxKg)} кг</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Удалить ${item.mark} ${item.configuration}`}
                        onClick={() =>
                          setItems(
                            items.filter((value) => value.id !== item.id)
                          )
                        }
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="service-result-number">
            {range(total.minKg, total.maxKg)} <small>кг всего</small>
          </p>
          <p className="service-muted">
            Общая масса включает сохранённые позиции. Текущие параметры попадут
            в итог после нажатия «Добавить позицию в расчёт».
          </p>
          <div className="services-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setItems([]);
                setNotice('Сохранённый расчёт очищен.');
              }}
            >
              Очистить расчёт
            </button>
          </div>
        </section>
      )}
      {storageError && (
        <p className="service-status" role="status">
          Браузер не дал сохранить расчёт. Скачайте PDF или CSV перед переходом
          на другую страницу.
        </p>
      )}
      <ReportActions
        title="Расчёт веса и диаметра кабеля"
        text={report}
        requestText={`Общая расчётная масса: ${range(total.minKg, total.maxKg)} кг; сохранённых позиций: ${reportItems.length}. Упаковка не включена.\n${reportItems.map((item, index) => `${index + 1}. ${item.mark} ${item.configuration}; ${item.voltageKv ?? '—'} кВ; ${item.length} м; ${range(item.minKg, item.maxKg)} кг с тарой ${item.drumsKg} кг.`).join('\n')}\nПолные исходные таблицы и источники сохранены в отчёте PDF/CSV. Нужна проверка параметров и фактической массы партии.`}
        csv={csv}
        disabled={!reportItems.length}
      />
      {reportItems.length > 0 && (
        <div className="service-chips">
          <Link to={serviceUrl('shipping', { estimateKg: total.maxKg })}>
            Подготовить данные для доставки →
          </Link>
        </div>
      )}
      {allRows.length > 0 && (
        <section className="service-panel" style={{ marginTop: 24 }}>
          <h2>Значения из каталогов</h2>
          <div className="service-table-wrap">
            <table className="service-table">
              <thead>
                <tr>
                  <th>Изготовитель</th>
                  <th>Масса 1 км</th>
                  <th>Наружный диаметр</th>
                  <th>Документ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.sourceId}-${index}`}>
                    <td>{CABLE_MASS_SOURCES[row.sourceId].publisher}</td>
                    <td>{FORMAT.format(row.massKgPerKm)} кг/км</td>
                    <td>{FORMAT.format(row.diameterMm)} мм</td>
                    <td>
                      <a
                        href={sourceHref(row)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть источник
                        {row.sourcePage ? `, стр. ${row.sourcePage}` : ''}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <aside className="service-note">
        <strong>Как устроен расчёт.</strong> Масса = длина в метрах × масса 1 км
        / 1000. Масса тары прибавляется отдельно. Для марки и конструкции,
        которых нет в справочнике, требуется таблица изготовителя. Параметры
        похожей марки автоматически не подставляются.
      </aside>
    </ServiceLayout>
  );
}
