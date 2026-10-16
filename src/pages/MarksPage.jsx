import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import { useSEO } from '../hooks/useSEO';
import { usePrerenderData } from '../lib/prerenderData';
import { catalogSearchUrl } from '../lib/cableServices';
import '../styles/pages/marks.css';

export default function MarksPage() {
  const prerenderData = usePrerenderData();
  const [groups, setGroups] = useState(() =>
    Array.isArray(prerenderData.marks) ? prerenderData.marks : []
  );
  const [loading, setLoading] = useState(!Array.isArray(prerenderData.marks));
  const [error, setError] = useState(false);

  useSEO({
    title: 'Алфавитный перечень марок кабеля',
    description:
      'Все марки кабеля и провода из текущего каталога ЮжУралЭлектроКабель. Выберите букву и найдите нужную марку.',
    canonical: '/marks/',
  });

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarks() {
      try {
        const response = await fetch('/api/marks', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Не удалось загрузить марки');
        const data = await response.json();
        if (!data.ok || !Array.isArray(data.groups))
          throw new Error('Неверный ответ');
        setGroups(data.groups);
        setError(false);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMarks();
    return () => controller.abort();
  }, []);

  const total = groups.reduce((sum, group) => sum + group.marks.length, 0);
  const alphabetSections = [
    {
      label: 'Русские буквы',
      groups: groups.filter(({ letter }) => /^[А-ЯЁ]$/u.test(letter)),
    },
    {
      label: 'Латинские буквы',
      groups: groups.filter(({ letter }) => /^[A-Z]$/u.test(letter)),
    },
    {
      label: 'Цифры и другие обозначения',
      groups: groups.filter(({ letter }) => !/^[А-ЯЁA-Z]$/u.test(letter)),
    },
  ].filter((section) => section.groups.length > 0);

  return (
    <main className="marks-page">
      <Container>
        <nav className="marks-page__breadcrumbs" aria-label="Хлебные крошки">
          <Link to="/">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link to="/catalog/">Каталог</Link>
          <span aria-hidden="true">/</span>
          <span>Алфавитный перечень</span>
        </nav>
        <header className="marks-page__heading">
          <div className="marks-page__heading-line">
            <h1>Алфавитный перечень</h1>
            {total > 0 && <span>{total.toLocaleString('ru-RU')} марок</span>}
          </div>
          <p>
            Найдите марку кабеля или провода по первой букве и перейдите к
            подходящим позициям в каталоге.
          </p>
        </header>

        {groups.length > 0 && (
          <nav className="marks-page__alphabet" aria-label="Выбор буквы">
            <strong className="marks-page__alphabet-title">По алфавиту</strong>
            {alphabetSections.map((section) => (
              <div className="marks-page__alphabet-row" key={section.label}>
                <span>{section.label}</span>
                <div>
                  {section.groups.map((group) => (
                    <a
                      key={group.id}
                      href={`#${group.id}`}
                      aria-label={`${section.label}: ${group.letter}`}
                    >
                      {group.letter}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        )}

        {loading && groups.length === 0 && (
          <p role="status">Загружаем марки…</p>
        )}
        {error && (
          <p role="alert">
            Не удалось обновить перечень.{' '}
            {groups.length === 0
              ? 'Попробуйте открыть страницу позже.'
              : 'Показаны марки из последней сборки сайта.'}
          </p>
        )}

        <div className="marks-page__groups">
          {groups.map((group) => (
            <section className="marks-page__group" id={group.id} key={group.id}>
              <h2>{group.letter}</h2>
              <ul>
                {group.marks.map(({ mark, count }) => (
                  <li key={mark}>
                    <Link
                      to={catalogSearchUrl(mark)}
                      title={`Позиций в каталоге: ${count}`}
                    >
                      {mark}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </main>
  );
}
