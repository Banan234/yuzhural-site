import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import ReportActions from '../components/services/ReportActions';
import {
  estimateWoundLength,
  lengthFromNetMass,
  positiveNumber,
} from '../lib/cableLogistics';
import { serviceUrl } from '../lib/cableServices';
import { CABLE_MASS_ENTRIES, CABLE_MASS_SOURCES } from '../lib/cableMass';

const FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const MARKS = [...new Set(CABLE_MASS_ENTRIES.map((row) => row.mark))].sort(
  (a, b) => a.localeCompare(b, 'ru')
);
function DrumDiagram() {
  return (
    <svg
      viewBox="0 0 480 180"
      role="img"
      aria-label="Схема измерений: наружный диаметр намотки, диаметр шейки и рабочая ширина между щеками"
      style={{ width: '100%', maxHeight: 200, marginTop: 20 }}
    >
      <circle
        cx="100"
        cy="88"
        r="64"
        fill="#e3edf8"
        stroke="#2f6599"
        strokeWidth="2"
      />
      <circle
        cx="100"
        cy="88"
        r="31"
        fill="white"
        stroke="#2f6599"
        strokeWidth="2"
      />
      <path
        d="M28 24V152M23 24H33M23 152H33M64 57H136M64 52V62M136 52V62"
        fill="none"
        stroke="#315b7e"
      />
      <text x="15" y="175" fontSize="12" fill="#315b7e">
        Диаметр намотки
      </text>
      <text x="69" y="90" fontSize="11" fill="#315b7e">
        Шейка
      </text>
      <path d="M265 20V145M420 20V145" stroke="#315b7e" strokeWidth="10" />
      <path d="M272 45H414V122H272Z" fill="#e3edf8" stroke="#315b7e" />
      <path d="M275 158H410M275 153V163M410 153V163" stroke="#315b7e" />
      <text x="275" y="178" fontSize="12" fill="#315b7e">
        Рабочая ширина намотки
      </text>
    </svg>
  );
}

export default function CableDrumPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState('geometry');
  const [geometry, setGeometry] = useState({
    cableDiameterMm: params.get('diameterMm') || '',
    coreDiameterMm: '',
    windingDiameterMm: '',
    widthMm: '',
  });
  const [gross, setGross] = useState('');
  const [tare, setTare] = useState('0');
  const [perKm, setPerKm] = useState('');
  const [mark, setMark] = useState(
    MARKS.includes(params.get('mark')) ? params.get('mark') : ''
  );
  const [rowIndex, setRowIndex] = useState('');
  const referenceRows = CABLE_MASS_ENTRIES.filter((row) => row.mark === mark);
  const selectedRow = rowIndex !== '' ? referenceRows[Number(rowIndex)] : null;
  const geo = estimateWoundLength(geometry);
  const grossValue = positiveNumber(gross);
  const tareValue = positiveNumber(tare, { zero: true });
  const net =
    grossValue !== null && tareValue !== null && grossValue > tareValue
      ? grossValue - tareValue
      : null;
  const massLength = net !== null ? lengthFromNetMass(net, perKm) : null;
  const result = mode === 'geometry' ? geo?.lengthM : massLength;
  const valid = result !== null && result !== undefined && result > 0;
  const report =
    mode === 'geometry'
      ? `Оценка по геометрии намотки\nКабель: ${params.get('mark') || 'уточнить'}\nНаружный диаметр кабеля: ${geometry.cableDiameterMm} мм\nДиаметр шейки: ${geometry.coreDiameterMm} мм\nФактический диаметр намотки: ${geometry.windingDiameterMm} мм\nРабочая ширина: ${geometry.widthMm} мм\nПолных слоёв: ${geo?.layers || 0}; витков в слое: ${geo?.turns || 0}\nОриентировочная длина: ${valid ? FORMAT.format(result) : 'нет результата'} м\nРядная плотная намотка круглого кабеля. Частичные слои, зазоры и допуски не учтены.`
      : `Оценка по массе\nМасса брутто: ${gross} кг; масса тары и упаковки: ${tare} кг\nМасса нетто: ${net === null ? 'не определена' : FORMAT.format(net)} кг\nМасса 1 км кабеля: ${perKm} кг/км\nОриентировочная длина: ${valid ? FORMAT.format(result) : 'нет результата'} м${selectedRow ? `\n${selectedRow.mark} ${selectedRow.configuration}; ${selectedRow.voltageKv ?? 'напряжение не указано'} кВ\nИсточник: ${selectedRow.sourceUrl || CABLE_MASS_SOURCES[selectedRow.sourceId].url}` : '\nУдельная масса введена пользователем.'}\nТочность зависит от фактической массы тары и удельной массы партии.`;
  function setField(key, value) {
    setGeometry({ ...geometry, [key]: value });
  }
  return (
    <ServiceLayout serviceKey="drum">
      <div className="service-mode-switch" aria-label="Способ оценки длины">
        <button
          type="button"
          aria-pressed={mode === 'geometry'}
          onClick={() => setMode('geometry')}
        >
          По размерам намотки
        </button>
        <button
          type="button"
          aria-pressed={mode === 'mass'}
          onClick={() => setMode('mass')}
        >
          По фактической массе
        </button>
      </div>
      <div className="service-two-columns">
        <section className="service-panel">
          <h2>
            {mode === 'geometry'
              ? 'Замеры барабана и кабеля'
              : 'Масса кабеля без тары'}
          </h2>
          {mode === 'geometry' ? (
            <>
              <div className="service-fields">
                <label>
                  Наружный диаметр кабеля, мм
                  <input
                    inputMode="decimal"
                    value={geometry.cableDiameterMm}
                    onChange={(event) =>
                      setField('cableDiameterMm', event.target.value)
                    }
                  />
                  <small>Для круглого кабеля, по паспорту или замеру.</small>
                </label>
                <label>
                  Диаметр шейки барабана, мм
                  <input
                    inputMode="decimal"
                    value={geometry.coreDiameterMm}
                    onChange={(event) =>
                      setField('coreDiameterMm', event.target.value)
                    }
                  />
                </label>
                <label>
                  Диаметр намотки, мм
                  <input
                    inputMode="decimal"
                    value={geometry.windingDiameterMm}
                    onChange={(event) =>
                      setField('windingDiameterMm', event.target.value)
                    }
                  />
                  <small>Диаметр по внешнему слою кабеля, без щёк.</small>
                </label>
                <label>
                  Рабочая ширина намотки, мм
                  <input
                    inputMode="decimal"
                    value={geometry.widthMm}
                    onChange={(event) =>
                      setField('widthMm', event.target.value)
                    }
                  />
                  <small>Занятая кабелем ширина между щеками.</small>
                </label>
              </div>
              <DrumDiagram />
              <div className="service-chips">
                <button
                  type="button"
                  onClick={() =>
                    setGeometry({
                      cableDiameterMm: '20',
                      coreDiameterMm: '500',
                      windingDiameterMm: '900',
                      widthMm: '500',
                    })
                  }
                >
                  Заполнить пример замеров
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="service-fields">
                <label>
                  Масса брутто, кг
                  <input
                    inputMode="decimal"
                    value={gross}
                    onChange={(event) => setGross(event.target.value)}
                  />
                  <small>Взвешенный кабель вместе с барабаном.</small>
                </label>
                <label>
                  Тара и упаковка, кг
                  <input
                    inputMode="decimal"
                    value={tare}
                    onChange={(event) => setTare(event.target.value)}
                  />
                  <small>Фактическая масса пустого барабана и упаковки.</small>
                </label>
                <label className="service-fields__wide">
                  Взять удельную массу из таблицы
                  <select
                    value={mark}
                    onChange={(event) => {
                      setMark(event.target.value);
                      setRowIndex('');
                      setPerKm('');
                    }}
                  >
                    <option value="">Ввести массу 1 км вручную</option>
                    {MARKS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                {mark && (
                  <label className="service-fields__wide">
                    Точная конструкция и изготовитель
                    <select
                      value={rowIndex}
                      onChange={(event) => {
                        setRowIndex(event.target.value);
                        setPerKm(
                          event.target.value === ''
                            ? ''
                            : String(
                                referenceRows[Number(event.target.value)]
                                  .massKgPerKm
                              )
                        );
                      }}
                    >
                      <option value="">Выберите строку таблицы</option>
                      {referenceRows.map((row, index) => (
                        <option key={index} value={index}>
                          {row.configuration} · {row.voltageKv ?? '—'} кВ ·{' '}
                          {CABLE_MASS_SOURCES[row.sourceId].publisher} ·{' '}
                          {row.massKgPerKm} кг/км
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Масса 1 км, кг/км
                  <input
                    inputMode="decimal"
                    value={perKm}
                    onChange={(event) => {
                      setPerKm(event.target.value);
                      setRowIndex('');
                    }}
                  />
                </label>
              </div>
              {selectedRow && (
                <p>
                  <a
                    href={
                      selectedRow.sourceUrl ||
                      CABLE_MASS_SOURCES[selectedRow.sourceId].url
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть источник удельной массы ↗
                  </a>
                </p>
              )}
            </>
          )}
        </section>
        <section
          className="service-panel service-panel--result"
          aria-live="polite"
        >
          <h2>Ориентировочная длина</h2>
          {valid ? (
            <>
              <div className="service-result-number">
                ≈ {FORMAT.format(result)} <small>м</small>
              </div>
              {mode === 'geometry' ? (
                <p>
                  {geo.layers} полных слоёв × {geo.turns} витков. Учитываем
                  средний диаметр каждого слоя.
                </p>
              ) : (
                <p>
                  Нетто {FORMAT.format(net)} кг ÷{' '}
                  {FORMAT.format(Number(String(perKm).replace(',', '.')))} кг/км
                  × 1000.
                </p>
              )}
            </>
          ) : (
            <p>
              {mode === 'geometry'
                ? 'Введите положительные размеры. Диаметр намотки должен быть больше диаметра шейки; нужны как минимум один полный слой и один виток.'
                : 'Введите положительную удельную массу. Масса брутто должна быть больше массы тары.'}
            </p>
          )}
          <p className="service-muted">
            Оценка не заменяет измерение длины при отгрузке. Для выбора барабана
            также проверяют минимальный радиус изгиба, грузоподъёмность и нормы
            намотки изготовителя.
          </p>
          <div className="service-chips">
            <Link to={serviceUrl('weight')}>Найти диаметр и массу 1 км →</Link>
          </div>
        </section>
      </div>
      <ReportActions
        title="Оценка длины кабеля на барабане"
        text={report}
        disabled={!valid}
      />
      <aside className="service-note">
        <strong>Формула геометрической оценки.</strong> Число слоёв = целая
        часть (диаметр намотки − диаметр шейки) / (2 × диаметр кабеля). Витков в
        слое = целая часть рабочей ширины / диаметра кабеля. Длина получается
        суммой окружностей по центру кабеля в каждом слое. Оценка применима к
        равномерной рядной намотке круглого кабеля; для рыхлой или неполной
        намотки используйте замер длины.
      </aside>
    </ServiceLayout>
  );
}
