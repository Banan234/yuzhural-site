import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import ReportActions from '../components/services/ReportActions';
import {
  calculateShipment,
  estimateTransportFit,
  positiveNumber,
} from '../lib/cableLogistics';
import { SITE_WAREHOUSE_ADDRESS_DISPLAY } from '../lib/siteConfig';
import { serviceUrl } from '../lib/cableServices';

const FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const emptyPackage = (id) => ({
  id,
  label: '',
  lengthM: '',
  widthM: '',
  heightM: '',
  massKg: '',
  count: '1',
});
function FloorPlan({ shipment, transport, fit }) {
  if (
    !fit ||
    fit.capacity === null ||
    fit.capacity === 0 ||
    !fit.fitsDimensions
  )
    return null;
  const item = shipment.places[0];
  const width = Number(String(transport.widthM).replace(',', '.'));
  const length = Number(String(transport.lengthM).replace(',', '.'));
  const placeWidth = fit.orientation === 'rotated' ? item.lengthM : item.widthM;
  const placeLength =
    fit.orientation === 'rotated' ? item.widthM : item.lengthM;
  const scale = Math.min(260 / width, 280 / length);
  const rectangles = Array.from(
    { length: Math.min(shipment.count, fit.capacity, 100) },
    (_, index) => ({
      x: 12 + (index % fit.columns) * placeWidth * scale,
      y: 12 + Math.floor(index / fit.columns) * placeLength * scale,
    })
  );
  return (
    <>
      <svg
        className="service-floor-plan"
        viewBox={`0 0 ${width * scale + 24} ${length * scale + 24}`}
        role="img"
        aria-label="Схема рядного размещения одинаковых грузовых мест, вид сверху"
      >
        <rect
          x="12"
          y="12"
          width={width * scale}
          height={length * scale}
          fill="#f4f7fb"
          stroke="#376893"
          strokeWidth="2"
        />
        {rectangles.map((point, index) => (
          <g key={index}>
            <rect
              {...point}
              width={placeWidth * scale - 2}
              height={placeLength * scale - 2}
              rx="2"
              fill="#bcd5ed"
              stroke="#3c78ac"
            />
            <text x={point.x + 4} y={point.y + 14} fontSize="10" fill="#184b76">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <p className="service-muted">
        Вид сверху, один ярус.{' '}
        {shipment.count > 100 && 'На схеме показано не более 100 мест.'} Схема
        не учитывает крепёж, проходы, колёсные арки и нагрузку на оси.
      </p>
    </>
  );
}
export default function CableShippingPage() {
  const [params] = useSearchParams();
  const [packages, setPackages] = useState([emptyPackage('first')]);
  const [transport, setTransport] = useState({
    lengthM: '',
    widthM: '',
    heightM: '',
    payloadKg: '',
  });
  const [checkTransport, setCheckTransport] = useState(false);
  const [destination, setDestination] = useState('');
  const [carrier, setCarrier] = useState('');
  const [comment, setComment] = useState('');
  const shipment = calculateShipment(packages);
  const fit = checkTransport ? estimateTransportFit(shipment, transport) : null;
  const estimate = positiveNumber(params.get('estimateKg'));
  function update(id, key, value) {
    setPackages(
      packages.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      )
    );
  }
  const report = `${shipment ? `Итого: ${shipment.count} мест; ${FORMAT.format(shipment.massKg)} кг брутто; ${FORMAT.format(shipment.volumeM3)} м³` : 'Параметры мест нужно уточнить.'}\nПодготовка доставки со склада: ${SITE_WAREHOUSE_ADDRESS_DISPLAY}\nПункт назначения: ${destination || 'уточнить'}\nТранспортная компания: ${carrier || 'выбор покупателя'}\n${packages.map((item, index) => `${index + 1}. ${item.label || 'Грузовое место'}: ${item.lengthM} × ${item.widthM} × ${item.heightM} м; ${item.massKg} кг брутто за место; ${item.count} шт.`).join('\n')}${estimate ? `\nПредыдущая справочная оценка массы кабеля: ${FORMAT.format(estimate)} кг; не подменяет взвешивание груза.` : ''}\n${checkTransport ? `Кузов: ${transport.lengthM} × ${transport.widthM} × ${transport.heightM} м; грузоподъёмность: ${transport.payloadKg} кг\n${fit ? `Проверка массы: ${fit.fitsMass ? 'в пределах' : 'превышение'}; габаритов каждого места: ${fit.fitsDimensions ? 'в пределах' : 'превышение'}; площади пола: ${fit.fitsFloorArea ? 'в пределах' : 'превышение'}${fit.capacity !== null ? `; рядная раскладка: ${fit.capacity} мест` : '; смешанные места требуют схемы погрузки'}` : 'Параметры кузова нужно уточнить.'}` : ''}\nДополнительно: ${comment || '—'}\nПросьба уточнить стоимость и условия перевозки по тарифам выбранной ТК. Перевозка за счёт покупателя.`;
  return (
    <ServiceLayout serviceKey="shipping">
      {estimate && (
        <aside className="service-note">
          Из калькулятора кабеля:{' '}
          <strong>до {FORMAT.format(estimate)} кг расчётной массы.</strong> Для
          перевозки укажите массу брутто и габариты каждого готового грузового
          места.
        </aside>
      )}
      <div
        className="service-two-columns"
        style={estimate ? { marginTop: 24 } : undefined}
      >
        <section className="service-panel">
          <h2>Грузовые места</h2>
          <p className="service-muted">
            Барабан, бухта на паллете или отдельная упаковка. Размеры вводятся в
            метрах, масса — с тарой, упаковкой и крепежом.
          </p>
          {packages.map((item, index) => (
            <div className="service-package" key={item.id}>
              <div className="service-package__heading">
                <h3>Место {index + 1}</h3>
                {packages.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Удалить место ${index + 1}`}
                    onClick={() =>
                      setPackages(
                        packages.filter((value) => value.id !== item.id)
                      )
                    }
                  >
                    Удалить
                  </button>
                )}
              </div>
              <div className="service-fields">
                <label className="service-fields__wide">
                  Описание места {index + 1}
                  <input
                    maxLength={80}
                    value={item.label}
                    onChange={(event) =>
                      update(item.id, 'label', event.target.value)
                    }
                    placeholder="Например, барабан №12"
                  />
                </label>
                {[
                  ['lengthM', 'Длина, м'],
                  ['widthM', 'Ширина, м'],
                  ['heightM', 'Высота, м'],
                  ['massKg', 'Масса одного места, кг'],
                  ['count', 'Количество одинаковых мест'],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={`${label}, место ${index + 1}`}
                      inputMode={key === 'count' ? 'numeric' : 'decimal'}
                      value={item[key]}
                      onChange={(event) =>
                        update(item.id, key, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="services-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={packages.length >= 20}
              onClick={() =>
                setPackages([...packages, emptyPackage(crypto.randomUUID())])
              }
            >
              + Добавить тип грузового места
            </button>
          </div>
          <div className="service-package">
            <h3>Куда доставить</h3>
            <div className="service-fields">
              <label>
                Город или терминал
                <input
                  maxLength={120}
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                />
              </label>
              <label>
                Транспортная компания
                <input
                  maxLength={80}
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                  placeholder="Если уже выбрали"
                />
              </label>
              <label className="service-fields__wide">
                Особенности погрузки
                <textarea
                  maxLength={500}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  placeholder="Нужна обрешётка, манипулятор, доставка до адреса…"
                />
              </label>
            </div>
          </div>
        </section>
        <section className="service-panel service-panel--result">
          <h2>Данные для перевозчика</h2>
          <div aria-live="polite">
            {shipment ? (
              <>
                <div className="service-result-block">
                  <div className="service-result-label">Общая масса брутто</div>
                  <div className="service-result-number">
                    {FORMAT.format(shipment.massKg)} <small>кг</small>
                  </div>
                </div>
                <div className="service-result-block">
                  <div className="service-result-label">
                    Общий габаритный объём
                  </div>
                  <div className="service-result-number">
                    {FORMAT.format(shipment.volumeM3)} <small>м³</small>
                  </div>
                </div>
                <p>
                  Количество мест: <strong>{shipment.count}</strong>.
                </p>
              </>
            ) : (
              <p>
                Заполните положительные размеры и массу всех мест. Количество —
                целое число от 1 до 10 000.
              </p>
            )}
          </div>
          <p className="service-muted">
            Стоимость определяет выбранная ТК по маршруту, упаковке и условиям
            доставки. Услуги перевозчика оплачивает покупатель.
          </p>
          <div className="service-chips">
            <Link to={serviceUrl('weight')}>Оценить массу кабеля →</Link>
          </div>
        </section>
      </div>
      <section className="service-panel" style={{ marginTop: 24 }}>
        <div className="service-package__heading">
          <h2>Проверка транспорта</h2>
          <button
            type="button"
            aria-expanded={checkTransport}
            onClick={() => setCheckTransport(!checkTransport)}
          >
            {checkTransport ? 'Свернуть' : 'Указать кузов'}
          </button>
        </div>
        {checkTransport && (
          <>
            <div className="service-fields">
              {[
                ['lengthM', 'Полезная длина кузова, м'],
                ['widthM', 'Полезная ширина кузова, м'],
                ['heightM', 'Полезная высота кузова, м'],
                ['payloadKg', 'Грузоподъёмность, кг'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    inputMode="decimal"
                    value={transport[key]}
                    onChange={(event) =>
                      setTransport({ ...transport, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            {fit ? (
              <>
                <ul className="service-checks">
                  <li data-ok={fit.fitsMass}>
                    {fit.fitsMass
                      ? '✓ Масса в пределах грузоподъёмности.'
                      : 'Превышена грузоподъёмность выбранного транспорта.'}
                  </li>
                  <li data-ok={fit.fitsDimensions}>
                    {fit.fitsDimensions
                      ? '✓ Каждое отдельное место проходит по габаритам кузова.'
                      : 'Габариты хотя бы одного места превышают размеры кузова.'}
                  </li>
                  <li data-ok={fit.fitsFloorArea}>
                    {fit.fitsFloorArea
                      ? '✓ Суммарная площадь основания в пределах площади пола.'
                      : 'Суммарная площадь оснований превышает площадь пола; в один ярус не разместить.'}
                  </li>
                  {fit.capacity !== null ? (
                    <li data-ok={fit.fitsGrid}>
                      {fit.fitsGrid
                        ? `✓ Все грузовые места входят в рядную схему: ${shipment.count}.`
                        : `Рядная схема вмещает ${fit.capacity} из ${shipment.count} мест. Нужен другой кузов или отдельная проверка раскладки.`}
                    </li>
                  ) : (
                    <li>
                      Разные размеры мест: общую раскладку нужно согласовать с
                      перевозчиком.
                    </li>
                  )}
                </ul>
                <FloorPlan
                  shipment={shipment}
                  transport={transport}
                  fit={fit}
                />
              </>
            ) : (
              <p className="service-muted">
                Заполните все параметры груза и полезные размеры кузова.
              </p>
            )}
            <aside className="service-note">
              Эта проверка оценивает массу, габариты и рядную раскладку
              одинаковых мест в один ярус. Перевозчик проверяет крепление,
              доступ для погрузки, нагрузки на пол и оси. Совпадение объёма и
              площади не гарантирует размещение смешанного груза.
            </aside>
          </>
        )}
      </section>
      <ReportActions
        title="Запрос расчёта доставки"
        text={report}
        disabled={!shipment}
        requestLabel="Запросить расчёт доставки"
      />
    </ServiceLayout>
  );
}
