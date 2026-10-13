import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import ReportActions from '../components/services/ReportActions';
import {
  CABLE_KNOWLEDGE,
  decodeCableDesignation,
  getCableComparisons,
  normalizeKnowledgeMark,
} from '../../shared/cableKnowledge';
import { CABLE_MASS_ENTRIES, CABLE_MASS_SOURCES } from '../lib/cableMass';
import {
  catalogSearchUrl,
  requestServiceHelp,
  serviceUrl,
} from '../lib/cableServices';

const MARKS = [
  ...new Set([
    ...CABLE_KNOWLEDGE.map((item) => item.mark),
    ...CABLE_MASS_ENTRIES.map((row) => row.mark),
  ]),
].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
function sourceLinks(mark) {
  const rows = CABLE_MASS_ENTRIES.filter(
    (row) => normalizeKnowledgeMark(row.mark) === normalizeKnowledgeMark(mark)
  );
  const sources = new Map();
  for (const row of rows) {
    const source = CABLE_MASS_SOURCES[row.sourceId];
    const key = `${source.publisher}|${source.url}`;
    if (!sources.has(key))
      sources.set(key, {
        publisher: source.publisher,
        url: source.url,
        page: row.sourcePage,
        configurations: new Set(),
      });
    sources.get(key).configurations.add(row.configuration);
  }
  return [...sources.values()];
}
function Sources({ sources }) {
  return sources.length ? (
    <ul className="service-source-list">
      {sources.map((source) => (
        <li key={source.url}>
          <a
            href={`${source.url}${source.page ? `#page=${source.page}` : ''}`}
            target="_blank"
            rel="noreferrer"
          >
            {source.publisher} — таблица изготовителя ↗
          </a>
          <small>
            В справочнике: {source.configurations.size} конструкций. Наличие на
            нашем складе уточняйте отдельно.
          </small>
        </li>
      ))}
    </ul>
  ) : (
    <p className="service-muted">
      Для этой марки в справочнике пока нет таблицы изготовителя.
    </p>
  );
}

export default function CableKnowledgePage({ mode = 'marking' }) {
  const [params] = useSearchParams();
  const [input, setInput] = useState(
    params.get('designation') ||
      params.get('mark') ||
      (mode === 'marking'
        ? 'ВВГнг(А)-LS 3х2,5'
        : mode === 'analogs'
          ? 'ПВ3'
          : '')
  );
  const [group, setGroup] = useState('');
  const [limit, setLimit] = useState(24);
  const [cores, setCores] = useState('');
  const [section, setSection] = useState('');
  const [voltage, setVoltage] = useState('');
  const queryKey = params.toString();
  useEffect(() => {
    const query = new URLSearchParams(queryKey);
    const designation = query.get('designation') || query.get('mark');
    if (designation !== null) {
      setInput(designation.slice(0, 250));
      setLimit(24);
    }
  }, [queryKey]);
  const decoded = useMemo(() => decodeCableDesignation(input), [input]);
  const comparisons = getCableComparisons(input);
  const sources = sourceLinks(input.trim());
  const filtered = MARKS.filter(
    (mark) =>
      normalizeKnowledgeMark(mark).includes(normalizeKnowledgeMark(input)) &&
      (!group || decodeCableDesignation(mark).family?.group === group)
  );
  const detail = decoded.family;
  const report = `${input}\n${detail?.description || 'Марка не найдена в проверенном справочнике.'}\n${decoded.tokens.map((token) => `${token.code}: ${token.text}`).join('\n')}\n${decoded.size || ''}${decoded.voltageKv ? `\nУказанное напряжение: ${decoded.voltageKv} кВ` : ''}${decoded.unknown ? `\nНе распознано: ${decoded.unknown}` : ''}\n${detail ? `Источник: ${detail.source}` : ''}`;
  const analogReport = `Нужна проверка замены: ${input}\nЧисло жил: ${cores || 'уточнить'}; сечение: ${section || 'уточнить'} мм²; напряжение: ${voltage || 'уточнить'} кВ\n${comparisons.map((item) => `${item.reason}\nМарки для сравнения: ${item.marks.join(', ')}\nПроверить: ${item.check}`).join('\n\n')}\nИсполнение и условия эксплуатации требуют согласования перед заменой.`;
  return (
    <ServiceLayout serviceKey={mode}>
      <section className="service-panel">
        <label className="service-search-label">
          {mode === 'marking'
            ? 'Полное обозначение кабеля'
            : mode === 'reference'
              ? 'Найти марку в справочнике'
              : mode === 'manufacturers'
                ? 'Точная марка кабеля'
                : 'Исходная марка кабеля'}
          <input
            maxLength={250}
            value={input}
            list={mode !== 'reference' ? 'service-known-marks' : undefined}
            placeholder="Например, ВВГнг(А)-LS"
            onChange={(event) => {
              setInput(event.target.value);
              setLimit(24);
            }}
          />
        </label>
        <datalist id="service-known-marks">
          {MARKS.map((mark) => (
            <option value={mark} key={mark} />
          ))}
        </datalist>
        <div className="service-chips">
          {(mode === 'analogs'
            ? ['ПВ1', 'ПВ3', 'H07V-K', 'ВБбШв', 'КВВГ', 'МКЭШ']
            : ['ВВГнг(А)-LS', 'КВВГ', 'КГ', 'ПуГВ', 'ПВС', 'ТППэп']
          ).map((mark) => (
            <button
              type="button"
              key={mark}
              onClick={() => {
                setInput(
                  mode === 'marking' && mark === 'ТППэп'
                    ? 'ТППэп 10х2х0,5'
                    : mark
                );
                setLimit(24);
              }}
            >
              {mark}
            </button>
          ))}
        </div>
        {mode === 'reference' && (
          <div className="service-fields">
            <label>
              Назначение
              <select
                value={group}
                onChange={(event) => {
                  setGroup(event.target.value);
                  setLimit(24);
                }}
              >
                <option value="">Все направления</option>
                {[...new Set(CABLE_KNOWLEDGE.map((item) => item.group))].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  )
                )}
              </select>
            </label>
            <p className="service-muted">
              Найдено марок: {filtered.length}. Подробное описание есть для
              проверенных семейств; для остальных доступны исходные технические
              таблицы.
            </p>
          </div>
        )}
      </section>
      {mode === 'marking' && (
        <>
          <section
            className="service-panel"
            style={{ marginTop: 20 }}
            aria-live="polite"
          >
            <h2>
              {detail ? `Что означает ${decoded.mark}` : 'Уточните обозначение'}
            </h2>
            {detail ? (
              <>
                <p>{detail.description}</p>
                <dl className="service-decode-list">
                  {decoded.tokens.map((token, index) => (
                    <div key={`${token.code}-${index}`}>
                      <dt>{token.code}</dt>
                      <dd>{token.text}</dd>
                    </div>
                  ))}
                  {decoded.size && (
                    <div>
                      <dt>Размер</dt>
                      <dd>{decoded.size}</dd>
                    </div>
                  )}
                  {decoded.voltageKv !== null && (
                    <div>
                      <dt>Напряжение</dt>
                      <dd>{decoded.voltageKv} кВ</dd>
                    </div>
                  )}
                </dl>
                <p className="service-muted">
                  <a href={detail.source} target="_blank" rel="noreferrer">
                    Документация изготовителя ↗
                  </a>
                </p>
              </>
            ) : (
              <p>
                Проверенная расшифровка этой марки пока не добавлена. Передайте
                обозначение менеджеру — он уточнит конструкцию по документации.
              </p>
            )}
            {decoded.unknown && detail && (
              <aside className="service-note">
                Часть обозначения требует проверки:{' '}
                <strong>{decoded.unknown}</strong>. Показана расшифровка только
                распознанной части.
              </aside>
            )}
            {decoded.specification?.warnings.length > 0 && (
              <aside className="service-note service-note--error">
                Размер записан неоднозначно. Проверьте скобки, число жил и
                сечение; числовые параметры не определены.
              </aside>
            )}
            {detail && (
              <div className="services-actions">
                <Link
                  className="button-secondary"
                  to={catalogSearchUrl(decoded.mark)}
                >
                  Посмотреть в каталоге
                </Link>
                <Link
                  className="button-secondary"
                  to={serviceUrl('weight', { designation: input })}
                >
                  Рассчитать вес и диаметр
                </Link>
              </div>
            )}
          </section>
          <ReportActions
            title="Проверка маркировки кабеля"
            text={report}
            disabled={!input.trim()}
          />
          <aside className="service-note">
            Смысл букв зависит от марки и их положения. Индекс «нг» означает
            нераспространение горения при заданных испытаниях; огнестойкость
            обозначают отдельно. Температуры, область применения и пожарный
            класс сверяйте по документам точного исполнения.
          </aside>
        </>
      )}
      {mode === 'reference' && (
        <>
          <div className="service-reference-grid">
            {filtered.slice(0, limit).map((mark) => {
              const family = decodeCableDesignation(mark).family;
              const refs = sourceLinks(mark);
              return (
                <article className="service-panel" key={mark}>
                  <h2>{mark}</h2>
                  <p>
                    {family?.description ||
                      'Технические параметры этой марки доступны в опубликованных таблицах изготовителей.'}
                  </p>
                  <Sources sources={refs} />
                  {family && !refs.length && (
                    <p>
                      <a href={family.source} target="_blank" rel="noreferrer">
                        Каталог изготовителя ↗
                      </a>
                    </p>
                  )}
                  <div className="service-chips">
                    <Link to={catalogSearchUrl(mark)}>Товары</Link>
                    <Link to={serviceUrl('marking', { mark })}>
                      Расшифровка
                    </Link>
                    {refs.length > 0 && (
                      <Link to={serviceUrl('weight', { mark })}>
                        Вес и диаметр
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {filtered.length > limit && (
            <div className="services-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setLimit(limit + 24)}
              >
                Показать ещё 24 марки
              </button>
            </div>
          )}
          {!filtered.length && (
            <aside className="service-note">
              Такой марки в справочнике пока нет.{' '}
              <button
                type="button"
                className="button-secondary"
                onClick={() =>
                  requestServiceHelp('Найти документацию на кабель', input)
                }
              >
                Запросить документацию
              </button>
            </aside>
          )}
        </>
      )}
      {mode === 'manufacturers' && (
        <section className="service-panel" style={{ marginTop: 20 }}>
          <h2>
            {input.trim() ? `Документация для ${input}` : 'Выберите марку'}
          </h2>
          {input.trim() && (
            <>
              <Sources sources={sources} />
              {!sources.length && detail && (
                <p>
                  <a href={detail.source} target="_blank" rel="noreferrer">
                    Открыть каталог с описанием семейства {detail.mark}
                  </a>
                </p>
              )}
              <div className="services-actions">
                <Link className="button-secondary" to={catalogSearchUrl(input)}>
                  Проверить продукцию в каталоге
                </Link>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() =>
                    requestServiceHelp(
                      'Уточнить изготовителя кабеля',
                      `Марка: ${input}. Нужны изготовитель фактической партии, паспорт и технические характеристики.`
                    )
                  }
                >
                  Уточнить изготовителя партии
                </button>
              </div>
            </>
          )}
          <aside className="service-note">
            Здесь перечислены источники, которые содержат точную марку в нашем
            справочнике. Это не полный список заводов и не подтверждение
            изготовителя товара на складе. Изготовителя партии проверяем по
            паспорту.
          </aside>
        </section>
      )}
      {mode === 'analogs' && (
        <>
          <section className="service-panel" style={{ marginTop: 20 }}>
            <h2>Условия для проверки замены</h2>
            <div className="service-fields">
              <label>
                Количество жил
                <input
                  inputMode="numeric"
                  value={cores}
                  onChange={(event) => setCores(event.target.value)}
                  placeholder="Например, 3"
                />
              </label>
              <label>
                Сечение жилы, мм²
                <input
                  inputMode="decimal"
                  value={section}
                  onChange={(event) => setSection(event.target.value)}
                  placeholder="Например, 2,5"
                />
              </label>
              <label>
                Напряжение, кВ
                <input
                  inputMode="decimal"
                  value={voltage}
                  onChange={(event) => setVoltage(event.target.value)}
                  placeholder="Например, 0,66"
                />
              </label>
            </div>
          </section>
          {comparisons.length ? (
            comparisons.map((comparison, index) => (
              <section className="service-panel" key={index}>
                <h2>Марки для сравнения</h2>
                <p>{comparison.reason}</p>
                <div className="service-table-wrap">
                  <table className="service-table">
                    <thead>
                      <tr>
                        <th>Марка</th>
                        <th>Конструкция и назначение</th>
                        <th>Документ</th>
                        <th>Каталог</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.marks.map((mark) => {
                        const entry = CABLE_KNOWLEDGE.find(
                          (item) => item.mark === mark
                        );
                        return (
                          <tr key={mark}>
                            <td>
                              <strong>{mark}</strong>
                              {decoded.family?.mark === mark && (
                                <small> — исходная</small>
                              )}
                            </td>
                            <td>{entry.description}</td>
                            <td>
                              <a
                                href={entry.source}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Изготовитель ↗
                              </a>
                            </td>
                            <td>
                              <Link to={catalogSearchUrl(mark)}>
                                Найти позиции
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <aside className="service-note">
                  <strong>Что нужно согласовать:</strong> {comparison.check}
                  {decoded.fire &&
                    ` В исходном обозначении есть ${decoded.fire}. Точное пожарное исполнение у сравниваемых марок нужно проверить отдельно.`}
                </aside>
              </section>
            ))
          ) : (
            <aside className="service-note">
              Для этой марки проверенная группа сравнения пока не добавлена.
              Укажите параметры и отправьте запрос на подбор.
            </aside>
          )}
          <ReportActions
            title="Согласование замены кабеля"
            text={analogReport}
            disabled={!input.trim()}
            requestLabel="Запросить проверку замены"
          />
          <aside className="service-note">
            Список показывает родственные конструкции для проверки. Замена
            определяется требованиями проекта, ГОСТ/ТУ и условиями эксплуатации.
            Похожее название и одинаковое сечение сами по себе не подтверждают
            взаимозаменяемость.
          </aside>
        </>
      )}
    </ServiceLayout>
  );
}
